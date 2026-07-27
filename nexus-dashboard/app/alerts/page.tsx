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
    <div className="flex flex-col gap-8 animate-fade-up">
      <div>
        <h1 className="section-title">Alerts & System Notifications</h1>
        <p className="section-subtitle">Automated logging of risk events, limit hits, and execution status</p>
      </div>

      <div className="flex flex-col gap-4">
        {ALERTS.map((alert, index) => (
          <div key={index} className="glass p-5 flex items-start gap-4 border-l-4" style={{
            borderLeftColor: alert.type === "danger" ? "var(--color-danger)" : alert.type === "warning" ? "var(--color-warning)" : "var(--color-primary)"
          }}>
            {alert.type === "danger" && <AlertCircle className="text-[var(--color-danger)] shrink-0 mt-0.5" size={20} />}
            {alert.type === "warning" && <AlertTriangle className="text-[var(--color-warning)] shrink-0 mt-0.5" size={20} />}
            {alert.type === "info" && <Info className="text-[var(--color-primary)] shrink-0 mt-0.5" size={20} />}

            <div className="flex-1">
              <div className="flex items-center justify-between">
                <h4 className="font-heading font-semibold text-base">{alert.title}</h4>
                <span className="text-xs text-[var(--color-text-muted)]">{alert.time}</span>
              </div>
              <p className="text-xs text-[var(--color-text-muted)] mt-1 leading-relaxed">{alert.message}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
