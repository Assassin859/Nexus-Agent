/**
 * Shared helper for retrieving the agentic wallet address.
 *
 * • In production: throw at server startup (called from index.ts boot guard) —
 *   modules themselves never throw mid-cron.
 * • In dev: return null and let the caller return early cleanly.
 *
 * All three execution modules (guardian, dca, yield-rotator) call this at the
 * top of run() and return immediately if null is returned.
 */
export function getAgenticWallet(): string | null {
  const addr = process.env.AGENTIC_WALLET_ADDRESS;
  if (!addr) {
    if (process.env.NODE_ENV === "production") {
      // Intentional throw — this is called once from index.ts startup, not from cron
      throw new Error(
        "[FATAL] AGENTIC_WALLET_ADDRESS is required in production. Set it in your environment."
      );
    }
    console.warn(
      "[AGENTIC_WALLET] AGENTIC_WALLET_ADDRESS is not set — skipping execution in dev mode."
    );
    return null;
  }
  return addr;
}
