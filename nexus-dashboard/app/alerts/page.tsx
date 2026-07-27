import { AlertCircle, AlertTriangle, Info } from "lucide-react";

const ALERTS = [
  {
    type: "danger" as const,
    title: "Liquidation Risk Triggered",
    message: "Wallet 0x89f9... health factor dropped to 1.12. Guardian module initiated automated repayment of 500 USDC.",
    time: "45 minutes ago",
  },
  {
    type: "warning" as const,
    title: "DCA Swap Postponed (Gas Threshold)",
    message: "Weekly DCA swap of 100 USDC postponed. Gas fee ($8.50) exceeded 5% limit ($5.00 max). Retrying in 60m.",
    time: "3 hours ago",
  },
  {
    type: "warning" as const,
    title: "Repayment Cycle Budget Cap Reached",
    message: "Wallet 0xrisk... attempted repayment of 200 USDC, but only $50 remains in monthly cycle budget limit.",
    time: "5 hours ago",
  },
  {
    type: "info" as const,
    title: "Yield Rotation Monitored",
    message: "Morpho Blue APY is 5.8% vs current Aave V3 APY 4.2%. Rotation pending gas break-even evaluation.",
    time: "12 hours ago",
  },
];

export default function AlertsPage() {
  return (
    <div className="flex flex-col gap-8 animate-slide-up">
      <div>
        <h1 className="heading-title">Alerts & System Notifications</h1>
        <p className="heading-subtitle">Automated logging of risk events, limit hits, and execution status</p>
      </div>

      <div className="flex flex-col gap-4">
        {ALERTS.map((alert, index) => (
          <div
            key={index}
            className="glass-card p-6 flex items-start gap-5 border-l-4 transition-all duration-200 hover:translate-x-1"
            style={{
              borderLeftColor:
                alert.type === "danger"
                  ? "var(--color-danger)"
                  : alert.type === "warning"
                  ? "var(--color-warning)"
                  : "var(--color-primary)",
            }}
          >
            <div
              className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
              style={{
                background:
                  alert.type === "danger"
                    ? "rgba(244, 63, 94, 0.12)"
                    : alert.type === "warning"
                    ? "rgba(245, 158, 11, 0.12)"
                    : "rgba(99, 102, 241, 0.12)",
                color:
                  alert.type === "danger"
                    ? "#fb7185"
                    : alert.type === "warning"
                    ? "#fbbf24"
                    : "#818cf8",
              }}
            >
              {alert.type === "danger" && <AlertCircle size={20} />}
              {alert.type === "warning" && <AlertTriangle size={20} />}
              {alert.type === "info" && <Info size={20} />}
            </div>

            <div className="flex-1">
              <div className="flex items-center justify-between">
                <h4 className="font-heading font-bold text-lg text-white">{alert.title}</h4>
                <span className="text-xs text-[var(--color-text-muted)] font-medium">{alert.time}</span>
              </div>
              <p className="text-xs text-[var(--color-text-muted)] mt-1.5 leading-relaxed font-medium">
                {alert.message}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
