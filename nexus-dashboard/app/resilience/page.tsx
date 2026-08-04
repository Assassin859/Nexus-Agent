"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Clock, ShieldX, Activity } from "lucide-react";
import { useWallet } from "@/context/WalletContext";
import { proxyFetch } from "@/lib/agent-fetch";
import { parseFeedResponse } from "@/lib/demo-wallet";
import DemoModeBanner from "@/components/DemoModeBanner";
import PersonalWalletBanner from "@/components/PersonalWalletBanner";
import StaleDemoSessionBanner from "@/components/StaleDemoSessionBanner";

import DecisionMatrixCard, { ExecutionLogItem } from "@/components/DecisionMatrixCard";
import GuardianRepayProofTable from "@/components/GuardianRepayProofTable";
import Pagination from "@/components/Pagination";
import { usePagination } from "@/hooks/usePagination";
import { BUCKET_LABELS, type MatrixBucket } from "@/lib/decision-matrix";

type LogItem = {
  id?: string;
  action: string;
  amount: number;
  status: string;
  reason?: string;
  aiAnalysis?: Record<string, unknown>;
};

type ScenarioCard = {
  icon: any;
  title: string;
  pill: { label: string; cls: string };
  desc: string;
  code: { text: string; color: string; bg: string; border: string };
  accent: { color: string; bg: string; border: string };
  side: string;
};

const INITIAL_SCENARIOS: ScenarioCard[] = [
  {
    icon: CheckCircle2,
    title: "Happy Path Run",
    pill: { label: "Broadcast & Mined", cls: "pill-success" },
    desc: "Transactions passing pre-flight simulation are broadcast to Base Sepolia and mined with zero errors.",
    code: { text: "Status: WAITING FOR RUN\nNo successful executions recorded yet.", color: "#34d399", bg: "rgba(16,185,129,0.09)", border: "rgba(16,185,129,0.25)" },
    accent: { color: "#34d399", bg: "rgba(16,185,129,0.10)", border: "rgba(16,185,129,0.3)" },
    side: "#10b981",
  },
  {
    icon: Clock,
    title: "Gas Adjusted Path",
    pill: { label: "Gas Delayed", cls: "pill-warning" },
    desc: "Actions (e.g. DCA swaps) where estimated gas exceeds safety thresholds are paused to prevent gas loss.",
    code: { text: "Status: WAITING FOR RUN\nNo gas-adjusted pauses recorded.", color: "#fbbf24", bg: "rgba(245,158,11,0.09)", border: "rgba(245,158,11,0.25)" },
    accent: { color: "#fbbf24", bg: "rgba(245,158,11,0.10)", border: "rgba(245,158,11,0.3)" },
    side: "#f59e0b",
  },
  {
    icon: Activity,
    title: "In-Flight Executions",
    pill: { label: "In-Flight", cls: "pill-cyan" },
    desc: "Active executions currently processing on-chain or waiting for confirmation under 15m TTL.",
    code: { text: "Status: IDLE\nNo active in-flight executions.", color: "#38bdf8", bg: "rgba(56,189,248,0.09)", border: "rgba(56,189,248,0.25)" },
    accent: { color: "#38bdf8", bg: "rgba(56,189,248,0.10)", border: "rgba(56,189,248,0.3)" },
    side: "#38bdf8",
  },
  {
    icon: ShieldX,
    title: "Caught Revert",
    pill: { label: "Pre-Flight Intercept", cls: "pill-danger" },
    desc: "Simulation engine detects contract reverts or missing allowances and aborts execution before broadcasting.",
    code: { text: "Status: WAITING FOR RUN\nNo caught reverts recorded.", color: "#fb7185", bg: "rgba(244,63,94,0.09)", border: "rgba(244,63,94,0.25)" },
    accent: { color: "#fb7185", bg: "rgba(244,63,94,0.10)", border: "rgba(244,63,94,0.3)" },
    side: "#f43f5e",
  },
];

const PAGE_SIZE = 8;

function feedUrl(wallet: string, bucket: MatrixBucket | null): string {
  return bucket ? `/api/feed/${wallet}?bucket=${bucket}` : `/api/feed/${wallet}`;
}

