import { generateObject } from "ai";
import { githubModels, BRAIN_MODEL } from "../brain/provider.js";
import { DCASchema, DCA_SYSTEM_PROMPT } from "../brain/schemas.js";
import { db } from "../db/client.js";
import { activeWorkflows, executionsLog } from "../db/schema.js";
import { simulate } from "../lib/simulate.js";
import { createWorkflow, executeWorkflow } from "../lib/mcp-client.js";
import { getProvider } from "../lib/rpc.js";
import { encodeUniswapSwap, UNISWAP_V3_ROUTER } from "../lib/calldata.js";
import { eq, and } from "drizzle-orm";
import { formatEther } from "ethers";

const AGENTIC_WALLET = process.env.AGENTIC_WALLET_ADDRESS || "0x0000000000000000000000000000000000000000";
const ETH_PRICE_USD  = 3500;

export async function run(userWallet: string): Promise<void> {
  const workflow = await db.query.activeWorkflows.findFirst({
    where: and(
      eq(activeWorkflows.userWallet, userWallet),
      eq(activeWorkflows.type, "dca"),
      eq(activeWorkflows.status, "active")
    ),
  });

  if (!workflow) {
    console.log("[DCA] No active DCA workflow for wallet:", userWallet);
    return;
  }

  let estimatedGasUSD = 6;
  try {
    const provider = await getProvider();
    const feeData = await provider.getFeeData();
    const gasPriceWei = feeData.gasPrice ?? 0n;
    const estimatedGasUnits = 150_000n;
    const gasCostEth = Number(formatEther(gasPriceWei * estimatedGasUnits));
    estimatedGasUSD = gasCostEth * ETH_PRICE_USD;
    console.log(`[DCA] Real gas estimate: $${estimatedGasUSD.toFixed(2)} (${(gasPriceWei / 1_000_000_000n)}gwei)`);
  } catch (err) {
    console.warn("[DCA] Failed to fetch real gas price, using fallback:", err instanceof Error ? err.message : err);
  }

  const { object: decision } = await generateObject({
    model: githubModels(BRAIN_MODEL),
    schema: DCASchema,
    system: DCA_SYSTEM_PROMPT,
    prompt: JSON.stringify({
      purchaseAmountUSD: workflow.amount,
      estimatedGasUSD: parseFloat(estimatedGasUSD.toFixed(2)),
      sourceAsset: "USDC",
      targetAsset: "ETH",
    }),
  });

  if (!decision.recommendation.execute_swap) {
    console.log(`[DCA] Swap delayed ${decision.recommendation.delay_minutes}min: ${decision.userExplanation}`);
    await db.insert(executionsLog).values({
      userWallet,
      action: "swap",
      amount: workflow.amount,
      status: "reverted_simulation",
      reason: `Gas threshold exceeded ($${estimatedGasUSD.toFixed(2)}): ${decision.userExplanation}`,
      aiAnalysis: decision.analysis,
    });
    return;
  }

  const maxSlippage = decision.recommendation.max_slippage_percentage ?? 0.5;
  const calldata = encodeUniswapSwap(workflow.amount, AGENTIC_WALLET, maxSlippage);

  const sim = await simulate(
    { from: AGENTIC_WALLET, to: UNISWAP_V3_ROUTER, data: calldata },
    userWallet
  );
  if (sim.wouldRevert) {
    console.warn("[DCA] Simulation caught revert — aborting.");
    return;
  }

  const { workflowId, isStub: createStub } = await createWorkflow({
    name: `dca-${userWallet.slice(0, 8)}-${Date.now()}`,
    triggerType: "manual",
    steps: [{ type: "transaction", to: UNISWAP_V3_ROUTER, calldata, gasStrategy: "standard" }],
  });
  const { executionId, isStub: execStub } = await executeWorkflow(workflowId);
  const isStub = createStub || execStub;

  await db.insert(executionsLog).values({
    userWallet,
    action: "swap",
    amount: workflow.amount,
    status: isStub ? "simulated_stub" : "success",
    reason: `DCA: ${workflow.amount} USDC → ETH via Uniswap V3. ${decision.userExplanation}`,
    aiAnalysis: decision.analysis,
  });

  console.log(`[DCA] Swap executed. executionId: ${executionId}`);
}
