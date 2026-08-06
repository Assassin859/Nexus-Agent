/**
 * 10-minute live mining session — DCA, yield rotate, guardian repay proofs + production triggers.
 *
 * Usage:
 *   MINE_SESSION_MINUTES=10 pnpm --prefix nexus-agent exec tsx src/scripts/mine-session.ts
 */
import "../lib/env.js";
import {
  encodeERC20Transfer,
  encodeAaveRepay,
  encodeAaveWithdraw,
  encodeCompoundSupply,
  AAVE_V3_POOL,
  USDC_SEPOLIA,
  COMPOUND_V3_USDC,
} from "../lib/calldata.js";
import { ensureAllowance } from "../lib/allowance.js";
import {
  createWorkflow,
  executeWorkflow,
  pollExecutionUntilSettled,
  type WorkflowStep,
} from "../lib/mcp-client.js";
import { getAavePosition, getUsdcBalance } from "../lib/aave.js";
import { db } from "../db/client.js";
import { executionsLog, repaymentCycles } from "../db/schema.js";
import { BASE_SEPOLIA_CHAIN_ID, baseSepoliaTxUrl } from "../lib/tier2-proofs.js";
import { generateAuthToken } from "../middleware/auth.js";
import { and, eq, sql } from "drizzle-orm";

const agentic = (
  process.env.AGENTIC_WALLET_ADDRESS ||
  process.env.NEXT_PUBLIC_WALLET_ADDRESS ||
  "0x89f97Cb35236a1d0190FB25B31C5C0fF4107Ec1b"
).toLowerCase();

const monitoredWallet = (
  process.env.NEXT_PUBLIC_WALLET_ADDRESS || "0x89f97Cb35236a1d0190FB25B31C5C0fF4107Ec1b"
).toLowerCase();

const agentUrl = process.env.AGENT_URL || "https://nexus-agent-production-7783.up.railway.app";
const sessionMinutes = parseInt(process.env.MINE_SESSION_MINUTES || "10", 10);
const dcaAmount = parseFloat(process.env.MINE_DCA_AMOUNT || "1");
const yieldAmount = parseFloat(process.env.MINE_YIELD_AMOUNT || "1");
const repayAmount = parseFloat(process.env.MINE_REPAY_AMOUNT || "25");

const minedThisSession: string[] = [];

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function executeSteps(
  steps: WorkflowStep[],
  namePrefix: string,
): Promise<{ txHash: string; workflowId: string; executionId: string } | null> {
  const created = await createWorkflow({
    name: `${namePrefix}-${Date.now()}`,
    triggerType: "manual",
    steps,
    mevProtected: true,
  });
  if (created.isStub) {
    console.error("  create_workflow stub");
    return null;
  }
  const executed = await executeWorkflow(created.workflowId);
  if (executed.isStub) {
    console.error("  execute_workflow stub");
    return null;
  }
  const settled = await pollExecutionUntilSettled(executed.executionId, undefined, 25, 4000);
  if (!settled.txHash || settled.status !== "mined") {
    console.error(`  not mined (${settled.status})`);
    return null;
  }
  console.log(`  ✓ ${settled.txHash}`);
  console.log(`    ${baseSepoliaTxUrl(settled.txHash)}`);
  return {
    txHash: settled.txHash,
    workflowId: created.workflowId,
    executionId: executed.executionId,
  };
}

async function executeSingle(to: string, calldata: string, name: string) {
  return executeSteps([{ type: "transaction", to, calldata, gasStrategy: "standard" }], name);
}

async function logMined(
  action: "swap" | "rotate" | "repay",
  txHash: string,
  amount: number,
  reason: string,
  extra: Record<string, unknown> = {},
): Promise<void> {
  const existing = await db.query.executionsLog.findFirst({
    where: and(eq(executionsLog.userWallet, monitoredWallet), eq(executionsLog.txHash, txHash)),
  });
  if (existing) {
    console.log("  feed log: already present");
    return;
  }
  await db.insert(executionsLog).values({
    userWallet: monitoredWallet,
    action,
    amount: Math.round(amount),
    status: "success",
    reason,
    txHash,
    aiAnalysis: {
      chainId: BASE_SEPOLIA_CHAIN_ID,
      explorerUrl: baseSepoliaTxUrl(txHash),
      proofType: "mine_session",
      agenticWallet: agentic,
      ...extra,
    },
  });
  console.log("  feed log: inserted");
  minedThisSession.push(txHash);
}

