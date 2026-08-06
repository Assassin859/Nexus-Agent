import { HF_CRITICAL, HF_WARNING } from "@/lib/guardian-thresholds";

export type MatrixBucket = "hold" | "partial" | "full" | "yield" | "blocked" | "other";

export type ExecutionLogItem = {
  id?: string;
  action: string;
  status: string;
  txHash?: string | null;
  aiAnalysis?: {
    healthFactor?: number;
    safetyStatus?: string;
    [key: string]: unknown;
  } | null;
};

export const BUCKET_LABELS: Record<MatrixBucket, string> = {
  hold: "Hold Path",
  partial: "Partial Repay",
  full: "Full Repay",
  yield: "Yield Rotate",
  blocked: "Guarded",
  other: "Other",
};

export function getDecisionBucket(item: ExecutionLogItem): MatrixBucket {
  const { action, aiAnalysis } = item;
  const hf = aiAnalysis?.healthFactor;
  const ss = aiAnalysis?.safetyStatus;

  if (action === "hold") return "hold";
  if (action === "block_transaction") return "blocked";
  if (action === "rotate") return "yield";

  if (action === "repay" || action === "supply_collateral") {
    if (hf != null && hf < HF_CRITICAL) return "full";
    if (ss === "critical_liquidation_risk") return "full";
    if (hf != null && hf >= HF_CRITICAL && hf <= HF_WARNING) return "partial";
    if (ss === "warning") return "partial";
    if (hf != null && hf > HF_WARNING) return "other";
    return "partial";
  }

  if (action === "borrow" || action === "withdraw") {
    return "other";
  }

  return "other";
}
