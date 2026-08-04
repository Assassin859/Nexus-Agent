import { Interface, JsonRpcProvider, parseUnits } from "ethers";
import { USDC_SEPOLIA } from "./calldata.js";

const ERC20_TRANSFER_IFACE = new Interface([
  "event Transfer(address indexed from, address indexed to, uint256 value)",
]);

export type PayrollIndependentVerification = {
  verified: boolean;
  source: "base_sepolia_rpc";
  checkedAt: string;
  recipient?: string;
  amountUSD?: number;
  discrepancy?: string;
};

export type UsdcTransferLog = {
  from: string;
  to: string;
  value: bigint;
};

/** Pure helper for unit tests — match USDC Transfer log against expected payroll. */
export function evaluatePayrollTransfer(
  logs: UsdcTransferLog[],
  params: { from: string; to: string; amountUSD: number },
): Pick<PayrollIndependentVerification, "verified" | "discrepancy"> {
  const fromLower = params.from.toLowerCase();
  const toLower = params.to.toLowerCase();
  const expectedRaw = parseUnits(params.amountUSD.toFixed(6), 6);

  const match = logs.find(
    (log) =>
      log.from.toLowerCase() === fromLower &&
      log.to.toLowerCase() === toLower &&
      log.value === expectedRaw,
  );

  if (match) {
    return { verified: true };
  }

  return {
    verified: false,
    discrepancy: "No matching USDC Transfer log for recipient and amount on Base Sepolia",
  };
}

function parseUsdcTransferLogs(
  receiptLogs: ReadonlyArray<{ address: string; topics: readonly string[]; data: string }>,
): UsdcTransferLog[] {
  const usdc = USDC_SEPOLIA.toLowerCase();
  const parsed: UsdcTransferLog[] = [];

  for (const log of receiptLogs) {
    if (log.address.toLowerCase() !== usdc) continue;
    try {
      const event = ERC20_TRANSFER_IFACE.parseLog({
        topics: log.topics as string[],
        data: log.data,
      });
      if (event?.name !== "Transfer") continue;
      parsed.push({
        from: String(event.args[0]),
        to: String(event.args[1]),
        value: event.args[2] as bigint,
      });
    } catch {
      // skip non-Transfer logs
    }
  }

  return parsed;
}

/** Confirm USDC payroll landed at recipient via Base Sepolia RPC (not KeeperHub status). */
export async function verifyPayrollTransfer(params: {
  txHash: string;
  from: string;
  to: string;
  amountUSD: number;
  rpcUrl?: string;
}): Promise<PayrollIndependentVerification> {
  const checkedAt = new Date().toISOString();
  const rpc = params.rpcUrl || process.env.ALCHEMY_RPC_URL;
  if (!rpc) {
    return {
      verified: false,
      source: "base_sepolia_rpc",
      checkedAt,
      discrepancy: "ALCHEMY_RPC_URL not configured",
    };
  }

  try {
    const provider = new JsonRpcProvider(rpc);
    const receipt = await provider.getTransactionReceipt(params.txHash);
    if (!receipt || receipt.status !== 1) {
      return {
        verified: false,
        source: "base_sepolia_rpc",
        checkedAt,
        discrepancy: "Transaction not mined or reverted on Base Sepolia",
      };
    }

    const transferLogs = parseUsdcTransferLogs(receipt.logs);
    const result = evaluatePayrollTransfer(transferLogs, params);
    return {
      ...result,
      source: "base_sepolia_rpc",
      checkedAt,
      recipient: params.to,
      amountUSD: params.amountUSD,
    };
  } catch (err) {
    return {
      verified: false,
      source: "base_sepolia_rpc",
      checkedAt,
      discrepancy: err instanceof Error ? err.message : "Base Sepolia RPC receipt fetch failed",
    };
  }
}
