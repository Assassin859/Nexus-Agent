import { generateObject } from "ai";
import { githubModels, BRAIN_MODEL } from "../brain/provider.js";
import { PayChainSchema, PAYCHAIN_SYSTEM_PROMPT } from "../brain/schemas.js";
import { db } from "../db/client.js";
import { activeWorkflows } from "../db/schema.js";
import { createWorkflow } from "../lib/mcp-client.js";
import { eq, and } from "drizzle-orm";

export type PaychainRequest = {
  userMessage: string;
  walletAddress: string;
};

export type PaychainResponse = {
  success: boolean;
  verification_required: boolean;
  message: string;
  workflowId?: string;
};

export async function handle(req: PaychainRequest): Promise<PaychainResponse> {
  const { userMessage, walletAddress } = req;

  const existingWorkflows = await db.query.activeWorkflows.findMany({
    where: and(
      eq(activeWorkflows.userWallet, walletAddress),
      eq(activeWorkflows.type, "payroll"),
      eq(activeWorkflows.status, "active")
    ),
  });

  const { object: decision } = await generateObject({
    model: githubModels(BRAIN_MODEL),
    schema: PayChainSchema,
    system: PAYCHAIN_SYSTEM_PROMPT,
    prompt: JSON.stringify({
      userMessage,
      existingPayrollRecipients: existingWorkflows.map(w => w.recipientAddress).filter(Boolean),
    }),
  });

  if (decision.recommendation.verification_required) {
    return {
      success: false,
      verification_required: true,
      message: decision.userExplanation,
    };
  }

  const { workflowId } = await createWorkflow({
    name: `payroll-${decision.recommendation.recipient_name}-${Date.now()}`,
    triggerType: "cron",
    cronSchedule: decision.recommendation.cron_schedule,
    steps: [{
      type: "transaction",
      to: decision.recommendation.recipient_address,
      calldata: "0x",
      gasStrategy: "standard",
    }],
  });

  await db.insert(activeWorkflows).values({
    userWallet: walletAddress,
    type: "payroll",
    recipientAddress: decision.recommendation.recipient_address,
    amount: decision.recommendation.amount,
    cronSchedule: decision.recommendation.cron_schedule,
    status: "active",
  });

  return {
    success: true,
    verification_required: false,
    message: decision.userExplanation,
    workflowId,
  };
}
