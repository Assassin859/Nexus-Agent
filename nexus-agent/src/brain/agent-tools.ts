import { tool } from "ai";
import { z } from "zod";
import { db } from "../db/client.js";
import { activeWorkflows, executionsLog, payees } from "../db/schema.js";
import { handle as handlePaychain } from "../modules/paychain.js";
import { registerDcaWorkflow } from "../modules/dca-schedule.js";
import { getAavePosition } from "../lib/aave.js";
import { getWalletContext } from "../lib/agentic-wallet.js";
import { cancelWorkflow } from "../lib/mcp-client.js";
import { run as runGuardian } from "../modules/guardian.js";
import { run as runYieldRotator } from "../modules/yield-rotator.js";
import { run as runDCA } from "../modules/dca.js";
import { eq, desc, and, ilike, gte } from "drizzle-orm";
import {
  TEMPO_CHAIN_ID,
  TEMPO_PROOF_MEMO,
  TEMPO_PROOF_TXS,
  tempoTxUrl,
} from "../lib/tier2-proofs.js";
import { chainLabel, getTxExplorerUrl } from "../lib/tx-explorer.js";

type ExecutionLogRow = {
  txHash?: string | null;
  status: string;
  aiAnalysis?: unknown;
};

/** Map an execution log row to a chain-aware explorer link (for tests and chat tools). */
export function mapExecutionLogToExplorer(log: ExecutionLogRow): {
  explorerUrl?: string;
  explorerLabel?: string;
  chain?: string;
} {
  if (!log.txHash || log.status === "simulated_stub") {
    return {};
  }
  const analysis =
    log.aiAnalysis && typeof log.aiAnalysis === "object"
      ? (log.aiAnalysis as Record<string, unknown>)
      : null;
  const { url, label } = getTxExplorerUrl(log.txHash, analysis);
  const chainId = analysis?.chainId;
  return {
    explorerUrl: url,
    explorerLabel: label,
    chain: chainLabel(chainId),
  };
}

