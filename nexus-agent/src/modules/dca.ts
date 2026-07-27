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
const ETH_PRICE_USD  = 3500; // Approximate — in production fetch from price oracle

export async function run(userWallet: string): Promise<void> {
  // Check if DCA workflow is active for this wallet
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

  // ── Phase 2: Real gas price from RPC ─────────────────────────────────────────
  let estimatedGasUSD = 6; // Safe fallback
  try {
    const provider = await getProvider();
    const feeData = await provider.getFeeData();
    const gasPriceWei = feeData.gasPrice ?? 0n;
    // Estimate gas units for a typical swap (~150k)
    const estimatedGasUnits = 150_000n;
    const gasCostEth = Number(formatEther(gasPriceWei * estimatedGasUnits));
    estimatedGasUSD = gasCostEth * ETH_PRICE_USD;
    console.log(`[DCA] Real gas estimate: $${estimatedGasUSD.toFixed(2)} (${(gasPriceWei / 1_000_000_000n)}gwei)`);
  } catch (err) {
    console.warn("[DCA] Failed to fetch real gas price, using fallback:", err instanceof Error ? err.message : err);
  }

  // ── AI Brain: real gas input → real decision ──────────────────────────────────
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

  // ── Gas threshold check: delay if too expensive ───────────────────────────────
  if (!decision.recommendation.execute_swap) {
    console.log(`[DCA] Swap delayed ${decision.recommendation.delay_minutes}min: ${decision.userExplanation}`);
    await db.insert(executionsLog).values({
      userWallet,
      action: "swap",
      amount: workflow.amount,
      status: "reverted_simulation",
      reason: `Gas threshold exceeded ($${estimatedGasUSD.toFixed(2)}): ${decision.userExplanation}`,
    });
    return;
  }

  // ── Phase 3: Real Uniswap V3 swap calldata ────────────────────────────────────
  const calldata = encodeUniswapSwap(workflow.amount, AGENTIC_WALLET);

  // ── Pre-flight simulation ─────────────────────────────────────────────────────
  const sim = await simulate(
    { from: AGENTIC_WALLET, to: UNISWAP_V3_ROUTER, data: calldata },
    userWallet
  );
  if (sim.wouldRevert) {
    console.warn("[DCA] Simulation caught revert — aborting.");
    return;
  }

  // ── KeeperHub execution ───────────────────────────────────────────────────────
  const { workflowId } = await createWorkflow({
    name: `dca-${userWallet.slice(0, 8)}-${Date.now()}`,
    triggerType: "manual",
    steps: [{ type: "transaction", to: UNISWAP_V3_ROUTER, calldata, gasStrategy: "standard" }],
  });
  const { executionId } = await executeWorkflow(workflowId);

  // ── Write success to DB ───────────────────────────────────────────────────────
  await db.insert(executionsLog).values({
    userWallet,
    action: "swap",
    amount: workflow.amount,
    status: "success",
    reason: `DCA: ${workflow.amount} USDC → ETH via Uniswap V3. ${decision.userExplanation}`,
  });

  console.log(`[DCA] Swap executed. executionId: ${executionId}`);
}
