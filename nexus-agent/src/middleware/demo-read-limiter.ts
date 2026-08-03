import rateLimit from "express-rate-limit";
import type { Request } from "express";
import { isDemoWallet, normalizeWallet } from "../lib/demo-wallet.js";

/** True when request targets demo wallet read paths without a JWT. */
export function isDemoReadRequest(req: Request): boolean {
  if (req.headers.authorization?.startsWith("Bearer ")) {
    return false;
  }

  const path = req.path.toLowerCase();

  const portfolioMatch = path.match(/^\/api\/portfolio\/(0x[a-f0-9]{40})$/i);
  if (portfolioMatch && isDemoWallet(normalizeWallet(portfolioMatch[1]))) {
    return true;
  }

  const feedMatch = path.match(/^\/api\/feed\/(0x[a-f0-9]{40})(?:\/stats)?$/i);
  if (feedMatch && isDemoWallet(normalizeWallet(feedMatch[1]))) {
    return true;
  }

  if (req.method === "POST" && path === "/api/marketplace/hf-read") {
    const body = req.body as { walletAddress?: string } | undefined;
    if (typeof body?.walletAddress === "string" && isDemoWallet(body.walletAddress)) {
      return true;
    }
  }

  if (req.method === "POST" && path === "/api/chat") {
    const body = req.body as { walletAddress?: string } | undefined;
    if (typeof body?.walletAddress === "string" && isDemoWallet(body.walletAddress)) {
      return true;
    }
  }

  return false;
}

export const demoReadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => !isDemoReadRequest(req),
  message: { error: "Too many demo read requests from this IP, please try again in a minute." },
});
