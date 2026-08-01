import "../lib/env.js";
import { db } from "../db/client.js";
import { executionsLog } from "../db/schema.js";
import { desc } from "drizzle-orm";

async function check() {
  const logs = await db.select().from(executionsLog).orderBy(desc(executionsLog.timestamp));
  console.log("=================================================");
  console.log(`📊 DB EXECUTIONS LOG (Total Records: ${logs.length})`);
  console.log("=================================================\n");
  logs.forEach((l, i) => {
    const tsStr = l.timestamp ? l.timestamp.toISOString() : "N/A";
    console.log(
      `[${i + 1}] [${tsStr}] Status: ${l.status} | Action: ${l.action} | TxHash: ${l.txHash || 'None'}\n    Reason: ${l.reason || 'N/A'}\n`
    );
  });
}

check().catch(console.error);
