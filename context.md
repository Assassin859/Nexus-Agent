# NexusAgent — Technical Context & Integration Reference

> Internal reference document for the **Agents Onchain Hackathon (DoraHacks)** · July 27 – Aug 13, 2026.
> Read alongside `README.md` (architecture overview) and `model.md` (Zod schemas + system prompts).

---

## 1. What NexusAgent Actually Is

NexusAgent is **not** a KeeperHub clone. It is an AI decision layer built *on top of* KeeperHub's execution infrastructure.

```
User's natural language / portfolio state
         ↓
    NexusAgent (BRAIN)
    ├── Reads live on-chain positions (Aave V3, Sepolia RPC)
    ├── Thinks with LLM (OpenRouter `google/gemini-2.5-flash` via `getBrainModel()`)
    └── Decides: repay / rotate / swap / pay / hold
         ↓
    KeeperHub (HANDS)
    ├── Step 1: Simulate — dry-run before any gas is spent
    ├── Step 2: Execute — MPC wallet broadcasts with gas + MEV shield
    └── Step 3: Audit Trail — immutable log synced back to dashboard
         ↓
    NexusAgent Dashboard
    ├── Reads KeeperHub audit trail via get_execution_logs() MCP
    └── Surfaces: Live Feed, Resilience Log, Active Workflows, Alerts
```

The audit trail is a **distinct KeeperHub surface** from simulation and execution. It is the canonical record of every trigger, simulation result, and onchain outcome — and it is what makes the dashboard non-cosmetic.

---

## 2. Hackathon Details

- **Duration**: July 27 – August 13, 2026 (UTC+2)
- **Primary Rule**: Working onchain transactions are heavily prioritized over mockups
- **Upstream Repository**: `https://github.com/KeeperHub/keeperhub`
- **Cash Prizes**:
  - Grand Prize: 1st ($2,000) · 2nd ($1,200) · 3rd ($800)
  - Best Onboarding UX Bounty: $1,000 (stackable)

---

## 3. Tool Stack — Complete Reference

### 3.1 AI Brain Layer

**Package:** `@ai-sdk/openai` + `ai` (Vercel AI SDK)
**File:** `nexus-agent/src/brain/provider.ts`

```typescript
import { getBrainModel, getActiveBrainProvider } from "./provider.js";

// Priority: OPENROUTER_API_KEY → GEMINI_API_KEY → OPENAI_API_KEY → GITHUB_TOKEN
// Recommended: BRAIN_MODEL=google/gemini-2.5-flash

const model = getBrainModel(); // used in all generateObject() calls
```

**Why this matters:** Serverless inference — no Ollama, no GPU. Railway Node service stays under 100MB RAM.

**Package:** `zod` + `generateObject()`
**File:** `nexus-agent/src/brain/schemas.ts`

All 4 LLM calls use `generateObject()` with Zod schemas — the model *cannot* return unstructured text or hallucinate field names. Each schema has an `analysis` object (forces reasoning before decision) and a `recommendation` object (the actual action).

| Schema | Module | Key Fields |
|---|---|---|
| `GuardianDecisionSchema` | guardian.ts | `action: repay/supply_collateral/hold/block_transaction`, `amount` (capped at wallet balance) |
| `YieldRotatorSchema` | yield-rotator.ts | `should_rotate`, `from_protocol`, `to_protocol`, `profitable` (90-day break-even check) |
| `DCASchema` | dca.ts | `execute_swap`, `delay_minutes`, `max_slippage_percentage` (hardcoded 0.5 for MEV) |
| `PayChainSchema` | paychain.ts | `recipient_address`, `cron_schedule`, `exceedsSpendingCeiling`, `registeredWorkflowCollision` |

---

### 3.2 Blockchain / On-Chain Layer

**Package:** `ethers` v6
**Files:** `lib/aave.ts`, `lib/rpc.ts`, `lib/calldata.ts`, `modules/dca.ts`

#### RPC Multi-Failover (`lib/rpc.ts`)
Alchemy (primary) → Infura (secondary) → public Sepolia fallback. All modules call `getProvider()` — never hardcode an RPC.

