import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { JsonRpcProvider, Contract } from "ethers";

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../.env") });

const POOL_ABI = [
  "function getUserAccountData(address user) view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)",
];

const POOLS = [
  { name: "Base Sepolia V3.2", pool: "0x8bAB6d1b75f19e9eD9fCe8b9BD338844fF79aE27" },
  { name: "Base Sepolia Legacy", pool: "0x07eA79F68B2B3df564D0A34F8e19D9B1e339814b" },
];

const WALLET = "0x89f97Cb35236a1d0190FB25B31C5C0fF4107Ec1b";

async function test() {
  const rpcUrl = process.env.ALCHEMY_RPC_URL || "https://sepolia.base.org";
  console.log(`[RPC] Using endpoint: ${rpcUrl.substring(0, 45)}...`);
  const provider = new JsonRpcProvider(rpcUrl);

  for (const item of POOLS) {
    try {
      const contract = new Contract(item.pool, POOL_ABI, provider);
      const res = await contract.getUserAccountData(WALLET);
      const collateral = Number(res.totalCollateralBase) / 1e8;
      const debt = Number(res.totalDebtBase) / 1e8;
      const hf = debt > 0 ? Number(res.healthFactor) / 1e18 : null;
      console.log(`[${item.name} - ${item.pool}]`);
      console.log(`  -> Collateral: $${collateral.toFixed(2)} | Debt: $${debt.toFixed(2)} | Health Factor: ${hf ? hf.toFixed(2) : "N/A"}`);
    } catch (e) {
      console.log(`[${item.name}] Error: ${(e as Error).message}`);
    }
  }
}

test();
