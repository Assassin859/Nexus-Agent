import "../lib/env.js";
import { db } from "../db/client.js";
import { executionsLog } from "../db/schema.js";

async function main() {
  console.log("🧹 Clearing executions_log table in PostgreSQL database...");
  await db.delete(executionsLog);
  console.log("✅ DATABASE EXECUTIONS_LOG CLEARED CLEANLY!");
  process.exit(0);
}

main();
