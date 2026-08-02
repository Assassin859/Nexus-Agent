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

const CHAIN_ACTIONS = new Set([
  "repay",
  "supply_collateral",
  "swap",
  "rotate",
  "payroll",
  "tempo_transfer",
]);
const VALID_TX = /^0x[a-fA-F0-9]{64}$/;

function isValidTxHash(h: string | null | undefined): boolean {
  return typeof h === "string" && VALID_TX.test(h) && !h.includes("11111111");
}

const allExec = await db.select().from(executionsLog).orderBy(desc(executionsLog.timestamp));
console.log(`\n=== DATA INTEGRITY AUDIT (${allExec.length} rows) ===`);

type Issue = { id: string; action: string; status: string; issue: string; ts?: Date | null };
const issues: Issue[] = [];

const cutoff15m = new Date(Date.now() - 15 * 60 * 1000);

for (const row of allExec) {
  const chain = CHAIN_ACTIONS.has(row.action);
  const hasTx = isValidTxHash(row.txHash);

  if (row.status === "success" && chain && !hasTx) {
    issues.push({
      id: row.id,
      action: row.action,
      status: row.status,
      issue: "success without valid tx_hash for chain action",
      ts: row.timestamp,
    });
  }
  if (row.status === "success" && hasTx && !chain) {
    issues.push({
      id: row.id,
      action: row.action,
      status: row.status,
      issue: "success with tx_hash but action is non-chain",
      ts: row.timestamp,
    });
  }
  if (row.status === "pending" && row.timestamp && row.timestamp < cutoff15m) {
    issues.push({
      id: row.id,
      action: row.action,
      status: row.status,
      issue: "pending older than 15m TTL (stale lock)",
      ts: row.timestamp,
    });
  }
  if (row.status === "reverted_chain" && hasTx) {
    issues.push({
      id: row.id,
      action: row.action,
      status: row.status,
      issue: "reverted_chain but has tx_hash (mined revert — expected)",
      ts: row.timestamp,
    });
  }
  if (row.status === "simulated_stub" && hasTx) {
    issues.push({
      id: row.id,
      action: row.action,
      status: row.status,
      issue: "simulated_stub with real tx_hash",
      ts: row.timestamp,
    });
  }
}

const swapRows = allExec.filter((r) => r.action === "swap");
console.log(`\n=== SWAP SUMMARY (${swapRows.length} rows) ===`);
const swapByStatus = new Map<string, number>();
for (const s of swapRows) {
  swapByStatus.set(s.status, (swapByStatus.get(s.status) ?? 0) + 1);
}
for (const [st, n] of [...swapByStatus.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${st.padEnd(22)} ${n}`);
}
for (const s of swapRows.slice(0, 8)) {
  console.log(
    `  ${s.timestamp?.toISOString()?.slice(0, 19) ?? "?"} | ${s.status.padEnd(20)} | $${s.amount} | tx=${s.txHash ? "yes" : "no"} | ${(s.reason ?? "").slice(0, 80)}`,
  );
}

const realIssues = issues.filter((i) => !i.issue.includes("mined revert — expected"));
console.log(`\n=== MISMATCH ISSUES (${realIssues.length} actionable, ${issues.length - realIssues.length} informational) ===`);
for (const i of realIssues.slice(0, 40)) {
  console.log(
    `[${i.ts?.toISOString()?.slice(0, 19) ?? "?"}] ${i.action}/${i.status}: ${i.issue} (id=${i.id.slice(0, 8)}…)`,
  );
}
if (realIssues.length > 40) console.log(`  … and ${realIssues.length - 40} more`);
