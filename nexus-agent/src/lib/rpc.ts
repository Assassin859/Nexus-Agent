import { JsonRpcProvider } from "ethers";

const RPC_ENDPOINTS = [
  process.env.ALCHEMY_RPC_URL,
  process.env.INFURA_RPC_URL,
  "https://rpc.sepolia.org",
].filter(Boolean) as string[];

let cachedProvider: JsonRpcProvider | null = null;

export async function getProvider(): Promise<JsonRpcProvider> {
  if (cachedProvider) {
    try {
      await cachedProvider.getBlockNumber();
      return cachedProvider;
    } catch {
      cachedProvider = null;
    }
  }

  for (const url of RPC_ENDPOINTS) {
    try {
      const provider = new JsonRpcProvider(url);
      await provider.getBlockNumber();
      cachedProvider = provider;
      console.log(`[RPC] Connected to RPC endpoint: ${url.substring(0, 45)}...`);
      return provider;
    } catch {
      console.warn(`[RPC] Connection failed for ${url.substring(0, 45)}..., trying fallback...`);
    }
  }

  throw new Error("[RPC] All RPC endpoints failed to respond.");
}
