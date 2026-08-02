/**
 * bulk-proof-run.ts — Generate real executions_log rows + KeeperHub workflow proofs.
 *
 * Usage:
 *   pnpm --prefix nexus-agent run bulk-proof
 *   pnpm --prefix nexus-agent run bulk-proof -- --target 443
 *   pnpm --prefix nexus-agent run bulk-proof -- --payroll 50 --guardian 20 --dry-run
 *
 * Requires: DATABASE_URL, KEEPERHUB_API_KEY, OPENROUTER_API_KEY (for guardian/yield LLM paths)
 */
import "../lib/env.js";
import { db } from "../db/client.js";
import { activeWorkflows, executionsLog, payees } from "../db/schema.js";
import { sql, desc, eq } from "drizzle-orm";
import { registerDcaWorkflow } from "../modules/dca-schedule.js";
import { run as runGuardian } from "../modules/guardian.js";
import { run as runYield } from "../modules/yield-rotator.js";
import { run as runDca } from "../modules/dca.js";
import { createWorkflow } from "../lib/mcp-client.js";
import { encodeERC20Transfer, USDC_SEPOLIA } from "../lib/calldata.js";
import { resolveKeeperHubApiKey } from "../lib/user-context.js";

const WALLET = (
  process.env.NEXT_PUBLIC_WALLET_ADDRESS || "0x89f97cb35236a1d0190fb25b31c5c0ff4107Ec1b"
).toLowerCase();

type Args = {
  target: number;
  payroll: number;
  guardian: number;
  dcaSchedule: number;
  yieldRuns: number;
  dcaTrigger: number;
  dryRun: boolean;
};

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const get = (flag: string, def: number) => {
    const i = argv.indexOf(flag);
    return i >= 0 && argv[i + 1] ? parseInt(argv[i + 1], 10) : def;
  };
  const target = get("--target", 0);
  const dryRun = argv.includes("--dry-run");

  if (target > 0) {
    // Fast payroll dominates; guardian/yield use LLM (slower).
    return {
      target,
      payroll: Math.floor(target * 0.45),
      guardian: Math.floor(target * 0.25),
      dcaSchedule: Math.floor(target * 0.12),
      yieldRuns: Math.floor(target * 0.12),
      dcaTrigger: Math.floor(target * 0.06),
      dryRun,
    };
  }

  return {
    target: 0,
    payroll: get("--payroll", 40),
    guardian: get("--guardian", 25),
    dcaSchedule: get("--dca-schedule", 15),
    yieldRuns: get("--yield", 15),
    dcaTrigger: get("--dca-trigger", 5),
    dryRun,
  };
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Deterministic unique testnet recipient (valid 20-byte hex). */
function syntheticRecipient(index: number): string {
  const hex = index.toString(16).padStart(40, "0").slice(-40);
  return `0x${hex}`;
}

const CRON_VARIANTS = [
  "0 9 * * 1",
  "0 10 * * 2",
  "0 11 * * 3",
  "0 12 * * 4",
  "0 13 * * 5",
  "0 8 1 * *",
  "0 14 15 * *",
  "0 9 1,15 * *",
];

async function countLogs(): Promise<number> {
  const r = await db.select({ c: sql<number>`count(*)::int` }).from(executionsLog);
  return r[0].c;
}

