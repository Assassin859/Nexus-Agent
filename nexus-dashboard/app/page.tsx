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
  workflows: Array<{ id: string; type: string; status: string }>;
  isError?: boolean;
  errorReason?: string;
  _fallback?: boolean;
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

  // Three-branch gauge logic:
  //   isError → "Degraded / RPC Error" (warning color, no arc math)
  //   healthFactor === null && !isError → "No Active Loan" (muted, no arc math)
  //   else → numeric gauge
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

  const metrics = [
    { label: "Collateral Value", value: `$${(data?.collateralUSD ?? 0).toLocaleString()}`, sub: "USDC & WETH Deposited", icon: Shield, color: "#34d399", href: "/resilience", ltv: undefined },
    { label: "Current Debt",     value: `$${(data?.debtUSD ?? 0).toLocaleString()}`,        sub: "USDC Borrowed",         icon: RefreshCw, color: "#818cf8", href: "/alerts", ltv: undefined },
    { label: "LTV Ratio",        value: `${data?.ltvPercent ?? 0}%`,                       sub: "Max 75% before risk",   icon: Layers,   color: "#fbbf24", href: "/resilience", ltv: data?.ltvPercent ?? 0 },
    { label: "Active Workflows", value: `${data?.workflows?.length ?? 1} Active`,             sub: "Guardian · DCA · Payroll", icon: ArrowUpRight, color: "#06b6d4", href: "/feed", ltv: undefined },
  ];

  return (
    <div className="animate-in" style={{ display: "flex", flexDirection: "column", gap: 28 }}>
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

          {data?._fallback && (
            <span className="pill pill-warning">
              <AlertCircle size={12} /> Offline Fallback
            </span>
          )}
          <span className="pill pill-success">
            <CheckCircle2 size={12} /> Sepolia Network Active
          </span>
        </div>
      </div>

      {/* Hero grid: Health + Metrics */}
      <div className="grid-hero">
        {/* Health factor card */}
        <div className="card" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: "36px 24px", textAlign: "center" }}>
          <div className="card-label" style={{ justifyContent: "center" }}>
            <Shield size={13} /> Aave V3 Health Factor
          </div>
          <div style={{
            width: 160, height: 160, borderRadius: "50%",
            background: `conic-gradient(${hfColor} 0% ${hfPercent}%, rgba(255,255,255,0.06) ${hfPercent}% 100%)`,
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: `0 0 40px -8px ${hfColor}66, inset 0 0 0 12px var(--surface)`
          }}>
            <div style={{
              width: 120, height: 120, borderRadius: "50%",
              background: "var(--surface)",
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              gap: 4
            }}>
              <span style={{ fontSize: isError || hasNoLoan ? 14 : 38, fontWeight: 900, color: hfColor, letterSpacing: "-0.04em", fontFamily: "var(--font-space-grotesk), sans-serif", textAlign: "center", lineHeight: 1.2 }}>
                {loading ? "..."
                  : isError ? "Degraded"
                  : hasNoLoan ? "No Loan"
                  : hf !== null && hf > 90 ? "∞"
                  : hf !== null ? hf.toFixed(2)
                  : "—"}
              </span>
              <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: "0.05em", textAlign: "center" }}>
                {isError ? "RPC Error"
                  : hasNoLoan ? "No Active Loan"
                  : hf !== null && hf > 1.5 ? "Safe Zone"
                  : hf !== null && hf > 1.15 ? "Warning Zone"
                  : "Liquidation Risk"}
              </span>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <span className={`pill ${isError ? "pill-warning" : hasNoLoan ? "pill-muted" : (hf ?? 0) > 1.5 ? "pill-success" : "pill-danger"}`}>
              {isError ? "Degraded / RPC Error" : hasNoLoan ? "No Active Loan" : (hf ?? 0) > 1.5 ? "Healthy" : "At Risk"}
            </span>
            {!isError && !hasNoLoan && <span className="pill pill-muted">Liquidation @ 1.0</span>}
          </div>
        </div>

        {/* Metric cards */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
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
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 22 }}>
          <TrendingUp size={18} color="var(--primary)" />
          <h3 style={{ fontFamily: "var(--font-space-grotesk), sans-serif", fontSize: 17, fontWeight: 800, color: "var(--text)" }}>
            Protocol APY Comparison
          </h3>
        </div>
        <table className="kh-table">
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
              <td className="cell-green">{data?.currentUSDCSupplyAPY ? `${data.currentUSDCSupplyAPY}%` : "4.2%"}</td>
              <td>5.8%</td>
              <td><span className="pill pill-success">Current Position</span></td>
            </tr>
            <tr>
              <td className="cell-bold">Compound V3</td>
              <td>USDC</td>
              <td className="cell-green">5.1%</td>
              <td>7.2%</td>
              <td><span className="pill pill-cyan">Monitored</span></td>
            </tr>
            <tr>
              <td className="cell-bold">Morpho Blue</td>
              <td>USDC</td>
              <td className="cell-green">5.8%</td>
              <td>6.9%</td>
              <td><span className="pill pill-warning">Yield Opportunity (+1.6%)</span></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
