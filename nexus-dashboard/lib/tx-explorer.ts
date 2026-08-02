import { BASE_SEPOLIA_CHAIN_ID, TEMPO_CHAIN_ID } from "@/lib/tier2-proofs";

export function getTxExplorerUrl(
  txHash: string,
  aiAnalysis?: Record<string, unknown> | null,
): { url: string; label: string } {
  const chainId = aiAnalysis?.chainId;
  const explicit = aiAnalysis?.explorerUrl;

  if (typeof explicit === "string" && explicit.startsWith("http")) {
    const label = chainId === TEMPO_CHAIN_ID ? "Live Tempo Explorer" : "Live Explorer";
    return { url: explicit, label };
  }

  if (chainId === TEMPO_CHAIN_ID || chainId === "42431") {
    return {
      url: `https://explore.testnet.tempo.xyz/tx/${txHash}`,
      label: "Live Tempo Explorer",
    };
  }

  return {
    url: `https://sepolia.basescan.org/tx/${txHash}`,
    label: "Live BaseScan",
  };
}

export function chainLabel(chainId?: unknown): string {
  if (chainId === TEMPO_CHAIN_ID || chainId === "42431") return "Tempo Moderato";
  if (chainId === BASE_SEPOLIA_CHAIN_ID || chainId === "84532") return "Base Sepolia";
  return "On-chain";
}
