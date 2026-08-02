import { getProvider } from "./rpc.js";
import { Contract, formatUnits } from "ethers";
import { childLogger } from "./logger.js";

// Chainlink ETH / USD Data Feed on Base Sepolia
const CHAINLINK_ETH_USD = "0x4aDC67696bA383F43DD60A9e78F2C97Fbbfc7cb1";
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

export type PriceHistoryPoint = {
  timestamp: number;
  price: number;
};

export type MarketSnapshot = {
  ethUsd: number;
  trend: "stable" | "volatile" | "crash";
  pctChange: number;
  updatedAt: number;
  history: PriceHistoryPoint[];
  source: "chainlink";
  network: "base-sepolia";
};

const MAX_HISTORY_ROUNDS = 48;

/**
 * Fetches the last N Chainlink round prices (newest round included).
 * Returns ascending by timestamp for charting.
 */
export async function getEthPriceHistory(limit = 24): Promise<PriceHistoryPoint[]> {
  const capped = Math.min(Math.max(1, limit), MAX_HISTORY_ROUNDS);

  try {
    const provider = await getProvider();
    const feed = new Contract(CHAINLINK_ETH_USD, AGG_ABI, provider);
    const { roundId: latestRoundId } = await feed.latestRoundData();

    if (latestRoundId <= 0n) return [];

    const roundIds: bigint[] = [];
    for (let i = 0n; i < BigInt(capped); i++) {
      const id = latestRoundId - i;
      if (id <= 0n) break;
      roundIds.push(id);
    }

    const rounds = await Promise.all(
      roundIds.map((id) => feed.getRoundData(id)),
    );

    const points: PriceHistoryPoint[] = [];
    for (const round of rounds) {
      if (Number(round.answer) === 0) continue;
      points.push({
        timestamp: Number(round.updatedAt) * 1000,
        price: Number(formatUnits(round.answer, 8)),
      });
    }

    points.sort((a, b) => a.timestamp - b.timestamp);
    return points;
  } catch (err) {
    log.warn(
      { err: err instanceof Error ? err.message : String(err) },
      "getEthPriceHistory RPC error — returning empty history",
    );
    return [];
  }
}

function trendFromPctChange(pctChange: number): "stable" | "volatile" | "crash" {
  if (pctChange <= -7) return "crash";
  if (Math.abs(pctChange) >= 3) return "volatile";
  return "stable";
}

/**
 * Combined market snapshot for dashboard / API consumers.
 */
export async function getMarketSnapshot(): Promise<MarketSnapshot> {
  const [ethUsd, trend, history] = await Promise.all([
    getEthPriceUSD(),
    getPriceTrend(),
    getEthPriceHistory(24),
  ]);

  let pctChange = 0;
  let updatedAt = Math.floor(Date.now() / 1000);

  if (history.length >= 2) {
    const prev = history[history.length - 2];
    const latest = history[history.length - 1];
    if (prev.price > 0) {
      pctChange = ((latest.price - prev.price) / prev.price) * 100;
    }
    updatedAt = Math.floor(latest.timestamp / 1000);
  } else {
    try {
      const provider = await getProvider();
      const feed = new Contract(CHAINLINK_ETH_USD, AGG_ABI, provider);
      const { roundId, answer: latestAnswer, updatedAt: chainUpdatedAt } =
        await feed.latestRoundData();
      updatedAt = Number(chainUpdatedAt);
      if (roundId > 1n) {
        const { answer: prevAnswer } = await feed.getRoundData(roundId - 1n);
        if (Number(prevAnswer) > 0) {
          pctChange =
            ((Number(latestAnswer) - Number(prevAnswer)) / Number(prevAnswer)) * 100;
        }
      }
    } catch {
      // keep defaults
    }
  }

  return {
    ethUsd,
    trend: history.length >= 2 ? trendFromPctChange(pctChange) : trend,
    pctChange: parseFloat(pctChange.toFixed(3)),
    updatedAt,
    history,
    source: "chainlink",
    network: "base-sepolia",
  };
}
