import { generateObject } from "ai";
import { githubModels, BRAIN_MODEL } from "../brain/provider.js";
import { PayChainSchema, PAYCHAIN_SYSTEM_PROMPT } from "../brain/schemas.js";
import { db } from "../db/client.js";
import { activeWorkflows, executionsLog, payees } from "../db/schema.js";
import { createWorkflow } from "../lib/mcp-client.js";
import { encodeERC20Transfer, USDC_SEPOLIA } from "../lib/calldata.js";
import { eq, and, ilike } from "drizzle-orm";

// ── Cron Parser: derive schedule from natural language message ───────────────
function parseCronFromMessage(msg: string): string {
  const m = msg.toLowerCase();
  // Specific day of week
  if (/\bevery\s+sunday\b|\bsundays\b/.test(m))    return "0 9 * * 0";
  if (/\bevery\s+monday\b|\bmondays\b/.test(m))    return "0 9 * * 1";
  if (/\bevery\s+tuesday\b|\btuesdays\b/.test(m))  return "0 9 * * 2";
  if (/\bevery\s+wednesday\b|\bwednesdays\b/.test(m)) return "0 9 * * 3";
  if (/\bevery\s+thursday\b|\bthursdays\b/.test(m)) return "0 9 * * 4";
  if (/\bevery\s+friday\b|\bfridays\b/.test(m))    return "0 9 * * 5";
  if (/\bevery\s+saturday\b|\bsaturdays\b/.test(m)) return "0 9 * * 6";
  // Frequency keywords
  if (/\bbiweekly\b|\bbi-weekly\b|\btwice.{0,10}month\b/.test(m)) return "0 9 1,15 * *";
  if (/\bmonthly\b|\bevery\s+month\b|\bonce.{0,10}month\b/.test(m)) return "0 9 1 * *";
  if (/\bdaily\b|\bevery\s+day\b/.test(m))          return "0 9 * * *";
  // Default: weekly Monday 9am
  return "0 9 * * 1";
}


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

  // If user mentioned a named entity without a 0x address and no matching payee was found
  const has0xAddress = /0x[a-fA-F0-9]{40}/.test(userMessage);
  const mentionsNamedTeam = /\b(team|salary|payee|dev|marketing|design)\b/i.test(userMessage);

  const isOverrideCmd = msgLower.includes("override") || msgLower.includes("do it anyway") || msgLower.includes("confirm");

  if (!matchedPayee && !has0xAddress && mentionsNamedTeam && savedPayees.length > 0 && !isOverrideCmd) {
    const payeeNames = savedPayees.map(p => `**${p.name}**`).join(", ");
    return {
      success: false,
      verification_required: true,
      message: `⚠️ Could not find a registered payee matching your request in your Payees directory.\n\nYour registered payees are: ${payeeNames}.\n\nPlease specify a valid 0x wallet address, or select from your saved payees.`,
    };
  }

  if (matchedPayee) {
    // Extract numeric amount from prompt (e.g. "pay dev team 20 usdc" -> 20)
    const amountMatch = userMessage.match(/(\d+)\s*(usdc|usdt|weth|\$)/i) || userMessage.match(/\$\s*(\d+)/);
    const amount = amountMatch ? parseInt(amountMatch[1], 10) : (matchedPayee.recipientAddresses[0]?.amount || 20);

    // Case A: Team in Shared Vault Pool Mode
    if (matchedPayee.type === "team" && matchedPayee.payoutMode === "vault_pool") {
      const poolAddr = matchedPayee.vaultPoolAddress || walletAddress;
      const cronSchedule = parseCronFromMessage(userMessage);
      const calldata = encodeERC20Transfer(poolAddr, amount);

      const { workflowId, isStub } = await createWorkflow({
        name: `payroll-vault-${matchedPayee.name.replace(/\s+/g, "-")}-${Date.now()}`,
        triggerType: "cron",
        cronSchedule,
        steps: [{ type: "transaction", to: USDC_SEPOLIA, calldata, gasStrategy: "standard" }],
      });

      if (isStub) {
        return {
          success: false,
          verification_required: false,
          message: `⚠️ KeeperHub MCP is unavailable (stub mode). Workflow for vault pool '${matchedPayee.name}' was not registered.`,
        };
      }

      await db.insert(activeWorkflows).values({
        userWallet: walletAddress,
        type: "payroll",
        recipientAddress: poolAddr,
        amount,
        cronSchedule,
        status: "active",
        keeperhubWorkflowId: workflowId,
      }).onConflictDoUpdate({
        target: [activeWorkflows.userWallet, activeWorkflows.recipientAddress, activeWorkflows.status],
        set: { amount, cronSchedule, keeperhubWorkflowId: workflowId, updatedAt: new Date() },
      });

      await db.insert(executionsLog).values({
        userWallet: walletAddress,
        action: "payroll",
        amount,
        status: "success",
        reason: `Deposited ${amount} USDC into '${matchedPayee.name}' Shared Vault Pool (${poolAddr.slice(0, 8)}...). Schedule: ${cronSchedule}.`,
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
    const cronSchedule = parseCronFromMessage(userMessage);

    for (const member of targets) {
      const targetAddr = (typeof member === "string" ? member : member.address) || walletAddress;
      const memberName = typeof member === "string" ? member : member.name;
      const calldata = encodeERC20Transfer(targetAddr, amount);

      const { workflowId, isStub } = await createWorkflow({
        name: `payroll-${(memberName || "member").replace(/\s+/g, "-").toLowerCase()}-${Date.now()}`,
        triggerType: "cron",
        cronSchedule,
        steps: [{ type: "transaction", to: USDC_SEPOLIA, calldata, gasStrategy: "standard" }],
      });

      if (isStub) {
        return {
          success: false,
          verification_required: false,
          message: `⚠️ KeeperHub MCP is unavailable (stub mode). Workflow for member '${memberName}' was not registered.`,
        };
      }

      await db.insert(activeWorkflows).values({
        userWallet: walletAddress,
        type: "payroll",
        recipientAddress: targetAddr,
        amount,
        cronSchedule,
        status: "active",
        keeperhubWorkflowId: workflowId,
      }).onConflictDoUpdate({
        target: [activeWorkflows.userWallet, activeWorkflows.recipientAddress, activeWorkflows.status],
        set: { amount, cronSchedule, keeperhubWorkflowId: workflowId, updatedAt: new Date() },
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
    return {
      success: false,
      verification_required: true,
      message: "I couldn't parse that payroll request. Please specify recipient (name or 0x address), amount, and schedule.",
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

  const { workflowId, isStub } = await createWorkflow({
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

  if (isStub) {
    return {
      success: false,
      verification_required: false,
      message: `⚠️ KeeperHub MCP is unavailable (stub mode). Payroll workflow was not registered on-chain.`,
    };
  }

  // ── Auto-register Payee in DB if not already present ───────────────────────
  const recipientName = decision.recommendation.recipient_name || "Payee";
  const existingPayee = await db.query.payees.findFirst({
    where: and(
      eq(payees.userWallet, walletAddress.toLowerCase()),
      ilike(payees.name, recipientName)
    ),
  });

  if (!existingPayee) {
    const isTeam = /\b(team|squad|group|dept|devs|dev)\b/i.test(recipientName);
    await db.insert(payees).values({
      userWallet: walletAddress.toLowerCase(),
      name: recipientName,
      type: isTeam ? "team" : "single",
      payoutMode: isTeam ? "vault_pool" : "direct",
      vaultPoolAddress: recipientAddr,
      recipientAddresses: [{ name: recipientName, address: recipientAddr }],
      memberCount: 1,
    });
  }

  const newWf = await db.insert(activeWorkflows).values({
    userWallet: walletAddress,
    type: "payroll",
    recipientAddress: recipientAddr,
    amount: decision.recommendation.amount,
    cronSchedule: decision.recommendation.cron_schedule,
    status: "active",
    keeperhubWorkflowId: workflowId,
  }).onConflictDoUpdate({
    target: [activeWorkflows.userWallet, activeWorkflows.recipientAddress, activeWorkflows.status],
    set: { amount: decision.recommendation.amount, cronSchedule: decision.recommendation.cron_schedule, keeperhubWorkflowId: workflowId, updatedAt: new Date() },
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
