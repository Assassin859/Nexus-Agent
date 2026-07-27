import { ExternalLink, CheckCircle2, AlertTriangle, XCircle, Clock } from "lucide-react";

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
          <span className="status-pill status-pill-success">
            <CheckCircle2 size={13} /> Executed
          </span>
        );
      case "reverted_simulation":
        return (
          <span className="status-pill status-pill-warning">
            <AlertTriangle size={13} /> Caught Revert (Gas Saved)
          </span>
        );
      case "reverted_chain":
        return (
          <span className="status-pill status-pill-danger">
            <XCircle size={13} /> Chain Revert
          </span>
        );
      default:
        return (
          <span className="status-pill status-pill-info">
            <Clock size={13} className="animate-spin" /> Pending
          </span>
        );
    }
  };

  return (
    <div className="glass-card glass-card-interactive p-6 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-11 h-11 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center font-extrabold text-sm text-indigo-400">
            {action.slice(0, 3).toUpperCase()}
          </div>
          <div>
            <h4 className="font-heading font-bold text-lg capitalize text-white">{action} Action</h4>
            <p className="text-xs text-[var(--color-text-muted)] font-medium mt-0.5">
              {amount > 0 ? `${amount} ${asset}` : "Simulation Run"}
            </p>
          </div>
        </div>
        {getBadge()}
      </div>

      {reason && (
        <div className="text-xs p-3.5 rounded-xl bg-white/[0.03] border border-white/10 text-slate-300 font-mono leading-relaxed">
          <span className="font-bold text-amber-400">Reason: </span>
          {reason}
        </div>
      )}

      <div className="flex items-center justify-between text-xs text-[var(--color-text-muted)] pt-3 border-t border-white/5 font-medium">
        <span>{timestamp ? new Date(timestamp).toLocaleString() : "Just now"}</span>
        {txHash && (
          <a
            href={`https://sepolia.etherscan.io/tx/${txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-indigo-400 hover:text-indigo-300 font-semibold transition-colors"
          >
            <span>View on Etherscan</span>
            <ExternalLink size={13} />
          </a>
        )}
      </div>
    </div>
  );
}
