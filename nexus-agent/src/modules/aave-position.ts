import { db } from "../db/client.js";
import { executionsLog } from "../db/schema.js";
import { simulate, simulateErc20Action } from "../lib/simulate.js";
import {
  createWorkflow,
  executeWorkflow,
  pollExecutionUntilSettled,
  type WorkflowStep,
} from "../lib/mcp-client.js";
import { getAavePosition, getUsdcBalance } from "../lib/aave.js";
import {
  encodeAaveBorrow,
  encodeAaveRepay,
  encodeAaveSupply,
  encodeAaveWithdraw,
  AAVE_V3_POOL,
  USDC_SEPOLIA,
} from "../lib/calldata.js";
import { getWalletContext, type WalletExecutionContext } from "../lib/agentic-wallet.js";
import { resolveKeeperHubApiKey } from "../lib/user-context.js";
import { acquirePendingLock } from "../lib/pending-lock.js";
import {
  verifyAaveAfterExecution,
  type AaveSnapshot,
} from "../lib/independent-aave-verify.js";
import { resolveExecutionLogStatus } from "../lib/repayment-cycle.js";
import { BASE_SEPOLIA_CHAIN_ID, baseSepoliaTxUrl } from "../lib/tier2-proofs.js";
import { eq } from "drizzle-orm";
import { childLogger } from "../lib/logger.js";

export type AavePositionAction = "supply" | "borrow" | "repay" | "withdraw";

export type AavePositionPreview = {
  ok: boolean;
  action: AavePositionAction;
  amountUSD: number;
  healthFactorBefore: number | null;
  debtUSD: number;
  collateralUSD: number;
  availableBorrowsUSD: number;
  agenticUsdcBalance: number;
  sameWallet: boolean;
  warnings: string[];
  blocked?: boolean;
  blockReason?: string;
  estimatedHealthFactorAfter?: number | null;
};

export type AavePositionResult = {
  success: boolean;
  message: string;
  txHash?: string;
  status?: string;
  preview?: AavePositionPreview;
};

const MIN_AMOUNT_USD = 1;

function logAction(action: AavePositionAction): string {
  if (action === "supply") return "supply_collateral";
  return action;
}

function clampAmount(amountUSD: number, max: number): number {
  return Math.min(Math.max(amountUSD, 0), max);
}

const ACTION_LABELS: Record<string, string> = {
  supply_collateral: "supply",
  repay: "repay",
  borrow: "borrow",
  withdraw: "withdraw",
};

async function simulateAaveAction(params: {
  action: AavePositionAction;
  amountUSD: number;
  userWallet: string;
  ctx: WalletExecutionContext;
}): Promise<{ wouldRevert: boolean; revertReason?: string; allowanceCalldata?: string | null }> {
  const { action, amountUSD, userWallet, ctx } = params;
  const signerWallet = ctx.signerWallet!;

  if (action === "repay") {
    const calldata = encodeAaveRepay(USDC_SEPOLIA, amountUSD, userWallet);
    const sim = await simulateErc20Action(
      signerWallet,
      userWallet,
      USDC_SEPOLIA,
      AAVE_V3_POOL,
      amountUSD,
      { from: signerWallet, to: AAVE_V3_POOL, data: calldata },
    );
    return {
      wouldRevert: sim.wouldRevert,
      revertReason: sim.revertReason,
      allowanceCalldata: sim.allowanceCalldata,
    };
  }

  if (action === "supply") {
    const calldata = encodeAaveSupply(USDC_SEPOLIA, amountUSD, userWallet);
    const sim = await simulateErc20Action(
      signerWallet,
      userWallet,
      USDC_SEPOLIA,
      AAVE_V3_POOL,
      amountUSD,
      { from: signerWallet, to: AAVE_V3_POOL, data: calldata },
    );
    return {
      wouldRevert: sim.wouldRevert,
      revertReason: sim.revertReason,
      allowanceCalldata: sim.allowanceCalldata,
    };
  }

  if (action === "borrow") {
    const calldata = encodeAaveBorrow(USDC_SEPOLIA, amountUSD, userWallet);
    const sim = await simulate({
      from: signerWallet,
      to: AAVE_V3_POOL,
      data: calldata,
    }, userWallet);
    return { wouldRevert: sim.wouldRevert, revertReason: sim.revertReason };
  }

  const withdrawTarget = ctx.sameWallet ? userWallet : signerWallet;
  const calldata = encodeAaveWithdraw(USDC_SEPOLIA, amountUSD, withdrawTarget);
  const sim = await simulate({
    from: signerWallet,
    to: AAVE_V3_POOL,
    data: calldata,
  }, userWallet);
  return { wouldRevert: sim.wouldRevert, revertReason: sim.revertReason };
}

