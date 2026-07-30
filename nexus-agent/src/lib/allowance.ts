import { Contract } from "ethers";
import { getProvider } from "./rpc.js";
import { encodeERC20Approve, USDC_SEPOLIA } from "./calldata.js";

const ERC20_ALLOWANCE_ABI = [
  "function allowance(address owner, address spender) view returns (uint256)",
];

/**
 * Checks if signerWallet has sufficient ERC20 allowance for spender.
 * Returns approval calldata targeting uint256.max if allowance is insufficient, or null if sufficient.
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

    // 1 USDC = 1e6 units
    const requiredUnits = BigInt(Math.ceil(amountUSD * 1e6));

    if (BigInt(currentAllowance) < requiredUnits) {
      console.log(`[ALLOWANCE] ${signerWallet.slice(0, 8)} allowance for ${spenderAddress.slice(0, 8)} is ${currentAllowance} < ${requiredUnits}. Generating uint256.max approve calldata.`);
      // Approve max uint256 once to prevent repeated approval steps
      const MAX_UINT256 = (1n << 256n) - 1n;
      return encodeERC20Approve(tokenAddress, spenderAddress, MAX_UINT256);
    }
  } catch (err) {
    console.warn(`[ALLOWANCE] Failed to query allowance for ${signerWallet.slice(0, 8)}:`, err);
  }

  return null;
}
