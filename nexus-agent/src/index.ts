import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import cron from "node-cron";
import { run as runGuardian } from "./modules/guardian.js";
import { run as runYieldRotator } from "./modules/yield-rotator.js";
import { run as runDCA } from "./modules/dca.js";
import { handle as handlePaychain } from "./modules/paychain.js";
import { db } from "./db/client.js";
import { activeWorkflows, executionsLog } from "./db/schema.js";
import { eq, desc } from "drizzle-orm";

dotenv.config({ path: "../.env" });

const app = express();
app.use(cors());
app.use(express.json());

const DEMO_WALLET = (process.env.NEXT_PUBLIC_WALLET_ADDRESS || "0x89f97Cb35236a1d0190FB25B31C5C0fF4107Ec1b").toLowerCase();

// Health Check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "nexus-agent", ts: new Date().toISOString() });
});

// Portfolio API
app.get("/api/portfolio/:walletAddress", async (req, res) => {
  try {
    const walletAddress = req.params.walletAddress.toLowerCase();
    const workflows = await db.query.activeWorkflows.findMany({
      where: eq(activeWorkflows.userWallet, walletAddress),
    });
    res.json({ walletAddress, workflows, healthFactor: 1.87 });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Database query failed" });
  }
});

// Activity Feed API
app.get("/api/feed/:walletAddress", async (req, res) => {
  try {
    const walletAddress = req.params.walletAddress.toLowerCase();
    const logs = await db.query.executionsLog.findMany({
      where: eq(executionsLog.userWallet, walletAddress),
      orderBy: [desc(executionsLog.timestamp)],
      limit: 20,
    });
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Database query failed" });
  }
});

// PayChain Endpoint
app.post("/api/payroll", async (req, res) => {
  try {
    const result = await handlePaychain(req.body);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Payroll processing failed" });
  }
});

function startLoops() {
  // Guardian loop — every 5 minutes
  cron.schedule("*/5 * * * *", () => {
    runGuardian(DEMO_WALLET).catch((err) => console.error("[GUARDIAN CRON ERROR]:", err));
  });

  // Yield loop — every 15 minutes
  cron.schedule("*/15 * * * *", () => {
    runYieldRotator(DEMO_WALLET).catch((err) => console.error("[YIELD CRON ERROR]:", err));
  });

  // DCA loop — hourly
  cron.schedule("0 * * * *", () => {
    runDCA(DEMO_WALLET).catch((err) => console.error("[DCA CRON ERROR]:", err));
  });

  console.log("[NEXUS] Background cron loops initialized.");
}

const PORT = parseInt(process.env.PORT || "3001", 10);
app.listen(PORT, () => {
  console.log(`[NEXUS] nexus-agent API server running on port ${PORT}`);
  startLoops();
});

process.on("SIGTERM", () => {
  console.log("[NEXUS] SIGTERM signal received. Gracefully terminating agent server.");
  process.exit(0);
});
