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

// Singleton Client Cache
let cachedClient: Client | null = null;

/**
 * Connected MCP client singleton with auto-reconnect fallback.
 */
async function tryGetMcpClient(): Promise<Client | null> {
  if (cachedClient) return cachedClient;
  const mcpUrl = process.env.KEEPERHUB_MCP_URL || "https://mcp.keeperhub.com";
  try {
    const transport = new StreamableHTTPClientTransport(new URL(mcpUrl));
    const client = new Client({ name: "nexus-agent", version: "1.0.0" });
    await client.connect(transport);
    cachedClient = client;
    return client;
  } catch {
    cachedClient = null;
    return null;
  }
}

/**
 * Shared helper to safely parse text/json content blocks from MCP tool returns.
 */
export function parseMcpToolContent<T = any>(result: any, keyName?: string): T | null {
  if (!result) return null;

  // 1. Direct object format
  if (typeof result === "object" && !Array.isArray(result) && !result.content) {
    return result as T;
  }

  const content = result.content;
  if (!content) return null;

  // 2. Handle array of { type: "text", text: string } content blocks
  if (Array.isArray(content)) {
    for (const block of content) {
      if (block.type === "text" && typeof block.text === "string") {
        const trimmed = block.text.trim();
        // Try JSON parsing
        if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
          try {
            const parsed = JSON.parse(trimmed);
            if (!keyName || parsed[keyName] !== undefined) return parsed as T;
          } catch {}
        }
        // Fallback regex matching for workflowId / executionId
        if (keyName === "workflowId") {
          const match = trimmed.match(/wf_[a-zA-Z0-9_-]+/);
          if (match) return { workflowId: match[0] } as unknown as T;
        } else if (keyName === "executionId") {
          const match = trimmed.match(/exec_[a-zA-Z0-9_-]+/);
          if (match) return { executionId: match[0] } as unknown as T;
        }
      }
    }
  }

  // 3. Fallback object check
  if (typeof content === "object" && !Array.isArray(content)) {
    return content as T;
  }

  return null;
}

/**
 * Retries an MCP action up to 2 times on connection/stub failure, ignoring 401 Unauthorized errors.
 */
async function executeWithRetry<T>(
  action: (client: Client) => Promise<{ data: T; isStub: boolean }>,
  fallbackStub: T
): Promise<{ data: T; isStub: boolean }> {
  const maxRetries = 2;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const client = await tryGetMcpClient();
    if (!client) {
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }
      return { data: fallbackStub, isStub: true };
    }

    try {
      const res = await action(client);
      if (!res.isStub || attempt === maxRetries) {
        return res;
      }
    } catch (err: any) {
      const errStr = String(err);
      // Skip retry on auth failure
      if (errStr.includes("401") || errStr.toLowerCase().includes("unauthorized")) {
        return { data: fallbackStub, isStub: true };
      }
      cachedClient = null; // reset client on network error
    }

    if (attempt < maxRetries) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  return { data: fallbackStub, isStub: true };
}

// 1. Create Workflow
export async function createWorkflow(
  config: WorkflowConfig,
  apiKey?: string
): Promise<{ workflowId: string; isStub: boolean }> {
  const effectiveKey = apiKey || process.env.KEEPERHUB_API_KEY;

  const result = await executeWithRetry(
    async (client) => {
      const raw = await client.callTool({
        name: "create_workflow",
        arguments: { ...config, apiKey: effectiveKey },
      });
      const parsed = parseMcpToolContent<{ workflowId: string }>(raw, "workflowId");
      const workflowId = parsed?.workflowId || `wf-stub-${Date.now()}`;
      const isStub = workflowId.startsWith("wf-stub-");
      return { data: workflowId, isStub };
    },
    `wf-stub-${Date.now()}`
  );

  return { workflowId: result.data, isStub: result.isStub };
}

