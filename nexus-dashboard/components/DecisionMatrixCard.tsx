"use client";

import { CheckCircle2, Shield, RefreshCw, AlertTriangle, AlertOctagon, ShieldAlert, Layers } from "lucide-react";
import { HF_CRITICAL, HF_WARNING } from "@/lib/guardian-thresholds";
import {
  BUCKET_LABELS,
  getDecisionBucket,
  type ExecutionLogItem,
  type MatrixBucket,
} from "@/lib/decision-matrix";

export type { ExecutionLogItem };

type Props = {
  items: ExecutionLogItem[];
  loading?: boolean;
  /** When set, matrix tiles use full-database aggregates (not just the 200-row feed window). */
  stats?: {
    totalRows: number;
    feedLimit: number;
    matrixBucketsAllTime: Record<string, number>;
    successfulExecutionsAllTime: number;
    minedExecutionsAllTime?: number;
  } | null;
  selectedBucket?: MatrixBucket | null;
  onBucketSelect?: (bucket: MatrixBucket | null) => void;
};

type TileConfig = {
  bucket: MatrixBucket;
  emoji: string;
  label: string;
  subtitle: string;
  icon: typeof Shield;
  colors: { text: string; bg: string; border: string; activeBorder: string };
};

const TILES: TileConfig[] = [
  {
    bucket: "hold",
    emoji: "🟢",
    label: "Hold Path",
    subtitle: `Hold · HF > ${HF_WARNING} (Healthy)`,
    icon: Shield,
    colors: { text: "#34d399", bg: "rgba(52, 211, 153, 0.05)", border: "rgba(52, 211, 153, 0.2)", activeBorder: "rgba(52, 211, 153, 0.55)" },
  },
  {
    bucket: "partial",
    emoji: "🟡",
    label: "Partial Repay",
    subtitle: `Repay · ${HF_CRITICAL} ≤ HF ≤ ${HF_WARNING}`,
    icon: AlertTriangle,
    colors: { text: "#f59e0b", bg: "rgba(245, 158, 11, 0.05)", border: "rgba(245, 158, 11, 0.2)", activeBorder: "rgba(245, 158, 11, 0.55)" },
  },
  {
    bucket: "full",
    emoji: "🔴",
    label: "Full Repay",
    subtitle: `Repay · HF < ${HF_CRITICAL} (Critical)`,
    icon: AlertOctagon,
    colors: { text: "#ef4444", bg: "rgba(239, 68, 68, 0.05)", border: "rgba(239, 68, 68, 0.2)", activeBorder: "rgba(239, 68, 68, 0.55)" },
  },
  {
    bucket: "yield",
    emoji: "🔵",
    label: "Yield Rotate",
    subtitle: "Rotate · dual-wallet skip logs",
    icon: RefreshCw,
    colors: { text: "#60a5fa", bg: "rgba(59, 130, 246, 0.05)", border: "rgba(59, 130, 246, 0.2)", activeBorder: "rgba(59, 130, 246, 0.55)" },
  },
  {
    bucket: "blocked",
    emoji: "⚪",
    label: "Guarded",
    subtitle: "Pending lock / risk block",
    icon: ShieldAlert,
    colors: { text: "#94a3b8", bg: "rgba(148, 163, 184, 0.05)", border: "rgba(148, 163, 184, 0.2)", activeBorder: "rgba(148, 163, 184, 0.55)" },
  },
  {
    bucket: "other",
    emoji: "⚪",
    label: "Other",
    subtitle: "DCA · PayChain · safe-HF repay",
    icon: Layers,
    colors: { text: "#94a3b8", bg: "rgba(148, 163, 184, 0.03)", border: "rgba(148, 163, 184, 0.15)", activeBorder: "rgba(148, 163, 184, 0.45)" },
  },
];

function MatrixTile({
  tile,
  count,
  loading,
  selected,
  onSelect,
}: {
  tile: TileConfig;
  count: number;
  loading: boolean;
  selected: boolean;
  onSelect?: () => void;
}) {
  const Icon = tile.icon;
  const interactive = Boolean(onSelect);

  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={!interactive}
      aria-pressed={selected}
      aria-label={`Filter by ${tile.label}`}
      style={{
        background: tile.colors.bg,
        border: `1px solid ${selected ? tile.colors.activeBorder : tile.colors.border}`,
        borderRadius: "var(--radius-md)",
        padding: "12px",
        textAlign: "left",
        cursor: interactive ? "pointer" : "default",
        boxShadow: selected ? `0 0 0 2px ${tile.colors.activeBorder}` : "none",
        transition: "border-color 0.15s, box-shadow 0.15s",
        width: "100%",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
        <span style={{ fontSize: "12px", fontWeight: 700, color: tile.colors.text, display: "flex", alignItems: "center", gap: "4px" }}>
          {tile.emoji} {tile.label}
        </span>
        <Icon size={14} color={tile.colors.text} />
      </div>
      <div style={{ fontSize: "20px", fontWeight: 800, color: "var(--text)" }}>
        {loading ? "-" : count}
      </div>
      <div style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "2px" }}>
        {tile.subtitle}
      </div>
    </button>
  );
}

