import { Contract } from "ethers";
import { getProvider } from "./rpc.js";
import { COMPOUND_V3_USDC } from "./calldata.js";

const COMPOUND_ABI = [
  "function supplyRatePerSecond() view returns (uint256)",
  "function balanceOf(address owner) view returns (uint256)",
];

/**
 * Fetches real-time Compound V3 USDC supply APY on-chain (Sepolia).
 * Uses compound interest formula: (1 + ratePerSecond)^secondsPerYear - 1
 * Returns fallback value on RPC error.
 */
export async function getCompoundUsdcSupplyAPY(): Promise<number> {
  const fallback = Number(process.env.COMPOUND_APY_FALLBACK) || 3.0;
  try {
    const provider = await getProvider();
    const cUSDC = new Contract(COMPOUND_V3_USDC, COMPOUND_ABI, provider);
    const ratePerSecRaw = await cUSDC.supplyRatePerSecond();
    const ratePerSec = Number(ratePerSecRaw) / 1e18;
    const secondsInYear = 365 * 24 * 3600;
    const computed = parseFloat(((Math.pow(1 + ratePerSec, secondsInYear) - 1) * 100).toFixed(2));
    return computed > 0 ? computed : fallback;
  } catch (err) {
    console.warn("[COMPOUND] Failed to fetch supply APY on-chain — using fallback:", err instanceof Error ? err.message : err);
    return fallback;
  }
}
