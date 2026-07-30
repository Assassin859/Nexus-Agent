import { db } from "../db/client.js";
import { userSettings } from "../db/schema.js";
import { eq } from "drizzle-orm";

/**
 * Resolves the per-user KeeperHub API key from user_settings in Postgres.
 * Falls back to process.env.KEEPERHUB_API_KEY if the user has no custom key configured.
 */
export async function resolveKeeperHubApiKey(userWallet: string): Promise<string | undefined> {
  if (!userWallet) return process.env.KEEPERHUB_API_KEY;

  try {
    const settings = await db.query.userSettings.findFirst({
      where: eq(userSettings.userWallet, userWallet.toLowerCase()),
    });

    return settings?.keeperhubApiKey || process.env.KEEPERHUB_API_KEY;
  } catch (err) {
    console.warn(`[USER_CONTEXT] Failed to resolve API key for ${userWallet.slice(0, 8)}, using default env key:`, err);
    return process.env.KEEPERHUB_API_KEY;
  }
}
