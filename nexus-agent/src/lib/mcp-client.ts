import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { buildWorkflowGraph, type WorkflowConfig, type WorkflowStep } from "./workflow-graph.js";

export type { WorkflowConfig, WorkflowStep };

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

// Per-API-key MCP client cache (Bearer auth on transport)
const clientCache = new Map<string, Client>();

export function resolveEffectiveMcpApiKey(apiKey?: string): string | undefined {
  return apiKey || process.env.KEEPERHUB_API_KEY;
}

/** Cache partition key for MCP clients — exported for unit tests. */
export function mcpCacheKey(apiKey?: string): string {
  return resolveEffectiveMcpApiKey(apiKey) ?? "__no_key__";
}

function getMcpUrl(): string {
  return process.env.KEEPERHUB_MCP_URL || "https://app.keeperhub.com/mcp";
}

function getMcpAuthHeaders(apiKey?: string): Record<string, string> | undefined {
  const effectiveKey = resolveEffectiveMcpApiKey(apiKey);
  if (!effectiveKey) return undefined;
  return { Authorization: `Bearer ${effectiveKey}` };
}

function createMcpTransport(apiKey?: string): StreamableHTTPClientTransport {
  const headers = getMcpAuthHeaders(apiKey);
  return new StreamableHTTPClientTransport(new URL(getMcpUrl()), {
    requestInit: headers ? { headers } : undefined,
  });
}

function invalidateMcpClientCache(apiKey?: string): void {
  clientCache.delete(mcpCacheKey(apiKey));
}

/**
 * Connected MCP client with per-key cache and auto-reconnect fallback.
 */
