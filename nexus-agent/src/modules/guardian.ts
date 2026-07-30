import { generateObject } from "ai";
import { githubModels, BRAIN_MODEL } from "../brain/provider.js";
import { GuardianDecisionSchema, GUARDIAN_SYSTEM_PROMPT } from "../brain/schemas.js";
import { db } from "../db/client.js";
import { repaymentCycles, executionsLog } from "../db/schema.js";
import { simulate } from "../lib/simulate.js";
import { createWorkflow, executeWorkflow, sendKeeperNotification } from "../lib/mcp-client.js";
import { getAavePosition, getUsdcBalance } from "../lib/aave.js";
import {
  encodeAaveRepay,
  encodeAaveSupply,
  AAVE_V3_POOL,
  USDC_SEPOLIA,
} from "../lib/calldata.js";
import { getAgenticWallet } from "../lib/agentic-wallet.js";
import { resolveKeeperHubApiKey } from "../lib/user-context.js";
import { childLogger } from "../lib/logger.js";
import { shouldAlert } from "../lib/alert-throttle.js";
import { eq, and, sql } from "drizzle-orm";

const ALLOWED_CHANNELS = ["telegram", "discord", "email"] as const;
type AlertChannel = typeof ALLOWED_CHANNELS[number];
const ALERT_CHANNEL: AlertChannel = ALLOWED_CHANNELS.includes(
  process.env.ALERT_CHANNEL as AlertChannel
)
  ? (process.env.ALERT_CHANNEL as AlertChannel)
  : "telegram";

