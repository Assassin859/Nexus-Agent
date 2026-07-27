"use client";

import TransactionCard from "@/components/TransactionCard";

const MOCK_FEED = [
  {
    action: "repay",
    amount: 500,
    asset: "USDC",
    status: "success" as const,
    timestamp: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    txHash: "0x1111111111111111111111111111111111111111111111111111111111111111",
  },
  {
    action: "swap",
    amount: 100,
    asset: "USDC",
    status: "reverted_simulation" as const,
    timestamp: new Date(Date.now() - 1000 * 60 * 180).toISOString(),
    reason: "Gas fee of $8.50 exceeds 5% threshold of purchase value ($5.00 limit). Swap delayed by 60 minutes.",
  },
  {
    action: "dca",
    amount: 100,
    asset: "USDC",
    status: "pending" as const,
    timestamp: new Date().toISOString(),
  },
];

export default function FeedPage() {
  return (
    <div className="flex flex-col gap-8 animate-fade-up">
      <div>
        <h1 className="section-title">Live Execution Feed</h1>
        <p className="section-subtitle">Real-time audit log of autonomous transactions managed by KeeperHub MCP</p>
      </div>

      {/* Execution Stepper Bar */}
      <div className="glass p-6 flex items-center justify-between">
        {["Triggered", "Simulating", "Broadcasting", "Mined"].map((step, idx) => (
          <div key={step} className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${idx <= 2 ? "bg-[var(--color-primary)] text-white" : "bg-white/10 text-[var(--color-text-muted)]"}`}>
              {idx + 1}
            </div>
            <span className={`text-sm font-semibold ${idx <= 2 ? "text-white" : "text-[var(--color-text-muted)]"}`}>{step}</span>
            {idx < 3 && <div className="w-12 h-0.5 bg-white/10 hidden md:block"></div>}
          </div>
        ))}
      </div>

      {/* Activity List */}
      <div className="flex flex-col gap-4">
        {MOCK_FEED.map((item, index) => (
          <TransactionCard key={index} {...item} />
        ))}
      </div>
    </div>
  );
}