async function tryGetMcpClient(apiKey?: string): Promise<Client | null> {
  const key = mcpCacheKey(apiKey);
  const existing = clientCache.get(key);
  if (existing) return existing;

  try {
    const transport = createMcpTransport(apiKey);
    const client = new Client({ name: "nexus-agent", version: "1.0.0" });
    await client.connect(transport);
    clientCache.set(key, client);
    return client;
  } catch {
    invalidateMcpClientCache(apiKey);
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
            if (keyName === "workflowId" && parsed.id) {
              return { workflowId: parsed.id } as unknown as T;
            }
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
  fallbackStub: T,
  apiKey?: string,
): Promise<{ data: T; isStub: boolean }> {
  const maxRetries = 2;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const client = await tryGetMcpClient(apiKey);
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
      if (errStr.includes("401") || errStr.toLowerCase().includes("unauthorized")) {
        invalidateMcpClientCache(apiKey);
        return { data: fallbackStub, isStub: true };
      }
      invalidateMcpClientCache(apiKey);
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
  const graph = buildWorkflowGraph(config);
  const effectiveKey = resolveEffectiveMcpApiKey(apiKey);

  const result = await executeWithRetry(
    async (client) => {
      const raw = await client.callTool({
        name: "create_workflow",
        arguments: {
          name: config.name,
          nodes: graph.nodes,
          edges: graph.edges,
          enabled: graph.enabled,
          ...(effectiveKey ? { apiKey: effectiveKey } : {}),
        },
      });
      if ((raw as any)?.isError) {
        throw new Error((raw as any).content?.[0]?.text || "create_workflow failed");
      }
      const parsed = parseMcpToolContent<{ workflowId?: string; id?: string }>(raw, "workflowId");
      const workflowId = parsed?.workflowId || parsed?.id || `wf-stub-${Date.now()}`;
      const isStub = workflowId.startsWith("wf-stub-");
      return { data: workflowId, isStub };
    },
    `wf-stub-${Date.now()}`,
    apiKey,
  );

  return { workflowId: result.data, isStub: result.isStub };
}

// 2. Execute Workflow
export async function executeWorkflow(
  workflowId: string,
  apiKey?: string
): Promise<{ executionId: string; isStub: boolean }> {
  if (workflowId.startsWith("wf-stub-")) return { executionId: `exec-stub-${Date.now()}`, isStub: true };

  const effectiveKey = resolveEffectiveMcpApiKey(apiKey);

  const result = await executeWithRetry(
    async (client) => {
      const raw = await client.callTool({
        name: "execute_workflow",
        arguments: {
          workflowId,
          ...(effectiveKey ? { apiKey: effectiveKey } : {}),
        },
      });
      if ((raw as any)?.isError) {
        throw new Error((raw as any).content?.[0]?.text || "execute_workflow failed");
      }
      const parsed = parseMcpToolContent<{ executionId: string }>(raw, "executionId");
      const executionId = parsed?.executionId || `exec-stub-${Date.now()}`;
      const isStub = executionId.startsWith("exec-stub-");
      return { data: executionId, isStub };
    },
    `exec-stub-${Date.now()}`,
    apiKey,
  );

  return { executionId: result.data, isStub: result.isStub };
}

function mapKeeperHubExecution(raw: unknown, executionId: string): ExecutionStatus | null {
  const parsed = parseMcpToolContent<any>(raw);
  if (!parsed) return null;

  const execution = parsed.logs?.execution ?? parsed.execution;
  const statusNode = parsed.status?.status ?? parsed.status;
  const rawStatus = String(statusNode?.status ?? execution?.status ?? "").toLowerCase();
  const txHashes: unknown[] =
    statusNode?.transactionHashes ??
    execution?.transactionHashes ??
    [];

  let status: ExecutionStatus["status"] = "pending";
  if (["completed", "success", "mined"].includes(rawStatus)) status = "mined";
  else if (["failed", "error", "reverted"].includes(rawStatus)) status = "failed";
  else if (["running", "broadcasting"].includes(rawStatus)) status = "broadcasting";
  else if (rawStatus === "simulating") status = "simulating";

  const hashCandidates: string[] = [];
  for (const entry of txHashes) {
    if (typeof entry === "string") hashCandidates.push(entry);
    else if (entry && typeof entry === "object" && typeof (entry as any).hash === "string") {
      hashCandidates.push((entry as any).hash);
    }
  }
  const outputHash = execution?.output?.transactionHash;
  if (typeof outputHash === "string") hashCandidates.push(outputHash);

  const txHash = hashCandidates.find((h) => h.startsWith("0x") && h.length === 66);

  return {
    executionId: execution?.id ?? executionId,
    status,
    txHash,
    simulated: false,
  };
}

// 3. Get Execution Status
export async function getExecutionStatus(
  executionId: string,
  apiKey?: string
): Promise<ExecutionStatus> {
  if (executionId.startsWith("exec-stub-")) {
    return { executionId, status: "pending", txHash: undefined, simulated: true };
  }
  const effectiveKey = resolveEffectiveMcpApiKey(apiKey);
  const client = await tryGetMcpClient(apiKey);

  if (!client) return { executionId, status: "pending", txHash: undefined, simulated: true };
  for (const toolName of ["get_execution_status", "get_execution"] as const) {
    try {
      const raw = await client.callTool({
        name: toolName,
        arguments: {
          executionId,
          ...(effectiveKey ? { apiKey: effectiveKey } : {}),
        },
      });
      const mapped = mapKeeperHubExecution(raw, executionId);
      if (mapped) return mapped;
    } catch {
      // try legacy/alternate tool name on next iteration
    }
  }
  return { executionId, status: "pending", txHash: undefined, simulated: true };
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
  const effectiveKey = resolveEffectiveMcpApiKey(apiKey);
  const client = await tryGetMcpClient(apiKey);

  if (!client) return [{ timestamp: new Date().toISOString(), message: "Workflow executed via KeeperHub MCP (stub mode)", level: "info" }];
  for (const toolName of ["get_execution_logs", "get_execution"] as const) {
    try {
      const raw = await client.callTool({
        name: toolName,
        arguments: {
          executionId,
          ...(effectiveKey ? { apiKey: effectiveKey } : {}),
        },
      });
      const parsed = parseMcpToolContent<any>(raw);
      const entries = parsed?.logs?.entries ?? parsed?.logs ?? parsed;
      if (Array.isArray(entries)) {
        return entries.map((entry: any) => ({
          timestamp: entry.timestamp ?? entry.startedAt ?? new Date().toISOString(),
          message: entry.message ?? entry.error ?? entry.nodeName ?? "KeeperHub execution log",
          level: (entry.level ?? (entry.error ? "error" : "info")) as ExecutionLog["level"],
        }));
      }
    } catch {
      // try alternate tool
    }
  }
  return [{ timestamp: new Date().toISOString(), message: "Workflow executed via KeeperHub MCP", level: "info" }];
}

// 5. Configure Gas Sponsorship
export async function setGasSponsorship(
  workflowId: string,
  enabled: boolean,
  apiKey?: string
): Promise<boolean> {
  const effectiveKey = resolveEffectiveMcpApiKey(apiKey);
  const client = await tryGetMcpClient(apiKey);

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
  const effectiveKey = resolveEffectiveMcpApiKey(apiKey);
  const client = await tryGetMcpClient(apiKey);

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
  const effectiveKey = resolveEffectiveMcpApiKey(apiKey);
  const client = await tryGetMcpClient(apiKey);

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
  const effectiveKey = resolveEffectiveMcpApiKey(apiKey);
  const client = await tryGetMcpClient(apiKey);

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
  const effectiveKey = resolveEffectiveMcpApiKey(apiKey);
  const client = await tryGetMcpClient(apiKey);

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

export type RawWorkflowArgs = {
  name: string;
  description?: string;
  nodes: Array<Record<string, unknown>>;
  edges: Array<Record<string, unknown>>;
  enabled?: boolean;
};

export type WorkflowListingMetadata = {
  slug?: string;
  category?: string;
  chain?: string;
  inputSchema?: Record<string, unknown>;
  outputMapping?: Record<string, unknown>;
  workflowType?: "read" | "write";
  priceUsdcPerCall?: string;
};

// Create workflow from pre-built nodes/edges (marketplace / Tempo graphs)
export async function createWorkflowRaw(
  args: RawWorkflowArgs,
  apiKey?: string,
): Promise<{ workflowId: string; isStub: boolean }> {
  const effectiveKey = resolveEffectiveMcpApiKey(apiKey);

  const result = await executeWithRetry(
    async (client) => {
      const raw = await client.callTool({
        name: "create_workflow",
        arguments: {
          name: args.name,
          description: args.description,
          nodes: args.nodes,
          edges: args.edges,
          enabled: args.enabled ?? false,
          ...(effectiveKey ? { apiKey: effectiveKey } : {}),
        },
      });
      if ((raw as any)?.isError) {
        throw new Error((raw as any).content?.[0]?.text || "create_workflow failed");
      }
      const parsed = parseMcpToolContent<{ workflowId?: string; id?: string }>(raw, "workflowId");
      const workflowId = parsed?.workflowId || parsed?.id || `wf-stub-${Date.now()}`;
      return { data: workflowId, isStub: workflowId.startsWith("wf-stub-") };
    },
    `wf-stub-${Date.now()}`,
    apiKey,
  );

  return { workflowId: result.data, isStub: result.isStub };
}

export async function validateWorkflowGraph(
  nodes: Array<Record<string, unknown>>,
  edges: Array<Record<string, unknown>>,
  apiKey?: string,
): Promise<{ valid: boolean; errors?: string[]; isStub: boolean }> {
  const client = await tryGetMcpClient(apiKey);
  if (!client) return { valid: false, errors: ["MCP unavailable"], isStub: true };

  try {
    const raw = await client.callTool({
      name: "validate_workflow",
      arguments: { nodes, edges },
    });
    const parsed = parseMcpToolContent<{ valid?: boolean; errors?: string[] }>(raw);
    return {
      valid: parsed?.valid === true,
      errors: parsed?.errors,
      isStub: false,
    };
  } catch (err) {
    return {
      valid: false,
      errors: [err instanceof Error ? err.message : String(err)],
      isStub: false,
    };
  }
}

export async function listOrgWorkflows(
  apiKey?: string,
): Promise<{ workflows: Array<{ id: string; name: string; listedSlug?: string | null }>; isStub: boolean }> {
  const client = await tryGetMcpClient(apiKey);
  if (!client) return { workflows: [], isStub: true };

  try {
    const raw = await client.callTool({ name: "list_workflows", arguments: {} });
    const parsed = parseMcpToolContent<any>(raw);
    const list = Array.isArray(parsed) ? parsed : parsed?.workflows ?? parsed?.data ?? [];
    if (!Array.isArray(list)) return { workflows: [], isStub: false };
    const workflows = list.map((w: any) => ({
      id: w.id ?? w.workflowId,
      name: w.name,
      listedSlug: w.listedSlug ?? null,
    }));
    return { workflows, isStub: false };
  } catch {
    return { workflows: [], isStub: true };
  }
}

export async function updateWorkflowListing(
  workflowId: string,
  metadata: WorkflowListingMetadata,
  apiKey?: string,
): Promise<{ ok: boolean; isStub: boolean; listing?: unknown }> {
  if (workflowId.startsWith("wf-stub-")) return { ok: false, isStub: true };

  const client = await tryGetMcpClient(apiKey);
  if (!client) return { ok: false, isStub: true };

  try {
    const raw = await client.callTool({
      name: "update_workflow_listing",
      arguments: { workflowId, ...metadata },
    });
    const listing = parseMcpToolContent(raw);
    return { ok: true, isStub: false, listing };
  } catch {
    return { ok: false, isStub: false };
  }
}

export async function publishWorkflowListing(
  workflowId: string,
  metadata: WorkflowListingMetadata,
  apiKey?: string,
): Promise<{ ok: boolean; isStub: boolean; listing?: unknown }> {
  if (workflowId.startsWith("wf-stub-")) return { ok: false, isStub: true };

  const client = await tryGetMcpClient(apiKey);
  if (!client) return { ok: false, isStub: true };

  try {
    const raw = await client.callTool({
      name: "list_workflow",
      arguments: { workflowId, ...metadata },
    });
    const listing = parseMcpToolContent(raw);
    return { ok: true, isStub: false, listing };
  } catch (err) {
    console.warn("[MCP] list_workflow failed:", err instanceof Error ? err.message : err);
    return { ok: false, isStub: false };
  }
}

export async function searchWorkflows(
  query: string,
  options?: { category?: string; chain?: string; workflowType?: "read" | "write" },
  apiKey?: string,
): Promise<{ results: unknown[]; isStub: boolean }> {
  const client = await tryGetMcpClient(apiKey);
  if (!client) return { results: [], isStub: true };

  try {
    const raw = await client.callTool({
      name: "search_workflows",
      arguments: { query, ...options },
    });
    const parsed = parseMcpToolContent<any>(raw);
    const results = Array.isArray(parsed) ? parsed : parsed?.results ?? parsed?.workflows ?? [];
    return { results: Array.isArray(results) ? results : [], isStub: false };
  } catch {
    return { results: [], isStub: true };
  }
}

export async function callListedWorkflow(
  slug: string,
  inputs: Record<string, unknown>,
  apiKey?: string,
): Promise<{ data: unknown; isStub: boolean; is402?: boolean }> {
  const client = await tryGetMcpClient(apiKey);
  if (!client) return { data: null, isStub: true };

  try {
    const raw = await client.callTool({
      name: "call_workflow",
      arguments: { slug, inputs },
    });
    return { data: parseMcpToolContent(raw) ?? raw, isStub: false };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("402") || msg.toLowerCase().includes("payment required")) {
      return { data: { error: msg }, isStub: false, is402: true };
    }
    throw err;
  }
}

export async function updateWorkflowEnabled(
  workflowId: string,
  enabled: boolean,
  apiKey?: string,
): Promise<{ ok: boolean; isStub: boolean }> {
  if (workflowId.startsWith("wf-stub-")) return { ok: false, isStub: true };

  const client = await tryGetMcpClient(apiKey);
  if (!client) return { ok: false, isStub: true };

  try {
    await client.callTool({
      name: "update_workflow",
      arguments: { workflowId, enabled },
    });
    return { ok: true, isStub: false };
  } catch {
    return { ok: false, isStub: false };
  }
}

export async function listMcpTools(apiKey?: string): Promise<{ tools: string[]; isStub: boolean }> {
  const client = await tryGetMcpClient(apiKey);
  if (!client) return { tools: [], isStub: true };

  try {
    const res = await client.listTools();
    return { tools: res.tools.map((t) => t.name), isStub: false };
  } catch {
    return { tools: [], isStub: true };
  }
}

// 11. Cancel / Delete Workflow on KeeperHub
export async function cancelWorkflow(
  workflowId: string,
  apiKey?: string
): Promise<{ ok: boolean; isStub: boolean }> {
  if (workflowId.startsWith("wf-stub-")) return { ok: true, isStub: true };

  const effectiveKey = resolveEffectiveMcpApiKey(apiKey);
  const client = await tryGetMcpClient(apiKey);

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
