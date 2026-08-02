/**
 * Borrow USDC on the monitored wallet's Aave position to lower health factor (demo stress test).
 * Requires MONITORED_WALLET_PRIVATE_KEY in root .env.
 *
 * Usage:
 *   BORROW_USDC=1500 pnpm exec tsx src/scripts/stress-hf-borrow.ts
 */
import "../lib/env.js";
import { Contract, Wallet, parseUnits } from "ethers";
import { getProvider } from "../lib/rpc.js";
import { AAVE_V3_POOL, USDC_SEPOLIA } from "../lib/calldata.js";
import { getAavePosition } from "../lib/aave.js";

const pk =
  process.env.MONITORED_WALLET_PRIVATE_KEY ||
  process.env.PRIVATE_KEY ||
  "";

const monitored = (
  process.env.NEXT_PUBLIC_WALLET_ADDRESS || "0x89f97Cb35236a1d0190FB25B31C5C0fF4107Ec1b"
).toLowerCase();

const borrowUsd = Number(process.env.BORROW_USDC || "1500");

if (!pk) {
  console.error("❌ Set MONITORED_WALLET_PRIVATE_KEY in .env (MetaMask export for monitored wallet).");
  process.exit(1);
}

const provider = await getProvider();
const wallet = new Wallet(pk, provider);
const signer = (await wallet.getAddress()).toLowerCase();

if (signer !== monitored) {
  console.warn(`⚠️  Signer ${signer} != monitored ${monitored}`);
}

const before = await getAavePosition(monitored);
console.log("Before borrow:");
console.log(`  HF: ${before.healthFactor?.toFixed(3)} | Debt: $${before.debtUSD.toFixed(2)}`);

const pool = new Contract(
  AAVE_V3_POOL,
  [
    "function borrow(address asset, uint256 amount, uint256 interestRateMode, uint16 referralCode, address onBehalfOf)",
  ],
  wallet,
);

const usdc = new Contract(USDC_SEPOLIA, ["function decimals() view returns (uint8)"], provider);
const decimals = Number(await usdc.decimals());
const amountRaw = parseUnits(borrowUsd.toFixed(6), decimals);

console.log(`\nBorrowing ${borrowUsd} USDC (variable rate) on ${monitored}...`);
const tx = await pool.borrow(USDC_SEPOLIA, amountRaw, 2, 0, monitored);
console.log("Tx:", tx.hash);
const receipt = await tx.wait();
console.log("Mined block:", receipt?.blockNumber);

const after = await getAavePosition(monitored);
console.log("\nAfter borrow:");
console.log(`  HF: ${after.healthFactor?.toFixed(3)} | Debt: $${after.debtUSD.toFixed(2)}`);
console.log(`  Wallet USDC: $${after.usdcWalletBalance.toFixed(2)}`);
