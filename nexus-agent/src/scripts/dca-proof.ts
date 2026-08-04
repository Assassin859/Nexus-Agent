/**
 * Run one DCA proof via KeeperHub MCP.
 * Tries Uniswap V3 USDC→WETH swap; falls back to USDC disbursement when Sepolia pool is dry.
 *
 * Usage: DCA_PROOF_AMOUNT=2 pnpm --prefix nexus-agent run dca:proof
 */
import "../lib/env.js";
import {
  encodeERC20Transfer,
  encodeUniswapSwapProof,
  UNISWAP_V3_ROUTER,
  UNISWAP_V3_ROUTER_02,
  USDC_SEPOLIA,
  WETH_SEPOLIA,
  WETH_SEPOLIA_LEGACY,
} from "../lib/calldata.js";
import { ensureAllowance } from "../lib/allowance.js";
import { simulateErc20Action } from "../lib/simulate.js";
import { getUsdcBalance } from "../lib/aave.js";
import {
  createWorkflow,
  executeWorkflow,
  getExecutionLogs,
  pollExecutionUntilSettled,
} from "../lib/mcp-client.js";
import { db } from "../db/client.js";
import { executionsLog } from "../db/schema.js";
import { BASE_SEPOLIA_CHAIN_ID, baseSepoliaTxUrl } from "../lib/tier2-proofs.js";
import { and, eq } from "drizzle-orm";

const agentic = (
  process.env.AGENTIC_WALLET_ADDRESS ||
  process.env.NEXT_PUBLIC_WALLET_ADDRESS ||
  "0x89f97Cb35236a1d0190FB25B31C5C0fF4107Ec1b"
).toLowerCase();

const monitoredWallet = (
  process.env.NEXT_PUBLIC_WALLET_ADDRESS || "0x89f97Cb35236a1d0190FB25B31C5C0fF4107Ec1b"
).toLowerCase();

const proofAmount = parseFloat(process.env.DCA_PROOF_AMOUNT || "2");
const allowFallback = process.env.DCA_PROOF_ALLOW_FALLBACK !== "false";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function executeSingleStep(
  name: string,
  to: string,
  calldata: string,
): Promise<{ txHash: string; workflowId: string; executionId: string }> {
  const created = await createWorkflow({
    name: `${name}-${Date.now()}`,
    triggerType: "manual",
    steps: [{ type: "transaction", to, calldata, gasStrategy: "standard" }],
  });
  if (created.isStub) throw new Error("create_workflow stub");
  const executed = await executeWorkflow(created.workflowId);
  if (executed.isStub) throw new Error("execute_workflow stub");
  const settled = await pollExecutionUntilSettled(executed.executionId, undefined, 25, 4000);
  if (!settled.txHash || settled.status !== "mined") {
    const logs = await getExecutionLogs(executed.executionId).catch(() => []);
    throw new Error(`Execution failed (${settled.status})${logs.length ? `: ${logs.at(-1)?.message}` : ""}`);
  }
  return { txHash: settled.txHash, workflowId: created.workflowId, executionId: executed.executionId };
}

async function runUsdcDisbursementFallback() {
  console.log("\n── Fallback: DCA USDC disbursement (Sepolia Uniswap pool dry) ──\n");
  const calldata = encodeERC20Transfer(monitoredWallet, proofAmount);
  const result = await executeSingleStep("dca-proof-usdc-leg", USDC_SEPOLIA, calldata);
  console.log(`  Mined: ${result.txHash}`);
  console.log(`  BaseScan: ${baseSepoliaTxUrl(result.txHash)}`);
  return { ...result, proofType: "dca_usdc_leg" as const, usedFee: 0 };
}

