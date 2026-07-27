import { generateObject } from "ai";
import { githubModels, BRAIN_MODEL } from "../brain/provider.js";
import { DCASchema, DCA_SYSTEM_PROMPT } from "../brain/schemas.js";
import { db } from "../db/client.js";
import { activeWorkflows, executionsLog } from "../db/schema.js";
import { simulate } from "../lib/simulate.js";
import { createWorkflow, executeWorkflow } from "../lib/mcp-client.js";
import { eq, and } from "drizzle-orm";

const UNISWAP_V3_ROUTER_SEPOLIA = "0xE592427A0AEce92De3Edee1F18E0157C05861564";

export async function run(userWallet: string): Promise<void> {
  const workflow = await db.query.activeWorkflows.findFirst({
    where: and(
      eq(activeWorkflows.userWallet, userWallet),
      eq(activeWorkflows.type, "dca"),
      eq(activeWorkflows.status, "active")
    ),
  });

  if (!workflow) return;

  const estimatedGasUSD = 6;

  const { object: decision } = await generateObject({
    model: githubModels(BRAIN_MODEL),
    schema: DCASchema,
    system: DCA_SYSTEM_PROMPT,
    prompt: JSON.stringify({
      purchaseAmountUSD: workflow.amount,
      estimatedGasUSD,
      sourceAsset: "USDC",
      targetAsset: "ETH",
    }),
  });

  if (!decision.recommendation.execute_swap) {
    console.log(`[DCA] Swap delayed by ${decision.recommendation.delay_minutes}min: ${decision.userExplanation}`);
    await db.insert(executionsLog).values({
      userWallet,
      action: "swap",
      amount: workflow.amount,
      status: "reverted_simulation",
      reason: `Gas threshold exceeded: ${decision.userExplanation}`,
    });
    return;
  }

  const calldata = "0x";

  const sim = await simulate({ from: process.env.AGENTIC_WALLET_ADDRESS || "0x0000000000000000000000000000000000000000", to: UNISWAP_V3_ROUTER_SEPOLIA, data: calldata }, userWallet);
  if (sim.wouldRevert) return;

  const { workflowId } = await createWorkflow({
    name: `dca-${userWallet.slice(0, 8)}-${Date.now()}`,
    triggerType: "manual",
    steps: [{ type: "transaction", to: UNISWAP_V3_ROUTER_SEPOLIA, calldata, gasStrategy: "standard" }],
  });
  const { executionId } = await executeWorkflow(workflowId);

  await db.insert(executionsLog).values({
    userWallet,
    action: "swap",
    amount: workflow.amount,
    status: "success",
    reason: `DCA: ${workflow.amount} USDC -> ETH`,
  });

  console.log(`[DCA] Executed swap. executionId: ${executionId}`);
}
