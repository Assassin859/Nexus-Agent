"use client";

import HealthGauge from "@/components/HealthGauge";
import { Shield, RefreshCw, Layers, ArrowUpRight } from "lucide-react";

export default function PortfolioPage() {
  const walletAddress = process.env.NEXT_PUBLIC_WALLET_ADDRESS || "0x89f97cb35236a1d0190fb25b31c5c0ff4107ec1b";

  return (
    <div className="flex flex-col gap-8 animate-fade-up">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="section-title">Portfolio Overview</h1>
          <p className="section-subtitle">Monitored Wallet: <span className="font-mono text-white">{walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}</span></p>
        </div>
        <div className="flex items-center gap-3">
          <span className="badge badge-success">● Connected to Sepolia</span>
        </div>
      </div>

      {/* Main Health Gauge Hero */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
        <HealthGauge value={1.87} label="Aave V3 Health Factor" size={260} />

        <div className="lg:col-span-2 grid grid-cols-2 gap-4">
          <div className="glass p-6 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs text-[var(--color-text-muted)] font-medium">Collateral Value</span>
              <Shield size={18} className="text-emerald-400" />
            </div>
            <div>
              <span className="font-heading font-extrabold text-3xl">$12,400</span>
              <p className="text-xs text-emerald-400 mt-1">USDC & WETH Deposited</p>
            </div>
          </div>

          <div className="glass p-6 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs text-[var(--color-text-muted)] font-medium">Current Debt</span>
              <RefreshCw size={18} className="text-indigo-400" />
            </div>
            <div>
              <span className="font-heading font-extrabold text-3xl">$6,600</span>
              <p className="text-xs text-[var(--color-text-muted)] mt-1">USDC Borrowed</p>
            </div>
          </div>

          <div className="glass p-6 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs text-[var(--color-text-muted)] font-medium">LTV Ratio</span>
              <Layers size={18} className="text-amber-400" />
            </div>
            <div>
              <span className="font-heading font-extrabold text-3xl">53.2%</span>
              <div className="w-full bg-white/10 h-2 rounded-full mt-2 overflow-hidden">
                <div className="bg-amber-400 h-full w-[53.2%]"></div>
              </div>
            </div>
          </div>

          <div className="glass p-6 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs text-[var(--color-text-muted)] font-medium">Active Workflows</span>
              <ArrowUpRight size={18} className="text-indigo-400" />
            </div>
            <div>
              <span className="font-heading font-extrabold text-3xl">3 Active</span>
              <p className="text-xs text-[var(--color-primary)] mt-1">Guardian, DCA, Payroll</p>
            </div>
          </div>
        </div>
      </div>

      {/* Protocol APYs Table */}
      <div className="glass p-6">
        <h3 className="font-heading font-bold text-lg mb-4">Protocol APY Comparison</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] text-[var(--color-text-muted)]">
                <th className="pb-3">Protocol</th>
                <th className="pb-3">Asset</th>
                <th className="pb-3">Supply APY</th>
                <th className="pb-3">Borrow APY</th>
                <th className="pb-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              <tr>
                <td className="py-4 font-semibold">Aave V3</td>
                <td>USDC</td>
                <td className="text-emerald-400 font-semibold">4.2%</td>
                <td>5.8%</td>
                <td><span className="badge badge-success">Current Position</span></td>
              </tr>
              <tr>
                <td className="py-4 font-semibold">Compound V3</td>
                <td>USDC</td>
                <td className="text-emerald-400 font-semibold">5.1%</td>
                <td>7.2%</td>
                <td><span className="badge badge-neutral">Monitored</span></td>
              </tr>
              <tr>
                <td className="py-4 font-semibold">Morpho Blue</td>
                <td>USDC</td>
                <td className="text-emerald-400 font-semibold">5.8%</td>
                <td>6.9%</td>
                <td><span className="badge badge-warning">Yield Opportunity (+1.6%)</span></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