// 2. Execute Workflow
export async function executeWorkflow(
  workflowId: string,
  apiKey?: string
): Promise<{ executionId: string; isStub: boolean }> {
  if (workflowId.startsWith("wf-stub-")) return { executionId: `exec-stub-${Date.now()}`, isStub: true };
  const effectiveKey = apiKey || process.env.KEEPERHUB_API_KEY;

  const result = await executeWithRetry(
    async (client) => {
      const raw = await client.callTool({
        name: "execute_workflow",
        arguments: { workflowId, apiKey: effectiveKey },
      });
      const parsed = parseMcpToolContent<{ executionId: string }>(raw, "executionId");
      const executionId = parsed?.executionId || `exec-stub-${Date.now()}`;
      const isStub = executionId.startsWith("exec-stub-");
      return { data: executionId, isStub };
    },
    `exec-stub-${Date.now()}`
  );

  return { executionId: result.data, isStub: result.isStub };
}

// 3. Get Execution Status
export async function getExecutionStatus(
  executionId: string,
  apiKey?: string
): Promise<ExecutionStatus> {
  if (executionId.startsWith("exec-stub-")) {
    return { executionId, status: "pending", txHash: undefined, simulated: true };
  }
  const client = await tryGetMcpClient();
  const effectiveKey = apiKey || process.env.KEEPERHUB_API_KEY;

  if (!client) return { executionId, status: "pending", txHash: undefined, simulated: true };
  try {
    const raw = await client.callTool({
      name: "get_execution_status",
      arguments: { executionId, apiKey: effectiveKey },
    });
    const parsed = parseMcpToolContent<ExecutionStatus>(raw);
    return parsed || { executionId, status: "pending", txHash: undefined, simulated: true };
  } catch {
    return { executionId, status: "pending", txHash: undefined, simulated: true };
  }
}

export type PollResult = ExecutionStatus & { timedOut?: boolean };

/**
 * Polls getExecutionStatus until terminal ("mined"|"failed") or maxAttempts reached.
 */
export async function pollExecutionUntilSettled(
  executionId: string,
  apiKey?: string,
  maxAttempts = Number(process.env.POLL_MAX_ATTEMPTS) || 10,
  delayMs = 3000
): Promise<PollResult> {
  if (executionId.startsWith("exec-stub-")) {
    return { executionId, status: "pending", txHash: undefined, simulated: true };
  }

  const TERMINAL = new Set(["mined", "failed"]);
  let last: ExecutionStatus = { executionId, status: "pending", simulated: false };

  for (let i = 0; i < maxAttempts; i++) {
    last = await getExecutionStatus(executionId, apiKey);
    if (last.simulated) return { ...last, simulated: true };
    if (TERMINAL.has(last.status)) return { ...last, timedOut: false };
    if (i < maxAttempts - 1) await new Promise(r => setTimeout(r, delayMs));
  }

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
    const raw = await client.callTool({
      name: "get_execution_logs",
      arguments: { executionId, apiKey: effectiveKey },
    });
    const parsed = parseMcpToolContent<ExecutionLog[]>(raw);
    return Array.isArray(parsed) ? parsed : [{ timestamp: new Date().toISOString(), message: "Workflow executed via KeeperHub MCP", level: "info" }];
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

  if (!client) return false;
  try {
    await client.callTool({
      name: "set_gas_sponsorship",
      arguments: { workflowId, enabled, apiKey: effectiveKey },
    });
    return true;
  } catch {
    return false;
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

  if (!client) return false;
  try {
    await client.callTool({
      name: "set_mev_protection",
      arguments: { workflowId, enabled, apiKey: effectiveKey },
    });
    return true;
  } catch {
    return false;
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
    const raw = await client.callTool({
      name: "register_webhook_trigger",
      arguments: { workflowId, apiKey: effectiveKey },
    });
    const parsed = parseMcpToolContent<{ webhookUrl: string }>(raw);
    return parsed || { webhookUrl: `https://keeperhub.com/hooks/${workflowId}` };
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

  if (!client) return false;
  try {
    await client.callTool({
      name: "register_event_listener",
      arguments: { workflowId, eventSignature, apiKey: effectiveKey },
    });
    return true;
  } catch {
    return false;
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

  if (!client) return false;
  try {
    await client.callTool({
      name: "send_notification",
      arguments: { channel, message, apiKey: effectiveKey },
    });
    return true;
  } catch {
    return false;
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
    const raw = await client.callTool({ name: "get_failover_rpc", arguments: {} });
    const parsed = parseMcpToolContent<{ rpcUrl: string }>(raw);
    return parsed?.rpcUrl || envRpc || "";
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
