import type { TransactionStatus } from "@/components/TransactionCard";
import { TEMPO_CHAIN_ID } from "@/lib/tier2-proofs";
import { chainLabel } from "@/lib/tx-explorer";

export const PIPELINE_STEPS = ["Triggered", "Simulating", "Broadcasting", "Mined"] as const;

export type PipelineVisual = {
  /** Highest step reached (0–3). */
  activeStep: number;
  /** Step where flow stopped with failure, if any. */
  failedAt?: number;
  /** Short outcome when not a full on-chain path. */
  outcome?: string;
};

export type BadgeVariant = "success" | "warning" | "danger" | "cyan" | "muted";

export type ExecutionDisplay = PipelineVisual & {
  badgeLabel: string;
  badgeVariant: BadgeVariant;
  /** One-line explanation for tooltips / help text. */
  summary: string;
};

const CHAIN_ACTIONS = new Set([
  "repay",
  "supply_collateral",
  "borrow",
  "withdraw",
  "swap",
  "rotate",
  "payroll",
  "tempo_transfer",
  "marketplace_hf_read",
]);

const EVALUATED_ACTIONS = new Set(["hold", "block_transaction"]);

export function hasMinedTx(txHash?: string): boolean {
  return typeof txHash === "string" && txHash.startsWith("0x") && txHash.length === 66 && !txHash.includes("11111111");
}

function isStubTx(status: TransactionStatus, txHash?: string): boolean {
  return (
    status === "simulated_stub" ||
    !txHash ||
    txHash.length !== 66 ||
    txHash.includes("11111111") ||
    txHash === "0x" + "1".repeat(64)
  );
}

/** Per-row pipeline — matches executions_log status, not a global feed summary. */
export function getExecutionPipeline(
  status: TransactionStatus,
  action: string,
  txHash?: string,
): PipelineVisual {
  const chainAction = CHAIN_ACTIONS.has(action);

  if (EVALUATED_ACTIONS.has(action)) {
    return { activeStep: 0, outcome: "Evaluated" };
  }

  if (!chainAction && status === "success") {
    return { activeStep: 0, outcome: "Logged" };
  }

  if (status === "success" && hasMinedTx(txHash)) {
    return { activeStep: 3 };
  }

  if (status === "pending") {
    return { activeStep: 2 };
  }

  if (status === "reverted_chain") {
    return { activeStep: 2, failedAt: 2 };
  }

  if (status === "reverted_simulation") {
    return { activeStep: 1, failedAt: 1 };
  }

  if (status === "delayed") {
    return { activeStep: 0, outcome: "Delayed" };
  }

  if (status === "simulated_stub") {
    return { activeStep: 1, outcome: "Stub" };
  }

  if (status === "success") {
    return { activeStep: 2, outcome: "Logged" };
  }

  return { activeStep: 0 };
}

/** Badge label aligned with the pipeline — avoids "Executed" on hold/evaluated rows. */
export function getExecutionDisplay(
  status: TransactionStatus,
  action: string,
  txHash?: string,
  aiAnalysis?: Record<string, unknown> | null,
): ExecutionDisplay {
  const pipeline = getExecutionPipeline(status, action, txHash);
  const chainAction = CHAIN_ACTIONS.has(action);
  const mined = status === "success" && hasMinedTx(txHash);
  const stub = isStubTx(status, txHash);
  const chain = chainLabel(aiAnalysis?.chainId);

  if (EVALUATED_ACTIONS.has(action)) {
    return {
      ...pipeline,
      badgeLabel: "Evaluated",
      badgeVariant: "muted",
      summary: "Agent evaluated conditions and chose not to broadcast a transaction.",
    };
  }

  if (status === "success" && mined) {
    const tempoMined = aiAnalysis?.chainId === TEMPO_CHAIN_ID || aiAnalysis?.chainId === "42431";
    return {
      ...pipeline,
      badgeLabel: "Mined",
      badgeVariant: "success",
      summary: tempoMined
        ? "Tempo transfer-with-memo confirmed on Moderato testnet via KeeperHub MCP."
        : `Pre-flight simulation passed, transaction broadcast, and confirmed on ${chain}.`,
    };
  }

  if (status === "success" && stub) {
    return {
      ...pipeline,
      badgeLabel: "Logged",
      badgeVariant: "warning",
      summary: chainAction
        ? "Recorded as success but no valid on-chain tx hash — check agent/MCP connectivity."
        : "Decision logged without an on-chain transaction.",
    };
  }

  if (status === "pending") {
    return {
      ...pipeline,
      badgeLabel: "Broadcasting",
      badgeVariant: "cyan",
      summary: "Transaction submitted — waiting for Base Sepolia confirmation.",
    };
  }

  if (status === "reverted_simulation") {
    return {
      ...pipeline,
      badgeLabel: "Sim Failed",
      badgeVariant: "warning",
      summary: "Pre-flight simulation caught a revert before any gas was spent.",
    };
  }

  if (status === "reverted_chain") {
    return {
      ...pipeline,
      badgeLabel: "Chain Revert",
      badgeVariant: "danger",
      summary: "Transaction was broadcast but reverted on-chain (liquidity, slippage, allowance, etc.).",
    };
  }

  if (status === "delayed") {
    return {
      ...pipeline,
      badgeLabel: "Delayed",
      badgeVariant: "warning",
      summary: "Skipped this cycle — gas too high, insufficient balance, or agent guard active.",
    };
  }

  if (status === "simulated_stub") {
    return {
      ...pipeline,
      badgeLabel: "Simulated",
      badgeVariant: "warning",
      summary: "KeeperHub MCP unavailable — recorded as stub without real broadcast.",
    };
  }

  if (action === "marketplace_hf_read" && status === "success") {
    return {
      ...pipeline,
      badgeLabel: "Read",
      badgeVariant: "success",
      summary: "Health factor read via KeeperHub marketplace listing (or local Aave fallback).",
    };
  }

  return {
    ...pipeline,
    badgeLabel: "Unknown",
    badgeVariant: "muted",
    summary: "Unrecognized execution status.",
  };
}
