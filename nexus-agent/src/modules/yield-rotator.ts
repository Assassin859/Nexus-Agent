import { generateObject } from "ai";
import { githubModels, BRAIN_MODEL } from "../brain/provider.js";
import { YieldRotatorSchema, YIELD_ROTATOR_SYSTEM_PROMPT } from "../brain/schemas.js";
import { db } from "../db/client.js";
import { executionsLog } from "../db/schema.js";
import { simulate } from "../lib/simulate.js";
import { createWorkflow, executeWorkflow, sendKeeperNotification, pollExecutionUntilSettled, type WorkflowStep } from "../lib/mcp-client.js";
import { ensureAllowance } from "../lib/allowance.js";
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

  const log = childLogger({ module: "yield", wallet: userWallet.slice(0, 8) });
  const effectiveKey = options?.apiKey || (await resolveKeeperHubApiKey(userWallet));

  // ── Ownership Guard: Aave withdraw has no onBehalfOf ─────────────────────
  if (!context.canWithdrawAaveSupply) {
    log.info("Cannot rotate watched wallet's Aave supply without shared wallet ownership — skipping.");
    await db.insert(executionsLog).values({
      userWallet,
      action: "rotate",
      amount: 0,
      status: "success",
      reason: "Cannot rotate watched wallet's Aave supply without shared wallet ownership (userWallet !== AGENTIC_WALLET)",
    });
    return;
  }

  log.info("Evaluating yield opportunities");

  const position = await getAavePosition(userWallet);
  const aaveUSDCSupplyAPY = position.currentUSDCSupplyAPY;

  // ── Skip on RPC error ─────────────────────────────────────────────────────
  if (position.isError) {
    log.warn({ reason: position.errorReason }, "RPC error — skipping");
    if (shouldAlert(`${userWallet.slice(0, 8)}:rpc_error`)) {
      await sendKeeperNotification(
        ALERT_CHANNEL,
        `🔴 Yield RPC error for ${userWallet.slice(0, 8)}: ${position.errorReason}`,
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
    model: githubModels(BRAIN_MODEL),
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
      userWallet,
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
    userWallet
  );

  if (simWithdraw.wouldRevert) {
    log.warn("Step 1 (Aave withdraw) pre-flight simulation reverted — recording resilience log.");
    await db.insert(executionsLog).values({
      userWallet,
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
    userWallet
  );

  if (simSupply.wouldRevert) {
    log.warn("Step 2 (Compound supply) pre-flight simulation reverted — recording resilience log.");
    await db.insert(executionsLog).values({
      userWallet,
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

  const { workflowId, isStub: createStub } = await createWorkflow({
    name: `yield-rotate-${userWallet.slice(0, 8)}-${Date.now()}`,
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
  } else {
    const poll = await pollExecutionUntilSettled(executionId, effectiveKey);
    executionIdForLog = executionId;
    finalStatus = poll.timedOut
      ? "reverted_chain"
      : poll.status === "mined" ? "success"
      : "reverted_chain";
    txHash = poll.txHash;
  }

  await db.insert(executionsLog).values({
    userWallet,
    action: "rotate",
    amount: Math.round(rotateAmount),
    status: finalStatus,
    txHash,
    reason: decision.userExplanation,
    aiAnalysis: { ...decision.analysis, executionId: executionIdForLog },
  });

  log.info({ executionId, isStub, finalStatus, rotateAmount }, "Rotated USDC (Aave V3 → Compound V3)");

  // ── Alert ONLY on confirmed mined success with txHash (throttled) ─────────
  if (finalStatus === "success" && txHash && shouldAlert(`${userWallet.slice(0, 8)}:yield_success`)) {
    await sendKeeperNotification(
      ALERT_CHANNEL,
      `🔄 Yield rotated: ${rotateAmount} USDC → Compound V3 for ${userWallet.slice(0, 8)}`,
      effectiveKey
    ).catch(() => {});
  }
}
