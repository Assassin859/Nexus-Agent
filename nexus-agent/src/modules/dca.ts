import { generateObject } from "ai";
import { getBrainModel } from "../brain/provider.js";
import { DCASchema, DCA_SYSTEM_PROMPT } from "../brain/schemas.js";
import { db } from "../db/client.js";
import { activeWorkflows, executionsLog } from "../db/schema.js";
import { simulateErc20Action } from "../lib/simulate.js";
import { createWorkflow, executeWorkflow, pollExecutionUntilSettled, type WorkflowStep } from "../lib/mcp-client.js";
import { getProvider } from "../lib/rpc.js";
import { encodeUniswapSwap, UNISWAP_V3_ROUTER, USDC_SEPOLIA } from "../lib/calldata.js";
import { getAavePosition, getUsdcBalance } from "../lib/aave.js";
import { getAgenticWallet, getWalletContext } from "../lib/agentic-wallet.js";
import { getEthPriceUSD } from "../lib/price-feed.js";
import { resolveKeeperHubApiKey } from "../lib/user-context.js";
import { childLogger } from "../lib/logger.js";
import { eq, and, lt } from "drizzle-orm";
import { formatEther } from "ethers";

export async function run(userWallet: string, options?: { apiKey?: string }): Promise<void> {
  const context = getWalletContext(userWallet);
  if (!context || !context.signerWallet) return;

  const monitoredWallet = context.monitoredWallet;
  const log = childLogger({ module: "dca", wallet: monitoredWallet.slice(0, 8) });
  const effectiveKey = options?.apiKey || (await resolveKeeperHubApiKey(monitoredWallet));

  const workflow = await db.query.activeWorkflows.findFirst({
    where: and(
      eq(activeWorkflows.userWallet, context.monitoredWallet),
      eq(activeWorkflows.type, "dca"),
      eq(activeWorkflows.status, "active")
    ),
  });

  if (!workflow) {
    log.info("No active DCA workflow — skipping.");
    return;
  }

  // ── Check Signer USDC Balance ──────────────────────────────────────────────
  const signerUsdc = await getUsdcBalance(context.signerWallet);
  if (signerUsdc < workflow.amount) {
    log.warn({ signerUsdc, amountNeeded: workflow.amount }, "Signer wallet has insufficient USDC balance for DCA swap.");
    await db.insert(executionsLog).values({
      userWallet: context.monitoredWallet,
      action: "swap",
      amount: workflow.amount,
      status: "delayed",
      reason: `Signer wallet (${context.signerWallet.slice(0, 8)}) has insufficient USDC balance ($${signerUsdc.toFixed(2)} available, $${workflow.amount} needed)`,
    });
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
    model: getBrainModel(),
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
      userWallet: context.monitoredWallet,
      action: "swap",
      amount: workflow.amount,
      status: "delayed",
      reason: `Gas threshold exceeded ($${estimatedGasUSD.toFixed(2)}): ${decision.userExplanation}`,
      aiAnalysis: decision.analysis,
    });
    return;
  }

  // ── Step 1b: Stale Pending Lock Expiry & Active Guard (TTL 15m) ───────────
  const cutoff15m = new Date(Date.now() - 15 * 60 * 1000);
  const expiredPendingRows = await db.query.executionsLog.findMany({
    where: and(
      eq(executionsLog.userWallet, context.monitoredWallet),
      eq(executionsLog.action, "swap"),
      eq(executionsLog.status, "pending"),
      lt(executionsLog.timestamp, cutoff15m)
    ),
  });

  if (expiredPendingRows.length > 0) {
    for (const stale of expiredPendingRows) {
      await db.update(executionsLog)
        .set({ status: "reverted_chain", reason: "DCA swap pending lock expired (TTL 15m)" })
        .where(eq(executionsLog.id, stale.id));
    }
  }

  const activePendingTx = await db.query.executionsLog.findFirst({
    where: and(
      eq(executionsLog.userWallet, context.monitoredWallet),
      eq(executionsLog.action, "swap"),
      eq(executionsLog.status, "pending")
    ),
  });
  if (activePendingTx) {
    log.warn({ logId: activePendingTx.id }, "Active DCA swap pending transaction exists (<15m) — skipping.");
    return;
  }

  const maxSlippage = decision.recommendation.max_slippage_percentage ?? 0.5;
  // Send swapped ETH directly to monitored userWallet
  const calldata = encodeUniswapSwap(workflow.amount, context.monitoredWallet, maxSlippage, ethPriceUSD);

  const sim = await simulateErc20Action(
    context.signerWallet,
    context.monitoredWallet,
    USDC_SEPOLIA,
    UNISWAP_V3_ROUTER,
    workflow.amount,
    { from: context.signerWallet, to: UNISWAP_V3_ROUTER, data: calldata },
  );
  if (sim.wouldRevert) {
    log.warn("Simulation caught revert — recording resilience log.");
    await db.insert(executionsLog).values({
      userWallet: context.monitoredWallet,
      action: "swap",
      amount: workflow.amount,
      status: "reverted_simulation",
      reason: `Pre-flight simulation intercepted revert: Uniswap DCA swap of ${workflow.amount} USDC failed (${sim.revertReason || "Reverted"}). Zero gas wasted.`,
      aiAnalysis: decision.analysis,
    });
    return;
  }

  // Prepend ERC20 approval step for Uniswap router if needed
  const { allowanceCalldata } = sim;
  const steps: WorkflowStep[] = [];
  if (allowanceCalldata) {
    steps.push({ type: "transaction", to: USDC_SEPOLIA, calldata: allowanceCalldata, gasStrategy: "standard" });
  }
  steps.push({ type: "transaction", to: UNISWAP_V3_ROUTER, calldata, gasStrategy: "standard" });

  // Insert pending row before execution
  const [pendingRow] = await db.insert(executionsLog).values({
    userWallet: context.monitoredWallet,
    action: "swap",
    amount: Math.round(workflow.amount),
    status: "pending",
    reason: decision.userExplanation,
    aiAnalysis: decision.analysis,
  }).returning({ id: executionsLog.id });

  try {
    const { workflowId, isStub: createStub } = await createWorkflow({
      name: `dca-${monitoredWallet.slice(0, 8)}-${Date.now()}`,
      triggerType: "manual",
      steps,
    }, effectiveKey);
    const { executionId, isStub: execStub } = await executeWorkflow(workflowId, effectiveKey);
    const isStub = createStub || execStub;

    if (isStub) {
      await db.update(executionsLog)
        .set({
          status: "simulated_stub",
          reason: `DCA (Simulated Stub): ${decision.userExplanation}`,
          aiAnalysis: { ...decision.analysis, workflowId, executionId },
        })
        .where(eq(executionsLog.id, pendingRow.id));
    } else {
      const poll = await pollExecutionUntilSettled(executionId, effectiveKey);
      const finalStatus = poll.timedOut
        ? "reverted_chain"
        : poll.status === "mined" ? "success"
        : "reverted_chain";

      await db.update(executionsLog)
        .set({
          status: finalStatus,
          txHash: poll.txHash,
          reason: `DCA: ${workflow.amount} USDC → ETH via Uniswap V3. ${decision.userExplanation}`,
          aiAnalysis: { ...decision.analysis, workflowId, executionId, pollStatus: poll.status },
        })
        .where(eq(executionsLog.id, pendingRow.id));
    }

    log.info({ isStub }, `Swap executed: ${workflow.amount} USDC → ETH`);
  } catch (err) {
    await db.update(executionsLog)
      .set({ status: "reverted_chain", reason: `DCA execution failed: ${err instanceof Error ? err.message : String(err)}` })
      .where(eq(executionsLog.id, pendingRow.id));
  }
}
