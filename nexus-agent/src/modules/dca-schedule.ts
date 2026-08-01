import { db } from "../db/client.js";
import { activeWorkflows, executionsLog } from "../db/schema.js";
import { resolveCronSchedule } from "../lib/cron.js";
import { createWorkflow } from "../lib/mcp-client.js";
import { encodeUniswapSwap, UNISWAP_V3_ROUTER, USDC_SEPOLIA } from "../lib/calldata.js";
import { getEthPriceUSD } from "../lib/price-feed.js";
import { resolveKeeperHubApiKey } from "../lib/user-context.js";
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
}): Promise<{ success: boolean; workflowId: string; keeperhubWorkflowId?: string; message: string }> {
  const wallet = userWallet.toLowerCase();
  const schedule = resolveCronSchedule(cronSchedule, message);
  const effectiveKey = await resolveKeeperHubApiKey(wallet);

  const existing = await db.query.activeWorkflows.findFirst({
    where: and(
      eq(activeWorkflows.userWallet, wallet),
      eq(activeWorkflows.type, "dca"),
      eq(activeWorkflows.status, "active")
    ),
  });

  let workflowId: string;
  let keeperhubWorkflowId: string | undefined = existing?.keeperhubWorkflowId ?? undefined;

  if (!keeperhubWorkflowId || keeperhubWorkflowId.startsWith("wf-stub-")) {
    const ethPriceUSD = await getEthPriceUSD();
    const calldata = encodeUniswapSwap(amount, wallet, 0.5, ethPriceUSD);
    const { workflowId: khId, isStub } = await createWorkflow(
      {
        name: `dca-${wallet.slice(0, 8)}-${Date.now()}`,
        triggerType: "cron",
        cronSchedule: schedule,
        steps: [{ type: "transaction", to: UNISWAP_V3_ROUTER, calldata, gasStrategy: "standard" }],
      },
      effectiveKey
    );
    if (!isStub) keeperhubWorkflowId = khId;
  }

  if (existing) {
    await db.update(activeWorkflows)
      .set({
        amount,
        cronSchedule: schedule,
        ...(keeperhubWorkflowId ? { keeperhubWorkflowId } : {}),
      })
      .where(eq(activeWorkflows.id, existing.id));
    workflowId = existing.id;
  } else {
    const [inserted] = await db.insert(activeWorkflows).values({
      userWallet: wallet,
      type: "dca",
      amount,
      cronSchedule: schedule,
      status: "active",
      keeperhubWorkflowId,
    }).returning({ id: activeWorkflows.id });
    workflowId = inserted.id;
  }

  await db.insert(executionsLog).values({
    userWallet: wallet,
    workflowId,
    action: "swap",
    amount,
    status: keeperhubWorkflowId ? "success" : "simulated_stub",
    reason: keeperhubWorkflowId
      ? `DCA workflow registered on KeeperHub (${keeperhubWorkflowId}): ${amount} USDC into ETH (${schedule})`
      : `DCA registered locally only (KeeperHub unavailable): ${amount} USDC into ETH (${schedule})`,
    aiAnalysis: keeperhubWorkflowId ? { keeperhubWorkflowId } : undefined,
  });

  return {
    success: true,
    workflowId,
    keeperhubWorkflowId,
    message: keeperhubWorkflowId
      ? `Successfully registered recurring DCA of ${amount} USDC into ETH (${schedule}) on KeeperHub.`
      : `Registered DCA schedule locally (${schedule}). KeeperHub sync pending.`,
  };
}