function sanitizeSimulationRevertReason(raw?: string): string | undefined {
  if (!raw) return undefined;

  const reasonMatch = raw.match(/reason="([^"]+)"/);
  if (reasonMatch?.[1]) return reasonMatch[1];

  if (/credit delegation|borrow allowance|delegation/i.test(raw)) {
    return "missing Aave credit delegation";
  }
  if (/insufficient/i.test(raw)) {
    return "insufficient balance or allowance";
  }

  const revertMatch = raw.match(/execution reverted(?: \(([^)]+)\))?/i);
  const revertDetail = revertMatch?.[1];
  if (
    revertDetail
    && revertDetail !== "unknown custom error"
    && !revertDetail.startsWith("0x")
    && revertDetail.length <= 80
  ) {
    return revertDetail;
  }

  // Ethers estimateGas dumps — never show hex blobs or RPC payloads in UI copy.
  if (raw.length > 100 || /0x[a-fA-F0-9]{32,}/.test(raw) || /action="estimateGas"/i.test(raw)) {
    return "transaction would revert on-chain";
  }

  return raw.length > 100 ? `${raw.slice(0, 97)}…` : raw;
}

function simulationBlockReason(
  action: AavePositionAction,
  sameWallet: boolean,
  revertReason?: string,
  signerWallet?: string | null,
): string {
  if (action === "borrow" && !sameWallet) {
    const agenticHint = signerWallet
      ? ` (${signerWallet.slice(0, 6)}…${signerWallet.slice(-4)})`
      : "";
    return (
      "Borrow is unavailable in dual-wallet mode until your monitored wallet grants Aave credit delegation " +
      `to the agentic MPC wallet${agenticHint}. Without delegation, borrow onBehalfOf reverts on-chain. ` +
      "Supply and repay still work via onBehalfOf."
    );
  }

  const short = sanitizeSimulationRevertReason(revertReason);
  return short
    ? `On-chain simulation failed: ${short}.`
    : "On-chain simulation failed — this transaction would revert.";
}

async function getVerificationContext(
  action: AavePositionAction,
  userWallet: string,
  ctx: WalletExecutionContext,
): Promise<{ wallet: string; before: AaveSnapshot }> {
  const verifyWallet =
    action === "withdraw" && !ctx.sameWallet && ctx.signerWallet
      ? ctx.signerWallet
      : userWallet;
  const position = await getAavePosition(verifyWallet);
  return {
    wallet: verifyWallet,
    before: {
      healthFactor: position.healthFactor,
      debtUSD: position.debtUSD,
      collateralUSD: position.collateralUSD,
    },
  };
}