async function resetRepaymentCycle(): Promise<void> {
  const cycle = await db.query.repaymentCycles.findFirst({
    where: eq(repaymentCycles.userWallet, monitoredWallet),
  });
  if (!cycle) return;
  await db
    .update(repaymentCycles)
    .set({ totalRepaidThisCycleUSD: 0 })
    .where(eq(repaymentCycles.id, cycle.id));
  console.log("  repayment cycle reset → budget available for guardian cron");
}

async function runDcaProof(): Promise<boolean> {
  console.log("\n── DCA USDC leg ──");
  const bal = await getUsdcBalance(agentic);
  if (bal < dcaAmount) {
    console.warn(`  skip: agentic USDC $${bal.toFixed(2)} < $${dcaAmount}`);
    return false;
  }
  const calldata = encodeERC20Transfer(monitoredWallet, dcaAmount);
  const result = await executeSingle(USDC_SEPOLIA, calldata, "mine-dca-usdc");
  if (!result) return false;
  await logMined("swap", result.txHash, dcaAmount, `Mine session DCA: $${dcaAmount} USDC disbursement`, {
    keeperhubWorkflowId: result.workflowId,
    executionId: result.executionId,
  });
  return true;
}

async function runYieldRotate(): Promise<boolean> {
  console.log("\n── Yield rotate (agentic Aave → wallet USDC leg via withdraw) ──");
  const position = await getAavePosition(agentic);
  console.log(`  agentic Aave supplied: $${position.usdcSuppliedUSD.toFixed(2)} HF=${position.healthFactor?.toFixed(2) ?? "n/a"}`);
  if (position.usdcSuppliedUSD < yieldAmount) {
    console.warn("  skip: insufficient agentic Aave supply");
    return false;
  }
  const withdrawCalldata = encodeAaveWithdraw(USDC_SEPOLIA, yieldAmount, agentic);
  const supplyCalldata = encodeCompoundSupply(USDC_SEPOLIA, yieldAmount);
  const allowanceCalldata = await ensureAllowance(agentic, USDC_SEPOLIA, COMPOUND_V3_USDC, yieldAmount);
  const steps: WorkflowStep[] = [
    { type: "transaction", to: AAVE_V3_POOL, calldata: withdrawCalldata, gasStrategy: "standard" },
  ];
  if (allowanceCalldata) {
    steps.push({ type: "transaction", to: USDC_SEPOLIA, calldata: allowanceCalldata, gasStrategy: "standard" });
  }
  steps.push({
    type: "transaction",
    to: COMPOUND_V3_USDC,
    calldata: supplyCalldata,
    gasStrategy: "standard",
  });
  const result = await executeSteps(steps, "mine-yield-rotate");
  if (!result) return false;
  await logMined("rotate", result.txHash, yieldAmount, `Mine session yield rotate: $${yieldAmount} Aave→Compound`, {
    keeperhubWorkflowId: result.workflowId,
    executionId: result.executionId,
  });
  return true;
}

