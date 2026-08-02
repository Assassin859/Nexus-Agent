import { NextRequest, NextResponse } from "next/server";

export async function GET(
  req: NextRequest,
  { params }: { params: { wallet: string } }
) {
  try {
    const agentUrl = process.env.NEXT_PUBLIC_AGENT_URL || "http://localhost:3001";
    const authHeader = req.headers.get("authorization");

    const res = await fetch(`${agentUrl}/api/feed/${params.wallet}`, {
      headers: {
        ...(authHeader ? { Authorization: authHeader } : {}),
      },
    });

    if (res.status === 401) {
      return NextResponse.json({ error: "Unauthorized: Sign in required", _unauthorized: true }, { status: 401 });
    }

    if (res.status === 403) {
      return NextResponse.json({ error: "Forbidden: wallet scope mismatch", _forbidden: true }, { status: 403 });
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
      { error: err instanceof Error ? err.message : "Failed to fetch execution log feed", _agentError: true },
      { status: 503 },
    );
  }
}
