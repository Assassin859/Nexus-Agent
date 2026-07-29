import { generateObject } from "ai";
import { githubModels, BRAIN_MODEL } from "../brain/provider.js";
import { GuardianDecisionSchema, GUARDIAN_SYSTEM_PROMPT } from "../brain/schemas.js";
import { db } from "../db/client.js";
import { repaymentCycles, executionsLog } from "../db/schema.js";
import { simulate } from "../lib/simulate.js";
import { createWorkflow, executeWorkflow } from "../lib/mcp-client.js";
import { getAavePosition } from "../lib/aave.js";
import {
  encodeAaveRepay,
  encodeAaveSupply,
  AAVE_V3_POOL,
  USDC_SEPOLIA,
  WETH_SEPOLIA,
} from "../lib/calldata.js";
import { eq, and } from "drizzle-orm";

const AGENTIC_WALLET = process.env.AGENTIC_WALLET_ADDRESS || "0x0000000000000000000000000000000000000000";

export async function run(userWallet: string): Promise<void> {
  console.log(`[GUARDIAN] Running evaluation for wallet: ${userWallet}`);

  // ── Phase 2: Real Aave V3 data read ──────────────────────────────────────────
  const position = await getAavePosition(userWallet);
  const { healthFactor, usdcWalletBalance, collateralUSD, debtUSD } = position;

  // If no Aave position exists, nothing to protect
  if (collateralUSD === 0 && debtUSD === 0) {
    console.log("[GUARDIAN] No Aave position found — skipping.");
    return;
  }

  // ── DB: read current cycle state ──────────────────────────────────────────────
  const cycle = await db.query.repaymentCycles.findFirst({
    where: eq(repaymentCycles.userWallet, userWallet),
  });

  const pendingTx = await db.query.executionsLog.findFirst({
    where: and(
      eq(executionsLog.userWallet, userWallet),
      eq(executionsLog.status, "pending")
    ),
  });

  const cycleRemaining = (cycle?.cycleLimitUSD ?? 0) - (cycle?.totalRepaidThisCycleUSD ?? 0);

  // ── AI Brain: real inputs, real decision ──────────────────────────────────────
  const { object: decision } = await generateObject({
    model: githubModels(BRAIN_MODEL),
    schema: GuardianDecisionSchema,
    system: GUARDIAN_SYSTEM_PROMPT,
    prompt: JSON.stringify({
      healthFactor,
      walletBalance: usdcWalletBalance,
      collateralValueUSD: collateralUSD,
      debtValueUSD: debtUSD,
      cycleRemainingBudget: cycleRemaining,
      executionHistory: pendingTx ? ["pending_transaction_exists"] : [],
      priceTrend: "stable",
    }),
  });

  console.log(`[GUARDIAN] Brain decision: ${decision.recommendation.action} — ${decision.userExplanation}`);

  // ── Log hold/block without executing ─────────────────────────────────────────
  if (
    decision.recommendation.action === "hold" ||
    decision.recommendation.action === "block_transaction"
  ) {
    await db.insert(executionsLog).values({
      userWallet,
      action: decision.recommendation.action,
      amount: 0,
      status: "success",
      reason: decision.userExplanation,
      aiAnalysis: decision.analysis,
    });
    return;
  }

  // ── Phase 3: Real calldata ────────────────────────────────────────────────────
  const amount = decision.recommendation.amount;
  let calldata: string;
  let targetContract: string;

  if (decision.recommendation.action === "repay") {
    calldata = encodeAaveRepay(USDC_SEPOLIA, amount, AGENTIC_WALLET);
    targetContract = AAVE_V3_POOL;
  } else {
    calldata = encodeAaveSupply(WETH_SEPOLIA, amount, AGENTIC_WALLET);
    targetContract = AAVE_V3_POOL;
  }

  // ── Pre-flight simulation ─────────────────────────────────────────────────────
  const sim = await simulate(
    { from: AGENTIC_WALLET, to: targetContract, data: calldata },
    userWallet
  );
  if (sim.wouldRevert) {
    console.warn(`[GUARDIAN] Simulation caught revert — aborting to save gas.`);
    return;
  }

  // ── KeeperHub execution ───────────────────────────────────────────────────────
  const { workflowId } = await createWorkflow({
    name: `guardian-${userWallet.slice(0, 8)}-${Date.now()}`,
    triggerType: "manual",
    steps: [{ type: "transaction", to: targetContract, calldata, gasStrategy: "standard" }],
  });
  const { executionId } = await executeWorkflow(workflowId);

  // ── Write to DB ───────────────────────────────────────────────────────────────
  await db.insert(executionsLog).values({
    userWallet,
    action: decision.recommendation.action,
    amount,
    status: "success",
    reason: decision.userExplanation,
    aiAnalysis: decision.analysis,
  });

  console.log(`[GUARDIAN] Executed ${decision.recommendation.action} $${amount} USDC. KeeperHub executionId: ${executionId}`);
}
