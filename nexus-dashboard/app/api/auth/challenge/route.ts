import { NextRequest, NextResponse } from "next/server";
import { proxyToAgent } from "@/lib/agent-proxy";

export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get("wallet");
  if (!wallet) {
    return NextResponse.json({ error: "wallet query param required" }, { status: 400 });
  }

  try {
    const res = await proxyToAgent(req, `/api/auth/challenge?wallet=${encodeURIComponent(wallet)}`);
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Agent unreachable" },
      { status: 503 },
    );
  }
}
