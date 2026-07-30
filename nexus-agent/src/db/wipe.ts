import { db, pool } from "./client.js";
import { payees, activeWorkflows, executionsLog, repaymentCycles, userSettings } from "./schema.js";

async function wipe() {
  console.log("🧹 Wiping database tables...");
  try {
    await db.delete(payees);
    await db.delete(activeWorkflows);
    await db.delete(executionsLog);
    await db.delete(repaymentCycles);
    await db.delete(userSettings);
    console.log("✅ ALL TABLES SUCCESSFULLY WIPED CLEAN!");
  } catch (err) {
    console.error("❌ Wipe failed:", err);
  } finally {
    await pool.end();
  }
}

wipe();
