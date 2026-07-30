import { generateObject } from "ai";
import { githubModels, BRAIN_MODEL } from "../brain/provider.js";
import { GuardianDecisionSchema, GUARDIAN_SYSTEM_PROMPT } from "../brain/schemas.js";
import { db } from "../db/client.js";
import { repaymentCycles, executionsLog } from "../db/schema.js";
import { simulate } from "../lib/simulate.js";
import { createWorkflow, executeWorkflow, sendKeeperNotification, pollExecutionUntilSettled, type WorkflowStep } from "../lib/mcp-client.js";
import { ensureAllowance } from "../lib/allowance.js";
import { getAavePosition, getUsdcBalance } from "../lib/aave.js";
import {
  encodeAaveRepay,
  encodeAaveSupply,
  AAVE_V3_POOL,
  USDC_SEPOLIA,
} from "../lib/calldata.js";
import { getAgenticWallet, getWalletContext } from "../lib/agentic-wallet.js";
import { resolveKeeperHubApiKey } from "../lib/user-context.js";
import { childLogger } from "../lib/logger.js";
import { shouldAlert } from "../lib/alert-throttle.js";
import { eq, and, sql, lt } from "drizzle-orm";

const ALLOWED_CHANNELS = ["telegram", "discord", "email"] as const;
type AlertChannel = typeof ALLOWED_CHANNELS[number];
const ALERT_CHANNEL: AlertChannel = ALLOWED_CHANNELS.includes(
  process.env.ALERT_CHANNEL as AlertChannel
)
  ? (process.env.ALERT_CHANNEL as AlertChannel)
  : "telegram";

