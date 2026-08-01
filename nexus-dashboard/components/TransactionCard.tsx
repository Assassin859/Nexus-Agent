"use client";

import { useState } from "react";
import { ExternalLink, CheckCircle2, AlertTriangle, XCircle, Clock, ChevronDown, ChevronUp, Cpu, Copy, Check } from "lucide-react";

export type TransactionStatus = "success" | "reverted_simulation" | "reverted_chain" | "pending" | "simulated_stub" | "delayed";

type Props = {
  action: string;
  amount: number;
  asset?: string;
  status: TransactionStatus;
  timestamp?: string;
  txHash?: string;
  reason?: string;
  aiAnalysis?: Record<string, any>;
};

export default function TransactionCard({
  action,
  amount,
  asset = "USDC",
  status,
  timestamp,
  txHash,
  reason,
  aiAnalysis,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const isStubTx = status === "simulated_stub" || !txHash || txHash.length !== 66 || txHash.includes("11111111") || txHash === "0x" + "1".repeat(64);

  // Strict workflow ID extraction — no executionId fallback (would 404 on /workflows/...)
  const rawWfId = aiAnalysis?.workflowId ?? aiAnalysis?.keeperhubWorkflowId;
  const khWorkflowId: string | null =
    typeof rawWfId === "string" && rawWfId.length > 0 && !rawWfId.includes("stub")
      ? rawWfId
      : null;

  function copyTxHash() {
    if (!txHash) return;
    navigator.clipboard.writeText(txHash);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // Provider Badge
  const providerBadge = isStubTx ? (
    <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 4, background: "rgba(245,158,11,0.12)", color: "#f59e0b", border: "1px solid rgba(245,158,11,0.25)", textTransform: "uppercase" }}>
      ⚡ Simulated
    </span>
  ) : status === "pending" ? (
    <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 4, background: "rgba(6,182,212,0.12)", color: "#22d3ee", border: "1px solid rgba(6,182,212,0.25)", textTransform: "uppercase" }}>
      ⏳ In-Flight
    </span>
  ) : (
    <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 4, background: "rgba(52,211,153,0.12)", color: "#34d399", border: "1px solid rgba(52,211,153,0.25)", textTransform: "uppercase" }}>
      🛡️ KeeperHub MPC
    </span>
  );

  const badge = {
    success:             <span className="pill pill-success"><CheckCircle2 size={12} /> Executed</span>,
    simulated_stub:      <span className="pill pill-warning" style={{ background: "rgba(245,158,11,0.15)", color: "#f59e0b", borderColor: "rgba(245,158,11,0.3)" }}><AlertTriangle size={12} /> Simulated</span>,
    reverted_simulation: <span className="pill pill-warning"><AlertTriangle size={12} /> ⚡ Pre-Flight Intercept</span>,
    reverted_chain:      <span className="pill pill-danger"><XCircle size={12} /> Chain Revert</span>,
    pending:             <span className="pill pill-cyan"><Clock size={12} /> Pending</span>,
    delayed:             <span className="pill pill-warning" style={{ background: "rgba(245,158,11,0.12)", color: "#fbbf24", borderColor: "rgba(245,158,11,0.3)" }}><Clock size={12} /> Delayed</span>,
  }[status] || <span className="pill pill-warning"><AlertTriangle size={12} /> Simulated</span>;

  return (
    <div className="card card-interactive" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Top row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12, flexShrink: 0,
            background: "rgba(99,102,241,0.10)",
            border: "1px solid rgba(99,102,241,0.2)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontWeight: 900, fontSize: 12, color: "#818cf8", letterSpacing: "0.04em"
          }}>
            {action.slice(0, 3).toUpperCase()}
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontFamily: "var(--font-space-grotesk), sans-serif", fontWeight: 800, fontSize: 15, color: "var(--text)", textTransform: "capitalize" }}>
                {action} Action
              </span>
              {providerBadge}
            </div>
            <div style={{ fontSize: 12, color: "var(--text-2)", marginTop: 3, fontWeight: 500 }}>
              {amount > 0 ? `${amount} ${asset}` : "Simulation Run"}
            </div>
          </div>
        </div>
        {badge}
      </div>

      {/* Copyable Tx Hash Row */}
      {txHash && (
        <div style={{
          fontSize: 11, fontFamily: "ui-monospace, monospace", padding: "6px 10px", borderRadius: 6,
          background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)",
          color: "var(--text-muted)", display: "flex", alignItems: "center", justifyContent: "space-between"
        }}>
          <span>Tx Hash: <strong style={{ color: "var(--text)" }}>{txHash.slice(0, 10)}...{txHash.slice(-8)}</strong></span>
          <button
            onClick={copyTxHash}
            style={{ background: "none", border: "none", color: "#818cf8", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, fontSize: 11 }}
          >
            {copied ? <Check size={12} color="#34d399" /> : <Copy size={12} />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      )}

      {/* Harness Summary Line — Guardian rows only */}
      {(() => {
        type Rec = { action?: string };
        const harnessAction = (aiAnalysis?.harnessRecommendation as Rec | undefined)?.action;
        const llmAction = (aiAnalysis?.llmRecommendation as Rec | undefined)?.action;
        const isOverride = aiAnalysis?.harnessOverride === true;
        if (!harnessAction) return null;
        return (
          <div style={{
            fontSize: 11, fontFamily: "ui-monospace, monospace", padding: "6px 10px", borderRadius: 6,
            background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.15)",
            color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap"
          }}>
            <span>🛡️ Harness: <strong style={{ color: "var(--text)" }}>{harnessAction}</strong></span>
            <span>· LLM: <strong style={{ color: "var(--text)" }}>{llmAction ?? "—"}</strong></span>
            {isOverride
              ? <span style={{ color: "#f87171" }}>· Override: YES</span>
              : <span style={{ color: "#34d399" }}>· Override: NO</span>}
          </div>
        );
      })()}

      {/* Reason block */}
      {reason && (
        <div style={{
          fontSize: 12, padding: "12px 14px", borderRadius: "var(--radius-sm)",
          background: "rgba(255,255,255,0.03)", border: "1px solid var(--border)",
          color: "var(--text-2)", fontFamily: "ui-monospace, monospace", lineHeight: 1.65
        }}>
          <span style={{ fontWeight: 700, color: "#fbbf24" }}>Reason: </span>{reason}
        </div>
      )}

      {/* AI Reasoning Panel toggle & container */}
      {aiAnalysis && Object.keys(aiAnalysis).length > 0 && (
        <div style={{ borderTop: "1px dashed var(--border)", paddingTop: 10 }}>
          <button
            onClick={() => setExpanded(!expanded)}
            style={{
              background: "transparent", border: "none", color: "#818cf8",
              fontSize: 12, fontWeight: 600, cursor: "pointer", display: "flex",
              alignItems: "center", gap: 6, padding: 0
            }}
          >
            <Cpu size={14} /> 🧠 AI Reasoning &amp; Decision Breakdown {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>

          {expanded && (
            <div className="animate-in" style={{
              marginTop: 10, padding: 12, borderRadius: 8,
              background: "rgba(99,102,241,0.05)", border: "1px solid rgba(99,102,241,0.15)",
              fontSize: 12, fontFamily: "monospace", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8
            }}>
              {Object.entries(aiAnalysis).map(([key, val]) => (
                <div key={key} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <span style={{ color: "var(--text-muted)", fontSize: 10, textTransform: "uppercase" }}>{key.replace(/([A-Z])/g, " $1")}</span>
                  <span style={{ color: typeof val === "boolean" ? (val ? "#34d399" : "#f87171") : "var(--text)", fontWeight: 700 }}>
                    {typeof val === "object" ? JSON.stringify(val) : String(val)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 10, borderTop: "1px solid var(--border)", fontSize: 12, color: "var(--text-muted)", fontWeight: 500, flexWrap: "wrap", gap: 8 }}>
        <span>{timestamp ? new Date(timestamp).toLocaleString() : "Just now"}</span>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {khWorkflowId ? (
            <a
              href={`https://app.keeperhub.com/workflows/${khWorkflowId}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: "flex", alignItems: "center", gap: 4, color: "#818cf8", fontWeight: 600, textDecoration: "none" }}
            >
              View on KeeperHub <ExternalLink size={12} />
            </a>
          ) : (
            <span style={{ color: "#64748b", fontWeight: 600, fontSize: 12 }}>
              🛡️ KeeperHub Managed
            </span>
          )}

          {!isStubTx && txHash && (
            <a
              href={`https://sepolia.basescan.org/tx/${txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: "flex", alignItems: "center", gap: 4, color: "#34d399", fontWeight: 600, textDecoration: "none" }}
            >
              Live BaseScan <ExternalLink size={12} />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
