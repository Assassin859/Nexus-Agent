import { NextRequest, NextResponse } from "next/server";

export async function GET(
  req: NextRequest,
  { params }: { params: { wallet: string } }
) {
  try {
    const agentUrl = process.env.NEXT_PUBLIC_AGENT_URL || "http://localhost:3001";
    const authHeader = req.headers.get("authorization");

    const res = await fetch(`${agentUrl}/api/portfolio/${params.wallet}`, {
      headers: {
        ...(authHeader ? { Authorization: authHeader } : {}),
      },
      next: { revalidate: 30 },
    });

    if (res.status === 401) {
      return NextResponse.json({ error: "Unauthorized: Sign in with Ethereum required", _unauthorized: true }, { status: 401 });
    }

    if (!res.ok) throw new Error(`Agent returned ${res.status}`);
    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({
      walletAddress: params.wallet,
      healthFactor: null,
      collateralUSD: 0,
      debtUSD: 0,
      availableBorrowsUSD: 0,
      ltvPercent: 0,
      usdcWalletBalance: 0,
      currentUSDCSupplyAPY: 0,
      isError: true,
      errorReason: err instanceof Error ? err.message : "Agent offline",
      workflows: [],
      _fallback: true,
    });
  }
}