export async function previewAavePositionAction(params: {
  userWallet: string;
  action: AavePositionAction;
  amountUSD: number;
}): Promise<AavePositionPreview> {
  const { userWallet, action } = params;
  const ctx = getWalletContext(userWallet);
  const warnings: string[] = [];

  if (!ctx?.signerWallet) {
    return {
      ok: false,
      action,
      amountUSD: params.amountUSD,
      healthFactorBefore: null,
      debtUSD: 0,
      collateralUSD: 0,
      availableBorrowsUSD: 0,
      agenticUsdcBalance: 0,
      sameWallet: false,
      warnings: [],
      blocked: true,
      blockReason: "AGENTIC_WALLET_ADDRESS is not configured on the agent.",
    };
  }

  const [position, agenticUsdc] = await Promise.all([
    getAavePosition(userWallet),
    getUsdcBalance(ctx.signerWallet),
  ]);

  if (position.isError) {
    return {
      ok: false,
      action,
      amountUSD: params.amountUSD,
      healthFactorBefore: null,
      debtUSD: 0,
      collateralUSD: 0,
      availableBorrowsUSD: 0,
      agenticUsdcBalance: agenticUsdc,
      sameWallet: ctx.sameWallet,
      warnings: [],
      blocked: true,
      blockReason: position.errorReason ?? "Aave RPC unavailable",
    };
  }

  let maxAmount = params.amountUSD;
  let blocked = false;
  let blockReason: string | undefined;

  if (action === "supply") {
    maxAmount = clampAmount(params.amountUSD, agenticUsdc);
    if (agenticUsdc < MIN_AMOUNT_USD) {
      blocked = true;
      blockReason = `Agentic wallet USDC balance too low ($${agenticUsdc.toFixed(2)}).`;
    }
    if (!ctx.sameWallet) {
      warnings.push("USDC is supplied from the agentic MPC wallet on behalf of your monitored wallet.");
    }
  } else if (action === "repay") {
    maxAmount = clampAmount(params.amountUSD, Math.min(position.debtUSD, agenticUsdc));
    if (position.debtUSD < MIN_AMOUNT_USD) {
      blocked = true;
      blockReason = "No Aave debt to repay.";
    } else if (agenticUsdc < MIN_AMOUNT_USD) {
      blocked = true;
      blockReason = `Agentic wallet USDC too low ($${agenticUsdc.toFixed(2)}).`;
    }
  } else if (action === "borrow") {
    maxAmount = clampAmount(params.amountUSD, position.availableBorrowsUSD);
    if (position.availableBorrowsUSD < MIN_AMOUNT_USD) {
      blocked = true;
      blockReason = "No available borrow capacity on this position.";
    }
    if (!ctx.sameWallet) {
      warnings.push(
        "Dual-wallet borrow uses onBehalfOf your monitored wallet — requires Aave credit delegation or the tx may revert.",
      );
    }
  } else if (action === "withdraw") {
    const withdrawWallet = ctx.sameWallet ? userWallet : ctx.signerWallet;
    const withdrawPos = ctx.sameWallet
      ? position
      : await getAavePosition(withdrawWallet);
    maxAmount = clampAmount(params.amountUSD, withdrawPos.usdcSuppliedUSD);
    if (!ctx.sameWallet) {
      warnings.push("Withdraws from agentic wallet Aave supply (monitored wallet supply is not withdrawable cross-wallet).");
    }
    if (withdrawPos.usdcSuppliedUSD < MIN_AMOUNT_USD) {
      blocked = true;
      blockReason = ctx.sameWallet
        ? "No USDC supplied on Aave to withdraw."
        : "No USDC supplied on agentic Aave position to withdraw.";
    }
  }

  const amountUSD =
    maxAmount >= MIN_AMOUNT_USD
      ? Math.min(params.amountUSD, maxAmount)
      : maxAmount;

  if (!blocked && amountUSD < MIN_AMOUNT_USD) {
    blocked = true;
    blockReason = blockReason ?? `Minimum action size is $${MIN_AMOUNT_USD} USDC.`;
  }

  let estimatedHealthFactorAfter: number | null = null;
  if (position.healthFactor != null && position.collateralUSD > 0) {
    if (action === "repay" && amountUSD > 0) {
      const newDebt = Math.max(0, position.debtUSD - amountUSD);
      estimatedHealthFactorAfter = newDebt > 0
        ? (position.healthFactor * position.debtUSD) / newDebt
        : null;
    } else if (action === "supply" && amountUSD > 0) {
      const newColl = position.collateralUSD + amountUSD;
      estimatedHealthFactorAfter = position.debtUSD > 0
        ? (position.healthFactor * position.collateralUSD) / newColl
        : null;
    } else if (action === "borrow" && amountUSD > 0) {
      const newDebt = position.debtUSD + amountUSD;
      estimatedHealthFactorAfter = newDebt > 0
        ? (position.healthFactor * position.debtUSD) / newDebt
        : position.healthFactor;
    }
    if (estimatedHealthFactorAfter != null) {
      estimatedHealthFactorAfter = parseFloat(estimatedHealthFactorAfter.toFixed(3));
    }
  }

  if (!blocked && amountUSD >= MIN_AMOUNT_USD && ctx.signerWallet) {
    const sim = await simulateAaveAction({
      action,
      amountUSD,
      userWallet,
      ctx: ctx as WalletExecutionContext & { signerWallet: string },
    });
    if (sim.wouldRevert) {
      blocked = true;
      blockReason = simulationBlockReason(action, ctx.sameWallet, sim.revertReason, ctx.signerWallet);
    }
  }

  return {
    ok: !blocked && amountUSD >= MIN_AMOUNT_USD,
    action,
    amountUSD,
    healthFactorBefore: position.healthFactor,
    debtUSD: position.debtUSD,
    collateralUSD: position.collateralUSD,
    availableBorrowsUSD: position.availableBorrowsUSD,
    agenticUsdcBalance: agenticUsdc,
    sameWallet: ctx.sameWallet,
    warnings,
    blocked,
    blockReason,
    estimatedHealthFactorAfter,
  };
}

