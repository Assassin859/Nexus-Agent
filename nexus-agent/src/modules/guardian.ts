import { generateObject } from "ai";
import { githubModels, BRAIN_MODEL } from "../brain/provider.js";
import { GuardianDecisionSchema, GUARDIAN_SYSTEM_PROMPT } from "../brain/schemas.js";
import { db } from "../db/client.js";
import { repaymentCycles, executionsLog } from "../db/schema.js";
import { simulate } from "../lib/simulate.js";
import { createWorkflow, executeWorkflow } from "../lib/mcp-client.js";
import { getAavePosition, getUsdcBalance } from "../lib/aave.js";
import {
  encodeAaveRepay,
  encodeAaveSupply,
  AAVE_V3_POOL,
  USDC_SEPOLIA,
} from "../lib/calldata.js";
import { eq, and, sql } from "drizzle-orm";

import { resolveKeeperHubApiKey } from "../lib/user-context.js";

const AGENTIC_WALLET = process.env.AGENTIC_WALLET_ADDRESS || "0x0000000000000000000000000000000000000000";

export async function run(userWallet: string, options?: { apiKey?: string }): Promise<void> {
  const effectiveKey = options?.apiKey || (await resolveKeeperHubApiKey(userWallet));
  console.log(`[GUARDIAN] Running evaluation for wallet: ${userWallet}`);

  // ── Step 1: Fetch Aave position ───────────────────────────────────────────
  const position = await getAavePosition(userWallet);

  // ── Step 2: Skip on RPC error — don't create phantom cycles ─────────────
  if (position.isError) {
    console.warn(`[GUARDIAN] RPC error for ${userWallet.slice(0, 8)} — skipping. Reason: ${position.errorReason}`);
    return;
  }

  // ── Step 3: Skip if no active Aave position (no debt, no collateral) ─────
  // healthFactor === null + isError === false means no active loan
  if (position.healthFactor === null && position.collateralUSD === 0) {
    console.log("[GUARDIAN] No active Aave position — skipping.");
    return;
  }

  // ── Step 4: Idempotent default cycle creation — ONLY for wallets with a loan
  let cycle = await db.query.repaymentCycles.findFirst({
    where: eq(repaymentCycles.userWallet, userWallet),
  });

  if (!cycle) {
    console.log(`[GUARDIAN] No repayment cycle found for ${userWallet.slice(0, 8)} — creating default 30-day $1000 cycle.`);
    const inserted = await db.insert(repaymentCycles).values({
      userWallet,
      cycleLimitUSD: 1000,
      cycleStart: new Date(),
      cycleEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      totalRepaidThisCycleUSD: 0,
    }).returning();
    cycle = inserted[0];
  }

  const pendingTx = await db.query.executionsLog.findFirst({
    where: and(
      eq(executionsLog.userWallet, userWallet),
      eq(executionsLog.status, "pending")
    ),
  });

  const cycleRemaining = (cycle?.cycleLimitUSD ?? 0) - (cycle?.totalRepaidThisCycleUSD ?? 0);

  // ── Step 5: Read AGENTIC_WALLET USDC balance for clamping ────────────────
  // Execution spends from AGENTIC_WALLET, not user wallet — clamp against it.
  const agenticBalance = await getUsdcBalance(AGENTIC_WALLET);

  // ── Step 6: AI Brain — pass agentic wallet balance as walletBalance ───────
  const { object: decision } = await generateObject({
    model: githubModels(BRAIN_MODEL),
    schema: GuardianDecisionSchema,
    system: GUARDIAN_SYSTEM_PROMPT,
    prompt: JSON.stringify({
      healthFactor: position.healthFactor,
      // walletBalance = agentic wallet USDC — this is what the agent can actually spend
      walletBalance: agenticBalance,
      collateralValueUSD: position.collateralUSD,
      debtValueUSD: position.debtUSD,
      cycleRemainingBudget: cycleRemaining,
      executionHistory: pendingTx ? ["pending_transaction_exists"] : [],
      priceTrend: "stable",
    }),
  });

  console.log(`[GUARDIAN] Brain decision: ${decision.recommendation.action} — ${decision.userExplanation}`);

  // ── Log hold/block without executing ─────────────────────────────────────
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

  // ── Step 7: Clamp amount ONCE before action branching ────────────────────
  // Guards: cycle budget, agentic wallet USDC balance
  const amount = decision.recommendation.amount;
  const clampedAmount = Math.max(0, Math.min(amount, cycleRemaining, agenticBalance));

  if (clampedAmount <= 0) {
    console.warn(`[GUARDIAN] Clamped amount is 0 — cycle budget exhausted or agentic wallet empty. Aborting.`);
    await db.insert(executionsLog).values({
      userWallet,
      action: decision.recommendation.action,
      amount: 0,
      status: "success",
      reason: `Budget clamped to 0: cycleRemaining=$${cycleRemaining} agenticBalance=$${agenticBalance.toFixed(2)}`,
      aiAnalysis: decision.analysis,
    });
    return;
  }

  // ── Step 8: Build calldata using clamped amount ───────────────────────────
  let calldata: string;
  let targetContract: string;

  if (decision.recommendation.action === "repay") {
    calldata = encodeAaveRepay(USDC_SEPOLIA, clampedAmount, AGENTIC_WALLET);
    targetContract = AAVE_V3_POOL;
  } else {
    // supply_collateral: supply USDC (6 decimals). WETH supply reserved for Phase 3 with oracle.
    calldata = encodeAaveSupply(USDC_SEPOLIA, clampedAmount, AGENTIC_WALLET, 6);
    targetContract = AAVE_V3_POOL;
  }

  // ── Step 9: Pre-flight simulation ────────────────────────────────────────
  const sim = await simulate(
    { from: AGENTIC_WALLET, to: targetContract, data: calldata },
    userWallet
  );
  if (sim.wouldRevert) {
    console.warn(`[GUARDIAN] Simulation caught revert — aborting to save gas.`);
    return;
  }

  // ── Step 10: KeeperHub execution ─────────────────────────────────────────
  const { workflowId, isStub: createStub } = await createWorkflow({
    name: `guardian-${userWallet.slice(0, 8)}-${Date.now()}`,
    triggerType: "manual",
    steps: [{ type: "transaction", to: targetContract, calldata, gasStrategy: "standard" }],
  }, effectiveKey);
  const { executionId, isStub: execStub } = await executeWorkflow(workflowId, effectiveKey);
  const isStub = createStub || execStub;

  // ── Step 11: Write execution log ─────────────────────────────────────────
  await db.insert(executionsLog).values({
    userWallet,
    action: decision.recommendation.action,
    amount: clampedAmount,
    status: isStub ? "simulated_stub" : "success",
    reason: decision.userExplanation,
    aiAnalysis: decision.analysis,
  });

  // ── Step 12: Increment repaid cycle total — ONLY on real repay success ───
  if (decision.recommendation.action === "repay" && !isStub && cycle) {
    await db.update(repaymentCycles)
      .set({
        totalRepaidThisCycleUSD: sql`${repaymentCycles.totalRepaidThisCycleUSD} + ${clampedAmount}`,
      })
      .where(eq(repaymentCycles.id, cycle.id));
    console.log(`[GUARDIAN] Cycle updated: +$${clampedAmount} repaid (total=${(cycle.totalRepaidThisCycleUSD ?? 0) + clampedAmount}/$${cycle.cycleLimitUSD})`);
  }

  console.log(`[GUARDIAN] Executed ${decision.recommendation.action} $${clampedAmount} USDC (requested=$${amount}, clamped). KeeperHub executionId: ${executionId} (isStub: ${isStub})`);
}
