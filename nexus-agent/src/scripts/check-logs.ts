import "../lib/env.js";
import { db } from "../db/client.js";
import { executionsLog } from "../db/schema.js";

async function check() {
  const logs = await db.select().from(executionsLog);
  console.log("=== DB EXECUTIONS LOG ===");
  console.log(`Total records: ${logs.length}`);
  logs.forEach((l, i) => {
    console.log(`[${i+1}] Status: ${l.status} | Action: ${l.action} | TxHash: ${l.txHash || 'None'}`);
  });
}

check().catch(console.error);
