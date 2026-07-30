import { Request, Response, NextFunction } from "express";
import jwt, { type SignOptions } from "jsonwebtoken";

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
  const expected = (req.userWallet || "").toLowerCase();
  const actual = (targetWallet || "").toLowerCase();

  if (!expected || !actual || expected !== actual) {
    throw new AuthError(403, `Forbidden: Wallet scope mismatch. Authenticated as ${expected}, requested ${actual}`);
  }
}
