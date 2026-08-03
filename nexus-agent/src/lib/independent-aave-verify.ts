import { getAavePosition } from "./aave.js";

export type AaveSnapshot = {
  healthFactor: number | null;
  debtUSD: number;
  collateralUSD: number;
};

export type IndependentVerification = {
  verified: boolean;
  keeperhubClaimedSuccess: boolean;
  source: "direct_rpc";
  hfBefore: number | null;
  hfAfter: number | null;
  debtBeforeUSD: number;
  debtAfterUSD: number;
  expectedAction: "repay" | "supply_collateral";
  discrepancy?: string;
  checkedAt: string;
};

export type ExecutionPollOutcome = {
  status: string;
  txHash?: string | null;
  timedOut?: boolean;
};

const DEBT_EPSILON_USD = 0.01;
const HF_EPSILON = 0.001;
const POST_TX_WAIT_MS = 4000;

function hasValidTxHash(txHash?: string | null): boolean {
  return typeof txHash === "string" && txHash.startsWith("0x") && txHash.length === 66;
}

/** Whether KeeperHub poll indicates on-chain success (matches resolveExecutionLogStatus). */
export function keeperhubClaimedExecutionSuccess(poll: ExecutionPollOutcome): boolean {
  return poll.status === "mined" || hasValidTxHash(poll.txHash);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function evaluateRepayVerification(
  before: AaveSnapshot,
  after: AaveSnapshot,
  keeperhubClaimedSuccess: boolean,
): Pick<IndependentVerification, "verified" | "discrepancy"> {
  if (!keeperhubClaimedSuccess) {
    return { verified: false, discrepancy: "KeeperHub did not claim success — verification skipped" };
  }

  const debtDropped = after.debtUSD < before.debtUSD - DEBT_EPSILON_USD;
  const hfImproved =
    before.healthFactor != null &&
    after.healthFactor != null &&
    after.healthFactor > before.healthFactor + HF_EPSILON;

  if (debtDropped || hfImproved) {
    return { verified: true };
  }

  return {
    verified: false,
    discrepancy:
      "KeeperHub reported success; independent Aave read shows no repay effect (debt/HF unchanged within tolerance).",
  };
}

function snapshotFromPosition(pos: {
  healthFactor: number | null;
  debtUSD: number;
  collateralUSD: number;
}): AaveSnapshot {
  return {
    healthFactor: pos.healthFactor,
    debtUSD: pos.debtUSD,
    collateralUSD: pos.collateralUSD,
  };
}

function buildVerification(
  before: AaveSnapshot,
  after: AaveSnapshot,
  action: "repay" | "supply_collateral",
  keeperhubClaimedSuccess: boolean,
  result: Pick<IndependentVerification, "verified" | "discrepancy">,
): IndependentVerification {
  return {
    verified: result.verified,
    keeperhubClaimedSuccess,
    source: "direct_rpc",
    hfBefore: before.healthFactor,
    hfAfter: after.healthFactor,
    debtBeforeUSD: before.debtUSD,
    debtAfterUSD: after.debtUSD,
    expectedAction: action,
    ...(result.discrepancy ? { discrepancy: result.discrepancy } : {}),
    checkedAt: new Date().toISOString(),
  };
}

/**
 * After KeeperHub reports a mined repay, re-read Aave via direct RPC (not MCP)
 * and compare to the pre-action snapshot.
 */
export async function verifyAaveAfterExecution(params: {
  wallet: string;
  action: "repay" | "supply_collateral";
  before: AaveSnapshot;
  poll: ExecutionPollOutcome;
  waitMs?: number;
}): Promise<IndependentVerification | null> {
  const { wallet, action, before, poll, waitMs = POST_TX_WAIT_MS } = params;

  if (action !== "repay") {
    return null;
  }

  const claimedSuccess = keeperhubClaimedExecutionSuccess(poll);
  if (!claimedSuccess) {
    return null;
  }

  await sleep(waitMs);

  const afterPosition = await getAavePosition(wallet);
  if (afterPosition.isError) {
    return buildVerification(before, before, action, claimedSuccess, {
      verified: false,
      discrepancy: "Independent RPC read failed after execution.",
    });
  }

  const after = snapshotFromPosition(afterPosition);
  const result = evaluateRepayVerification(before, after, claimedSuccess);
  return buildVerification(before, after, action, claimedSuccess, result);
}
