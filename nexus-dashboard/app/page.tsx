"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Shield, RefreshCw, Layers, ArrowUpRight, CheckCircle2, TrendingUp, AlertCircle, Wallet } from "lucide-react";
import { useWallet } from "@/context/WalletContext";
import { proxyFetch } from "@/lib/agent-fetch";

type PortfolioData = {
  walletAddress: string;
  healthFactor: number | null;
  collateralUSD: number;
  debtUSD: number;
  availableBorrowsUSD: number;
  ltvPercent: number;
  usdcWalletBalance: number;
  currentUSDCSupplyAPY: number;
  compoundUSDCSupplyAPY?: number;
  apyDeltaVsAave?: number;
  workflows: Array<{ id: string; type: string; status: string }>;
  isError?: boolean;
  errorReason?: string;
  _fallback?: boolean;
  _unauthorized?: boolean;
};

export default function PortfolioPage() {
  const { walletAddress: wallet, isConnected, authToken, signInWithEthereum } = useWallet();
  const [data, setData] = useState<PortfolioData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadPortfolio() {
      try {
        const res = await proxyFetch(`/api/portfolio/${wallet}`, {}, authToken);
        const json = await res.json();
        setData(json);
      } catch (err) {
        console.error("Failed to load portfolio:", err);
      } finally {
        setLoading(false);
      }
    }
    loadPortfolio();
    const interval = setInterval(loadPortfolio, 10000);
    return () => clearInterval(interval);
  }, [wallet, authToken]);

  const short = `${wallet.slice(0, 6)}...${wallet.slice(-4)}`;

  const isError = data?.isError ?? false;
  const hasNoLoan = !isError && data !== null && data.healthFactor === null;
  const hf = (typeof data?.healthFactor === "number") ? data.healthFactor : null;
  const hfColor = isError
    ? "#f59e0b"                        // amber — degraded
    : hasNoLoan
    ? "#64748b"                        // slate — no loan
    : (hf ?? 0) > 1.5 ? "#34d399"     // green — safe
    : (hf ?? 0) > 1.15 ? "#fbbf24"   // yellow — warning
    : "#fb7185";                       // red — liquidation risk
  const hfPercent = hf !== null ? Math.min(Math.max((hf / 2.5) * 100, 10), 100) : 20;

  const aaveAPY = data?.currentUSDCSupplyAPY ?? 0;
  const compoundAPY = data?.compoundUSDCSupplyAPY ?? 0;
  const delta = data?.apyDeltaVsAave ?? (compoundAPY - aaveAPY);
  const hasYieldDelta = !isError && compoundAPY > 0 && aaveAPY > 0 && delta > 0.1;

  const metrics = [
    { label: "Collateral Value", value: `$${(data?.collateralUSD ?? 0).toLocaleString()}`, sub: "USDC & WETH Deposited", icon: Shield, color: "#34d399", href: "/resilience", ltv: undefined },
    { label: "Current Debt",     value: `$${(data?.debtUSD ?? 0).toLocaleString()}`,        sub: "USDC Borrowed",         icon: RefreshCw, color: "#818cf8", href: "/alerts", ltv: undefined },
    { label: "LTV Ratio",        value: `${data?.ltvPercent ?? 0}%`,                       sub: "Max 75% before risk",   icon: Layers,   color: "#fbbf24", href: "/resilience", ltv: data?.ltvPercent ?? 0 },
    { label: "Active Workflows", value: `${data?.workflows?.length ?? 0} Active`,             sub: "Guardian · DCA · Payroll", icon: ArrowUpRight, color: "#06b6d4", href: "/feed", ltv: undefined },
  ];

  return (
    <div className="animate-in" style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      {/* Auth & Offline Hint Banners */}
      {data?._unauthorized && (
        <div style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 10, padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", color: "#f59e0b", fontSize: 13 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <AlertCircle size={16} />
            <span>Sign in required to view live portfolio &amp; execution history</span>
          </div>
          <button onClick={signInWithEthereum} className="btn btn-primary" style={{ padding: "6px 12px", fontSize: 12 }}>
            Sign In with Ethereum
          </button>
        </div>
      )}

      {data?._fallback && !data?._unauthorized && (
        <div style={{ background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.2)", borderRadius: 10, padding: "10px 14px", display: "flex", alignItems: "center", gap: 8, color: "#818cf8", fontSize: 12 }}>
          <AlertCircle size={14} />
          <span>Agent Offline — displaying fallback synthetic state</span>
        </div>
      )}

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div className="page-header" style={{ margin: 0 }}>
          <h1 className="page-title">Portfolio Overview</h1>
          <p className="page-subtitle">
            Monitored Wallet: <span style={{ fontFamily: "ui-monospace, monospace", color: "#818cf8", fontWeight: 700 }}>{short}</span>
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button
            onClick={signInWithEthereum}
            className="btn btn-ghost"
            style={{ padding: "8px 14px", fontSize: 12.5, borderColor: isConnected ? "var(--success)" : "var(--border)" }}
          >
            <Wallet size={14} color={isConnected ? "#34d399" : "#818cf8"} />
            {isConnected ? `Connected (${short})` : "Connect MetaMask"}
          </button>

          <span className="pill pill-success">
            <CheckCircle2 size={12} /> Sepolia Network Active
          </span>
        </div>
      </div>

      {/* Hero Health Gauge */}
      <div className="grid-main" style={{ display: "grid", gridTemplateColumns: "1fr 1.6fr", gap: 24 }}>
        <div className="card" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "32px 24px", position: "relative" }}>
          <div style={{ position: "relative", width: 170, height: 170, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="170" height="170" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="42" stroke="rgba(255,255,255,0.06)" strokeWidth="9" fill="none" />
              {!isError && !hasNoLoan && (
                <circle
                  cx="50" cy="50" r="42"
                  stroke={hfColor} strokeWidth="9" fill="none"
                  strokeDasharray="264"
                  strokeDashoffset={264 - (264 * hfPercent) / 100}
                  strokeLinecap="round"
                  style={{ transition: "stroke-dashoffset 1s ease", transform: "rotate(-90deg)", transformOrigin: "50% 50%" }}
                />
              )}
            </svg>
            <div style={{ position: "absolute", textAlign: "center" }}>
              <div style={{ fontSize: isError || hasNoLoan ? 15 : 32, fontWeight: 900, color: hfColor, fontFamily: "var(--font-space-grotesk), sans-serif" }}>
                {loading ? "..." : isError ? "Degraded" : hasNoLoan ? "No Loan" : hf?.toFixed(2)}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2, fontWeight: 600 }}>
                {isError ? "RPC Error" : hasNoLoan ? "No Debt Borrowed" : "Health Factor"}
              </div>
            </div>
          </div>
        </div>

        {/* Metrics Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {metrics.map((m) => {
            const Icon = m.icon;
            return (
              <Link key={m.label} href={m.href} style={{ textDecoration: "none" }}>
                <div className="card card-interactive" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", height: "100%" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span className="card-label" style={{ margin: 0 }}>{m.label}</span>
                    <Icon size={18} color={m.color} />
                  </div>
                  <div style={{ marginTop: 16 }}>
                    <div className="card-value">{loading ? "..." : m.value}</div>
                    <div className="card-sub" style={{ color: m.color, marginTop: 6 }}>{m.sub}</div>
                  </div>
                  {m.ltv !== undefined && (
                    <div className="ltv-bar">
                      <div className="ltv-fill" style={{ width: `${Math.min(m.ltv, 100)}%` }} />
                    </div>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* APY Table */}
      <div className="card">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <TrendingUp size={18} color="var(--primary)" />
            <h3 style={{ fontFamily: "var(--font-space-grotesk), sans-serif", fontSize: 17, fontWeight: 800, color: "var(--text)" }}>
              Protocol APY Comparison
            </h3>
          </div>
          {hasYieldDelta && (
            <span className="pill pill-success animate-in">
              💡 Compound APY is +{delta.toFixed(2)}% higher than Aave — Yield Rotator Active
            </span>
          )}
        </div>

        <table className="table" style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th>Protocol</th>
              <th>Asset</th>
              <th>Supply APY</th>
              <th>Borrow APY</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="cell-bold">Aave V3</td>
              <td>USDC</td>
              <td className="cell-green">{loading ? "..." : isError ? "—" : aaveAPY > 0 ? `${aaveAPY.toFixed(2)}%` : "—"}</td>
              <td>—</td>
              <td><span className="pill pill-success">Current Position</span></td>
            </tr>
            <tr>
              <td className="cell-bold">Compound V3</td>
              <td>USDC</td>
              <td className="cell-green">{loading ? "..." : compoundAPY > 0 ? `${compoundAPY.toFixed(2)}%` : "—"}</td>
              <td>—</td>
              <td><span className="pill pill-cyan">Monitored</span></td>
            </tr>
            <tr>
              <td className="cell-bold">Morpho Blue</td>
              <td>USDC</td>
              <td>—</td>
              <td>—</td>
              <td><span className="pill pill-warning" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid var(--border)", color: "var(--text-muted)" }}>Not deployed on Sepolia</span></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
