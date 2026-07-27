import { generateObject } from "ai";
import { githubModels, BRAIN_MODEL } from "../brain/provider.js";
import { GuardianDecisionSchema, GUARDIAN_SYSTEM_PROMPT } from "../brain/schemas.js";
import { db } from "../db/client.js";
import { repaymentCycles, executionsLog } from "../db/schema.js";
import { simulate } from "../lib/simulate.js";
import { createWorkflow, executeWorkflow } from "../lib/mcp-client.js";
import { eq, and } from "drizzle-orm";

const AAVE_V3_POOL_SEPOLIA = "0x6Ae43d3271ff68408378a467C62b15264c8d77e4";

export async function run(userWallet: string): Promise<void> {
  console.log(`[GUARDIAN] Running evaluation for wallet: ${userWallet}`);

  const healthFactor = 1.12; // Stub HF (Critical) for demo evaluation
  const walletBalance = 500; // Stub available USDC balance

  const cycle = await db.query.repaymentCycles.findFirst({
    where: eq(repaymentCycles.userWallet, userWallet),
  });

  const pendingTx = await db.query.executionsLog.findFirst({
    where: and(
      eq(executionsLog.userWallet, userWallet),
      eq(executionsLog.status, "pending")
    ),
  });

  const cycleRemaining = (cycle?.cycleLimitUSD ?? 1000) - (cycle?.totalRepaidThisCycleUSD ?? 0);

  const { object: decision } = await generateObject({
    model: githubModels(BRAIN_MODEL),
    schema: GuardianDecisionSchema,
    system: GUARDIAN_SYSTEM_PROMPT,
    prompt: JSON.stringify({
      healthFactor,
      walletBalance,
      cycleRemainingBudget: cycleRemaining,
      executionHistory: pendingTx ? ["pending_transaction_exists"] : [],
      priceTrend: "stable",
    }),
  });

  console.log(`[GUARDIAN] Brain decision: ${decision.recommendation.action} — ${decision.userExplanation}`);

  if (decision.recommendation.action === "hold" || decision.recommendation.action === "block_transaction") {
    await db.insert(executionsLog).values({
      userWallet,
      action: decision.recommendation.action,
      amount: 0,
      status: "success",
      reason: decision.userExplanation,
    });
    return;
  }

  const calldata = "0x"; // Stub calldata for pool repay

  const sim = await simulate(
    { from: process.env.AGENTIC_WALLET_ADDRESS || "0x0000000000000000000000000000000000000000", to: AAVE_V3_POOL_SEPOLIA, data: calldata },
    userWallet
  );
  if (sim.wouldRevert) return;

  const { workflowId } = await createWorkflow({
    name: `guardian-${userWallet.slice(0, 8)}-${Date.now()}`,
    triggerType: "manual",
    steps: [{ type: "transaction", to: AAVE_V3_POOL_SEPOLIA, calldata, gasStrategy: "standard" }],
  });
  const { executionId } = await executeWorkflow(workflowId);

  await db.insert(executionsLog).values({
    userWallet,
    action: decision.recommendation.action,
    amount: decision.recommendation.amount,
    status: "success",
    reason: decision.userExplanation,
  });

  console.log(`[GUARDIAN] Executed. KeeperHub executionId: ${executionId}`);
}
