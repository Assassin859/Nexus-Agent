"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Shield, RefreshCw, Layers, ArrowUpRight, CheckCircle2, TrendingUp, AlertCircle, Wallet } from "lucide-react";
import { useWallet } from "@/context/WalletContext";
import { proxyFetch } from "@/lib/agent-fetch";
import Pagination from "@/components/Pagination";
import { usePagination } from "@/hooks/usePagination";
import EthPriceChart from "@/components/EthPriceChart";
import IntegrationsProofCard from "@/components/IntegrationsProofCard";
import HfReadWidget from "@/components/HfReadWidget";
import { HF_CRITICAL, HF_WARNING, NETWORK_LABEL } from "@/lib/guardian-thresholds";

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
  _forbidden?: boolean;
  _agentError?: boolean;
  tempo?: {
    chainId: number;
    agenticWallet: string;
    pathUsdBalance: number | null;
    explorerUrl: string;
  } | null;
};

type WorkflowRow = { id: string; type: string; status: string; amount?: number };

const APY_ROWS = [
  { protocol: "Aave V3", asset: "USDC", status: "Current Position", statusClass: "pill-success" as const },
  { protocol: "Compound V3", asset: "USDC", status: "Monitored", statusClass: "pill-cyan" as const },
  { protocol: "Morpho Blue", asset: "USDC", status: `Not on ${NETWORK_LABEL}`, statusClass: "pill-warning" as const },
];

const WORKFLOW_PAGE_SIZE = 5;
const APY_PAGE_SIZE = 2;

