"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Shield, Calendar, Repeat, Banknote, Bell, Scale, ArrowRight } from "lucide-react";

const TEMPLATES = [
  { icon: Shield,    color: "#6366f1", title: "Aave Guardian",                desc: "Auto-repay loan debt when Health Factor drops below 1.15 on Aave V3 Sepolia.",                               tag: "Lending Protection", prompt: "Protect my Aave V3 position. Repay USDC if Health Factor drops below 1.15." },
  { icon: Calendar,  color: "#10b981", title: "USDC → ETH Weekly DCA",        desc: "Automated weekly token purchase on Uniswap V3 with strict 0.5% MEV slippage cap.",                          tag: "Dollar-Cost Avg",     prompt: "Buy 100 USDC worth of ETH every Monday at 9am using Uniswap V3." },
  { icon: Repeat,    color: "#3b82f6", title: "Stablecoin Yield Rotator",      desc: "Moves USDC allocations between Aave, Compound, and Morpho when 90-day profit covers gas.",                  tag: "Yield Optimization",  prompt: "Rotate USDC yield to Compound V3 when APY is 1% higher than Aave V3." },
  { icon: Banknote,  color: "#a855f7", title: "Developer Payroll",             desc: "Recurring scheduled token transfer targeting recipient wallets with safety ceilings.",                        tag: "DAO Payroll",          prompt: "Pay 200 USDC to 0x89f97cb35236a1d0190fb25b31c5c0ff4107ec1b every Friday." },
  { icon: Bell,      color: "#f59e0b", title: "Liquidation Notifier",          desc: "Dispatches instant alerts when lending positions cross warning threshold (1.40 HF).",                         tag: "Monitoring",           prompt: "Send alert notification if Aave Health Factor drops below 1.40." },
  { icon: Scale,     color: "#ec4899", title: "Multi-Protocol Rebalancer",     desc: "Maintains 33/33/33 balanced distribution across Aave, Compound, and Morpho Blue.",                           tag: "Rebalancing",          prompt: "Rebalance stablecoin portfolio evenly across Aave V3 and Compound V3." },
];

export default function TemplatesPage() {
  const router = useRouter();
  const [deploying, setDeploying] = useState<string | null>(null);

  const handleFork = (tmpl: typeof TEMPLATES[0]) => {
    setDeploying(tmpl.title);
    sessionStorage.setItem("pending_chat_prompt", tmpl.prompt);
    router.push("/chat");
  };

  return (
    <div className="animate-in" style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      <div className="page-header">
        <h1 className="page-title">Workflow Template Store</h1>
        <p className="page-subtitle">Pre-configured KeeperHub automations — Fork and deploy in 60 seconds</p>
      </div>

      <div className="grid-3">
        {TEMPLATES.map((tmpl) => {
          const Icon = tmpl.icon;
          const isSelected = deploying === tmpl.title;
          return (
            <div key={tmpl.title} className="card card-interactive tmpl-card">
              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                  <div
                    className="tmpl-icon"
                    style={{
                      width: 50, height: 50,
                      background: `${tmpl.color}18`,
                      color: tmpl.color,
                      border: `1px solid ${tmpl.color}30`,
                    }}
                  >
                    <Icon size={24} />
                  </div>
                  <span className="pill pill-success" style={{ fontSize: 10.5 }}>Deploy in 60s</span>
                </div>
                <div className="tmpl-name">{tmpl.title}</div>
                <p className="tmpl-desc">{tmpl.desc}</p>
              </div>
              <div className="tmpl-footer">
                <span className="tmpl-tag">{tmpl.tag}</span>
                <button
                  onClick={() => handleFork(tmpl)}
                  disabled={!!deploying}
                  className="btn btn-primary"
                  style={{ padding: "7px 14px", fontSize: 12 }}
                >
                  {isSelected ? "Deploying..." : "Fork & Deploy"} <ArrowRight size={13} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