export async function run(userWallet: string, options?: { apiKey?: string }): Promise<void> {
  const context = getWalletContext(userWallet);
  if (!context || !context.signerWallet) return;

  const monitoredWallet = context.monitoredWallet;
  const signerWallet = context.signerWallet;
  const log = childLogger({ module: "guardian", wallet: monitoredWallet.slice(0, 8) });
  const effectiveKey = options?.apiKey || (await resolveKeeperHubApiKey(monitoredWallet));

  log.info("Running evaluation");

  // ── Step 1: Fetch Aave position ───────────────────────────────────────────
  const position = await getAavePosition(monitoredWallet);

  // ── Step 2: Skip on RPC error — don't create phantom cycles ─────────────
  if (position.isError) {
    log.warn({ reason: position.errorReason }, "RPC error — skipping");
    if (shouldAlert(`${monitoredWallet.slice(0, 8)}:rpc_error`)) {
      await sendKeeperNotification(
        ALERT_CHANNEL,
        `🔴 Guardian RPC error for ${monitoredWallet.slice(0, 8)}: ${position.errorReason}`,
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

  // ── Step 4.1: Idempotent default cycle & rollover check ─────────────────
  let cycle = await db.query.repaymentCycles.findFirst({
    where: eq(repaymentCycles.userWallet, monitoredWallet),
  });

  const now = new Date();

  if (!cycle) {
    log.info("No repayment cycle found — creating default 30-day $1000 cycle.");
    const inserted = await db.insert(repaymentCycles).values({
      userWallet: monitoredWallet,
      cycleLimitUSD: 1000,
      cycleStart: now,
      cycleEnd: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
      totalRepaidThisCycleUSD: 0,
    }).returning();
    cycle = inserted[0];
  } else if (now > new Date(cycle.cycleEnd)) {
    // 30-day budget cycle rollover
    log.info({ cycleEnd: cycle.cycleEnd }, "Repayment cycle expired — performing rollover reset.");
    const newStart = now;
    const newEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    await db.update(repaymentCycles)
      .set({
        cycleStart: newStart,
        cycleEnd: newEnd,
        totalRepaidThisCycleUSD: 0,
      })
      .where(eq(repaymentCycles.id, cycle.id));

    await db.insert(executionsLog).values({
      userWallet: monitoredWallet,
      action: "cycle_rollover",
      amount: 0,
      status: "success",
      reason: "30-day repayment budget cycle reset",
    });

    cycle = {
      ...cycle,
      cycleStart: newStart,
      cycleEnd: newEnd,
      totalRepaidThisCycleUSD: 0,
    };
  }

  // ── Step 4.2: Expire stale pending locks (TTL 15 min) ────────────────────
  const cutoff15m = new Date(Date.now() - 15 * 60 * 1000);
  const expiredPendingRows = await db.query.executionsLog.findMany({
    where: and(
      eq(executionsLog.userWallet, monitoredWallet),
      eq(executionsLog.status, "pending"),
      lt(executionsLog.timestamp, cutoff15m)
    ),
  });

  if (expiredPendingRows.length > 0) {
    log.info({ expiredCount: expiredPendingRows.length }, "Expiring stale pending locks older than 15 minutes.");
    for (const stale of expiredPendingRows) {
      await db.update(executionsLog)
        .set({ status: "reverted_chain", reason: "Pending lock expired (TTL 15m)" })
        .where(eq(executionsLog.id, stale.id));
    }
  }

  // ── Step 4.3: Hard return on active pending lock (under 15m) ─────────────
  const activePendingTx = await db.query.executionsLog.findFirst({
    where: and(
      eq(executionsLog.userWallet, monitoredWallet),
      eq(executionsLog.status, "pending")
    ),
  });
  if (activePendingTx) {
    log.warn({ logId: activePendingTx.id }, "Active pending transaction exists (<15m) — skipping evaluation.");
    return;
  }

  const cycleRemaining = (cycle?.cycleLimitUSD ?? 0) - (cycle?.totalRepaidThisCycleUSD ?? 0);

  // ── Step 5: Read signerWallet USDC balance ──────────────────────────────
  const agenticBalance = await getUsdcBalance(signerWallet);

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
      priceTrend: "stable",
    }),
  });

  log.info({ action: decision.recommendation.action }, decision.userExplanation);

  // ── Alert: liquidation risk before execution ──────────────────────────────
  // ── Alert: liquidation risk before execution ──────────────────────────────
  if (
    decision.recommendation.action === "repay" &&
    (position.healthFactor ?? 99) < 1.15
  ) {
    if (shouldAlert(`${monitoredWallet.slice(0, 8)}:liquidation_risk`)) {
      await sendKeeperNotification(
        ALERT_CHANNEL,
        `⚠️ Liquidation risk: HF=${position.healthFactor?.toFixed(2)} for ${monitoredWallet.slice(0, 8)}`,
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
      userWallet: monitoredWallet,
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
    if (agenticBalance === 0 && shouldAlert(`${monitoredWallet.slice(0, 8)}:wallet_empty`)) {
      await sendKeeperNotification(
        ALERT_CHANNEL,
        `🪙 Agentic wallet empty — cannot execute ${decision.recommendation.action} for ${monitoredWallet.slice(0, 8)}`,
        effectiveKey
      ).catch(() => {});
    }

    await db.insert(executionsLog).values({
      userWallet: monitoredWallet,
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
  const targetContract = AAVE_V3_POOL;

  const action = decision.recommendation.action;
  if (action === "repay") {
    calldata = encodeAaveRepay(USDC_SEPOLIA, clampedAmount, monitoredWallet);
  } else if (action === "supply_collateral") {
    calldata = encodeAaveSupply(USDC_SEPOLIA, clampedAmount, monitoredWallet, 6);
  } else {
    log.info({ action }, "Non-execution action emitted by brain — skipping calldata build.");
    return;
  }

  // ── Step 9: Pre-flight simulation ─────────────────────────────────────────
  const sim = await simulate(
    { from: signerWallet, to: targetContract, data: calldata },
    monitoredWallet
  );
  if (sim.wouldRevert) {
    log.warn({ reason: sim.revertReason }, "Pre-flight simulation reverted — recording resilience log.");
    await db.insert(executionsLog).values({
      userWallet: monitoredWallet,
      action: decision.recommendation.action,
      amount: Math.round(clampedAmount),
      status: "reverted_simulation",
      reason: `Pre-flight simulation intercepted revert: Guardian ${action} of ${clampedAmount.toFixed(2)} USDC failed (${sim.revertReason || "Reverted"}). Zero gas wasted.`,
      aiAnalysis: decision.analysis,
    });
    return;
  }

  // ── Step 10: Insert pending row before execution ─────────────────────────
  const [pendingRow] = await db.insert(executionsLog).values({
    userWallet: monitoredWallet,
    action: decision.recommendation.action,
    amount: Math.round(clampedAmount),
    status: "pending",
    reason: decision.userExplanation,
    aiAnalysis: decision.analysis,
  }).returning({ id: executionsLog.id });

  try {
    // ── Step 11: KeeperHub execution with ERC20 approval prepended ──────
    const allowanceCalldata = await ensureAllowance(signerWallet, USDC_SEPOLIA, targetContract, clampedAmount);
    const steps: WorkflowStep[] = [];
    if (allowanceCalldata) {
      steps.push({ type: "transaction", to: USDC_SEPOLIA, calldata: allowanceCalldata, gasStrategy: "standard" });
    }
    steps.push({ type: "transaction", to: targetContract, calldata, gasStrategy: "standard" });

    const { workflowId, isStub: createStub } = await createWorkflow({
      name: `guardian-${monitoredWallet.slice(0, 8)}-${Date.now()}`,
      triggerType: "manual",
      steps,
    }, effectiveKey);
    const { executionId, isStub: execStub } = await executeWorkflow(workflowId, effectiveKey);
    const isStub = createStub || execStub;

    if (isStub) {
      await db.update(executionsLog)
        .set({ status: "simulated_stub", aiAnalysis: { ...decision.analysis, executionId } })
        .where(eq(executionsLog.id, pendingRow.id));
    } else {
      const poll = await pollExecutionUntilSettled(executionId, effectiveKey);
      const finalStatus = poll.timedOut
        ? "reverted_chain"
        : poll.status === "mined" ? "success"
        : "reverted_chain";
      const finalReason = poll.timedOut
        ? "Execution poll timeout"
        : decision.userExplanation;

      await db.update(executionsLog)
        .set({
          status: finalStatus,
          txHash: poll.txHash,
          reason: finalReason,
          aiAnalysis: { ...decision.analysis, executionId }, // stored for Slice C sync
        })
        .where(eq(executionsLog.id, pendingRow.id));

      // ── Step 12: Increment cycle ONLY on confirmed mined success + txHash ─
      if (
        decision.recommendation.action === "repay" &&
        finalStatus === "success" &&
        poll.txHash &&
        cycle
      ) {
        await db.update(repaymentCycles)
          .set({ totalRepaidThisCycleUSD: sql`${repaymentCycles.totalRepaidThisCycleUSD} + ${clampedAmount}` })
          .where(eq(repaymentCycles.id, cycle.id));
        log.info({ clampedAmount, limit: cycle.cycleLimitUSD }, "Cycle updated");
      }
    }

    log.info({ isStub, action: decision.recommendation.action, clampedAmount, requested: amount }, "Execution complete");

  } catch (err) {
    // Ensure pending lock is never left open on any unexpected error
    await db.update(executionsLog)
      .set({
        status: "reverted_chain",
        reason: `Execution error: ${err instanceof Error ? err.message : String(err)}`,
      })
      .where(eq(executionsLog.id, pendingRow.id));
    log.error({ err }, "Execution pipeline failed — pending row cleared to reverted_chain");
  }
}
