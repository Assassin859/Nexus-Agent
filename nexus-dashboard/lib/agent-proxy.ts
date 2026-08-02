import { NextRequest } from "next/server";

export function agentBaseUrl(): string {
  return process.env.NEXT_PUBLIC_AGENT_URL || "http://localhost:3001";
}

export async function proxyToAgent(
  req: NextRequest,
  agentPath: string,
  init: RequestInit = {},
): Promise<Response> {
  const authHeader = req.headers.get("authorization");
  const headers = new Headers(init.headers || {});
  if (authHeader) headers.set("Authorization", authHeader);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  return fetch(`${agentBaseUrl()}${agentPath}`, {
    ...init,
    headers,
    cache: "no-store",
  });
}
