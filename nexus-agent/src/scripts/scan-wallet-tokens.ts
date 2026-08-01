import "../lib/env.js";
import { getProvider } from "../lib/rpc.js";
import { Contract, formatEther } from "ethers";
import { getAavePosition, getUsdcBalance } from "../lib/aave.js";
import { USDC_SEPOLIA } from "../lib/calldata.js";

const ERC20 = [
  "function balanceOf(address) view returns (uint256)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
];

// Common Base Sepolia test tokens (may vary)
const TOKENS: Record<string, string | null> = {
  USDC: USDC_SEPOLIA,
  USDT: "0x4200000000000000000000000000000000000006", // often WETH on Base - verify
  DAI: null,
};

// Base Sepolia canonical USDbC / USDC variants - scan known addresses
const CANDIDATES = [
  { label: "USDC (project)", address: USDC_SEPOLIA },
  { label: "USDbC (Base canonical)", address: "0x036CbD53842c5426634e7929541eC2318f3dCF7e" },
  { label: "USDT (common test)", address: "0xf175520d9062fd6941a0777a507b2dd71345417b" },
];

const monitored = (process.env.NEXT_PUBLIC_WALLET_ADDRESS || "").toLowerCase();
const agentic = (process.env.AGENTIC_WALLET_ADDRESS || "").toLowerCase();

async function balances(addr: string, name: string) {
  const provider = await getProvider();
  console.log(`\n=== ${name} (${addr}) ===`);
  console.log("ETH:", formatEther(await provider.getBalance(addr)));
  for (const t of CANDIDATES) {
    try {
      const c = new Contract(t.address, ERC20, provider);
      const [raw, dec, sym] = await Promise.all([
        c.balanceOf(addr),
        c.decimals(),
        c.symbol().catch(() => t.label),
      ]);
      const bal = Number(raw) / 10 ** Number(dec);
      if (bal > 0) console.log(`${sym}: ${bal.toFixed(4)} (${t.label})`);
    } catch {}
  }
  console.log("USDC (project token):", await getUsdcBalance(addr));
}

console.log("Network: Base Sepolia (via ALCHEMY_RPC_URL)");
await balances(monitored, "MetaMask / monitored");
await balances(agentic, "Agentic / executor");

const pos = await getAavePosition(monitored);
console.log("\n=== Aave position (monitored) ===");
console.log(`HF: ${pos.healthFactor?.toFixed(3)} | Collateral: $${pos.collateralUSD.toFixed(0)} | Debt: $${pos.debtUSD.toFixed(0)}`);
console.log(`Wallet USDC: $${pos.usdcWalletBalance.toFixed(2)} | Supplied USDC: $${pos.usdcSuppliedAmount.toFixed(2)}`);
