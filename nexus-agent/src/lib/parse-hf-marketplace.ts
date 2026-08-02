/** Extract HF + collateral/debt from KeeperHub call_workflow marketplace response. */
export function parseHfMarketplaceResult(data: unknown): {
  healthFactor: number | null;
  totalCollateralUSD: number | null;
  totalDebtUSD: number | null;
} {
  const root = unwrap(data);
  const hf = pickNumber(root, ["healthFactor", "health_factor", "hf"]);
  const collateral = pickNumber(root, [
    "totalCollateralUSD",
    "totalCollateralBase",
    "total_collateral_usd",
    "collateralUSD",
  ]);
  const debt = pickNumber(root, ["totalDebtUSD", "totalDebtBase", "total_debt_usd", "debtUSD"]);

  return {
    healthFactor: hf !== null ? normalizeHealthFactor(hf) : null,
    totalCollateralUSD: collateral !== null ? normalizeUsdBase(collateral) : null,
    totalDebtUSD: debt !== null ? normalizeUsdBase(debt) : null,
  };
}

function unwrap(data: unknown): Record<string, unknown> {
  if (!data || typeof data !== "object") return {};
  const obj = data as Record<string, unknown>;
  if (obj.result && typeof obj.result === "object") return obj.result as Record<string, unknown>;
  if (obj.outputs && typeof obj.outputs === "object") return obj.outputs as Record<string, unknown>;
  if (obj.data && typeof obj.data === "object") return obj.data as Record<string, unknown>;
  return obj;
}

function pickNumber(obj: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const val = obj[key];
    const n = coerceNumber(val);
    if (n !== null) return n;
  }
  return null;
}

function coerceNumber(val: unknown): number | null {
  if (typeof val === "number" && Number.isFinite(val)) return val;
  if (typeof val === "string" && val.trim() !== "") {
    const n = Number(val);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Aave healthFactor is 1e18 scaled; marketplace may return raw or human. */
function normalizeHealthFactor(n: number): number {
  if (n > 1_000_000) return parseFloat((n / 1e18).toFixed(4));
  return parseFloat(n.toFixed(4));
}

/** Collateral/debt base units are 1e8 USD on Aave. */
function normalizeUsdBase(n: number): number {
  if (n > 1_000_000) return parseFloat((n / 1e8).toFixed(2));
  return parseFloat(n.toFixed(2));
}
