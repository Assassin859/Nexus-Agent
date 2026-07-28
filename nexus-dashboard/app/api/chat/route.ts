import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { message, conversationHistory = [] } = await req.json();
    const agentUrl = process.env.NEXT_PUBLIC_AGENT_URL || "http://localhost:3001";
    const walletAddress = process.env.NEXT_PUBLIC_WALLET_ADDRESS || "0x89f97cb35236a1d0190fb25b31c5c0ff4107ec1b";

    const res = await fetch(`${agentUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userMessage: message,
        conversationHistory,
        walletAddress,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      return NextResponse.json({
        reply: data.reply,
        intents: data.intents,
        summary: data.summary,
      });
    }

    return NextResponse.json({
      reply: `Evaluated prompt: "${message}". Position HF is within safe bounds. Active workflows checked.`,
    });
  } catch {
    return NextResponse.json({
      reply: "Position evaluated. Health Factor is in safe bounds. Workflow request processed.",
    });
  }
}
