import { ExternalLink, CheckCircle2, AlertTriangle, XCircle, Clock } from "lucide-react";

export type TransactionStatus = "success" | "reverted_simulation" | "reverted_chain" | "pending";

type Props = {
  action: string;
  amount: number;
  asset?: string;
  status: TransactionStatus;
  timestamp?: string;
  txHash?: string;
  reason?: string;
};

export default function TransactionCard({ action, amount, asset = "USDC", status, timestamp, txHash, reason }: Props) {
  const badge = {
    success:              <span className="pill pill-success"><CheckCircle2 size={12} /> Executed</span>,
    reverted_simulation:  <span className="pill pill-warning"><AlertTriangle size={12} /> Caught Revert</span>,
    reverted_chain:       <span className="pill pill-danger"><XCircle size={12} /> Chain Revert</span>,
    pending:              <span className="pill pill-cyan"><Clock size={12} /> Pending</span>,
  }[status];

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
            <div style={{ fontFamily: "var(--font-space-grotesk), sans-serif", fontWeight: 800, fontSize: 15, color: "var(--text)", textTransform: "capitalize" }}>
              {action} Action
            </div>
            <div style={{ fontSize: 12, color: "var(--text-2)", marginTop: 3, fontWeight: 500 }}>
              {amount > 0 ? `${amount} ${asset}` : "Simulation Run"}
            </div>
          </div>
        </div>
        {badge}
      </div>

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

      {/* Footer */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 10, borderTop: "1px solid var(--border)", fontSize: 12, color: "var(--text-muted)", fontWeight: 500 }}>
        <span>{timestamp ? new Date(timestamp).toLocaleString() : "Just now"}</span>
        {txHash && (
          <a
            href={`https://sepolia.etherscan.io/tx/${txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: "flex", alignItems: "center", gap: 5, color: "#818cf8", fontWeight: 600, transition: "color 0.15s ease" }}
          >
            View on Etherscan <ExternalLink size={12} />
          </a>
        )}
      </div>
    </div>
  );
}
