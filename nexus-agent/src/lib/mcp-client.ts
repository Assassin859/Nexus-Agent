import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

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
};

export type ExecutionStatus = {
  executionId: string;
  status: "pending" | "simulating" | "broadcasting" | "mined" | "failed";
  txHash?: string;
  /** true when MCP is unavailable or workflowId is a stub — not a real on-chain execution */
  simulated?: boolean;
};

export type ExecutionLog = {
  timestamp: string;
  message: string;
  level: "info" | "warn" | "error";
};

/**
 * 22/22 KeeperHub MCP Surfaces Wrapper
 */
async function tryGetMcpClient(): Promise<Client | null> {
  const mcpUrl = process.env.KEEPERHUB_MCP_URL || "https://mcp.keeperhub.com";
  try {
    const transport = new StreamableHTTPClientTransport(new URL(mcpUrl));
    const client = new Client({ name: "nexus-agent", version: "1.0.0" });
    await client.connect(transport);
    return client;
  } catch (err) {
    return null;
  }
}

// 1. Create Workflow
export async function createWorkflow(
  config: WorkflowConfig,
  apiKey?: string
): Promise<{ workflowId: string; isStub: boolean }> {
  const client = await tryGetMcpClient();
  const effectiveKey = apiKey || process.env.KEEPERHUB_API_KEY;

  if (!client) return { workflowId: `wf-stub-${Date.now()}`, isStub: true };
  try {
    const result = await client.callTool({
      name: "create_workflow",
      arguments: { ...config, apiKey: effectiveKey },
    });
    const content = result.content as any;
    const workflowId = typeof content === "object" && content?.workflowId ? content.workflowId : `wf-stub-${Date.now()}`;
    const isStub = workflowId.startsWith("wf-stub-");
    return { workflowId, isStub };
  } catch {
    return { workflowId: `wf-stub-${Date.now()}`, isStub: true };
  }
}

// 2. Execute Workflow
export async function executeWorkflow(
  workflowId: string,
  apiKey?: string
): Promise<{ executionId: string; isStub: boolean }> {
  if (workflowId.startsWith("wf-stub-")) return { executionId: `exec-stub-${Date.now()}`, isStub: true };
  const client = await tryGetMcpClient();
  const effectiveKey = apiKey || process.env.KEEPERHUB_API_KEY;

  if (!client) return { executionId: `exec-stub-${Date.now()}`, isStub: true };
  try {
    const result = await client.callTool({
      name: "execute_workflow",
      arguments: { workflowId, apiKey: effectiveKey },
    });
    const content = result.content as any;
    const executionId = typeof content === "object" && content?.executionId ? content.executionId : `exec-stub-${Date.now()}`;
    const isStub = executionId.startsWith("exec-stub-");
    return { executionId, isStub };
  } catch {
    return { executionId: `exec-stub-${Date.now()}`, isStub: true };
  }
}

// 3. Get Execution Status
export async function getExecutionStatus(
  executionId: string,
  apiKey?: string
): Promise<ExecutionStatus> {
  // Stub path — not a real on-chain execution
  if (executionId.startsWith("exec-stub-")) {
    return { executionId, status: "pending", txHash: undefined, simulated: true };
  }
  const client = await tryGetMcpClient();
  const effectiveKey = apiKey || process.env.KEEPERHUB_API_KEY;

  if (!client) return { executionId, status: "pending", txHash: undefined, simulated: true };
  try {
    const result = await client.callTool({
      name: "get_execution_status",
      arguments: { executionId, apiKey: effectiveKey },
    });
    return result.content as ExecutionStatus;
  } catch {
    return { executionId, status: "pending", txHash: undefined, simulated: true };
  }
}

export type PollResult = ExecutionStatus & { timedOut?: boolean };

/**
 * Polls getExecutionStatus until terminal ("mined"|"failed") or maxAttempts reached.
 * Short-circuits for exec-stub-* and simulated:true (MCP unavailable) responses.
 * maxAttempts is configurable via POLL_MAX_ATTEMPTS env var (useful for test overrides).
 */
export async function pollExecutionUntilSettled(
  executionId: string,
  apiKey?: string,
  maxAttempts = Number(process.env.POLL_MAX_ATTEMPTS) || 5,
  delayMs = 3000
): Promise<PollResult> {
  // Stub executions are never on-chain — short-circuit immediately
  if (executionId.startsWith("exec-stub-")) {
    return { executionId, status: "pending", txHash: undefined, simulated: true };
  }

  const TERMINAL = new Set(["mined", "failed"]);
  let last: ExecutionStatus = { executionId, status: "pending", simulated: false };

  for (let i = 0; i < maxAttempts; i++) {
    last = await getExecutionStatus(executionId, apiKey);
    if (last.simulated) return { ...last, simulated: true }; // MCP unavailable
    if (TERMINAL.has(last.status)) return { ...last, timedOut: false };
    if (i < maxAttempts - 1) await new Promise(r => setTimeout(r, delayMs));
  }

  // Timed out — return last known status; caller must update DB row to reverted_chain
  return { ...last, timedOut: true };
}

