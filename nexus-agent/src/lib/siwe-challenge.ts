import { randomUUID } from "crypto";

type StoredChallenge = {
  wallet: string;
  challenge: string;
  expiresAt: number;
};

const challenges = new Map<string, StoredChallenge>();

function purgeExpired(): void {
  const now = Date.now();
  for (const [key, entry] of challenges) {
    if (entry.expiresAt <= now) challenges.delete(key);
  }
}

export function issueSiweChallenge(wallet: string): { challenge: string; timestamp: string; nonce: string } {
  purgeExpired();
  const normalized = wallet.toLowerCase();
  const timestamp = new Date().toISOString();
  const nonce = randomUUID();
  const challenge = `Sign in to NexusAgent\n\nWallet: ${normalized}\nTimestamp: ${timestamp}\nNonce: ${nonce}\n\nAuthorize automated wealth management & sync KeeperHub workflows.`;
  challenges.set(nonce, {
    wallet: normalized,
    challenge,
    expiresAt: Date.now() + 5 * 60 * 1000,
  });
  return { challenge, timestamp, nonce };
}

/** Returns true when challenge was server-issued and is consumed (one-time use). */
export function consumeSiweChallenge(wallet: string, challenge: string): boolean {
  purgeExpired();
  const normalized = wallet.toLowerCase();
  const nonceMatch = challenge.match(/Nonce:\s*([^\n]+)/);
  if (!nonceMatch?.[1]) return false;

  const nonce = nonceMatch[1].trim();
  const stored = challenges.get(nonce);
  if (!stored) return false;
  if (stored.wallet !== normalized) return false;
  if (stored.challenge !== challenge) return false;
  if (stored.expiresAt <= Date.now()) {
    challenges.delete(nonce);
    return false;
  }

  challenges.delete(nonce);
  return true;
}
