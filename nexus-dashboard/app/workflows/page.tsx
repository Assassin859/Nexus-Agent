"use client";

import { useEffect, useState } from "react";
import { Cpu, RefreshCw, Clock, ExternalLink, ShieldCheck, Key, Code, ChevronDown, ChevronUp, CheckCircle2 } from "lucide-react";
import { useWallet } from "@/context/WalletContext";
import { proxyFetch } from "@/lib/agent-fetch";
import KeeperHubSyncModal from "@/components/KeeperHubSyncModal";
import { isKeeperHubWorkflowId, keeperHubWorkflowUrl } from "@/lib/keeperhub-links";

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

  return cron;
}

export default function WorkflowsPage() {
  const { walletAddress: wallet, authToken } = useWallet();
  const [workflows, setWorkflows] = useState<WorkflowItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [spinning, setSpinning] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [connected, setConnected] = useState(true);

  async function loadWorkflows() {
    setSpinning(true);
    try {
      const res = await proxyFetch(`/api/portfolio/${wallet}`, {}, authToken);
      const data = await res.json();
      if (data && Array.isArray(data.workflows)) {
        setWorkflows(data.workflows);
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
    dca:     "#34d399",
    rotate:  "#f59e0b",
    default: "#94a3b8",
  };

  return (
    <div className="animate-in" style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      {/* Page Header */}
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
        <div>
          <h1 className="page-title">Active Workflows</h1>
          <p className="page-subtitle">Real-time registry of autonomous schedules &amp; triggers managed by KeeperHub MCP</p>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            onClick={() => setShowAuthModal(true)}
            className="btn"
            style={{
              background: connected ? "rgba(52,211,153,0.12)" : "rgba(99,102,241,0.12)",
              border: connected ? "1px solid rgba(52,211,153,0.3)" : "1px solid rgba(99,102,241,0.3)",
              color: connected ? "#34d399" : "#818cf8",
              display: "flex", alignItems: "center", gap: 8, cursor: "pointer"
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

      {/* Metrics Row */}
      <div className="grid-metrics">
        <div className="card metric-card">
          <span className="metric-label">Total Workflows</span>
          <div className="metric-value">{workflows.length}</div>
          <span className="metric-sub text-cyan">Registered on KeeperHub</span>
        </div>
        <div className="card metric-card">
          <span className="metric-label">Active Triggers</span>
          <div className="metric-value" style={{ color: "#34d399" }}>
            {workflows.filter(w => w.status === "active").length}
          </div>
          <span className="metric-sub text-green">Running on Cron Schedule</span>
        </div>
        <div className="card metric-card">
          <span className="metric-label">Target Network</span>
          <div className="metric-value" style={{ fontSize: 20 }}>Ethereum Sepolia</div>
          <span className="metric-sub text-muted">KeeperHub Turnkey MPC</span>
        </div>
      </div>

      {/* KeeperHub Sync Modal */}
      <KeeperHubSyncModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        walletAddress={wallet || ""}
        onKeySaved={() => setConnected(true)}
      />

      {/* Workflow Cards List */}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {loading ? (
          <div className="card" style={{ color: "var(--text-muted)", textAlign: "center", padding: 40 }}>
            Fetching workflows from KeeperHub...
          </div>
        ) : workflows.length === 0 ? (
          <div className="card" style={{ color: "var(--text-muted)", textAlign: "center", padding: 40, display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
            <Cpu size={32} color="#818cf8" />
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)" }}>No Active Workflows Found</div>
              <div style={{ fontSize: 13, marginTop: 4 }}>
                Trigger a command in <strong style={{ color: "#818cf8" }}>AI Chat</strong> or select a template from <strong style={{ color: "#818cf8" }}>Templates</strong> to deploy a workflow.
              </div>
            </div>
          </div>
        ) : (
          workflows.map((wf) => {
            const color = typeColors[wf.type] ?? typeColors.default;
            const isExpanded = expandedId === wf.id;
            const verifyUrl = wf.recipientAddress
              ? `https://sepolia.basescan.org/address/${wf.recipientAddress}`
              : `https://sepolia.basescan.org/`;

            return (
              <div key={wf.id} className="card" style={{ display: "flex", flexDirection: "column", gap: 16, padding: "20px 24px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                    {/* Type badge */}
                    <div style={{ width: 44, height: 44, borderRadius: "var(--radius-sm)", background: `${color}18`, border: `1px solid ${color}33`, display: "flex", alignItems: "center", justifyContent: "center", color, fontWeight: 800, fontSize: 12 }}>
                      {wf.type.slice(0, 3).toUpperCase()}
                    </div>

                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", textTransform: "capitalize" }}>
                          {wf.type} Strategy — {wf.amount} USDC
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
                            <a
                              href={verifyUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ color: "#818cf8", textDecoration: "none", fontFamily: "monospace" }}
                            >
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

                  {/* Actions */}
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : wf.id)}
                      className="btn"
                      style={{ fontSize: 12, padding: "8px 12px", background: "rgba(255,255,255,0.05)", border: "1px solid var(--border)", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 6 }}
                    >
                      <Code size={12} /> {isExpanded ? "Hide Calldata" : "Inspect Payload"} {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    </button>

                    <a
                      href={keeperHubWorkflowUrl(wf.keeperhubWorkflowId) ?? "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn"
                      onClick={(e) => {
                        if (!isKeeperHubWorkflowId(wf.keeperhubWorkflowId ?? "")) e.preventDefault();
                      }}
                      style={{
                        fontSize: 12,
                        padding: "8px 12px",
                        background: isKeeperHubWorkflowId(wf.keeperhubWorkflowId ?? "")
                          ? "rgba(99,102,241,0.1)"
                          : "rgba(255,255,255,0.03)",
                        border: isKeeperHubWorkflowId(wf.keeperhubWorkflowId ?? "")
                          ? "1px solid rgba(99,102,241,0.3)"
                          : "1px solid var(--border)",
                        color: isKeeperHubWorkflowId(wf.keeperhubWorkflowId ?? "") ? "#818cf8" : "var(--text-muted)",
                        textDecoration: "none",
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        pointerEvents: isKeeperHubWorkflowId(wf.keeperhubWorkflowId ?? "") ? "auto" : "none",
                        opacity: isKeeperHubWorkflowId(wf.keeperhubWorkflowId ?? "") ? 1 : 0.5,
                      }}
                      title={
                        isKeeperHubWorkflowId(wf.keeperhubWorkflowId ?? "")
                          ? "Open on KeeperHub"
                          : "Not synced to KeeperHub yet"
                      }
                    >
                      View on KeeperHub <ExternalLink size={12} />
                    </a>

                    <a
                      href={verifyUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Verify recipient wallet on Sepolia Etherscan"
                      className="btn"
                      style={{ fontSize: 12, padding: "8px 12px", background: "rgba(52,211,153,0.08)", border: "1px solid rgba(52,211,153,0.25)", color: "#34d399", textDecoration: "none", display: "flex", alignItems: "center", gap: 6 }}
                    >
                      Etherscan <ExternalLink size={12} />
                    </a>
                  </div>
                </div>

                {/* Expanded Calldata & MPC Payload Inspector */}
                {isExpanded && (
                  <div className="animate-in" style={{
                    marginTop: 8, padding: 16, borderRadius: 8,
                    background: "rgba(0,0,0,0.3)", border: "1px solid var(--border)",
                    display: "flex", flexDirection: "column", gap: 12, fontFamily: "monospace", fontSize: 12
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", color: "#818cf8", fontWeight: 700 }}>
                      <span>🛠️ KeeperHub Turnkey MPC Payload &amp; Calldata</span>
                      <span>Network: Base Sepolia (84532)</span>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, color: "var(--text-muted)" }}>
                      <div>
                        <span style={{ color: "var(--text-muted)" }}>Target Contract:</span>
                        <div style={{ color: "var(--text)", marginTop: 2 }}>0xba50Cd2A20f6DA35D788639E581bca8d0B5d4D5f (USDC)</div>
                      </div>

                      <div>
                        <span style={{ color: "var(--text-muted)" }}>Recipient Address:</span>
                        <div style={{ color: "var(--text)", marginTop: 2 }}>{wf.recipientAddress || "N/A"}</div>
                      </div>

                      <div>
                        <span style={{ color: "var(--text-muted)" }}>Trigger Type / Schedule:</span>
                        <div style={{ color: "var(--text)", marginTop: 2 }}>Cron ({wf.cronSchedule})</div>
                      </div>

                      <div>
                        <span style={{ color: "var(--text-muted)" }}>MEV Protection &amp; Gas:</span>
                        <div style={{ color: "#34d399", marginTop: 2 }}>Flashbots Bundler (Standard Gas)</div>
                      </div>
                    </div>

                    <div style={{ background: "rgba(255,255,255,0.03)", padding: 10, borderRadius: 6, border: "1px solid rgba(255,255,255,0.05)" }}>
                      <span style={{ color: "#fbbf24", fontWeight: 700 }}>Raw ERC20 Calldata:</span>
                      <div style={{ wordBreak: "break-all", color: "#94a3b8", marginTop: 4, fontSize: 11 }}>
                        0xa9059cbb000000000000000000000000{(wf.recipientAddress || wallet).replace("0x","").toLowerCase().padStart(64, "0")}{(wf.amount * 1e6).toString(16).padStart(64, "0")}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

