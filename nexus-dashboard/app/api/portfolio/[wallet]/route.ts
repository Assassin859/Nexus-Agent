import { NextRequest, NextResponse } from "next/server";

export async function GET(
  req: NextRequest,
  { params }: { params: { wallet: string } }
) {
  try {
    const agentUrl = process.env.NEXT_PUBLIC_AGENT_URL || "http://localhost:3001";
    const res = await fetch(`${agentUrl}/api/portfolio/${params.wallet}`, {
      next: { revalidate: 30 }, // Cache 30 seconds
    });
    if (!res.ok) throw new Error(`Agent returned ${res.status}`);
    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    // Agent offline — return error signal so UI shows "Degraded" rather than fake data
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
