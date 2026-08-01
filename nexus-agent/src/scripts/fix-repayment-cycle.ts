import "../lib/env.js";
import { capCycleRepaidToLimit } from "../lib/repayment-cycle.js";

const wallet = (process.env.NEXT_PUBLIC_WALLET_ADDRESS || "0x89f97cb35236a1d0190fb25b31c5c0ff4107ec1b").toLowerCase();

console.log(`Fixing repayment cycle for ${wallet}...`);
const fixed = await capCycleRepaidToLimit(wallet);

if (!fixed) {
  console.log("No repayment cycle found for wallet.");
  process.exit(0);
}

console.log("After fix:");
console.log(`  limit: $${fixed.cycleLimitUSD}`);
console.log(`  repaid: $${fixed.totalRepaidThisCycleUSD}`);
console.log(`  remaining: $${Math.max(0, fixed.cycleLimitUSD - (fixed.totalRepaidThisCycleUSD ?? 0))}`);
