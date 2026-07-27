import dotenv from "dotenv";
dotenv.config({ path: "../.env" });

import express from "express";
import cors from "cors";
import cron from "node-cron";
import { run as runGuardian } from "./modules/guardian.js";
import { run as runYieldRotator } from "./modules/yield-rotator.js";
import { run as runDCA } from "./modules/dca.js";
import { handle as handlePaychain } from "./modules/paychain.js";
import { getAavePosition } from "./lib/aave.js";
import { db } from "./db/client.js";
import { activeWorkflows, executionsLog } from "./db/schema.js";
import { eq, desc } from "drizzle-orm";

const app = express();
app.use(cors());
app.use(express.json());

const DEMO_WALLET = (
  process.env.NEXT_PUBLIC_WALLET_ADDRESS || "0x89f97Cb35236a1d0190FB25B31C5C0fF4107Ec1b"
).toLowerCase();

// ── Health Check ──────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "nexus-agent", ts: new Date().toISOString() });
});

// ── Portfolio API — real Aave V3 data ─────────────────────────────────────────
app.get("/api/portfolio/:walletAddress", async (req, res) => {
  try {
    const walletAddress = req.params.walletAddress.toLowerCase();

    // Run in parallel: live Aave position + DB workflows
    const [position, workflows] = await Promise.all([
      getAavePosition(walletAddress),
      db.query.activeWorkflows.findMany({
        where: eq(activeWorkflows.userWallet, walletAddress),
      }),
    ]);

    const ltvPercent = position.collateralUSD > 0
      ? parseFloat(((position.debtUSD / position.collateralUSD) * 100).toFixed(1))
      : 0;

    res.json({
      walletAddress,
      healthFactor:       parseFloat(position.healthFactor.toFixed(2)),
      collateralUSD:      parseFloat(position.collateralUSD.toFixed(0)),
      debtUSD:            parseFloat(position.debtUSD.toFixed(0)),
      availableBorrowsUSD: parseFloat(position.availableBorrowsUSD.toFixed(0)),
      ltvPercent,
      usdcWalletBalance:  parseFloat(position.usdcWalletBalance.toFixed(2)),
      currentUSDCSupplyAPY: parseFloat(position.currentUSDCSupplyAPY.toFixed(2)),
      workflows,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Portfolio fetch failed" });
  }
});

// ── Activity Feed API — real executions_log from DB ──────────────────────────
app.get("/api/feed/:walletAddress", async (req, res) => {
  try {
    const walletAddress = req.params.walletAddress.toLowerCase();
    const logs = await db.query.executionsLog.findMany({
      where: eq(executionsLog.userWallet, walletAddress),
      orderBy: [desc(executionsLog.timestamp)],
      limit: 50,
    });
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Feed fetch failed" });
  }
});

// ── PayChain / Chat Endpoint ──────────────────────────────────────────────────
app.post("/api/payroll", async (req, res) => {
  try {
    const result = await handlePaychain(req.body);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Payroll processing failed" });
  }
});

// ── Manual Trigger Endpoints ──────────────────────────────────────────────────
app.post("/api/trigger/guardian", async (req, res) => {
  const wallet = (req.body.wallet || DEMO_WALLET).toLowerCase();
  runGuardian(wallet)
    .then(() => res.json({ triggered: true, wallet }))
    .catch(err => res.status(500).json({ error: err.message }));
});

app.post("/api/trigger/dca", async (req, res) => {
  const wallet = (req.body.wallet || DEMO_WALLET).toLowerCase();
  runDCA(wallet)
    .then(() => res.json({ triggered: true, wallet }))
    .catch(err => res.status(500).json({ error: err.message }));
});

app.post("/api/trigger/yield", async (req, res) => {
  const wallet = (req.body.wallet || DEMO_WALLET).toLowerCase();
  runYieldRotator(wallet)
    .then(() => res.json({ triggered: true, wallet }))
    .catch(err => res.status(500).json({ error: err.message }));
});

// ── Background Cron Loops ─────────────────────────────────────────────────────
function startLoops() {
  // Guardian loop — every 5 minutes
  cron.schedule("*/5 * * * *", () => {
    runGuardian(DEMO_WALLET).catch(err => console.error("[GUARDIAN CRON ERROR]:", err));
  });

  // Yield loop — every 15 minutes
  cron.schedule("*/15 * * * *", () => {
    runYieldRotator(DEMO_WALLET).catch(err => console.error("[YIELD CRON ERROR]:", err));
  });

  // DCA loop — hourly
  cron.schedule("0 * * * *", () => {
    runDCA(DEMO_WALLET).catch(err => console.error("[DCA CRON ERROR]:", err));
  });

  console.log("[NEXUS] Background cron loops initialized (Guardian: 5min, Yield: 15min, DCA: hourly).");
}

// ── Start Server ──────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || "3001", 10);
app.listen(PORT, () => {
  console.log(`[NEXUS] nexus-agent API running on http://localhost:${PORT}`);
  console.log(`[NEXUS] Demo wallet: ${DEMO_WALLET}`);
  startLoops();
});

process.on("SIGTERM", () => {
  console.log("[NEXUS] SIGTERM received — gracefully shutting down.");
  process.exit(0);
});
