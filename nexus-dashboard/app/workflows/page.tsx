"use client";

import { useEffect, useState } from "react";
import { Cpu, RefreshCw, CheckCircle2, Clock, PauseCircle, Trash2, ArrowUpRight } from "lucide-react";

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

export default function WorkflowsPage() {
  const wallet = process.env.NEXT_PUBLIC_WALLET_ADDRESS || "0x89f97cb35236a1d0190fb25b31c5c0ff4107ec1b";
  const [workflows, setWorkflows] = useState<WorkflowItem[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadWorkflows() {
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
    }
  }

  useEffect(() => {
    loadWorkflows();
    const interval = setInterval(loadWorkflows, 5000);
    return () => clearInterval(interval);
  }, [wallet]);

  return (
    <div className="animate-in" style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
        <div>
          <h1 className="page-title">Active Workflows</h1>
          <p className="page-subtitle">Real-time registry of autonomous cron schedules &amp; triggers managed by KeeperHub MCP</p>
        </div>
        <button onClick={loadWorkflows} className="btn" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8 }}>
          <RefreshCw size={14} className={loading ? "spin" : ""} /> Refresh List
        </button>
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

      {/* Workflows List */}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {loading ? (
          <div className="card" style={{ color: "var(--text-muted)", textAlign: "center", padding: 40 }}>
            Fetching active workflows from KeeperHub...
          </div>
        ) : workflows.length === 0 ? (
          <div className="card" style={{ color: "var(--text-muted)", textAlign: "center", padding: 40, display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
            <Cpu size={32} color="#818cf8" />
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)" }}>No Active Workflows Found</div>
              <div style={{ fontSize: 13, marginTop: 4 }}>Trigger a command in <strong style={{ color: "#818cf8" }}>AI Chat</strong> or select a template from <strong style={{ color: "#818cf8" }}>Templates Catalog</strong> to deploy a workflow.</div>
            </div>
          </div>
        ) : (
          workflows.map((wf) => (
            <div key={wf.id} className="card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16, padding: "20px 24px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <div style={{ width: 44, height: 44, borderRadius: "var(--radius-sm)", background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.2)", display: "flex", alignItems: "center", justifyContent: "center", color: "#818cf8", fontWeight: 800, fontSize: 13 }}>
                  {wf.type.slice(0, 3).toUpperCase()}
                </div>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 16, fontWeight: 700, color: "var(--text)", textTransform: "capitalize" }}>
                      {wf.type} Strategy ({wf.amount} USDC)
                    </span>
                    <span className="pill pill-success" style={{ textTransform: "uppercase", fontSize: 10 }}>
                      {wf.status}
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 6, fontSize: 12, color: "var(--text-muted)", fontFamily: "ui-monospace, monospace" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <Clock size={13} /> Schedule: {wf.cronSchedule}
                    </span>
                    {wf.recipientAddress && (
                      <span>Recipient: {wf.recipientAddress.slice(0, 8)}...{wf.recipientAddress.slice(-6)}</span>
                    )}
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span className="pill" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid var(--border)", color: "var(--text-muted)", fontFamily: "monospace" }}>
                  ID: {wf.id.slice(0, 8)}...
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
