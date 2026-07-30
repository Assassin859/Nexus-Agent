import { getProvider } from "./rpc.js";

export type TxPayload = {
  from: string;
  to: string;
  data: string;
  value?: bigint;
};

export type SimulationResult = {
  wouldRevert: boolean;
  gasEstimate: bigint;
  revertReason?: string;
};

export async function simulate(
  tx: TxPayload,
  userWallet: string
): Promise<SimulationResult> {
  try {
    const provider = await getProvider();
    const gasEstimate = await provider.estimateGas({
      from: tx.from,
      to: tx.to,
      data: tx.data,
      value: tx.value ?? 0n,
    });

    return { wouldRevert: false, gasEstimate };
  } catch (error: unknown) {
    const revertReason = error instanceof Error ? error.message : "Unknown simulation revert";
    console.warn(`[SIMULATE] Caught revert (gas saved): ${revertReason}`);
    return { wouldRevert: true, gasEstimate: 0n, revertReason };
  }
}
