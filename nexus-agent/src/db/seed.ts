import { db, pool } from "./client.js";
import { repaymentCycles, activeWorkflows, executionsLog } from "./schema.js";

async function seed() {
  console.log("🌱 Starting seed database script...");

  // Wallets from our environment / spec sheets
  const walletA = "0x89f97cb35236a1d0190fb25b31c5c0ff4107ec1b".toLowerCase(); // MetaMask demo
  const walletB = "0xsafe000000000000000000000000000000000001".toLowerCase(); // Placeholder safe wallet
  const walletC = "0xrisk000000000000000000000000000000000002".toLowerCase(); // Placeholder critical wallet

  try {
    // Clear out old records for a clean run
    console.log("🧹 Clearing old db records...");
    await db.delete(executionsLog);
    await db.delete(activeWorkflows);
    await db.delete(repaymentCycles);

    console.log("🧬 Seeding database data...");

    // Seed Wallet A (your MetaMask setup)
    await db.insert(repaymentCycles).values({
      userWallet: walletA,
      cycleStart: new Date(),
      cycleEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      cycleLimitUSD: 1000,
      totalRepaidThisCycleUSD: 150, // Spent $150
    });

    const dcaA = await db.insert(activeWorkflows).values({
      userWallet: walletA,
      type: "dca",
      amount: 100, // 100 USDC swap
      cronSchedule: "0 9 * * 1", // Monday 9am
      status: "active",
    }).returning({ id: activeWorkflows.id });

    await db.insert(executionsLog).values({
      userWallet: walletA,
      workflowId: dcaA[0].id,
      action: "swap",
      amount: 100,
      status: "success",
      txHash: "0x1111111111111111111111111111111111111111111111111111111111111111",
    });

    // Seed Wallet B (Judges View - Safe Path)
    await db.insert(repaymentCycles).values({
      userWallet: walletB,
      cycleStart: new Date(),
      cycleEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      cycleLimitUSD: 1000,
      totalRepaidThisCycleUSD: 0, // Spent $0
    });

    await db.insert(activeWorkflows).values({
      userWallet: walletB,
      type: "dca",
      amount: 50,
      cronSchedule: "0 9 * * 5", // Friday 9am
      status: "active",
    });

    // Seed Wallet C (Judges View - Risk Path)
    await db.insert(repaymentCycles).values({
      userWallet: walletC,
      cycleStart: new Date(),
      cycleEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      cycleLimitUSD: 1000,
      totalRepaidThisCycleUSD: 950, // Spent $950 out of $1000
    });

    const payrollC = await db.insert(activeWorkflows).values({
      userWallet: walletC,
      type: "payroll",
      recipientAddress: "0xdead000000000000000000000000000000000000",
      amount: 200,
      cronSchedule: "0 9 * * 5",
      status: "active",
    }).returning({ id: activeWorkflows.id });

    // Logs simulation check that hit limit
    await db.insert(executionsLog).values({
      userWallet: walletC,
      workflowId: payrollC[0].id,
      action: "payroll",
      amount: 200,
      status: "reverted_simulation",
      reason: "Cycle spending limit exceeded. Proposing $200 exceeds remaining $50 budget limit.",
    });

    console.log("✨ Seeding successfully completed.");
  } catch (error) {
    console.error("❌ Seeding failed:", error);
  } finally {
    await pool.end();
  }
}

seed();
