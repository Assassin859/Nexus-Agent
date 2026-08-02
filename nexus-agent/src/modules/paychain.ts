import { generateObject } from "ai";
import { getBrainModel } from "../brain/provider.js";
import { PayChainSchema, PAYCHAIN_SYSTEM_PROMPT } from "../brain/schemas.js";
import { db } from "../db/client.js";
import { activeWorkflows, executionsLog, payees } from "../db/schema.js";
import { createWorkflow, cancelWorkflow } from "../lib/mcp-client.js";
import { encodeERC20Transfer, USDC_SEPOLIA } from "../lib/calldata.js";
import { parseCronFromMessage } from "../lib/cron.js";
import { splitTeamPayroll } from "../lib/payroll-split.js";
import { eq, and, ilike } from "drizzle-orm";
import { childLogger } from "../lib/logger.js";


export type PaychainRequest = {
  userMessage: string;
  conversationHistory?: Array<{ sender: string; text: string }>;
  walletAddress: string;
  apiKey?: string;
};

export type PaychainResponse = {
  success: boolean;
  verification_required: boolean;
  message: string;
  workflowId?: string;
  aiAnalysis?: any;
};

import { resolveKeeperHubApiKey } from "../lib/user-context.js";

export async function handle(req: PaychainRequest): Promise<PaychainResponse> {
  const walletAddress = req.walletAddress.toLowerCase();
  const { userMessage, conversationHistory = [] } = req;
  const effectiveKey = req.apiKey || (await resolveKeeperHubApiKey(walletAddress));
  const log = childLogger({ module: "paychain", wallet: walletAddress.slice(0, 8) });
  const msgLower = userMessage.toLowerCase();

  // ── Step 1: Look up registered Payees / Teams in Postgres DB ────────────────
  const savedPayees = await db.query.payees.findMany({
    where: eq(payees.userWallet, walletAddress),
  });

  // Check if user prompt matches a registered payee or team name (word boundary)
  const matchedPayee = savedPayees.find((p) => {
    const escaped = p.name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`\\b${escaped}\\b`, "i").test(userMessage);
  });

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
    const amountMatch = userMessage.match(/(\d+(?:\.\d+)?)\s*(usdc|usdt|weth|\$)/i) || userMessage.match(/\$\s*(\d+(?:\.\d+)?)/);
    const recipients = matchedPayee.recipientAddresses as Array<{ address: string; amount?: number }> | null;
    const amount = amountMatch ? parseFloat(amountMatch[1]) : recipients?.[0]?.amount;

    if (!amount) {
      return {
        success: false,
        verification_required: true,
        message: `⚠️ No payment amount specified for "${matchedPayee.name}". Please specify an amount (e.g. "pay ${matchedPayee.name} 100 USDC").`,
      };
    }

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
      }, effectiveKey);

      if (isStub) {
        return {
          success: false,
          verification_required: false,
          message: `⚠️ KeeperHub MCP is unavailable (stub mode). Workflow for vault pool '${matchedPayee.name}' was not registered.`,
        };
      }

      const [insertedVaultWf] = await db.insert(activeWorkflows).values({
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
      }).returning({ id: activeWorkflows.id });

      if (insertedVaultWf?.id) {
        await db.insert(executionsLog).values({
          userWallet: walletAddress,
          workflowId: insertedVaultWf.id,
          action: "payroll_register",
          amount,
          status: "success",
          reason: `Deposited ${amount} USDC into '${matchedPayee.name}' Shared Vault Pool (${poolAddr.slice(0, 8)}...). Schedule: ${cronSchedule}.`,
          aiAnalysis: { matchedPayee: matchedPayee.name, payoutMode: "vault_pool", memberCount: matchedPayee.memberCount, keeperhubWorkflowId: workflowId },
        });
      } else {
        console.warn(`[PAYCHAIN] Vault-pool activeWorkflows upsert returned no ID for ${matchedPayee.name} (${walletAddress.slice(0, 8)}...) — skipping executionsLog.`);
      }

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

    if (targets.length === 0) {
      return {
        success: false,
        verification_required: true,
        message: `⚠️ Payee "${matchedPayee.name}" has no registered recipient wallet addresses.`,
      };
    }

    const createdRemoteIds: string[] = [];
    const cronSchedule = parseCronFromMessage(userMessage);
    const memberItems: Array<{ targetAddr: string; memberName: string; memberAmount: number; workflowId: string }> = [];

    const splitAmounts = splitTeamPayroll(amount, targets.length);
    if (splitAmounts.length === 0 || Math.min(...splitAmounts) < 1) {
      return {
        success: false,
        verification_required: true,
        message: `⚠️ Total payroll amount $${amount} is too small to divide among ${targets.length} team members (minimum 1 USDC per member).`,
      };
    }

    for (let i = 0; i < targets.length; i++) {
      const member = targets[i];
      const targetAddr = (typeof member === "string" ? member : member.address) || walletAddress;
      const memberName = typeof member === "string" ? member : member.name;
      const memberAmount = splitAmounts[i];
      const calldata = encodeERC20Transfer(targetAddr, memberAmount);

      const { workflowId, isStub } = await createWorkflow({
        name: `payroll-${(memberName || "member").replace(/\s+/g, "-").toLowerCase()}-${Date.now()}`,
        triggerType: "cron",
        cronSchedule,
        steps: [{ type: "transaction", to: USDC_SEPOLIA, calldata, gasStrategy: "standard" }],
      }, effectiveKey);

      if (isStub) {
        // Compensating cancel pattern: roll back all previously created remote workflows
        for (const remoteId of createdRemoteIds) {
          if (!remoteId.startsWith("wf-stub-")) {
            await cancelWorkflow(remoteId, effectiveKey).catch(err => {
              log.warn({ remoteId, err }, "[PAYCHAIN] Compensating cancel failed");
            });
          }
        }
        return {
          success: false,
          verification_required: false,
          message: `⚠️ KeeperHub MCP is unavailable or returned a stub. Multi-member team payroll registration for '${matchedPayee.name}' was aborted and compensated.`,
        };
      }

      createdRemoteIds.push(workflowId);
      memberItems.push({ targetAddr, memberName: memberName || "member", memberAmount, workflowId });
    }

    // Atomic DB persistence after remote KeeperHub workflows succeed
    try {
      await db.transaction(async (tx) => {
        for (const item of memberItems) {
          const [insertedWf] = await tx.insert(activeWorkflows).values({
            userWallet: walletAddress,
            type: "payroll",
            recipientAddress: item.targetAddr,
            amount: item.memberAmount,
            cronSchedule,
            status: "active",
            keeperhubWorkflowId: item.workflowId,
          }).onConflictDoUpdate({
            target: [activeWorkflows.userWallet, activeWorkflows.recipientAddress, activeWorkflows.status],
            set: { amount: item.memberAmount, cronSchedule, keeperhubWorkflowId: item.workflowId, updatedAt: new Date() },
          }).returning({ id: activeWorkflows.id });

          if (!insertedWf?.id) throw new Error("Failed to resolve activeWorkflows.id after upsert");

          await tx.insert(executionsLog).values({
            userWallet: walletAddress,
            workflowId: insertedWf.id,
            action: "payroll_register",
            amount: item.memberAmount,
            status: "success",
            reason: `Registered ${item.memberAmount} USDC payroll workflow for ${item.memberName} (${item.targetAddr.slice(0, 8)}...).`,
            aiAnalysis: {
              matchedPayee: matchedPayee.name,
              targetMember: item.memberName,
              amount: item.memberAmount,
              totalAmount: amount,
              keeperhubWorkflowId: item.workflowId,
              workflowId: item.workflowId,
            },
          });
        }
      });
    } catch (err) {
      // Compensating cancel on DB transaction failure
      for (const remoteId of createdRemoteIds) {
        if (!remoteId.startsWith("wf-stub-")) {
          await cancelWorkflow(remoteId, effectiveKey).catch(() => {});
        }
      }
      return {
        success: false,
        verification_required: false,
        message: `⚠️ Database transaction failed. Remote payroll workflows for '${matchedPayee.name}' were compensated and rolled back.`,
      };
    }

    const isSplit = matchedPayee.type === "team" && targets.length > 1;
    const msgDetails = isSplit
      ? `Created payroll workflows for ${targets.length} members (${splitAmounts[0]} USDC each${splitAmounts[splitAmounts.length - 1] !== splitAmounts[0] ? `, last member ${splitAmounts[splitAmounts.length - 1]} USDC` : ""}; total: ${amount} USDC).`
      : `Created ${memberItems[0]?.memberAmount} USDC payroll workflow for ${matchedPayee.name}.`;

    return {
      success: true,
      verification_required: false,
      message: `👥 Resolved '${matchedPayee.name}' (${targets.length} wallet${targets.length > 1 ? "s" : ""}). ${msgDetails}`,
      workflowId: createdRemoteIds[0],
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
    const { object: plan } = await generateObject({
      model: getBrainModel(),
      schema: PayChainSchema,
      system: PAYCHAIN_SYSTEM_PROMPT,
      prompt: JSON.stringify({
        userMessage: fullTranscript,
        existingPayrollRecipients: isExplicitOverride ? [] : existingWorkflows
          .map(w => w.recipientAddress)
          .filter(Boolean),
      }),
    });
    decision = plan;
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
  }, effectiveKey);

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
    action: "payroll_register",
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
