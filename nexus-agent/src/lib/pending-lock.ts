import { db } from "../db/client.js";
import { executionsLog } from "../db/schema.js";

export type PendingLockParams = {
  userWallet: string;
  action: string;
  amount: number;
  reason?: string;
  aiAnalysis?: unknown;
  workflowId?: string;
};

/** Postgres unique_violation — concurrent pending row for same wallet+action. */
export function isPendingLockConflict(err: unknown): boolean {
  return (
    typeof err === "object"
    && err !== null
    && "code" in err
    && (err as { code: string }).code === "23505"
  );
}

/**
 * Atomically acquire a pending execution lock (one pending row per wallet+action).
 * Returns null when another in-flight execution holds the lock.
 */
export async function acquirePendingLock(
  params: PendingLockParams,
): Promise<{ id: string } | null> {
  try {
    const [row] = await db
      .insert(executionsLog)
      .values({
        userWallet: params.userWallet.toLowerCase(),
        action: params.action,
        amount: Math.round(params.amount),
        status: "pending",
        reason: params.reason,
        aiAnalysis: params.aiAnalysis,
        workflowId: params.workflowId,
      })
      .returning({ id: executionsLog.id });

    return row ? { id: row.id } : null;
  } catch (err) {
    if (isPendingLockConflict(err)) return null;
    throw err;
  }
}
