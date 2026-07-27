"use client";

import HealthGauge from "@/components/HealthGauge";
import { Shield, RefreshCw, Layers, ArrowUpRight, CheckCircle2 } from "lucide-react";

export default function PortfolioPage() {
  const walletAddress = process.env.NEXT_PUBLIC_WALLET_ADDRESS || "0x89f97cb35236a1d0190fb25b31c5c0ff4107ec1b";

  return (
    <div className="flex flex-col gap-8 animate-slide-up">
      {/* Top Header Strip */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="heading-title">Portfolio Overview</h1>
          <p className="heading-subtitle">
            Monitored Wallet: <span className="font-mono text-indigo-300 font-semibold">{walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}</span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="status-pill status-pill-success">
            <CheckCircle2 size={13} /> Sepolia Network Active
          </span>
        </div>
      </div>

      {/* Main Health Gauge & Metrics Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
        <HealthGauge value={1.87} label="Aave V3 Health Factor" size={260} />

        <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="glass-card flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs text-[var(--color-text-muted)] font-semibold uppercase tracking-wider">Collateral Value</span>
              <Shield size={20} className="text-emerald-400" />
            </div>
            <div className="mt-4">
              <span className="font-heading font-black text-4xl text-white tracking-tight">$12,400</span>
              <p className="text-xs text-emerald-400 font-medium mt-1">USDC & WETH Deposited</p>
            </div>
          </div>

          <div className="glass-card flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs text-[var(--color-text-muted)] font-semibold uppercase tracking-wider">Current Debt</span>
              <RefreshCw size={20} className="text-indigo-400" />
            </div>
            <div className="mt-4">
              <span className="font-heading font-black text-4xl text-white tracking-tight">$6,600</span>
              <p className="text-xs text-[var(--color-text-muted)] font-medium mt-1">USDC Borrowed</p>
            </div>
          </div>

          <div className="glass-card flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs text-[var(--color-text-muted)] font-semibold uppercase tracking-wider">LTV Ratio</span>
              <Layers size={20} className="text-amber-400" />
            </div>
            <div className="mt-4">
              <span className="font-heading font-black text-4xl text-white tracking-tight">53.2%</span>
              <div className="w-full bg-white/10 h-2 rounded-full mt-3 overflow-hidden">
                <div className="bg-gradient-to-r from-amber-500 to-amber-400 h-full w-[53.2%] rounded-full"></div>
              </div>
            </div>
          </div>

          <div className="glass-card flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs text-[var(--color-text-muted)] font-semibold uppercase tracking-wider">Active Workflows</span>
              <ArrowUpRight size={20} className="text-indigo-400" />
            </div>
            <div className="mt-4">
              <span className="font-heading font-black text-4xl text-white tracking-tight">3 Active</span>
              <p className="text-xs text-indigo-400 font-semibold mt-1">Guardian, DCA, Payroll</p>
            </div>
          </div>
        </div>
      </div>

      {/* Protocol APY Comparison Table */}
      <div className="glass-card p-7">
        <h3 className="font-heading font-bold text-xl text-white mb-6">Protocol APY Comparison</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-[var(--color-text-muted)] uppercase text-xs tracking-wider">
                <th className="pb-4 font-semibold">Protocol</th>
                <th className="pb-4 font-semibold">Asset</th>
                <th className="pb-4 font-semibold">Supply APY</th>
                <th className="pb-4 font-semibold">Borrow APY</th>
                <th className="pb-4 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 font-medium">
              <tr>
                <td className="py-4 font-bold text-white">Aave V3</td>
                <td className="text-slate-300">USDC</td>
                <td className="text-emerald-400 font-bold text-base">4.2%</td>
                <td className="text-slate-300">5.8%</td>
                <td><span className="status-pill status-pill-success">Current Position</span></td>
              </tr>
              <tr>
                <td className="py-4 font-bold text-white">Compound V3</td>
                <td className="text-slate-300">USDC</td>
                <td className="text-emerald-400 font-bold text-base">5.1%</td>
                <td className="text-slate-300">7.2%</td>
                <td><span className="status-pill status-pill-info">Monitored</span></td>
              </tr>
              <tr>
                <td className="py-4 font-bold text-white">Morpho Blue</td>
                <td className="text-slate-300">USDC</td>
                <td className="text-emerald-400 font-bold text-base">5.8%</td>
                <td className="text-slate-300">6.9%</td>
                <td><span className="status-pill status-pill-warning">Yield Opportunity (+1.6%)</span></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
