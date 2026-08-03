/**
 * One paid marketplace call via @keeperhub/wallet (separate buyer, not org kh_ key).
 * Proves Base mainnet x402 USDC settlement for nexus-guardian-hf-read (~$0.01).
 *
 * Prerequisites:
 *   npx -p @keeperhub/wallet keeperhub-wallet skill install
 *   Fund ~/.keeperhub/wallet.json address with ≥ $0.05 USDC on Base mainnet (8453)
 *
 * Usage: pnpm --prefix nexus-agent run marketplace:x402-proof
 */
import { ethers } from "ethers";
import "../lib/env.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { HF_READ_LISTING_SLUG } from "../lib/hf-read-workflow.js";
import { logExternalExecution } from "../lib/log-external-execution.js";
import { parseMcpToolContent } from "../lib/mcp-client.js";
import { parseHfMarketplaceResult } from "../lib/parse-hf-marketplace.js";
import {
  BASE_MAINNET_CHAIN_ID,
  baseMainnetTxUrl,
  X402_PROOF_TX,
} from "../lib/tier2-proofs.js";

const monitoredWallet = (
  process.env.NEXT_PUBLIC_WALLET_ADDRESS || "0x89f97Cb35236a1d0190FB25B31C5C0fF4107Ec1b"
).toLowerCase();

const MIN_BASE_USDC = 0.01;

type WalletBalance = {
  base?: { amount?: string | number; address?: string };
  tempo?: { amount?: string | number; address?: string };
};

type CallWorkflowResult = {
  paid?: boolean;
  protocolUsed?: string;
  executionId?: string;
  paymentDetails?: Record<string, unknown>;
  bodyText?: string;
  status?: number;
};

function parseToolJson(result: unknown): Record<string, unknown> {
  return parseMcpToolContent<Record<string, unknown>>(result) ?? {};
}

function coerceUsdAmount(val: unknown): number {
  if (typeof val === "number" && Number.isFinite(val)) return val;
  if (typeof val === "string" && val.trim() !== "") {
    const n = Number(val);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function extractPaymentTxHash(data: Record<string, unknown>): string | null {
  const details = data.paymentDetails;
  if (details && typeof details === "object") {
    const d = details as Record<string, unknown>;
    for (const key of ["txHash", "transactionHash", "settlementTxHash", "hash"]) {
      const v = d[key];
      if (typeof v === "string" && /^0x[a-fA-F0-9]{64}$/.test(v)) return v;
    }
  }
  const json = JSON.stringify(data);
  const match = json.match(/0x[a-fA-F0-9]{64}/);
  return match?.[0] ?? null;
}

const BASE_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const BASE_RPC = process.env.BASE_MAINNET_RPC_URL || "https://mainnet.base.org";

function parseBodyText(bodyText: unknown): unknown {
  if (typeof bodyText !== "string" || !bodyText.trim()) return null;
  const trimmed = bodyText.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return null;
    }
  }
  return null;
}

/** Fallback when @keeperhub/wallet omits paymentDetails (KEEP-554). */
async function fetchRecentX402PaymentTx(buyerAddress: string): Promise<string | null> {
  try {
    const provider = new ethers.JsonRpcProvider(BASE_RPC);
    const usdc = new ethers.Contract(
      BASE_USDC,
      ["event Transfer(address indexed from, address indexed to, uint256 value)"],
      provider,
    );
    const block = await provider.getBlockNumber();
    const logs = await usdc.queryFilter(
      usdc.filters.Transfer(buyerAddress, null),
      block - 9999,
      block,
    );
    const out = logs.filter((l) => {
      const value = l.args?.value as bigint | undefined;
      return value !== undefined && value > 0n;
    });
    if (out.length === 0) return null;
    return out[out.length - 1]!.transactionHash;
  } catch {
    return null;
  }
}

async function withWalletMcp<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const transport = new StdioClientTransport({
    command: "npx",
    args: ["-y", "-p", "@keeperhub/wallet", "keeperhub-wallet-mcp"],
    stderr: "pipe",
  });
  const client = new Client({ name: "nexus-x402-proof", version: "1.0.0" });
  await client.connect(transport);
  try {
    return await fn(client);
  } finally {
    await client.close();
  }
}

