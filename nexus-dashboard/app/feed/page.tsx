"use client";

import { useEffect, useState } from "react";
import { useWallet } from "@/context/WalletContext";
import { proxyFetch } from "@/lib/agent-fetch";
import TransactionCard from "@/components/TransactionCard";

type FeedItem = {
  action: string;
  amount: number;
  asset?: string;
  status: "success" | "reverted_simulation" | "reverted_chain" | "pending" | "simulated_stub";
  timestamp?: string;
  txHash?: string;
  reason?: string;
};

const STEPS = ["Triggered", "Simulating", "Broadcasting", "Mined"];

export default function FeedPage() {
  const { walletAddress, authToken } = useWallet();
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadFeed() {
      try {
        const res = await proxyFetch(`/api/feed/${walletAddress}`, {}, authToken);
        const data = await res.json();
        if (Array.isArray(data)) {
          setFeed(data);
        }
      } catch (err) {
        console.error("Failed to load feed:", err);
      } finally {
        setLoading(false);
      }
    }
    loadFeed();
    const interval = setInterval(loadFeed, 5000);
    return () => clearInterval(interval);
  }, [walletAddress, authToken]);

  return (
    <div className="animate-in" style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      <div className="page-header">
        <h1 className="page-title">Live Execution Feed</h1>
        <p className="page-subtitle">Real-time audit log of autonomous transactions managed by KeeperHub MCP</p>
      </div>

      {/* Stepper */}
      <div className="card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        {STEPS.map((step, idx) => (
          <div key={step} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div className={`step-num ${idx <= 2 ? "step-active" : "step-inactive"}`}>{idx + 1}</div>
            <span className="step-label" style={{ color: idx <= 2 ? "var(--text)" : "var(--text-muted)" }}>{step}</span>
            {idx < 3 && <div className="step-connector" />}
          </div>
        ))}
      </div>

      {/* Feed list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {loading ? (
          <div className="card" style={{ color: "var(--text-muted)", textAlign: "center", padding: 30 }}>
            Loading live execution feed...
          </div>
        ) : feed.length === 0 ? (
          <div className="card" style={{ color: "var(--text-muted)", textAlign: "center", padding: 30 }}>
            No executions logged yet for wallet <span style={{ fontFamily: "monospace", color: "#818cf8" }}>{walletAddress.slice(0, 8)}...</span>. Trigger a workflow in AI Chat or Templates to see live events.
          </div>
        ) : (
          feed.map((item, i) => (
            <TransactionCard key={i} {...item} />
          ))
        )}
      </div>
    </div>
  );
}
