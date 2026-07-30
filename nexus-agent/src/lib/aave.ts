import { getProvider } from "./rpc.js";
import { Contract, formatUnits } from "ethers";

// Aave V3 Pool on Ethereum Sepolia (checksummed)
const AAVE_V3_POOL = "0x6aE43d3271fF68408378A467c62b15264c8d77E4";
const USDC_SEPOLIA  = "0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8"; // Aave testnet USDC

// Minimal ABI — only the functions we need
const POOL_ABI = [
  "function getUserAccountData(address user) view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)",
  "function getReserveData(address asset) view returns (tuple(uint256 configuration, uint128 liquidityIndex, uint128 currentLiquidityRate, uint128 variableBorrowIndex, uint128 currentVariableBorrowRate, uint128 currentStableBorrowRate, uint40 lastUpdateTimestamp, uint16 id, address aTokenAddress, address stableDebtTokenAddress, address variableDebtTokenAddress, address interestRateStrategyAddress, uint128 accruedToTreasury, uint128 unbacked, uint128 isolationModeTotalDebt))",
];

const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
];

export type AavePosition = {
  collateralUSD: number;
  debtUSD: number;
  availableBorrowsUSD: number;
  ltv: number;
  healthFactor: number | null;
  usdcWalletBalance: number;
  usdcSuppliedAmount: number;
  usdcSuppliedUSD: number;
  currentUSDCSupplyAPY: number;
  isError?: boolean;
  errorReason?: string;
};

/**
 * Standalone USDC balanceOf helper — reads balance of ANY address, reusing ERC20_ABI.
 * Returns 0 on RPC failure so callers don't need to guard.
 */
export async function getUsdcBalance(address: string): Promise<number> {
  if (!address) return 0;
  const target = address.toLowerCase();
  try {
    const provider = await getProvider();
    const usdc = new Contract(USDC_SEPOLIA, ERC20_ABI, provider);
    const [raw, decimals] = await Promise.all([
      usdc.balanceOf(target),
      usdc.decimals(),
    ]);
    return Number(raw) / Math.pow(10, Number(decimals));
  } catch (err) {
    console.warn(`[AAVE] getUsdcBalance failed for ${target.slice(0, 8)}:`, err);
    return 0;
  }
}

/**
 * Fetches the live Aave V3 position for a wallet from Sepolia.
 */
export async function getAavePosition(walletAddress: string): Promise<AavePosition> {
  const targetWallet = (walletAddress || "").toLowerCase();
  try {
    const provider = await getProvider();
    const pool = new Contract(AAVE_V3_POOL, POOL_ABI, provider);
    const usdc = new Contract(USDC_SEPOLIA, ERC20_ABI, provider);

    // Get reserve data to locate aToken address
    const reserveData = await pool.getReserveData(USDC_SEPOLIA);
    const aTokenAddress = reserveData.aTokenAddress;
    const aUsdc = new Contract(aTokenAddress, ERC20_ABI, provider);

    // Fetch account data, USDC wallet balance, aUSDC supply balance, and USDC decimals in parallel
    const [accountData, usdcRaw, aUsdcRaw, usdcDecimals] = await Promise.all([
      pool.getUserAccountData(targetWallet),
      usdc.balanceOf(targetWallet),
      aUsdc.balanceOf(targetWallet),
      usdc.decimals(),
    ]);

    // Aave returns values in USD base units (8 decimals)
    const BASE = 1e8;
    const collateralUSD       = Number(accountData.totalCollateralBase) / BASE;
    const debtUSD             = Number(accountData.totalDebtBase) / BASE;
    const availableBorrowsUSD = Number(accountData.availableBorrowsBase) / BASE;
    const ltv                 = Number(accountData.ltv) / 100;

    // Token & USD amounts for supplied USDC
    const decFactor = Math.pow(10, Number(usdcDecimals));
    const usdcWalletBalance = Number(usdcRaw) / decFactor;
    const usdcSuppliedAmount = Number(aUsdcRaw) / decFactor;
    // 1 USDC ~ $1 USD on Sepolia testnet
    const usdcSuppliedUSD = usdcSuppliedAmount;

    // USDC Supply APY from reserve data
    const RAY = 1e27;
    const SECONDS_PER_YEAR = 365 * 24 * 3600;
    const ratePerSecond = Number(reserveData.currentLiquidityRate) / RAY;
    const currentUSDCSupplyAPY = (Math.pow(1 + ratePerSecond, SECONDS_PER_YEAR) - 1) * 100;

    // No active loan: both collateral and debt are zero
    if (collateralUSD === 0 && debtUSD === 0 && usdcSuppliedAmount === 0) {
      console.log(`[AAVE] Wallet ${targetWallet.slice(0, 8)}: No active Aave position. USDC Balance=$${usdcWalletBalance.toFixed(2)}`);
      return {
        collateralUSD: 0,
        debtUSD: 0,
        availableBorrowsUSD: 0,
        ltv: 0,
        healthFactor: null,
        usdcWalletBalance,
        usdcSuppliedAmount: 0,
        usdcSuppliedUSD: 0,
        currentUSDCSupplyAPY,
        isError: false,
      };
    }

    const healthFactor = Number(accountData.healthFactor) / 1e18;
    console.log(`[AAVE] Wallet ${targetWallet.slice(0, 8)}: HF=${healthFactor.toFixed(2)} Collateral=$${collateralUSD.toFixed(0)} Debt=$${debtUSD.toFixed(0)} USDC Supplied=$${usdcSuppliedUSD.toFixed(2)} Wallet Balance=$${usdcWalletBalance.toFixed(2)}`);

    return {
      collateralUSD,
      debtUSD,
      availableBorrowsUSD,
      ltv,
      healthFactor: debtUSD > 0 ? healthFactor : null,
      usdcWalletBalance,
      usdcSuppliedAmount,
      usdcSuppliedUSD,
      currentUSDCSupplyAPY,
      isError: false,
    };
  } catch (err) {
    console.warn(`[AAVE] Position fetch failed for ${targetWallet.slice(0, 8)}:`, err);
    return {
      collateralUSD: 0,
      debtUSD: 0,
      availableBorrowsUSD: 0,
      ltv: 0,
      healthFactor: null,
      usdcWalletBalance: 0,
      usdcSuppliedAmount: 0,
      usdcSuppliedUSD: 0,
      currentUSDCSupplyAPY: 0,
      isError: true,
      errorReason: err instanceof Error ? err.message : String(err),
    };
  }
}