export default function DecisionMatrixCard({
  items,
  loading = false,
  stats,
  selectedBucket = null,
  onBucketSelect,
}: Props) {
  const minedCount = stats?.minedExecutionsAllTime ?? items.filter((i) => i.txHash?.startsWith("0x") && (i.txHash?.length ?? 0) === 66).length;
  const decisionsLogged = stats
    ? stats.successfulExecutionsAllTime
    : items.filter((i) => i.status === "success").length;
  const totalLogged = stats?.totalRows;

  const counts = stats
    ? {
        hold: stats.matrixBucketsAllTime.hold ?? 0,
        partial: stats.matrixBucketsAllTime.partial ?? 0,
        full: stats.matrixBucketsAllTime.full ?? 0,
        yield: stats.matrixBucketsAllTime.yield ?? 0,
        blocked: stats.matrixBucketsAllTime.blocked ?? 0,
        other: stats.matrixBucketsAllTime.other ?? 0,
      }
    : { hold: 0, partial: 0, full: 0, yield: 0, blocked: 0, other: 0 };

  if (!stats) {
    items.forEach((item) => {
      const bucket = getDecisionBucket(item);
      counts[bucket]++;
    });
  }

  return (
    <div
      style={{
        background: "var(--card-bg)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)",
        padding: "20px",
        marginBottom: "24px",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "16px",
          paddingBottom: "12px",
          borderBottom: "1px solid var(--border)",
          flexWrap: "wrap",
          gap: "12px",
        }}
      >
        <div>
          <h3
            style={{
              fontSize: "16px",
              fontWeight: 700,
              color: "var(--text)",
              margin: 0,
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <Shield size={18} color="var(--primary)" />
            AI Decision Matrix &amp; Execution Proofs
          </h3>
          <p style={{ fontSize: "12px", color: "var(--text-muted)", margin: "4px 0 0 0" }}>
            {selectedBucket
              ? `Filtered view · up to 200 most recent ${BUCKET_LABELS[selectedBucket]} matches. Click tile again to clear.`
              : stats
                ? `All-time breakdown across ${stats.totalRows} logged executions (feed list shows latest ${stats.feedLimit}). Click a tile to filter.`
                : "Real-time breakdown of autonomous decision paths. Click a tile to filter the feed."}
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          {selectedBucket && onBucketSelect && (
            <button
              type="button"
              onClick={() => onBucketSelect(null)}
              style={{
                fontSize: "11px",
                fontWeight: 700,
                padding: "6px 10px",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--border)",
                background: "var(--card-bg)",
                color: "var(--text-muted)",
                cursor: "pointer",
              }}
            >
              Show all
            </button>
          )}
          <div style={{ display: "flex", alignItems: "stretch", gap: "8px", flexWrap: "wrap" }}>
            <div
              style={{
                background: "rgba(52, 211, 153, 0.1)",
                border: "1px solid rgba(52, 211, 153, 0.25)",
                borderRadius: "var(--radius-md)",
                padding: "8px 14px",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <CheckCircle2 size={16} color="#34d399" />
              <div>
                <div style={{ fontSize: "10px", textTransform: "uppercase", color: "#34d399", fontWeight: 700 }}>
                  Mined on-chain {stats ? "(All-Time)" : ""}
                </div>
                <div style={{ fontSize: "18px", fontWeight: 800, color: "var(--text)" }}>
                  {loading ? "..." : minedCount}
                </div>
              </div>
            </div>
            <div
              style={{
                background: "rgba(148, 163, 184, 0.08)",
                border: "1px solid rgba(148, 163, 184, 0.2)",
                borderRadius: "var(--radius-md)",
                padding: "8px 14px",
                display: "flex",
                alignItems: "center",
              }}
            >
              <div>
                <div style={{ fontSize: "10px", textTransform: "uppercase", color: "#94a3b8", fontWeight: 700 }}>
                  Decisions logged
                </div>
                <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-muted)" }}>
                  {loading ? "..." : totalLogged != null ? `${decisionsLogged} success · ${totalLogged} total` : decisionsLogged}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
          gap: "12px",
        }}
      >
        {TILES.map((tile) => (
          <MatrixTile
            key={tile.bucket}
            tile={tile}
            count={counts[tile.bucket]}
            loading={loading}
            selected={selectedBucket === tile.bucket}
            onSelect={
              onBucketSelect
                ? () => onBucketSelect(selectedBucket === tile.bucket ? null : tile.bucket)
                : undefined
            }
          />
        ))}
      </div>
    </div>
  );
}
