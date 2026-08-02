import { Contract, JsonRpcProvider, formatUnits } from "ethers";
import { TEMPO_PATH_USD, TEMPO_RPC } from "./tier2-proofs.js";

const ERC20_ABI = ["function balanceOf(address owner) view returns (uint256)"];

/** PathUSD uses 6 decimals on Tempo Moderato. */
export function parsePathUsdBalance(raw: bigint): number {
  return parseFloat(formatUnits(raw, 6));
}

export async function getTempoPathUsdBalance(address: string): Promise<number | null> {
  if (!address) return null;
  try {
    const provider = new JsonRpcProvider(TEMPO_RPC);
    const token = new Contract(TEMPO_PATH_USD, ERC20_ABI, provider);
    const raw: bigint = await token.balanceOf(address.toLowerCase());
    return parsePathUsdBalance(raw);
  } catch (err) {
    console.warn("[TEMPO] PathUSD balance query failed:", err instanceof Error ? err.message : err);
    return null;
  }
}
