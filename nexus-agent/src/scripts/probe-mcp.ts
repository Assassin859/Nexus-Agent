/**
 * probe-mcp.ts
 * Directly tests the KeeperHub MCP connection and create_workflow tool.
 */
import "../lib/env.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createWorkflow } from "../lib/mcp-client.js";
import { encodeERC20Approve, USDC_SEPOLIA, AAVE_V3_POOL } from "../lib/calldata.js";

const MCP_URL = process.env.KEEPERHUB_MCP_URL || "https://app.keeperhub.com/mcp";
const API_KEY = process.env.KEEPERHUB_API_KEY || "";

console.log("=================================================");
console.log("🔍 KeeperHub MCP Direct Probe");
console.log(`📍 MCP URL: ${MCP_URL}`);
console.log(`🔑 API Key: ${API_KEY ? API_KEY.slice(0, 10) + "..." : "NOT SET"}`);
console.log("=================================================\n");

try {
  // Step 1: Connect
  process.stdout.write("Step 1: Connecting to MCP... ");
  const transport = new StreamableHTTPClientTransport(new URL(MCP_URL), {
    requestInit: API_KEY ? { headers: { Authorization: `Bearer ${API_KEY}` } } : undefined,
  });
  const client = new Client({ name: "nexus-agent-probe", version: "1.0.0" });
  await client.connect(transport);
  console.log("✅ Connected!");

  // Step 2: List available tools
  process.stdout.write("Step 2: Listing tools... ");
  const tools = await client.listTools();
  console.log(`✅ ${tools.tools.length} tools available:`);
  for (const t of tools.tools) {
    console.log(`   - ${t.name}: ${t.description?.slice(0, 60) || "(no desc)"}`);
  }

  // Step 3: Try create_workflow with a unique name
  const uniqueName = `probe-test-${Date.now()}`;
  console.log(`\nStep 3: Calling create_workflow (name: "${uniqueName}")...`);
  const calldata = encodeERC20Approve(USDC_SEPOLIA, AAVE_V3_POOL, 1);
  const { workflowId, isStub } = await createWorkflow({
    name: uniqueName,
    triggerType: "manual",
    steps: [{ type: "transaction", to: USDC_SEPOLIA, calldata, gasStrategy: "standard" }],
  });

  console.log("create_workflow result:", { workflowId, isStub });
  if (workflowId && !isStub) {
    console.log(`🔗 View on KeeperHub: https://app.keeperhub.com/workflows/${workflowId}`);
  } else if (isStub) {
    console.log("⚠️  Stub workflow ID — MCP create_workflow did not persist a real workflow.");
  }

  await client.close();
} catch (err) {
  console.error(`\n❌ Error: ${err instanceof Error ? err.message : String(err)}`);
  if (String(err).includes("401") || String(err).toLowerCase().includes("unauthorized")) {
    console.log("\n💡 Fix: The KEEPERHUB_API_KEY is invalid or the MCP requires a different auth method.");
    console.log("   → Go to https://app.keeperhub.com → Settings → API Keys → generate a new key");
    console.log("   → Update KEEPERHUB_API_KEY in .env and on Railway");
  } else if (String(err).includes("ENOTFOUND") || String(err).includes("ECONNREFUSED")) {
    console.log("\n💡 Fix: Cannot reach KeeperHub MCP endpoint");
    console.log("   → Check KEEPERHUB_MCP_URL in .env (default: https://app.keeperhub.com/mcp)");
  } else if (String(err).includes("invalid_token")) {
    console.log("\n💡 Fix: MCP requires Bearer auth with your API key");
    console.log("   → Set KEEPERHUB_API_KEY in .env (kh_... from app.keeperhub.com → Settings → API Keys)");
  }
}

process.exit(0);
