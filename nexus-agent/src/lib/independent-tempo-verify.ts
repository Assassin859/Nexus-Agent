import { JsonRpcProvider } from "ethers";
import { TEMPO_RPC } from "./tier2-proofs.js";

export type TempoIndependentVerification = {
  verified: boolean;
  source: "tempo_rpc";
  checkedAt: string;
  discrepancy?: string;
};

/** Pure helper for unit tests — maps receipt to verification outcome. */
export function evaluateTempoReceipt(
  receipt: { status: number | null } | null | undefined,
): Pick<TempoIndependentVerification, "verified" | "discrepancy"> {
  if (!receipt) {
    return { verified: false, discrepancy: "Transaction receipt not found on Tempo RPC" };
  }
  if (receipt.status === 1) {
    return { verified: true };
  }
  return { verified: false, discrepancy: "Tempo transaction reverted on-chain" };
}

/** Confirm a Tempo Moderato tx mined successfully via direct RPC (not KeeperHub status). */
export async function verifyTempoTxReceipt(
  txHash: string,
  rpcUrl: string = TEMPO_RPC,
): Promise<TempoIndependentVerification> {
  const checkedAt = new Date().toISOString();
  try {
    const provider = new JsonRpcProvider(rpcUrl);
    const receipt = await provider.getTransactionReceipt(txHash);
    const result = evaluateTempoReceipt(receipt);
    return { ...result, source: "tempo_rpc", checkedAt };
  } catch (err) {
    return {
      verified: false,
      source: "tempo_rpc",
      checkedAt,
      discrepancy: err instanceof Error ? err.message : "Tempo RPC receipt fetch failed",
    };
  }
}
