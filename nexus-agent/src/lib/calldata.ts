import { AbiCoder, parseUnits } from "ethers";

const abi = new AbiCoder();

// ─── Contract Addresses (Ethereum Sepolia) ────────────────────────────────────
export const AAVE_V3_POOL       = "0x6aE43d3271fF68408378A467c62b15264c8d77E4";
export const UNISWAP_V3_ROUTER  = "0xE592427A0AEce92De3Edee1F18E0157C05861564";
export const USDC_SEPOLIA       = "0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8";
export const WETH_SEPOLIA       = "0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9";
// Compound V3 cUSDCv3 on Sepolia (replaces Morpho which has no stable Sepolia deployment)
export const COMPOUND_V3_USDC  = "0xAec1F48e02Cfb822Be958B68C7957156EB3F0b6e";

// Aave interest rate mode: 1 = Stable, 2 = Variable
const VARIABLE_RATE = 2;

/**
 * Encodes an Aave V3 `repay(asset, amount, interestRateMode, onBehalfOf)` call.
 * Used by Guardian module when HF < 1.15.
 */
export function encodeAaveRepay(
  asset: string,
  amountUSD: number,
  onBehalfOf: string,
  decimals = 6  // USDC has 6 decimals
): string {
  const amountRaw = parseUnits(amountUSD.toFixed(decimals), decimals);
  // function repay(address asset, uint256 amount, uint256 interestRateMode, address onBehalfOf)
  const selector = "0x573ade81";
  const encoded = abi.encode(
    ["address", "uint256", "uint256", "address"],
    [asset, amountRaw, VARIABLE_RATE, onBehalfOf]
  );
  return selector + encoded.slice(2);
}

/**
 * Encodes an Aave V3 `withdraw(asset, amount, to)` call.
 * Used by Yield Rotator when withdrawing supplied assets from Aave V3.
 * Selector 0x69328dec -> withdraw(address asset, uint256 amount, address to)
 */
export function encodeAaveWithdraw(
  asset: string,
  amountUSD: number,
  to: string,
  decimals = 6
): string {
  const amountRaw = parseUnits(amountUSD.toFixed(decimals), decimals);
  const selector = "0x69328dec";
  const encoded = abi.encode(
    ["address", "uint256", "address"],
    [asset, amountRaw, to]
  );
  return selector + encoded.slice(2);
}


/**
 * Encodes an Aave V3 `supply(asset, amount, onBehalfOf, referralCode)` call.
 * Used by Guardian when supplying additional collateral.
 */
export function encodeAaveSupply(
  asset: string,
  amountUSD: number,
  onBehalfOf: string,
  decimals = 6
): string {
  const amountRaw = parseUnits(amountUSD.toFixed(decimals), decimals);
  // function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode)
  const selector = "0x617ba037";
  const encoded = abi.encode(
    ["address", "uint256", "address", "uint16"],
    [asset, amountRaw, onBehalfOf, 0]
  );
  return selector + encoded.slice(2);
}

/**
 * Encodes a Uniswap V3 `exactInputSingle(params)` call.
 * USDC → WETH with 0.3% fee pool, 0.5% max slippage.
 * Used by DCA module.
 */
export function encodeUniswapSwap(
  amountInUSD: number,
  recipient: string,
  maxSlippagePct = 0.5,
  ethPriceUSD = 3000
): string {
  const amountIn = parseUnits(amountInUSD.toFixed(6), 6); // USDC 6 decimals
  // amountOutMinimum: estimate WETH output using live Chainlink price, apply slippage tolerance
  const estimatedEthOut = amountInUSD / ethPriceUSD;
  const minEthOut = estimatedEthOut * (1 - maxSlippagePct / 100);
  const amountOutMinimum = parseUnits(minEthOut.toFixed(18), 18);
  const deadline = Math.floor(Date.now() / 1000) + 20 * 60; // 20 min from now

  // ExactInputSingleParams struct
  const params = {
    tokenIn: USDC_SEPOLIA,
    tokenOut: WETH_SEPOLIA,
    fee: 3000, // 0.3% pool
    recipient,
    deadline,
    amountIn,
    amountOutMinimum,
    sqrtPriceLimitX96: 0n,
  };

  // function exactInputSingle(ExactInputSingleParams calldata params)
  const selector = "0x414bf389";
  const encoded = abi.encode(
    ["tuple(address,address,uint24,address,uint256,uint256,uint256,uint160)"],
    [[
      params.tokenIn,
      params.tokenOut,
      params.fee,
      params.recipient,
      params.deadline,
      params.amountIn,
      params.amountOutMinimum,
      params.sqrtPriceLimitX96,
    ]]
  );
  return selector + encoded.slice(2);
}

/**
 * Encodes an ERC20 `transfer(to, amount)` call.
 * Used by PayChain module for recurring payroll transfers.
 */
export function encodeERC20Transfer(
  to: string,
  amountUSD: number,
  decimals = 6  // USDC default
): string {
  const amountRaw = parseUnits(amountUSD.toFixed(decimals), decimals);
  // function transfer(address to, uint256 amount)
  const selector = "0xa9059cbb";
  const encoded = abi.encode(["address", "uint256"], [to, amountRaw]);
  return selector + encoded.slice(2);
}

/**
 * Encodes Compound V3 `supply(asset, amount)` call.
 * Used by Yield Rotator when rotating from Aave → Compound.
 */
export function encodeCompoundSupply(
  asset: string,
  amountUSD: number,
  decimals = 6
): string {
  const amountRaw = parseUnits(amountUSD.toFixed(decimals), decimals);
  // function supply(address asset, uint amount)
  const selector = "0xf2b9fdb8";
  const encoded = abi.encode(["address", "uint256"], [asset, amountRaw]);
  return selector + encoded.slice(2);
}

/**
 * Encodes Compound V3 `withdraw(asset, amount)` call.
 * Used by Yield Rotator when rotating out of Compound.
 */
export function encodeCompoundWithdraw(
  asset: string,
  amountUSD: number,
  decimals = 6
): string {
  const amountRaw = parseUnits(amountUSD.toFixed(decimals), decimals);
  // function withdraw(address asset, uint amount)
  const selector = "0xf3fef3a3";
  const encoded = abi.encode(["address", "uint256"], [asset, amountRaw]);
  return selector + encoded.slice(2);
}
