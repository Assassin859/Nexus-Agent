import "../lib/env.js";
import { generateAuthToken } from "../middleware/auth.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const wallet = (process.env.NEXT_PUBLIC_WALLET_ADDRESS || "0x89f97Cb35236a1d0190FB25B31C5C0fF4107Ec1b").toLowerCase();
const agentUrl = process.env.AGENT_URL || "http://localhost:3001";
const token = generateAuthToken(wallet);
const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

console.log("=== E2E AUDIT ===");
console.log("Agent:", agentUrl);
console.log("Wallet:", wallet);

// Portfolio / HF
const portfolio = await fetch(`${agentUrl}/api/portfolio/${wallet}`, { headers });
const pf = await portfolio.json();
console.log("\n--- Portfolio ---");
console.log(JSON.stringify({
  healthFactor: pf.healthFactor,
  collateralUSD: pf.collateralUSD,
  debtUSD: pf.debtUSD,
  ltv: pf.ltv,
  agenticBalance: pf.agenticBalance,
}, null, 2));

// Feed
const feed = await fetch(`${agentUrl}/api/feed/${wallet}`, { headers });
const feedData = await feed.json();
const recent = (feedData.feed || feedData || []).slice(0, 8);
console.log("\n--- Recent Feed (8) ---");
for (const row of recent) {
  const wf = row.aiAnalysis?.workflowId ?? row.aiAnalysis?.keeperhubWorkflowId ?? null;
  console.log(`[${row.status}] ${row.action} amt=${row.amount} tx=${row.txHash || "none"} wf=${wf || "none"}`);
  if (row.status === "reverted_simulation") console.log(`  sim: ${row.reason?.slice(0, 100)}`);
}

// Chat tools smoke
const chatTests = [
  "what is my health factor?",
  "list my active workflows",
  "show recent transactions",
];
console.log("\n--- Chat Smoke ---");
for (const msg of chatTests) {
  const res = await fetch(`${agentUrl}/api/chat`, {
    method: "POST",
    headers,
    body: JSON.stringify({ userMessage: msg, conversationHistory: [] }),
  });
  const data = await res.json();
  const tools = (data.toolResults || []).map((t: any) => t.toolName || t.name).filter(Boolean);
  console.log(`Q: ${msg}`);
  console.log(`  tools: ${tools.join(", ") || "none"} | reply: ${(data.reply || "").slice(0, 100).replace(/\n/g, " ")}`);
}

// KeeperHub workflows
const key = process.env.KEEPERHUB_API_KEY!;
const transport = new StreamableHTTPClientTransport(
  new URL(process.env.KEEPERHUB_MCP_URL || "https://app.keeperhub.com/mcp"),
  { requestInit: { headers: { Authorization: `Bearer ${key}` } } }
);
const client = new Client({ name: "audit", version: "1.0.0" });
await client.connect(transport);
const listed = await client.callTool({ name: "list_workflows", arguments: { limit: 20 } });
const workflows = JSON.parse((listed as any).content[0].text);
console.log(`\n--- KeeperHub Workflows (${workflows.length}) ---`);
for (const w of workflows.slice(0, 15)) {
  console.log(`  ${w.id} | ${w.name} | enabled=${w.enabled}`);
}
await client.close();

// Status buckets
const all = feedData.feed || feedData || [];
const buckets: Record<string, number> = {};
for (const r of all) buckets[r.status] = (buckets[r.status] || 0) + 1;
console.log("\n--- Simulation / Status Buckets ---");
console.log(buckets);
