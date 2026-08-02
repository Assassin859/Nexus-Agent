/**
 * Run one Tempo Moderato transfer-with-memo proof via KeeperHub MCP.
 * Prerequisites: AGENTIC_WALLET funded on chain 42431 — see submission_runbook.md § Tempo funding.
 *
 * Usage: pnpm --prefix nexus-agent run tempo:proof
 */
import "../lib/env.js";
import {
  createWorkflowRaw,
  executeWorkflow,
  getExecutionLogs,
  pollExecutionUntilSettled,
} from "../lib/mcp-client.js";
import {
  buildTempoProofWorkflowGraph,
  TEMPO_PROOF_MEMO,
  TEMPO_PROOF_WORKFLOW_NAME,
  TEMPO_TESTNET_CHAIN,
} from "../lib/tempo-proof-workflow.js";
import { logExternalExecution } from "../lib/log-external-execution.js";
import { TEMPO_CHAIN_ID, tempoTxUrl } from "../lib/tier2-proofs.js";

const agentic =
  process.env.AGENTIC_WALLET_ADDRESS ||
  process.env.NEXT_PUBLIC_WALLET_ADDRESS ||
  "0x89f97Cb35236a1d0190FB25B31C5C0fF4107Ec1b";

const monitoredWallet = (
  process.env.NEXT_PUBLIC_WALLET_ADDRESS || "0x89f97Cb35236a1d0190FB25B31C5C0fF4107Ec1b"
).toLowerCase();

async function main() {
  console.log("=================================================");
  console.log("NexusAgent — Tempo Moderato proof (transfer-with-memo)");
  console.log("=================================================\n");
  console.log(`Chain: ${TEMPO_TESTNET_CHAIN} (Moderato testnet)`);
  console.log(`Signer: ${agentic}`);
  console.log(`Explorer: https://explore.testnet.tempo.xyz\n`);

  if (!process.env.KEEPERHUB_API_KEY) {
    console.error("KEEPERHUB_API_KEY is required");
    process.exit(1);
  }

  const graph = buildTempoProofWorkflowGraph({
    recipientAddress: agentic,
    amount: process.env.TEMPO_PROOF_AMOUNT || "0.01",
    memo: TEMPO_PROOF_MEMO,
  });

  console.log("Creating Tempo proof workflow...");
  const { workflowId, isStub } = await createWorkflowRaw({
    name: `${TEMPO_PROOF_WORKFLOW_NAME} ${Date.now()}`,
    description: "Minimal Tempo transfer-with-memo attestation for NexusAgent hackathon proof",
    nodes: graph.nodes,
    edges: graph.edges,
    enabled: false,
  });

  if (isStub) {
    console.error("create_workflow stub — check KEEPERHUB_API_KEY");
    process.exit(1);
  }

  console.log(`Workflow: ${workflowId}`);
  console.log(`  https://app.keeperhub.com/workflows/${workflowId}\n`);

  console.log("Executing workflow...");
  const { executionId, isStub: execStub } = await executeWorkflow(workflowId);
  if (execStub) {
    console.error("execute_workflow stub");
    process.exit(1);
  }
  console.log(`Execution: ${executionId}`);

  console.log("\nPolling execution status...");
  const settled = await pollExecutionUntilSettled(executionId, undefined, 20, 4000);
  console.log(`  Status: ${settled.status}${settled.timedOut ? " (timeout)" : ""}`);
  if (settled.txHash) {
    console.log(`  Tx hash: ${settled.txHash}`);
    console.log(`  Explorer: https://explore.testnet.tempo.xyz/tx/${settled.txHash}`);
  }

  const logs = await getExecutionLogs(executionId);
  const logText = logs.map((l) => l.message).join(" ");
  const linkMatch = logText.match(/https:\/\/explore\.testnet\.tempo\.xyz\/tx\/0x[a-fA-F0-9]{64}/);
  if (linkMatch) {
    console.log(`  Link from logs: ${linkMatch[0]}`);
  }

  if (settled.status === "failed" && settled.txHash) {
    console.warn("\n⚠️  BUG-07 candidate: execution failed but tx hash present — nonce may have advanced");
    console.warn("   Document in BUGS.md with execution ID and explorer link");
  }

  if (settled.status !== "mined" && !settled.txHash) {
    console.error("\n❌ No mined Tempo tx — fund agentic wallet on Moderato first:");
    console.error("   1. Copy AGENTIC_WALLET_ADDRESS from .env");
    console.error("   2. Fund with PathUSD on chain 42431 (see submission_runbook.md)");
    console.error("   3. Verify: https://explore.testnet.tempo.xyz/address/" + agentic);
    process.exit(1);
  }

  if (settled.txHash) {
    const { inserted } = await logExternalExecution({
      userWallet: monitoredWallet,
      action: "tempo_transfer",
      amount: 0,
      status: "success",
      txHash: settled.txHash,
      reason: "Tempo Moderato transfer-with-memo proof",
      aiAnalysis: {
        chainId: TEMPO_CHAIN_ID,
        explorerUrl: tempoTxUrl(settled.txHash),
        keeperhubWorkflowId: workflowId,
        executionId,
        memo: TEMPO_PROOF_MEMO,
      },
    });
    console.log(`\n  Feed log: ${inserted ? "inserted" : "already present"} in executions_log`);
  }

  console.log("\n=================================================");
  console.log("Tempo proof complete — add tx link to README + submission_runbook.md");
  console.log("=================================================\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