async function registerPayrollDirect(
  index: number,
  apiKey: string,
): Promise<{ ok: boolean; keeperhubId?: string; error?: string }> {
  const recipient = syntheticRecipient(0x10000 + index);
  const amount = 10 + (index % 90);
  const cronSchedule = CRON_VARIANTS[index % CRON_VARIANTS.length];

  const calldata = encodeERC20Transfer(recipient, amount);
  const { workflowId: khId, isStub } = await createWorkflow(
    {
      name: `bulk-payroll-${index}-${Date.now()}`,
      triggerType: "cron",
      cronSchedule,
      steps: [{ type: "transaction", to: USDC_SEPOLIA, calldata, gasStrategy: "standard" }],
    },
    apiKey,
  );

  if (isStub || !khId) {
    return { ok: false, error: "KeeperHub stub/unavailable" };
  }

  const [wf] = await db
    .insert(activeWorkflows)
    .values({
      userWallet: WALLET,
      type: "payroll",
      recipientAddress: recipient,
      amount,
      cronSchedule,
      status: "active",
      keeperhubWorkflowId: khId,
    })
    .onConflictDoUpdate({
      target: [activeWorkflows.userWallet, activeWorkflows.recipientAddress, activeWorkflows.status],
      set: { amount, cronSchedule, keeperhubWorkflowId: khId, updatedAt: new Date() },
    })
    .returning();

  await db.insert(executionsLog).values({
    userWallet: WALLET,
    workflowId: wf?.id,
    action: "payroll",
    amount,
    status: "success",
    reason: `Bulk proof payroll #${index} → ${recipient.slice(0, 10)}… (${amount} USDC, cron ${cronSchedule})`,
    aiAnalysis: { keeperhubWorkflowId: khId, bulkProof: true, template: "Developer Payroll" },
  });

  return { ok: true, keeperhubId: khId };
}