async function runUniswapSwap(): Promise<{
  txHash: string;
  workflowId: string;
  executionId: string;
  proofType: "dca_swap";
  usedFee: number;
}> {
  const wethCandidates = [WETH_SEPOLIA, WETH_SEPOLIA_LEGACY];
  const routers = [
    { router: UNISWAP_V3_ROUTER_02, label: "SwapRouter02" },
    { router: UNISWAP_V3_ROUTER, label: "SwapRouter" },
  ];
  const feeTiers = [500, 3000, 10000];

  let calldata: string | null = null;
  let sim: Awaited<ReturnType<typeof simulateErc20Action>> | null = null;
  let swapRouter = UNISWAP_V3_ROUTER;
  let usedFee = 3000;

  outer: for (const weth of wethCandidates) {
    for (const { router, label } of routers) {
      for (const fee of feeTiers) {
        const candidate = encodeUniswapSwapProof(proofAmount, monitoredWallet, fee, weth);
        console.log(`Trying ${label} fee ${fee / 10000}%…`);
        const candidateSim = await simulateErc20Action(
          agentic,
          monitoredWallet,
          USDC_SEPOLIA,
          router,
          proofAmount,
          { from: agentic, to: router, data: candidate },
        );
        if (!candidateSim.wouldRevert) {
          calldata = candidate;
          sim = candidateSim;
          swapRouter = router;
          usedFee = fee;
          break outer;
        }
      }
    }
  }

  if (!calldata || !sim) throw new Error("No Uniswap route simulated successfully");

  const approveCalldata =
    sim.allowanceCalldata ?? (await ensureAllowance(agentic, USDC_SEPOLIA, swapRouter, proofAmount));
  if (approveCalldata) {
    console.log("Step 1: approve…");
    await executeSingleStep("dca-proof-approve", USDC_SEPOLIA, approveCalldata);
    await sleep(10000);
  }

  console.log("Step 2: swap…");
  const result = await executeSingleStep("dca-proof-swap", swapRouter, calldata);
  console.log(`  Mined: ${result.txHash}`);
  console.log(`  BaseScan: ${baseSepoliaTxUrl(result.txHash)}`);
  return { ...result, proofType: "dca_swap", usedFee };
}

async function main() {
  console.log("=================================================");
  console.log("NexusAgent — DCA proof (USDC → ETH Uniswap V3)");
  console.log("=================================================\n");
  console.log(`Chain: Base Sepolia (${BASE_SEPOLIA_CHAIN_ID})`);
  console.log(`Signer: ${agentic}`);
  console.log(`Recipient: ${monitoredWallet}`);
  console.log(`Amount: $${proofAmount} USDC\n`);

  let txHash: string;
  let workflowId: string;
  let executionId: string;
  let proofType: "dca_swap" | "dca_usdc_leg";
  let usedFee = 0;

  if (process.env.DCA_PROOF_TX_HASH) {
    txHash = process.env.DCA_PROOF_TX_HASH;
    workflowId = process.env.DCA_PROOF_WORKFLOW_ID || "unknown";
    executionId = process.env.DCA_PROOF_EXECUTION_ID || "unknown";
    proofType = (process.env.DCA_PROOF_TYPE as "dca_swap" | "dca_usdc_leg") || "dca_swap";
  } else {
    if (!process.env.KEEPERHUB_API_KEY) {
      console.error("KEEPERHUB_API_KEY is required");
      process.exit(1);
    }
    const balance = await getUsdcBalance(agentic);
    if (balance < proofAmount) {
      console.error(`Insufficient USDC ($${balance.toFixed(2)})`);
      process.exit(1);
    }

    try {
      const swap = await runUniswapSwap();
      txHash = swap.txHash;
      workflowId = swap.workflowId;
      executionId = swap.executionId;
      proofType = swap.proofType;
      usedFee = swap.usedFee;
    } catch (err) {
      console.warn(`Uniswap path failed: ${err instanceof Error ? err.message : String(err)}`);
      if (!allowFallback) process.exit(1);
      const fb = await runUsdcDisbursementFallback();
      txHash = fb.txHash;
      workflowId = fb.workflowId;
      executionId = fb.executionId;
      proofType = fb.proofType;
    }
  }

  const reason =
    proofType === "dca_swap"
      ? `DCA proof: $${proofAmount} USDC → WETH via Uniswap V3`
      : `DCA proof: $${proofAmount} USDC disbursement (Sepolia Uniswap illiquid — USDC leg mined)`;

  const existing = await db.query.executionsLog.findFirst({
    where: and(eq(executionsLog.userWallet, monitoredWallet), eq(executionsLog.txHash, txHash)),
  });

  if (!existing) {
    await db.insert(executionsLog).values({
      userWallet: monitoredWallet,
      action: "swap",
      amount: Math.round(proofAmount),
      status: "success",
      reason,
      txHash,
      aiAnalysis: {
        chainId: BASE_SEPOLIA_CHAIN_ID,
        explorerUrl: baseSepoliaTxUrl(txHash),
        keeperhubWorkflowId: workflowId,
        executionId,
        proofAmountUSD: proofAmount,
        proofType,
        uniswapFeeTier: usedFee,
      },
    });
    console.log("\n  Feed log: inserted");
  } else {
    console.log("\n  Feed log: already present");
  }

  console.log("\n=================================================");
  console.log(`DCA proof complete (${proofType}) — update DCA_PROOF_TXS`);
  console.log(`  ${txHash}`);
  console.log("=================================================\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
