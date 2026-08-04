import { eq, desc, sql, and, isNotNull } from "drizzle-orm";
import { db } from "../db/client.js";
import { executionsLog } from "../db/schema.js";

export type MatrixBucket = "hold" | "partial" | "full" | "yield" | "blocked" | "other";

const VALID_BUCKETS = new Set<MatrixBucket>([
  "hold",
  "partial",
  "full",
  "yield",
  "blocked",
  "other",
]);

export function parseMatrixBucketParam(value: unknown): MatrixBucket | null {
  if (typeof value !== "string") return null;
  const bucket = value as MatrixBucket;
  return VALID_BUCKETS.has(bucket) ? bucket : null;
}

const VALID_TX = /^0x[a-fA-F0-9]{64}$/;

/** Valid mined tx hash (excludes stub placeholders). */
export function isValidExecutionTxHash(h: string | null | undefined): boolean {
  return typeof h === "string" && VALID_TX.test(h) && !h.includes("11111111");
}

export function parseMinedFeedParam(value: unknown): boolean | null {
  if (value == null || value === "") return null;
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

const HF_CRITICAL = 1.15;
const HF_WARNING = 1.4;

type LogRow = {
  action: string;
  status: string;
  aiAnalysis?: unknown;
};

export function getDecisionBucketFromRow(row: LogRow): MatrixBucket {
  const { action, aiAnalysis } = row;
  const meta =
    aiAnalysis && typeof aiAnalysis === "object"
      ? (aiAnalysis as { healthFactor?: number; safetyStatus?: string })
      : {};
  const hf = meta.healthFactor;
  const ss = meta.safetyStatus;

  if (action === "hold") return "hold";
  if (action === "block_transaction") return "blocked";
  if (action === "rotate") return "yield";

  if (action === "repay" || action === "supply_collateral") {
    if (hf != null && hf < HF_CRITICAL) return "full";
    if (ss === "critical_liquidation_risk") return "full";
    if (hf != null && hf >= HF_CRITICAL && hf <= HF_WARNING) return "partial";
    if (ss === "warning") return "partial";
    if (hf != null && hf > HF_WARNING) return "other";
    return "partial";
  }

  return "other";
}

export function computeMatrixBuckets(rows: LogRow[]): Record<MatrixBucket, number> {
  const counts: Record<MatrixBucket, number> = {
    hold: 0,
    partial: 0,
    full: 0,
    yield: 0,
    blocked: 0,
    other: 0,
  };
  for (const row of rows) {
    counts[getDecisionBucketFromRow(row)]++;
  }
  return counts;
}

export async function getFeedMatrixStats(walletAddress: string) {
  const wallet = walletAddress.toLowerCase();

  const [totalRow] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(executionsLog)
    .where(eq(executionsLog.userWallet, wallet));

  const byActionRows = await db.execute(sql`
    SELECT action, count(*)::int AS n
    FROM executions_log
    WHERE user_wallet = ${wallet}
    GROUP BY action
    ORDER BY n DESC
  `);

  const byStatusRows = await db.execute(sql`
    SELECT status, count(*)::int AS n
    FROM executions_log
    WHERE user_wallet = ${wallet}
    GROUP BY status
    ORDER BY n DESC
  `);

  const allRows = await db.query.executionsLog.findMany({
    where: eq(executionsLog.userWallet, wallet),
    columns: { action: true, status: true, aiAnalysis: true, txHash: true },
  });

  const recentRows = await db.query.executionsLog.findMany({
    where: eq(executionsLog.userWallet, wallet),
    orderBy: [desc(executionsLog.timestamp)],
    limit: 200,
    columns: { action: true, status: true, aiAnalysis: true },
  });

  const successfulExecutions = allRows.filter((r) => r.status === "success").length;
  const recentSuccessful = recentRows.filter((r) => r.status === "success").length;
  const minedExecutionsAllTime = allRows.filter((r) => isValidExecutionTxHash(r.txHash)).length;

  return {
    wallet,
    totalRows: totalRow?.c ?? 0,
    feedLimit: 200,
    byAction: Object.fromEntries(
      (byActionRows.rows as { action: string; n: number }[]).map((r) => [r.action, r.n]),
    ),
    byStatus: Object.fromEntries(
      (byStatusRows.rows as { status: string; n: number }[]).map((r) => [r.status, r.n]),
    ),
    matrixBucketsAllTime: computeMatrixBuckets(allRows),
    matrixBucketsRecent200: computeMatrixBuckets(recentRows),
    successfulExecutionsAllTime: successfulExecutions,
    successfulExecutionsRecent200: recentSuccessful,
    minedExecutionsAllTime,
  };
}

const FEED_BUCKET_BATCH = 500;
const FEED_BUCKET_MAX_SCAN = 5000;

/** Return up to `limit` newest executions_log rows matching a decision-matrix bucket. */
export async function getFeedByMatrixBucket(
  walletAddress: string,
  bucket: MatrixBucket,
  limit = 200,
) {
  const wallet = walletAddress.toLowerCase();
  const matched: Awaited<ReturnType<typeof db.query.executionsLog.findMany>> = [];
  let offset = 0;

  while (matched.length < limit && offset < FEED_BUCKET_MAX_SCAN) {
    const batch = await db.query.executionsLog.findMany({
      where: eq(executionsLog.userWallet, wallet),
      orderBy: [desc(executionsLog.timestamp)],
      limit: FEED_BUCKET_BATCH,
      offset,
    });

    if (batch.length === 0) break;

    for (const row of batch) {
      if (getDecisionBucketFromRow(row) === bucket) {
        matched.push(row);
        if (matched.length >= limit) break;
      }
    }

    offset += batch.length;
    if (batch.length < FEED_BUCKET_BATCH) break;
  }

  return matched;
}

const FEED_MINED_OVERFETCH = 500;

/** Return up to `limit` newest rows with a valid on-chain tx hash. */
export async function getFeedMinedOnly(walletAddress: string, limit = 200) {
  const wallet = walletAddress.toLowerCase();
  const rows = await db.query.executionsLog.findMany({
    where: and(eq(executionsLog.userWallet, wallet), isNotNull(executionsLog.txHash)),
    orderBy: [desc(executionsLog.timestamp)],
    limit: FEED_MINED_OVERFETCH,
  });
  return rows.filter((r) => isValidExecutionTxHash(r.txHash)).slice(0, limit);
}
