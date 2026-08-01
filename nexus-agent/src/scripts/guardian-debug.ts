import "../lib/env.js";
import { generateAuthToken } from "../middleware/auth.js";
import { db } from "../db/client.js";
import { executionsLog } from "../db/schema.js";
import { desc, eq } from "drizzle-orm";
import { getUsdcBalance } from "../lib/aave.js";

const wallet = "0x89f97cb35236a1d0190fb25b31c5c0ff4107ec1b";
const agentic = process.env.AGENTIC_WALLET_ADDRESS!;
const token = generateAuthToken(wallet);

console.log("Agentic USDC:", await getUsdcBalance(agentic));

const r = await fetch("http://localhost:3001/api/trigger/guardian", {
  method: "POST",
  headers: { Authorization: `Bearer ${token}` },
});
console.log("trigger:", await r.json());

const [latest] = await db
  .select()
  .from(executionsLog)
  .where(eq(executionsLog.userWallet, wallet))
  .orderBy(desc(executionsLog.timestamp))
  .limit(1);

console.log("\nLatest log:", latest?.action, latest?.status, latest?.amount, latest?.txHash || "no-tx");
console.log("reason:", latest?.reason?.slice(0, 150));
const ai = latest?.aiAnalysis as any;
console.log("HF:", ai?.healthFactor);
console.log("LLM rec:", ai?.llmRecommendation);
console.log("Harness rec:", ai?.harnessRecommendation);
console.log("Override:", ai?.harnessOverride);
console.log("Candidates:", ai?.candidateActions?.map((c: any) => `${c.action} amt=${c.amount} eHF=${c.expectedHealthFactor} risk=${c.riskScore}`));
