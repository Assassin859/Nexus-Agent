"use client";

import { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Activity, TrendingDown, TrendingUp } from "lucide-react";

type PriceHistoryPoint = {
  timestamp: number;
  price: number;
};

type MarketSnapshot = {
  ethUsd: number;
  trend: "stable" | "volatile" | "crash";
  pctChange: number;
  updatedAt: number;
  history: PriceHistoryPoint[];
  source: string;
  network: string;
};

const TREND_STYLE: Record<
  MarketSnapshot["trend"],
  { label: string; cls: string; color: string }
> = {
  stable: { label: "Stable", cls: "pill-success", color: "#34d399" },
  volatile: { label: "Volatile", cls: "pill-warning", color: "#fbbf24" },
  crash: { label: "Crash", cls: "pill-danger", color: "#fb7185" },
};

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatAxisTime(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
  });
}

export default function EthPriceChart() {
  const [data, setData] = useState<MarketSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/markets");
        const json = await res.json();
        if (!res.ok) {
          if (!cancelled) setError(json.error || "Oracle unavailable");
          return;
        }
        if (!cancelled) {
          setData(json);
          setError(null);
        }
      } catch {
        if (!cancelled) setError("Could not reach market oracle");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    const interval = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const trend = data ? TREND_STYLE[data.trend] : TREND_STYLE.stable;
  const chartData =
    data?.history.map((p) => ({
      ...p,
      label: formatAxisTime(p.timestamp),
    })) ?? [];

  const pct = data?.pctChange ?? 0;
  const pctPositive = pct >= 0;

  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Activity size={18} color="#818cf8" />
          <div>
            <h3
              style={{
                fontFamily: "var(--font-space-grotesk), sans-serif",
                fontSize: 17,
                fontWeight: 800,
                color: "var(--text)",
                margin: 0,
              }}
            >
              ETH / USD Oracle
            </h3>
            <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "4px 0 0" }}>
              Live Chainlink feed — drives Guardian priceTrend &amp; DCA slippage
            </p>
          </div>
        </div>

        {!loading && data && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span className={`pill ${trend.cls}`}>{trend.label}</span>
            <span
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                fontSize: 13,
                fontWeight: 700,
                color: pctPositive ? "#34d399" : "#fb7185",
              }}
            >
              {pctPositive ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
              {pctPositive ? "+" : ""}
              {pct.toFixed(2)}%
            </span>
          </div>
        )}
      </div>

      {loading ? (
        <div style={{ color: "var(--text-muted)", textAlign: "center", padding: "40px 0" }}>
          Fetching Chainlink oracle…
        </div>
      ) : error ? (
        <div style={{ color: "#f59e0b", textAlign: "center", padding: "24px 0", fontSize: 13 }}>
          {error}
        </div>
      ) : data ? (
        <>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span
              style={{
                fontFamily: "var(--font-space-grotesk), sans-serif",
                fontSize: 32,
                fontWeight: 900,
                color: "var(--text)",
              }}
            >
              ${data.ethUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
              updated {formatTime(data.updatedAt * 1000)}
            </span>
          </div>

          {chartData.length >= 2 ? (
            <div style={{ width: "100%", height: 220 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="ethPriceFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#818cf8" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#818cf8" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: "#94a3b8", fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    minTickGap={24}
                  />
                  <YAxis
                    domain={["auto", "auto"]}
                    tick={{ fill: "#94a3b8", fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    width={56}
                    tickFormatter={(v: number) => `$${v.toFixed(0)}`}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "rgba(15,15,20,0.95)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    labelFormatter={(_, payload) => {
                      const ts = payload?.[0]?.payload?.timestamp;
                      return ts ? formatTime(ts) : "";
                    }}
                    formatter={(value: number) => [
                      `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                      "ETH",
                    ]}
                  />
                  <Area
                    type="monotone"
                    dataKey="price"
                    stroke="#818cf8"
                    strokeWidth={2}
                    fill="url(#ethPriceFill)"
                    dot={false}
                    activeDot={{ r: 4, fill: "#818cf8" }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div style={{ color: "var(--text-muted)", fontSize: 13, padding: "16px 0" }}>
              Insufficient round history for chart — spot price shown above.
            </div>
          )}

          <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0 }}>
            Chainlink Oracle · Base Sepolia · rounds ~hourly on testnet
          </p>
        </>
      ) : null}
    </div>
  );
}
