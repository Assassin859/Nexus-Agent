import { db } from "../db/client.js";
import { userSettings } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { isDemoWallet } from "./demo-wallet.js";

/**
 * Resolves the per-user KeeperHub API key from user_settings in Postgres.
 * Env KEEPERHUB_API_KEY is only used as fallback for the configured demo/monitored wallet.
 */
export async function resolveKeeperHubApiKey(userWallet: string): Promise<string | undefined> {
  if (!userWallet) return process.env.KEEPERHUB_API_KEY;

  const normalized = userWallet.toLowerCase();

  try {
    const settings = await db.query.userSettings.findFirst({
      where: eq(userSettings.userWallet, normalized),
    });

    if (settings?.keeperhubApiKey) {
      return settings.keeperhubApiKey;
    }

    if (isDemoWallet(normalized)) {
      return process.env.KEEPERHUB_API_KEY;
    }

    return undefined;
  } catch (err) {
    console.warn(`[USER_CONTEXT] Failed to resolve API key for ${normalized.slice(0, 8)}:`, err);
    return isDemoWallet(normalized) ? process.env.KEEPERHUB_API_KEY : undefined;
  }
}
