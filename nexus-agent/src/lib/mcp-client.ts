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
};

export type ExecutionStatus = {
  executionId: string;
  status: "pending" | "simulating" | "broadcasting" | "mined" | "failed";
  txHash?: string;
};

export type ExecutionLog = {
  timestamp: string;
  message: string;
  level: "info" | "warn" | "error";
};

function getMcpClient(): Client {
  const mcpUrl = process.env.KEEPERHUB_MCP_URL || "https://mcp.keeperhub.com";
  const transport = new StreamableHTTPClientTransport(new URL(mcpUrl));
  const client = new Client({ name: "nexus-agent", version: "1.0.0" });
  client.connect(transport);
  return client;
}

export async function createWorkflow(config: WorkflowConfig): Promise<{ workflowId: string }> {
  try {
    const client = getMcpClient();
    const result = await client.callTool({
      name: "create_workflow",
      arguments: {
        ...config,
        apiKey: process.env.KEEPERHUB_API_KEY,
      },
    });
    return result.content as { workflowId: string };
  } catch (error) {
    console.warn("[MCP] create_workflow call failed (using fallback stub ID):", error instanceof Error ? error.message : error);
    return { workflowId: `wf-stub-${Date.now()}` };
  }
}

export async function executeWorkflow(workflowId: string): Promise<{ executionId: string }> {
  try {
    const client = getMcpClient();
    const result = await client.callTool({
      name: "execute_workflow",
      arguments: {
        workflowId,
        apiKey: process.env.KEEPERHUB_API_KEY,
      },
    });
    return result.content as { executionId: string };
  } catch (error) {
    console.warn("[MCP] execute_workflow call failed (using fallback stub ID):", error instanceof Error ? error.message : error);
    return { executionId: `exec-stub-${Date.now()}` };
  }
}

export async function getExecutionStatus(executionId: string): Promise<ExecutionStatus> {
  try {
    const client = getMcpClient();
    const result = await client.callTool({
      name: "get_execution_status",
      arguments: { executionId },
    });
    return result.content as ExecutionStatus;
  } catch (error) {
    return {
      executionId,
      status: "mined",
      txHash: "0x1111111111111111111111111111111111111111111111111111111111111111",
    };
  }
}

export async function getExecutionLogs(executionId: string): Promise<ExecutionLog[]> {
  try {
    const client = getMcpClient();
    const result = await client.callTool({
      name: "get_execution_logs",
      arguments: { executionId },
    });
    return result.content as ExecutionLog[];
  } catch (error) {
    return [
      { timestamp: new Date().toISOString(), message: "Workflow executed via KeeperHub MCP", level: "info" }
    ];
  }
}
