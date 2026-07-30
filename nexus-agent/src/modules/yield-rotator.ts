import { generateObject } from "ai";
import { githubModels, BRAIN_MODEL } from "../brain/provider.js";
import { YieldRotatorSchema, YIELD_ROTATOR_SYSTEM_PROMPT } from "../brain/schemas.js";
import { db } from "../db/client.js";
import { executionsLog } from "../db/schema.js";
import { simulate } from "../lib/simulate.js";
import { createWorkflow, executeWorkflow } from "../lib/mcp-client.js";
import { sendKeeperNotification } from "../lib/mcp-client.js";
import {
  encodeAaveWithdraw,
  encodeCompoundSupply,
  AAVE_V3_POOL,
  COMPOUND_V3_USDC,
  USDC_SEPOLIA,
} from "../lib/calldata.js";
import { getAavePosition } from "../lib/aave.js";
import { getAgenticWallet } from "../lib/agentic-wallet.js";
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
  const AGENTIC_WALLET = getAgenticWallet();
  if (!AGENTIC_WALLET) return; // dev-only early exit; prod throws at startup

  const log = childLogger({ module: "yield", wallet: userWallet.slice(0, 8) });
  const effectiveKey = options?.apiKey || (await resolveKeeperHubApiKey(userWallet));

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

  // ── Skip if no Aave collateral ────────────────────────────────────────────
  if (position.collateralUSD === 0) {
    log.info("No Aave collateral — skipping.");
    return;
  }

  const userBalance = position.collateralUSD;

  // ── Fetch Compound APY from on-chain, env-configurable conservative fallback ─
  let compoundUSDCSupplyAPY = Number(process.env.COMPOUND_APY_FALLBACK) || 3;
  try {
    const provider = await getProvider();
    const cUSDC = new Contract(COMPOUND_V3_USDC, COMPOUND_ABI, provider);
    const ratePerSecRaw = await cUSDC.supplyRatePerSecond();
    const ratePerSec = Number(ratePerSecRaw) / 1e18;
    const secondsInYear = 365 * 24 * 3600;
    const computed = parseFloat(((Math.pow(1 + ratePerSec, secondsInYear) - 1) * 100).toFixed(2));
    compoundUSDCSupplyAPY = computed > 0 ? computed : Number(process.env.COMPOUND_APY_FALLBACK) || 3;
    log.info({ compoundUSDCSupplyAPY }, "Compound APY fetched on-chain");
  } catch (err) {
    log.warn({ reason: err instanceof Error ? err.message : err }, "Compound APY fetch failed — using fallback");
  }

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

  const rotateAmount = decision.recommendation.amount || userBalance;
  const withdrawCalldata = encodeAaveWithdraw(USDC_SEPOLIA, rotateAmount, userWallet);
  const supplyCalldata = encodeCompoundSupply(USDC_SEPOLIA, rotateAmount);

  const simWithdraw = await simulate(
    { from: AGENTIC_WALLET, to: AAVE_V3_POOL, data: withdrawCalldata },
    userWallet
  );

  if (simWithdraw.wouldRevert) {
    log.warn("Pre-flight simulation reverted — recording resilience log.");
    await db.insert(executionsLog).values({
      userWallet,
      action: "rotate",
      amount: rotateAmount,
      status: "reverted_simulation",
      reason: `Pre-flight simulation intercepted revert: Insufficient Aave collateral/balance to rotate ${rotateAmount} USDC to Compound V3. Zero gas wasted.`,
      aiAnalysis: decision.analysis,
    });
    return;
  }

  const { workflowId, isStub: createStub } = await createWorkflow({
    name: `yield-rotate-${userWallet.slice(0, 8)}-${Date.now()}`,
    triggerType: "manual",
    steps: [
      { type: "transaction", to: AAVE_V3_POOL, calldata: withdrawCalldata, gasStrategy: "standard" },
      { type: "transaction", to: COMPOUND_V3_USDC, calldata: supplyCalldata, gasStrategy: "standard" },
    ],
    mevProtected: true,
  }, effectiveKey);

  const { executionId, isStub: execStub } = await executeWorkflow(workflowId, effectiveKey);
  const isStub = createStub || execStub;

  await db.insert(executionsLog).values({
    userWallet,
    action: "rotate",
    amount: rotateAmount,
    status: isStub ? "simulated_stub" : "success",
    reason: decision.userExplanation,
    aiAnalysis: decision.analysis,
  });

  log.info({ executionId, isStub, rotateAmount }, "Rotated USDC (Aave V3 → Compound V3)");

  // ── Alert on real execution success (throttled) ───────────────────────────
  if (!isStub && shouldAlert(`${userWallet.slice(0, 8)}:yield_success`)) {
    await sendKeeperNotification(
      ALERT_CHANNEL,
      `🔄 Yield rotated: ${rotateAmount} USDC → Compound V3 for ${userWallet.slice(0, 8)}`,
      effectiveKey
    ).catch(() => {});
  }
}
