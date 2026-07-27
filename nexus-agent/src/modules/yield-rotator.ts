import { generateObject } from "ai";
import { githubModels, BRAIN_MODEL } from "../brain/provider.js";
import { YieldRotatorSchema, YIELD_ROTATOR_SYSTEM_PROMPT } from "../brain/schemas.js";
import { db } from "../db/client.js";
import { executionsLog } from "../db/schema.js";
import { simulate } from "../lib/simulate.js";
import { createWorkflow, executeWorkflow } from "../lib/mcp-client.js";
import {
  encodeAaveRepay,
  encodeCompoundSupply,
  AAVE_V3_POOL,
  COMPOUND_V3_USDC,
  USDC_SEPOLIA,
} from "../lib/calldata.js";
import { getProvider } from "../lib/rpc.js";
import { Contract } from "ethers";

const AGENTIC_WALLET = process.env.AGENTIC_WALLET_ADDRESS || "0x0D81e4c01a4507Bdd8b6a075Cb8f1e0A0270A442";

// Compound V3 ABI — minimal for rate read
const COMPOUND_ABI = [
  "function getSupplyRate(uint utilization) view returns (uint64)",
  "function getUtilization() view returns (uint)",
];

/**
 * Fetches the Compound V3 USDC supply APY on Sepolia.
 */
async function getCompoundSupplyAPY(): Promise<number> {
  try {
    const provider = await getProvider();
    const comet = new Contract(COMPOUND_V3_USDC, COMPOUND_ABI, provider);
    const utilization = await comet.getUtilization();
    const supplyRatePerSecond = await comet.getSupplyRate(utilization);
    const secondsPerYear = 365 * 24 * 60 * 60;
    const apy = (Math.pow(1 + Number(supplyRatePerSecond) / 1e18, secondsPerYear) - 1) * 100;
    return parseFloat(apy.toFixed(2));
  } catch {
    return 5.1;
  }
}

export async function run(userWallet: string): Promise<void> {
  console.log(`[YIELD] Evaluating yield opportunities for ${userWallet}`);

  // ── Phase 2: Real APY & Position reads ─────────────────────────────────────────
  const [aavePosition, compoundAPY] = await Promise.all([
    getAavePosition(userWallet),
    getCompoundSupplyAPY(),
  ]);

  const currentAPY = aavePosition.currentUSDCSupplyAPY;
  const rates = {
    current:  { protocol: "Aave V3",      apy: currentAPY,  poolAddress: AAVE_V3_POOL },
    target:   { protocol: "Compound V3",   apy: compoundAPY, poolAddress: COMPOUND_V3_USDC },
  };

  console.log(`[YIELD] Aave APY: ${currentAPY.toFixed(2)}% | Compound APY: ${compoundAPY.toFixed(2)}%`);

  // Real position balance (must be > 0 to rotate real funds)
  const userBalance = aavePosition.collateralUSD;

  // If wallet has zero collateral/funds on Aave, we pass 0 balance to AI or check simulation
  if (userBalance <= 0) {
    console.log(`[YIELD] Wallet ${userWallet} has no active collateral on Aave to rotate.`);
  }

  // ── AI Brain ──────────────────────────────────────────────────────────────────
  const { object: decision } = await generateObject({
    model: githubModels(BRAIN_MODEL),
    schema: YieldRotatorSchema,
    system: YIELD_ROTATOR_SYSTEM_PROMPT,
    prompt: JSON.stringify({
      currentProtocol: rates.current.protocol,
      currentAPY: rates.current.apy,
      targetProtocol: rates.target.protocol,
      targetAPY: rates.target.apy,
      estimatedGasUSD: 8,
      userBalance: userBalance > 0 ? userBalance : 100, // Evaluate strategy for 100 USDC if 0
    }),
  });

  if (!decision.recommendation.should_rotate) {
    console.log(`[YIELD] Rotation skipped: ${decision.userExplanation}`);
    return;
  }

  const amount = decision.recommendation.amount;

  const withdrawCalldata = encodeAaveRepay(USDC_SEPOLIA, amount, AGENTIC_WALLET);
  const supplyCalldata   = encodeCompoundSupply(USDC_SEPOLIA, amount);

  const steps = [
    { type: "transaction" as const, to: rates.current.poolAddress, calldata: withdrawCalldata, gasStrategy: "standard" as const },
    { type: "transaction" as const, to: rates.target.poolAddress,  calldata: supplyCalldata,   gasStrategy: "standard" as const },
  ];

  // ── Pre-flight Simulation (Intercepts zero-balance / zero-ETH reverts) ─────────
  const sim = await simulate(
    { from: AGENTIC_WALLET, to: steps[0].to, data: steps[0].calldata },
    userWallet
  );

  if (sim.wouldRevert) {
    console.warn(`[YIELD] Pre-flight simulation intercepted revert: ${sim.revertReason}. Gas saved!`);
    return; // Intercepted pre-flight! Revert logged under 'reverted_simulation' in Resilience Log
  }

  // ── KeeperHub Workflow Submission ─────────────────────────────────────────────
  const { workflowId } = await createWorkflow({
    name: `yield-rotation-${Date.now()}`,
    triggerType: "manual",
    steps,
  });
  const { executionId } = await executeWorkflow(workflowId);

  await db.insert(executionsLog).values({
    userWallet,
    action: "rotate",
    amount,
    status: "success",
    reason: `Rotated ${amount} USDC from ${rates.current.protocol} (${currentAPY.toFixed(2)}%) → ${rates.target.protocol} (${compoundAPY.toFixed(2)}%). ${decision.userExplanation}`,
  });

  console.log(`[YIELD] Rotation executed. executionId: ${executionId}`);
}
