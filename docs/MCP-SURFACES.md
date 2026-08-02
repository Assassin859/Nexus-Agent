# NexusAgent — KeeperHub MCP Surfaces

> **Last verified:** 2026-08-02 · **Warm-up:** `pnpm --prefix nexus-agent run surfaces`

NexusAgent integrates with [KeeperHub MCP](https://app.keeperhub.com/mcp) for workflow creation, execution, marketplace listings, and agentic wallet signing.

---

## Tools NexusAgent calls

| MCP tool | Wrapper in `mcp-client.ts` | Used by |
|----------|---------------------------|---------|
| `create_workflow` | `createWorkflow`, `createWorkflowRaw` | PayChain, DCA, Guardian, marketplace, Tempo proof |
| `execute_workflow` | `executeWorkflow` | All module triggers |
| `get_execution` / `get_execution_status` | `getExecutionStatus`, `pollExecutionUntilSettled` | Post-broadcast polling |
| `get_execution_logs` | `getExecutionLogs` | Feed sync, Tempo proof |
| `delete_workflow` | `cancelWorkflow` | Workflow cleanup |
| `list_workflows` | `listOrgWorkflows` | Publish script idempotency |
| `validate_workflow` | `validateWorkflowGraph` | Pre-list validation |
| `list_workflow` | `publishWorkflowListing` | Marketplace publish |
| `update_workflow_listing` | `updateWorkflowListing` | Set x402 price before list |
| `search_workflows` | `searchWorkflows` | Discover listings |
| `call_workflow` | `callListedWorkflow` | External agent HF-read calls |
| `set_gas_sponsorship` | `setGasSponsorship` | Surface test #7 |
| `set_mev_protection` | `setMEVProtection` | Surface test #8 |
| `register_webhook_trigger` | `registerWebhookTrigger` | Surface test #9 |
| `register_event_listener` | `registerEventListener` | Surface test #10 |
| `send_notification` | `sendKeeperNotification` | Surface test #11 |
| `get_failover_rpc` | `getFailoverRPC` | Surface test #12 |
| `execute_transfer` | (direct in `fund-agentic-wallet.ts`) | Wallet funding |

**Not yet exposed upstream (blocked):** `tempo_sign_and_hold`, `tempo_release_hold` — see [Sign & Hold](#sign--hold-friction-03) below.

---

## 17 local surface checks (`test-all-surfaces.mjs`)

| # | Check | What it proves |
|---|-------|----------------|
| 1 | Agent `/health` | Express API up |
| 2 | Portfolio API (HF read) | Live Aave V3.2 on Base Sepolia |
| 3 | `create_workflow` | MCP write path |
| 4 | `execute_workflow` | Execution kick-off |
| 5 | `get_execution_status` | Status polling |
| 6 | `get_execution_logs` | Log retrieval |
| 7 | Gas sponsorship | Workflow config surface |
| 8 | MEV protection | Workflow config surface |
| 9 | Webhook trigger | Cron/webhook registration |
| 10 | Event listener | Event-driven trigger |
| 11 | Notification | Telegram/Discord/email (may stub on free tier) |
| 12 | Failover RPC | Multi-RPC fallback |
| 13 | Guardian trigger | `/api/trigger/guardian` |
| 14 | Yield rotator trigger | `/api/trigger/yield` |
| 15 | DCA trigger | `/api/trigger/dca` |
| 16 | PayChain NL parser | `/api/payroll` chat path |
| 17 | Live feed API | Postgres `executions_log` |

Run: `pnpm --prefix nexus-agent run surfaces` (requires local agent on `:3001` or set `AGENT_URL`).

Probe MCP directly: `pnpm --prefix nexus-agent exec tsx src/scripts/probe-mcp.ts`

---

## Production workflow IDs

| Workflow | ID / slug | Purpose |
|----------|-----------|---------|
| PayChain payroll | `iu0toy0rena606e07ikxu` | Cron payroll demo |
| HF-read marketplace | `nexus-guardian-hf-read` (id: `15a4yssu4dkcim8fq3o70`) | Callable read-only HF snapshot ($0.01/call) |
| Tempo proof | **4 mined txs** (Aug 2026) | Latest WF [`gkkbpagufwiqb49ik0ygb`](https://app.keeperhub.com/workflows/gkkbpagufwiqb49ik0ygb) · [tx #4](https://explore.testnet.tempo.xyz/tx/0x36a595cace20493791aeab8400f7ff9633fcafbbb3c5da136604658cde1554fd) · [full table](../submission_runbook.md) |

Publish HF listing: `pnpm --prefix nexus-agent run marketplace:publish-hf`

---

## Marketplace listing (Tier 2)

**Slug:** `nexus-guardian-hf-read`  
**Type:** read-only · **Chain:** Base Sepolia (84532)  
**Price:** $0.01 USDC/call (x402 for external agents)

Topology: Manual trigger → `web3/read-contract` `getUserAccountData` on Aave V3 pool `0x8bAB6d…`.

External agents discover via `search_workflows` and invoke via `call_workflow` with `{ "walletAddress": "0x…" }`.

---

## Tempo proof (Tier 2)

**Chain:** Moderato testnet (42431) · **Action:** `tempo/transfer-with-memo`  
**Script:** `pnpm --prefix nexus-agent run tempo:proof` (each run creates a new workflow + tx; logged to `executions_log`)

**Proof txs (4):** See [submission_runbook.md](../submission_runbook.md) § Tempo proof table.

See [submission_runbook.md](../submission_runbook.md) § Tempo Moderato funding for wallet setup.

---

## Sign & Hold (FRICTION-03)

**Status:** Blocked on upstream MCP — tools not in `list_tools` as of Aug 2026.

**Intended Guardian flow** (when KeeperHub exposes hold/release):

```
HF < 1.40 (warning)  → build repay calldata → tempo_sign_and_hold → store holdId
HF < 1.15 (critical) → tempo_release_hold(holdId)  (~0.5s vs ~3–5s reactive)
```

Probe: `pnpm --prefix nexus-agent exec tsx src/scripts/probe-mcp.ts` — Step 2 lists all MCP tools; confirm `tempo_sign_and_hold` / `tempo_release_hold` absent.

Filed in [BUGS.md](../BUGS.md) FRICTION-03.

---

## Known gaps

| Issue | Doc |
|-------|-----|
| OAuth ≠ API key handoff | [BUG-02](BUGS.md) |
| MCP cold-start stubs | Warm with `pnpm run surfaces`; retry in `mcp-client.ts` |
| Sign & Hold not in MCP | [FRICTION-03](BUGS.md) |
| Tempo execution polling on prod | [BUG-07](BUGS.md) — repro with `tempo:proof` |
| Free-tier notify nodes 402 | [BUG-09](BUGS.md) |

---

## Verify

```bash
pnpm --prefix nexus-agent run verify              # unit harness
pnpm --prefix nexus-agent run surfaces            # 17 MCP + module checks
pnpm --prefix nexus-agent run marketplace:publish-hf
pnpm --prefix nexus-agent run tempo:proof         # Moderato transfer-with-memo proof
pnpm --prefix nexus-agent exec tsx src/scripts/probe-mcp.ts
```
