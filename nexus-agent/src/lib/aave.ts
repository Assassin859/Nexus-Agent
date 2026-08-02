import { getProvider } from "./rpc.js";
import { Contract } from "ethers";
import { AAVE_V3_POOL, USDC_SEPOLIA } from "./calldata.js";

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

export class BalanceQueryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BalanceQueryError";
  }
}

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
    throw new BalanceQueryError("USDC balance query failed — RPC unavailable.");
  }
}

export async function getAavePosition(walletAddress: string): Promise<AavePosition> {
  const targetWallet = (walletAddress || "").toLowerCase();
  try {
    const provider = await getProvider();
    const pool = new Contract(AAVE_V3_POOL, POOL_ABI, provider);
    const usdc = new Contract(USDC_SEPOLIA, ERC20_ABI, provider);

    // Primary RPC call: getUserAccountData (returns collateral, debt, borrow capacity, HF)
    const [accountData, usdcRaw, usdcDecimals] = await Promise.all([
      pool.getUserAccountData(targetWallet),
      usdc.balanceOf(targetWallet).catch(() => 0n),
      usdc.decimals().catch(() => 6),
    ]);

    const BASE = 1e8;
    const collateralUSD       = Number(accountData.totalCollateralBase) / BASE;
    const debtUSD             = Number(accountData.totalDebtBase) / BASE;
    const availableBorrowsUSD = Number(accountData.availableBorrowsBase) / BASE;
    const ltv                 = Number(accountData.ltv) / 100;
    const decFactor           = Math.pow(10, Number(usdcDecimals));
    const usdcWalletBalance   = Number(usdcRaw) / decFactor;

    // Optional reserve data for USDC aToken & APY
    let usdcSuppliedAmount = 0;
    let currentUSDCSupplyAPY = 0;
    try {
      const reserveData = await pool.getReserveData(USDC_SEPOLIA);
      if (reserveData && reserveData.aTokenAddress) {
        const aUsdc = new Contract(reserveData.aTokenAddress, ERC20_ABI, provider);
        const aUsdcRaw = await aUsdc.balanceOf(targetWallet).catch(() => 0n);
        usdcSuppliedAmount = Number(aUsdcRaw) / decFactor;

        const RAY = 1e27;
        const SECONDS_PER_YEAR = 365 * 24 * 3600;
        const ratePerSecond = Number(reserveData.currentLiquidityRate) / RAY;
        currentUSDCSupplyAPY = (Math.pow(1 + ratePerSecond, SECONDS_PER_YEAR) - 1) * 100;
      }
    } catch {
      // Reserve query fallback
    }

    const usdcSuppliedUSD = usdcSuppliedAmount;

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
