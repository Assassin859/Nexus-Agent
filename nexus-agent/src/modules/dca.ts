import { generateObject } from "ai";
import { githubModels, BRAIN_MODEL } from "../brain/provider.js";
import { DCASchema, DCA_SYSTEM_PROMPT } from "../brain/schemas.js";
import { db } from "../db/client.js";
import { activeWorkflows, executionsLog } from "../db/schema.js";
import { simulate } from "../lib/simulate.js";
import { createWorkflow, executeWorkflow, pollExecutionUntilSettled } from "../lib/mcp-client.js";
import { getProvider } from "../lib/rpc.js";
import { encodeUniswapSwap, UNISWAP_V3_ROUTER } from "../lib/calldata.js";
import { getEthPriceUSD } from "../lib/price-feed.js";
import { getAgenticWallet } from "../lib/agentic-wallet.js";
import { resolveKeeperHubApiKey } from "../lib/user-context.js";
import { childLogger } from "../lib/logger.js";
import { eq, and } from "drizzle-orm";
import { formatEther } from "ethers";

export async function run(userWallet: string, options?: { apiKey?: string }): Promise<void> {
  const AGENTIC_WALLET = getAgenticWallet();
  if (!AGENTIC_WALLET) return; // dev-only early exit; prod throws at startup

  const log = childLogger({ module: "dca", wallet: userWallet.slice(0, 8) });
  const effectiveKey = options?.apiKey || (await resolveKeeperHubApiKey(userWallet));

  const workflow = await db.query.activeWorkflows.findFirst({
    where: and(
      eq(activeWorkflows.userWallet, userWallet),
      eq(activeWorkflows.type, "dca"),
      eq(activeWorkflows.status, "active")
    ),
  });

  if (!workflow) {
    log.info("No active DCA workflow — skipping.");
    return;
  }

  // ── Fetch provider once; resolve gas + ETH price in parallel ────────────────
  // Separate try/catch per concern so a gas RPC failure doesn't block a good price.
  const provider = await getProvider();

  let estimatedGasUSD = Number(process.env.ESTIMATED_GAS_USD_FALLBACK) || 6;
  let ethPriceUSD = Number(process.env.ETH_PRICE_USD_FALLBACK) || 3000;

  const [gasFee, livePrice] = await Promise.allSettled([
    provider.getFeeData(),
    getEthPriceUSD(),
  ]);

  // Resolve live price first — needed for gas USD calculation below
  if (livePrice.status === "fulfilled") {
    ethPriceUSD = livePrice.value;
  }

  if (gasFee.status === "fulfilled") {
    const gasPriceWei = gasFee.value.gasPrice ?? 0n;
    const gasCostEth = Number(formatEther(gasPriceWei * 150_000n));
    estimatedGasUSD = gasCostEth * ethPriceUSD;
    log.info({ estimatedGasUSD: estimatedGasUSD.toFixed(2), gasPriceGwei: String(gasPriceWei / 1_000_000_000n) }, "Real gas estimate");
  } else {
    log.warn({ reason: (gasFee.reason as Error)?.message }, "Failed to fetch gas price — using fallback");
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
    log.info({ delayMin: decision.recommendation.delay_minutes }, `Swap delayed: ${decision.userExplanation}`);
    await db.insert(executionsLog).values({
      userWallet,
      action: "swap",
      amount: workflow.amount,
      status: "delayed",
      reason: `Gas threshold exceeded ($${estimatedGasUSD.toFixed(2)}): ${decision.userExplanation}`,
      aiAnalysis: decision.analysis,
    });
    return;
  }

  const maxSlippage = decision.recommendation.max_slippage_percentage ?? 0.5;
  const calldata = encodeUniswapSwap(workflow.amount, AGENTIC_WALLET, maxSlippage, ethPriceUSD);

  const sim = await simulate(
    { from: AGENTIC_WALLET, to: UNISWAP_V3_ROUTER, data: calldata },
    userWallet
  );
  if (sim.wouldRevert) {
    log.warn("Simulation caught revert — aborting swap.");
    return;
  }

  const { workflowId, isStub: createStub } = await createWorkflow({
    name: `dca-${userWallet.slice(0, 8)}-${Date.now()}`,
    triggerType: "manual",
    steps: [{ type: "transaction", to: UNISWAP_V3_ROUTER, calldata, gasStrategy: "standard" }],
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
    action: "swap",
    amount: Math.round(workflow.amount),
    status: finalStatus,
    txHash,
    reason: `DCA: ${workflow.amount} USDC → ETH via Uniswap V3. ${decision.userExplanation}`,
    aiAnalysis: { ...decision.analysis, executionId: executionIdForLog },
  });

  log.info({ executionId, isStub, finalStatus }, `Swap executed: ${workflow.amount} USDC → ETH`);
}
