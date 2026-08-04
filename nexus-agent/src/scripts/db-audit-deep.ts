import "../lib/env.js";
import { db } from "../db/client.js";
import { executionsLog } from "../db/schema.js";
import { sql } from "drizzle-orm";

const VALID_TX = /^0x[a-fA-F0-9]{64}$/;

function isValidTx(h: string | null | undefined): boolean {
  return typeof h === "string" && VALID_TX.test(h) && !h.includes("11111111");
}

const CHAIN = new Set([
  "repay",
  "supply_collateral",
  "swap",
  "rotate",
  "payroll",
  "tempo_transfer",
]);

const matrix = await db.execute(sql`
  SELECT status, action, count(*)::int AS n
  FROM executions_log
  GROUP BY status, action
  ORDER BY status, n DESC
`);

console.log("=== FULL STATUS x ACTION MATRIX ===");
for (const r of matrix.rows as { status: string; action: string; n: number }[]) {
  console.log(r.status.padEnd(22), r.action.padEnd(22), r.n);
}

const all = await db.select().from(executionsLog);
let withTx = 0;
let chainSuccessNoTx = 0;
let simulatedStub = 0;
const byStatus: Record<string, number> = {};

for (const r of all) {
  byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
  if (isValidTx(r.txHash)) withTx++;
  if (r.status === "simulated_stub") simulatedStub++;
  if (r.status === "success" && CHAIN.has(r.action) && !isValidTx(r.txHash)) {
    chainSuccessNoTx++;
  }
}

console.log("\n=== ON-CHAIN PROOF SUMMARY ===");
console.log("Total rows:", all.length);
console.log("With valid tx_hash:", withTx);
console.log("Without tx_hash:", all.length - withTx);
console.log("simulated_stub rows:", simulatedStub);
console.log("'success' on chain action but NO tx (misleading if shown as mined):", chainSuccessNoTx);
console.log("By status:", byStatus);

const repays = all.filter((r) => r.action === "repay");
const rb: Record<string, number> = {};
for (const r of repays) rb[r.status] = (rb[r.status] ?? 0) + 1;
console.log("\n=== GUARDIAN REPAY by status ===", rb);
console.log("Repay with mined tx:", repays.filter((r) => isValidTx(r.txHash)).length);

const delayedRepay = all.filter((r) => r.action === "repay" && r.status === "delayed");
console.log("\n=== DELAYED repay top reasons ===");
const reasons: Record<string, number> = {};
for (const d of delayedRepay) {
  const key = (d.reason ?? "").slice(0, 70);
  reasons[key] = (reasons[key] ?? 0) + 1;
}
for (const [k, v] of Object.entries(reasons).sort((a, b) => b[1] - a[1]).slice(0, 10)) {
  console.log(`  ${v}x  ${k}`);
}

console.log("\n=== REGISTER / NON-CHAIN actions ===");
for (const a of [
  "dca_register",
  "payroll_register",
  "guardian_register",
  "yield_register",
  "marketplace_hf_read",
  "hold",
  "block_transaction",
]) {
  const rows = all.filter((r) => r.action === a);
  if (rows.length === 0) continue;
  const statuses = [...new Set(rows.map((r) => r.status))].join(", ");
  const txs = rows.filter((r) => isValidTx(r.txHash)).length;
  console.log(`  ${a.padEnd(22)} n=${rows.length}  tx=${txs}  statuses=[${statuses}]`);
}

console.log("\n=== INTERPRETATION ===");
console.log(
  "hold/block_transaction 'success' = Guardian evaluated HF, no tx needed (every ~5 min cron).",
);
console.log(
  "delayed repay = budget exhausted, duplicate guard, or agentic wallet empty — NOT simulated, NOT mined.",
);
console.log(
  "reverted_simulation repay = pre-flight caught unsafe tx — correct resilience proof.",
);
console.log("Only rows with valid tx_hash are mined on-chain proofs.");
