export const HF_READ_SLUG = "nexus-guardian-hf-read";
export const HF_READ_WORKFLOW_ID =
  process.env.HF_READ_WORKFLOW_ID || "15a4yssu4dkcim8fq3o70";

export const TEMPO_PROOF_TX =
  process.env.TEMPO_PROOF_TX_HASH ||
  "0xc60706a09597c96ac47f5082dc2d7cfb137cf61f7abaf3f3ab003997ace4ec74";
export const TEMPO_PROOF_WORKFLOW_ID = "b6acvzz32j2e1xlnrl7vy";
export const TEMPO_PROOF_EXECUTION_ID = "80bk5zy4fwdfedy3w1rdi";
export const TEMPO_PROOF_MEMO = "nexus-agent-proof";

export const TEMPO_CHAIN_ID = 42431;
export const BASE_SEPOLIA_CHAIN_ID = 84532;
export const TEMPO_PATH_USD = "0x20c0000000000000000000000000000000000000";
export const TEMPO_RPC = process.env.TEMPO_RPC_URL || "https://rpc.moderato.tempo.xyz";

export const MARKETPLACE_URL = "https://app.keeperhub.com/hub?tab=marketplace";
export const HF_READ_LISTING_URL = `${MARKETPLACE_URL}`;

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

export function baseSepoliaTxUrl(txHash: string): string {
  return `https://sepolia.basescan.org/tx/${txHash}`;
}