function buildReadOnlyTools(wallet: string) {
  return {
    listWorkflows: tool({
      description: "List all active workflows, recurring payrolls, DCA schedules, or triggers registered for this wallet (e.g., 'what are my workflows', 'my workflow', 'show active payments')",
      parameters: z.object({}),
      execute: async () => {
        const activeWfs = await db.query.activeWorkflows.findMany({
          where: and(
            eq(activeWorkflows.userWallet, wallet),
            eq(activeWorkflows.status, "active"),
          ),
        });

        return {
          count: activeWfs.length,
          workflows: activeWfs.map((w) => ({
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
          payees: list.map((p) => ({
            name: p.name,
            type: p.type,
            payoutMode: p.payoutMode,
            vaultPoolAddress: p.vaultPoolAddress,
            memberCount: p.memberCount,
          })),
        };
      },
    }),

    queryPortfolio: tool({
      description: "Query current Aave loan position, health factor, collateral USD, debt USD, and USDC supply balance (e.g., 'what is my health factor', 'check loan', 'am I safe')",
      parameters: z.object({}),
      execute: async () => {
        const pos = await getAavePosition(wallet);
        const ctx = getWalletContext(wallet);

        const alignmentFields = {
          usdcSuppliedUSD: pos.usdcSuppliedUSD,
          usdcSuppliedAmount: pos.usdcSuppliedAmount,
          signerWallet: ctx?.signerWallet ?? null,
          sameWallet: ctx?.sameWallet ?? false,
          yieldRotationAvailable: ctx?.canWithdrawAaveSupply ?? false,
        };

        if (pos.isError) {
          return {
            healthFactor: null,
            collateralUSD: 0,
            debtUSD: 0,
            isSafe: false,
            status: "Degraded / RPC Error",
            errorReason: pos.errorReason,
            ...alignmentFields,
          };
        }

        if (pos.healthFactor === null) {
          return {
            healthFactor: null,
            collateralUSD: pos.collateralUSD,
            debtUSD: pos.debtUSD,
            isSafe: null,
            status: "No Active Loan",
            ...alignmentFields,
          };
        }

        return {
          healthFactor: pos.healthFactor,
          collateralUSD: pos.collateralUSD,
          debtUSD: pos.debtUSD,
          isSafe: pos.healthFactor >= 1.2,
          status: pos.healthFactor >= 1.5 ? "Safe Zone" : pos.healthFactor >= 1.15 ? "Warning Zone" : "Liquidation Risk",
          ...alignmentFields,
        };
      },
    }),

    getLiveTransactions: tool({
      description:
        "Query recent on-chain transactions and execution logs with chain-aware explorer links — Base Sepolia (Guardian repays) or Tempo Moderato (tempo_transfer). Use for 'recent transactions', 'live tx', 'basescan', or mixed activity.",
      parameters: z.object({}),
      execute: async () => {
        const logs = await db.query.executionsLog.findMany({
          where: eq(executionsLog.userWallet, wallet),
          orderBy: [desc(executionsLog.timestamp)],
          limit: 10,
        });

        return {
          count: logs.length,
          transactions: logs.map((l) => ({
            action: l.action,
            amount: l.amount,
            status: l.status,
            reason: l.reason,
            txHash: l.txHash ?? null,
            timestamp: l.timestamp ? new Date(l.timestamp).toISOString() : new Date().toISOString(),
            ...mapExecutionLogToExplorer(l),
          })),
        };
      },
    }),

    getTempoProofs: tool({
      description:
        "List Tempo Moderato on-chain proofs (transfer-with-memo, chain 42431). Use when user asks about Tempo, temo (typo), tempo page, tempo transactions, Moderato, or PathUSD proofs.",
      parameters: z.object({}),
      execute: async () => {
        const dynamicLogs = await db.query.executionsLog.findMany({
          where: and(
            eq(executionsLog.userWallet, wallet),
            eq(executionsLog.action, "tempo_transfer"),
          ),
          orderBy: [desc(executionsLog.timestamp)],
          limit: 10,
        });

        return {
          chainId: TEMPO_CHAIN_ID,
          chainName: "Tempo Moderato",
          memo: TEMPO_PROOF_MEMO,
          dashboardPath: "/tempo",
          publicProofNote: "Verify on Tempo Explorer. KeeperHub workflow editor requires org login.",
          canonicalProofs: TEMPO_PROOF_TXS.map((p, i) => ({
            index: i + 1,
            txHash: p.txHash,
            explorerUrl: tempoTxUrl(p.txHash),
            workflowId: p.workflowId,
          })),
          feedLogs: dynamicLogs.map((l) => ({
            action: l.action,
            status: l.status,
            txHash: l.txHash,
            timestamp: l.timestamp ? new Date(l.timestamp).toISOString() : null,
            ...mapExecutionLogToExplorer(l),
          })),
        };
      },
    }),
  };
}

/** Read-only tools for demo / judge chat (no writes). */
export function createReadOnlyAgentTools(walletAddress: string) {
  return buildReadOnlyTools(walletAddress.toLowerCase());
}

/**
 * Creates the full set of native AI SDK tools for the LLM agent.
 * The model autonomously decides which tool to call based on conversation context.
 */
export function createAgentTools(
  walletAddress: string,
  conversationHistory: any[] = [],
  apiKey?: string
) {
  const wallet = walletAddress.toLowerCase();
  const readOnly = buildReadOnlyTools(wallet);

  const cancelWorkflowsTool = tool({
    description: "Cancel, stop, or pause active workflows (payroll, dca, or all) for this wallet (e.g., 'stop all payrolls', 'cancel all dca', 'pause my payments')",
    parameters: z.object({
      target: z.string().default("all").describe("Target to cancel: 'all' or specific recipient name/address"),
      type: z.enum(["payroll", "dca", "all"]).default("all").describe("Workflow type filter: 'payroll', 'dca', or 'all'"),
    }),
    execute: async ({ target, type = "all" }) => {
      const trimmedTarget = (target || "all").trim();
      const targetType = type || "all";

      const activeList = await db.query.activeWorkflows.findMany({
        where: and(
          eq(activeWorkflows.userWallet, wallet),
          eq(activeWorkflows.status, "active")
        ),
      });

      // Early branch: Direct DCA cancellation ignores payee name/address lookups
      if (targetType === "dca") {
        const dcaRows = activeList.filter((wf) => wf.type === "dca");
        if (dcaRows.length === 0) {
          return { cancelledCount: 0, message: "No active DCA workflows found." };
        }
        let remoteOk = 0;
        for (const wf of dcaRows) {
          if (wf.keeperhubWorkflowId && !wf.keeperhubWorkflowId.startsWith("wf-stub-")) {
            const result = await cancelWorkflow(wf.keeperhubWorkflowId, apiKey);
            if (result.ok && !result.isStub) remoteOk++;
          }
          await db.update(activeWorkflows)
            .set({ status: `cancelled_${wf.id.slice(0, 8)}` })
            .where(eq(activeWorkflows.id, wf.id));
        }
        await db.insert(executionsLog).values({
          userWallet: wallet,
          action: "workflow_cancel",
          amount: 0,
          status: "success",
          reason: `Cancelled ${dcaRows.length} active DCA workflow(s).`,
        });
        return {
          cancelledCount: dcaRows.length,
          message: `🛑 Cancelled ${dcaRows.length} active DCA workflow(s) (${remoteOk} synced to KeeperHub).`,
        };
      }

      let recipientAddressSet: Set<string> | null = null;
      if (trimmedTarget !== "all" && trimmedTarget !== "") {
        const isAddress = /^0x[a-fA-F0-9]{40}$/.test(trimmedTarget);
        if (isAddress) {
          recipientAddressSet = new Set([trimmedTarget.toLowerCase()]);
        } else {
          const matchedPayees = await db.query.payees.findMany({
            where: and(eq(payees.userWallet, wallet), ilike(payees.name, trimmedTarget)),
          });
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

      const filteredList = activeList.filter((wf) => {
        if (targetType !== "all" && wf.type !== targetType) return false;
        if (wf.type === "dca") {
          // Named/address targets apply to payroll only
          if (recipientAddressSet !== null) return false;
          return true;
        }
        if (wf.type === "payroll" && recipientAddressSet !== null) {
          return !!(wf.recipientAddress && recipientAddressSet.has(wf.recipientAddress.toLowerCase()));
        }
        return true;
      });

      if (filteredList.length === 0) {
        return {
          cancelledCount: 0,
          message: `No active workflows matched target '${trimmedTarget}' (type: ${targetType}).`,
        };
      }

      let remoteOk = 0;
      let skipped = 0;

      for (const wf of filteredList) {
        if (wf.type === "payroll" && wf.keeperhubWorkflowId) {
          const result = await cancelWorkflow(wf.keeperhubWorkflowId, apiKey);
          if (result.ok && !result.isStub) remoteOk++;
        } else {
          skipped++;
        }

        await db.update(activeWorkflows)
          .set({ status: `cancelled_${wf.id.slice(0, 8)}` })
          .where(eq(activeWorkflows.id, wf.id));
      }

      await db.insert(executionsLog).values({
        userWallet: wallet,
        action: "workflow_cancel",
        amount: 0,
        status: "success",
        reason: `Cancelled ${filteredList.length} active ${targetType} workflow(s). Target: ${trimmedTarget}`,
      });

      return {
        cancelledCount: filteredList.length,
        message: `🛑 Cancelled ${filteredList.length} active ${targetType === "all" ? "" : targetType + " "}workflow(s) locally (${remoteOk} synced remotely, ${skipped} local-only/stub rows updated).`,
      };
    },
  });

  return {
    ...readOnly,

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

    // ── Tool 1b: Schedule DCA ────────────────────────────────────────────────
    scheduleDCA: tool({
      description: "Schedule a recurring Dollar-Cost Averaging (DCA) swap of USDC into ETH (e.g., 'dca 50 usdc into eth weekly', 'set up weekly $100 dca')",
      parameters: z.object({
        amount: z.number().describe("USDC amount per swap"),
        schedule: z.string().optional().describe("Natural language schedule e.g. 'weekly', 'every monday at 9am'"),
      }),
      execute: async ({ amount, schedule }) => {
        const res = await registerDcaWorkflow({
          userWallet: wallet,
          amount,
          cronSchedule: schedule,
        });

        return {
          success: res.success,
          message: res.message,
          workflowId: res.workflowId,
        };
      },
    }),

    // ── Tool 2: Cancel Workflows (Payroll & DCA) ─────────────────────────────
    cancelWorkflows: cancelWorkflowsTool,
    cancelPayrolls: cancelWorkflowsTool,

    // ── Tool 6: Trigger Automated DeFi Strategies ─────────────────────────────
    triggerStrategy: tool({
      description: "Trigger an automated strategy immediately: 'dca' (swap ETH/USDC), 'guardian' (repayment check), or 'yield' (yield rotator optimization)",
      parameters: z.object({
        strategy: z.enum(["dca", "guardian", "yield"]).describe("Strategy to execute"),
      }),
      execute: async ({ strategy }) => {
        const startedAt = new Date();
        if (strategy === "dca") {
          await runDCA(wallet, { apiKey });
        } else if (strategy === "guardian") {
          await runGuardian(wallet, { apiKey });
        } else {
          await runYieldRotator(wallet, { apiKey });
        }

        const recent = await db.query.executionsLog.findFirst({
          where: and(
            eq(executionsLog.userWallet, wallet),
            gte(executionsLog.timestamp, startedAt),
          ),
          orderBy: [desc(executionsLog.timestamp)],
        });

        if (!recent) {
          return {
            message: `⏭️ ${strategy} skipped — no action logged (pending lock, safe position, schedule window, or RPC unavailable).`,
          };
        }

        return {
          message: `✅ ${strategy} ran: ${recent.status} — ${(recent.reason || recent.action).slice(0, 120)}`,
        };
      },
    }),
  };
}
