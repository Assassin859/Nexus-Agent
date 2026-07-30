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
  // null when RPC fails (isError=true) or no active loan (isError=false)
  healthFactor: number | null;
  usdcWalletBalance: number;
  currentUSDCSupplyAPY: number;
  isError?: boolean;
  errorReason?: string;
};

/**
 * Standalone USDC balanceOf helper — reads balance of ANY address, reusing ERC20_ABI.
 * Returns 0 on RPC failure so callers don't need to guard.
 */
export async function getUsdcBalance(address: string): Promise<number> {
  try {
    const provider = await getProvider();
    const usdc = new Contract(USDC_SEPOLIA, ERC20_ABI, provider);
    const [raw, decimals] = await Promise.all([
      usdc.balanceOf(address),
      usdc.decimals(),
    ]);
    return Number(formatUnits(raw, Number(decimals)));
  } catch {
    return 0;
  }
}

/**
 * Fetches the live Aave V3 position for a wallet from Sepolia.
 *
 * Semantic returns:
 *   • RPC throws             → { isError: true,  healthFactor: null, ... }
 *   • No active loan         → { isError: false, healthFactor: null, collateralUSD: 0, debtUSD: 0, ... }
 *   • Active loan            → { isError: false, healthFactor: <number>, ... }
 */
export async function getAavePosition(walletAddress: string): Promise<AavePosition> {
  try {
    const provider = await getProvider();
    const pool = new Contract(AAVE_V3_POOL, POOL_ABI, provider);
    const usdc = new Contract(USDC_SEPOLIA, ERC20_ABI, provider);

    // Fetch account data + USDC wallet balance in parallel
    const [accountData, usdcRaw, usdcDecimals, reserveData] = await Promise.all([
      pool.getUserAccountData(walletAddress),
      usdc.balanceOf(walletAddress),
      usdc.decimals(),
      pool.getReserveData(USDC_SEPOLIA),
    ]);

    // Aave returns values in USD base units (8 decimals)
    const BASE = 1e8;
    const collateralUSD       = Number(accountData.totalCollateralBase) / BASE;
    const debtUSD             = Number(accountData.totalDebtBase) / BASE;
    const availableBorrowsUSD = Number(accountData.availableBorrowsBase) / BASE;
    const ltv                 = Number(accountData.ltv) / 100; // basis points → %

    // Wallet USDC balance (actual tokens held, not deposited)
    const usdcWalletBalance = Number(usdcRaw) / Math.pow(10, Number(usdcDecimals));

    // USDC Supply APY from reserve data.
    // currentLiquidityRate is in RAY (1e27) and represents the PER-SECOND interest rate.
    // Correct compounding: (1 + ratePerSecond)^secondsPerYear - 1
    const RAY = 1e27;
    const SECONDS_PER_YEAR = 365 * 24 * 3600;
    const ratePerSecond = Number(reserveData.currentLiquidityRate) / RAY;
    const currentUSDCSupplyAPY = (Math.pow(1 + ratePerSecond, SECONDS_PER_YEAR) - 1) * 100;

    // No active loan: both collateral and debt are zero
    if (collateralUSD === 0 && debtUSD === 0) {
      console.log(`[AAVE] Wallet ${walletAddress.slice(0, 8)}: No active Aave position. USDC Balance=$${usdcWalletBalance.toFixed(2)}`);
      return {
        collateralUSD: 0,
        debtUSD: 0,
        availableBorrowsUSD: 0,
        ltv: 0,
        healthFactor: null,
        usdcWalletBalance,
        currentUSDCSupplyAPY,
        isError: false,
      };
    }

    // Aave healthFactor has 18 decimal places
    const healthFactor = Number(accountData.healthFactor) / 1e18;
    console.log(`[AAVE] Wallet ${walletAddress.slice(0, 8)}: HF=${healthFactor.toFixed(2)} Collateral=$${collateralUSD.toFixed(0)} Debt=$${debtUSD.toFixed(0)} USDC Balance=$${usdcWalletBalance.toFixed(2)}`);

    return {
      collateralUSD,
      debtUSD,
      availableBorrowsUSD,
      ltv,
      healthFactor,
      usdcWalletBalance,
      currentUSDCSupplyAPY,
      isError: false,
    };
  } catch (err) {
    // RPC failure — return error sentinel so callers can display "Degraded / RPC Error"
    const errorReason = err instanceof Error ? err.message : "RPC Error";
    console.error(`[AAVE] RPC error for ${walletAddress.slice(0, 8)}:`, errorReason);
    return {
      collateralUSD: 0,
      debtUSD: 0,
      availableBorrowsUSD: 0,
      ltv: 0,
      healthFactor: null,
      usdcWalletBalance: 0,
      currentUSDCSupplyAPY: 0,
      isError: true,
      errorReason,
    };
  }
}
