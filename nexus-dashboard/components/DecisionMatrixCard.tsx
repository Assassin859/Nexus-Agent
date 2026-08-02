"use client";

import { CheckCircle2, Shield, RefreshCw, AlertTriangle, AlertOctagon, ShieldAlert, Layers } from "lucide-react";
import { HF_CRITICAL, HF_WARNING } from "@/lib/guardian-thresholds";

export type ExecutionLogItem = {
  id?: string;
  action: string;
  status: string;
  txHash?: string | null;
  aiAnalysis?: {
    healthFactor?: number;
    safetyStatus?: string;
    [key: string]: unknown;
  } | null;
};

type Props = {
  items: ExecutionLogItem[];
  loading?: boolean;
};

export function getDecisionBucket(item: ExecutionLogItem): "hold" | "partial" | "full" | "yield" | "blocked" | "other" {
  const { action, aiAnalysis } = item;
  const hf = aiAnalysis?.healthFactor;
  const ss = aiAnalysis?.safetyStatus;

  if (action === "hold") return "hold";
  if (action === "block_transaction") return "blocked";
  if (action === "rotate") return "yield";

  if (action === "repay" || action === "supply_collateral") {
    if (hf != null && hf < HF_CRITICAL) return "full";
    if (ss === "critical_liquidation_risk") return "full";
    if (hf != null && hf >= HF_CRITICAL && hf <= HF_WARNING) return "partial";
    if (ss === "warning") return "partial";
    if (hf != null && hf > HF_WARNING) return "other";
    return "partial";
  }

  return "other";
}

