/**
 * Re-register active DCA: cancels old KeeperHub cron workflow and creates
 * a new registration with remoteCronEnabled:false (Fix 4 migration).
 *
 * Run: pnpm --prefix nexus-agent exec tsx src/scripts/reregister-dca.ts
 */
import "../lib/env.js";
import { db } from "../db/client.js";
import { activeWorkflows } from "../db/schema.js";
import { eq, and } from "drizzle-orm";
import { registerDcaWorkflow } from "../modules/dca-schedule.js";

const wallet = (
  process.env.NEXT_PUBLIC_WALLET_ADDRESS || "0x89f97cb35236a1d0190fb25b31c5c0ff4107ec1b"
).toLowerCase();

async function main() {
  const existing = await db.query.activeWorkflows.findFirst({
    where: and(
      eq(activeWorkflows.userWallet, wallet),
      eq(activeWorkflows.type, "dca"),
      eq(activeWorkflows.status, "active"),
    ),
  });

  if (!existing) {
    console.error("No active DCA workflow found for", wallet);
    process.exit(1);
  }

  console.log("Current DCA row:", {
    pgId: existing.id,
    priorKhId: existing.keeperhubWorkflowId,
    amount: existing.amount,
    cronSchedule: existing.cronSchedule,
  });

  const result = await registerDcaWorkflow({
    userWallet: wallet,
    amount: existing.amount,
    cronSchedule: existing.cronSchedule ?? undefined,
  });

  console.log("\nRe-register result:", result);

  const updated = await db.query.activeWorkflows.findFirst({
    where: eq(activeWorkflows.id, existing.id),
  });
  console.log("\nUpdated row:", {
    pgId: updated?.id,
    newKhId: updated?.keeperhubWorkflowId,
    amount: updated?.amount,
    cronSchedule: updated?.cronSchedule,
  });

  if (updated?.keeperhubWorkflowId === existing.keeperhubWorkflowId) {
    console.warn("\n⚠ KeeperHub workflow ID unchanged — cancel/create may have failed or returned stub.");
    process.exit(2);
  }

  console.log("\n✅ DCA migrated: remote cron disabled; local executor remains active.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
