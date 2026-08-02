import { generateObject } from "ai";
import { getBrainModel } from "../brain/provider.js";
import { GuardianDecisionSchema, GUARDIAN_SYSTEM_PROMPT } from "../brain/schemas.js";
import { selectBestCandidate, enforceCriticalHfFloor } from "../lib/guardian-candidate-select.js";
import { db } from "../db/client.js";
import { repaymentCycles, executionsLog } from "../db/schema.js";
import { simulateErc20Action } from "../lib/simulate.js";
import { createWorkflow, executeWorkflow, sendKeeperNotification, pollExecutionUntilSettled, getExecutionStatus, type WorkflowStep } from "../lib/mcp-client.js";
import { getAavePosition, getUsdcBalance, BalanceQueryError } from "../lib/aave.js";
import { getPriceTrend } from "../lib/price-feed.js";
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
import {
  getCycleRemaining,
  reserveCycleBudget,
  releaseCycleBudget,
  shouldReleaseCycleBudget,
  resolveExecutionLogStatus,
} from "../lib/repayment-cycle.js";
import { acquirePendingLock } from "../lib/pending-lock.js";
import { eq, and, lt, desc, gte, inArray } from "drizzle-orm";

const GUARDIAN_LOCK_ACTIONS = ["repay", "supply"] as const;

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
      inArray(executionsLog.action, [...GUARDIAN_LOCK_ACTIONS]),
      eq(executionsLog.status, "pending"),
      lt(executionsLog.timestamp, cutoff15m)
    ),
  });

  if (expiredPendingRows.length > 0) {
    log.info({ expiredCount: expiredPendingRows.length }, "Expiring stale pending locks older than 15 minutes.");
    for (const stale of expiredPendingRows) {
      const analysis = stale.aiAnalysis as { executionId?: string } | null;
      const executionId = analysis?.executionId;

      if (stale.action === "repay" && stale.amount > 0 && cycle && executionId) {
        const repoll = await getExecutionStatus(executionId, effectiveKey);
        const pollCtx = {
          timedOut: false,
          status: repoll.status,
          txHash: repoll.txHash,
        };
        const { status: resolvedStatus, reason: resolvedReason } = resolveExecutionLogStatus(pollCtx);

        if (shouldReleaseCycleBudget(pollCtx)) {
          await releaseCycleBudget(cycle.id, stale.amount);
        }

        await db.update(executionsLog)
          .set({
            status: resolvedStatus,
            txHash: repoll.txHash ?? undefined,
            reason: resolvedReason,
            aiAnalysis: { ...(analysis ?? {}), ttlRepoll: true, pollStatus: repoll.status },
          })
          .where(eq(executionsLog.id, stale.id));
        continue;
      }

      if (stale.action === "repay" && stale.amount > 0 && cycle) {
        await releaseCycleBudget(cycle.id, stale.amount);
      }
      await db.update(executionsLog)
        .set({ status: "reverted_chain", reason: "Pending lock expired (TTL 15m)" })
        .where(eq(executionsLog.id, stale.id));
    }
  }

  // ── Step 4.3: Hard return on active pending lock (under 15m) ─────────────
  const activePendingTx = await db.query.executionsLog.findFirst({
    where: and(
      eq(executionsLog.userWallet, monitoredWallet),
      inArray(executionsLog.action, [...GUARDIAN_LOCK_ACTIONS]),
      eq(executionsLog.status, "pending")
    ),
  });
  if (activePendingTx) {
    log.warn({ logId: activePendingTx.id }, "Active Guardian pending transaction exists (<15m) — skipping evaluation.");
    return;
  }

  const cycleRemaining = getCycleRemaining(cycle!);

  // ── Step 5: Read signerWallet USDC balance ──────────────────────────────
  let agenticBalance: number;
  try {
    agenticBalance = await getUsdcBalance(signerWallet);
  } catch (err) {
    if (err instanceof BalanceQueryError) {
      log.warn({ err: err.message }, "USDC balance RPC failed — skipping Guardian cycle.");
      return;
    }
    throw err;
  }

  // ── Step 6: AI Brain & Reasoning Harness Candidate Selection ───────────────
  const priceTrend = await getPriceTrend();
  log.info({ priceTrend }, "Market price trend for Guardian prompt");

  const recentExecutions = await db.query.executionsLog.findMany({
    where: eq(executionsLog.userWallet, monitoredWallet),
    orderBy: [desc(executionsLog.timestamp)],
    limit: 5,
  });

  let decision;
  try {
    const res = await generateObject({
      model: getBrainModel(),
      schema: GuardianDecisionSchema,
      system: GUARDIAN_SYSTEM_PROMPT,
      prompt: JSON.stringify({
        healthFactor: position.healthFactor,
        walletBalance: agenticBalance,
        collateralValueUSD: position.collateralUSD,
        debtValueUSD: position.debtUSD,
        cycleRemainingBudget: cycleRemaining,
        executionHistory: recentExecutions.map(r => `${r.status}:${r.action}:${r.amount}`),
        priceTrend,
      }),
    });
    decision = res.object;
  } catch (llmErr) {
    log.warn({ err: String(llmErr) }, "LLM brownout/error — using deterministic quantitative safety fallback");
    const hf = position.healthFactor ?? 99;
    const critical = hf < 1.15;
    const repayAmount = critical
      ? Math.max(0, Math.min(agenticBalance, cycleRemaining, position.debtUSD))
      : 0;
    decision = {
      analysis: {
        collateralValueUSD: position.collateralUSD,
        debtValueUSD: position.debtUSD,
        requiredRepaymentToTargetHF: 0,
        walletLimitExceeded: agenticBalance < position.debtUSD,
        cycleRemainingBudgetUSD: cycleRemaining,
        safetyStatus: hf < 1.1 ? "critical_liquidation_risk" : hf < 1.3 ? "warning" : "safe",
      },
      candidateActions: critical
        ? [{
            action: "repay" as const,
            amount: repayAmount,
            expectedHealthFactor: hf + 0.05,
            estimatedGasUSD: 1,
            riskScore: 3,
            pros: "Reduce liquidation risk",
            cons: "Uses agentic wallet USDC",
          }]
        : [{
            action: "hold" as const,
            amount: 0,
            expectedHealthFactor: hf,
            estimatedGasUSD: 0,
            riskScore: 0,
            pros: "Health factor is safe",
            cons: "None",
          }],
      userExplanation: critical
        ? `Deterministic fallback: HF ${hf.toFixed(2)} is critical — proposing repay of $${repayAmount.toFixed(2)} USDC.`
        : "Deterministic Quantitative Rule: Position Health Factor is healthy.",
      recommendation: critical
        ? {
            action: "repay" as const,
            asset: "USDC",
            amount: repayAmount,
            reason: "Critical HF — deterministic repay fallback.",
          }
        : {
            action: "hold" as const,
            asset: "USDC",
            amount: 0,
            reason: "Position Health Factor is safe; no immediate action required.",
          },
    };
  }

  let selectedRecommendation = selectBestCandidate(
    decision.candidateActions,
    decision.recommendation,
    { currentHealthFactor: position.healthFactor }
  );

  const preFloorRecommendation = selectedRecommendation;
  selectedRecommendation = enforceCriticalHfFloor(selectedRecommendation, {
    healthFactor: position.healthFactor,
    agenticBalance,
    cycleRemaining,
    debtUSD: position.debtUSD,
  });
  const safetyFloorApplied =
    selectedRecommendation.action !== preFloorRecommendation.action ||
    selectedRecommendation.amount !== preFloorRecommendation.amount;

  if (safetyFloorApplied) {
    log.warn(
      { before: preFloorRecommendation, after: selectedRecommendation },
      "Safety floor override: critical HF hold/block converted to repay."
    );
  } else if (
    selectedRecommendation.action !== decision.recommendation.action ||
    selectedRecommendation.amount !== decision.recommendation.amount
  ) {
    log.info(
      { llm: decision.recommendation, harness: selectedRecommendation },
      "Reasoning Harness candidate selector override applied."
    );
  } else {
    log.info({ action: selectedRecommendation.action }, decision.userExplanation);
  }

  const aiAnalysisPayload = {
    healthFactor: position.healthFactor,
    evaluatedAt: new Date().toISOString(),
    ...decision.analysis,
    priceTrend,
    candidateActions: decision.candidateActions ?? [],
    llmRecommendation: decision.recommendation,
    harnessRecommendation: selectedRecommendation,
    harnessOverride:
      safetyFloorApplied ||
      selectedRecommendation.action !== decision.recommendation.action ||
      selectedRecommendation.amount !== decision.recommendation.amount,
    safetyFloorApplied,
  };

  // ── Alert: liquidation risk before execution ──────────────────────────────
  if (
    selectedRecommendation.action === "repay" &&
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
  const criticalHf = (position.healthFactor ?? 99) < 1.15;
  if (
    selectedRecommendation.action === "hold" ||
    selectedRecommendation.action === "block_transaction"
  ) {
    const safetyFloorMiss =
      criticalHf &&
      selectedRecommendation.action === "hold" &&
      agenticBalance > 0 &&
      cycleRemaining > 0;
    const blockedCritical =
      criticalHf &&
      selectedRecommendation.action === "hold" &&
      agenticBalance <= 0;

    if (safetyFloorMiss) {
      log.error(
        { agenticBalance, cycleRemaining, healthFactor: position.healthFactor },
        "Safety floor miss: hold at critical HF with repay capacity — logging delayed."
      );
      await db.insert(executionsLog).values({
        userWallet: monitoredWallet,
        action: "repay",
        amount: 0,
        status: "delayed",
        reason: `Critical HF (${position.healthFactor?.toFixed(2)}) — safety floor expected repay but hold path reached. ${decision.userExplanation}`,
        aiAnalysis: aiAnalysisPayload,
      });
      return;
    }

    await db.insert(executionsLog).values({
      userWallet: monitoredWallet,
      action: blockedCritical ? "repay" : selectedRecommendation.action,
      amount: 0,
      status: blockedCritical ? "delayed" : "success",
      reason: blockedCritical
        ? `Critical HF (${position.healthFactor?.toFixed(2)}) — agentic wallet has $0 USDC. Fund ${signerWallet.slice(0, 10)}… to enable repay. ${decision.userExplanation}`
        : decision.userExplanation,
      aiAnalysis: aiAnalysisPayload,
    });
    return;
  }

  // ── Step 7: Clamp amount ──────────────────────────────────────────────────
  const amount = selectedRecommendation.amount;
  const clampedAmount = Math.max(0, Math.min(amount, cycleRemaining, agenticBalance));

  if (clampedAmount <= 0) {
    log.warn({ cycleRemaining, agenticBalance }, "Clamped amount is 0 — aborting.");

    const cycleExhausted = cycleRemaining <= 0;
    const walletEmpty = agenticBalance <= 0;
    const hfCritical = (position.healthFactor ?? 99) < 1.15;

    if (walletEmpty && shouldAlert(`${monitoredWallet.slice(0, 8)}:wallet_empty`)) {
      await sendKeeperNotification(
        ALERT_CHANNEL,
        `🪙 Agentic wallet empty — cannot execute ${selectedRecommendation.action} for ${monitoredWallet.slice(0, 8)}`,
        effectiveKey
      ).catch(() => {});
    }

    const cycleEndStr = cycle?.cycleEnd
      ? new Date(cycle.cycleEnd).toISOString().slice(0, 10)
      : "next cycle";

    let status: "delayed" | "success" = "success";
    let reason: string;

    if (cycleExhausted) {
      status = "delayed";
      reason = `Monthly repay budget exhausted ($${cycle?.totalRepaidThisCycleUSD ?? 0}/$${cycle?.cycleLimitUSD ?? 0}). Resets ${cycleEndStr}.`;
    } else if (hfCritical && walletEmpty) {
      status = "delayed";
      reason = `Critical HF (${position.healthFactor?.toFixed(2)}) — agentic wallet has $0 USDC. Fund ${signerWallet.slice(0, 10)}… to enable ${selectedRecommendation.action}.`;
    } else {
      reason = `Budget clamped to 0: cycleRemaining=$${cycleRemaining} agenticBalance=$${agenticBalance.toFixed(2)}`;
    }

    // Dedupe noisy cron logs when cycle-exhausted and position is safe
    const hfSafe = (position.healthFactor ?? 99) >= 1.30;
    if (cycleExhausted && hfSafe) {
      const cutoff30m = new Date(Date.now() - 30 * 60 * 1000);
      const recentDup = await db.query.executionsLog.findFirst({
        where: and(
          eq(executionsLog.userWallet, monitoredWallet),
          eq(executionsLog.action, selectedRecommendation.action),
          eq(executionsLog.status, "delayed"),
          gte(executionsLog.timestamp, cutoff30m),
        ),
        orderBy: [desc(executionsLog.timestamp)],
      });
      if (recentDup?.reason?.includes("budget exhausted")) {
        log.info("Skipping duplicate cycle-exhausted log (30m dedupe).");
        return;
      }
    }

    await db.insert(executionsLog).values({
      userWallet: monitoredWallet,
      action: selectedRecommendation.action,
      amount: 0,
      status,
      reason,
      aiAnalysis: aiAnalysisPayload,
    });
    return;
  }

  // ── Step 8: Build calldata ────────────────────────────────────────────────
  let calldata: string;
  const targetContract = AAVE_V3_POOL;

  const action = selectedRecommendation.action;
  if (action === "repay") {
    calldata = encodeAaveRepay(USDC_SEPOLIA, clampedAmount, monitoredWallet);
  } else if (action === "supply_collateral") {
    calldata = encodeAaveSupply(USDC_SEPOLIA, clampedAmount, monitoredWallet, 6);
  } else {
    log.info({ action }, "Non-execution action emitted by brain — skipping calldata build.");
    return;
  }

  // ── Step 9: Pre-flight simulation (allowance-aware) ─────────────────────
  const sim = await simulateErc20Action(
    signerWallet,
    monitoredWallet,
    USDC_SEPOLIA,
    targetContract,
    clampedAmount,
    { from: signerWallet, to: targetContract, data: calldata },
  );
  if (sim.wouldRevert) {
    log.warn({ reason: sim.revertReason }, "Pre-flight simulation reverted — recording resilience log.");
    await db.insert(executionsLog).values({
      userWallet: monitoredWallet,
      action: selectedRecommendation.action,
      amount: Math.round(clampedAmount),
      status: "reverted_simulation",
      reason: `Pre-flight simulation intercepted revert: Guardian ${action} of ${clampedAmount.toFixed(2)} USDC failed (${sim.revertReason || "Reverted"}). Zero gas wasted.`,
      aiAnalysis: aiAnalysisPayload,
    });
    return;
  }

  // ── Step 9.5: Atomic cycle budget reservation (repay only) ───────────────
  let budgetReserved = 0;
  if (action === "repay" && cycle) {
    const reserved = await reserveCycleBudget(cycle.id, clampedAmount);
    if (!reserved) {
      const cycleEndStr = cycle.cycleEnd
        ? new Date(cycle.cycleEnd).toISOString().slice(0, 10)
        : "next cycle";
      log.warn("Cycle budget reservation failed — limit reached.");
      await db.insert(executionsLog).values({
        userWallet: monitoredWallet,
        action: "repay",
        amount: 0,
        status: "delayed",
        reason: `Monthly repay budget exhausted ($${cycle.totalRepaidThisCycleUSD ?? cycle.cycleLimitUSD}/$${cycle.cycleLimitUSD}). Resets ${cycleEndStr}.`,
        aiAnalysis: aiAnalysisPayload,
      });
      return;
    }
    cycle = reserved;
    budgetReserved = Math.round(clampedAmount);
  }

  // ── Step 10: Atomically acquire pending lock before execution ─────────────
  const pendingLock = await acquirePendingLock({
    userWallet: monitoredWallet,
    action: selectedRecommendation.action,
    amount: Math.round(clampedAmount),
    reason: decision.userExplanation,
    aiAnalysis: aiAnalysisPayload,
  });
  if (!pendingLock) {
    if (budgetReserved > 0 && cycle) {
      await releaseCycleBudget(cycle.id, budgetReserved);
    }
    log.warn("Concurrent pending lock — another execution in flight; skipping.");
    return;
  }
  const pendingRow = { id: pendingLock.id };

  try {
    // ── Step 11: KeeperHub execution with ERC20 approval prepended ──────
    const { allowanceCalldata } = sim;
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
      if (budgetReserved > 0 && cycle) {
        await releaseCycleBudget(cycle.id, budgetReserved);
      }
      await db.update(executionsLog)
        .set({ status: "simulated_stub", reason: decision.userExplanation, aiAnalysis: { ...aiAnalysisPayload, workflowId, executionId } })
        .where(eq(executionsLog.id, pendingRow.id));
    } else {
      const poll = await pollExecutionUntilSettled(executionId, effectiveKey);
      const { status: finalStatus, reason: pollReason } = resolveExecutionLogStatus(poll);
      const finalReason =
        poll.timedOut && pollReason.includes("inconclusive")
          ? pollReason
          : finalStatus === "reverted_chain" && poll.status === "failed"
            ? pollReason
            : decision.userExplanation;

      if (shouldReleaseCycleBudget(poll) && budgetReserved > 0 && cycle) {
        await releaseCycleBudget(cycle.id, budgetReserved);
      }

      await db.update(executionsLog)
        .set({
          status: finalStatus,
          txHash: poll.txHash,
          reason: finalReason,
          aiAnalysis: {
            ...aiAnalysisPayload,
            workflowId,
            executionId,
            pollStatus: poll.status,
            pollTimedOut: poll.timedOut ?? false,
          },
        })
        .where(eq(executionsLog.id, pendingRow.id));
    }

    log.info({ isStub, action: selectedRecommendation.action, clampedAmount, requested: amount }, "Execution complete");

  } catch (err) {
    if (budgetReserved > 0 && cycle) {
      await releaseCycleBudget(cycle.id, budgetReserved);
    }
    // Ensure pending lock is never left open on any unexpected error
    await db.update(executionsLog)
      .set({
        status: "reverted_chain",
        reason: `Execution error: ${err instanceof Error ? err.message : String(err)}`,
        aiAnalysis: aiAnalysisPayload,
      })
      .where(eq(executionsLog.id, pendingRow.id));
    log.error({ err }, "Execution pipeline failed — pending row cleared to reverted_chain");
  }
}