export async function executeAavePositionAction(params: {
  userWallet: string;
  action: AavePositionAction;
  amountUSD: number;
  apiKey?: string;
}): Promise<AavePositionResult> {
  const userWallet = params.userWallet.toLowerCase();
  const log = childLogger({ module: "aave-position", wallet: userWallet.slice(0, 8) });

  const preview = await previewAavePositionAction({
    userWallet,
    action: params.action,
    amountUSD: params.amountUSD,
  });

  if (preview.blocked || !preview.ok) {
    return {
      success: false,
      message: preview.blockReason ?? "Action blocked by position guards.",
      preview,
    };
  }

  const ctx = getWalletContext(userWallet);
  if (!ctx?.signerWallet) {
    return { success: false, message: "Agentic wallet not configured.", preview };
  }

  const effectiveKey = params.apiKey ?? (await resolveKeeperHubApiKey(userWallet));
  if (!effectiveKey) {
    return {
      success: false,
      message: "KeeperHub API key required — paste org kh_… key in KeeperHub Sync.",
      preview,
    };
  }

  const signerWallet = ctx.signerWallet;
  const amountUSD = preview.amountUSD;
  const action = params.action;
  const feedAction = logAction(action);

  const { wallet: verifyWallet, before: aaveBefore } = await getVerificationContext(
    action,
    userWallet,
    ctx as WalletExecutionContext,
  );

  let calldata: string;
  let allowanceCalldata: string | null = null;

  const simResult = await simulateAaveAction({
    action,
    amountUSD,
    userWallet,
    ctx: ctx as WalletExecutionContext & { signerWallet: string },
  });
  allowanceCalldata = simResult.allowanceCalldata ?? null;

  if (action === "repay") {
    calldata = encodeAaveRepay(USDC_SEPOLIA, amountUSD, userWallet);
  } else if (action === "supply") {
    calldata = encodeAaveSupply(USDC_SEPOLIA, amountUSD, userWallet);
  } else if (action === "borrow") {
    calldata = encodeAaveBorrow(USDC_SEPOLIA, amountUSD, userWallet);
  } else {
    const withdrawTarget = ctx.sameWallet ? userWallet : signerWallet;
    calldata = encodeAaveWithdraw(USDC_SEPOLIA, amountUSD, withdrawTarget);
  }

  if (simResult.wouldRevert) {
    await db.insert(executionsLog).values({
      userWallet,
      action: feedAction,
      amount: Math.round(amountUSD),
      status: "reverted_simulation",
      reason: `Manual ${action} preview failed simulation: ${simResult.revertReason ?? "reverted"}`,
      aiAnalysis: { manualAaveAction: action, preview },
    });
    return {
      success: false,
      message: simulationBlockReason(action, ctx.sameWallet, simResult.revertReason, ctx.signerWallet),
      preview,
    };
  }

  const pendingLock = await acquirePendingLock({
    userWallet,
    action: feedAction,
    amount: Math.round(amountUSD),
    reason: `Manual Aave ${action}: $${amountUSD.toFixed(2)} USDC`,
    aiAnalysis: { manualAaveAction: action, preview },
  });

  if (!pendingLock) {
    const label = ACTION_LABELS[feedAction] ?? feedAction;
    return {
      success: false,
      message:
        `Another ${label} execution is in flight (manual action or Guardian cron). ` +
        "Wait for it to settle, then try again.",
      preview,
    };
  }

  const pendingRow = { id: pendingLock.id };

  try {
    const steps: WorkflowStep[] = [];
    if (allowanceCalldata) {
      steps.push({
        type: "transaction",
        to: USDC_SEPOLIA,
        calldata: allowanceCalldata,
        gasStrategy: "standard",
      });
    }
    steps.push({
      type: "transaction",
      to: AAVE_V3_POOL,
      calldata,
      gasStrategy: "standard",
    });

    const { workflowId, isStub: createStub } = await createWorkflow({
      name: `aave-${action}-${userWallet.slice(0, 8)}-${Date.now()}`,
      triggerType: "manual",
      steps,
      mevProtected: action === "borrow" || action === "withdraw",
    }, effectiveKey);

    const { executionId, isStub: execStub } = await executeWorkflow(workflowId, effectiveKey);
    const isStub = createStub || execStub;

    if (isStub) {
      await db.update(executionsLog)
        .set({
          status: "simulated_stub",
          reason: `Manual ${action}: KeeperHub MCP stub — check API key.`,
          aiAnalysis: { manualAaveAction: action, workflowId, executionId, preview },
        })
        .where(eq(executionsLog.id, pendingRow.id));
      return {
        success: false,
        message: "KeeperHub MCP unavailable (stub) — check API key connectivity.",
        preview,
      };
    }

    const poll = await pollExecutionUntilSettled(executionId, effectiveKey);
    const { status: finalStatus, reason: pollReason } = resolveExecutionLogStatus(poll);

    const verifyAction =
      action === "supply" ? "supply_collateral" : action;

    const independentVerification = await verifyAaveAfterExecution({
      wallet: verifyWallet,
      action: verifyAction,
      before: aaveBefore,
      poll,
    });

    const success = finalStatus === "success";
    const reason = success
      ? `Manual ${action}: $${amountUSD.toFixed(2)} USDC via KeeperHub MCP`
      : pollReason;

    await db.update(executionsLog)
      .set({
        status: finalStatus,
        txHash: poll.txHash,
        reason,
        aiAnalysis: {
          chainId: BASE_SEPOLIA_CHAIN_ID,
          explorerUrl: poll.txHash ? baseSepoliaTxUrl(poll.txHash) : undefined,
          manualAaveAction: action,
          workflowId,
          executionId,
          preview,
          pollStatus: poll.status,
          ...(independentVerification ? { independentVerification } : {}),
        },
      })
      .where(eq(executionsLog.id, pendingRow.id));

    log.info({ action, amountUSD, finalStatus, txHash: poll.txHash }, "Manual Aave action complete");

    return {
      success,
      message: success
        ? `${action} executed — $${amountUSD.toFixed(2)} USDC${poll.txHash ? ` (${poll.txHash.slice(0, 10)}…)` : ""}`
        : reason,
      txHash: poll.txHash ?? undefined,
      status: finalStatus,
      preview,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await db.update(executionsLog)
      .set({
        status: "reverted_chain",
        reason: `Manual ${action} error: ${msg}`,
        aiAnalysis: { manualAaveAction: action, preview },
      })
      .where(eq(executionsLog.id, pendingRow.id));
    return { success: false, message: msg, preview };
  }
}
