import { db } from "../db/client.js";
import { activeWorkflows, executionsLog, userSettings } from "../db/schema.js";
import { getExecutionLogs } from "./mcp-client.js";
import { eq } from "drizzle-orm";

export async function syncKeeperHubState(walletAddress: string): Promise<{ workflowsSynced: number; logsSynced: number }> {
  const wallet = walletAddress.toLowerCase();
  
  // 1. Fetch user's KeeperHub API key from DB user_settings
  const settings = await db.query.userSettings.findFirst({
    where: eq(userSettings.userWallet, wallet),
  });

  const apiKey = settings?.keeperhubApiKey || process.env.KEEPERHUB_API_KEY;

  const userWfs = await db.query.activeWorkflows.findMany({
    where: eq(activeWorkflows.userWallet, wallet),
  });

  let logsSynced = 0;

  for (const wf of userWfs) {
    if (!wf.id) continue;
    const logs = await getExecutionLogs(wf.id, apiKey);
    for (const log of logs) {
      const existing = await db.query.executionsLog.findFirst({
        where: eq(executionsLog.reason, log.message),
      });

      if (!existing) {
        await db.insert(executionsLog).values({
          userWallet: wallet,
          workflowId: wf.id,
          action: "synced_keeperhub",
          amount: wf.amount ?? 0,
          status: "success",
          reason: log.message,
        });
        logsSynced++;
      }
    }
  }

  return { workflowsSynced: userWfs.length, logsSynced };
}
