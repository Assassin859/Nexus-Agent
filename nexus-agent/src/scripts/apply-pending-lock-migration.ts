/**
 * Apply pending-lock partial unique index to production Postgres.
 * Run: pnpm --prefix nexus-agent exec tsx src/scripts/apply-pending-lock-migration.ts
 */
import "../lib/env.js";
import pg from "pg";

const SQL = `
CREATE UNIQUE INDEX IF NOT EXISTS executions_log_pending_lock_idx
ON executions_log (user_wallet, action)
WHERE status = 'pending';
`;

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL not set");
    process.exit(1);
  }
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  await client.query(SQL);
  await client.end();
  console.log("✅ Pending lock index applied (or already exists).");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
