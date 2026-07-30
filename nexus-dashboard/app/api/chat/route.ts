import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const agentUrl = process.env.NEXT_PUBLIC_AGENT_URL || "http://localhost:3001";
    const authHeader = req.headers.get("authorization");
    const body = await req.json();

    const res = await fetch(`${agentUrl}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(authHeader ? { Authorization: authHeader } : {}),
      },
      body: JSON.stringify(body),
    });

    if (res.status === 401) {
      return NextResponse.json({ reply: "🔒 Please sign in with your Web3 wallet to interact with the NexusAgent decision engine." }, { status: 401 });
    }

    if (!res.ok) throw new Error(`Agent returned ${res.status}`);
    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { reply: "Error communicating with backend agent server. Please check backend logs." },
      { status: 500 }
    );
  }
}
