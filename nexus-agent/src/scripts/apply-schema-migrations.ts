/**
 * Apply schema migrations 0003 (repayment_cycles unique per wallet).
 * Run: pnpm --prefix nexus-agent exec tsx src/scripts/apply-schema-migrations.ts
 */
import "../lib/env.js";
import pg from "pg";

const MIGRATIONS = [
  `CREATE UNIQUE INDEX IF NOT EXISTS repayment_cycles_user_wallet_unique ON repayment_cycles (user_wallet);`,
];

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL not set");
    process.exit(1);
  }
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  for (const sql of MIGRATIONS) {
    await client.query(sql);
  }
  await client.end();
  console.log("✅ Schema migrations applied.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
