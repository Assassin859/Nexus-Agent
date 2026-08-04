"use client";

import { useCallback, useEffect, useState } from "react";
import { useWallet } from "@/context/WalletContext";
import { proxyFetch } from "@/lib/agent-fetch";
import { parseFeedResponse } from "@/lib/demo-wallet";
import TransactionCard from "@/components/TransactionCard";
import DecisionMatrixCard from "@/components/DecisionMatrixCard";
import DemoModeBanner from "@/components/DemoModeBanner";
import PersonalWalletBanner from "@/components/PersonalWalletBanner";
import Pagination from "@/components/Pagination";
import { usePagination } from "@/hooks/usePagination";
import { BUCKET_LABELS, type MatrixBucket } from "@/lib/decision-matrix";

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

const PAGE_SIZE = 10;

type FeedStats = {
  totalRows: number;
  feedLimit: number;
  matrixBucketsAllTime: Record<string, number>;
  successfulExecutionsAllTime: number;
};

function feedUrl(wallet: string, bucket: MatrixBucket | null): string {
  return bucket ? `/api/feed/${wallet}?bucket=${bucket}` : `/api/feed/${wallet}`;
}

export default function FeedPage() {
  const { walletAddress, authToken } = useWallet();
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [feedStats, setFeedStats] = useState<FeedStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [selectedBucket, setSelectedBucket] = useState<MatrixBucket | null>(null);

  const { page, setPage, totalPages, pagedItems, total, showPagination } = usePagination(
    feed,
    PAGE_SIZE,
    [walletAddress, selectedBucket],
  );

  const loadFeed = useCallback(async () => {
    try {
      const [feedRes, statsRes] = await Promise.all([
        proxyFetch(feedUrl(walletAddress, selectedBucket), {}, authToken),
        proxyFetch(`/api/feed/${walletAddress}/stats`, {}, authToken),
      ]);
      const data = await feedRes.json();
      if (feedRes.status === 401) {
        setAuthError("Sign in with Ethereum to view the live execution feed.");
        setFeed([]);
        setFeedStats(null);
        return;
      }
      if (feedRes.status === 403) {
        setAuthError("Forbidden — signed-in wallet does not match this feed.");
        setFeed([]);
        setFeedStats(null);
        return;
      }
      if (!feedRes.ok) {
        setAuthError(data.error || `Feed unavailable (${feedRes.status})`);
        setFeed([]);
        setFeedStats(null);
        return;
      }
      setAuthError(null);
      setFeed(parseFeedResponse<FeedItem>(data));

      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setFeedStats({
          totalRows: statsData.totalRows ?? 0,
          feedLimit: statsData.feedLimit ?? 200,
          matrixBucketsAllTime: statsData.matrixBucketsAllTime ?? {},
          successfulExecutionsAllTime: statsData.successfulExecutionsAllTime ?? 0,
        });
      } else {
        setFeedStats(null);
      }
    } catch (err) {
      console.error("Failed to load feed:", err);
      setAuthError("Agent unreachable — could not load execution feed.");
    } finally {
      setLoading(false);
    }
  }, [walletAddress, authToken, selectedBucket]);

  useEffect(() => {
    setLoading(true);
    loadFeed();
    const interval = setInterval(loadFeed, 5000);
    return () => clearInterval(interval);
  }, [loadFeed]);

  return (
    <div className="animate-in" style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      <div className="page-header">
        <h1 className="page-title">Live Execution Feed</h1>
        <p className="page-subtitle">Real-time audit log of autonomous transactions managed by KeeperHub MCP</p>
      </div>

      <DemoModeBanner />
      <PersonalWalletBanner />

      {authError && (
        <div className="card" style={{ color: "#f59e0b", fontSize: 13, padding: 14 }}>
          {authError}
        </div>
      )}

      <DecisionMatrixCard
        items={feed}
        loading={loading}
        stats={feedStats}
        selectedBucket={selectedBucket}
        onBucketSelect={setSelectedBucket}
      />

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {selectedBucket && !loading && (
          <div
            className="card"
            style={{
              padding: "10px 14px",
              fontSize: 12,
              color: "var(--text-muted)",
              borderLeft: "3px solid var(--primary)",
            }}
          >
            Showing <strong style={{ color: "var(--text)" }}>{BUCKET_LABELS[selectedBucket]}</strong>
            {" · "}
            {feed.length} execution{feed.length === 1 ? "" : "s"}
            {feed.length >= 200 ? " (up to 200 most recent matches)" : ""}
          </div>
        )}

        {loading ? (
          <div className="card" style={{ color: "var(--text-muted)", textAlign: "center", padding: 30 }}>
            Loading live execution feed...
          </div>
        ) : feed.length === 0 ? (
          <div className="card" style={{ color: "var(--text-muted)", textAlign: "center", padding: 30 }}>
            {selectedBucket
              ? `No ${BUCKET_LABELS[selectedBucket]} executions found.`
              : (
                <>
                  No executions logged yet for wallet{" "}
                  <span style={{ fontFamily: "monospace", color: "#818cf8" }}>{walletAddress.slice(0, 8)}...</span>.
                  Trigger a workflow in AI Chat or Templates to see live events.
                </>
              )}
          </div>
        ) : (
          <>
            {showPagination && (
              <Pagination
                page={page}
                totalPages={totalPages}
                total={total}
                pageSize={PAGE_SIZE}
                onPageChange={setPage}
              />
            )}
            {pagedItems.map((item, i) => (
              <TransactionCard key={item.id ?? `${page}-${i}`} {...item} aiAnalysis={item.aiAnalysis} />
            ))}
            {showPagination && (
              <Pagination
                page={page}
                totalPages={totalPages}
                total={total}
                pageSize={PAGE_SIZE}
                onPageChange={setPage}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
