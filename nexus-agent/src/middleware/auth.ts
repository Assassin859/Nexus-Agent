import { Request, Response, NextFunction } from "express";
import jwt, { type SignOptions } from "jsonwebtoken";
import { isDemoWallet, normalizeWallet } from "../lib/demo-wallet.js";

/** Request after optionalAuth — JWT may be absent or ignored. */
export interface OptionalAuthedRequest extends Request {
  userWallet?: string;
}

/** Request after requireAuth — JWT wallet is always set. */
export interface AuthedRequest extends Request {
  userWallet: string;
}

export class AuthError extends Error {
  statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.name = "AuthError";
  }
}

/**
 * Signs a JWT token for a verified wallet address.
 * Fails closed at runtime if JWT_SECRET is missing in production.
 */
export function generateAuthToken(walletAddress: string): string {
  const secret = process.env.JWT_SECRET;
  if (!secret && process.env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET environment variable is REQUIRED in production.");
  }

  const payload = { walletAddress: walletAddress.toLowerCase() };
  const signingKey = secret || "dev_nexus_jwt_secret_fallback_key_2026";
  const expiresIn = (process.env.JWT_EXPIRES_IN || "7d") as SignOptions["expiresIn"];

  return jwt.sign(payload, signingKey, { expiresIn });
}

/**
 * Verifies a JWT token and returns the payload.
 */
export function verifyAuthToken(token: string): { walletAddress: string } {
  const secret = process.env.JWT_SECRET || "dev_nexus_jwt_secret_fallback_key_2026";
  return jwt.verify(token, secret) as { walletAddress: string };
}

/**
 * Express middleware enforcing JWT authentication.
 * Attaches req.userWallet on success; returns 401 Unauthorized on failure.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized: Missing or malformed Authorization header" });
    return;
  }

  const token = authHeader.split(" ")[1];
  try {
    const decoded = verifyAuthToken(token);
    if (!decoded || !decoded.walletAddress) {
      res.status(401).json({ error: "Unauthorized: Invalid token payload" });
      return;
    }
    (req as AuthedRequest).userWallet = decoded.walletAddress.toLowerCase();
    next();
  } catch (err) {
    res.status(401).json({
      error: "Unauthorized: Token verification failed",
      details: err instanceof Error ? err.message : "Expired or invalid signature",
    });
  }
}

/**
 * Asserts that the target wallet requested matches the authenticated user's wallet.
 * Prevents IDOR vulnerabilities.
 */
export function assertWalletScope(req: AuthedRequest, targetWallet: string): void {
  const expected = req.userWallet.toLowerCase();
  const actual = normalizeWallet(targetWallet);

  if (!expected || !actual || expected !== actual) {
    throw new AuthError(403, `Forbidden: Wallet scope mismatch. Authenticated as ${expected}, requested ${actual}`);
  }
}

/**
 * If Bearer token is present and valid, attach req.userWallet; otherwise continue without it.
 * Invalid/expired tokens are ignored (fail-open) so demo read paths still work with stale JWTs.
 */
export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    next();
    return;
  }

  const token = authHeader.split(" ")[1];
  try {
    const decoded = verifyAuthToken(token);
    if (decoded?.walletAddress) {
      (req as OptionalAuthedRequest).userWallet = decoded.walletAddress.toLowerCase();
    }
  } catch {
    // Stale or invalid JWT — treat as unauthenticated for read routes
  }
  next();
}

/**
 * Read access truth table:
 * - No JWT + demo wallet → allow
 * - No JWT + other wallet → 401
 * - Valid JWT + same wallet → allow
 * - Valid JWT + different wallet → 403
 */
export function enforceReadAccess(req: OptionalAuthedRequest, targetWallet: string): void {
  const wallet = normalizeWallet(targetWallet);
  if (!wallet.startsWith("0x") || wallet.length !== 42) {
    throw new AuthError(401, "Unauthorized: Invalid wallet address");
  }

  if (req.userWallet) {
    assertWalletScope(req as AuthedRequest, wallet);
    return;
  }

  if (!isDemoWallet(wallet)) {
    throw new AuthError(401, "Unauthorized: Sign in with Ethereum to view this wallet");
  }
}

export function isUnauthenticatedDemoRead(req: OptionalAuthedRequest, targetWallet: string): boolean {
  return !req.userWallet && isDemoWallet(targetWallet);
}
