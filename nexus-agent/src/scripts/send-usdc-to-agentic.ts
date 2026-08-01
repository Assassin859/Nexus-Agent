/**
 * Send project USDC from monitored MetaMask wallet → agentic executor wallet.
 * Requires MONITORED_WALLET_PRIVATE_KEY or PRIVATE_KEY in root .env (MetaMask export).
 * Usage: TRANSFER_USDC_AMOUNT=500 pnpm exec tsx src/scripts/send-usdc-to-agentic.ts
 */
import "../lib/env.js";
import { Contract, Wallet, parseUnits } from "ethers";
import { getProvider } from "../lib/rpc.js";
import { USDC_SEPOLIA } from "../lib/calldata.js";
import { getUsdcBalance } from "../lib/aave.js";

const pk =
  process.env.MONITORED_WALLET_PRIVATE_KEY ||
  process.env.PRIVATE_KEY ||
  process.env.AGENTIC_WALLET_KEY ||
  "";

const monitored = (process.env.NEXT_PUBLIC_WALLET_ADDRESS || "").toLowerCase();
const agentic = (process.env.AGENTIC_WALLET_ADDRESS || "").toLowerCase();
const amountUsd = Number(process.env.TRANSFER_USDC_AMOUNT || "500");

if (!pk) {
  console.error("❌ No signing key in .env.");
  console.error("   Add MONITORED_WALLET_PRIVATE_KEY=<MetaMask Account 1 export> to .env");
  console.error("   Or use MetaMask Send manually:");
  console.error(`   Network: Base Sepolia | Token: USDC ${USDC_SEPOLIA}`);
  console.error(`   To: ${agentic} | Amount: ${amountUsd} USDC`);
  process.exit(1);
}

const provider = await getProvider();
const wallet = new Wallet(pk, provider);
const signerAddr = (await wallet.getAddress()).toLowerCase();

if (signerAddr !== monitored) {
  console.warn(`⚠️  Signer ${signerAddr} != monitored ${monitored}`);
}

const usdc = new Contract(USDC_SEPOLIA, [
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
], wallet);

const decimals = Number(await usdc.decimals());
const balanceBefore = await getUsdcBalance(signerAddr);
console.log(`From: ${signerAddr}`);
console.log(`To:   ${agentic}`);
console.log(`Balance before: ${balanceBefore.toFixed(2)} USDC`);

if (balanceBefore < amountUsd) {
  console.error(`❌ Insufficient USDC (have ${balanceBefore.toFixed(2)}, need ${amountUsd})`);
  process.exit(1);
}

const amountRaw = parseUnits(amountUsd.toFixed(6), decimals);
console.log(`Sending ${amountUsd} USDC...`);
const tx = await usdc.transfer(agentic, amountRaw);
console.log("Tx submitted:", tx.hash);
const receipt = await tx.wait();
console.log("Mined in block:", receipt?.blockNumber);
console.log("Agentic USDC after:", await getUsdcBalance(agentic));
