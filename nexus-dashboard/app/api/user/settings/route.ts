import { NextRequest, NextResponse } from "next/server";
import { proxyToAgent } from "@/lib/agent-proxy";

export async function POST(req: NextRequest) {
  try {
    const body = await req.text();
    const res = await proxyToAgent(req, "/api/user/settings", {
      method: "POST",
      body,
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Agent unreachable" },
      { status: 503 },
    );
  }
}
