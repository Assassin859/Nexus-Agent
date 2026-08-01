import { NextRequest, NextResponse } from "next/server";

const AGENT_URL = process.env.NEXT_PUBLIC_AGENT_URL || "http://localhost:3001";

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return NextResponse.json({ error: "Unauthorized: Missing auth token." }, { status: 401 });
    }

    const body = await req.json();
    const userMessage =
      body.userMessage ||
      `pay ${body.recipient || body.recipientAddress} ${body.amount ?? 200} USDC ${body.schedule || "every Friday at 9am"}`;

    const res = await fetch(`${AGENT_URL}/api/payroll`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
      },
      body: JSON.stringify({ userMessage, ...body }),
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Payroll proxy failed" },
      { status: 500 },
    );
  }
}