export async function run(userWallet: string, options?: { apiKey?: string }): Promise<void> {
  const AGENTIC_WALLET = getAgenticWallet();
  if (!AGENTIC_WALLET) return; // dev-only early exit; prod throws at startup

  const log = childLogger({ module: "guardian", wallet: userWallet.slice(0, 8) });
  const effectiveKey = options?.apiKey || (await resolveKeeperHubApiKey(userWallet));

  log.info("Running evaluation");

  // ── Step 1: Fetch Aave position ───────────────────────────────────────────
  const position = await getAavePosition(userWallet);

  // ── Step 2: Skip on RPC error — don't create phantom cycles ─────────────
  if (position.isError) {
    log.warn({ reason: position.errorReason }, "RPC error — skipping");
    if (shouldAlert(`${userWallet.slice(0, 8)}:rpc_error`)) {
      await sendKeeperNotification(
        ALERT_CHANNEL,
        `🔴 Guardian RPC error for ${userWallet.slice(0, 8)}: ${position.errorReason}`,
        effectiveKey
      ).catch(() => {});
    }
    return;
  }

  // ── Step 3: Skip if no active Aave position ───────────────────────────────
  if (position.healthFactor === null && position.collateralUSD === 0) {
    log.info("No active Aave position — skipping.");
    return;
  }

  // ── Step 4: Idempotent default cycle creation ─────────────────────────────
  let cycle = await db.query.repaymentCycles.findFirst({
    where: eq(repaymentCycles.userWallet, userWallet),
  });

  if (!cycle) {
    log.info("No repayment cycle found — creating default 30-day $1000 cycle.");
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

  // ── Step 5: Read AGENTIC_WALLET USDC balance ──────────────────────────────
  const agenticBalance = await getUsdcBalance(AGENTIC_WALLET);

  // ── Step 6: AI Brain ──────────────────────────────────────────────────────
  const { object: decision } = await generateObject({
    model: githubModels(BRAIN_MODEL),
    schema: GuardianDecisionSchema,
    system: GUARDIAN_SYSTEM_PROMPT,
    prompt: JSON.stringify({
      healthFactor: position.healthFactor,
      walletBalance: agenticBalance,
      collateralValueUSD: position.collateralUSD,
      debtValueUSD: position.debtUSD,
      cycleRemainingBudget: cycleRemaining,
      executionHistory: pendingTx ? ["pending_transaction_exists"] : [],
      priceTrend: "stable",
    }),
  });

  log.info({ action: decision.recommendation.action }, decision.userExplanation);

  // ── Alert: liquidation risk before execution ──────────────────────────────
  if (
    decision.recommendation.action === "repay" &&
    (position.healthFactor ?? 99) < 1.15
  ) {
    if (shouldAlert(`${userWallet.slice(0, 8)}:liquidation_risk`)) {
      await sendKeeperNotification(
        ALERT_CHANNEL,
        `⚠️ Liquidation risk: HF=${position.healthFactor?.toFixed(2)} for ${userWallet.slice(0, 8)}`,
        effectiveKey
      ).catch(() => {});
    }
  }

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

  // ── Step 7: Clamp amount ──────────────────────────────────────────────────
  const amount = decision.recommendation.amount;
  const clampedAmount = Math.max(0, Math.min(amount, cycleRemaining, agenticBalance));

  if (clampedAmount <= 0) {
    log.warn({ cycleRemaining, agenticBalance }, "Clamped amount is 0 — aborting.");

    // Alert only when the agentic wallet itself is empty (not just cycle-exhausted)
    if (agenticBalance === 0 && shouldAlert(`${userWallet.slice(0, 8)}:wallet_empty`)) {
      await sendKeeperNotification(
        ALERT_CHANNEL,
        `🪙 Agentic wallet empty — cannot execute ${decision.recommendation.action} for ${userWallet.slice(0, 8)}`,
        effectiveKey
      ).catch(() => {});
    }

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

  // ── Step 8: Build calldata ────────────────────────────────────────────────
  let calldata: string;
  let targetContract: string;

  if (decision.recommendation.action === "repay") {
    calldata = encodeAaveRepay(USDC_SEPOLIA, clampedAmount, userWallet);
    targetContract = AAVE_V3_POOL;
  } else {
    calldata = encodeAaveSupply(USDC_SEPOLIA, clampedAmount, userWallet, 6);
    targetContract = AAVE_V3_POOL;
  }

  // ── Step 9: Pre-flight simulation ─────────────────────────────────────────
  const sim = await simulate(
    { from: AGENTIC_WALLET, to: targetContract, data: calldata },
    userWallet
  );
  if (sim.wouldRevert) {
    log.warn("Simulation caught revert — aborting to save gas.");
    return;
  }

  // ── Step 10: KeeperHub execution ──────────────────────────────────────────
  const { workflowId, isStub: createStub } = await createWorkflow({
    name: `guardian-${userWallet.slice(0, 8)}-${Date.now()}`,
    triggerType: "manual",
    steps: [{ type: "transaction", to: targetContract, calldata, gasStrategy: "standard" }],
  }, effectiveKey);
  const { executionId, isStub: execStub } = await executeWorkflow(workflowId, effectiveKey);
  const isStub = createStub || execStub;

  // ── Step 11: Write execution log ──────────────────────────────────────────
  await db.insert(executionsLog).values({
    userWallet,
    action: decision.recommendation.action,
    amount: clampedAmount,
    status: isStub ? "simulated_stub" : "success",
    reason: decision.userExplanation,
    aiAnalysis: decision.analysis,
  });

  // ── Step 12: Increment repaid cycle total — ONLY on real repay ───────────
  if (decision.recommendation.action === "repay" && !isStub && cycle) {
    await db.update(repaymentCycles)
      .set({
        totalRepaidThisCycleUSD: sql`${repaymentCycles.totalRepaidThisCycleUSD} + ${clampedAmount}`,
      })
      .where(eq(repaymentCycles.id, cycle.id));
    log.info({ clampedAmount, total: (cycle.totalRepaidThisCycleUSD ?? 0) + clampedAmount, limit: cycle.cycleLimitUSD }, "Cycle updated");
  }

  log.info({ executionId, isStub, action: decision.recommendation.action, clampedAmount, requested: amount }, "Execution complete");
}
