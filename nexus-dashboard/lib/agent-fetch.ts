/**
 * Utility for authenticated requests from the dashboard.
 */

import { isDemoWallet, normalizeWallet } from "./demo-wallet";

export function clearStaleAuthToken(): void {
  if (typeof window !== "undefined") {
    localStorage.removeItem("nexus_auth_token");
  }
}

function isDemoReadRequest(path: string, init: RequestInit): boolean {
  const normalizedPath = path.split("?")[0];

  const portfolioMatch = normalizedPath.match(/^\/api\/portfolio\/(0x[a-fA-F0-9]{40})$/);
  if (portfolioMatch && isDemoWallet(normalizeWallet(portfolioMatch[1]))) {
    return true;
  }

  const feedMatch = normalizedPath.match(/^\/api\/feed\/(0x[a-fA-F0-9]{40})(?:\/stats)?$/);
  if (feedMatch && isDemoWallet(normalizeWallet(feedMatch[1]))) {
    return true;
  }

  if (normalizedPath === "/api/marketplace/hf-read" && init.method === "POST") {
    try {
      const body = typeof init.body === "string" ? JSON.parse(init.body) : null;
      if (body?.walletAddress && isDemoWallet(String(body.walletAddress))) {
        return true;
      }
    } catch {
      return false;
    }
  }

  if (normalizedPath === "/api/chat" && init.method === "POST") {
    try {
      const body = typeof init.body === "string" ? JSON.parse(init.body) : null;
      if (body?.walletAddress && isDemoWallet(String(body.walletAddress))) {
        return true;
      }
    } catch {
      return false;
    }
  }

  return false;
}

function pathFromFetchUrl(url: string): string {
  if (url.startsWith("/")) {
    return url.split("?")[0];
  }
  try {
    return new URL(url).pathname;
  } catch {
    return url.split("?")[0];
  }
}

async function fetchWithDemoRetry(
  url: string,
  init: RequestInit,
  authToken?: string | null,
): Promise<Response> {
  const token = authToken ?? (typeof window !== "undefined" ? localStorage.getItem("nexus_auth_token") : null);
  const headers = new Headers(init.headers || {});
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const res = await fetch(url, { ...init, headers });

  if (
    (res.status === 401 || res.status === 403) &&
    token &&
    typeof window !== "undefined" &&
    isDemoReadRequest(pathFromFetchUrl(url), init)
  ) {
    clearStaleAuthToken();
    const retryHeaders = new Headers(init.headers || {});
    return fetch(url, { ...init, headers: retryHeaders });
  }

  return res;
}

// Direct fetch to nexus-agent backend server
export function agentFetch(
  path: string,
  init: RequestInit = {},
  authToken?: string | null,
): Promise<Response> {
  const agentUrl = process.env.NEXT_PUBLIC_AGENT_URL || "http://localhost:3001";
  return fetchWithDemoRetry(`${agentUrl}${path}`, init, authToken);
}

// Relative fetch to Next.js API proxy routes (/api/*)
export function proxyFetch(
  path: string,
  init: RequestInit = {},
  authToken?: string | null,
): Promise<Response> {
  return fetchWithDemoRetry(path, init, authToken);
}
