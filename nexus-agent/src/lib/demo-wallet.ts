import { DEMO_MONITORED_WALLET } from "./demo-addresses.js";

/** Configured demo / monitored wallet (always lowercase). */
export function getDemoWallet(): string {
  return (
    process.env.NEXT_PUBLIC_WALLET_ADDRESS || DEMO_MONITORED_WALLET
  ).trim().toLowerCase();
}

/** Normalize an Ethereum address for comparison (lowercase, trimmed). */
export function normalizeWallet(address: string): string {
  return (address || "").trim().toLowerCase();
}

export function isDemoWallet(address: string): boolean {
  const normalized = normalizeWallet(address);
  if (!normalized.startsWith("0x") || normalized.length !== 42) {
    return false;
  }
  return normalized === getDemoWallet();
}
