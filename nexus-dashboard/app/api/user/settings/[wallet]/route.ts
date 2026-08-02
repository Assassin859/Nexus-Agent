import { NextRequest, NextResponse } from "next/server";
import { proxyToAgent } from "@/lib/agent-proxy";

export async function GET(
  req: NextRequest,
  { params }: { params: { wallet: string } },
) {
  try {
    const res = await proxyToAgent(req, `/api/user/settings/${params.wallet}`);
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Agent unreachable" },
      { status: 503 },
    );
  }
}
