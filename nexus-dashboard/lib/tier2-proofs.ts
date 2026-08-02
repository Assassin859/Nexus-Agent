export const HF_READ_SLUG = "nexus-guardian-hf-read";
export const HF_READ_WORKFLOW_ID = "15a4yssu4dkcim8fq3o70";

export const TEMPO_PROOF_TX =
  "0xc60706a09597c96ac47f5082dc2d7cfb137cf61f7abaf3f3ab003997ace4ec74";
export const TEMPO_PROOF_WORKFLOW_ID = "b6acvzz32j2e1xlnrl7vy";
export const TEMPO_PROOF_EXECUTION_ID = "80bk5zy4fwdfedy3w1rdi";

export const TEMPO_CHAIN_ID = 42431;
export const BASE_SEPOLIA_CHAIN_ID = 84532;

export const MARKETPLACE_URL = "https://app.keeperhub.com/hub?tab=marketplace";

export function keeperHubWorkflowUrl(id: string): string {
  return `https://app.keeperhub.com/workflows/${id}`;
}

export function keeperHubExecutionUrl(id: string): string {
  return `https://app.keeperhub.com/executions/${id}`;
}

export function tempoTxUrl(txHash: string): string {
  return `https://explore.testnet.tempo.xyz/tx/${txHash}`;
}

export function tempoAddressUrl(address: string): string {
  return `https://explore.testnet.tempo.xyz/address/${address}`;
}
