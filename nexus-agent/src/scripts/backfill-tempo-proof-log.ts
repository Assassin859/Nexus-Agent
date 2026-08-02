/**
 * One-time backfill: insert existing Tempo proof tx into executions_log if missing.
 * Usage: pnpm --prefix nexus-agent run tempo:backfill-log
 */
import "../lib/env.js";
import { logExternalExecution } from "../lib/log-external-execution.js";
import {
  TEMPO_CHAIN_ID,
  TEMPO_PROOF_EXECUTION_ID,
  TEMPO_PROOF_MEMO,
  TEMPO_PROOF_TX,
  TEMPO_PROOF_WORKFLOW_ID,
  tempoTxUrl,
} from "../lib/tier2-proofs.js";

const monitoredWallet = (
  process.env.NEXT_PUBLIC_WALLET_ADDRESS || "0x89f97Cb35236a1d0190FB25B31C5C0fF4107Ec1b"
).toLowerCase();

async function main() {
  console.log("Backfilling Tempo proof into executions_log...");
  console.log(`  Wallet: ${monitoredWallet}`);
  console.log(`  Tx:     ${TEMPO_PROOF_TX}`);

  const { inserted } = await logExternalExecution({
    userWallet: monitoredWallet,
    action: "tempo_transfer",
    amount: 0,
    status: "success",
    txHash: TEMPO_PROOF_TX,
    reason: "Tempo Moderato transfer-with-memo proof (backfill)",
    aiAnalysis: {
      chainId: TEMPO_CHAIN_ID,
      explorerUrl: tempoTxUrl(TEMPO_PROOF_TX),
      keeperhubWorkflowId: TEMPO_PROOF_WORKFLOW_ID,
      executionId: TEMPO_PROOF_EXECUTION_ID,
      memo: TEMPO_PROOF_MEMO,
    },
  });

  console.log(inserted ? "✓ Inserted" : "• Already present — skipped");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
