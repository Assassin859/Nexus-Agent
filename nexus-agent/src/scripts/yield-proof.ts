/**
 * Yield rotator proof: Aave → Compound rotates (+ optional prepare/reverse).
 *
 * Usage:
 *   pnpm --prefix nexus-agent run yield:proof:prepare
 *   YIELD_PROOF_ROUNDS=3 pnpm --prefix nexus-agent run yield:proof
 *   pnpm --prefix nexus-agent exec tsx src/scripts/yield-proof.ts --dry-run
 */
import "../lib/env.js";
import {
  createWorkflow,
  executeWorkflow,
  pollExecutionUntilSettled,
  type WorkflowStep,
} from "../lib/mcp-client.js";
import {
  AAVE_V3_POOL,
  COMPOUND_V3_USDC,
  USDC_SEPOLIA,
  encodeAaveSupply,
  encodeAaveWithdraw,
  encodeCompoundSupply,
  encodeCompoundWithdraw,
} from "../lib/calldata.js";
import { ensureAllowance } from "../lib/allowance.js";
import { simulate } from "../lib/simulate.js";
import { getAavePosition, getUsdcBalance } from "../lib/aave.js";
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

const proofAmount = parseFloat(process.env.YIELD_PROOF_AMOUNT || "1.5");
const prepareAmount = parseFloat(process.env.YIELD_PREPARE_SUPPLY_USD || "10");
const rounds = parseInt(process.env.YIELD_PROOF_ROUNDS || "3", 10);

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const prepareOnly = args.includes("--prepare");

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function simulateSteps(steps: WorkflowStep[], label: string): Promise<boolean> {
  console.log(`  Simulating ${label} (${steps.length} step(s))...`);
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const sim = await simulate(
      { from: agentic, to: step.to, data: step.calldata },
      monitoredWallet,
    );
    if (sim.wouldRevert) {
      console.error(`    Step ${i + 1} would revert: ${sim.revertReason || "unknown"}`);
      return false;
    }
  }
  console.log(`    ${label}: OK`);
  return true;
}

async function buildForwardSteps(amount: number): Promise<WorkflowStep[]> {
  const withdrawCalldata = encodeAaveWithdraw(USDC_SEPOLIA, amount, agentic);
  const supplyCalldata = encodeCompoundSupply(USDC_SEPOLIA, amount);
  const allowanceCalldata = await ensureAllowance(agentic, USDC_SEPOLIA, COMPOUND_V3_USDC, amount);

  const steps: WorkflowStep[] = [
    { type: "transaction", to: AAVE_V3_POOL, calldata: withdrawCalldata, gasStrategy: "standard" },
  ];
  if (allowanceCalldata) {
    steps.push({ type: "transaction", to: USDC_SEPOLIA, calldata: allowanceCalldata, gasStrategy: "standard" });
  }
  steps.push({ type: "transaction", to: COMPOUND_V3_USDC, calldata: supplyCalldata, gasStrategy: "standard" });
  return steps;
}

async function buildReverseSteps(amount: number): Promise<WorkflowStep[]> {
  const withdrawCalldata = encodeCompoundWithdraw(USDC_SEPOLIA, amount);
  const supplyCalldata = encodeAaveSupply(USDC_SEPOLIA, amount, agentic);
  const allowanceCalldata = await ensureAllowance(agentic, USDC_SEPOLIA, AAVE_V3_POOL, amount);

  const steps: WorkflowStep[] = [
    { type: "transaction", to: COMPOUND_V3_USDC, calldata: withdrawCalldata, gasStrategy: "standard" },
  ];
  if (allowanceCalldata) {
    steps.push({ type: "transaction", to: USDC_SEPOLIA, calldata: allowanceCalldata, gasStrategy: "standard" });
  }
  steps.push({ type: "transaction", to: AAVE_V3_POOL, calldata: supplyCalldata, gasStrategy: "standard" });
  return steps;
}

async function buildPrepareSteps(amount: number): Promise<WorkflowStep[]> {
  const supplyCalldata = encodeAaveSupply(USDC_SEPOLIA, amount, agentic);
  const allowanceCalldata = await ensureAllowance(agentic, USDC_SEPOLIA, AAVE_V3_POOL, amount);

  const steps: WorkflowStep[] = [];
  if (allowanceCalldata) {
    steps.push({ type: "transaction", to: USDC_SEPOLIA, calldata: allowanceCalldata, gasStrategy: "standard" });
  }
  steps.push({ type: "transaction", to: AAVE_V3_POOL, calldata: supplyCalldata, gasStrategy: "standard" });
  return steps;
}

async function executeProofWorkflow(
  steps: WorkflowStep[],
  namePrefix: string,
): Promise<{ txHash: string; workflowId: string; executionId: string } | null> {
  if (dryRun) return null;

  if (!process.env.KEEPERHUB_API_KEY) {
    console.error("KEEPERHUB_API_KEY is required");
    process.exit(1);
  }

  const created = await createWorkflow({
    name: `${namePrefix}-${Date.now()}`,
    triggerType: "manual",
    steps,
    mevProtected: true,
  });

  if (created.isStub) {
    console.error("create_workflow stub — check KEEPERHUB_API_KEY");
    process.exit(1);
  }

  console.log(`  Workflow: ${created.workflowId}`);
  const executed = await executeWorkflow(created.workflowId);
  if (executed.isStub) {
    console.error("execute_workflow stub");
    process.exit(1);
  }

  console.log(`  Execution: ${executed.executionId} — polling...`);
  const settled = await pollExecutionUntilSettled(executed.executionId, undefined, 25, 4000);
  console.log(`  Status: ${settled.status}${settled.timedOut ? " (timeout)" : ""}`);

  if (!settled.txHash || settled.status !== "mined") {
    console.error("  ❌ No mined tx");
    return null;
  }

  console.log(`  Tx: ${settled.txHash}`);
  console.log(`  BaseScan: ${baseSepoliaTxUrl(settled.txHash)}`);

  return {
    txHash: settled.txHash,
    workflowId: created.workflowId,
    executionId: executed.executionId,
  };
}