export default function PortfolioPage() {
  const { walletAddress: wallet, isConnected, authToken, signInWithEthereum } = useWallet();
  const [data, setData] = useState<PortfolioData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadPortfolio() {
      try {
        const res = await proxyFetch(`/api/portfolio/${wallet}`, {}, authToken);
        const json = await res.json();
        if (res.status === 401) json._unauthorized = true;
        if (res.status === 403) json._forbidden = true;
        if (!res.ok) json._agentError = true;
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
    : (hf ?? 0) > HF_WARNING ? "#34d399"     // green — safe
    : (hf ?? 0) > HF_CRITICAL ? "#fbbf24"   // yellow — warning
    : "#fb7185";                       // red — liquidation risk
  const hfPercent = hf !== null ? Math.min(Math.max((hf / 2.5) * 100, 10), 100) : 20;

  const aaveAPY = data?.currentUSDCSupplyAPY ?? 0;
  const compoundAPY = data?.compoundUSDCSupplyAPY ?? 0;
  const delta = data?.apyDeltaVsAave ?? (compoundAPY - aaveAPY);
  const hasYieldDelta = !isError && compoundAPY > 0 && aaveAPY > 0 && delta > 0.1;

  const activeWorkflowCount = data?.workflows?.filter((w) => w.status === "active").length ?? 0;

  const workflowRows: WorkflowRow[] = data?.workflows ?? [];
  const {
    page: wfPage,
    setPage: setWfPage,
    totalPages: wfTotalPages,
    pagedItems: pagedWorkflows,
    total: wfTotal,
    showPagination: wfShowPagination,
  } = usePagination(workflowRows, WORKFLOW_PAGE_SIZE, [wallet]);

  const {
    page: apyPage,
    setPage: setApyPage,
    totalPages: apyTotalPages,
    pagedItems: pagedApyRows,
    total: apyTotal,
    showPagination: apyShowPagination,
  } = usePagination(APY_ROWS, APY_PAGE_SIZE, []);

  const metrics = [
    { label: "Collateral Value", value: `$${(data?.collateralUSD ?? 0).toLocaleString()}`, sub: "USDC & WETH Deposited", icon: Shield, color: "#34d399", href: "/resilience", ltv: undefined },
    { label: "Current Debt",     value: `$${(data?.debtUSD ?? 0).toLocaleString()}`,        sub: "USDC Borrowed",         icon: RefreshCw, color: "#818cf8", href: "/alerts", ltv: undefined },
    { label: "LTV Ratio",        value: `${data?.ltvPercent ?? 0}%`,                       sub: "Max 75% before risk",   icon: Layers,   color: "#fbbf24", href: "/resilience", ltv: data?.ltvPercent ?? 0 },
    { label: "Active Workflows", value: `${activeWorkflowCount} Active`,             sub: "Guardian · DCA · Payroll", icon: ArrowUpRight, color: "#06b6d4", href: "/feed", ltv: undefined },
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

      {data?._forbidden && (
        <div style={{ background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.3)", borderRadius: 10, padding: "12px 16px", display: "flex", alignItems: "center", gap: 8, color: "#f87171", fontSize: 13 }}>
          <AlertCircle size={16} />
          <span>Forbidden — signed-in wallet does not match the portfolio address.</span>
        </div>
      )}

      {data?._agentError && !data?._unauthorized && !data?._forbidden && (
        <div style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 10, padding: "12px 16px", display: "flex", alignItems: "center", gap: 8, color: "#f59e0b", fontSize: 13 }}>
          <AlertCircle size={16} />
          <span>{data.errorReason || (data as PortfolioData & { error?: string }).error || "Agent error — live portfolio unavailable."}</span>
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
            <CheckCircle2 size={12} /> Base Sepolia Network Active
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

      <EthPriceChart />

      <div>
        <IntegrationsProofCard />
        <HfReadWidget />
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

        {apyShowPagination && (
          <Pagination
            page={apyPage}
            totalPages={apyTotalPages}
            total={apyTotal}
            pageSize={APY_PAGE_SIZE}
            onPageChange={setApyPage}
          />
        )}

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
            {pagedApyRows.map((row) => (
              <tr key={row.protocol}>
                <td className="cell-bold">{row.protocol}</td>
                <td>{row.asset}</td>
                <td className="cell-green">
                  {loading ? "..." : row.protocol === "Aave V3" ? (isError ? "—" : aaveAPY > 0 ? `${aaveAPY.toFixed(2)}%` : "—") : row.protocol === "Compound V3" ? (compoundAPY > 0 ? `${compoundAPY.toFixed(2)}%` : "—") : "—"}
                </td>
                <td>—</td>
                <td><span className={`pill ${row.statusClass}`} style={row.protocol === "Morpho Blue" ? { background: "rgba(255,255,255,0.05)", border: "1px solid var(--border)", color: "var(--text-muted)" } : undefined}>{row.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>

        {apyShowPagination && (
          <Pagination
            page={apyPage}
            totalPages={apyTotalPages}
            total={apyTotal}
            pageSize={APY_PAGE_SIZE}
            onPageChange={setApyPage}
          />
        )}
      </div>

      {/* Active Workflows */}
      <div className="card">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
          <h3 style={{ fontFamily: "var(--font-space-grotesk), sans-serif", fontSize: 17, fontWeight: 800, color: "var(--text)", margin: 0 }}>
            Active Workflows
          </h3>
          <Link href="/workflows" style={{ fontSize: 12, color: "#818cf8", textDecoration: "none" }}>View all →</Link>
        </div>

        {loading ? (
          <div style={{ color: "var(--text-muted)", fontSize: 13, padding: 12 }}>Loading workflows...</div>
        ) : workflowRows.length === 0 ? (
          <div style={{ color: "var(--text-muted)", fontSize: 13, padding: 12 }}>No active workflows registered yet.</div>
        ) : (
          <>
            {wfShowPagination && (
              <Pagination page={wfPage} totalPages={wfTotalPages} total={wfTotal} pageSize={WORKFLOW_PAGE_SIZE} onPageChange={setWfPage} />
            )}
            <table className="kh-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Status</th>
                  <th>ID</th>
                </tr>
              </thead>
              <tbody>
                {pagedWorkflows.map((wf) => (
                  <tr key={wf.id}>
                    <td className="cell-bold" style={{ textTransform: "capitalize" }}>{wf.type}</td>
                    <td><span className={`pill ${wf.status === "active" ? "pill-success" : "pill-warn"}`}>{wf.status}</span></td>
                    <td style={{ fontFamily: "monospace", fontSize: 12, color: "var(--text-muted)" }}>{wf.id.slice(0, 8)}…</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {wfShowPagination && (
              <Pagination page={wfPage} totalPages={wfTotalPages} total={wfTotal} pageSize={WORKFLOW_PAGE_SIZE} onPageChange={setWfPage} />
            )}
          </>
        )}
      </div>
    </div>
  );
}
