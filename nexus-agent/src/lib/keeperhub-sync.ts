import { db } from "../db/client.js";
import { activeWorkflows, executionsLog } from "../db/schema.js";
import { getExecutionLogs } from "./mcp-client.js";
import { resolveKeeperHubApiKey } from "./user-context.js";
import { eq, and, desc } from "drizzle-orm";
import { childLogger } from "./logger.js";

/**
 * Helper to identify fallback/stub log messages returned when MCP is unavailable or in stub mode.
 */
function isStubLogMessage(msg: string | undefined | null): boolean {
  if (!msg || !msg.trim()) return true;
  const m = msg.toLowerCase();
  return m.includes("stub mode") || m.includes("workflow executed via keeperhub mcp");
}

export async function syncKeeperHubState(walletAddress: string): Promise<{ workflowsSynced: number; logsSynced: number }> {
  const wallet = walletAddress.toLowerCase();
  const log = childLogger({ module: "sync", wallet: wallet.slice(0, 8) });

  const apiKey = await resolveKeeperHubApiKey(wallet);
  if (!apiKey) {
    log.info("No KeeperHub API key available — skipping remote log sync.");
    return { workflowsSynced: 0, logsSynced: 0 };
  }

  // 2. Query active workflows and filter to eligible remote workflows (non-null, non-stub)
  const userWfs = await db.query.activeWorkflows.findMany({
    where: eq(activeWorkflows.userWallet, wallet),
  });

  const eligibleWfs = userWfs.filter(
    (wf) => wf.keeperhubWorkflowId && !wf.keeperhubWorkflowId.startsWith("wf-stub-")
  );

  let logsSynced = 0;

  for (const wf of eligibleWfs) {
    try {
      const logRow = await db.query.executionsLog.findFirst({
        where: and(
          eq(executionsLog.userWallet, wallet),
          eq(executionsLog.workflowId, wf.id)
        ),
        orderBy: [desc(executionsLog.timestamp)],
      });

      const executionId = (logRow?.aiAnalysis as any)?.executionId;
      if (!executionId || typeof executionId !== "string" || executionId.startsWith("exec-stub-")) {
        log.debug({ workflowId: wf.id }, "Skipping sync — no valid executionId on latest log row");
        continue;
      }

      const logs = await getExecutionLogs(executionId, apiKey);

      for (const item of logs) {
        if (isStubLogMessage(item.message)) continue;

        const existing = await db.query.executionsLog.findFirst({
          where: and(
            eq(executionsLog.userWallet, wallet),
            eq(executionsLog.workflowId, wf.id),
            eq(executionsLog.reason, item.message)
          ),
        });

        if (!existing) {
          await db.insert(executionsLog).values({
            userWallet: wallet,
            workflowId: wf.id,
            action: "synced_keeperhub",
            amount: wf.amount ?? 0,
            status: "success",
            reason: item.message,
          });
          logsSynced++;
        }
      }
    } catch (err) {
      log.warn({ workflowId: wf.id, err: err instanceof Error ? err.message : String(err) }, "Failed to sync workflow logs");
    }
  }

  return { workflowsSynced: eligibleWfs.length, logsSynced };
}