async function main() {
  const args = parseArgs();
  const startCount = await countLogs();

  console.log("=".repeat(60));
  console.log("NEXUSAGENT BULK PROOF RUN");
  console.log("=".repeat(60));
  console.log(`Wallet:          ${WALLET}`);
  console.log(`Starting logs:   ${startCount}`);
  console.log(`Plan:            payroll=${args.payroll} guardian=${args.guardian} dcaSched=${args.dcaSchedule} yield=${args.yieldRuns} dcaTrig=${args.dcaTrigger}`);
  if (args.dryRun) {
    console.log("DRY RUN — no mutations");
    process.exit(0);
  }

  const apiKey = await resolveKeeperHubApiKey(WALLET);
  if (!apiKey && !process.env.KEEPERHUB_API_KEY) {
    console.error("❌ No KEEPERHUB_API_KEY — payroll/DCA KeeperHub proofs will fail");
  }

  const stats = { payroll: 0, guardian: 0, dcaSchedule: 0, yield: 0, dcaTrigger: 0, errors: 0 };

  // ── Phase 1: Bulk payroll (KeeperHub cron workflows) ─────────────────────
  console.log(`\n── Phase 1: Direct payroll registrations (${args.payroll}) ──`);
  for (let i = 0; i < args.payroll; i++) {
    process.stdout.write(`  [${i + 1}/${args.payroll}] `);
    try {
      const r = await registerPayrollDirect(i, apiKey || process.env.KEEPERHUB_API_KEY!);
      if (r.ok) {
        stats.payroll++;
        console.log(`✅ ${r.keeperhubId}`);
      } else {
        stats.errors++;
        console.log(`⚠️  ${r.error}`);
        if (r.error?.includes("stub")) break;
      }
    } catch (e) {
      stats.errors++;
      console.log(`❌ ${e instanceof Error ? e.message : e}`);
    }
    await sleep(400);
  }

  // ── Phase 2: DCA schedule (template: USDC→ETH DCA) ───────────────────────
  console.log(`\n── Phase 2: DCA schedule registrations (${args.dcaSchedule}) ──`);
  for (let i = 0; i < args.dcaSchedule; i++) {
    const amount = 5 + (i % 20) * 5;
    const cron = CRON_VARIANTS[i % CRON_VARIANTS.length];
    process.stdout.write(`  [${i + 1}/${args.dcaSchedule}] $${amount} ${cron} … `);
    try {
      const r = await registerDcaWorkflow({ userWallet: WALLET, amount, cronSchedule: cron });
      if (r.success) {
        stats.dcaSchedule++;
        console.log(`✅ kh=${r.keeperhubWorkflowId || "local"}`);
      } else {
        stats.errors++;
        console.log(`⚠️  ${r.message}`);
      }
    } catch (e) {
      stats.errors++;
      console.log(`❌ ${e instanceof Error ? e.message : e}`);
    }
    await sleep(500);
  }

  // ── Phase 3: Guardian (template: Aave Guardian — hold/repay audit rows) ───
  console.log(`\n── Phase 3: Guardian evaluations (${args.guardian}) ──`);
  for (let i = 0; i < args.guardian; i++) {
    process.stdout.write(`  [${i + 1}/${args.guardian}] `);
    try {
      await runGuardian(WALLET, { apiKey: apiKey || undefined });
      stats.guardian++;
      console.log("✅");
    } catch (e) {
      stats.errors++;
      console.log(`❌ ${e instanceof Error ? e.message : e}`);
    }
    await sleep(800);
  }

  // ── Phase 4: Yield rotator (template: blocked/scaffold proof) ─────────────
  console.log(`\n── Phase 4: Yield rotator (${args.yieldRuns}) ──`);
  for (let i = 0; i < args.yieldRuns; i++) {
    process.stdout.write(`  [${i + 1}/${args.yieldRuns}] `);
    try {
      await runYield(WALLET, { apiKey: apiKey || undefined });
      stats.yield++;
      console.log("✅");
    } catch (e) {
      stats.errors++;
      console.log(`❌ ${e instanceof Error ? e.message : e}`);
    }
    await sleep(600);
  }

  // ── Phase 5: DCA live trigger ─────────────────────────────────────────────
  console.log(`\n── Phase 5: DCA live triggers (${args.dcaTrigger}) ──`);
  for (let i = 0; i < args.dcaTrigger; i++) {
    process.stdout.write(`  [${i + 1}/${args.dcaTrigger}] `);
    try {
      await runDca(WALLET, { apiKey: apiKey || undefined });
      stats.dcaTrigger++;
      console.log("✅");
    } catch (e) {
      stats.errors++;
      console.log(`❌ ${e instanceof Error ? e.message : e}`);
    }
    await sleep(1000);
  }

  // ── Phase 6: Payee directory seeds (Payees page proof) ───────────────────
  console.log("\n── Phase 6: Payee directory seeds (10 teams) ──");
  for (let i = 0; i < 10; i++) {
    const name = `Bulk Team ${i + 1}`;
    try {
      await db.insert(payees).values({
        userWallet: WALLET,
        name,
        type: "team",
        payoutMode: "direct",
        recipientAddresses: [
          { name: `${name} Alice`, address: syntheticRecipient(0x20000 + i * 2) },
          { name: `${name} Bob`, address: syntheticRecipient(0x20000 + i * 2 + 1) },
        ],
        memberCount: 2,
      });
    } catch {
      /* duplicate ok */
    }
  }
  console.log("  ✅ payees seeded");

  const endCount = await countLogs();
  const added = endCount - startCount;

  const wfCount = await db.select({ c: sql<number>`count(*)::int` }).from(activeWorkflows);
  const txRows = await db.execute(sql`
    SELECT count(*)::int as n FROM executions_log
    WHERE tx_hash IS NOT NULL AND length(tx_hash) = 66 AND tx_hash NOT LIKE '0x1111%'
  `);

  console.log("\n" + "=".repeat(60));
  console.log("BULK PROOF SUMMARY");
  console.log("=".repeat(60));
  console.log(`New log rows this run:     ${added}`);
  console.log(`Total executions_log:      ${endCount}`);
  console.log(`Rows with real txHash:     ${(txRows.rows[0] as { n: number }).n}`);
  console.log(`Active workflows:          ${wfCount[0].c}`);
  console.log(`Payroll OK:                ${stats.payroll}`);
  console.log(`DCA schedule OK:           ${stats.dcaSchedule}`);
  console.log(`Guardian OK:               ${stats.guardian}`);
  console.log(`Yield OK:                  ${stats.yield}`);
  console.log(`DCA trigger OK:            ${stats.dcaTrigger}`);
  console.log(`Errors:                    ${stats.errors}`);
  console.log("\nAudit: pnpm --prefix nexus-agent exec tsx src/scripts/db-audit.ts");

  const latest = await db.query.executionsLog.findMany({
    where: eq(executionsLog.userWallet, WALLET),
    orderBy: [desc(executionsLog.timestamp)],
    limit: 5,
  });
  console.log("\nLatest 5 rows:");
  for (const r of latest) {
    console.log(`  ${r.status} | ${r.action} | $${r.amount} | ${r.reason?.slice(0, 60)}…`);
  }

  process.exit(stats.errors > added ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
