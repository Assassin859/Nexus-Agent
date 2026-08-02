import { generateObject } from "ai";
import { getBrainModel } from "../brain/provider.js";
import { YieldRotatorSchema, YIELD_ROTATOR_SYSTEM_PROMPT } from "../brain/schemas.js";
import { db } from "../db/client.js";
import { executionsLog } from "../db/schema.js";
import { simulate } from "../lib/simulate.js";
import { createWorkflow, executeWorkflow, sendKeeperNotification, pollExecutionUntilSettled, type WorkflowStep } from "../lib/mcp-client.js";
import { ensureAllowance } from "../lib/allowance.js";
import { acquirePendingLock } from "../lib/pending-lock.js";
import {
  encodeAaveWithdraw,
  encodeCompoundSupply,
  AAVE_V3_POOL,
  COMPOUND_V3_USDC,
  USDC_SEPOLIA,
} from "../lib/calldata.js";
import { getAavePosition } from "../lib/aave.js";
import { getAgenticWallet, getWalletContext } from "../lib/agentic-wallet.js";
import { getCompoundUsdcSupplyAPY } from "../lib/compound.js";
import { resolveKeeperHubApiKey } from "../lib/user-context.js";
import { childLogger } from "../lib/logger.js";
import { shouldAlert } from "../lib/alert-throttle.js";
import { getProvider } from "../lib/rpc.js";
import { Contract } from "ethers";
import { eq, and, lt } from "drizzle-orm";