async function runGuardianRepay(): Promise<boolean> {
  console.log("\n── Guardian repay proof ──");
  const pos = await getAavePosition(monitoredWallet);
  console.log(`  monitored HF=${pos.healthFactor?.toFixed(3)} debt=$${pos.debtUSD.toFixed(0)}`);
  if ((pos.debtUSD ?? 0) < repayAmount) {
    console.warn("  skip: debt too small");
    return false;
  }
  const bal = await getUsdcBalance(agentic);
  if (bal < repayAmount) {
    console.warn(`  skip: agentic USDC $${bal.toFixed(2)}`);
    return false;
  }
  const repayCalldata = encodeAaveRepay(USDC_SEPOLIA, repayAmount, monitoredWallet);
  const allowanceCalldata = await ensureAllowance(agentic, USDC_SEPOLIA, AAVE_V3_POOL, repayAmount);
  const steps: WorkflowStep[] = [];
  if (allowanceCalldata) {
    steps.push({ type: "transaction", to: USDC_SEPOLIA, calldata: allowanceCalldata, gasStrategy: "standard" });
  }
  steps.push({ type: "transaction", to: AAVE_V3_POOL, calldata: repayCalldata, gasStrategy: "standard" });
  const result = await executeSteps(steps, "mine-guardian-repay");
  if (!result) return false;
  const after = await getAavePosition(monitoredWallet);
  await logMined("repay", result.txHash, repayAmount, `Mine session guardian repay: $${repayAmount} USDC`, {
    keeperhubWorkflowId: result.workflowId,
    executionId: result.executionId,
    healthFactorBefore: pos.healthFactor,
    healthFactorAfter: after.healthFactor,
  });
  return true;
}

async function triggerProductionModules(): Promise<void> {
  console.log("\n── Production triggers (guardian / dca / yield) ──");
  const token = generateAuthToken(monitoredWallet);
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  for (const path of ["/api/trigger/guardian", "/api/trigger/dca", "/api/trigger/yield"]) {
    try {
      const res = await fetch(`${agentUrl}${path}`, { method: "POST", headers });
      const data = await res.json().catch(() => ({}));
      console.log(`  ${path} → ${res.status} ${JSON.stringify(data)}`);
    } catch (err) {
      console.warn(`  ${path} failed:`, err instanceof Error ? err.message : String(err));
    }
    await sleep(2000);
  }
}

async function countMinedInDb(): Promise<number> {
  const rows = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(executionsLog)
    .where(
      sql`${executionsLog.txHash} IS NOT NULL AND length(${executionsLog.txHash}) = 66 AND ${executionsLog.txHash} NOT LIKE '%11111111%'`,
    );
  return rows[0]?.c ?? 0;
}

async function main() {
  if (!process.env.KEEPERHUB_API_KEY) {
    console.error("KEEPERHUB_API_KEY required");
    process.exit(1);
  }

  const start = Date.now();
  const endAt = start + sessionMinutes * 60 * 1000;
  const beforeCount = await countMinedInDb();

  console.log("=================================================");
  console.log(`NexusAgent — ${sessionMinutes}min mining session`);
  console.log("=================================================");
  console.log(`Agentic:   ${agentic}`);
  console.log(`Monitored: ${monitoredWallet}`);
  console.log(`Agent URL: ${agentUrl}`);
  console.log(`DB mined before: ${beforeCount}\n`);

  const monPos = await getAavePosition(monitoredWallet);
  const agPos = await getAavePosition(agentic);
  console.log(`Monitored HF=${monPos.healthFactor?.toFixed(3)} debt=$${monPos.debtUSD.toFixed(0)}`);
  console.log(`Agentic   HF=${agPos.healthFactor?.toFixed(3)} supplied=$${agPos.usdcSuppliedUSD.toFixed(0)}`);

  await resetRepaymentCycle();

  let round = 0;
  while (Date.now() < endAt) {
    round++;
    const remaining = Math.ceil((endAt - Date.now()) / 60000);
    console.log(`\n════════ Round ${round} (~${remaining} min left) ════════`);

    await runDcaProof().catch((e) => console.warn("DCA error:", e.message));
    await sleep(12000);

    if (Date.now() >= endAt) break;
    await runYieldRotate().catch((e) => console.warn("Yield error:", e.message));
    await sleep(15000);

    if (Date.now() >= endAt) break;
    await runGuardianRepay().catch((e) => console.warn("Repay error:", e.message));
    await sleep(15000);

    if (Date.now() >= endAt) break;
    await triggerProductionModules();
    await sleep(20000);
  }

  const afterCount = await countMinedInDb();
  console.log("\n=================================================");
  console.log(`Session complete — ${minedThisSession.length} new tx(s) this run`);
  console.log(`DB mined: ${beforeCount} → ${afterCount}`);
  if (minedThisSession.length) {
    console.log("New hashes:");
    minedThisSession.forEach((h) => console.log(`  ${h}`));
  }
  console.log("=================================================\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
