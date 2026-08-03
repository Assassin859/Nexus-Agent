import { db } from "../db/client.js";
import { activeWorkflows, executionsLog } from "../db/schema.js";
import { createWorkflow } from "../lib/mcp-client.js";
import { resolveKeeperHubApiKey } from "../lib/user-context.js";
import { childLogger } from "../lib/logger.js";
import { eq, and } from "drizzle-orm";

const YIELD_CRON = "*/15 * * * *";

export async function registerYieldWorkflow({
  userWallet,
}: {
  userWallet: string;
}): Promise<{ success: boolean; workflowId: string; keeperhubWorkflowId?: string; message: string; duplicate?: boolean }> {
  const wallet = userWallet.toLowerCase();
  const effectiveKey = await resolveKeeperHubApiKey(wallet);
  const log = childLogger({ module: "yield-register", wallet: wallet.slice(0, 8) });

  const existing = await db.query.activeWorkflows.findFirst({
    where: and(
      eq(activeWorkflows.userWallet, wallet),
      eq(activeWorkflows.type, "yield"),
      eq(activeWorkflows.status, "active"),
    ),
  });

  if (existing) {
    return {
      success: true,
      workflowId: existing.id,
      keeperhubWorkflowId: existing.keeperhubWorkflowId ?? undefined,
      duplicate: true,
      message: "Yield rotator is already registered and runs every 15 minutes via the agent.",
    };
  }

  let keeperhubWorkflowId: string | undefined;
  const { workflowId: khId, isStub } = await createWorkflow(
    {
      name: `yield-${wallet.slice(0, 8)}-${Date.now()}`,
      triggerType: "manual",
      remoteCronEnabled: false,
      steps: [],
    },
    effectiveKey
  );
  if (!isStub) keeperhubWorkflowId = khId;

  const [inserted] = await db.insert(activeWorkflows).values({
    userWallet: wallet,
    type: "yield",
    amount: 0,
    cronSchedule: YIELD_CRON,
    status: "active",
    keeperhubWorkflowId,
  }).returning({ id: activeWorkflows.id });

  await db.insert(executionsLog).values({
    userWallet: wallet,
    workflowId: inserted.id,
    action: "yield_register",
    amount: 0,
    status: keeperhubWorkflowId ? "success" : "simulated_stub",
    reason: keeperhubWorkflowId
      ? `Yield rotator registered on KeeperHub (${keeperhubWorkflowId}); agent executes every 15 min`
      : "Yield rotator registered locally; agent executes every 15 min",
    aiAnalysis: keeperhubWorkflowId ? { keeperhubWorkflowId } : undefined,
  });

  log.info({ workflowId: inserted.id, keeperhubWorkflowId }, "Yield workflow registered");

  return {
    success: true,
    workflowId: inserted.id,
    keeperhubWorkflowId,
    message: "Stablecoin yield rotator registered. Agent compares Aave vs Compound APY every 15 minutes and rotates when profitable.",
  };
}
