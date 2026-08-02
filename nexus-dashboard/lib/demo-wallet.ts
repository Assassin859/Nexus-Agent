/** Configured demo / monitored wallet (always lowercase). */
export function getDemoWallet(): string {
  return (
    process.env.NEXT_PUBLIC_WALLET_ADDRESS || "0x89f97Cb35236a1d0190FB25B31C5C0fF4107Ec1b"
  ).trim().toLowerCase();
}

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

export function isDemoReadMode(authToken: string | null, walletAddress: string): boolean {
  return !authToken && isDemoWallet(walletAddress);
}

/** Parse feed API response (plain array or demo-read wrapper). */
export function parseFeedResponse<T>(data: unknown): T[] {
  if (Array.isArray(data)) {
    return data as T[];
  }
  if (data && typeof data === "object" && Array.isArray((data as { items?: unknown }).items)) {
    return (data as { items: T[] }).items;
  }
  return [];
}
