import { db } from "../db/client.js";
import { executionsLog } from "../db/schema.js";
import { and, eq } from "drizzle-orm";

export type ExternalExecutionAction = "tempo_transfer" | "marketplace_hf_read";

export type LogExternalExecutionInput = {
  userWallet: string;
  action: ExternalExecutionAction;
  amount: number;
  status: string;
  txHash?: string;
  reason?: string;
  aiAnalysis?: Record<string, unknown>;
};

/** Idempotent insert for external proofs — skips when same txHash + wallet already logged. */
export async function logExternalExecution(
  input: LogExternalExecutionInput,
): Promise<{ inserted: boolean }> {
  const userWallet = input.userWallet.toLowerCase();

  if (input.txHash) {
    const existing = await db.query.executionsLog.findFirst({
      where: and(
        eq(executionsLog.userWallet, userWallet),
        eq(executionsLog.txHash, input.txHash),
      ),
    });
    if (existing) return { inserted: false };
  }

  await db.insert(executionsLog).values({
    userWallet,
    action: input.action,
    amount: input.amount,
    status: input.status,
    reason: input.reason,
    txHash: input.txHash,
    aiAnalysis: input.aiAnalysis ?? null,
  });

  return { inserted: true };
}