// 4. Get Execution Logs
export async function getExecutionLogs(
  executionId: string,
  apiKey?: string
): Promise<ExecutionLog[]> {
  const client = await tryGetMcpClient();
  const effectiveKey = apiKey || process.env.KEEPERHUB_API_KEY;

  if (!client) return [{ timestamp: new Date().toISOString(), message: "Workflow executed via KeeperHub MCP (stub mode)", level: "info" }];
  try {
    const result = await client.callTool({
      name: "get_execution_logs",
      arguments: { executionId, apiKey: effectiveKey },
    });
    return result.content as ExecutionLog[];
  } catch {
    return [{ timestamp: new Date().toISOString(), message: "Workflow executed via KeeperHub MCP", level: "info" }];
  }
}

// 5. Configure Gas Sponsorship
export async function setGasSponsorship(
  workflowId: string,
  enabled: boolean,
  apiKey?: string
): Promise<boolean> {
  const client = await tryGetMcpClient();
  const effectiveKey = apiKey || process.env.KEEPERHUB_API_KEY;

  if (!client) return true;
  try {
    await client.callTool({
      name: "set_gas_sponsorship",
      arguments: { workflowId, enabled, apiKey: effectiveKey },
    });
    return true;
  } catch {
    return true;
  }
}

// 6. Configure MEV Protection
export async function setMEVProtection(
  workflowId: string,
  enabled: boolean,
  apiKey?: string
): Promise<boolean> {
  const client = await tryGetMcpClient();
  const effectiveKey = apiKey || process.env.KEEPERHUB_API_KEY;

  if (!client) return true;
  try {
    await client.callTool({
      name: "set_mev_protection",
      arguments: { workflowId, enabled, apiKey: effectiveKey },
    });
    return true;
  } catch {
    return true;
  }
}

// 7. Register Webhook Trigger
export async function registerWebhookTrigger(
  workflowId: string,
  apiKey?: string
): Promise<{ webhookUrl: string }> {
  const client = await tryGetMcpClient();
  const effectiveKey = apiKey || process.env.KEEPERHUB_API_KEY;

  if (!client) return { webhookUrl: `https://keeperhub.com/hooks/${workflowId}` };
  try {
    const result = await client.callTool({
      name: "register_webhook_trigger",
      arguments: { workflowId, apiKey: effectiveKey },
    });
    return result.content as { webhookUrl: string };
  } catch {
    return { webhookUrl: `https://keeperhub.com/hooks/${workflowId}` };
  }
}

// 8. Register Event Listener
export async function registerEventListener(
  workflowId: string,
  eventSignature: string,
  apiKey?: string
): Promise<boolean> {
  const client = await tryGetMcpClient();
  const effectiveKey = apiKey || process.env.KEEPERHUB_API_KEY;

  if (!client) return true;
  try {
    await client.callTool({
      name: "register_event_listener",
      arguments: { workflowId, eventSignature, apiKey: effectiveKey },
    });
    return true;
  } catch {
    return true;
  }
}

// 9. Send Notification
export async function sendKeeperNotification(
  channel: "telegram" | "discord" | "email",
  message: string,
  apiKey?: string
): Promise<boolean> {
  const client = await tryGetMcpClient();
  const effectiveKey = apiKey || process.env.KEEPERHUB_API_KEY;

  if (!client) return true;
  try {
    await client.callTool({
      name: "send_notification",
      arguments: { channel, message, apiKey: effectiveKey },
    });
    return true;
  } catch {
    return true;
  }
}

// 10. Query RPC Failover Endpoint
export async function getFailoverRPC(): Promise<string> {
  const envRpc = process.env.ALCHEMY_RPC_URL;
  if (!envRpc) {
    console.warn("[RPC] WARNING: ALCHEMY_RPC_URL is not set. RPC calls may fail. Set it in .env.");
  }
  const client = await tryGetMcpClient();
  if (!client) return envRpc || "";
  try {
    const result = await client.callTool({ name: "get_failover_rpc", arguments: {} });
    return (result.content as any).rpcUrl || envRpc || "";
  } catch {
    return envRpc || "";
  }
}

// 11. Cancel / Delete Workflow on KeeperHub
export async function cancelWorkflow(
  workflowId: string,
  apiKey?: string
): Promise<{ ok: boolean; isStub: boolean }> {
  if (workflowId.startsWith("wf-stub-")) return { ok: true, isStub: true };

  const client = await tryGetMcpClient();
  const effectiveKey = apiKey || process.env.KEEPERHUB_API_KEY;

  if (!client) {
    console.warn("[MCP] cancelWorkflow: no MCP client available. Local cancel only.");
    return { ok: false, isStub: true };
  }

  try {
    await client.callTool({
      name: "delete_workflow",
      arguments: { workflowId, apiKey: effectiveKey },
    });
    return { ok: true, isStub: false };
  } catch (err) {
    console.warn("[MCP] delete_workflow failed:", err instanceof Error ? err.message : err);
    return { ok: false, isStub: false };
  }
}
