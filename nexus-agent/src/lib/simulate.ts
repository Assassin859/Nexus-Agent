import { getProvider } from "./rpc.js";
import { ensureAllowance } from "./allowance.js";
import { childLogger } from "./logger.js";

const simLog = childLogger({ module: "simulate" });

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

export type Erc20SimulationResult = SimulationResult & {
  allowanceCalldata: string | null;
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
    simLog.warn({ revertReason }, "[SIMULATE] Caught revert (gas saved)");
    return { wouldRevert: true, gasEstimate: 0n, revertReason };
  }
}

/**
 * Pre-flight simulation for ERC20-backed actions (repay, supply, swap).
 * Checks allowance first; simulates approve when needed, otherwise simulates the main tx.
 */
export async function simulateErc20Action(
  signerWallet: string,
  monitoredWallet: string,
  token: string,
  spender: string,
  amountUSD: number,
  mainTx: TxPayload,
): Promise<Erc20SimulationResult> {
  const allowanceCalldata = await ensureAllowance(signerWallet, token, spender, amountUSD);

  if (allowanceCalldata) {
    const approveSim = await simulate(
      { from: signerWallet, to: token, data: allowanceCalldata },
      monitoredWallet,
    );
    if (approveSim.wouldRevert) {
      return { ...approveSim, allowanceCalldata };
    }
    // Approve runs first in the workflow; isolated main-tx sim still sees zero allowance.
    const mainSim = await simulate(mainTx, monitoredWallet);
    if (
      mainSim.wouldRevert &&
      /allowance|insufficient/i.test(mainSim.revertReason ?? "")
    ) {
      return { wouldRevert: false, gasEstimate: mainSim.gasEstimate, allowanceCalldata };
    }
    return { ...mainSim, allowanceCalldata };
  }

  const mainSim = await simulate(mainTx, monitoredWallet);
  return { ...mainSim, allowanceCalldata };
}
