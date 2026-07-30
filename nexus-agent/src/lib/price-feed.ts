import { getProvider } from "./rpc.js";
import { Contract, formatUnits } from "ethers";
import { childLogger } from "./logger.js";

// Chainlink ETH/USD aggregator on Sepolia
const CHAINLINK_ETH_USD = "0x694AA1769357215DE4FAC081bf1f309aDC325306";
const AGG_ABI = [
  "function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)",
  "function getRoundData(uint80 _roundId) view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)",
];

const STALENESS_THRESHOLD_MS = 60 * 60 * 1000; // 1 hour

const log = childLogger({ module: "price" });

let cachedPrice: number | null = null;
let cacheExpiresAt = 0;
let cachedTrend: "stable" | "volatile" | "crash" | null = null;
let trendCacheExpiresAt = 0;

/**
 * Returns the live ETH/USD price from the Chainlink Sepolia aggregator.
 * Caches the result for 60 seconds to avoid per-cron-tick RPC hammering.
 * Falls back to ETH_PRICE_USD_FALLBACK env var (default 3000) on RPC failure or stale round.
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
      log.warn({ ageSecs: Math.round(ageSecs), fallback }, "Chainlink round stale — using fallback price");
      return fallback;
    }

    const price = Number(formatUnits(answer, 8)); // int256, 8 decimals
    cachedPrice = price;
    cacheExpiresAt = now + 60_000; // 60-second TTL
    return price;
  } catch (err) {
    log.warn({ err: err instanceof Error ? err.message : String(err), fallback }, "Chainlink unavailable — using fallback price");
    return fallback;
  }
}

/**
 * Derives a market price trend from the Chainlink ETH/USD aggregator by comparing
 * the latest round to the previous round (approximate short-term move; on Sepolia,
 * typically ~1h apart when markets are calm).
 *
 * Thresholds:
 *   crash:    delta <= -7%   (large negative moves signal liquidation risk)
 *   volatile: |delta| >= 3%  (significant price movement in either direction)
 *   stable:   |delta| < 3%
 *
 * Always falls back to "stable" on any RPC error so Guardian evaluation is never blocked.
 * Caches result for 60 seconds (same TTL as price cache).
 */
export async function getPriceTrend(): Promise<"stable" | "volatile" | "crash"> {
  const now = Date.now();
  if (cachedTrend !== null && now < trendCacheExpiresAt) return cachedTrend;

  try {
    const provider = await getProvider();
    const feed = new Contract(CHAINLINK_ETH_USD, AGG_ABI, provider);
    const { roundId, answer: latestAnswer } = await feed.latestRoundData();

    // Guard: roundId 0 or 1 means no previous round exists
    if (roundId <= 1n) {
      log.warn({ roundId: roundId.toString() }, "Chainlink roundId too low for delta — returning stable");
      return "stable";
    }

    const { answer: prevAnswer } = await feed.getRoundData(roundId - 1n);

    if (Number(prevAnswer) === 0) return "stable"; // guard division by zero

    const pctChange = ((Number(latestAnswer) - Number(prevAnswer)) / Number(prevAnswer)) * 100;
    log.info({ pctChange: parseFloat(pctChange.toFixed(3)) }, "Chainlink inter-round delta computed");

    let trend: "stable" | "volatile" | "crash";
    if (pctChange <= -7) trend = "crash";
    else if (Math.abs(pctChange) >= 3) trend = "volatile";
    else trend = "stable";

    cachedTrend = trend;
    trendCacheExpiresAt = now + 60_000; // 60-second TTL
    return trend;
  } catch (err) {
    log.warn({ err: err instanceof Error ? err.message : String(err) }, "getPriceTrend RPC error — returning stable fallback");
    return "stable";
  }
}
