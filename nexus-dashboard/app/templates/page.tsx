import { Shield, Calendar, Repeat, Banknote, Bell, Scale, ArrowRight } from "lucide-react";

const TEMPLATES = [
  {
    icon: Shield,
    color: "#6366f1",
    title: "Aave Guardian",
    desc: "Auto-repay loan debt when Health Factor drops below 1.15 on Aave V3 Sepolia.",
    tag: "Lending Protection",
  },
  {
    icon: Calendar,
    color: "#22c55e",
    title: "USDC → ETH Weekly DCA",
    desc: "Automated weekly token purchase on Uniswap V3 with strict 0.5% MEV slippage cap.",
    tag: "Dollar-Cost Avg",
  },
  {
    icon: Repeat,
    color: "#3b82f6",
    title: "Stablecoin Yield Rotator",
    desc: "Moves USDC allocations between Aave, Compound, and Morpho when 90-day profit covers gas.",
    tag: "Yield Optimization",
  },
  {
    icon: Banknote,
    color: "#a855f7",
    title: "Developer Payroll",
    desc: "Recurring scheduled token transfer targeting recipient wallets with safety ceilings.",
    tag: "DAO Payroll",
  },
  {
    icon: Bell,
    color: "#f59e0b",
    title: "Liquidation Notifier",
    desc: "Dispatches instant alerts when lending positions cross warning threshold (1.40 HF).",
    tag: "Monitoring",
  },
  {
    icon: Scale,
    color: "#ec4899",
    title: "Multi-Protocol Rebalancer",
    desc: "Maintains 33/33/33 balanced distribution across Aave, Compound, and Morpho Blue.",
    tag: "Rebalancing",
  },
];

export default function TemplatesPage() {
  return (
    <div className="flex flex-col gap-8 animate-fade-up">
      <div>
        <h1 className="section-title">Workflow Template Store</h1>
        <p className="section-subtitle">Pre-configured KeeperHub automations — Fork and deploy in 60 seconds</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {TEMPLATES.map((tmpl, index) => {
          const Icon = tmpl.icon;
          return (
            <div key={index} className="glass glass-hover p-6 flex flex-col justify-between gap-6">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: `${tmpl.color}20`, color: tmpl.color }}>
                    <Icon size={24} />
                  </div>
                  <span className="badge badge-success">Deploy in 60s</span>
                </div>
                <h3 className="font-heading font-bold text-lg mb-2">{tmpl.title}</h3>
                <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">{tmpl.desc}</p>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-[var(--color-border)]">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">{tmpl.tag}</span>
                <button className="btn-ghost py-1.5 px-3 text-xs">
                  <span>Fork Template</span>
                  <ArrowRight size={14} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
