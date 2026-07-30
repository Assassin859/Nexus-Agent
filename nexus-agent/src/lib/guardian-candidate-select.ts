import type { CandidateAction, GuardianDecision } from "../brain/schemas.js";

/**
 * Pure Candidate Selection Harness Logic.
 * Evaluates candidate actions against risk thresholds and expected Health Factors.
 * Filters candidates with expectedHealthFactor >= 1.25 and riskScore <= 5,
 * then ranks by riskScore (ASC), expectedHealthFactor (DESC), and estimatedGasUSD (ASC).
 */
export function selectBestCandidate(
  candidates: CandidateAction[] | undefined,
  fallback: GuardianDecision["recommendation"]
): GuardianDecision["recommendation"] {
  if (!candidates || candidates.length === 0) return fallback;

  // Filter: expectedHealthFactor >= 1.25 AND riskScore <= 5
  const eligible = candidates.filter(
    (c) => c.expectedHealthFactor >= 1.25 && c.riskScore <= 5
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
