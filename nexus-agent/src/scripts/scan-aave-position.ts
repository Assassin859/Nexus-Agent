import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { JsonRpcProvider, Contract } from "ethers";

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../.env") });

const POOL_ABI = [
  "function getUserAccountData(address user) view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)",
];

const NETWORKS = [
  { name: "Base Sepolia Aave V3.2 (Primary)", rpc: process.env.ALCHEMY_RPC_URL || "https://sepolia.base.org", pool: "0x8bAB6d1b75f19e9eD9fCe8b9BD338844fF79aE27" },
  { name: "Base Sepolia Legacy (0x07eA...)", rpc: "https://sepolia.base.org", pool: "0x07eA79F68B2B3df564D0A34F8e19D9B1e339814b" },
  { name: "Base Mainnet (Aave V3)", rpc: "https://mainnet.base.org", pool: "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5" },
];

const WALLET = "0x89f97Cb35236a1d0190FB25B31C5C0fF4107Ec1b";

async function scan() {
  console.log(`🔍 Scanning Aave V3 pools across networks for wallet: ${WALLET}\n`);
  for (const net of NETWORKS) {
    try {
      const provider = new JsonRpcProvider(net.rpc);
      const pool = new Contract(net.pool, POOL_ABI, provider);
      const res = await pool.getUserAccountData(WALLET);
      const collateral = Number(res.totalCollateralBase) / 1e8;
      const debt = Number(res.totalDebtBase) / 1e8;
      const hf = debt > 0 ? Number(res.healthFactor) / 1e18 : null;
      console.log(`[${net.name}]`);
      console.log(`  -> Collateral: $${collateral.toFixed(2)} | Debt: $${debt.toFixed(2)} | Health Factor: ${hf ? hf.toFixed(2) : "N/A"}`);
    } catch (err) {
      console.log(`[${net.name}] Error: ${(err as Error).message}`);
    }
  }
}

scan();