#### Aave V3 Position Read (`lib/aave.ts`)
Calls `getUserAccountData(walletAddress)` on the Aave V3.2 Pool contract (`0x8bAB6d1b75f19e9eD9fCe8b9BD338844fF79aE27`, Base Sepolia).

Returns:
- `healthFactor` — 18-decimal fixed point → divided by 1e18
- `collateralUSD`, `debtUSD` — 8-decimal USD base units → divided by 1e8
- `currentUSDCSupplyAPY` — converted from `currentLiquidityRate` ray (1e27)
- `usdcWalletBalance` — ERC-20 `balanceOf()` on USDC Sepolia

If wallet has no Aave position, contract returns empty `0x` — caught silently, returns safe defaults (HF=99).

#### Calldata Encoding (`lib/calldata.ts`)
Pre-encodes ABI calldata for:
- `encodeAaveRepay(token, amount, onBehalfOf)` → `repay(address,uint256,uint256,address)`
- `encodeAaveSupply(token, amount, onBehalfOf)` → `supply(address,uint256,address,uint16)`
- `encodeUniswapSwap(amountIn, recipient)` → `exactInputSingle(ExactInputSingleParams)`
- `encodeCompoundSupply(asset, amount)` → `supply(address,uint256)`

#### Pre-flight Simulation (`lib/simulate.ts`)
Calls `provider.estimateGas()` on every calldata payload before KeeperHub execution.
- If gas estimate succeeds → `{ wouldRevert: false, gasEstimate }`
- If estimateGas throws → `{ wouldRevert: true }` + logs `reverted_simulation` to DB → surfaces in Resilience Log

---

### 3.3 KeeperHub MCP Layer

**Package:** `@modelcontextprotocol/sdk`
**File:** `nexus-agent/src/lib/mcp-client.ts`

All 10 wrapped functions gracefully fall back to stub mode if MCP connection fails (no KEEPERHUB_API_KEY set). In stub mode, workflow IDs are prefixed `wf-stub-` and execution IDs are prefixed `exec-stub-`.

| Function | MCP Tool Name | Used In | Purpose |
|---|---|---|---|
| `createWorkflow()` | `create_workflow` | All 4 modules | Register workflow with trigger type + calldata steps |
| `executeWorkflow()` | `execute_workflow` | All 4 modules | Fire a registered workflow immediately |
| `getExecutionStatus()` | `get_execution_status` | Dashboard API | Poll `pending→simulating→broadcasting→mined` |
| `getExecutionLogs()` | `get_execution_logs` | Dashboard API | Sync KeeperHub audit trail to Postgres |
| `setGasSponsorship()` | `set_gas_sponsorship` | Guardian | Enable sponsored gas (mainnet final demo) |
| `setMEVProtection()` | `set_mev_protection` | DCA, Yield | Private routing for all swaps |
| `registerWebhookTrigger()` | `register_webhook_trigger` | PayChain | Manual "Execute Now" webhook URL |
| `registerEventListener()` | `register_event_listener` | Guardian | On-chain event-driven trigger on HF drop |
| `sendKeeperNotification()` | `send_notification` | All modules | Discord/Telegram/Email alerts |
| `getFailoverRPC()` | `get_failover_rpc` | `lib/rpc.ts` | KeeperHub-managed RPC fallback |

**Live vs Stub Mode:**
- `KEEPERHUB_API_KEY` set + MCP reachable → real remote workflow IDs, real audit trail
- No key or MCP unreachable → `wf-stub-*` IDs, DB-only audit trail, all execution is simulated

---

### 3.4 Database Layer

**Package:** `drizzle-orm` + `pg`
**Files:** `nexus-agent/src/db/schema.ts`, `db/client.ts`

#### Tables

**`active_workflows`** — registered cron schedules per wallet
```
id, userWallet, type (payroll/dca/rotate), recipientAddress,
amount, cronSchedule, status (active/paused/completed)
```

**`executions_log`** — append-only audit log (feeds Live Feed + Resilience Log)
```
id, userWallet, action, amount, status
(success/reverted_simulation/pending), reason, timestamp
```

