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

  // 2. Fetch execution logs via KeeperHub MCP tool wrapper
  const logs = await getExecutionLogs("exec-all");
  let logsSynced = 0;

  for (const log of logs) {
    // Check if log already exists to prevent duplicate inserts
    const existing = await db.query.executionsLog.findFirst({
      where: eq(executionsLog.userWallet, wallet),
    });

    if (!existing) {
      await db.insert(executionsLog).values({
        userWallet: wallet,
        action: "synced_keeperhub",
        amount: 0,
        status: "success",
        reason: log.message,
      });
      logsSynced++;
    }
  }

  const existingWorkflows = await db.query.activeWorkflows.findMany({
    where: eq(activeWorkflows.userWallet, wallet),
  });

  return { workflowsSynced: existingWorkflows.length, logsSynced };
}
