import { generateObject } from "ai";
import { githubModels, BRAIN_MODEL } from "../brain/provider.js";
import { YieldRotatorSchema, YIELD_ROTATOR_SYSTEM_PROMPT } from "../brain/schemas.js";
import { db } from "../db/client.js";
import { executionsLog } from "../db/schema.js";
import { simulate } from "../lib/simulate.js";
import { createWorkflow, executeWorkflow } from "../lib/mcp-client.js";

export async function run(userWallet: string): Promise<void> {
  console.log(`[YIELD] Evaluating yield opportunities for ${userWallet}`);

  const rates = {
    current: { protocol: "Aave V3", apy: 4.2, poolAddress: "0x6Ae43d3271ff68408378a467C62b15264c8d77e4" },
    highest: { protocol: "Morpho Blue", apy: 5.8, poolAddress: "0xMorphoBluePoolAddressStub" },
  };

  const { object: decision } = await generateObject({
    model: githubModels(BRAIN_MODEL),
    schema: YieldRotatorSchema,
    system: YIELD_ROTATOR_SYSTEM_PROMPT,
    prompt: JSON.stringify({
      currentProtocol: rates.current.protocol,
      currentAPY: rates.current.apy,
      targetProtocol: rates.highest.protocol,
      targetAPY: rates.highest.apy,
      estimatedGasUSD: 8,
      userBalance: 5000,
    }),
  });

  if (!decision.recommendation.should_rotate) {
    console.log(`[YIELD] Rotation skipped: ${decision.userExplanation}`);
    return;
  }

  const steps = [
    { type: "transaction" as const, to: rates.current.poolAddress, calldata: "0x", gasStrategy: "standard" as const },
    { type: "transaction" as const, to: "0xUniswapRouter", calldata: "0x", gasStrategy: "standard" as const },
    { type: "transaction" as const, to: rates.highest.poolAddress, calldata: "0x", gasStrategy: "standard" as const },
  ];

  const sim = await simulate({ from: process.env.AGENTIC_WALLET_ADDRESS || "0x0000000000000000000000000000000000000000", to: steps[0].to, data: steps[0].calldata }, userWallet);
  if (sim.wouldRevert) return;

  const { workflowId } = await createWorkflow({ name: `yield-${Date.now()}`, triggerType: "manual", steps });
  const { executionId } = await executeWorkflow(workflowId);

  await db.insert(executionsLog).values({
    userWallet,
    action: "rotate",
    amount: decision.recommendation.amount,
    status: "success",
    reason: `Rotated ${decision.recommendation.from_protocol} -> ${decision.recommendation.to_protocol}`,
  });

  console.log(`[YIELD] Rotated. executionId: ${executionId}`);
}
