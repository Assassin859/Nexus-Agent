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
      return NextResponse.json({ error: "Unauthorized: Sign in required" }, { status: 401 });
    }

    if (!res.ok) throw new Error(`Agent returned ${res.status}`);
    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: "Failed to fetch execution log feed" }, { status: 500 });
  }
}