export default function ResiliencePage() {
  const { walletAddress: wallet, authToken } = useWallet();
  const [scenarios, setScenarios] = useState(INITIAL_SCENARIOS);
  const [feed, setFeed] = useState<LogItem[]>([]);
  const [feedStats, setFeedStats] = useState<{
    totalRows: number;
    feedLimit: number;
    matrixBucketsAllTime: Record<string, number>;
    successfulExecutionsAllTime: number;
    minedExecutionsAllTime: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [selectedBucket, setSelectedBucket] = useState<MatrixBucket | null>(null);

  const { page, setPage, totalPages, pagedItems, total, showPagination } = usePagination(
    feed,
    PAGE_SIZE,
    [wallet, selectedBucket],
  );

  const loadResilience = useCallback(async () => {
    try {
      const [feedRes, statsRes] = await Promise.all([
        proxyFetch(feedUrl(wallet, selectedBucket), {}, authToken),
        proxyFetch(`/api/feed/${wallet}/stats`, {}, authToken),
      ]);
      const data = await feedRes.json();
      if (feedRes.status === 401) {
        setAuthError("Sign in with Ethereum to view resilience logs.");
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
        setAuthError(data.error || `Resilience feed unavailable (${feedRes.status})`);
        setFeed([]);
        setFeedStats(null);
        return;
      }
      setAuthError(null);
      const rows = parseFeedResponse<LogItem>(data);
      setFeed(rows);

      if (statsRes.ok) {
        const statsData = await statsRes.json();
          setFeedStats({
            totalRows: statsData.totalRows ?? 0,
            feedLimit: statsData.feedLimit ?? 200,
            matrixBucketsAllTime: statsData.matrixBucketsAllTime ?? {},
            successfulExecutionsAllTime: statsData.successfulExecutionsAllTime ?? 0,
            minedExecutionsAllTime: statsData.minedExecutionsAllTime ?? 0,
          });
      } else {
        setFeedStats(null);
      }

      if (!selectedBucket && rows.length > 0) {
        const logs = rows;
        const happy = logs.find(d => d.status === "success");
        const delayed = rows.find(d => d.status === "delayed");
        const pending = rows.find(d => d.status === "pending");
        const simRevert = rows.find(d => d.status === "reverted_simulation");
        const chainRevert = rows.find(d => d.status === "reverted_chain");

        const updated = [...INITIAL_SCENARIOS];
        if (happy) {
          updated[0].desc = `Action ${happy.action.toUpperCase()} executed successfully for amount $${happy.amount}.`;
          updated[0].code.text = `Status: SUCCESS (200 OK)\nReason: ${happy.reason || "Mined on Base Sepolia"}`;
        }
        if (delayed) {
          updated[1].desc = `Action ${delayed.action.toUpperCase()} evaluated. Gas or cycle limit rules applied.`;
          updated[1].code.text = `Status: DELAYED\nReason: ${delayed.reason || "Gas threshold limit active"}`;
        }
        if (pending) {
          updated[2].desc = `Action ${pending.action.toUpperCase()} is currently in-flight on-chain.`;
          updated[2].code.text = `Status: PENDING (<15m TTL)\nReason: ${pending.reason || "Waiting for mining settlement"}`;
        }
        if (simRevert || chainRevert) {
          const revertTarget = simRevert || chainRevert!;
          const isSim = revertTarget.status === "reverted_simulation";
          updated[3].pill = { label: isSim ? "Pre-Flight Intercepted" : "Reverted On-Chain", cls: isSim ? "pill-warning" : "pill-danger" };
          updated[3].desc = isSim
            ? `Simulation intercepted revert before broadcasting to Base Sepolia (0 gas wasted).`
            : `Execution reverted on-chain during broadcast.`;
          updated[3].code.text = `Status: ${revertTarget.status.toUpperCase()}\nReason: ${revertTarget.reason || "Revert recorded"}`;
        }
        setScenarios(updated);
      }
    } catch (err) {
      console.error("Resilience fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [wallet, authToken, selectedBucket]);

  useEffect(() => {
    setLoading(true);
    loadResilience();
    const interval = setInterval(loadResilience, 5000);
    return () => clearInterval(interval);
  }, [loadResilience]);

  return (
    <div className="animate-in" style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      <div className="page-header">
        <h1 className="page-title">Resilience &amp; Simulation Log</h1>
        <p className="page-subtitle">Every action is simulated prior to broadcast. Zero gas wasted on reverts.</p>
      </div>

      <DemoModeBanner />
      <PersonalWalletBanner />
      <StaleDemoSessionBanner />

      {authError && (
        <div className="card" style={{ color: "#f59e0b", fontSize: 13, padding: 14 }}>
          {authError}
        </div>
      )}

      {/* AI Decision Matrix Component */}
      <DecisionMatrixCard
        items={feed as ExecutionLogItem[]}
        loading={loading}
        stats={feedStats}
        selectedBucket={selectedBucket}
        onBucketSelect={setSelectedBucket}
      />

      <GuardianRepayProofTable />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 20 }}>
        {scenarios.map((s) => {
          const Icon = s.icon;
          return (
            <div
              key={s.title}
              className="card"
              style={{ display: "flex", flexDirection: "column", gap: 20, borderLeft: `3px solid ${s.side}` }}
            >
              <div className="res-header">
                <div
                  className="res-icon"
                  style={{ background: s.accent.bg, color: s.accent.color, border: `1px solid ${s.accent.border}` }}
                >
                  <Icon size={22} />
                </div>
                <div>
                  <div style={{ fontFamily: "var(--font-space-grotesk), sans-serif", fontWeight: 800, fontSize: 15, color: "var(--text)", marginBottom: 6 }}>
                    {s.title}
                  </div>
                  <span className={`pill ${s.pill.cls}`}>{s.pill.label}</span>
                </div>
              </div>
              <p style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.5 }}>{s.desc}</p>
              <pre
                style={{
                  background: s.code.bg, color: s.code.color, border: `1px solid ${s.code.border}`,
                  borderRadius: 8, padding: 14, fontSize: 11.5, fontFamily: "ui-monospace, monospace",
                  whiteSpace: "pre-wrap", overflowX: "auto"
                }}
              >
                {s.code.text}
              </pre>
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div className="page-header" style={{ margin: 0 }}>
          <h2 style={{ fontFamily: "var(--font-space-grotesk), sans-serif", fontSize: 17, fontWeight: 800, color: "var(--text)" }}>
            Execution Log
          </h2>
          <p className="page-subtitle" style={{ marginTop: 4 }}>Paginated history of simulated and broadcast actions</p>
        </div>

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
          <div className="card" style={{ color: "var(--text-muted)", textAlign: "center", padding: 24 }}>
            Loading execution log...
          </div>
        ) : feed.length === 0 ? (
          <div className="card" style={{ color: "var(--text-muted)", textAlign: "center", padding: 24 }}>
            {selectedBucket
              ? `No ${BUCKET_LABELS[selectedBucket]} executions found.`
              : "No execution logs yet."}
          </div>
        ) : (
          <>
            {showPagination && (
              <Pagination page={page} totalPages={totalPages} total={total} pageSize={PAGE_SIZE} onPageChange={setPage} />
            )}
            {pagedItems.map((item, i) => (
              <div key={item.id ?? `${page}-${i}`} className="card" style={{ padding: 16, fontSize: 13 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 8 }}>
                  <span style={{ fontWeight: 700, color: "var(--text)", textTransform: "uppercase" }}>{item.action}</span>
                  <span className={`pill ${item.status === "success" ? "pill-success" : item.status === "reverted_simulation" || item.status === "reverted_chain" ? "pill-danger" : "pill-warning"}`}>
                    {item.status}
                  </span>
                </div>
                <div style={{ color: "var(--text-muted)", lineHeight: 1.5 }}>
                  {item.reason || `Amount: $${item.amount} USDC`}
                </div>
              </div>
            ))}
            {showPagination && (
              <Pagination page={page} totalPages={totalPages} total={total} pageSize={PAGE_SIZE} onPageChange={setPage} />
            )}
          </>
        )}
      </div>
    </div>
  );
}
