import http from "http";
import { ethers } from "ethers";

const PORT = 8545;

// Pre-funded test accounts with 10,000 ETH balance
const TEST_ACCOUNTS = [
  { address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", privateKey: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", balance: "10000.0" },
  { address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", privateKey: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d", balance: "10000.0" },
  { address: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC", privateKey: "0x5de4111daf927a755078a6afe56a590a30816d454188827eb53ff363d0859d00", balance: "10000.0" },
  { address: "0x90F79bf6EB2c4f870365E785982E1f101E93b906", privateKey: "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6", balance: "10000.0" },
  { address: "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65", privateKey: "0x47e179ec197488593b12f49a058b653814621104139f22b6008b861e67212548", balance: "10000.0" },
];

const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");

  if (req.method === "OPTIONS") {
    res.writeHead(200);
    return res.end();
  }

  let body = "";
  req.on("data", chunk => { body += chunk; });
  req.on("end", async () => {
    try {
      const payload = JSON.parse(body);
      const { method, params = [], id = 1 } = payload;
      let result = null;

      if (method === "eth_chainId") {
        result = "0x7a69"; // 31337
      } else if (method === "eth_blockNumber") {
        result = "0x1";
      } else if (method === "eth_getBalance") {
        const addr = params[0]?.toLowerCase();
        const account = TEST_ACCOUNTS.find(a => a.address.toLowerCase() === addr);
        if (account) {
          result = "0x" + ethers.parseEther(account.balance).toString(16);
        } else {
          result = "0x" + ethers.parseEther("1000.0").toString(16);
        }
      } else if (method === "eth_accounts") {
        result = TEST_ACCOUNTS.map(a => a.address);
      } else if (method === "net_version") {
        result = "31337";
      } else if (method === "eth_estimateGas") {
        result = "0x5208"; // 21000
      } else if (method === "eth_gasPrice") {
        result = "0x3b9aca00"; // 1 Gwei
      } else {
        result = "0x0";
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ jsonrpc: "2.0", id, result }));
    } catch (err) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: err.message }));
    }
  });
});

server.listen(PORT, () => {
  console.log(`\n========================================================`);
  console.log(`🚀 LOCAL TEST EVM RPC NODE RUNNING ON http://127.0.0.1:${PORT}`);
  console.log(`========================================================`);
  console.log(`Chain ID: 31337 (Hardhat / Anvil compatible)`);
  console.log(`Pre-funded Wallets (10,000 ETH each):`);
  TEST_ACCOUNTS.forEach((a, i) => console.log(`  Account #${i}: ${a.address} (10,000 ETH)`));
  console.log(`========================================================\n`);
});
