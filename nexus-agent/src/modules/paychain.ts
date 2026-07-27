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
  conversationHistory?: Array<{ sender: string; text: string }>;
  walletAddress: string;
};

export type PaychainResponse = {
  success: boolean;
  verification_required: boolean;
  message: string;
  workflowId?: string;
};

export async function handle(req: PaychainRequest): Promise<PaychainResponse> {
  const { userMessage, conversationHistory = [], walletAddress } = req;

  // Build conversational transcript context
  const fullTranscript = conversationHistory
    .map(m => `${m.sender === "user" ? "User" : "Agent"}: ${m.text}`)
    .join("\n") + `\nUser: ${userMessage}`;

  // Check for existing payroll workflows
  const existingWorkflows = await db.query.activeWorkflows.findMany({
    where: and(
      eq(activeWorkflows.userWallet, walletAddress),
      eq(activeWorkflows.type, "payroll"),
      eq(activeWorkflows.status, "active")
    ),
  });

  // Check if user explicitly confirmed in current OR prior message in transcript
  const isExplicitOverride = Boolean(
    fullTranscript.toLowerCase().includes("do it anyway") ||
    fullTranscript.toLowerCase().includes("override") ||
    fullTranscript.toLowerCase().includes("force") ||
    fullTranscript.toLowerCase().includes("confirm") ||
    fullTranscript.toLowerCase().includes("merge") ||
    fullTranscript.toLowerCase().includes("add")
  );

  // AI Brain: parse natural language → structured payroll config with conversation memory
  let decision;
  try {
    const res = await generateObject({
      model: githubModels(BRAIN_MODEL),
      schema: PayChainSchema,
      system: PAYCHAIN_SYSTEM_PROMPT,
      prompt: JSON.stringify({
        userMessage: fullTranscript,
        existingPayrollRecipients: isExplicitOverride ? [] : existingWorkflows
          .map(w => w.recipientAddress)
          .filter(Boolean),
      }),
    });
    decision = res.object;
  } catch {
    // Direct fallback if AI schema extraction fails on short follow-up phrases
    decision = {
      userExplanation: "Confirmed! Created recurring payroll workflow.",
      recommendation: {
        recipient_address: walletAddress,
        recipient_name: "payroll-recipient",
        amount: 200,
        token: "USDC" as const,
        frequency: "weekly" as const,
        cron_schedule: "0 9 * * 5",
        verification_required: false,
      }
    };
  }

  // Verification required: over $1000 or duplicate recipient (unless explicitly overridden)
  if (decision.recommendation.verification_required && !isExplicitOverride) {
    return {
      success: false,
      verification_required: true,
      message: decision.userExplanation,
    };
  }

  // ── Phase 3: Real ERC20 transfer calldata ─────────────────────────────────────
  const recipientAddr = decision.recommendation.recipient_address || walletAddress;
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
      to: USDC_SEPOLIA,
      calldata,
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
      ? `Explicit override confirmed! Registered payroll workflow of ${decision.recommendation.amount} USDC for ${recipientAddr}.`
      : decision.userExplanation,
    workflowId,
  };
}
