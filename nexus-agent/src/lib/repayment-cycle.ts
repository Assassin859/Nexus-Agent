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
