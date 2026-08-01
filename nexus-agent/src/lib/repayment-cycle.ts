import { db } from "../db/client.js";
import { repaymentCycles } from "../db/schema.js";
import { eq, and, sql } from "drizzle-orm";

export type RepaymentCycleRow = typeof repaymentCycles.$inferSelect;

/** Remaining budget for the current cycle (never negative). */
export function getCycleRemaining(cycle: {
  cycleLimitUSD: number;
  totalRepaidThisCycleUSD: number | null;
}): number {
  return Math.max(
    0,
    (cycle.cycleLimitUSD ?? 0) - (cycle.totalRepaidThisCycleUSD ?? 0),
  );
}

/**
 * Atomically reserve cycle budget before execution.
 * Returns updated row on success, null if limit would be exceeded.
 */
export async function reserveCycleBudget(
  cycleId: string,
  amountUSD: number,
): Promise<RepaymentCycleRow | null> {
  if (amountUSD <= 0) return null;

  const amount = Math.round(amountUSD);
  const updated = await db
    .update(repaymentCycles)
    .set({
      totalRepaidThisCycleUSD: sql`${repaymentCycles.totalRepaidThisCycleUSD} + ${amount}`,
    })
    .where(
      and(
        eq(repaymentCycles.id, cycleId),
        sql`${repaymentCycles.totalRepaidThisCycleUSD} + ${amount} <= ${repaymentCycles.cycleLimitUSD}`,
      ),
    )
    .returning();

  return updated[0] ?? null;
}

/** Release a prior reservation when execution did not complete successfully. */
export async function releaseCycleBudget(
  cycleId: string,
  amountUSD: number,
): Promise<void> {
  if (amountUSD <= 0) return;

  const amount = Math.round(amountUSD);
  await db
    .update(repaymentCycles)
    .set({
      totalRepaidThisCycleUSD: sql`GREATEST(0, ${repaymentCycles.totalRepaidThisCycleUSD} - ${amount})`,
    })
    .where(eq(repaymentCycles.id, cycleId));
}

/** Cap over-reported repay totals to the cycle limit (one-time repair). */
export async function capCycleRepaidToLimit(
  userWallet: string,
): Promise<RepaymentCycleRow | null> {
  const cycle = await db.query.repaymentCycles.findFirst({
    where: eq(repaymentCycles.userWallet, userWallet.toLowerCase()),
  });
  if (!cycle) return null;

  const repaid = cycle.totalRepaidThisCycleUSD ?? 0;
  if (repaid <= cycle.cycleLimitUSD) return cycle;

  const [fixed] = await db
    .update(repaymentCycles)
    .set({ totalRepaidThisCycleUSD: cycle.cycleLimitUSD })
    .where(eq(repaymentCycles.id, cycle.id))
    .returning();

  return fixed ?? null;
}

export type CycleBudgetPollContext = {
  timedOut?: boolean;
  status: string;
  txHash?: string | null;
};

const INCONCLUSIVE_STATUSES = new Set(["pending", "broadcasting", "simulating"]);

function hasValidTxHash(txHash?: string | null): boolean {
  return typeof txHash === "string" && txHash.startsWith("0x") && txHash.length === 66;
}

/** Whether to undo a prior cycle budget reservation after polling KeeperHub. */
export function shouldReleaseCycleBudget(poll: CycleBudgetPollContext): boolean {
  if (poll.status === "mined") return false;
  if (hasValidTxHash(poll.txHash)) return false;
  if (poll.status === "failed") return true;
  if (poll.timedOut) return false;
  return false;
}

/** Map poll outcome to executions_log status for Guardian repay flows. */
export function resolveExecutionLogStatus(poll: CycleBudgetPollContext): {
  status: "success" | "delayed" | "reverted_chain";
  reason: string;
} {
  if (poll.status === "mined" || hasValidTxHash(poll.txHash)) {
    const viaHash = poll.timedOut && hasValidTxHash(poll.txHash);
    return {
      status: "success",
      reason: viaHash
        ? "Execution poll timeout but txHash present — treating as success."
        : "Execution mined on-chain.",
    };
  }

  if (poll.status === "failed") {
    return {
      status: "reverted_chain",
      reason: "KeeperHub execution failed on-chain.",
    };
  }

  if (poll.timedOut && INCONCLUSIVE_STATUSES.has(poll.status)) {
    return {
      status: "delayed",
      reason: `Execution poll timeout — status inconclusive (${poll.status}), budget retained pending confirmation.`,
    };
  }

  if (poll.timedOut) {
    return {
      status: "delayed",
      reason: `Execution poll timeout — status inconclusive (${poll.status}), budget retained pending confirmation.`,
    };
  }

  return {
    status: "reverted_chain",
    reason: `Execution ended with status: ${poll.status}.`,
  };
}
