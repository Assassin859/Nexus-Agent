/** One-time backfill for x402 proof row in executions_log. */
import "../lib/env.js";
import { logExternalExecution } from "../lib/log-external-execution.js";
import { BASE_MAINNET_CHAIN_ID, baseMainnetTxUrl, X402_PROOF_TX } from "../lib/tier2-proofs.js";
import { HF_READ_LISTING_SLUG } from "../lib/hf-read-workflow.js";

const monitoredWallet = (
  process.env.NEXT_PUBLIC_WALLET_ADDRESS || "0x89f97Cb35236a1d0190FB25B31C5C0fF4107Ec1b"
).toLowerCase();

async function main() {
  if (!X402_PROOF_TX) {
    console.error("X402_PROOF_TX not set");
    process.exit(1);
  }
  const result = await logExternalExecution({
    userWallet: monitoredWallet,
    action: "marketplace_hf_read",
    amount: 1,
    status: "success",
    txHash: X402_PROOF_TX,
    reason: "Base mainnet x402 paid HF-read marketplace call",
    aiAnalysis: {
      chainId: BASE_MAINNET_CHAIN_ID,
      source: "x402_paid_call",
      listingSlug: HF_READ_LISTING_SLUG,
      explorerUrl: baseMainnetTxUrl(X402_PROOF_TX),
      buyerWallet: "0x9a1476aaef9ec608e39a32bca388a8488e04fc94",
      protocolUsed: "x402",
    },
  });
  console.log(result.inserted ? "inserted" : "already present", X402_PROOF_TX);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
