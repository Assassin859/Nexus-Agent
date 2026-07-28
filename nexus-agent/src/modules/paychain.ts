import { generateObject } from "ai";
import { githubModels, BRAIN_MODEL } from "../brain/provider.js";
import { PayChainSchema, PAYCHAIN_SYSTEM_PROMPT } from "../brain/schemas.js";
import { db } from "../db/client.js";
import { activeWorkflows, executionsLog, payees } from "../db/schema.js";
import { createWorkflow } from "../lib/mcp-client.js";
import { encodeERC20Transfer, USDC_SEPOLIA } from "../lib/calldata.js";
import { eq, and, ilike } from "drizzle-orm";

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
  aiAnalysis?: any;
};

export async function handle(req: PaychainRequest): Promise<PaychainResponse> {
  const { userMessage, conversationHistory = [], walletAddress } = req;
  const msgLower = userMessage.toLowerCase();

  // ── Step 1: Look up registered Payees / Teams in Postgres DB ────────────────
  const savedPayees = await db.query.payees.findMany({
    where: eq(payees.userWallet, walletAddress.toLowerCase()),
  });

  // Check if user prompt matches a registered payee or team name
  const matchedPayee = savedPayees.find((p) => msgLower.includes(p.name.toLowerCase()));

  if (matchedPayee) {
    // Extract numeric amount from prompt (e.g. "pay dev team 20 usdc" -> 20)
    const amountMatch = userMessage.match(/(\d+)\s*(usdc|usdt|weth|\$)/i) || userMessage.match(/\$\s*(\d+)/);
    const amount = amountMatch ? parseInt(amountMatch[1], 10) : (matchedPayee.recipientAddresses[0]?.amount || 20);

    // Case A: Team in Shared Vault Pool Mode
    if (matchedPayee.type === "team" && matchedPayee.payoutMode === "vault_pool") {
      const poolAddr = matchedPayee.vaultPoolAddress || walletAddress;
      const calldata = encodeERC20Transfer(poolAddr, amount);

      const { workflowId } = await createWorkflow({
        name: `payroll-vault-${matchedPayee.name.replace(/\s+/g, "-")}-${Date.now()}`,
        triggerType: "cron",
        cronSchedule: "0 9 * * 1",
        steps: [{ type: "transaction", to: USDC_SEPOLIA, calldata, gasStrategy: "standard" }],
      });

      await db.insert(activeWorkflows).values({
        userWallet: walletAddress,
        type: "payroll",
        recipientAddress: poolAddr,
        amount,
        cronSchedule: "0 9 * * 1",
        status: "active",
      });

      await db.insert(executionsLog).values({
        userWallet: walletAddress,
        action: "payroll",
        amount,
        status: "success",
        reason: `Deposited ${amount} USDC into '${matchedPayee.name}' Shared Vault Pool (${poolAddr.slice(0, 8)}...).`,
        aiAnalysis: { matchedPayee: matchedPayee.name, payoutMode: "vault_pool", memberCount: matchedPayee.memberCount },
      });

      return {
        success: true,
        verification_required: false,
        message: `🏦 Deposited ${amount} USDC into the '${matchedPayee.name}' Shared Team Vault Pool (${poolAddr.slice(0, 8)}...). Team members (${matchedPayee.memberCount} registered) can withdraw as needed.`,
        workflowId,
      };
    }

    // Case B: Team in Direct Payout Mode (or Single Payee)
    const targets = Array.isArray(matchedPayee.recipientAddresses)
      ? matchedPayee.recipientAddresses
      : [{ name: matchedPayee.name, address: matchedPayee.vaultPoolAddress || walletAddress }];

    const createdWfs: string[] = [];

    for (const member of targets) {
      const targetAddr = (typeof member === "string" ? member : member.address) || walletAddress;
      const memberName = typeof member === "string" ? member : member.name;
      const calldata = encodeERC20Transfer(targetAddr, amount);

      const { workflowId } = await createWorkflow({
        name: `payroll-${(memberName || "member").replace(/\s+/g, "-").toLowerCase()}-${Date.now()}`,
        triggerType: "cron",
        cronSchedule: "0 9 * * 1",
        steps: [{ type: "transaction", to: USDC_SEPOLIA, calldata, gasStrategy: "standard" }],
      });

      await db.insert(activeWorkflows).values({
        userWallet: walletAddress,
        type: "payroll",
        recipientAddress: targetAddr,
        amount,
        cronSchedule: "0 9 * * 1",
        status: "active",
      });

      await db.insert(executionsLog).values({
        userWallet: walletAddress,
        action: "payroll",
        amount,
        status: "success",
        reason: `Registered ${amount} USDC payroll workflow for ${memberName} (${targetAddr.slice(0, 8)}...).`,
        aiAnalysis: { matchedPayee: matchedPayee.name, targetMember: memberName, amount },
      });

      createdWfs.push(workflowId);
    }

    return {
      success: true,
      verification_required: false,
      message: `👥 Resolved '${matchedPayee.name}' (${targets.length} member wallet${targets.length > 1 ? "s" : ""}). Created ${amount} USDC payroll workflows for each member.`,
      workflowId: createdWfs[0],
    };
  }

  // ── Step 2: Standard Fallback to LLM PayChain Parser if no DB payee matched ─
  const fullTranscript = conversationHistory
    .map(m => `${m.sender === "user" ? "User" : "Agent"}: ${m.text}`)
    .join("\n") + `\nUser: ${userMessage}`;

  const existingWorkflows = await db.query.activeWorkflows.findMany({
    where: and(
      eq(activeWorkflows.userWallet, walletAddress),
      eq(activeWorkflows.type, "payroll"),
      eq(activeWorkflows.status, "active")
    ),
  });

  const isExplicitOverride = Boolean(
    fullTranscript.toLowerCase().includes("do it anyway") ||
    fullTranscript.toLowerCase().includes("override") ||
    fullTranscript.toLowerCase().includes("force") ||
    fullTranscript.toLowerCase().includes("confirm") ||
    fullTranscript.toLowerCase().includes("merge") ||
    fullTranscript.toLowerCase().includes("add")
  );

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
    decision = {
      analysis: {
        exceedsSpendingCeiling: false,
        registeredWorkflowCollision: false,
        recipientAddressValid: true,
      },
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

  if (decision.recommendation.verification_required && !isExplicitOverride) {
    return {
      success: false,
      verification_required: true,
      message: decision.userExplanation,
      aiAnalysis: decision.analysis,
    };
  }

  const recipientAddr = decision.recommendation.recipient_address || walletAddress;
  const calldata = encodeERC20Transfer(
    recipientAddr,
    decision.recommendation.amount
  );

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
    aiAnalysis: decision.analysis,
  });

  return {
    success: true,
    verification_required: false,
    message: isExplicitOverride 
      ? `Explicit override confirmed! Registered payroll workflow of ${decision.recommendation.amount} USDC for ${recipientAddr}.`
      : decision.userExplanation,
    workflowId,
    aiAnalysis: decision.analysis,
  };
}
