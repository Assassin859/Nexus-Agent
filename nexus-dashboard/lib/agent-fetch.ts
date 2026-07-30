/**
 * Utility for authenticated requests from the dashboard.
 */

// Direct fetch to nexus-agent backend server
export function agentFetch(
  path: string,
  init: RequestInit = {},
  authToken?: string | null
): Promise<Response> {
  const agentUrl = process.env.NEXT_PUBLIC_AGENT_URL || "http://localhost:3001";
  const token = authToken || (typeof window !== "undefined" ? localStorage.getItem("nexus_auth_token") : null);

  const headers = new Headers(init.headers || {});
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  return fetch(`${agentUrl}${path}`, {
    ...init,
    headers,
  });
}

// Relative fetch to Next.js API proxy routes (/api/*)
export function proxyFetch(
  path: string,
  init: RequestInit = {},
  authToken?: string | null
): Promise<Response> {
  const token = authToken || (typeof window !== "undefined" ? localStorage.getItem("nexus_auth_token") : null);

  const headers = new Headers(init.headers || {});
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  return fetch(path, {
    ...init,
    headers,
  });
}
