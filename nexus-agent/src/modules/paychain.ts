import { generateObject } from "ai";
import { githubModels, BRAIN_MODEL } from "../brain/provider.js";
import { PayChainSchema, PAYCHAIN_SYSTEM_PROMPT } from "../brain/schemas.js";
import { db } from "../db/client.js";
import { activeWorkflows } from "../db/schema.js";
import { createWorkflow } from "../lib/mcp-client.js";
import { encodeERC20Transfer, USDC_SEPOLIA } from "../lib/calldata.js";
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

  // Check for existing payroll workflows (collision detection)
  const existingWorkflows = await db.query.activeWorkflows.findMany({
    where: and(
      eq(activeWorkflows.userWallet, walletAddress),
      eq(activeWorkflows.type, "payroll"),
      eq(activeWorkflows.status, "active")
    ),
  });

  // AI Brain: parse natural language → structured payroll config
  const { object: decision } = await generateObject({
    model: githubModels(BRAIN_MODEL),
    schema: PayChainSchema,
    system: PAYCHAIN_SYSTEM_PROMPT,
    prompt: JSON.stringify({
      userMessage,
      existingPayrollRecipients: existingWorkflows
        .map(w => w.recipientAddress)
        .filter(Boolean),
    }),
  });

  // Verification required: over $1000 or duplicate recipient
  if (decision.recommendation.verification_required) {
    return {
      success: false,
      verification_required: true,
      message: decision.userExplanation,
    };
  }

  // ── Phase 3: Real ERC20 transfer calldata ─────────────────────────────────────
  const calldata = encodeERC20Transfer(
    decision.recommendation.recipient_address,
    decision.recommendation.amount
  );

  // ── KeeperHub: create a cron-triggered workflow ───────────────────────────────
  const { workflowId } = await createWorkflow({
    name: `payroll-${decision.recommendation.recipient_name.replace(/\s+/g, "-").toLowerCase()}-${Date.now()}`,
    triggerType: "cron",
    cronSchedule: decision.recommendation.cron_schedule,
    steps: [{
      type: "transaction",
      to: USDC_SEPOLIA,          // Call USDC token contract
      calldata,                   // transfer(recipient, amount)
      gasStrategy: "standard",
    }],
  });

  // ── Write to DB ───────────────────────────────────────────────────────────────
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
