import { eq, desc, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { executionsLog } from "../db/schema.js";

export type MatrixBucket = "hold" | "partial" | "full" | "yield" | "blocked" | "other";

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
    columns: { action: true, status: true, aiAnalysis: true },
  });

  const recentRows = await db.query.executionsLog.findMany({
    where: eq(executionsLog.userWallet, wallet),
    orderBy: [desc(executionsLog.timestamp)],
    limit: 200,
    columns: { action: true, status: true, aiAnalysis: true },
  });

  const successfulExecutions = allRows.filter((r) => r.status === "success").length;
  const recentSuccessful = recentRows.filter((r) => r.status === "success").length;

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
  };
}
