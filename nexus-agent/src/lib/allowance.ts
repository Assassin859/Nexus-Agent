import { Contract } from "ethers";
import { getProvider } from "./rpc.js";
import { encodeERC20Approve } from "./calldata.js";
import { childLogger } from "./logger.js";

const alLog = childLogger({ module: "allowance" });

const ERC20_ALLOWANCE_ABI = [
  "function allowance(address owner, address spender) view returns (uint256)",
];

/**
 * Checks if signerWallet has sufficient ERC20 allowance for spender.
 * Returns approval calldata capped at (amount * 1.10) if allowance is insufficient, or null if sufficient.
 */
export async function ensureAllowance(
  signerWallet: string,
  tokenAddress: string,
  spenderAddress: string,
  amountUSD: number
): Promise<string | null> {
  if (!signerWallet || !tokenAddress || !spenderAddress) return null;

  try {
    const provider = await getProvider();
    const token = new Contract(tokenAddress, ERC20_ALLOWANCE_ABI, provider);
    const currentAllowance = await token.allowance(signerWallet.toLowerCase(), spenderAddress.toLowerCase());

    // 1 USDC = 1e6 units; approve exact required units (with 10% safety buffer) rather than infinite uint256.max
    const requiredUnits = BigInt(Math.ceil(amountUSD * 1.10 * 1e6));

    if (BigInt(currentAllowance) < requiredUnits) {
      alLog.info(
        { wallet: signerWallet.slice(0, 8), spender: spenderAddress.slice(0, 8), currentAllowance: String(currentAllowance), requiredUnits: String(requiredUnits) },
        `[ALLOWANCE] Generating exact capped approve calldata ($${(amountUSD * 1.1).toFixed(2)} USDC)`
      );
      return encodeERC20Approve(tokenAddress, spenderAddress, requiredUnits);
    }
  } catch (err) {
    alLog.warn({ wallet: signerWallet.slice(0, 8), err }, "[ALLOWANCE] Failed to query allowance");
  }

  return null;
}
