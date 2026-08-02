import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const agentUrl = process.env.NEXT_PUBLIC_AGENT_URL || "http://localhost:3001";
    const authHeader = req.headers.get("authorization");
    const body = await req.json().catch(() => ({}));

    const res = await fetch(`${agentUrl}/api/marketplace/hf-read`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(authHeader ? { Authorization: authHeader } : {}),
      },
      body: JSON.stringify(body),
    });

    if (res.status === 401) {
      return NextResponse.json(
        { error: "Unauthorized: Sign in with Ethereum required", _unauthorized: true },
        { status: 401 },
      );
    }

    if (res.status === 403) {
      return NextResponse.json(
        { error: "Forbidden: wallet scope mismatch", _forbidden: true },
        { status: 403 },
      );
    }

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json(
        { error: data.error || `Agent returned ${res.status}`, _agentError: true },
        { status: res.status },
      );
    }

    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Agent unreachable",
        _agentError: true,
      },
      { status: 503 },
    );
  }
}