const COMPOUND_ABI = [
  "function supplyRatePerSecond() view returns (uint256)",
  "function balanceOf(address owner) view returns (uint256)",
];

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
  const log = childLogger({ module: "yield", wallet: monitoredWallet.slice(0, 8) });
  const effectiveKey = options?.apiKey || (await resolveKeeperHubApiKey(monitoredWallet));

  // ── Ownership Guard: Aave withdraw has no onBehalfOf ─────────────────────
  if (!context.canWithdrawAaveSupply) {
    log.info("Cannot rotate watched wallet's Aave supply without shared wallet ownership — skipping.");
    await db.insert(executionsLog).values({
      userWallet: monitoredWallet,
      action: "rotate",
      amount: 0,
      status: "success",
      reason: "Cannot rotate watched wallet's Aave supply without shared wallet ownership (userWallet !== AGENTIC_WALLET)",
    });
    return;
  }

  // ── Step 4.1: Expire pending rows older than 15m (wallet-wide) ──────────────
  const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
  await db
    .update(executionsLog)
    .set({
      status: "reverted_chain",
      reason: "Pending lock expired (TTL 15m) — lock released for next cycle.",
    })
    .where(
      and(
        eq(executionsLog.userWallet, monitoredWallet),
        eq(executionsLog.status, "pending"),
        lt(executionsLog.timestamp, fifteenMinutesAgo)
      )
    );

  // ── Step 4.2: Hard return on active pending lock (under 15m) ─────────────
  const activePendingTx = await db.query.executionsLog.findFirst({
    where: and(
      eq(executionsLog.userWallet, monitoredWallet),
      eq(executionsLog.status, "pending")
    ),
  });
  if (activePendingTx) {
    log.warn({ logId: activePendingTx.id }, "Active pending transaction exists (<15m) — skipping yield evaluation.");
    return;
  }

  log.info("Evaluating yield opportunities");

  const position = await getAavePosition(monitoredWallet);
  const aaveUSDCSupplyAPY = position.currentUSDCSupplyAPY;

  // ── Skip on RPC error ─────────────────────────────────────────────────────
  if (position.isError) {
    log.warn({ reason: position.errorReason }, "RPC error — skipping");
    if (shouldAlert(`${monitoredWallet.slice(0, 8)}:rpc_error`)) {
      await sendKeeperNotification(
        ALERT_CHANNEL,
        `🔴 Yield RPC error for ${monitoredWallet.slice(0, 8)}: ${position.errorReason}`,
        effectiveKey
      ).catch(() => {});
    }
    return;
  }

  // ── Skip if no Aave USDC supply ────────────────────────────────────────────
  if (position.usdcSuppliedUSD === 0) {
    log.info("No Aave USDC supply — skipping.");
    return;
  }

  const userBalance = position.usdcSuppliedUSD;

  // ── Fetch Compound APY from on-chain helper ────────────────────────────────
  const compoundUSDCSupplyAPY = await getCompoundUsdcSupplyAPY();
  log.info({ compoundUSDCSupplyAPY }, "Compound APY fetched on-chain");

  // ── Env-configurable gas estimate fallback ────────────────────────────────
  const estimatedGasUSD = Number(process.env.ESTIMATED_GAS_USD_FALLBACK) || 4.5;

  const { object: decision } = await generateObject({
    model: getBrainModel(),
    schema: YieldRotatorSchema,
    system: YIELD_ROTATOR_SYSTEM_PROMPT,
    prompt: JSON.stringify({
      currentProtocol: "Aave V3",
      currentAPY: aaveUSDCSupplyAPY,
      candidateProtocol: "Compound V3",
      candidateAPY: compoundUSDCSupplyAPY,
      userUSDCBalance: userBalance,
      estimatedGasUSD,
      lockInDays: 90,
    }),
  });

  log.info({ shouldRotate: decision.recommendation.should_rotate }, decision.userExplanation);

  if (!decision.recommendation.should_rotate) {
    await db.insert(executionsLog).values({
      userWallet: monitoredWallet,
      action: "rotate",
      amount: 0,
      status: "success",
      reason: decision.userExplanation,
      aiAnalysis: decision.analysis,
    });
    return;
  }


  const rotateAmount = Math.min(decision.recommendation.amount || userBalance, userBalance);
  // Step 1: Withdraw from Aave to signer wallet
  const withdrawCalldata = encodeAaveWithdraw(USDC_SEPOLIA, rotateAmount, context.signerWallet);
  // Step 2: Supply to Compound V3 from signer wallet
  const supplyCalldata = encodeCompoundSupply(USDC_SEPOLIA, rotateAmount);

  // Pre-flight simulate Step 1 (Aave withdraw)
  const simWithdraw = await simulate(
    { from: context.signerWallet, to: AAVE_V3_POOL, data: withdrawCalldata },
    monitoredWallet
  );

  if (simWithdraw.wouldRevert) {
    log.warn("Step 1 (Aave withdraw) pre-flight simulation reverted — recording resilience log.");
    await db.insert(executionsLog).values({
      userWallet: monitoredWallet,
      action: "rotate",
      amount: rotateAmount,
      status: "reverted_simulation",
      reason: `Pre-flight simulation intercepted revert: Aave withdraw of ${rotateAmount} USDC failed (${simWithdraw.revertReason || "Reverted"}). Zero gas wasted.`,
      aiAnalysis: decision.analysis,
    });
    return;
  }

  // Pre-flight simulate Step 2 (Compound supply)
  const simSupply = await simulate(
    { from: context.signerWallet, to: COMPOUND_V3_USDC, data: supplyCalldata },
    monitoredWallet
  );

  if (simSupply.wouldRevert) {
    log.warn("Step 2 (Compound supply) pre-flight simulation reverted — recording resilience log.");
    await db.insert(executionsLog).values({
      userWallet: monitoredWallet,
      action: "rotate",
      amount: rotateAmount,
      status: "reverted_simulation",
      reason: `Pre-flight simulation intercepted revert: Compound V3 supply of ${rotateAmount} USDC failed (${simSupply.revertReason || "Reverted"}). Zero gas wasted.`,
      aiAnalysis: decision.analysis,
    });
    return;
  }

  // Prepend ERC20 max-uint256 approval step for Compound V3 USDC supply if needed
  const allowanceCalldata = await ensureAllowance(context.signerWallet, USDC_SEPOLIA, COMPOUND_V3_USDC, rotateAmount);
  const steps: WorkflowStep[] = [
    { type: "transaction", to: AAVE_V3_POOL, calldata: withdrawCalldata, gasStrategy: "standard" },
  ];
  if (allowanceCalldata) {
    steps.push({ type: "transaction", to: USDC_SEPOLIA, calldata: allowanceCalldata, gasStrategy: "standard" });
  }
  steps.push({ type: "transaction", to: COMPOUND_V3_USDC, calldata: supplyCalldata, gasStrategy: "standard" });

  // Atomically acquire pending lock before execution
  const pendingLock = await acquirePendingLock({
    userWallet: monitoredWallet,
    action: "rotate",
    amount: Math.round(rotateAmount),
    reason: decision.userExplanation,
    aiAnalysis: decision.analysis,
  });
  if (!pendingLock) {
    log.warn("Concurrent yield rotate pending lock — skipping.");
    return;
  }
  const pendingRow = { id: pendingLock.id };

  try {
    const { workflowId, isStub: createStub } = await createWorkflow({
      name: `yield-rotate-${monitoredWallet.slice(0, 8)}-${Date.now()}`,
      triggerType: "manual",
      steps,
      mevProtected: true,
    }, effectiveKey);

    const { executionId, isStub: execStub } = await executeWorkflow(workflowId, effectiveKey);
    const isStub = createStub || execStub;

    let finalStatus: string;
    let txHash: string | undefined;
    let executionIdForLog: string | undefined;

    if (isStub) {
      finalStatus = "simulated_stub";
      await db.update(executionsLog)
        .set({
          status: "simulated_stub",
          reason: `Yield Rotate (Simulated Stub): ${decision.userExplanation}`,
          aiAnalysis: { ...decision.analysis, workflowId, executionId },
        })
        .where(eq(executionsLog.id, pendingRow.id));
    } else {
      const poll = await pollExecutionUntilSettled(executionId, effectiveKey);
      executionIdForLog = executionId;
      finalStatus = poll.timedOut
        ? "reverted_chain"
        : poll.status === "mined" ? "success"
        : "reverted_chain";
      txHash = poll.txHash;

      await db.update(executionsLog)
        .set({
          status: finalStatus,
          txHash: poll.txHash,
          reason: decision.userExplanation,
          aiAnalysis: { ...decision.analysis, workflowId, executionId: executionIdForLog, pollStatus: poll.status },
        })
        .where(eq(executionsLog.id, pendingRow.id));
    }

    log.info({ executionId, isStub, finalStatus, rotateAmount }, "Rotated USDC (Aave V3 → Compound V3)");

    // ── Alert ONLY on confirmed mined success with txHash (throttled) ─────────
    if (finalStatus === "success" && txHash && shouldAlert(`${monitoredWallet.slice(0, 8)}:yield_success`)) {
      await sendKeeperNotification(
        ALERT_CHANNEL,
        `🔄 Yield rotated: ${rotateAmount} USDC → Compound V3 for ${monitoredWallet.slice(0, 8)}`,
        effectiveKey
      ).catch(() => {});
    }
  } catch (err) {
    await db.update(executionsLog)
      .set({
        status: "reverted_chain",
        reason: `Yield rotation execution failed: ${err instanceof Error ? err.message : String(err)}`,
        aiAnalysis: { ...decision.analysis, error: err instanceof Error ? err.message : String(err) },
      })
      .where(eq(executionsLog.id, pendingRow.id));
    log.error({ err }, "Yield rotation pipeline failed — pending row cleared to reverted_chain");
  }
}
