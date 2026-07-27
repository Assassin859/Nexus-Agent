import { ExternalLink, CheckCircle2, AlertTriangle, XCircle, Clock } from "lucide-react";
import clsx from "clsx";

export type TransactionStatus = "success" | "reverted_simulation" | "reverted_chain" | "pending";

type TransactionCardProps = {
  action: string;
  amount: number;
  asset?: string;
  status: TransactionStatus;
  timestamp?: string;
  txHash?: string;
  reason?: string;
};

export default function TransactionCard({
  action,
  amount,
  asset = "USDC",
  status,
  timestamp,
  txHash,
  reason,
}: TransactionCardProps) {
  const getBadge = () => {
    switch (status) {
      case "success":
        return (
          <span className="badge badge-success">
            <CheckCircle2 size={12} /> Executed
          </span>
        );
      case "reverted_simulation":
        return (
          <span className="badge badge-warning">
            <AlertTriangle size={12} /> Caught Revert (Gas Saved)
          </span>
        );
      case "reverted_chain":
        return (
          <span className="badge badge-danger">
            <XCircle size={12} /> Chain Revert
          </span>
        );
      default:
        return (
          <span className="badge badge-neutral">
            <Clock size={12} className="animate-spin" /> Pending
          </span>
        );
    }
  };

  return (
    <div className="glass glass-hover p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center font-bold text-sm text-[var(--color-primary)]">
            {action.slice(0, 3).toUpperCase()}
          </div>
          <div>
            <h4 className="font-heading font-semibold text-base capitalize">{action} Action</h4>
            <p className="text-xs text-[var(--color-text-muted)]">
              {amount > 0 ? `${amount} ${asset}` : "Simulation Run"}
            </p>
          </div>
        </div>
        {getBadge()}
      </div>

      {reason && (
        <div className="text-xs p-3 rounded-lg bg-white/5 border border-[var(--color-border)] text-[var(--color-text-muted)]">
          <span className="font-semibold text-white">Reason: </span>
          {reason}
        </div>
      )}

      <div className="flex items-center justify-between text-xs text-[var(--color-text-muted)] pt-2 border-t border-[var(--color-border)]">
        <span>{timestamp ? new Date(timestamp).toLocaleString() : "Just now"}</span>
        {txHash && (
          <a
            href={`https://sepolia.etherscan.io/tx/${txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-[var(--color-primary)] hover:underline"
          >
            <span>Etherscan</span>
            <ExternalLink size={12} />
          </a>
        )}
      </div>
    </div>
  );
}
