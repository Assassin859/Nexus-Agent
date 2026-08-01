/**
 * trigger-many-workflows.ts
 * Fires multiple distinct KeeperHub workflow registrations against the live Railway agent.
 * Each DCA schedule call uses different amount + cronSchedule → unique workflowId on KeeperHub.
 * Run: pnpm --prefix nexus-agent run trigger-workflows
 */

import "../lib/env.js";
import { registerDcaWorkflow } from "../modules/dca-schedule.js";
import { handle as handlePaychain } from "../modules/paychain.js";
import { db } from "../db/client.js";
import { executionsLog } from "../db/schema.js";
import { desc, eq } from "drizzle-orm";

const WALLET = (
  process.env.NEXT_PUBLIC_WALLET_ADDRESS || "0x89f97Cb35236a1d0190FB25B31C5C0fF4107Ec1b"
).toLowerCase();

const DCA_CONFIGS = [
  { amount: 10,  cronSchedule: "0 9 * * 5",   label: "10 USDC → ETH (Weekly Friday 9am)"   },
  { amount: 25,  cronSchedule: "0 10 * * 1",  label: "25 USDC → ETH (Weekly Monday 10am)"  },
  { amount: 50,  cronSchedule: "0 8 1 * *",   label: "50 USDC → ETH (Monthly 1st 8am)"     },
  { amount: 100, cronSchedule: "0 12 15 * *", label: "100 USDC → ETH (Monthly 15th 12pm)"  },
  { amount: 15,  cronSchedule: "0 9 * * 3",   label: "15 USDC → ETH (Weekly Wednesday 9am)" },
];

const PAYCHAIN_CONFIGS = [
  {
    label: "Engineering Payroll — Alice & Bob",
    amount: 200,
    payees: [
      { name: "Alice Chen",   address: "0x742d35Cc6634C0532925a3b844Bc454e4438f44e", amount: 100 },
      { name: "Bob Martinez", address: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045", amount: 100 },
    ],
  },
  {
    label: "Design Payroll — Carol",
    amount: 150,
    payees: [
      { name: "Carol Smith", address: "0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B", amount: 150 },
    ],
  },
];

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log("=================================================");
  console.log("🚀 MULTI-WORKFLOW TRIGGER — KeeperHub Registration");
  console.log(`📍 Wallet: ${WALLET}`);
  console.log("=================================================\n");

  // ── Phase 1: DCA Workflow Registrations ─────────────────────────────────────
  console.log("📌 Phase 1: Registering DCA Workflows on KeeperHub\n");

  const dcaResults: Array<{ label: string; workflowId?: string; success: boolean; message: string }> = [];

  for (const config of DCA_CONFIGS) {
    process.stdout.write(`  ⏳ ${config.label} ... `);
    try {
      const result = await registerDcaWorkflow({
        userWallet: WALLET,
        amount: config.amount,
        cronSchedule: config.cronSchedule,
      });
      const wfId = (result as any).workflowId;
      dcaResults.push({ label: config.label, workflowId: wfId, success: !!(result as any).success, message: (result as any).message || "" });
      if (wfId) {
        console.log(`✅ workflowId: ${wfId}`);
      } else {
        console.log(`⚠️  ${(result as any).message || JSON.stringify(result)}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      dcaResults.push({ label: config.label, success: false, message: msg });
      console.log(`❌ ${msg}`);
    }
    await sleep(800); // slight delay between calls
  }

  // ── Phase 2: PayChain Payroll Registrations ──────────────────────────────────
  console.log("\n📌 Phase 2: Registering PayChain Payroll Workflows on KeeperHub\n");

  const paychainResults: Array<{ label: string; success: boolean; message: string }> = [];

  for (const config of PAYCHAIN_CONFIGS) {
    process.stdout.write(`  ⏳ ${config.label} ... `);
    try {
      const recipient = config.payees[0].address;
      const result = await handlePaychain({
        walletAddress: WALLET,
        userMessage: `pay ${recipient} ${config.amount} USDC every Friday at 9am`,
      });
      const msg = (result as any).message || JSON.stringify(result);
      paychainResults.push({ label: config.label, success: !!(result as any).success, message: msg });
      console.log(`${(result as any).success ? "✅" : "⚠️ "} ${msg}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      paychainResults.push({ label: config.label, success: false, message: msg });
      console.log(`❌ ${msg}`);
    }
    await sleep(800);
  }

  // ── Phase 3: Read back the latest executions log to confirm ──────────────────
  console.log("\n📌 Phase 3: Last 10 execution log entries\n");
  const logs = await db.query.executionsLog.findMany({
    where: eq(executionsLog.userWallet, WALLET),
    orderBy: [desc(executionsLog.timestamp)],
    limit: 10,
  });

  for (const row of logs) {
    const ts = row.timestamp ? new Date(row.timestamp).toLocaleTimeString() : "—";
    const ai = row.aiAnalysis as any;
    const wfId = ai?.workflowId || ai?.keeperhubWorkflowId || "—";
    console.log(`  [${ts}] ${row.status} | ${row.action} | wfId: ${wfId}`);
  }

  // ── Summary ──────────────────────────────────────────────────────────────────
  console.log("\n=================================================");
  console.log("📊 SUMMARY");
  console.log("=================================================");

  const dcaOk = dcaResults.filter((r) => r.workflowId).length;
  const paychainOk = paychainResults.filter((r) => r.success).length;

  console.log(`DCA workflows registered:      ${dcaOk} / ${DCA_CONFIGS.length}`);
  console.log(`PayChain workflows triggered:  ${paychainOk} / ${PAYCHAIN_CONFIGS.length}`);
  console.log("\nRegistered workflow IDs (viewable on KeeperHub dashboard):");

  for (const r of dcaResults) {
    if (r.workflowId) {
      console.log(`  ✅ ${r.label}`);
      console.log(`     → https://app.keeperhub.com/workflows/${r.workflowId}`);
    }
  }

  const total = dcaOk + paychainOk;
  if (total === 0) {
    console.log("\n⚠️  No workflows were registered on KeeperHub (MCP may be in stub mode).");
    console.log("   → Check KEEPERHUB_API_KEY on Railway → nexus-agent → Variables");
  } else {
    console.log(`\n🎉 ${total} workflow(s) live on KeeperHub! Open the dashboard Feed to see them.`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
