"use client";

import { useEffect, useState } from "react";
import { useWallet } from "@/context/WalletContext";
import { proxyFetch } from "@/lib/agent-fetch";
import TransactionCard from "@/components/TransactionCard";
import DecisionMatrixCard from "@/components/DecisionMatrixCard";

type FeedItem = {
  id?: string;
  action: string;
  amount: number;
  asset?: string;
  status: "success" | "reverted_simulation" | "reverted_chain" | "pending" | "simulated_stub" | "delayed";
  timestamp?: string;
  txHash?: string;
  reason?: string;
  aiAnalysis?: Record<string, unknown>;
};

const STEPS = ["Triggered", "Simulating", "Broadcasting", "Mined"];
const PAGE_SIZE = 5;

export default function FeedPage() {
  const { walletAddress, authToken } = useWallet();
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  // Reset page to 1 when wallet changes
  useEffect(() => { setPage(1); }, [walletAddress]);

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

  const totalPages = Math.max(1, Math.ceil(feed.length / PAGE_SIZE));
  const pagedFeed = feed.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="animate-in" style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      <div className="page-header">
        <h1 className="page-title">Live Execution Feed</h1>
        <p className="page-subtitle">Real-time audit log of autonomous transactions managed by KeeperHub MCP</p>
      </div>

      {/* Decision Matrix — always uses full feed for correct aggregate counts */}
      <DecisionMatrixCard items={feed} loading={loading} />

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

      {/* Feed list — paginated 5 per page */}
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
          pagedFeed.map((item, i) => (
            <TransactionCard key={`${page}-${i}`} {...item} aiAnalysis={item.aiAnalysis} />
          ))
        )}
      </div>

      {/* Pagination controls — only shown when feed has more than PAGE_SIZE rows */}
      {feed.length > PAGE_SIZE && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16, paddingBottom: 12 }}>
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            style={{
              padding: "6px 18px", borderRadius: 8, border: "1px solid var(--border)",
              background: page === 1 ? "var(--surface)" : "rgba(129,140,248,0.12)",
              color: page === 1 ? "var(--text-muted)" : "#818cf8",
              fontWeight: 600, cursor: page === 1 ? "not-allowed" : "pointer", fontSize: 13,
            }}
          >
            ← Previous
          </button>
          <span style={{ fontSize: 13, color: "var(--text-muted)", fontWeight: 500 }}>
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            style={{
              padding: "6px 18px", borderRadius: 8, border: "1px solid var(--border)",
              background: page === totalPages ? "var(--surface)" : "rgba(129,140,248,0.12)",
              color: page === totalPages ? "var(--text-muted)" : "#818cf8",
              fontWeight: 600, cursor: page === totalPages ? "not-allowed" : "pointer", fontSize: 13,
            }}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
