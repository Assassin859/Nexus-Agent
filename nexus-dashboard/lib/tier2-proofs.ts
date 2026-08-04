export const HF_READ_SLUG = "nexus-guardian-hf-read";
export const HF_READ_WORKFLOW_ID = "15a4yssu4dkcim8fq3o70";

export type GuardianRepayProof = {
  txHash: string;
  amountUSD: number;
  timestamp: string;
};

/** Chronological Guardian repay proofs on Base Sepolia (oldest first). */
export const GUARDIAN_REPAY_PROOF_TXS: GuardianRepayProof[] = [
  {
    txHash: "0x23f6424d9dbcb2b77c13a3ca6d4e4117c7e37d4d8e433549519ec4df2c770df3",
    amountUSD: 1000,
    timestamp: "2026-08-01T18:45:07.943Z",
  },
  {
    txHash: "0xd2d8ce6bf3138e981d5157089dfb90b1255f91e3d8523ae0d9dc18cf43a4f127",
    amountUSD: 1000,
    timestamp: "2026-08-01T18:45:11.683Z",
  },
  {
    txHash: "0xa8400540184814ad5a08a50c3742c832e4bc2720f5301245e8e70ecef079a17d",
    amountUSD: 467,
    timestamp: "2026-08-02T11:15:04.815Z",
  },
  {
    txHash: "0x162a4163ac4843c717611541ec71056224a551865eb7dc4f8117c27feea0b0fb",
    amountUSD: 533,
    timestamp: "2026-08-02T11:40:04.715Z",
  },
];

export type PayrollProofRecord = {
  txHash: string;
  amountUSD: number;
  recipient: string;
  workflowId: string;
  executionId: string;
};

/** PayChain one-shot payroll proof on Base Sepolia. */
export const PAYROLL_PROOF_TXS: PayrollProofRecord[] = [
  {
    txHash: "0x5a113d704ef78f510119d4e10959bc49c3a3869da571df67606583d2fc66391d",
    amountUSD: 0.01,
    recipient: "0xd4106369Aae69A6E704404237fF88b6C5F51Fea2",
    workflowId: "t1v9dytjo67ahyqlk0ulj",
    executionId: "xgumiwvubqpoxfx1cv3xf",
  },
];

export type DcaProofRecord = {
  txHash: string;
  amountUSD: number;
  workflowId: string;
  executionId: string;
};

/** DCA proof on Base Sepolia (USDC leg — Sepolia Uniswap pool illiquid). */
export const DCA_PROOF_TXS: DcaProofRecord[] = [
  {
    txHash: "0xb1d5d0cd6acd22d0602eda018fee969e57bde5c3dceffeb5275072594f3214ca",
    amountUSD: 2,
    workflowId: "dya1swzeog0xg4xkg5lok",
    executionId: "v8grhn3mirzp07fcz2s51",
  },
];

export type YieldProofRecord = {
  txHash: string;
  amountUSD: number;
  round: number;
  workflowId: string;
  executionId: string;
};

/** Yield Aave→Compound rotate proofs on Base Sepolia. */
export const YIELD_PROOF_TXS: YieldProofRecord[] = [
  {
    txHash: "0x76ed48b021ee8239ec05ff0ea7a0deff0d98fc55c367f78eea5575c0d80d68a1",
    amountUSD: 1.5,
    round: 1,
    workflowId: "2v3u8t81jfe97ocwwu09f",
    executionId: "r40r4ut7skd1g5ildt3en",
  },
  {
    txHash: "0x42ee234ed84381d94807e9843ffb234a89b84c3e2bc32226ec7dd860d191211e",
    amountUSD: 1.5,
    round: 2,
    workflowId: "wh03cuzhvpmw6c2es2kvg",
    executionId: "0d98h2csopn5of58onswh",
  },
  {
    txHash: "0x33b945bb07802f0972139974ec4a1473e1f98c9b96de0881eccfd279a9856c13",
    amountUSD: 1.5,
    round: 3,
    workflowId: "86jqcffltk5k14h83g3fk",
    executionId: "l7pv7969o8k9pal5vkpvj",
  },
];

export type TempoProofRecord = {
  txHash: string;
  executionId: string;
  workflowId: string;
};

/** Chronological Tempo Moderato transfer-with-memo proofs (oldest first). */
export const TEMPO_PROOF_TXS: TempoProofRecord[] = [
  {
    txHash: "0xc60706a09597c96ac47f5082dc2d7cfb137cf61f7abaf3f3ab003997ace4ec74",
    executionId: "80bk5zy4fwdfedy3w1rdi",
    workflowId: "b6acvzz32j2e1xlnrl7vy",
  },
  {
    txHash: "0x64e57b1a27b8efdda803f4d6c7113e27cea5c1877652f0ffa47c394b6ad12b87",
    executionId: "8qq18tjln92vh3fqh5hk5",
    workflowId: "j1a3c0en54vbcdypmaih6",
  },
  {
    txHash: "0xceba5bead95ab9cf64e18fc801622a985d5405ddb38dfd5f855c1f4ac1ebded3",
    executionId: "9x1za1aur2t0vw8y28yth",
    workflowId: "wpsunufv3mvan4xnq9bjs",
  },
  {
    txHash: "0x36a595cace20493791aeab8400f7ff9633fcafbbb3c5da136604658cde1554fd",
    executionId: "tqx40bk50scajq5wlq3jx",
    workflowId: "gkkbpagufwiqb49ik0ygb",
  },
];

const latestProof = TEMPO_PROOF_TXS[TEMPO_PROOF_TXS.length - 1];

export const TEMPO_PROOF_TX = latestProof.txHash;
export const TEMPO_PROOF_WORKFLOW_ID = latestProof.workflowId;
export const TEMPO_PROOF_EXECUTION_ID = latestProof.executionId;

export const TEMPO_CHAIN_ID = 42431;
export const BASE_SEPOLIA_CHAIN_ID = 84532;
export const BASE_MAINNET_CHAIN_ID = 8453;

/** Base mainnet x402 settlement tx — set NEXT_PUBLIC_X402_PROOF_TX on deploy to override. */
export const X402_PROOF_TX =
  process.env.NEXT_PUBLIC_X402_PROOF_TX ||
  "0xd15442dc664d157c241d418434111442d8481d8bef9e4dd0233f7c0471591f68";

export { KEEPERHUB_MARKETPLACE_URL as MARKETPLACE_URL, keeperHubWorkflowUrl } from "@/lib/keeperhub-links";

export function keeperHubExecutionUrl(id: string): string {
  /** Not shareable — returns 404 for viewers outside the Nexus Agent KeeperHub org. Prefer tempoTxUrl + workflow links. */
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

export function baseMainnetTxUrl(txHash: string): string {
  return `https://basescan.org/tx/${txHash}`;
}