async function main() {
  console.log("=================================================");
  console.log("NexusAgent — Base mainnet x402 marketplace proof");
  console.log("=================================================\n");
  console.log(`Listing slug: ${HF_READ_LISTING_SLUG}`);
  console.log(`Monitored wallet (HF read): ${monitoredWallet}`);
  console.log(`Payment chain: Base mainnet (${BASE_MAINNET_CHAIN_ID})\n`);

  if (X402_PROOF_TX) {
    console.log(`Existing proof tx: ${X402_PROOF_TX}`);
    console.log(`  ${baseMainnetTxUrl(X402_PROOF_TX)}`);
    console.log("\nRe-run will attempt another paid call unless you unset X402_PROOF_TX_HASH.\n");
  }

  await withWalletMcp(async (client) => {
    console.log("Wallet MCP connected (@keeperhub/wallet via npx)\n");

    const infoResult = await client.callTool({ name: "info", arguments: {} });
    const info = parseToolJson(infoResult);
    const buyerAddress =
      typeof info.walletAddress === "string" ? info.walletAddress : null;
    if (!buyerAddress) {
      console.error("Could not read buyer walletAddress from info tool");
      console.error(JSON.stringify(infoResult, null, 2));
      process.exit(1);
    }
    console.log(`Buyer wallet: ${buyerAddress}`);

    const balanceResult = await client.callTool({ name: "balance", arguments: {} });
    const balance = parseToolJson(balanceResult) as WalletBalance;
    const baseUsdc = coerceUsdAmount(balance.base?.amount);
    console.log(`Base USDC balance: $${baseUsdc.toFixed(4)}`);

    if (baseUsdc < MIN_BASE_USDC) {
      console.error("\n❌ INSUFFICIENT_FUNDS — fund buyer wallet on Base mainnet (8453):");
      console.error(`   Address: ${buyerAddress}`);
      console.error(`   Need ≥ $${MIN_BASE_USDC.toFixed(2)} USDC (recommend ≥ $0.05)`);
      console.error("   Onramp: Coinbase or bridge USDC to Base mainnet");
      console.error("\n   Install wallet (one-time): npx -p @keeperhub/wallet keeperhub-wallet skill install");
      process.exit(1);
    }

    console.log("\nCalling paid workflow (wallet auto-pay)...");
    let callResult: unknown;
    try {
      callResult = await client.callTool({
        name: "call_workflow",
        arguments: {
          slug: HF_READ_LISTING_SLUG,
          body: { walletAddress: monitoredWallet },
          paymentHint: "auto",
          responseFormat: "json",
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/INSUFFICIENT_FUNDS/i.test(msg)) {
        console.error("\n❌ INSUFFICIENT_FUNDS during payment:");
        console.error(`   Buyer: ${buyerAddress}`);
        console.error("   Fund with USDC on Base mainnet and retry.");
        process.exit(1);
      }
      throw err;
    }

    const parsed = parseToolJson(callResult) as CallWorkflowResult & {
      code?: string;
      message?: string;
    };
    console.log("\n--- call_workflow response ---");
    console.log(JSON.stringify(parsed, null, 2));

    if (parsed.code === "CHAIN_MISMATCH") {
      console.error("\n❌ CHAIN_MISMATCH — listing chain does not match payment rail.");
      console.error("   Fix: pnpm --prefix nexus-agent run marketplace:publish-hf");
      console.error("   (sets listing chain to 8453; execution stays on Base Sepolia 84532)");
      process.exit(1);
    }

    if (!parsed.paid) {
      console.error("\n❌ Payment not completed (paid !== true). Check response above.");
      console.error("   If 402 without retry, ensure @keeperhub/wallet is current.");
      process.exit(1);
    }

    let txHash = extractPaymentTxHash(parsed as Record<string, unknown>);
    if (!txHash && parsed.paid) {
      console.log("\n  paymentDetails missing — scanning recent Base USDC outflows...");
      txHash = await fetchRecentX402PaymentTx(buyerAddress);
    }
    if (!txHash) {
      console.error("\n❌ paid=true but no settlement tx hash in paymentDetails.");
      console.error("   Paste tx manually into X402_PROOF_TX_HASH after finding on BaseScan.");
      process.exit(1);
    }

    const bodyPayload = parseBodyText(parsed.bodyText);
    const hf = parseHfMarketplaceResult(bodyPayload ?? parsed);
    const executionId =
      typeof parsed.executionId === "string" ? parsed.executionId : undefined;

    console.log("\n✅ x402 payment settled on Base mainnet");
    console.log(`   Tx: ${txHash}`);
    console.log(`   BaseScan: ${baseMainnetTxUrl(txHash)}`);
    if (parsed.protocolUsed) console.log(`   Protocol: ${parsed.protocolUsed}`);
    if (executionId) console.log(`   Execution: ${executionId}`);
    if (hf.healthFactor !== null) console.log(`   Health factor: ${hf.healthFactor}`);

    const { inserted } = await logExternalExecution({
      userWallet: monitoredWallet,
      action: "marketplace_hf_read",
      amount: 1,
      status: "success",
      txHash,
      reason: "Base mainnet x402 paid HF-read marketplace call",
      aiAnalysis: {
        chainId: BASE_MAINNET_CHAIN_ID,
        source: "x402_paid_call",
        listingSlug: HF_READ_LISTING_SLUG,
        executionId,
        healthFactor: hf.healthFactor,
        explorerUrl: baseMainnetTxUrl(txHash),
        buyerWallet: buyerAddress.toLowerCase(),
      },
    });
    console.log(`\n  Feed log: ${inserted ? "inserted" : "already present"} in executions_log`);

    console.log("\n=================================================");
    console.log("Next steps:");
    console.log(`  export X402_PROOF_TX_HASH=${txHash}`);
    console.log(`  export NEXT_PUBLIC_X402_PROOF_TX=${txHash}`);
    console.log("  Redeploy agent + dashboard, then add README proof row.");
    console.log("=================================================\n");
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
