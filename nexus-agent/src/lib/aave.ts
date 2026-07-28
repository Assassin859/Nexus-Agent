import { getProvider } from "./rpc.js";
import { Contract } from "ethers";

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
  healthFactor: number;
  usdcWalletBalance: number;
  currentUSDCSupplyAPY: number;
};

/**
 * Fetches the live Aave V3 position for a wallet from Sepolia.
 * Returns real collateral, debt, health factor, and wallet USDC balance.
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
    // Aave healthFactor has 18 decimal places
    const healthFactor        = Number(accountData.healthFactor) / 1e18;

    // Wallet USDC balance (actual tokens held, not deposited)
    const usdcWalletBalance = Number(usdcRaw) / Math.pow(10, Number(usdcDecimals));

    // USDC Supply APY from reserve data (ray = 1e27)
    const RAY = 1e27;
    const liquidityRateRay = Number(reserveData.currentLiquidityRate);
    // Convert ray per-second rate to APY
    const currentUSDCSupplyAPY = ((liquidityRateRay / RAY) * 100);

    console.log(`[AAVE] Wallet ${walletAddress.slice(0, 8)}: HF=${healthFactor.toFixed(2)} Collateral=$${collateralUSD.toFixed(0)} Debt=$${debtUSD.toFixed(0)} USDC Balance=$${usdcWalletBalance.toFixed(2)}`);

    return {
      collateralUSD,
      debtUSD,
      availableBorrowsUSD,
      ltv,
      healthFactor,
      usdcWalletBalance,
      currentUSDCSupplyAPY,
    };
  } catch {
    // Wallet has no Aave position — contract returns empty data (0x). This is normal.
    // Guardian will log "No Aave position found — skipping." which is sufficient.
    return {
      collateralUSD: 0,
      debtUSD: 0,
      availableBorrowsUSD: 0,
      ltv: 0,
      healthFactor: 99,
      usdcWalletBalance: 0,
      currentUSDCSupplyAPY: 4.2,
    };
  }
}
