import { tool } from "ai";
import { z } from "zod";
import { db } from "../db/client.js";
import { activeWorkflows, executionsLog, payees } from "../db/schema.js";
import { handle as handlePaychain } from "../modules/paychain.js";
import { getAavePosition } from "../lib/aave.js";
import { cancelWorkflow } from "../lib/mcp-client.js";
import { run as runGuardian } from "../modules/guardian.js";
import { run as runYieldRotator } from "../modules/yield-rotator.js";
import { run as runDCA } from "../modules/dca.js";
import { eq, desc, and, ilike } from "drizzle-orm";

/**
 * Creates the set of native AI SDK tools for the LLM agent.
 * The model (GPT-4o / Claude) autonomously decides which tool to call based on conversation context.
 */
export function createAgentTools(
  walletAddress: string,
  conversationHistory: any[] = [],
  apiKey?: string
) {
  const wallet = walletAddress.toLowerCase();

  return {
    // ── Tool 1: Schedule Payroll ──────────────────────────────────────────────
    schedulePayroll: tool({
      description: "Schedule a recurring payroll or payout to a recipient address, payee name, or team (e.g., 'pay alice 50 USDC every friday', 'pay 0x123... 20 weekly')",
      parameters: z.object({
        recipient: z.string().describe("Recipient 0x address, payee name, or team name"),
        amount: z.number().describe("Amount in USDC"),
        schedule: z.string().describe("Natural language schedule, e.g., 'every Friday at 9am', 'weekly', 'monthly'"),
        isExplicitOverride: z.boolean().default(false).describe("Set to true if user is confirming or overriding a duplicate warning (e.g. 'do it anyway', 'confirm')"),
      }),
      execute: async ({ recipient, amount, schedule, isExplicitOverride }) => {
        const isOverride = isExplicitOverride || /confirm|override|do it anyway|force/i.test(schedule + recipient);
        const promptText = isOverride
          ? `OVERRIDE_CONFIRMED: pay ${recipient} ${amount} USDC ${schedule}`
          : `pay ${recipient} ${amount} USDC ${schedule}`;

        const res = await handlePaychain({
          userMessage: promptText,
          conversationHistory,
          walletAddress: wallet,
          apiKey,
        });

        return {
          success: res.success,
          message: res.message,
          verificationRequired: res.verification_required,
          workflowId: res.workflowId,
        };
      },
    }),

    // ── Tool 2: Cancel Payrolls / Workflows ───────────────────────────────────
    cancelPayrolls: tool({
      description: "Cancel, stop, or pause active payroll workflows or all workflows for this wallet (e.g., 'stop all payrolls', 'cancle all', 'pause my payments')",
      parameters: z.object({
        target: z.string().default("all").describe("Target to cancel: 'all' or specific recipient name/address"),
      }),
      execute: async ({ target }) => {
        const trimmedTarget = (target || "all").trim();

        // ── Step 1: Resolve target to a set of recipient addresses ──────────
        let recipientAddressSet: Set<string> | null = null; // null = "all"

        if (trimmedTarget !== "all" && trimmedTarget !== "") {
          const isAddress = /^0x[a-fA-F0-9]{40}$/.test(trimmedTarget);
          if (isAddress) {
            // Direct address filter
            recipientAddressSet = new Set([trimmedTarget.toLowerCase()]);
          } else {
            // Name lookup — exact case-insensitive match against payees table
            const matchedPayees = await db.query.payees.findMany({
              where: and(
                eq(payees.userWallet, wallet),
                ilike(payees.name, trimmedTarget)
              ),
            });

            // Collect all recipient addresses from the matched payees' JSONB field
            const resolvedAddresses = matchedPayees.flatMap((p) =>
              (p.recipientAddresses as Array<{ name: string; address: string }>)
                .map((m) => m.address?.toLowerCase())
                .filter(Boolean) as string[]
            );

            if (resolvedAddresses.length === 0) {
              return {
                cancelledCount: 0,
                message: `No payee found matching "${trimmedTarget}". Use 'all' to cancel all payrolls, or provide a 0x address.`,
              };
            }

            recipientAddressSet = new Set(resolvedAddresses);
          }
        }

        // ── Step 2: Find active payroll workflows matching the target ────────
        const activeList = await db.query.activeWorkflows.findMany({
          where: and(
            eq(activeWorkflows.userWallet, wallet),
            eq(activeWorkflows.type, "payroll"),
            eq(activeWorkflows.status, "active")
          ),
        });

        const toCancel = recipientAddressSet === null
          ? activeList
          : activeList.filter(
              (wf) => wf.recipientAddress && recipientAddressSet!.has(wf.recipientAddress.toLowerCase())
            );

        if (toCancel.length === 0) {
          return {
            cancelledCount: 0,
            message: "No active payroll workflows were found matching that target.",
          };
        }

        // ── Step 3: Cancel each workflow locally + remote MCP sync ───────────
        let remoteOk = 0;
        let skipped = 0;

        for (const wf of toCancel) {
          // Remote MCP cancel (only if a real keeperhub workflow ID exists)
          if (wf.keeperhubWorkflowId) {
            const result = await cancelWorkflow(wf.keeperhubWorkflowId, apiKey);
            if (result.ok && !result.isStub) remoteOk++;
          } else {
            // Legacy row or stub — no remote ID to cancel
            skipped++;
          }

          // Local status update — always proceeds regardless of remote result
          await db.update(activeWorkflows)
            .set({ status: `cancelled_${wf.id.slice(0, 8)}` })
            .where(eq(activeWorkflows.id, wf.id));
        }

        // ── Step 4: Audit log ────────────────────────────────────────────────
        await db.insert(executionsLog).values({
          userWallet: wallet,
          action: "payroll",
          amount: 0,
          status: "success",
          reason: `Cancelled ${toCancel.length} active payroll workflow(s). Target: ${trimmedTarget}`,
        });

        const summary = `Cancelled ${toCancel.length} workflows locally (${remoteOk} synced with KeeperHub, ${skipped} legacy/stub rows skipped — no remote ID)`;
        return {
          cancelledCount: toCancel.length,
          message: `🛑 ${summary}. No further scheduled payouts will execute.`,
        };
      },
    }),

    // ── Tool 3: List Active Workflows ─────────────────────────────────────────
    listWorkflows: tool({
      description: "List all active workflows, recurring payrolls, DCA schedules, or triggers registered for this wallet (e.g., 'what are my workflows', 'my workflow', 'show active payments')",
      parameters: z.object({}),
      execute: async () => {
        const activeWfs = await db.query.activeWorkflows.findMany({
          where: eq(activeWorkflows.userWallet, wallet),
        });

        return {
          count: activeWfs.length,
          workflows: activeWfs.map(w => ({
            id: w.id,
            type: w.type,
            recipient: w.recipientAddress,
            amount: w.amount,
            schedule: w.cronSchedule,
            status: w.status,
          })),
        };
      },
    }),

    // ── Tool 4: List Payees Directory ─────────────────────────────────────────
    listPayees: tool({
      description: "List all registered payees, team members, single recipients, or vault pools saved in the payees directory (e.g., 'show payees', 'who can I pay', 'team members')",
      parameters: z.object({}),
      execute: async () => {
        const list = await db.query.payees.findMany({
          where: eq(payees.userWallet, wallet),
          orderBy: [desc(payees.createdAt)],
        });

        return {
          count: list.length,
          payees: list.map(p => ({
            name: p.name,
            type: p.type,
            payoutMode: p.payoutMode,
            vaultPoolAddress: p.vaultPoolAddress,
            memberCount: p.memberCount,
          })),
        };
      },
    }),

    // ── Tool 5: Query Portfolio (Aave) ────────────────────────────────────────
    queryPortfolio: tool({
      description: "Query current Aave loan position, health factor, collateral USD, and debt USD (e.g., 'what is my health factor', 'check loan', 'am I safe')",
      parameters: z.object({}),
      execute: async () => {
        const pos = await getAavePosition(wallet);

        if (pos.isError) {
          return {
            healthFactor: null,
            collateralUSD: 0,
            debtUSD: 0,
            isSafe: false,
            status: "Degraded / RPC Error",
            errorReason: pos.errorReason,
          };
        }

        if (pos.healthFactor === null) {
          return {
            healthFactor: null,
            collateralUSD: pos.collateralUSD,
            debtUSD: pos.debtUSD,
            isSafe: true,
            status: "No Active Loan",
          };
        }

        return {
          healthFactor: pos.healthFactor,
          collateralUSD: pos.collateralUSD,
          debtUSD: pos.debtUSD,
          isSafe: pos.healthFactor >= 1.2,
          status: pos.healthFactor >= 1.5 ? "Safe Zone" : pos.healthFactor >= 1.15 ? "Warning Zone" : "Liquidation Risk",
        };
      },
    }),

    // ── Tool 6: Trigger Automated DeFi Strategies ─────────────────────────────
    triggerStrategy: tool({
      description: "Trigger an automated strategy immediately: 'dca' (swap ETH/USDC), 'guardian' (repayment check), or 'yield' (yield rotator optimization)",
      parameters: z.object({
        strategy: z.enum(["dca", "guardian", "yield"]).describe("Strategy to execute"),
      }),
      execute: async ({ strategy }) => {
        if (strategy === "dca") {
          await runDCA(wallet, { apiKey });
          return { message: "🤖 DCA Swap strategy triggered successfully! Uniswap V3 calldata generated." };
        } else if (strategy === "guardian") {
          await runGuardian(wallet, { apiKey });
          return { message: "🛡️ Guardian position check triggered! Health factor & repayment limits evaluated." };
        } else {
          await runYieldRotator(wallet, { apiKey });
          return { message: "🤖 Yield Rotator strategy triggered! Evaluated APY delta & rotated yield positions." };
        }
      },
    }),

    // ── Tool 7: Get Live Transactions & Etherscan Links ──────────────────────
    getLiveTransactions: tool({
      description: "Query recent on-chain transactions, execution logs, and live Sepolia Etherscan verification links (e.g. 'show live tx', 'recent transactions', 'etherscan links')",
      parameters: z.object({}),
      execute: async () => {
        const logs = await db.query.executionsLog.findMany({
          where: eq(executionsLog.userWallet, wallet),
          orderBy: [desc(executionsLog.timestamp)],
          limit: 5,
        });

        return {
          count: logs.length,
          transactions: logs.map(l => ({
            action: l.action,
            amount: l.amount,
            status: l.status,
            reason: l.reason,
            txHash: l.txHash ?? null,
            ...(l.txHash && l.status !== "simulated_stub" && {
              etherscanUrl: `https://sepolia.etherscan.io/tx/${l.txHash}`,
            }),
            timestamp: l.timestamp ? new Date(l.timestamp).toISOString() : new Date().toISOString(),
          })),
        };
      },
    }),
  };
}
