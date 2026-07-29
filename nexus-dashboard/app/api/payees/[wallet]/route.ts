import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest, { params }: { params: { wallet: string } }) {
  const agentUrl = process.env.NEXT_PUBLIC_AGENT_URL || "http://localhost:3001";
  const res = await fetch(`${agentUrl}/api/payees/${params.wallet}`, {
    cache: "no-store",
    headers: { "Cache-Control": "no-cache" },
  });
  const data = await res.json();
  return NextResponse.json(data);
}
