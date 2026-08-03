import { db } from "../db/client.js";
import { activeWorkflows, executionsLog } from "../db/schema.js";
import { createWorkflow } from "../lib/mcp-client.js";
import { resolveKeeperHubApiKey } from "../lib/user-context.js";
import { childLogger } from "../lib/logger.js";
import { eq, and } from "drizzle-orm";

const GUARDIAN_CRON = "*/5 * * * *";
const HF_THRESHOLD = 115; // stored as cents (1.15)

export async function registerGuardianWorkflow({
  userWallet,
}: {
  userWallet: string;
}): Promise<{ success: boolean; workflowId: string; keeperhubWorkflowId?: string; message: string; duplicate?: boolean }> {
  const wallet = userWallet.toLowerCase();
  const effectiveKey = await resolveKeeperHubApiKey(wallet);
  const log = childLogger({ module: "guardian-register", wallet: wallet.slice(0, 8) });

  const existing = await db.query.activeWorkflows.findFirst({
    where: and(
      eq(activeWorkflows.userWallet, wallet),
      eq(activeWorkflows.type, "guardian"),
      eq(activeWorkflows.status, "active"),
    ),
  });

  if (existing) {
    return {
      success: true,
      workflowId: existing.id,
      keeperhubWorkflowId: existing.keeperhubWorkflowId ?? undefined,
      duplicate: true,
      message: "Aave Guardian monitor is already registered and runs every 5 minutes via the agent.",
    };
  }

  let keeperhubWorkflowId: string | undefined;
  const { workflowId: khId, isStub } = await createWorkflow(
    {
      name: `guardian-${wallet.slice(0, 8)}-${Date.now()}`,
      triggerType: "manual",
      remoteCronEnabled: false,
      steps: [],
    },
    effectiveKey
  );
  if (!isStub) keeperhubWorkflowId = khId;

  const [inserted] = await db.insert(activeWorkflows).values({
    userWallet: wallet,
    type: "guardian",
    amount: HF_THRESHOLD,
    cronSchedule: GUARDIAN_CRON,
    status: "active",
    keeperhubWorkflowId,
  }).returning({ id: activeWorkflows.id });

  await db.insert(executionsLog).values({
    userWallet: wallet,
    workflowId: inserted.id,
    action: "guardian_register",
    amount: 0,
    status: keeperhubWorkflowId ? "success" : "simulated_stub",
    reason: keeperhubWorkflowId
      ? `Guardian monitor registered on KeeperHub (${keeperhubWorkflowId}); agent executes every 5 min`
      : "Guardian monitor registered locally; agent executes every 5 min",
    aiAnalysis: keeperhubWorkflowId ? { keeperhubWorkflowId, hfThreshold: 1.15 } : { hfThreshold: 1.15 },
  });

  log.info({ workflowId: inserted.id, keeperhubWorkflowId }, "Guardian workflow registered");

  return {
    success: true,
    workflowId: inserted.id,
    keeperhubWorkflowId,
    message: "Aave Guardian monitor registered. Agent checks health factor every 5 minutes and repays when HF drops below 1.15.",
  };
}
