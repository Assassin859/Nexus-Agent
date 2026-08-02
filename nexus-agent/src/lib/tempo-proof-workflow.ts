export const TEMPO_TESTNET_CHAIN = "42431";
export const TEMPO_PATH_USD = "0x20c0000000000000000000000000000000000000";
export const TEMPO_PROOF_MEMO = "nexus-agent-proof";
export const TEMPO_PROOF_WORKFLOW_NAME = "NexusAgent Tempo Proof";

export type TempoProofParams = {
  recipientAddress: string;
  amount?: string;
  memo?: string;
};

/** Manual trigger → tempo/transfer-with-memo on Moderato testnet. */
export function buildTempoProofWorkflowGraph(params: TempoProofParams) {
  const amount = params.amount ?? "0.01";
  const memo = params.memo ?? TEMPO_PROOF_MEMO;

  return {
    nodes: [
      {
        id: "trigger-1",
        type: "trigger",
        position: { x: 0, y: 0 },
        data: {
          type: "trigger",
          label: "Manual",
          config: { triggerType: "Manual" },
          status: "idle",
        },
      },
      {
        id: "step-1",
        type: "action",
        position: { x: 280, y: 0 },
        data: {
          type: "action",
          label: "Transfer with Memo",
          description: "Tempo Moderato attestation transfer for NexusAgent proof",
          config: {
            actionType: "tempo/transfer-with-memo",
            network: TEMPO_TESTNET_CHAIN,
            tokenConfig: TEMPO_PATH_USD,
            amount,
            recipientAddress: params.recipientAddress,
            memo,
          },
          status: "idle",
        },
      },
    ],
    edges: [{ id: "edge-1", source: "trigger-1", target: "step-1" }],
    enabled: false,
  };
}
