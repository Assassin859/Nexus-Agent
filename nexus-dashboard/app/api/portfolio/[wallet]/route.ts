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
    // Fallback: return safe demo data so dashboard never breaks
    return NextResponse.json({
      walletAddress: params.wallet,
      healthFactor: 99,
      collateralUSD: 12400,
      debtUSD: 6600,
      availableBorrowsUSD: 2800,
      ltvPercent: 53.2,
      usdcWalletBalance: 500,
      currentUSDCSupplyAPY: 4.2,
      workflows: [],
      _fallback: true,
      _error: err instanceof Error ? err.message : "Agent offline",
    });
  }
}
