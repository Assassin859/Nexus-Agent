/**
 * Reset current repayment cycle budget (sets totalRepaidThisCycleUSD → 0).
 * Usage: pnpm exec tsx src/scripts/reset-repayment-cycle.ts
 */
import "../lib/env.js";
import { db } from "../db/client.js";
import { repaymentCycles } from "../db/schema.js";
import { eq } from "drizzle-orm";

const wallet = (
  process.env.NEXT_PUBLIC_WALLET_ADDRESS || "0x89f97Cb35236a1d0190FB25B31C5C0fF4107Ec1b"
).toLowerCase();

const cycle = await db.query.repaymentCycles.findFirst({
  where: eq(repaymentCycles.userWallet, wallet),
});

if (!cycle) {
  console.log("No repayment cycle found for", wallet);
  process.exit(0);
}

console.log("Before:", {
  limit: cycle.cycleLimitUSD,
  repaid: cycle.totalRepaidThisCycleUSD,
  remaining: cycle.cycleLimitUSD - (cycle.totalRepaidThisCycleUSD ?? 0),
});

const [updated] = await db
  .update(repaymentCycles)
  .set({ totalRepaidThisCycleUSD: 0 })
  .where(eq(repaymentCycles.id, cycle.id))
  .returning();

console.log("After reset:", {
  limit: updated.cycleLimitUSD,
  repaid: updated.totalRepaidThisCycleUSD,
  remaining: updated.cycleLimitUSD - (updated.totalRepaidThisCycleUSD ?? 0),
});
