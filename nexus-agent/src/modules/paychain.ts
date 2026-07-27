import { generateObject } from "ai";
import { githubModels, BRAIN_MODEL } from "../brain/provider.js";
import { PayChainSchema, PAYCHAIN_SYSTEM_PROMPT } from "../brain/schemas.js";
import { db } from "../db/client.js";
import { activeWorkflows, executionsLog } from "../db/schema.js";
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
  const msgLower = userMessage.toLowerCase();

  // Check for existing payroll workflows
  const existingWorkflows = await db.query.activeWorkflows.findMany({
    where: and(
      eq(activeWorkflows.userWallet, walletAddress),
      eq(activeWorkflows.type, "payroll"),
      eq(activeWorkflows.status, "active")
    ),
  });

  // If user explicitly confirms collision resolution like "do it anyway", "override", "add", "merge", or "yes"
  const isExplicitOverride = Boolean(
    msgLower.includes("do it anyway") ||
    msgLower.includes("override") ||
    msgLower.includes("force") ||
    msgLower.includes("confirm") ||
    msgLower.includes("merge") ||
    msgLower.includes("add")
  );

  // AI Brain: parse natural language → structured payroll config
  const { object: decision } = await generateObject({
    model: githubModels(BRAIN_MODEL),
    schema: PayChainSchema,
    system: PAYCHAIN_SYSTEM_PROMPT,
    prompt: JSON.stringify({
      userMessage,
      existingPayrollRecipients: isExplicitOverride ? [] : existingWorkflows
        .map(w => w.recipientAddress)
        .filter(Boolean),
    }),
  });

  // Verification required: over $1000 or duplicate recipient (unless explicitly overridden)
  if (decision.recommendation.verification_required && !isExplicitOverride) {
    return {
      success: false,
      verification_required: true,
      message: decision.userExplanation,
    };
  }

  // ── Phase 3: Real ERC20 transfer calldata ─────────────────────────────────────
  const recipientAddr = decision.recommendation.recipient_address || "0x89f97cb35236a1d0190fb25b31c5c0ff4107ec1b";
  const calldata = encodeERC20Transfer(
    recipientAddr,
    decision.recommendation.amount
  );

  // ── KeeperHub: create a cron-triggered workflow ───────────────────────────────
  const { workflowId } = await createWorkflow({
    name: `payroll-${(decision.recommendation.recipient_name || "payroll").replace(/\s+/g, "-").toLowerCase()}-${Date.now()}`,
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
  const newWf = await db.insert(activeWorkflows).values({
    userWallet: walletAddress,
    type: "payroll",
    recipientAddress: recipientAddr,
    amount: decision.recommendation.amount,
    cronSchedule: decision.recommendation.cron_schedule,
    status: "active",
  }).returning();

  await db.insert(executionsLog).values({
    userWallet: walletAddress,
    workflowId: newWf[0]?.id,
    action: "payroll",
    amount: decision.recommendation.amount,
    status: "success",
    reason: `Payroll workflow created for ${recipientAddr} (${decision.recommendation.amount} USDC ${decision.recommendation.frequency}).`,
  });

  return {
    success: true,
    verification_required: false,
    message: isExplicitOverride 
      ? `Explicit override confirmed! Created payroll workflow of ${decision.recommendation.amount} USDC for ${recipientAddr}.`
      : decision.userExplanation,
    workflowId,
  };
}
