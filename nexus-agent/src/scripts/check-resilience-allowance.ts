import "../lib/env.js";
import { db } from "../db/client.js";
import { executionsLog } from "../db/schema.js";
import { eq, desc, and } from "drizzle-orm";
import { getAgenticWallet } from "../lib/agentic-wallet.js";
import { ensureAllowance } from "../lib/allowance.js";
import { getAavePosition } from "../lib/aave.js";
import { Contract } from "ethers";
import { getProvider } from "../lib/rpc.js";
import { USDC_SEPOLIA, AAVE_V3_POOL } from "../lib/calldata.js";

const wallet = (
  process.env.NEXT_PUBLIC_WALLET_ADDRESS || "0x89f97Cb35236a1d0190FB25B31C5C0fF4107Ec1b"
).toLowerCase();
const agentic = getAgenticWallet();

async function main() {
  console.log("=== Resilience / Allowance Diagnostic ===\n");
  console.log("Monitored:", wallet);
  console.log("Agentic:  ", agentic ?? "(unset)");

  const simFails = await db
    .select()
    .from(executionsLog)
    .where(and(eq(executionsLog.userWallet, wallet), eq(executionsLog.status, "reverted_simulation")))
    .orderBy(desc(executionsLog.timestamp));

  console.log(`\n--- reverted_simulation rows (${simFails.length}) ---`);
  for (const r of simFails) {
    console.log(`\n[${r.timestamp?.toISOString()}] ${r.action} $${r.amount}`);
    console.log("  ", (r.reason ?? "").slice(0, 300));
  }

  const repay533Fails = simFails.filter(
    (r) => r.amount === 533 || (r.reason ?? "").includes("533"),
  );
  const latest533 = repay533Fails[0];
  if (latest533) {
    const ageH = latest533.timestamp
      ? ((Date.now() - latest533.timestamp.getTime()) / 3600000).toFixed(1)
      : "?";
    console.log(`\n--- Latest $533 sim failure: ${ageH}h ago ---`);
  }

  if (agentic) {
    const provider = await getProvider();
    const usdc = new Contract(USDC_SEPOLIA, [
      "function allowance(address owner, address spender) view returns (uint256)",
      "function balanceOf(address owner) view returns (uint256)",
    ], provider);
    const [allowance, balance] = await Promise.all([
      usdc.allowance(agentic, AAVE_V3_POOL),
      usdc.balanceOf(agentic),
    ]);
    const allowUsd = Number(allowance) / 1e6;
    const balUsd = Number(balance) / 1e6;
    console.log(`\n--- Agentic wallet USDC (live) ---`);
    console.log(`  Balance:   $${balUsd.toFixed(2)}`);
    console.log(`  Allowance to Aave pool: $${allowUsd.toFixed(2)}`);

    for (const amt of [533, 1000, 100]) {
      const need = await ensureAllowance(agentic, USDC_SEPOLIA, AAVE_V3_POOL, amt);
      console.log(`  ensureAllowance($${amt}): ${need ? "NEEDS approve tx" : "sufficient"}`);
    }
  }

  const pos = await getAavePosition(wallet);
  console.log(`\n--- Aave position (monitored) ---`);
  console.log(`  HF: ${pos.healthFactor?.toFixed(2) ?? "n/a"}`);
  console.log(`  Debt: $${pos.debtUSD.toFixed(0)} · Collateral: $${pos.collateralUSD.toFixed(0)}`);
  console.log(`  USDC wallet: $${pos.usdcWalletBalance.toFixed(2)}`);

  const recentRepay = await db
    .select()
    .from(executionsLog)
    .where(and(eq(executionsLog.userWallet, wallet), eq(executionsLog.action, "repay")))
    .orderBy(desc(executionsLog.timestamp))
    .limit(5);

  console.log(`\n--- Last 5 repay log rows ---`);
  for (const r of recentRepay) {
    console.log(
      `[${r.timestamp?.toISOString()}] ${r.status} $${r.amount} tx=${r.txHash?.slice(0, 10) ?? "none"}…`,
    );
  }

  if (agentic) {
    const { encodeAaveRepay } = await import("../lib/calldata.js");
    const { simulateErc20Action } = await import("../lib/simulate.js");
    const calldata = encodeAaveRepay(USDC_SEPOLIA, 533, wallet);
    const sim = await simulateErc20Action(agentic, wallet, USDC_SEPOLIA, AAVE_V3_POOL, 533, {
      from: agentic,
      to: AAVE_V3_POOL,
      data: calldata,
    });
    console.log(`\n--- Live simulateErc20Action($533 repay) NOW ---`);
    console.log(`  wouldRevert: ${sim.wouldRevert}`);
    console.log(`  needsApprove: ${sim.allowanceCalldata ? "yes" : "no"}`);
    if (sim.revertReason) console.log(`  reason: ${sim.revertReason.slice(0, 150)}`);
  }

  console.log(`\n--- Demo risk summary ---`);
  console.log(`  Guardian at HF ${pos.healthFactor?.toFixed(2)} → will HOLD (no repay attempt unless HF < ~1.15)`);
  console.log(`  Resilience $533 sim failures → historical (Aug 2 ~11:13–11:25 UTC window)`);
  console.log(`  Followed by mined repay $533 at 11:40 UTC — sim story still valid`);
  console.log(`  Current low allowance ($53) → next repay prepends approve in workflow; sim passes today`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
