import { Interface, Result } from "ethers";

export type WorkflowStep = {
  type: "transaction";
  to: string;
  calldata: string;
  value?: string;
  gasStrategy?: "standard" | "fast" | "sponsored";
};

export type WorkflowConfig = {
  name: string;
  triggerType: "cron" | "webhook" | "manual" | "event";
  cronSchedule?: string;
  steps: WorkflowStep[];
  mevProtected?: boolean;
  /** When false, cron workflows register on KeeperHub but do not auto-fire remotely. Default true. */
  remoteCronEnabled?: boolean;
};

const DEFAULT_CHAIN_ID = process.env.KEEPERHUB_CHAIN_ID || "84532";

type AbiFragment = Record<string, unknown>;

const WRITE_CONTRACT_FRAGMENTS: Record<string, { name: string; abi: AbiFragment[] }> = {
  "0x095ea7b3": {
    name: "approve",
    abi: [{
      type: "function",
      name: "approve",
      inputs: [
        { name: "spender", type: "address" },
        { name: "amount", type: "uint256" },
      ],
      outputs: [{ type: "bool" }],
      stateMutability: "nonpayable",
    }],
  },
  "0xa9059cbb": {
    name: "transfer",
    abi: [{
      type: "function",
      name: "transfer",
      inputs: [
        { name: "to", type: "address" },
        { name: "amount", type: "uint256" },
      ],
      outputs: [{ type: "bool" }],
      stateMutability: "nonpayable",
    }],
  },
  "0x573ade81": {
    name: "repay",
    abi: [{
      type: "function",
      name: "repay",
      inputs: [
        { name: "asset", type: "address" },
        { name: "amount", type: "uint256" },
        { name: "interestRateMode", type: "uint256" },
        { name: "onBehalfOf", type: "address" },
      ],
      outputs: [{ type: "uint256" }],
      stateMutability: "nonpayable",
    }],
  },
  "0x69328dec": {
    name: "withdraw",
    abi: [{
      type: "function",
      name: "withdraw",
      inputs: [
        { name: "asset", type: "address" },
        { name: "amount", type: "uint256" },
        { name: "to", type: "address" },
      ],
      outputs: [{ type: "uint256" }],
      stateMutability: "nonpayable",
    }],
  },
  "0x617ba037": {
    name: "supply",
    abi: [{
      type: "function",
      name: "supply",
      inputs: [
        { name: "asset", type: "address" },
        { name: "amount", type: "uint256" },
        { name: "onBehalfOf", type: "address" },
        { name: "referralCode", type: "uint16" },
      ],
      outputs: [{ type: "uint256" }],
      stateMutability: "nonpayable",
    }],
  },
  "0x414bf389": {
    name: "exactInputSingle",
    abi: [{
      type: "function",
      name: "exactInputSingle",
      inputs: [{
        name: "params",
        type: "tuple",
        components: [
          { name: "tokenIn", type: "address" },
          { name: "tokenOut", type: "address" },
          { name: "fee", type: "uint24" },
          { name: "recipient", type: "address" },
          { name: "deadline", type: "uint256" },
          { name: "amountIn", type: "uint256" },
          { name: "amountOutMinimum", type: "uint256" },
          { name: "sqrtPriceLimitX96", type: "uint160" },
        ],
      }],
      outputs: [{ type: "uint256" }],
      stateMutability: "payable",
    }],
  },
  "0xf2b9fdb8": {
    name: "supply",
    abi: [{
      type: "function",
      name: "supply",
      inputs: [
        { name: "asset", type: "address" },
        { name: "amount", type: "uint256" },
      ],
      outputs: [{ type: "uint256" }],
      stateMutability: "nonpayable",
    }],
  },
  "0xf3fef3a3": {
    name: "withdraw",
    abi: [{
      type: "function",
      name: "withdraw",
      inputs: [
        { name: "asset", type: "address" },
        { name: "amount", type: "uint256" },
      ],
      outputs: [{ type: "uint256" }],
      stateMutability: "nonpayable",
    }],
  },
};

function serializeArg(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Result) {
    const out: Record<string, unknown> = {};
    for (let i = 0; i < value.length; i++) {
      const key = value.fragment?.components?.[i]?.name ?? String(i);
      out[key] = serializeArg(value[i]);
    }
    return out;
  }
  if (Array.isArray(value)) return value.map(serializeArg);
  return value;
}

function stepToWriteContractConfig(step: WorkflowStep, network: string) {
  const selector = step.calldata.slice(0, 10).toLowerCase();
  const def = WRITE_CONTRACT_FRAGMENTS[selector];
  if (!def) {
    throw new Error(`Unsupported calldata selector ${selector} for KeeperHub workflow conversion`);
  }

  const iface = new Interface(def.abi);
  const decoded = iface.decodeFunctionData(def.name, step.calldata);
  const args = decoded.map(serializeArg);

  return {
    actionType: "web3/write-contract",
    network,
    contractAddress: step.to,
    abi: JSON.stringify(def.abi),
    abiFunction: def.name,
    functionArgs: JSON.stringify(args),
    ...(step.value && step.value !== "0" ? { ethValue: step.value } : {}),
  };
}

export function buildWorkflowGraph(config: WorkflowConfig) {
  const network = DEFAULT_CHAIN_ID;
  const triggerConfig =
    config.triggerType === "cron"
      ? {
          triggerType: "Schedule",
          scheduleCron: config.cronSchedule || "0 9 * * 1",
          scheduleTimezone: "UTC",
        }
      : config.triggerType === "webhook"
        ? { triggerType: "Webhook" }
        : config.triggerType === "event"
          ? { triggerType: "Event" }
          : { triggerType: "Manual" };

  const nodes: Array<Record<string, unknown>> = [
    {
      id: "trigger-1",
      type: "trigger",
      position: { x: 0, y: 0 },
      data: {
        type: "trigger",
        label: triggerConfig.triggerType,
        config: triggerConfig,
      },
    },
  ];

  const edges: Array<Record<string, unknown>> = [];
  let prevId = "trigger-1";

  config.steps.forEach((step, index) => {
    const nodeId = `step-${index + 1}`;
    nodes.push({
      id: nodeId,
      type: "action",
      position: { x: 280 * (index + 1), y: 0 },
      data: {
        type: "action",
        label: `Transaction ${index + 1}`,
        config: stepToWriteContractConfig(step, network),
      },
    });
    edges.push({ id: `edge-${index + 1}`, source: prevId, target: nodeId });
    prevId = nodeId;
  });

  return {
    nodes,
    edges,
    enabled: config.triggerType === "cron" && config.remoteCronEnabled !== false,
  };
}