**`repayment_cycles`** — monthly budget tracker (prevents Guardian overspending)
```
id, userWallet, cycleLimitUSD, totalRepaidThisCycleUSD, cycleStartDate
```

#### Simulation → Resilience Log Flow
When `simulate()` catches a revert, it inserts `status: "reverted_simulation"` into `executions_log`. The `/resilience` page filters for this status and displays it as "Caught Revert — Gas Saved."

---

### 3.5 Agent HTTP API (`nexus-agent/src/index.ts`)

Runs on **port 3001** (Express).

| Endpoint | Method | What it does |
|---|---|---|
| `/health` | GET | Returns `{ status: "ok" }` |
| `/api/portfolio/:wallet` | GET | Live Aave position + DB workflows in parallel |
| `/api/feed/:wallet` | GET | Last 50 `executions_log` entries, descending |
| `/api/payroll` | POST | Triggers PayChain NL parser |
| `/api/trigger/guardian` | POST | Manually fires Guardian for a wallet |
| `/api/trigger/dca` | POST | Manually fires DCA for a wallet |
| `/api/trigger/yield` | POST | Manually fires Yield Rotator for a wallet |

#### Background Cron Loops
```
Guardian   → */5  * * * *   (every 5 minutes)
Yield      → */15 * * * *   (every 15 minutes)
DCA        → 0   * * * *    (every hour)
```

---

### 3.6 Dashboard API Routes (`nexus-dashboard/app/api/`)

Next.js App Router route handlers that proxy to `nexus-agent` on port 3001.

| Route | Proxies To |
|---|---|
| `/api/portfolio/[wallet]` | `http://localhost:3001/api/portfolio/:wallet` |
| `/api/feed/[wallet]` | `http://localhost:3001/api/feed/:wallet` |
| `/api/chat` | `http://localhost:3001/api/payroll` + yield/DCA triggers |

---

## 4. Aave V3 Health Factor Math

$$\text{Health Factor} = \frac{\sum (C_i \times LT_i)}{\sum D_i}$$

Where:
- $C_i$ = collateral value in USD (8-decimal base units ÷ 1e8)
- $LT_i$ = liquidation threshold (basis points ÷ 10000)
- $D_i$ = debt value in USD

**Guardian thresholds:**
- HF > 1.40 + stable market → `hold`
- HF < 1.15 → `repay` or `supply_collateral`
- HF < 1.05 → emergency unwind

---

## 5. OpenRouter Setup

1. Create key at [openrouter.ai/keys](https://openrouter.ai/keys)
2. Add to `.env`:
   ```env
   OPENROUTER_API_KEY=sk-or-v1-...
   BRAIN_MODEL=google/gemini-2.5-flash
   ```
3. Smoke test: `pnpm --prefix nexus-agent exec tsx src/scripts/test-openrouter-smoke.ts`

Fallback chain: `GEMINI_API_KEY` → `OPENAI_API_KEY` → `GITHUB_TOKEN` (legacy).

---

## 6. Current Execution Status (August 2026)

| Component | Status | Impact |
|---|---|---|
| Aave V3.2 position reads | ✅ **Real** | Live Base Sepolia data |
| AI decisions | ✅ **Real** | OpenRouter `gemini-2.5-flash` |
| Calldata encoding | ✅ **Real** | Aave, Uniswap, Compound on Base Sepolia |
| Gas estimation simulation | ✅ **Real** | `estimateGas` on Base Sepolia RPC |
| Postgres audit log | ✅ **Real** | Railway DB |
| Guardian at HF ~3.26 | ✅ **hold** | No broadcast (correct behavior) |
| Guardian repay (HF ~1.05) | ✅ **mined** | 2 BaseScan txs; HF → ~1.32 |
| KeeperHub on-chain tx | ✅ **Verified** (repay) | Requires `kh_...` key + funded agentic wallet |
| Yield on-chain rotate | ⚠️ **Skipped** | Dual-wallet unless addresses aligned |

**Honest demo:** Lead with Portfolio + Chat + Feed repay proof (BaseScan) + Resilience simulation cards.
