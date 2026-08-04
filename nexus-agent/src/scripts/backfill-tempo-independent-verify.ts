/**
 * Backfill independentVerification on existing tempo_transfer rows in executions_log.
 * Usage: pnpm --prefix nexus-agent run tempo:backfill-verify
 */
import "../lib/env.js";
import { db } from "../db/client.js";
import { executionsLog } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { verifyTempoTxReceipt } from "../lib/independent-tempo-verify.js";
import { TEMPO_PROOF_TXS } from "../lib/tier2-proofs.js";

async function main() {
  console.log("Backfilling Tempo independentVerification on executions_log...\n");

  let updated = 0;
  let skipped = 0;

  for (const proof of TEMPO_PROOF_TXS) {
    const row = await db.query.executionsLog.findFirst({
      where: eq(executionsLog.txHash, proof.txHash),
    });

    if (!row) {
      console.log(`  • No row for ${proof.txHash.slice(0, 14)}… — skipped`);
      skipped++;
      continue;
    }

    const existing = row.aiAnalysis as Record<string, unknown> | null;
    if (existing?.independentVerification) {
      console.log(`  • Already verified ${proof.txHash.slice(0, 14)}… — skipped`);
      skipped++;
      continue;
    }

    const independentVerification = await verifyTempoTxReceipt(proof.txHash);
    await db
      .update(executionsLog)
      .set({
        aiAnalysis: {
          ...(existing ?? {}),
          independentVerification,
        },
      })
      .where(eq(executionsLog.id, row.id));

    console.log(
      `  ✓ ${proof.txHash.slice(0, 14)}… verified=${independentVerification.verified}`,
    );
    updated++;
  }

  console.log(`\nDone — updated ${updated}, skipped ${skipped}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
