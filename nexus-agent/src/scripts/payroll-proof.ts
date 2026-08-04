/**
 * Run one PayChain USDC payroll proof via KeeperHub MCP (manual trigger).
 * Prerequisites: AGENTIC_WALLET funded with USDC on Base Sepolia.
 *
 * Usage: pnpm --prefix nexus-agent run payroll:proof
 */
import "../lib/env.js";
import {
  createWorkflow,
  executeWorkflow,
  pollExecutionUntilSettled,
} from "../lib/mcp-client.js";
import { encodeERC20Transfer, USDC_SEPOLIA } from "../lib/calldata.js";
import { verifyPayrollTransfer } from "../lib/independent-payroll-verify.js";
import { DEMO_PAYROLL_RECIPIENTS } from "../lib/demo-addresses.js";
import { db } from "../db/client.js";
import { executionsLog } from "../db/schema.js";
import { BASE_SEPOLIA_CHAIN_ID, baseSepoliaTxUrl } from "../lib/tier2-proofs.js";
import { and, eq } from "drizzle-orm";

const agentic =
  process.env.AGENTIC_WALLET_ADDRESS ||
  process.env.NEXT_PUBLIC_WALLET_ADDRESS ||
  "0x89f97Cb35236a1d0190FB25B31C5C0fF4107Ec1b";

const monitoredWallet = (
  process.env.NEXT_PUBLIC_WALLET_ADDRESS || "0x89f97Cb35236a1d0190FB25B31C5C0fF4107Ec1b"
).toLowerCase();

const proofAmount = parseFloat(process.env.PAYROLL_PROOF_AMOUNT || "0.01");
const recipient = DEMO_PAYROLL_RECIPIENTS[0].address;

async function main() {
  console.log("=================================================");
  console.log("NexusAgent — PayChain payroll proof (USDC transfer)");
  console.log("=================================================\n");
  console.log(`Chain: Base Sepolia (${BASE_SEPOLIA_CHAIN_ID})`);
  console.log(`Signer: ${agentic}`);
  console.log(`Recipient: ${recipient}`);
  console.log(`Amount: $${proofAmount} USDC\n`);

  const backfillTx = process.env.PAYROLL_PROOF_TX_HASH;
  let txHash: string;
  let workflowId = process.env.PAYROLL_PROOF_WORKFLOW_ID || "unknown";
  let executionId = process.env.PAYROLL_PROOF_EXECUTION_ID || "unknown";

  if (backfillTx) {
    txHash = backfillTx;
    console.log(`Backfill mode — using tx ${txHash}\n`);
  } else {
    if (!process.env.KEEPERHUB_API_KEY) {
      console.error("KEEPERHUB_API_KEY is required");
      process.exit(1);
    }

    const calldata = encodeERC20Transfer(recipient, proofAmount);

    console.log("Creating payroll proof workflow...");
    const created = await createWorkflow({
      name: `payroll-proof-${Date.now()}`,
      triggerType: "manual",
      steps: [{ type: "transaction", to: USDC_SEPOLIA, calldata, gasStrategy: "standard" }],
    });

    if (created.isStub) {
      console.error("create_workflow stub — check KEEPERHUB_API_KEY");
      process.exit(1);
    }
    workflowId = created.workflowId;

    console.log(`Workflow: ${workflowId}`);
    console.log(`  https://app.keeperhub.com/workflows/${workflowId}\n`);

    console.log("Executing workflow...");
    const executed = await executeWorkflow(workflowId);
    if (executed.isStub) {
      console.error("execute_workflow stub");
      process.exit(1);
    }
    executionId = executed.executionId;
    console.log(`Execution: ${executionId}`);

    console.log("\nPolling execution status...");
    const settled = await pollExecutionUntilSettled(executionId, undefined, 20, 4000);
    console.log(`  Status: ${settled.status}${settled.timedOut ? " (timeout)" : ""}`);
    if (settled.txHash) {
      console.log(`  Tx hash: ${settled.txHash}`);
      console.log(`  BaseScan: ${baseSepoliaTxUrl(settled.txHash)}`);
    }

    if (settled.status !== "mined" && !settled.txHash) {
      console.error("\n❌ No mined payroll tx — fund agentic wallet with USDC on Base Sepolia first.");
      process.exit(1);
    }

    txHash = settled.txHash!;
  }

  const independentVerification = await verifyPayrollTransfer({
    txHash,
    from: agentic,
    to: recipient,
    amountUSD: proofAmount,
  });
  console.log(`  Independent verify: ${independentVerification.verified ? "RPC verified" : independentVerification.discrepancy}`);

  const existing = await db.query.executionsLog.findFirst({
    where: and(
      eq(executionsLog.userWallet, monitoredWallet),
      eq(executionsLog.txHash, txHash),
    ),
  });

  if (existing) {
    console.log("\n  Feed log: already present in executions_log");
  } else {
    await db.insert(executionsLog).values({
      userWallet: monitoredWallet,
      action: "payroll",
      amount: 0,
      status: "success",
      reason: `PayChain USDC payroll proof ($${proofAmount} manual one-shot)`,
      txHash,
      aiAnalysis: {
        chainId: BASE_SEPOLIA_CHAIN_ID,
        explorerUrl: baseSepoliaTxUrl(txHash),
        keeperhubWorkflowId: workflowId,
        executionId,
        recipientAddress: recipient,
        proofAmountUSD: proofAmount,
        independentVerification,
      },
    });
    console.log("\n  Feed log: inserted in executions_log");
  }

  console.log("\n=================================================");
  console.log("Payroll proof complete — add tx link to README if not already listed");
  console.log("=================================================\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
