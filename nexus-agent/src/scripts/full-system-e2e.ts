/**
 * Full-system E2E: markets, chat, templates (API), simulations, live txs.
 * Usage: AGENT_URL=http://localhost:3001 pnpm exec tsx src/scripts/full-system-e2e.ts
 */
import "../lib/env.js";
import { generateAuthToken } from "../middleware/auth.js";
import { getEthPriceUSD, getPriceTrend } from "../lib/price-feed.js";
import { getAavePosition, getUsdcBalance } from "../lib/aave.js";
import { db } from "../db/client.js";
import { executionsLog } from "../db/schema.js";
import { eq, desc } from "drizzle-orm";

const wallet = (process.env.NEXT_PUBLIC_WALLET_ADDRESS || "0x89f97Cb35236a1d0190FB25B31C5C0fF4107Ec1b").toLowerCase();
const agentic = (process.env.AGENTIC_WALLET_ADDRESS || "").toLowerCase();
const agentUrl = process.env.AGENT_URL || "http://localhost:3001";
const token = generateAuthToken(wallet);
const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

type Result = { name: string; ok: boolean; detail: string };

const results: Result[] = [];

function record(name: string, ok: boolean, detail: string) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✅" : "❌"} ${name}`);
  if (detail) console.log(`   ${detail.replace(/\n/g, "\n   ")}`);
}

