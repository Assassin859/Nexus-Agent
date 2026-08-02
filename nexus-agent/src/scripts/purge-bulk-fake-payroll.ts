/**
 * purge-bulk-fake-payroll.ts — Remove synthetic bulk-payroll rows + KeeperHub workflows.
 *
 * Identifies fake payrolls by:
 * - ai_analysis.bulkProof = true
 * - reason ILIKE 'Bulk proof payroll%'
 * - recipient_address with 24+ leading zero nibbles (synthetic 0x000…10000 pattern)
 * - payees named "Bulk Team N"
 *
 * Run: pnpm --prefix nexus-agent run purge-fake-payrolls
 */
import "../lib/env.js";
import { db } from "../db/client.js";
import { activeWorkflows, executionsLog, payees } from "../db/schema.js";
import { sql, eq, inArray, and, ilike } from "drizzle-orm";
import { cancelWorkflow } from "../lib/mcp-client.js";
import { resolveKeeperHubApiKey } from "../lib/user-context.js";

const WALLET = (
  process.env.NEXT_PUBLIC_WALLET_ADDRESS || "0x89f97cb35236a1d0190fb25b31c5c0ff4107Ec1b"
).toLowerCase();

function isSyntheticAddress(addr: string | null | undefined): boolean {
  if (!addr) return false;
  const body = addr.toLowerCase().replace(/^0x/, "");
  if (!/^[0-9a-f]{40}$/.test(body)) return false;
  const leading = body.match(/^0*/)?.[0].length ?? 0;
  return leading >= 24;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const apiKey =
    (await resolveKeeperHubApiKey(WALLET)) || process.env.KEEPERHUB_API_KEY || "";

  console.log("=".repeat(60));
  console.log("PURGE SYNTHETIC BULK PAYROLL DATA");
  console.log("=".repeat(60));
  console.log(`Wallet: ${WALLET}`);
  if (dryRun) console.log("DRY RUN — no deletes\n");

  const allPayrollWfs = await db.query.activeWorkflows.findMany({
    where: and(eq(activeWorkflows.userWallet, WALLET), eq(activeWorkflows.type, "payroll")),
  });

  const fakeWfs = allPayrollWfs.filter((w) => isSyntheticAddress(w.recipientAddress));
  const fakeWfIds = fakeWfs.map((w) => w.id);
  const fakeKhIds = fakeWfs
    .map((w) => w.keeperhubWorkflowId)
    .filter((id): id is string => !!id && !id.startsWith("wf-stub-"));

  console.log(`Fake payroll workflows (DB):     ${fakeWfs.length}`);
  console.log(`KeeperHub IDs to cancel:         ${fakeKhIds.length}`);

  let logIdsToDelete: string[] = [];

  const byReason = await db.execute(sql`
    SELECT id FROM executions_log
    WHERE user_wallet = ${WALLET}
      AND (
        reason ILIKE 'Bulk proof payroll%'
        OR (ai_analysis->>'bulkProof') = 'true'
      )
  `);
  logIdsToDelete.push(...(byReason.rows as { id: string }[]).map((r) => r.id));

  if (fakeWfIds.length > 0) {
    const byWf = await db
      .select({ id: executionsLog.id })
      .from(executionsLog)
      .where(
        and(
          eq(executionsLog.userWallet, WALLET),
          eq(executionsLog.action, "payroll"),
          inArray(executionsLog.workflowId, fakeWfIds),
        ),
      );
    logIdsToDelete.push(...byWf.map((r) => r.id));
  }

  logIdsToDelete = [...new Set(logIdsToDelete)];

  const bulkTeams = await db.query.payees.findMany({
    where: and(eq(payees.userWallet, WALLET), ilike(payees.name, "Bulk Team%")),
  });

  console.log(`Executions_log rows to delete:    ${logIdsToDelete.length}`);
  console.log(`Bulk Team payees to delete:      ${bulkTeams.length}`);

  if (dryRun) {
    console.log("\nSample fake recipients:");
    for (const w of fakeWfs.slice(0, 5)) {
      console.log(`  ${w.recipientAddress} → kh=${w.keeperhubWorkflowId}`);
    }
    process.exit(0);
  }

  let cancelled = 0;
  for (const khId of fakeKhIds) {
    process.stdout.write(`  Cancel KeeperHub ${khId} … `);
    try {
      const r = await cancelWorkflow(khId, apiKey);
      console.log(r.ok ? "✅" : "⚠️ local only");
      if (r.ok) cancelled++;
    } catch (e) {
      console.log(`⚠️ ${e instanceof Error ? e.message : e}`);
    }
    await new Promise((r) => setTimeout(r, 300));
  }

  if (logIdsToDelete.length > 0) {
    await db.delete(executionsLog).where(inArray(executionsLog.id, logIdsToDelete));
  }

  if (fakeWfIds.length > 0) {
    await db.delete(activeWorkflows).where(inArray(activeWorkflows.id, fakeWfIds));
  }

  for (const p of bulkTeams) {
    await db.delete(payees).where(eq(payees.id, p.id));
  }

  const after = await db.execute(sql`
    SELECT action, status, count(*)::int as n
    FROM executions_log WHERE user_wallet = ${WALLET}
    GROUP BY action, status ORDER BY n DESC
  `);

  const total = await db.select({ c: sql<number>`count(*)::int` }).from(executionsLog);
  const wfTotal = await db.select({ c: sql<number>`count(*)::int` }).from(activeWorkflows);

  console.log("\n" + "=".repeat(60));
  console.log(`KeeperHub workflows cancelled:  ${cancelled}`);
  console.log(`Remaining executions_log:        ${total[0].c}`);
  console.log(`Remaining active_workflows:      ${wfTotal[0].c}`);
  console.log("\nBreakdown (monitored wallet):");
  for (const r of after.rows as { action: string; status: string; n: number }[]) {
    console.log(`  ${r.status.padEnd(20)} ${r.action.padEnd(18)} ${r.n}`);
  }
  console.log("\nDone. Run: pnpm --prefix nexus-agent exec tsx src/scripts/db-audit.ts");
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
