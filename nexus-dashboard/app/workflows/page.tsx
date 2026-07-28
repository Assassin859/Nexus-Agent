"use client";

import { useEffect, useState } from "react";
import { Cpu, RefreshCw, Clock, ExternalLink } from "lucide-react";
import { useWallet } from "@/context/WalletContext";

type WorkflowItem = {
  id: string;
  userWallet: string;
  type: string;
  recipientAddress?: string;
  amount: number;
  cronSchedule: string;
  status: "active" | "paused" | "completed";
  createdAt?: string;
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

  // Every day
  if (dow === "*" && dom === "*") return `Every day at ${time}`;

  // Specific weekday
  if (dow !== "*" && dom === "*") {
    if (DAYS[dow]) return `Every ${DAYS[dow]} at ${time}`;
  }

  // Biweekly (e.g. 1,15)
  if (dom.includes(",")) return `On the ${dom.replace(",", "th & ")}th of each month at ${time}`;

  // Monthly
  if (dom !== "*" && dow === "*") {
    const suffix = dom === "1" ? "st" : dom === "2" ? "nd" : dom === "3" ? "rd" : "th";
    return `On the ${dom}${suffix} of each month at ${time}`;
  }

  return cron; // fallback
}

export default function WorkflowsPage() {
  const { walletAddress: wallet } = useWallet();
  const [workflows, setWorkflows] = useState<WorkflowItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [spinning, setSpinning] = useState(false);

  async function loadWorkflows() {
    setSpinning(true);
    try {
      const res = await fetch(`/api/portfolio/${wallet}`);
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
  }, [wallet]);

  const typeColors: Record<string, string> = {
    payroll: "#818cf8",
    dca:     "#34d399",
    rotate:  "#f59e0b",
    default: "#94a3b8",
  };

  return (
    <div className="animate-in" style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
        <div>
          <h1 className="page-title">Active Workflows</h1>
          <p className="page-subtitle">Real-time registry of autonomous schedules &amp; triggers managed by KeeperHub MCP</p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <a
            href="https://app.keeperhub.com"
            target="_blank"
            rel="noopener noreferrer"
            title="Sign in to KeeperHub to view your remote workflows"
            className="btn"
            style={{ background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.3)", color: "#818cf8", display: "flex", alignItems: "center", gap: 8, textDecoration: "none" }}
          >
            <ExternalLink size={14} /> Sign in to KeeperHub
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

      {/* Workflow Cards */}
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
            // Link to Etherscan for recipient (publicly verifiable without login)
            const verifyUrl = wf.recipientAddress
              ? `https://sepolia.etherscan.io/address/${wf.recipientAddress}`
              : `https://sepolia.etherscan.io/`;

            return (
              <div key={wf.id} className="card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16, padding: "20px 24px" }}>
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
                            href={`https://sepolia.etherscan.io/address/${wf.recipientAddress}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: "#818cf8", textDecoration: "none", fontFamily: "monospace" }}
                          >
                            {wf.recipientAddress.slice(0, 8)}...{wf.recipientAddress.slice(-6)} ↗
                          </a>
                        </span>
                      )}
                      <span style={{ fontFamily: "monospace", color: "#94a3b8" }}>
                        ID: {wf.id.slice(0, 8)}...
                      </span>
                    </div>
                  </div>
                </div>

                {/* Verify recipient on Etherscan (no login required) */}
                <a
                  href={verifyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Verify recipient wallet on Sepolia Etherscan (no login required)"
                  className="btn"
                  style={{ fontSize: 12, padding: "8px 14px", background: "rgba(52,211,153,0.08)", border: "1px solid rgba(52,211,153,0.25)", color: "#34d399", textDecoration: "none", display: "flex", alignItems: "center", gap: 7, whiteSpace: "nowrap" }}
                >
                  Verify on Etherscan <ExternalLink size={12} />
                </a>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