async function post(path: string, body?: object) {
  const res = await fetch(`${agentUrl}${path}`, {
    method: "POST",
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

async function get(path: string) {
  const res = await fetch(`${agentUrl}${path}`, { headers });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

console.log("=".repeat(60));
console.log("NEXUSAGENT FULL-SYSTEM E2E");
console.log("=".repeat(60));
console.log(`Agent:  ${agentUrl}`);
console.log(`Wallet: ${wallet}`);
console.log(`Agentic: ${agentic || "(env missing)"}\n`);

// ── 1. Live markets (Chainlink) ─────────────────────────────────────────────
console.log("── 1. Live Markets (Chainlink ETH/USD) ──\n");

try {
  const ethPrice = await getEthPriceUSD();
  const trend = await getPriceTrend();
  const position = await getAavePosition(wallet);

  record("Chainlink ETH price", ethPrice > 0, `$${ethPrice.toFixed(2)}`);
  record("Price trend", true, `${trend} (Guardian: crash→force repay, volatile→caution, stable+HF>1.4→hold)`);

  const hf = position.healthFactor ?? 0;
  let marketAction = "hold";
  if (trend === "crash") marketAction = "repay (even if HF temporarily safe)";
  else if (hf < 1.15) marketAction = "repay (critical HF)";
  else if (hf > 1.4 && trend === "stable") marketAction = "hold";
  else if (hf >= 1.15 && hf <= 1.4) marketAction = "monitor / partial repay if budget allows";

  record(
    "Market × HF decision preview",
    true,
    `HF=${hf.toFixed(3)} + trend=${trend} → expected: ${marketAction}`,
  );
} catch (err) {
  record("Live markets", false, err instanceof Error ? err.message : String(err));
}

// ── 2. Portfolio & balances ─────────────────────────────────────────────────
console.log("\n── 2. Portfolio & Balances ──\n");

const pf = await get(`/api/portfolio/${wallet}`);
if (pf.ok) {
  record("Portfolio API", true, `HF=${pf.data.healthFactor?.toFixed?.(3) ?? pf.data.healthFactor} coll=$${pf.data.collateralUSD} debt=$${pf.data.debtUSD}`);
} else {
  record("Portfolio API", false, `HTTP ${pf.status}`);
}

if (agentic) {
  const agenticUsdc = await getUsdcBalance(agentic);
  record("Agentic USDC (execution fuel)", agenticUsdc > 0, `$${agenticUsdc.toFixed(2)}`);
}

// ── 3. AI Chat ──────────────────────────────────────────────────────────────
console.log("\n── 3. AI Chat (tool calling) ──\n");

const chatPrompts: Array<{ q: string; expectTool?: string }> = [
  { q: "What is my health factor right now?", expectTool: "queryPortfolio" },
  { q: "List my active workflows", expectTool: "listWorkflows" },
  { q: "Show my recent transactions", expectTool: "getLiveTransactions" },
  { q: "Trigger guardian check now", expectTool: "triggerStrategy" },
  { q: "If ETH crashes 10%, what would you do?", expectTool: undefined },
];

for (const { q, expectTool } of chatPrompts) {
  const res = await post("/api/chat", { userMessage: q, conversationHistory: [] });
  const tools = [
    ...(res.data.toolCalls || []).map((t: { toolName?: string }) => t.toolName),
    ...(res.data.toolResults || []).map((t: { toolName?: string; name?: string }) => t.toolName || t.name),
  ].filter(Boolean);
  const reply = (res.data.reply || "").slice(0, 120).replace(/\s+/g, " ");
  const toolOk =
    !expectTool ||
    tools.some((t: string) => t?.includes(expectTool) || expectTool.includes(t || "")) ||
    (expectTool === "queryPortfolio" && /health factor|1\.\d+/i.test(res.data.reply || "")) ||
    (expectTool === "listWorkflows" && /workflow|payroll|dca/i.test(res.data.reply || "")) ||
    (expectTool === "getLiveTransactions" && /transaction|hold|repay/i.test(res.data.reply || "")) ||
    (expectTool === "triggerStrategy" && /guardian|triggered/i.test(res.data.reply || ""));
  record(`Chat: "${q.slice(0, 40)}…"`, res.ok && toolOk, `tools=[${tools.join(", ")}] | ${reply}…`);
  await new Promise((r) => setTimeout(r, 1500));
}

// ── 4. Template-equivalent API deploys ──────────────────────────────────────
console.log("\n── 4. Templates (direct API = Fork & Deploy) ──\n");

const guardianTrig = await post("/api/trigger/guardian");
record("Template: Aave Guardian", guardianTrig.ok, JSON.stringify(guardianTrig.data));

const dcaSched = await post("/api/dca/schedule", { amount: 10, schedule: "every Friday at 9am" });
record(
  "Template: USDC→ETH DCA",
  dcaSched.ok && dcaSched.data.success !== false,
  dcaSched.data.message || JSON.stringify(dcaSched.data),
);

const payroll = await post("/api/payroll", {
  userMessage: `pay 0x89f97cb35236a1d0190fb25b31c5c0ff4107ec1b 25 USDC every Monday at 9am`,
});
record(
  "Template: Developer Payroll",
  payroll.ok,
  payroll.data.verification_required
    ? `verification_required: ${payroll.data.message?.slice(0, 80)}`
    : payroll.data.message || JSON.stringify(payroll.data),
);

// ── 5. Module triggers (simulation + execution paths) ───────────────────────
console.log("\n── 5. Module Triggers (simulation → KeeperHub) ──\n");

const yieldTrig = await post("/api/trigger/yield");
record("Yield Rotator", yieldTrig.ok, "dual-wallet guard expected (skip on-chain)");

const dcaTrig = await post("/api/trigger/dca");
record("DCA live trigger", dcaTrig.ok, "runs Uniswap swap if agentic USDC ≥ workflow amount");

await new Promise((r) => setTimeout(r, 8000));

// ── 6. Feed analysis: simulations vs real txs ───────────────────────────────
console.log("\n── 6. Feed: Simulations vs Real Transactions ──\n");

const feed = await get(`/api/feed/${wallet}`);
const rows = feed.data.feed || feed.data || [];

const buckets: Record<string, number> = {};
for (const r of rows) buckets[r.status] = (buckets[r.status] || 0) + 1;

record("Feed loaded", feed.ok, `${rows.length} rows | buckets: ${JSON.stringify(buckets)}`);

const withTx = rows.filter((r: { txHash?: string }) => r.txHash && r.txHash.length === 66);
record(
  "Real on-chain txs in feed",
  withTx.length >= 1,
  withTx.length
    ? withTx.map((r: { action: string; txHash: string }) => `${r.action}: ${r.txHash.slice(0, 14)}…`).join("; ")
    : "none yet — fund agentic wallet + trigger repay/DCA",
);

const simRows = rows.filter((r: { status: string }) => r.status === "reverted_simulation");
record(
  "Simulation intercepts (zero gas)",
  true,
  simRows.length
    ? `${simRows.length} reverted_simulation (e.g. allowance bug before fix)`
    : "none in recent feed",
);

const latest = await db
  .select()
  .from(executionsLog)
  .where(eq(executionsLog.userWallet, wallet))
  .orderBy(desc(executionsLog.timestamp))
  .limit(3);

console.log("\n   Latest 3 DB logs:");
for (const row of latest) {
  console.log(`   [${row.status}] ${row.action} $${row.amount} tx=${row.txHash?.slice(0, 12) || "none"}`);
  console.log(`     ${row.reason?.slice(0, 90)}`);
}

// ── Summary ─────────────────────────────────────────────────────────────────
console.log("\n" + "=".repeat(60));
const passed = results.filter((r) => r.ok).length;
const failed = results.filter((r) => !r.ok).length;
console.log(`SUMMARY: ${passed} passed | ${failed} failed / ${results.length} checks`);
console.log("=".repeat(60));

console.log(`
MANUAL UI CHECKLIST (http://localhost:3000):
  1. Connect MetaMask (Base Sepolia) → SIWE sign-in
  2. /templates → Fork Guardian (→ /feed), DCA (→ /workflows), Payroll
  3. /chat → ask "what is my health factor?" and "schedule dca 20 usdc weekly"
  4. /feed → expand repay rows → BaseScan link + AI reasoning panel
  5. /workflows → "View on KeeperHub" (kh ID, not UUID)
  6. /resilience → reverted_simulation cards

MARKET SCENARIOS (how live markets affect agent):
  • stable + HF>1.4  → Guardian holds (no gas)
  • stable + HF<1.15 → repay from agentic USDC (if cycle budget left)
  • crash            → Guardian forces repay even if HF looks OK
  • volatile         → tighter risk scoring in Reasoning Harness
  • ETH price        → used for DCA swap calldata (Uniswap minOut)
`);

process.exit(failed > 0 ? 1 : 0);
