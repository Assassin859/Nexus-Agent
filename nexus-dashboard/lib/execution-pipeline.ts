import type { TransactionStatus } from "@/components/TransactionCard";

export const PIPELINE_STEPS = ["Triggered", "Simulating", "Broadcasting", "Mined"] as const;

export type PipelineVisual = {
  /** Highest step reached (0–3). */
  activeStep: number;
  /** Step where flow stopped with failure, if any. */
  failedAt?: number;
  /** Short outcome when not a full on-chain path. */
  outcome?: string;
};

const CHAIN_ACTIONS = new Set([
  "repay",
  "supply_collateral",
  "swap",
  "rotate",
  "payroll",
]);

function hasMinedTx(txHash?: string): boolean {
  return typeof txHash === "string" && txHash.startsWith("0x") && txHash.length === 66;
}

/** Per-row pipeline — matches executions_log status, not a global feed summary. */
export function getExecutionPipeline(
  status: TransactionStatus,
  action: string,
  txHash?: string,
): PipelineVisual {
  const chainAction = CHAIN_ACTIONS.has(action);

  if (action === "hold" || action === "block_transaction") {
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
    return { activeStep: 1, failedAt: 1, outcome: "Delayed" };
  }

  if (status === "simulated_stub") {
    return { activeStep: 1, outcome: "Stub" };
  }

  if (status === "success") {
    return { activeStep: 2, outcome: "Logged" };
  }

  return { activeStep: 0 };
}
