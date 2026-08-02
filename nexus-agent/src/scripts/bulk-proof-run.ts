/**
 * bulk-proof-run.ts — Generate diverse module proofs (NO synthetic payroll addresses).
 *
 * Usage:
 *   pnpm --prefix nexus-agent run bulk-proof
 *   pnpm --prefix nexus-agent run bulk-proof -- --target 100
 *   pnpm --prefix nexus-agent run bulk-proof -- --guardian 30 --yield 25 --dca-schedule 10
 *
 * Modules: Guardian (hold/repay) · Yield rotator · DCA schedule · DCA trigger
 * Real payroll only via --payroll 1-3 (uses known testnet addresses + LLM path).
 */
import "../lib/env.js";
import { db } from "../db/client.js";
import { executionsLog } from "../db/schema.js";
import { sql, eq } from "drizzle-orm";
import { DEMO_MONITORED_WALLET, DEMO_PAYROLL_RECIPIENTS } from "../lib/demo-addresses.js";
import { registerDcaWorkflow } from "../modules/dca-schedule.js";
import { handle as handlePaychain } from "../modules/paychain.js";
import { run as runGuardian } from "../modules/guardian.js";
import { run as runYield } from "../modules/yield-rotator.js";
import { run as runDca } from "../modules/dca.js";
import { resolveKeeperHubApiKey } from "../lib/user-context.js";

const WALLET = (
  process.env.NEXT_PUBLIC_WALLET_ADDRESS || DEMO_MONITORED_WALLET
).toLowerCase();

const REAL_PAYROLL_RECIPIENTS = DEMO_PAYROLL_RECIPIENTS.map((p) => ({ ...p }));

type Args = {
  guardian: number;
  dcaSchedule: number;
  yieldRuns: number;
  dcaTrigger: number;
  payroll: number;
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
    return {
      guardian: Math.floor(target * 0.35),
      yieldRuns: Math.floor(target * 0.30),
      dcaSchedule: Math.floor(target * 0.20),
      dcaTrigger: Math.floor(target * 0.15),
      payroll: Math.min(DEMO_PAYROLL_RECIPIENTS.length, Math.floor(target * 0.02)),
      dryRun,
    };
  }

  return {
    guardian: get("--guardian", 25),
    yieldRuns: get("--yield", 25),
    dcaSchedule: get("--dca-schedule", 10),
    dcaTrigger: get("--dca-trigger", 5),
    payroll: get("--payroll", 0),
    dryRun,
  };
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

const CRON_VARIANTS = [
  "0 9 * * 1",
  "0 10 * * 2",
  "0 11 * * 3",
  "0 12 * * 4",
  "0 13 * * 5",
  "0 8 1 * *",
];

async function countLogs(): Promise<number> {
  const r = await db.select({ c: sql<number>`count(*)::int` }).from(executionsLog);
  return r[0].c;
}

async function main() {
  const args = parseArgs();
  const startCount = await countLogs();

  console.log("=".repeat(60));
  console.log("NEXUSAGENT BULK PROOF (module-diverse, no fake payrolls)");
  console.log("=".repeat(60));
  console.log(`Wallet:  ${WALLET}`);
  console.log(`Start:   ${startCount} log rows`);
  console.log(
    `Plan:    guardian=${args.guardian} yield=${args.yieldRuns} dcaSched=${args.dcaSchedule} dcaTrig=${args.dcaTrigger} payroll=${args.payroll}`,
  );

  if (args.dryRun) {
    console.log("DRY RUN");
    process.exit(0);
  }

  const apiKey = await resolveKeeperHubApiKey(WALLET);
  const stats = { guardian: 0, yield: 0, dcaSchedule: 0, dcaTrigger: 0, payroll: 0, errors: 0 };

  console.log(`\n── Guardian (${args.guardian}) ──`);
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

  console.log(`\n── Yield rotator (${args.yieldRuns}) ──`);
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

  console.log(`\n── DCA schedule (${args.dcaSchedule}) ──`);
  for (let i = 0; i < args.dcaSchedule; i++) {
    const amount = 10 + (i % 10) * 5;
    const cron = CRON_VARIANTS[i % CRON_VARIANTS.length];
    process.stdout.write(`  [${i + 1}/${args.dcaSchedule}] `);
    try {
      const r = await registerDcaWorkflow({ userWallet: WALLET, amount, cronSchedule: cron });
      if (r.success) {
        stats.dcaSchedule++;
        console.log(`✅ kh=${r.keeperhubWorkflowId || "local"}`);
      } else {
        stats.errors++;
        console.log(`⚠️ ${r.message}`);
      }
    } catch (e) {
      stats.errors++;
      console.log(`❌ ${e instanceof Error ? e.message : e}`);
    }
    await sleep(500);
  }

  console.log(`\n── DCA live trigger (${args.dcaTrigger}) ──`);
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

  if (args.payroll > 0) {
    console.log(`\n── Real payroll (${Math.min(args.payroll, REAL_PAYROLL_RECIPIENTS.length)}) ──`);
    for (let i = 0; i < Math.min(args.payroll, REAL_PAYROLL_RECIPIENTS.length); i++) {
      const p = REAL_PAYROLL_RECIPIENTS[i];
      process.stdout.write(`  ${p.label} … `);
      try {
        const r = await handlePaychain({
          walletAddress: WALLET,
          userMessage: `pay ${p.address} ${p.amount} USDC every Friday at 9am confirm`,
          apiKey: apiKey || undefined,
        });
        if (r.success) {
          stats.payroll++;
          console.log(`✅ ${r.workflowId || "ok"}`);
        } else {
          stats.errors++;
          console.log(`⚠️ ${r.message?.slice(0, 80)}`);
        }
      } catch (e) {
        stats.errors++;
        console.log(`❌ ${e instanceof Error ? e.message : e}`);
      }
      await sleep(1000);
    }
  }

  const endCount = await countLogs();
  const breakdown = await db.execute(sql`
    SELECT action, count(*)::int as n FROM executions_log
    WHERE user_wallet = ${WALLET} GROUP BY action ORDER BY n DESC
  `);

  console.log("\n" + "=".repeat(60));
  console.log("SUMMARY");
  console.log("=".repeat(60));
  console.log(`Added:     ${endCount - startCount} rows (total ${endCount})`);
  console.log(`Guardian:  ${stats.guardian} | Yield: ${stats.yield} | DCA sched: ${stats.dcaSchedule} | DCA trig: ${stats.dcaTrigger} | Payroll: ${stats.payroll}`);
  console.log(`Errors:    ${stats.errors}`);
  console.log("\nAction breakdown:");
  for (const r of breakdown.rows as { action: string; n: number }[]) {
    console.log(`  ${r.action.padEnd(18)} ${r.n}`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