export default function DecisionMatrixCard({ items, loading }: Props) {
  const successfulExecutions = items.filter((i) => i.status === "success").length;

  const counts = {
    hold: 0,
    partial: 0,
    full: 0,
    yield: 0,
    blocked: 0,
    other: 0,
  };

  items.forEach((item) => {
    const bucket = getDecisionBucket(item);
    counts[bucket]++;
  });

  return (
    <div
      style={{
        background: "var(--card-bg)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)",
        padding: "20px",
        marginBottom: "24px",
      }}
    >
      {/* Top Bar: Summary Metric */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "16px",
          paddingBottom: "12px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div>
          <h3
            style={{
              fontSize: "16px",
              fontWeight: 700,
              color: "var(--text)",
              margin: 0,
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <Shield size={18} color="var(--primary)" />
            AI Decision Matrix &amp; Execution Proofs
          </h3>
          <p style={{ fontSize: "12px", color: "var(--text-muted)", margin: "4px 0 0 0" }}>
            Real-time breakdown of autonomous decision paths &amp; verified execution metrics.
          </p>
        </div>

        <div
          style={{
            background: "rgba(52, 211, 153, 0.1)",
            border: "1px solid rgba(52, 211, 153, 0.25)",
            borderRadius: "var(--radius-md)",
            padding: "8px 14px",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <CheckCircle2 size={16} color="#34d399" />
          <div>
            <div style={{ fontSize: "10px", textTransform: "uppercase", color: "#34d399", fontWeight: 700 }}>
              Successful Executions (Recent)
            </div>
            <div style={{ fontSize: "18px", fontWeight: 800, color: "var(--text)" }}>
              {loading ? "..." : successfulExecutions}
            </div>
          </div>
        </div>
      </div>

      {/* 5 AI Decision Paths Tiles */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
          gap: "12px",
        }}
      >
        {/* 🟢 Hold Path */}
        <div
          style={{
            background: "rgba(52, 211, 153, 0.05)",
            border: "1px solid rgba(52, 211, 153, 0.2)",
            borderRadius: "var(--radius-md)",
            padding: "12px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
            <span style={{ fontSize: "12px", fontWeight: 700, color: "#34d399", display: "flex", alignItems: "center", gap: "4px" }}>
              🟢 Hold Path
            </span>
            <Shield size={14} color="#34d399" />
          </div>
          <div style={{ fontSize: "20px", fontWeight: 800, color: "var(--text)" }}>
            {loading ? "-" : counts.hold}
          </div>
          <div style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "2px" }}>
            Hold · HF &gt; {HF_WARNING} (Healthy)
          </div>
        </div>

        {/* 🟡 Partial Repay Path */}
        <div
          style={{
            background: "rgba(245, 158, 11, 0.05)",
            border: "1px solid rgba(245, 158, 11, 0.2)",
            borderRadius: "var(--radius-md)",
            padding: "12px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
            <span style={{ fontSize: "12px", fontWeight: 700, color: "#f59e0b", display: "flex", alignItems: "center", gap: "4px" }}>
              🟡 Partial Repay
            </span>
            <AlertTriangle size={14} color="#f59e0b" />
          </div>
          <div style={{ fontSize: "20px", fontWeight: 800, color: "var(--text)" }}>
            {loading ? "-" : counts.partial}
          </div>
          <div style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "2px" }}>
            Repay · {HF_CRITICAL} ≤ HF ≤ {HF_WARNING}
          </div>
        </div>

        {/* 🔴 Full Repay Path */}
        <div
          style={{
            background: "rgba(239, 68, 68, 0.05)",
            border: "1px solid rgba(239, 68, 68, 0.2)",
            borderRadius: "var(--radius-md)",
            padding: "12px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
            <span style={{ fontSize: "12px", fontWeight: 700, color: "#ef4444", display: "flex", alignItems: "center", gap: "4px" }}>
              🔴 Full Repay
            </span>
            <AlertOctagon size={14} color="#ef4444" />
          </div>
          <div style={{ fontSize: "20px", fontWeight: 800, color: "var(--text)" }}>
            {loading ? "-" : counts.full}
          </div>
          <div style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "2px" }}>
            Repay · HF &lt; {HF_CRITICAL} (Critical)
          </div>
        </div>

        {/* 🔵 Yield Rotate Path */}
        <div
          style={{
            background: "rgba(59, 130, 246, 0.05)",
            border: "1px solid rgba(59, 130, 246, 0.2)",
            borderRadius: "var(--radius-md)",
            padding: "12px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
            <span style={{ fontSize: "12px", fontWeight: 700, color: "#60a5fa", display: "flex", alignItems: "center", gap: "4px" }}>
              🔵 Yield Rotate
            </span>
            <RefreshCw size={14} color="#60a5fa" />
          </div>
          <div style={{ fontSize: "20px", fontWeight: 800, color: "var(--text)" }}>
            {loading ? "-" : counts.yield}
          </div>
          <div style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "2px" }}>
            Rotate · dual-wallet skip logs
          </div>
        </div>

        {/* ⚪ Guarded / Blocked Path */}
        <div
          style={{
            background: "rgba(148, 163, 184, 0.05)",
            border: "1px solid rgba(148, 163, 184, 0.2)",
            borderRadius: "var(--radius-md)",
            padding: "12px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
            <span style={{ fontSize: "12px", fontWeight: 700, color: "#94a3b8", display: "flex", alignItems: "center", gap: "4px" }}>
              ⚪ Guarded
            </span>
            <ShieldAlert size={14} color="#94a3b8" />
          </div>
          <div style={{ fontSize: "20px", fontWeight: 800, color: "var(--text)" }}>
            {loading ? "-" : counts.blocked}
          </div>
          <div style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "2px" }}>
            Pending lock / risk block
          </div>
        </div>

        {/* Other — DCA, PayChain, proactive repay */}
        <div
          style={{
            background: "rgba(148, 163, 184, 0.03)",
            border: "1px solid rgba(148, 163, 184, 0.15)",
            borderRadius: "var(--radius-md)",
            padding: "12px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
            <span style={{ fontSize: "12px", fontWeight: 700, color: "#94a3b8", display: "flex", alignItems: "center", gap: "4px" }}>
              ⚪ Other
            </span>
            <Layers size={14} color="#94a3b8" />
          </div>
          <div style={{ fontSize: "20px", fontWeight: 800, color: "var(--text)" }}>
            {loading ? "-" : counts.other}
          </div>
          <div style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "2px" }}>
            DCA · PayChain · safe-HF repay
          </div>
        </div>
      </div>
    </div>
  );
}
