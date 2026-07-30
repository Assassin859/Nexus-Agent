import { getProvider } from "./rpc.js";
import { Contract, formatUnits } from "ethers";

// Chainlink ETH/USD aggregator on Sepolia
const CHAINLINK_ETH_USD = "0x694AA1769357215DE4FAC081bf1f309aDC325306";
const AGG_ABI = [
  "function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)",
];

const STALENESS_THRESHOLD_MS = 60 * 60 * 1000; // 1 hour

let cachedPrice: number | null = null;
let cacheExpiresAt = 0;

/**
 * Returns the live ETH/USD price from the Chainlink Sepolia aggregator.
 * Caches the result for 60 seconds to avoid per-cron-tick RPC hammering.
 * Falls back to ETH_PRICE_USD_FALLBACK env var (default 3000) on RPC failure or stale round.
 *
 * NOTE: Uses console.warn until pino (Track 2) is merged;
 *       replace with childLogger({ module: "price" }).warn(...) when Track 2 lands.
 */
export async function getEthPriceUSD(): Promise<number> {
  const fallback = Number(process.env.ETH_PRICE_USD_FALLBACK) || 3000;
  const now = Date.now();

  if (cachedPrice !== null && now < cacheExpiresAt) return cachedPrice;

  try {
    const provider = await getProvider();
    const feed = new Contract(CHAINLINK_ETH_USD, AGG_ABI, provider);
    const { answer, updatedAt } = await feed.latestRoundData();

    // Reject stale rounds (> 1 hour old)
    const ageSecs = now / 1000 - Number(updatedAt);
    if (ageSecs * 1000 > STALENESS_THRESHOLD_MS) {
      console.warn(
        `[PRICE] Chainlink round stale (${Math.round(ageSecs / 60)}min old) — using fallback $${fallback}`
      );
      return fallback;
    }

    const price = Number(formatUnits(answer, 8)); // int256, 8 decimals
    cachedPrice = price;
    cacheExpiresAt = now + 60_000; // 60-second TTL
    return price;
  } catch (err) {
    console.warn(
      `[PRICE] Chainlink unavailable — using fallback $${fallback}:`,
      err instanceof Error ? err.message : err
    );
    return fallback;
  }
}
