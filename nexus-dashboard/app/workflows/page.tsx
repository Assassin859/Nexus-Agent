"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Cpu, RefreshCw, Clock, ExternalLink, ShieldCheck, Key, Code, ChevronDown, ChevronUp, CheckCircle2, Store, Zap, Shield } from "lucide-react";
import { useWallet } from "@/context/WalletContext";
import { proxyFetch } from "@/lib/agent-fetch";
import DemoModeBanner from "@/components/DemoModeBanner";
import PersonalWalletBanner from "@/components/PersonalWalletBanner";
import StaleDemoSessionBanner from "@/components/StaleDemoSessionBanner";
import DualWalletPayrollNotice from "@/components/DualWalletPayrollNotice";
import KeeperHubSyncModal from "@/components/KeeperHubSyncModal";
import { isKeeperHubWorkflowId } from "@/lib/keeperhub-links";
import KeeperHubWorkflowLink from "@/components/KeeperHubWorkflowLink";
import Pagination from "@/components/Pagination";
import { usePagination } from "@/hooks/usePagination";
import { HF_READ_SLUG, HF_READ_WORKFLOW_ID, MARKETPLACE_URL, TEMPO_PROOF_TXS } from "@/lib/tier2-proofs";

type WorkflowItem = {
  id: string;
  userWallet: string;
  type: string;
  recipientAddress?: string;
  amount: number;
  cronSchedule: string;
  status: "active" | "paused" | "completed" | string;
  createdAt?: string;
  keeperhubWorkflowId?: string | null;
};

type WorkflowSummary = {
  payroll: number;
  dca: number;
  guardian: number;
  yield: number;
  total: number;
};

/** Convert a 5-field cron expression to a human-readable string */
function humanCron(cron: string): string {
  const parts = cron.trim().split(/\s+/);
  if (parts.length < 5) return cron;
  const [min, hour, dom, , dow] = parts;

  const pad = (n: string) => n.padStart(2, "0");
  const timeStr = (h: string, m: string) => {
    const hNum = parseInt(h, 10);
    const suffix = hNum >= 12 ? "PM" : "AM";
    const h12 = hNum === 0 ? 12 : hNum > 12 ? hNum - 12 : hNum;
    return `${h12}:${pad(m)} ${suffix}`;
  };

  const DAYS: Record<string, string> = {
    "0": "Sunday", "1": "Monday", "2": "Tuesday",
    "3": "Wednesday", "4": "Thursday", "5": "Friday", "6": "Saturday",
  };

  const time = timeStr(hour, min);

  if (dow === "*" && dom === "*") return `Every day at ${time}`;
  if (dow !== "*" && dom === "*") {
    if (DAYS[dow]) return `Every ${DAYS[dow]} at ${time}`;
  }
  if (dom.includes(",")) return `On the ${dom.replace(",", "th & ")}th of each month at ${time}`;
  if (dom !== "*" && dow === "*") {
    const suffix = dom === "1" ? "st" : dom === "2" ? "nd" : dom === "3" ? "rd" : "th";
    return `On the ${dom}${suffix} of each month at ${time}`;
  }
  if (cron.startsWith("*/5")) return "Every 5 minutes";
  if (cron.startsWith("*/15")) return "Every 15 minutes";

  return cron;
}

function workflowTitle(wf: WorkflowItem): string {
  switch (wf.type) {
    case "guardian":
      return "Aave Guardian Monitor — HF < 1.15";
    case "yield":
      return "Stablecoin Yield Rotator";
    case "dca":
      return `DCA Strategy — ${wf.amount} USDC → ETH`;
    case "payroll":
      return `Payroll Strategy — ${wf.amount} USDC`;
    default:
      return `${wf.type} Strategy — ${wf.amount} USDC`;
  }
}

const PAGE_SIZE = 6;

const PLATFORM_MODULES = [
  {
    icon: Shield,
    color: "#6366f1",
    title: "Aave Guardian",
    badge: "Always-on · 5 min",
    desc: "Autonomous HF monitoring and repay — see /resilience for proofs",
    href: "/resilience",
  },
  {
    icon: Store,
    color: "#06b6d4",
    title: "Marketplace HF-read",
    badge: `Published · ${HF_READ_SLUG}`,
    desc: "Read-only HF snapshot for external agents (x402)",
    href: MARKETPLACE_URL,
    external: true,
  },
  {
    icon: Zap,
    color: "#f59e0b",
    title: "Tempo Moderato",
    badge: `${TEMPO_PROOF_TXS.length} attestation txs`,
    desc: "Cross-chain transfer-with-memo proofs",
    href: "/tempo",
  },
];

