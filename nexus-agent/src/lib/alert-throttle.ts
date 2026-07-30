/**
 * Alert throttle — prevents alert storms during sustained RPC outages or
 * rapid cron failures. Uses an in-memory map keyed by wallet + event type.
 *
 * Key format: "${walletSlice}:${eventType}"
 * e.g. "0xabcd12:liquidation_risk"
 */

const lastAlertAt = new Map<string, number>();

const ALERT_COOLDOWN_MS =
  Number(process.env.ALERT_COOLDOWN_MINUTES || 10) * 60 * 1000;

/**
 * Returns true (and updates the timestamp) if enough time has elapsed since
 * the last alert for this key. Returns false if still within the cooldown window.
 */
export function shouldAlert(key: string): boolean {
  const now = Date.now();
  const last = lastAlertAt.get(key) ?? 0;
  if (now - last >= ALERT_COOLDOWN_MS) {
    lastAlertAt.set(key, now);
    return true;
  }
  return false;
}
