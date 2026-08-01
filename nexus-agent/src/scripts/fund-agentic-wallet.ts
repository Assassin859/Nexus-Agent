/**
 * Fund agentic wallet via KeeperHub MCP execute_transfer (org wallet → agentic).
 * Usage: FUND_USDC_AMOUNT=100 FUND_ETH_AMOUNT=0.05 pnpm exec tsx src/scripts/fund-agentic-wallet.ts
 */
import "../lib/env.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { getUsdcBalance } from "../lib/aave.js";
import { getProvider } from "../lib/rpc.js";
import { formatEther } from "ethers";

const key = process.env.KEEPERHUB_API_KEY!;
const agentic = process.env.AGENTIC_WALLET_ADDRESS!;
const chainId = process.env.KEEPERHUB_CHAIN_ID || "84532";
const usdcAmount = process.env.FUND_USDC_AMOUNT || "100";
const ethAmount = process.env.FUND_ETH_AMOUNT || "0.05";

const transport = new StreamableHTTPClientTransport(
  new URL(process.env.KEEPERHUB_MCP_URL || "https://app.keeperhub.com/mcp"),
  { requestInit: { headers: { Authorization: `Bearer ${key}` } } }
);
const client = new Client({ name: "fund", version: "1.0.0" });
await client.connect(transport);

console.log("Funding agentic wallet:", agentic, "on chain", chainId);

async function transfer(args: Record<string, string>) {
  const raw = await client.callTool({ name: "execute_transfer", arguments: args });
  const text = (raw as any).content?.[0]?.text ?? JSON.stringify(raw);
  console.log("\nexecute_transfer:", text.slice(0, 500));
  return text;
}

await transfer({
  chain_id: chainId,
  token_address: "0xba50Cd2A20f6DA35D788639E581bca8d0B5d4D5f",
  to_address: agentic,
  amount: usdcAmount,
});

await transfer({
  chain_id: chainId,
  to_address: agentic,
  amount: ethAmount,
});

await client.close();

const provider = await getProvider();
console.log("\n--- Balances (Base Sepolia RPC) ---");
console.log("ETH:", formatEther(await provider.getBalance(agentic)));
console.log("USDC:", await getUsdcBalance(agentic));

if ((await getUsdcBalance(agentic)) === 0) {
  console.log("\n⚠️  KeeperHub org wallet transfer failed or is empty.");
  console.log("   Manual fund: https://faucet.circle.com/ → Base Sepolia →", agentic);
  console.log("   Also grab ETH: https://portal.cdp.coinbase.com/products/faucet");
}
