import { NextResponse } from "next/server";

export async function GET() {
  try {
    const agentUrl = process.env.NEXT_PUBLIC_AGENT_URL || "http://localhost:3001";

    const res = await fetch(`${agentUrl}/api/markets`, {
      next: { revalidate: 60 },
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json(
        { error: data.error || `Agent returned ${res.status}` },
        { status: res.status },
      );
    }

    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Agent unreachable" },
      { status: 503 },
    );
  }
}
