/**
 * One-time relabel of misleading executions_log rows (no schema change).
 * Usage:
 *   pnpm exec tsx src/scripts/cleanup-executions-log.ts          # dry-run
 *   pnpm exec tsx src/scripts/cleanup-executions-log.ts --apply  # commit updates
 */
import "../lib/env.js";
import { db } from "../db/client.js";
import { executionsLog } from "../db/schema.js";
import { sql, eq, and, isNull, or, like, inArray } from "drizzle-orm";

const APPLY = process.argv.includes("--apply");

const VALID_TX = /^0x[a-fA-F0-9]{64}$/;

function isValidTxHash(h: string | null | undefined): boolean {
  return typeof h === "string" && VALID_TX.test(h) && !h.includes("11111111");
}

type Rule = {
  name: string;
  set: { action?: string; status?: string };
  where: ReturnType<typeof sql>;
};

const rules: Rule[] = [
  {
    name: "dca_register (swap registration logs)",
    set: { action: "dca_register" },
    where: sql`${executionsLog.action} = 'swap' AND ${executionsLog.reason} LIKE 'DCA registered%'`,
  },
  {
    name: "hold (yield dual-wallet skip)",
    set: { action: "hold" },
    where: sql`${executionsLog.action} = 'rotate' AND ${executionsLog.status} = 'success' AND ${executionsLog.reason} LIKE '%Cannot rotate watched wallet%shared wallet ownership%'`,
  },
  {
    name: "hold (yield evaluated — no rotation needed)",
    set: { action: "hold" },
    where: sql`${executionsLog.action} = 'rotate' AND ${executionsLog.status} = 'success' AND ${executionsLog.amount} = 0 AND (${executionsLog.txHash} IS NULL OR ${executionsLog.txHash} = '') AND ${executionsLog.reason} NOT LIKE '%Cannot rotate watched wallet%shared wallet ownership%'`,
  },
  {
    name: "payroll_register (team member workflow)",
    set: { action: "payroll_register" },
    where: sql`${executionsLog.action} = 'payroll' AND ${executionsLog.reason} LIKE 'Registered % payroll workflow%'`,
  },
  {
    name: "payroll_register (vault pool deposit)",
    set: { action: "payroll_register" },
    where: sql`${executionsLog.action} = 'payroll' AND ${executionsLog.reason} LIKE 'Deposited %Shared Vault Pool%'`,
  },
  {
    name: "payroll_register (chat-created workflow)",
    set: { action: "payroll_register" },
    where: sql`${executionsLog.action} = 'payroll' AND ${executionsLog.reason} LIKE 'Payroll workflow created for%'`,
  },
  {
    name: "dca_register (legacy swap registration wording)",
    set: { action: "dca_register" },
    where: sql`${executionsLog.action} = 'swap' AND ${executionsLog.reason} LIKE 'DCA workflow registered%'`,
  },
  {
    name: "delayed (repay budget clamped — mislogged as success)",
    set: { status: "delayed" },
    where: sql`${executionsLog.action} = 'repay' AND ${executionsLog.status} = 'success' AND ${executionsLog.amount} = 0 AND ${executionsLog.reason} LIKE 'Budget clamped to 0%'`,
  },
];

async function countForRule(rule: Rule): Promise<number> {
  const rows = await db
    .select({ id: executionsLog.id })
    .from(executionsLog)
    .where(rule.where);
  return rows.length;
}

async function applyRule(rule: Rule): Promise<number> {
  const setClause: Record<string, string> = {};
  if (rule.set.action) setClause.action = rule.set.action;
  if (rule.set.status) setClause.status = rule.set.status;

  const updated = await db
    .update(executionsLog)
    .set(setClause)
    .where(rule.where)
    .returning({ id: executionsLog.id });

  return updated.length;
}

console.log(APPLY ? "=== APPLY MODE — writing changes ===" : "=== DRY RUN — pass --apply to commit ===\n");

let totalWouldUpdate = 0;
for (const rule of rules) {
  const n = await countForRule(rule);
  totalWouldUpdate += n;
  console.log(`${rule.name}: ${n} rows`);
}

console.log(`\nTotal rows matched by rules: ${totalWouldUpdate}`);

if (APPLY) {
  console.log("\nApplying updates...");
  let totalUpdated = 0;
  for (const rule of rules) {
    const n = await applyRule(rule);
    totalUpdated += n;
    console.log(`  ✓ ${rule.name}: ${n} updated`);
  }
  console.log(`\nDone — ${totalUpdated} rows updated.`);
}

// Post-check: remaining success chain actions without valid tx
const remaining = await db.execute(sql`
  SELECT action, count(*)::int as n
  FROM executions_log
  WHERE status = 'success'
    AND action IN ('repay', 'supply_collateral', 'swap', 'rotate', 'payroll')
    AND (tx_hash IS NULL OR tx_hash = '' OR tx_hash NOT SIMILAR TO '0x[a-fA-F0-9]{64}')
    AND tx_hash NOT LIKE '%11111111%'
  GROUP BY action
  ORDER BY n DESC
`);

console.log("\n=== REMAINING success chain-actions without valid tx_hash ===");
for (const r of remaining.rows as { action: string; n: number }[]) {
  console.log(`  ${r.action.padEnd(20)} ${r.n}`);
}

const allRemaining = await db.select().from(executionsLog).where(sql`
  status = 'success'
  AND action IN ('repay', 'supply_collateral', 'swap', 'rotate', 'payroll')
  AND (tx_hash IS NULL OR length(tx_hash) != 66)
`);

const unexplained = allRemaining.filter((r) => !isValidTxHash(r.txHash));
if (unexplained.length > 0 && unexplained.length <= 15) {
  console.log("\n=== Unexplained rows (manual review) ===");
  for (const r of unexplained) {
    console.log(`  ${r.id.slice(0, 8)}… | ${r.action} | amt=${r.amount} | ${(r.reason ?? "").slice(0, 90)}`);
  }
} else if (unexplained.length > 15) {
  console.log(`\n${unexplained.length} unexplained rows remain — run db-audit.ts for details.`);
}

process.exit(0);