export default function WorkflowsPage() {
  const { walletAddress: wallet, authToken } = useWallet();
  const [workflows, setWorkflows] = useState<WorkflowItem[]>([]);
  const [summary, setSummary] = useState<WorkflowSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [spinning, setSpinning] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [connected, setConnected] = useState(true);

  const { page, setPage, totalPages, pagedItems, total, showPagination } = usePagination(
    workflows,
    PAGE_SIZE,
    [wallet],
  );

  async function loadWorkflows() {
    setSpinning(true);
    try {
      const res = await proxyFetch(`/api/portfolio/${wallet}`, {}, authToken);
      const data = await res.json();
      if (data && Array.isArray(data.workflows)) {
        setWorkflows(data.workflows);
      }
      if (data?.workflowSummary) {
        setSummary(data.workflowSummary);
      }
    } catch (err) {
      console.error("Failed to load active workflows:", err);
    } finally {
      setLoading(false);
      setSpinning(false);
    }
  }

  useEffect(() => {
    loadWorkflows();
    const interval = setInterval(loadWorkflows, 5000);
    return () => clearInterval(interval);
  }, [wallet, authToken]);

  const typeColors: Record<string, string> = {
    payroll: "#818cf8",
    dca: "#34d399",
    guardian: "#6366f1",
    yield: "#f59e0b",
    default: "#94a3b8",
  };

  const typeChips: Array<{ label: string; count: number; color: string }> = summary
    ? [
        ...(summary.dca > 0 ? [{ label: "DCA", count: summary.dca, color: typeColors.dca }] : []),
        ...(summary.guardian > 0 ? [{ label: "Guardian", count: summary.guardian, color: typeColors.guardian }] : []),
        ...(summary.yield > 0 ? [{ label: "Yield", count: summary.yield, color: typeColors.yield }] : []),
        ...(summary.payroll > 0 ? [{ label: "Payroll", count: summary.payroll, color: typeColors.payroll }] : []),
      ]
    : [];

  return (
    <div className="animate-in" style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
        <div>
          <h1 className="page-title">Active Workflows</h1>
          <p className="page-subtitle">Scheduled cron jobs + platform modules managed by KeeperHub MCP</p>
          {typeChips.length > 0 && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
              {typeChips.map((chip) => (
                <span
                  key={chip.label}
                  className="pill"
                  style={{
                    fontSize: 11,
                    background: `${chip.color}18`,
                    border: `1px solid ${chip.color}40`,
                    color: chip.color,
                  }}
                >
                  {chip.count} {chip.label}
                </span>
              ))}
              <span className="pill" style={{ fontSize: 11, color: "var(--text-muted)" }}>
                + Tempo ×{TEMPO_PROOF_TXS.length} · Marketplace
              </span>
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            onClick={() => setShowAuthModal(true)}
            className="btn"
            style={{
              background: connected ? "rgba(52,211,153,0.12)" : "rgba(99,102,241,0.12)",
              border: connected ? "1px solid rgba(52,211,153,0.3)" : "1px solid rgba(99,102,241,0.3)",
              color: connected ? "#34d399" : "#818cf8",
              display: "flex", alignItems: "center", gap: 8, cursor: "pointer",
            }}
          >
            {connected ? <CheckCircle2 size={14} /> : <Key size={14} />}
            {connected ? "KeeperHub Connected" : "Sign in to KeeperHub"}
          </button>

          <a
            href="https://app.keeperhub.com"
            target="_blank"
            rel="noopener noreferrer"
            title="Open KeeperHub Web App"
            className="btn"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid var(--border)", color: "var(--text)", display: "flex", alignItems: "center", gap: 8, textDecoration: "none" }}
          >
            <ExternalLink size={14} /> KeeperHub Dashboard ↗
          </a>

          <button
            onClick={loadWorkflows}
            className="btn"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8 }}
          >
            <RefreshCw size={14} style={{ animation: spinning ? "spin 0.8s linear infinite" : "none" }} /> Refresh
          </button>
        </div>
      </div>

      <DemoModeBanner />
      <PersonalWalletBanner />
      <StaleDemoSessionBanner />
      <DualWalletPayrollNotice />

      <div className="grid-metrics">
        <div className="card metric-card">
          <span className="metric-label">Scheduled Workflows</span>
          <div className="metric-value">{workflows.length}</div>
          <span className="metric-sub text-cyan">Payroll · DCA · Guardian · Yield</span>
        </div>
        <div className="card metric-card">
          <span className="metric-label">Active Triggers</span>
          <div className="metric-value" style={{ color: "#34d399" }}>
            {workflows.filter((w) => w.status === "active").length}
          </div>
          <span className="metric-sub text-green">Running on Cron Schedule</span>
        </div>
        <div className="card metric-card">
          <span className="metric-label">Target Network</span>
          <div className="metric-value" style={{ fontSize: 20 }}>Base Sepolia</div>
          <span className="metric-sub text-muted">KeeperHub Turnkey MPC</span>
        </div>
      </div>

      {/* Platform modules — breadth beyond scheduled payroll rows */}
      <div>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--text-muted)", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.05em" }}>
          Platform Modules
        </h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
          {PLATFORM_MODULES.map((mod) => {
            const Icon = mod.icon;
            const inner = (
              <div className="card card-interactive" style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 8, height: "100%" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: `${mod.color}18`, border: `1px solid ${mod.color}33`, display: "flex", alignItems: "center", justifyContent: "center", color: mod.color }}>
                    <Icon size={18} />
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>{mod.title}</div>
                    <span className="pill pill-success" style={{ fontSize: 9, marginTop: 4 }}>{mod.badge}</span>
                  </div>
                </div>
                <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0, lineHeight: 1.4 }}>{mod.desc}</p>
              </div>
            );
            return mod.external ? (
              <a key={mod.title} href={mod.href} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>
                {inner}
              </a>
            ) : (
              <Link key={mod.title} href={mod.href} style={{ textDecoration: "none" }}>
                {inner}
              </Link>
            );
          })}
        </div>
        <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 8 }}>
          Marketplace workflow ID: <code style={{ color: "#06b6d4" }}>{HF_READ_WORKFLOW_ID}</code>
        </p>
      </div>

      <KeeperHubSyncModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        walletAddress={wallet || ""}
        onKeySaved={() => setConnected(true)}
      />

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--text-muted)", margin: 0, textTransform: "uppercase", letterSpacing: "0.05em" }}>
          Scheduled Workflows
        </h3>
        {loading ? (
          <div className="card" style={{ color: "var(--text-muted)", textAlign: "center", padding: 40 }}>
            Fetching workflows from KeeperHub...
          </div>
        ) : workflows.length === 0 ? (
          <div className="card" style={{ color: "var(--text-muted)", textAlign: "center", padding: 40, display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
            <Cpu size={32} color="#818cf8" />
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)" }}>No Scheduled Workflows Yet</div>
              <div style={{ fontSize: 13, marginTop: 4 }}>
                Use <strong style={{ color: "#818cf8" }}>AI Chat</strong> or <strong style={{ color: "#818cf8" }}>Templates</strong> to add DCA, Guardian, or Yield workflows.
              </div>
            </div>
          </div>
        ) : (
          <>
            {showPagination && (
              <Pagination page={page} totalPages={totalPages} total={total} pageSize={PAGE_SIZE} onPageChange={setPage} />
            )}
            {pagedItems.map((wf) => {
              const color = typeColors[wf.type] ?? typeColors.default;
              const isExpanded = expandedId === wf.id;
              const verifyUrl = wf.recipientAddress
                ? `https://sepolia.basescan.org/address/${wf.recipientAddress}`
                : wf.type === "guardian" || wf.type === "yield"
                  ? "/resilience"
                  : "https://sepolia.basescan.org/";

              return (
                <div key={wf.id} className="card" style={{ display: "flex", flexDirection: "column", gap: 16, padding: "20px 24px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                      <div style={{ width: 44, height: 44, borderRadius: "var(--radius-sm)", background: `${color}18`, border: `1px solid ${color}33`, display: "flex", alignItems: "center", justifyContent: "center", color, fontWeight: 800, fontSize: 12 }}>
                        {wf.type.slice(0, 3).toUpperCase()}
                      </div>

                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>
                            {workflowTitle(wf)}
                          </span>
                          <span className={`pill ${wf.status === "active" ? "pill-success" : "pill-warn"}`} style={{ fontSize: 10, textTransform: "uppercase" }}>
                            {wf.status}
                          </span>
                        </div>

                        <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 6, fontSize: 12, color: "var(--text-muted)", flexWrap: "wrap" }}>
                          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            <Clock size={12} />
                            <strong style={{ color: "var(--text)" }}>{humanCron(wf.cronSchedule)}</strong>
                          </span>
                          {wf.recipientAddress && (
                            <span>
                              Recipient:{" "}
                              <a href={verifyUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#818cf8", textDecoration: "none", fontFamily: "monospace" }}>
                                {wf.recipientAddress.slice(0, 8)}...{wf.recipientAddress.slice(-6)} <ExternalLink size={10} style={{ display: "inline" }} />
                              </a>
                            </span>
                          )}
                          <span style={{ fontFamily: "monospace", color: "#94a3b8" }}>
                            ID: {wf.id.slice(0, 8)}...
                          </span>
                        </div>
                      </div>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : wf.id)}
                        className="btn"
                        style={{ fontSize: 12, padding: "8px 12px", background: "rgba(255,255,255,0.05)", border: "1px solid var(--border)", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 6 }}
                      >
                        <Code size={12} /> {isExpanded ? "Hide Details" : "Inspect Payload"} {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                      </button>

                      {isKeeperHubWorkflowId(wf.keeperhubWorkflowId ?? "") ? (
                        <KeeperHubWorkflowLink workflowId={wf.keeperhubWorkflowId!} />
                      ) : (
                        <span className="btn" style={{ fontSize: 12, padding: "8px 12px", background: "rgba(255,255,255,0.03)", border: "1px solid var(--border)", color: "var(--text-muted)", opacity: 0.5 }} title="Not synced to KeeperHub yet">
                          KeeperHub pending
                        </span>
                      )}

                      {wf.type === "payroll" && wf.recipientAddress ? (
                        <a href={verifyUrl} target="_blank" rel="noopener noreferrer" title="Verify recipient wallet on Sepolia Etherscan" className="btn" style={{ fontSize: 12, padding: "8px 12px", background: "rgba(52,211,153,0.08)", border: "1px solid rgba(52,211,153,0.25)", color: "#34d399", textDecoration: "none", display: "flex", alignItems: "center", gap: 6 }}>
                          Etherscan <ExternalLink size={12} />
                        </a>
                      ) : wf.type === "guardian" || wf.type === "yield" ? (
                        <Link href="/resilience" className="btn" style={{ fontSize: 12, padding: "8px 12px", background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.25)", color: "#818cf8", textDecoration: "none", display: "flex", alignItems: "center", gap: 6 }}>
                          Proofs <ExternalLink size={12} />
                        </Link>
                      ) : null}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="animate-in" style={{ marginTop: 8, padding: 16, borderRadius: 8, background: "rgba(0,0,0,0.3)", border: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 12, fontFamily: "monospace", fontSize: 12 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", color: "#818cf8", fontWeight: 700 }}>
                        <span>🛠️ KeeperHub Turnkey MPC Payload</span>
                        <span>Network: Base Sepolia (84532)</span>
                      </div>

                      {wf.type === "guardian" && (
                        <p style={{ color: "var(--text-muted)", margin: 0, lineHeight: 1.5 }}>
                          Agent cron executes Guardian every 5 minutes. On HF &lt; 1.15, creates manual KeeperHub workflow with approve + repay steps. See /resilience for mined proofs.
                        </p>
                      )}
                      {wf.type === "yield" && (
                        <p style={{ color: "var(--text-muted)", margin: 0, lineHeight: 1.5 }}>
                          Agent cron compares Aave vs Compound USDC supply APY every 15 minutes. Rotates when delta covers gas (requires same-wallet setup).
                        </p>
                      )}
                      {wf.type === "dca" && (
                        <p style={{ color: "var(--text-muted)", margin: 0, lineHeight: 1.5 }}>
                          Uniswap V3 exactInputSingle: {wf.amount} USDC → WETH. Local agent executor (remote cron disabled). 0.5% max slippage.
                        </p>
                      )}
                      {wf.type === "payroll" && (
                        <>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, color: "var(--text-muted)" }}>
                            <div>
                              <span>Target Contract:</span>
                              <div style={{ color: "var(--text)", marginTop: 2 }}>0xba50Cd2A20f6DA35D788639E581bca8d0B5d4D5f (USDC)</div>
                            </div>
                            <div>
                              <span>Recipient:</span>
                              <div style={{ color: "var(--text)", marginTop: 2 }}>{wf.recipientAddress || "N/A"}</div>
                            </div>
                            <div>
                              <span>Trigger / Schedule:</span>
                              <div style={{ color: "var(--text)", marginTop: 2 }}>Cron ({wf.cronSchedule})</div>
                            </div>
                          </div>
                          <div style={{ background: "rgba(255,255,255,0.03)", padding: 10, borderRadius: 6, border: "1px solid rgba(255,255,255,0.05)" }}>
                            <span style={{ color: "#fbbf24", fontWeight: 700 }}>Raw ERC20 transfer calldata:</span>
                            <div style={{ wordBreak: "break-all", color: "#94a3b8", marginTop: 4, fontSize: 11 }}>
                              0xa9059cbb000000000000000000000000{(wf.recipientAddress || wallet).replace("0x", "").toLowerCase().padStart(64, "0")}{(wf.amount * 1e6).toString(16).padStart(64, "0")}
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {showPagination && (
              <Pagination page={page} totalPages={totalPages} total={total} pageSize={PAGE_SIZE} onPageChange={setPage} />
            )}
          </>
        )}
      </div>
    </div>
  );
}
