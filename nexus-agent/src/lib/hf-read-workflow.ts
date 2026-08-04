import { AAVE_V3_POOL } from "./calldata.js";

export const HF_READ_LISTING_SLUG = "nexus-guardian-hf-read";
/** Workflow node network — Aave V3 read on Base Sepolia. */
export const HF_READ_EXECUTION_CHAIN = "84532";
/** Marketplace listing chain — Base mainnet for x402 payment settlement. */
export const HF_READ_LISTING_CHAIN = "8453";
export const HF_READ_WORKFLOW_NAME = "NexusAgent HF Read";

const READ_NODE_ID = "read-1";
const READ_NODE_LABEL = "Read Health Factor";
/** KeeperHub stored template: Manual trigger input → read-contract arg. */
export const HF_READ_WALLET_ARG_TEMPLATE = "{{@trigger-1:Manual.walletAddress}}";

const GET_USER_ACCOUNT_DATA_ABI = JSON.stringify([
  {
    name: "getUserAccountData",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [
      { name: "totalCollateralBase", type: "uint256" },
      { name: "totalDebtBase", type: "uint256" },
      { name: "availableBorrowsBase", type: "uint256" },
      { name: "currentLiquidationThreshold", type: "uint256" },
      { name: "ltv", type: "uint256" },
      { name: "healthFactor", type: "uint256" },
    ],
  },
]);

export const HF_READ_INPUT_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    walletAddress: {
      type: "string",
      description: "EVM address to read Aave V3 health factor for on Base Sepolia",
    },
  },
  required: ["walletAddress"],
};

export type WorkflowGraph = {
  nodes: Array<Record<string, unknown>>;
  edges: Array<Record<string, unknown>>;
  enabled: boolean;
};

/** Manual trigger → getUserAccountData read on Base Sepolia Aave V3 pool. */
export function buildHfReadWorkflowGraph(): WorkflowGraph {
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
        id: READ_NODE_ID,
        type: "action",
        position: { x: 280, y: 0 },
        data: {
          type: "action",
          label: READ_NODE_LABEL,
          description: "Read Aave V3 getUserAccountData on Base Sepolia",
          config: {
            actionType: "web3/read-contract",
            network: HF_READ_EXECUTION_CHAIN,
            contractAddress: AAVE_V3_POOL,
            abi: GET_USER_ACCOUNT_DATA_ABI,
            abiFunction: "getUserAccountData",
            functionArgs: JSON.stringify([HF_READ_WALLET_ARG_TEMPLATE]),
          },
          status: "idle",
        },
      },
    ],
    edges: [{ id: "edge-1", source: "trigger-1", target: READ_NODE_ID }],
    enabled: false,
  };
}

export type ListingMetadata = {
  slug: string;
  category: string;
  chain: string;
  workflowType: "read" | "write";
  inputSchema: Record<string, unknown>;
  outputMapping: Record<string, string>;
  priceUsdcPerCall?: string;
};

export function buildHfReadListingMetadata(): ListingMetadata {
  const hfRef = `{{@${READ_NODE_ID}:${READ_NODE_LABEL}.result.healthFactor}}`;
  return {
    slug: HF_READ_LISTING_SLUG,
    category: "defi",
    chain: HF_READ_LISTING_CHAIN,
    workflowType: "read",
    inputSchema: HF_READ_INPUT_SCHEMA,
    outputMapping: {
      healthFactor: hfRef,
      totalCollateralBase: `{{@${READ_NODE_ID}:${READ_NODE_LABEL}.result.totalCollateralBase}}`,
      totalDebtBase: `{{@${READ_NODE_ID}:${READ_NODE_LABEL}.result.totalDebtBase}}`,
    },
    priceUsdcPerCall: "0.01",
  };
}

/** Validates listing slug shape (lowercase, hyphens, no spaces). */
export function isValidListingSlug(slug: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
}
