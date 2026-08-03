import { db } from "../db/client.js";
import { activeWorkflows, executionsLog } from "../db/schema.js";
import { resolveCronSchedule } from "../lib/cron.js";
import { createWorkflow } from "../lib/mcp-client.js";
import { encodeUniswapSwap, UNISWAP_V3_ROUTER } from "../lib/calldata.js";
import { getEthPriceUSD } from "../lib/price-feed.js";
import { resolveKeeperHubApiKey } from "../lib/user-context.js";
import { childLogger } from "../lib/logger.js";
import { eq, and } from "drizzle-orm";

export async function registerDcaWorkflow({
  userWallet,
  amount,
  cronSchedule,
  message,
}: {
  userWallet: string;
  amount: number;
  cronSchedule?: string;
  message?: string;
}): Promise<{ success: boolean; workflowId: string; keeperhubWorkflowId?: string; message: string; duplicate?: boolean }> {
  const wallet = userWallet.toLowerCase();
  const schedule = resolveCronSchedule(cronSchedule, message);
  const effectiveKey = await resolveKeeperHubApiKey(wallet);
  const log = childLogger({ module: "dca-schedule", wallet: wallet.slice(0, 8) });

  const duplicate = await db.query.activeWorkflows.findFirst({
    where: and(
      eq(activeWorkflows.userWallet, wallet),
      eq(activeWorkflows.type, "dca"),
      eq(activeWorkflows.status, "active"),
      eq(activeWorkflows.amount, amount),
      eq(activeWorkflows.cronSchedule, schedule),
    ),
  });

  if (duplicate) {
    return {
      success: true,
      workflowId: duplicate.id,
      keeperhubWorkflowId: duplicate.keeperhubWorkflowId ?? undefined,
      duplicate: true,
      message: `DCA workflow already active: ${amount} USDC into ETH (${schedule}).`,
    };
  }

  let keeperhubWorkflowId: string | undefined;

  const ethPriceUSD = await getEthPriceUSD();
  const calldata = encodeUniswapSwap(amount, wallet, 0.5, ethPriceUSD);
  const { workflowId: khId, isStub } = await createWorkflow(
    {
      name: `dca-${wallet.slice(0, 8)}-${Date.now()}`,
      triggerType: "cron",
      cronSchedule: schedule,
      remoteCronEnabled: false,
      steps: [{ type: "transaction", to: UNISWAP_V3_ROUTER, calldata, gasStrategy: "standard" }],
    },
    effectiveKey
  );
  if (!isStub) keeperhubWorkflowId = khId;

  const [inserted] = await db.insert(activeWorkflows).values({
    userWallet: wallet,
    type: "dca",
    amount,
    cronSchedule: schedule,
    status: "active",
    keeperhubWorkflowId,
  }).returning({ id: activeWorkflows.id });

  const workflowId = inserted.id;

  await db.insert(executionsLog).values({
    userWallet: wallet,
    workflowId,
    action: "dca_register",
    amount,
    status: keeperhubWorkflowId ? "success" : "simulated_stub",
    reason: keeperhubWorkflowId
      ? `DCA registered on KeeperHub (${keeperhubWorkflowId}, schedule disabled; executed locally): ${amount} USDC into ETH (${schedule})`
      : `DCA registered locally only (KeeperHub unavailable): ${amount} USDC into ETH (${schedule})`,
    aiAnalysis: keeperhubWorkflowId ? { keeperhubWorkflowId, remoteCronEnabled: false } : undefined,
  });

  log.info({ workflowId, keeperhubWorkflowId, amount, schedule }, "DCA workflow registered (additive)");

  return {
    success: true,
    workflowId,
    keeperhubWorkflowId,
    message: keeperhubWorkflowId
      ? `Successfully registered recurring DCA of ${amount} USDC into ETH (${schedule}) on KeeperHub (local executor; remote schedule disabled).`
      : `Registered DCA schedule locally (${schedule}). KeeperHub sync pending.`,
  };
}