async function logRotateProof(
  txHash: string,
  round: number,
  workflowId: string,
  executionId: string,
  amount: number,
): Promise<void> {
  const existing = await db.query.executionsLog.findFirst({
    where: and(
      eq(executionsLog.userWallet, monitoredWallet),
      eq(executionsLog.txHash, txHash),
    ),
  });
  if (existing) {
    console.log("  Feed log: already present");
    return;
  }

  await db.insert(executionsLog).values({
    userWallet: monitoredWallet,
    action: "rotate",
    amount: Math.round(amount),
    status: "success",
    reason: `Yield rotate proof round ${round}: Aave V3 → Compound V3 ($${amount} USDC)`,
    txHash,
    aiAnalysis: {
      chainId: BASE_SEPOLIA_CHAIN_ID,
      explorerUrl: baseSepoliaTxUrl(txHash),
      keeperhubWorkflowId: workflowId,
      executionId,
      proofAmountUSD: amount,
      proofRound: round,
      proofType: "yield_rotate",
      agenticWallet: agentic,
    },
  });
  console.log("  Feed log: inserted");
}

async function runPrepare(): Promise<void> {
  console.log("\n── Prepare: supply USDC to Aave on agentic wallet ──\n");

  const position = await getAavePosition(agentic);
  console.log(`Aave USDC supplied on agentic: $${position.usdcSuppliedUSD.toFixed(2)}`);

  if (position.usdcSuppliedUSD >= proofAmount * rounds + 1) {
    console.log("Sufficient Aave supply — skip prepare");
    return;
  }

  const walletUsdc = await getUsdcBalance(agentic);
  console.log(`Agentic wallet USDC: $${walletUsdc.toFixed(2)}`);
  if (walletUsdc < prepareAmount) {
    console.error(`Need ~$${prepareAmount} USDC on agentic wallet for prepare`);
    process.exit(1);
  }

  const steps = await buildPrepareSteps(prepareAmount);
  if (!(await simulateSteps(steps, "Aave supply prepare"))) {
    process.exit(1);
  }
  if (dryRun) {
    console.log("Dry run — would supply to Aave");
    return;
  }

  const result = await executeProofWorkflow(steps, "yield-prepare-supply");
  if (!result) process.exit(1);
  await sleep(15000);
  const after = await getAavePosition(agentic);
  console.log(`After prepare — Aave USDC supplied: $${after.usdcSuppliedUSD.toFixed(2)}`);
}

async function runRounds(): Promise<string[]> {
  console.log(`\n── Yield rotate proofs (${rounds} round(s) @ $${proofAmount} each) ──\n`);
  const txHashes: string[] = [];

  for (let round = 1; round <= rounds; round++) {
    console.log(`\nRound ${round}/${rounds} — forward rotate (Aave → Compound)`);

    const position = await getAavePosition(agentic);
    if (position.usdcSuppliedUSD < proofAmount) {
      console.error(`Insufficient Aave supply ($${position.usdcSuppliedUSD.toFixed(2)}) — run --prepare first`);
      process.exit(1);
    }

    const forwardSteps = await buildForwardSteps(proofAmount);
    if (!(await simulateSteps(forwardSteps, `forward rotate r${round}`))) {
      process.exit(1);
    }

    if (dryRun) {
      console.log("  Dry run — would execute forward rotate");
    } else {
      const result = await executeProofWorkflow(forwardSteps, `yield-rotate-r${round}`);
      if (!result) process.exit(1);
      await logRotateProof(result.txHash, round, result.workflowId, result.executionId, proofAmount);
      txHashes.push(result.txHash);
      await sleep(15000);
    }

    if (round < rounds) {
      console.log(`\nRound ${round} — reverse (Compound → Aave) for next round`);
      const reverseSteps = await buildReverseSteps(proofAmount);
      if (!(await simulateSteps(reverseSteps, `reverse r${round}`))) {
        process.exit(1);
      }
      if (!dryRun) {
        const rev = await executeProofWorkflow(reverseSteps, `yield-reverse-r${round}`);
        if (!rev) process.exit(1);
        await sleep(15000);
      }
    }
  }

  return txHashes;
}

async function main() {
  console.log("=================================================");
  console.log("NexusAgent — Yield rotate proof (Aave → Compound)");
  console.log("=================================================\n");
  console.log(`Chain: Base Sepolia (${BASE_SEPOLIA_CHAIN_ID})`);
  console.log(`Agentic signer: ${agentic}`);
  console.log(`Feed wallet (monitored): ${monitoredWallet}`);
  if (dryRun) console.log("Mode: DRY RUN (simulate only)\n");

  if (prepareOnly) {
    await runPrepare();
    return;
  }

  const position = await getAavePosition(agentic);
  if (position.usdcSuppliedUSD < proofAmount) {
    console.log("Insufficient Aave supply — running prepare first...");
    await runPrepare();
  }

  const hashes = await runRounds();

  console.log("\n=================================================");
  console.log(`Yield proof complete — ${hashes.length} mined rotate tx(s)`);
  if (hashes.length) {
    console.log("Update YIELD_PROOF_TXS in tier2-proofs.ts with:");
    hashes.forEach((h, i) => console.log(`  round ${i + 1}: ${h}`));
  }
  console.log("=================================================\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
