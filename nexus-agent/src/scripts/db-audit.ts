import "../lib/env.js";
import { db } from "../db/client.js";
import {
  executionsLog,
  activeWorkflows,
  repaymentCycles,
  payees,
  userSettings,
} from "../db/schema.js";
import { desc, sql, isNotNull } from "drizzle-orm";

const execCount = await db.select({ c: sql<number>`count(*)::int` }).from(executionsLog);
const wfCount = await db.select({ c: sql<number>`count(*)::int` }).from(activeWorkflows);
const cycleCount = await db.select({ c: sql<number>`count(*)::int` }).from(repaymentCycles);
const payeeCount = await db.select({ c: sql<number>`count(*)::int` }).from(payees);
const settingsCount = await db.select({ c: sql<number>`count(*)::int` }).from(userSettings);

console.log("=== TABLE COUNTS ===");
console.log("executions_log:", execCount[0].c);
console.log("active_workflows:", wfCount[0].c);
console.log("repayment_cycles:", cycleCount[0].c);
console.log("payees:", payeeCount[0].c);
console.log("user_settings:", settingsCount[0].c);

const statusBreakdown = await db.execute(sql`
  SELECT status, action, count(*)::int as n
  FROM executions_log GROUP BY status, action ORDER BY n DESC
`);
console.log("\n=== EXECUTIONS BY STATUS/ACTION ===");
for (const r of statusBreakdown.rows as { status: string; action: string; n: number }[]) {
  console.log(`${r.status.padEnd(20)} ${r.action.padEnd(18)} ${r.n}`);
}

const txRows = await db
  .select()
  .from(executionsLog)
  .where(isNotNull(executionsLog.txHash))
  .orderBy(desc(executionsLog.timestamp));
console.log(`\n=== ROWS WITH TX HASH (${txRows.length}) ===`);
for (const r of txRows) {
  console.log(
    `${r.timestamp?.toISOString()} | ${r.action} | ${r.status} | ${r.txHash} | amt=${r.amount}`,
  );
}

const wfs = await db.select().from(activeWorkflows).orderBy(desc(activeWorkflows.updatedAt));
console.log(`\n=== ACTIVE WORKFLOWS (${wfs.length}) ===`);
for (const w of wfs) {
  console.log(
    `${w.type} | ${w.status} | $${w.amount} | cron=${w.cronSchedule} | kh=${w.keeperhubWorkflowId ?? "MISSING"} | pg=${w.id}`,
  );
}

const cycles = await db.select().from(repaymentCycles);
console.log(`\n=== REPAYMENT CYCLES (${cycles.length}) ===`);
for (const c of cycles) {
  console.log(
    `${c.userWallet} | limit=$${c.cycleLimitUSD} repaid=$${c.totalRepaidThisCycleUSD} | ${c.cycleStart?.toISOString()?.slice(0, 10)} -> ${c.cycleEnd?.toISOString()?.slice(0, 10)}`,
  );
}

const ps = await db.select().from(payees);
console.log(`\n=== PAYEES (${ps.length}) ===`);
for (const p of ps) {
  console.log(`${p.name} | ${p.type} | members=${p.memberCount} | ${p.userWallet.slice(0, 10)}…`);
}
