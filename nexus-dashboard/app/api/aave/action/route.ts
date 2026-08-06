import { NextRequest, NextResponse } from "next/server";

const AGENT_URL = process.env.NEXT_PUBLIC_AGENT_URL || "http://localhost:3001";

async function proxyPost(req: NextRequest, agentPath: string) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return NextResponse.json({ error: "Unauthorized: Missing auth token." }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const res = await fetch(`${AGENT_URL}${agentPath}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: authHeader,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

export async function POST(req: NextRequest) {
  try {
    return proxyPost(req, "/api/aave/action");
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Aave action proxy failed" },
      { status: 500 },
    );
  }
}
