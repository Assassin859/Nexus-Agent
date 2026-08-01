import "../lib/env.js";
import { db } from "../db/client.js";
import { executionsLog, activeWorkflows } from "../db/schema.js";
import { eq, desc } from "drizzle-orm";

const WALLET = (process.env.NEXT_PUBLIC_WALLET_ADDRESS || "0x89f97Cb35236a1d0190FB25B31C5C0fF4107Ec1b").toLowerCase();

console.log("=== Active Workflows on DB ===");
const wfs = await db.query.activeWorkflows.findMany({
  where: eq(activeWorkflows.userWallet, WALLET),
});
for (const wf of wfs) {
  console.log(JSON.stringify({ id: wf.id, type: wf.type, keeperhubWorkflowId: wf.keeperhubWorkflowId, status: wf.status, amount: wf.amount, cronSchedule: wf.cronSchedule }, null, 2));
}

console.log("\n=== Last 10 Executions with aiAnalysis ===");
const logs = await db.query.executionsLog.findMany({
  where: eq(executionsLog.userWallet, WALLET),
  orderBy: [desc(executionsLog.timestamp)],
  limit: 10,
});
for (const row of logs) {
  const ai = row.aiAnalysis as any;
  if (ai?.workflowId || ai?.keeperhubWorkflowId) {
    console.log(`[${row.action}/${row.status}] workflowId: ${ai?.workflowId || ai?.keeperhubWorkflowId}`);
  }
}

process.exit(0);
