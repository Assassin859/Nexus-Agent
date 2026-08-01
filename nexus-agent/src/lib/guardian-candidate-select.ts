import type { CandidateAction, GuardianDecision } from "../brain/schemas.js";

export type CandidateSelectOptions = {
  /** Current on-chain HF — relaxes filters when position is critical */
  currentHealthFactor?: number | null;
};

/**
 * Pure Candidate Selection Harness Logic.
 * Evaluates candidate actions against risk thresholds and expected Health Factors.
 */
export function selectBestCandidate(
  candidates: CandidateAction[] | undefined,
  fallback: GuardianDecision["recommendation"],
  options?: CandidateSelectOptions
): GuardianDecision["recommendation"] {
  if (!candidates || candidates.length === 0) return fallback;

  const hf = options?.currentHealthFactor ?? 99;
  const critical = hf < 1.15;
  const minExpectedHf = critical ? 1.0 : 1.25;
  const maxRisk = critical ? 9 : 5;

  const eligible = candidates.filter(
    (c) =>
      c.action !== "hold" &&
      c.action !== "block_transaction" &&
      c.amount > 0 &&
      c.expectedHealthFactor >= minExpectedHf &&
      c.riskScore <= maxRisk
  );

  if (eligible.length === 0) return fallback;

  // Sort: riskScore ASC, expectedHealthFactor DESC, estimatedGasUSD ASC
  eligible.sort((a, b) => {
    if (a.riskScore !== b.riskScore) return a.riskScore - b.riskScore;
    if (a.expectedHealthFactor !== b.expectedHealthFactor) return b.expectedHealthFactor - a.expectedHealthFactor;
    return a.estimatedGasUSD - b.estimatedGasUSD;
  });

  const best = eligible[0];
  return {
    action: best.action,
    asset: "USDC",
    amount: best.amount,
    reason: `Harness Selected Option (${best.action}): ${best.pros || fallback.reason}`,
  };
}
