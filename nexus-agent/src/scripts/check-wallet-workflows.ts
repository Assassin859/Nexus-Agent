import "../lib/env.js";
import { db } from "../db/client.js";
import { activeWorkflows } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { getProvider } from "../lib/rpc.js";
import { formatEther } from "ethers";
import { getUsdcBalance } from "../lib/aave.js";

const wallet = "0x89f97cb35236a1d0190fb25b31c5c0ff4107ec1b";
const agentic = process.env.AGENTIC_WALLET_ADDRESS!;
const p = await getProvider();
console.log("Agentic:", agentic);
console.log("ETH:", formatEther(await p.getBalance(agentic)));
console.log("USDC:", await getUsdcBalance(agentic));

const wfs = await db.select().from(activeWorkflows).where(eq(activeWorkflows.userWallet, wallet));
for (const w of wfs) {
  console.log(`${w.type} | pgId=${w.id} | khId=${w.keeperhubWorkflowId || "MISSING"}`);
}
