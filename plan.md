# NexusAgent — Module Build Plan

**Hackathon:** Agents Onchain (DoraHacks) · **Dates:** July 27 – Aug 13, 2026
**Stack:** Node.js (nexus-agent) + Next.js 14 (nexus-dashboard) + Postgres (Railway)
**Chain:** Ethereum Sepolia (build/test) -> Mainnet (final sponsored tx)

---

## Production Audit Remediation Roadmap (Comprehensive 27-Issue Audit Plan)

### Phase 6: P0 Critical Broken / Unsafe Logic Fixes
- [x] **Task 6.1: Chat API Field Mismatch** — Map `message` / `userMessage` in Next.js proxy and agent `index.ts`.
- [ ] **Task 6.2: Monitored Wallet vs Agentic Wallet Conflation** — Disambiguate `userWallet` (portfolio being watched) vs `AGENTIC_WALLET` (KeeperHub MPC signer) in `yield-rotator.ts`, `guardian.ts`, and `dca.ts`. Restrict token withdrawals & debt repays to actual balances owned by `userWallet` and specify proper `onBehalfOf`.
- [ ] **Task 6.3: Yield Rotator Collateral Balance Bug** — Update `yield-rotator.ts` to use actual supplied USDC token balance instead of `position.collateralUSD` (which includes WETH/other collateral).
- [ ] **Task 6.4: DCA Registration Path & Templates** — Add `registerDCAWorkflow` tool to `agent-tools.ts` and wire `nexus-dashboard/app/templates/page.tsx` DCA template button to register active `dca` workflows.
- [ ] **Task 6.5: MCP Tool Response Content Parser** — Update `mcp-client.ts` to safely parse standard MCP content array `[{ type: "text", text: "..." }]` instead of assuming flat object shape, preventing unwanted fallback to `wf-stub-*`. Add retries for cold starts.
- [ ] **Task 6.6: Repayment Cycle Expiry Enforcement** — Enforce `cycleEnd` rollover logic in `guardian.ts` to reset cycle budget after 30 days.
- [ ] **Task 6.7: Stale Pending Lock Expiry** — Add 15-minute TTL to `status: "pending"` locks in `guardian.ts` so stuck runs do not deadlock Guardian indefinitely.
- [ ] **Task 6.8: ERC20 Approvals Generation** — Prepend `approve()` step in calldata generation for Aave, Compound, and Uniswap V3 interactions if allowance is insufficient.

### Phase 7: P1 Security, Data Integrity & Auth Fixes
- [x] **Task 7.1: `keeperhub-sync.ts` Log Sync** — Filter out stub log messages and safely sync execution logs per workflow.
- [ ] **Task 7.2: KeeperHub OAuth & Key Persistence** — Update OAuth callback in `/auth/keeperhub/callback` to exchange session token for user API key and persist to `/api/user/settings`.
- [ ] **Task 7.3: Production JWT Secret Guard** — Require explicit `JWT_SECRET` in non-development environments in `auth.ts`.
- [ ] **Task 7.4: Wallet Address Normalization** — Apply `.toLowerCase()` consistently across DB queries in PayChain, Guardian, `user_settings`, and `executions_log`.
- [ ] **Task 7.5: PayChain Multi-Member Team Transaction Rollback** — Wrap team payout workflow creation in a DB transaction or pre-flight check so partial failures don't leave orphaned DB rows.
- [ ] **Task 7.6: PayChain Team Remainder Cent Distribution** — Fix `Math.floor(amount / count)` cent loss by assigning remainder cents to the final team payee.
- [ ] **Task 7.7: MCP Boolean Return Error Handling** — Fix `sendKeeperNotification` and `setGasSponsorship` in `mcp-client.ts` to return `false` on failure instead of hiding errors with `return true`.

### Phase 8: P2 Medium Priority UX, Misleading UI & Module Alignment
- [ ] **Task 8.1: Sidebar Connection State Accuracy** — Update `Sidebar.tsx` to distinguish SIWE (Web3 wallet) from active KeeperHub MCP API Key connection.
- [ ] **Task 8.2: Alerts Page Event Classification** — Exclude successful `repay` actions from `isDanger` classification in `nexus-dashboard/app/alerts/page.tsx`.
- [ ] **Task 8.3: Dynamic APY Table on Portfolio Page** — Replace hardcoded Morpho/Compound APYs on `/` with live on-chain APY data fetched from `/api/portfolio`.
- [ ] **Task 8.4: Interactive Dashboard Workflow Templates** — Update template buttons on `/templates` to execute real API creation calls rather than just filling chat prompts.
- [ ] **Task 8.5: Chat Auth Error Transparency** — Require SIWE auth token for chat requests or surface explicit auth warnings in UI instead of silent proxy fallback.
- [ ] **Task 8.6: Resilience Page Status Mapping** — Fix `/resilience` status filter to map `delayed` status for DCA gas delays and reserve `pending` for in-flight executions.
- [ ] **Task 8.7: README & Marketing Drift Correction** — Align `README.md` documentation with implemented model (`gpt-4o` / `gpt-4o-mini`), active protocols (Aave V3 & Compound V3 on Sepolia), and OAuth auth flow.

### Phase 9: P3 Code Hygiene, Infrastructure & Ops
- [ ] **Task 9.1: Robust Dotenv Path Resolution** — Replace relative `"../.env"` path in `index.ts` with `fileURLToPath(import.meta.url)` path resolution.
- [ ] **Task 9.2: Seed Data Hex Address Correction** — Fix invalid hex address `0xrisk000...` in `seed.ts` with a valid checksummed test address.
- [ ] **Task 9.3: Monorepo Workspace Cleanup** — Consolidate duplicate draft schemas into `nexus-agent/src/brain/schemas.ts` and clean up unused dependencies.
- [ ] **Task 9.4: Payee Name Matching Unification** — Standardize payee name string matching in `paychain.ts` using strict case-insensitive equality or word boundaries rather than substring matching.
- [ ] **Task 9.5: Guardian Prompt Context Enhancement** — Pass real `executionHistory` and dynamic `priceTrend` in `guardian.ts` prompt context.
- [ ] **Task 9.6: In-Memory Cron & Alert Throttle Persistence** — Add TTL / redis backing or atomic DB lock guards for background cron runs to prevent duplicate executions across multiple process replicas.

---

## Module Map

| # | Module | Service | Depends On |
|---|---|---|---|
| M1 | Database | nexus-agent | — |
| M2 | AI Brain & Schemas | nexus-agent | — |
| M3 | KeeperHub MCP Client | nexus-agent | — |
| M4 | RPC & Simulation | nexus-agent | M3 |
| M5 | Guardian Module | nexus-agent | M1, M2, M3, M4 |
| M6 | Yield Rotator Module | nexus-agent | M1, M2, M3, M4 |
| M7 | DCA Engine Module | nexus-agent | M1, M2, M3, M4 |
| M8 | PayChain Module | nexus-agent | M1, M2, M3 |
| M9 | Agent API Server | nexus-agent | M5, M6, M7, M8 |
| M10 | Dashboard | nexus-dashboard | M9 |
| M11 | Upstream PRs | keeperhub fork | — |

---

## M1 — Database

**Service:** `nexus-agent`
**Purpose:** Define the Postgres schema using Drizzle ORM. Provide a singleton DB client. Seed demo data for hackathon judges. This is the source of truth for all stateful memory the AI brain uses to avoid hallucinations and execution collisions.

### Why This Exists

The LLM has no memory between calls. Without a database:
- The Guardian module would double-repay the same loan
- The PayChain module would create duplicate payroll workflows
- There is no cycle budget enforcement

Every module reads from and writes to these tables to give the brain full context.

---

### Files

#### `nexus-agent/src/db/schema.ts`

Three tables. Every table has `user_wallet varchar(42)` as the multi-tenant isolation key.

**Table 1: `repayment_cycles`**
Tracks how much has been repaid in the current budget cycle per wallet. Prevents the brain from recommending a $1000 repay when only $50 of the $1000 monthly budget remains.

```ts
import { pgTable, uuid, varchar, integer, timestamp } from "drizzle-orm/pg-core";

export const repaymentCycles = pgTable("repayment_cycles", {
  id: uuid("id").defaultRandom().primaryKey(),
  userWallet: varchar("user_wallet", { length: 42 }).notNull(),
  cycleStart: timestamp("cycle_start").notNull(),
  cycleEnd: timestamp("cycle_end").notNull(),
  cycleLimitUSD: integer("cycle_limit_usd").notNull(),
  totalRepaidThisCycleUSD: integer("total_repaid_this_cycle_usd").default(0),
});
```

**Table 2: `active_workflows`**
Stores every registered automation. The unique index on `(user_wallet, recipient_address, status)` prevents duplicate payroll workflows for the same recipient.

```ts
import { pgTable, uuid, varchar, integer, uniqueIndex } from "drizzle-orm/pg-core";

export const activeWorkflows = pgTable("active_workflows", {
  id: uuid("id").defaultRandom().primaryKey(),
  userWallet: varchar("user_wallet", { length: 42 }).notNull(),
  type: varchar("type").notNull(),
  recipientAddress: varchar("recipient_address", { length: 42 }),
  amount: integer("amount").notNull(),
  cronSchedule: varchar("cron_schedule", { length: 100 }),
  status: varchar("status", { length: 20 }).default("active"),
}, (table) => ({
  uniquePayroll: uniqueIndex("unique_active_payroll").on(
    table.userWallet, table.recipientAddress, table.status
  ),
}));
```

**Table 3: `executions_log`**
Audit trail for every run — happy paths, simulations, and caught reverts.

```ts
export const executionsLog = pgTable("executions_log", {
  id: uuid("id").defaultRandom().primaryKey(),
  userWallet: varchar("user_wallet", { length: 42 }).notNull(),
  workflowId: uuid("workflow_id").references(() => activeWorkflows.id),
  action: varchar("action").notNull(),
  amount: integer("amount").notNull(),
  status: varchar("status").notNull(), // 'success' | 'reverted_simulation' | 'reverted_chain'
  reason: varchar("reason"),
  txHash: varchar("tx_hash", { length: 66 }),
  timestamp: timestamp("timestamp").defaultNow(),
});
```

#### `nexus-agent/src/db/client.ts`

```ts
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
export const db = drizzle(pool, { schema });
export { pool };
```

#### `nexus-agent/src/db/seed.ts`

Seeds two demo wallets for judges:

**Wallet A — Safe** `0xSafe0000000000000000000000000000000000001`
- `repayment_cycles`: limit $1000, spent $0
- `active_workflows`: 1 active DCA (100 USDC to ETH, cron `0 9 * * 1`)
- `executions_log`: 1 past successful swap

**Wallet B — Risk** `0xRisk0000000000000000000000000000000000002`
- `repayment_cycles`: limit $1000, spent $950 — $50 remaining
- `active_workflows`: 1 pending guardian workflow
- `executions_log`: 1 reverted simulation (reason: `Insufficient allowance`)

Run with: `pnpm db:seed`

#### `nexus-agent/drizzle.config.ts`

```ts
import type { Config } from "drizzle-kit";
export default {
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  driver: "pg",
  dbCredentials: { connectionString: process.env.DATABASE_URL! },
} satisfies Config;
```

### Folder Output

```
nexus-agent/
├── drizzle.config.ts
└── src/db/
    ├── schema.ts
    ├── client.ts
    └── seed.ts
```

### Done When
- [ ] All three tables defined with correct Drizzle types
- [ ] `client.ts` exports working `db` singleton
- [ ] `seed.ts` inserts both demo wallets successfully
- [ ] `pnpm db:migrate` runs without errors

---

## M2 — AI Brain & Schemas

**Service:** `nexus-agent`
**Purpose:** Configure the GitHub Models API provider and define all four Reasoning-First Zod schemas.

### Why This Exists

Raw LLM output is unpredictable. Without schemas the model recommended repaying $1,500 when the wallet only held $500. The **Reasoning-First** pattern forces the model to compute bounds checks BEFORE outputting the transaction amount — by making `analysis` and `userExplanation` precede `recommendation` in the schema.

### Files

#### `nexus-agent/src/brain/provider.ts`

```ts
import { createOpenAI } from "@ai-sdk/openai";

export const githubModels = createOpenAI({
  baseURL: "https://models.inference.ai.azure.com",
  apiKey: process.env.GITHUB_TOKEN!,
});

export const BRAIN_MODEL = "meta-llama-3.3-70b-instruct";
```

#### `nexus-agent/src/brain/schemas.ts`

Exports all 4 schemas + system prompts. Each schema follows: `analysis` -> `userExplanation` -> `recommendation`.

**GuardianDecisionSchema** — analysis block includes: `collateralValueUSD`, `debtValueUSD`, `currentHealthFactor`, `requiredRepaymentToTargetHF`, `walletLimitExceeded`, `cycleRemainingBudgetUSD`, `safetyStatus`. Recommendation actions: `repay | supply_collateral | hold | block_transaction`.

**GUARDIAN_SYSTEM_PROMPT** rules:
1. CYCLE LOCK: If pending tx exists in DB, output `block_transaction`
2. WALLET CAP: `recommendation.amount` never exceeds `walletBalance`
3. BUDGET CAP: `recommendation.amount` never exceeds `cycleRemainingBudget`
4. HOLD: If HF > 1.40 and trend is stable, always hold
5. CRASH: If trend is crash, repay even if HF is temporarily safe
6. HF < 1.15: repay or supply_collateral

**YieldRotatorSchema** — analysis: `apyDelta`, `estimatedGasUSD`, `estimated90DayProfitUSD`, `breakEvenDays`, `profitable`. `profitable` is true only if `breakEvenDays <= 45`.

**YIELD_ROTATOR_SYSTEM_PROMPT** rules:
1. NET PROFIT: Only rotate if 90-day gain covers gas cost
2. BREAK-EVEN CAP: `breakEvenDays > 45` -> `should_rotate: false`
3. SAME RATE: Within 0.1% APY -> `should_rotate: false`

**DCASchema** — analysis: `gasAsPercentageOfPurchase`, `gasLimitExceeded`. Recommendation: `execute_swap`, `delay_minutes`, `max_slippage_percentage` (always 0.5).

**DCA_SYSTEM_PROMPT** rules:
1. GAS THRESHOLD: gas > 5% of purchase -> `execute_swap: false`, `delay_minutes: 60`
2. SLIPPAGE: Always exactly 0.5 — non-negotiable

**PayChainSchema** — analysis: `exceedsSpendingCeiling`, `registeredWorkflowCollision`, `recipientAddressValid`. Recommendation: `recipient_address` (validated regex), `cron_schedule`, `verification_required`.

**PAYCHAIN_SYSTEM_PROMPT** rules:
1. ADDRESS: Must match `0x[40 hex chars]` — invalid -> `verification_required: true`
2. TOKEN: Default USDC if user says dollars/stablecoin
3. CRON: weekly -> `0 9 * * 1`, biweekly -> `0 9 1,15 * *`, monthly -> `0 9 1 * *`
4. CEILING: amount > 1000 USDC -> `exceedsSpendingCeiling: true` + `verification_required: true`
5. COLLISION: existing active workflow for recipient -> `verification_required: true`

### Folder Output

```
nexus-agent/src/brain/
├── provider.ts
└── schemas.ts
```

### Done When
- [ ] `provider.ts` exports `githubModels` and `BRAIN_MODEL`
- [ ] All 4 schemas typed with `z.infer<>` type exports
- [ ] All 4 system prompts exported as `const` strings
- [ ] No duplicate definitions with `draft-schemas/` folder

---

## M3 — KeeperHub MCP Client

**Service:** `nexus-agent`
**Purpose:** Typed wrapper around the KeeperHub MCP SDK. All modules call this instead of raw HTTP — centralizes auth, error handling, and retry logic.

### KeeperHub MCP Surfaces Used
- `create_workflow` — register a new workflow
- `execute_workflow` — trigger execution
- `get_execution_status` — poll current status
- `get_execution_logs` — sync logs to local DB

### Files

#### `nexus-agent/src/lib/mcp-client.ts`

Exported types: `WorkflowConfig`, `WorkflowStep`, `ExecutionStatus`, `ExecutionLog`

WorkflowStep fields: `type: "transaction"`, `to`, `calldata`, `value?`, `gasStrategy?: "standard" | "fast" | "sponsored"`

Exported functions:
```
createWorkflow(config: WorkflowConfig): Promise<{ workflowId: string }>
executeWorkflow(workflowId: string): Promise<{ executionId: string }>
getExecutionStatus(executionId: string): Promise<ExecutionStatus>
getExecutionLogs(executionId: string): Promise<ExecutionLog[]>
```

ExecutionStatus.status: `"pending" | "simulating" | "broadcasting" | "mined" | "failed"`

Auth: `KEEPERHUB_API_KEY` from env, `KEEPERHUB_MCP_URL` from env.

### Folder Output

```
nexus-agent/src/lib/
└── mcp-client.ts
```

### Done When
- [ ] All 4 functions exported with correct TypeScript types
- [ ] `KEEPERHUB_API_KEY` and `KEEPERHUB_MCP_URL` read from env (never hardcoded)
- [ ] No global client singleton that leaks between requests

---

## M4 — RPC & Simulation

**Service:** `nexus-agent`
**Purpose:** Multi-endpoint Ethereum RPC with silent failover, and pre-flight simulation that saves gas by catching reverts before broadcast.

### Files

#### `nexus-agent/src/lib/rpc.ts`

Provider factory with ordered fallback:
1. `ALCHEMY_RPC_URL` env var
2. `INFURA_RPC_URL` env var
3. `https://rpc.sepolia.org` (public — always available)

Exports `getProvider(): Promise<JsonRpcProvider>`
- Caches the last working provider
- Re-validates cache with `getBlockNumber()` before returning
- Logs which endpoint is in use

#### `nexus-agent/src/lib/simulate.ts`

```
simulate(tx: TxPayload, userWallet: string): Promise<SimulationResult>
```

TxPayload: `{ from, to, data, value? }`
SimulationResult: `{ wouldRevert: boolean, gasEstimate: bigint, revertReason?: string }`

On revert:
- Writes `executions_log` row with `status: "reverted_simulation"` and `reason`
- Returns `{ wouldRevert: true, gasEstimate: 0n }`
- Caller checks result and skips `executeWorkflow()` if `wouldRevert: true`
- **Zero gas is wasted** — this feeds the "Caught Revert" column in the Resilience Log

### Folder Output

```
nexus-agent/src/lib/
├── rpc.ts
└── simulate.ts
```

### Done When
- [ ] `getProvider()` silently fails over to next endpoint on RPC error
- [ ] `simulate()` catches reverts and writes to `executions_log` before returning
- [ ] No `any` types in either file

---

## M5 — Guardian Module

**Service:** `nexus-agent`
**Purpose:** Monitor Aave V3 health factors and execute repay/supply actions when liquidation risk is detected.

**Aave V3 Pool (Sepolia):** `0x6Ae43d3271ff68408378a467C62b15264c8d77e4`
**Trigger:** Cron every 5 min + manual override endpoint

### Decision Table

| Condition | Action |
|---|---|
| HF > 1.40 + stable price | hold |
| HF 1.15 – 1.40 | warning log, no tx |
| HF < 1.15 | repay or supply_collateral |
| HF < 1.05 | full unwind swap |
| Pending tx exists in DB | block_transaction |
| Wallet balance < needed | partial repay (capped) |
| Cycle budget exhausted | block_transaction |

### Files

#### `nexus-agent/src/modules/guardian.ts`

Exported function: `run(userWallet: string): Promise<void>`

Execution flow:
1. `readAaveHealthFactor(provider, wallet)` -> current HF
2. Query `repayment_cycles` for remaining budget
3. Query `executions_log` for any `status: "pending"` entries
4. `readWalletBalance(provider, wallet)` -> USDC balance
5. `generateObject({ model, schema: GuardianDecisionSchema, system: GUARDIAN_SYSTEM_PROMPT, prompt: JSON.stringify({ healthFactor, walletBalance, cycleRemainingBudget, executionHistory, priceTrend }) })`
6. If `action === "hold" || "block_transaction"` -> log to `executions_log`, return
7. Build repay calldata for Aave V3 Pool
8. `simulate(txPayload, userWallet)` -> abort if `wouldRevert`
9. `createWorkflow(...)` -> `executeWorkflow(workflowId)`
10. Insert success row to `executions_log`

Internal stubs (replaced in Phase 8): `readAaveHealthFactor`, `readWalletBalance`, `buildRepayCalldata`

### Folder Output

```
nexus-agent/src/modules/
└── guardian.ts
```

### Done When
- [ ] `run(wallet)` completes the full loop: read -> brain -> simulate -> MCP -> log
- [ ] `block_transaction` and `hold` exit cleanly without broadcasting
- [ ] Amount is always `min(walletBalance, cycleRemaining)` enforced by brain schema

---

## M6 — Yield Rotator Module

**Service:** `nexus-agent`
**Purpose:** Maximize stablecoin yield by rotating between Aave, Compound, and Morpho when APY delta covers gas cost within 45 days.

**Trigger:** Cron `*/15 * * * *`

### Decision Logic

| Condition | Action |
|---|---|
| apyDelta < 0.1% | no rotation |
| breakEvenDays > 45 | no rotation |
| should_rotate: true | 3-step bundle: withdraw -> swap -> deposit |

### Files

#### `nexus-agent/src/modules/yield-rotator.ts`

Exported function: `run(userWallet: string): Promise<void>`

Execution flow:
1. `fetchProtocolRates()` -> APY from Aave, Compound, Morpho (stubbed)
2. `generateObject({ schema: YieldRotatorSchema, system: YIELD_ROTATOR_SYSTEM_PROMPT, prompt: JSON.stringify({ currentProtocol, currentAPY, targetAPY, estimatedGasUSD, userBalance }) })`
3. If `should_rotate: false` -> log and return
4. Build 3-step WorkflowConfig: withdraw from current + swap + deposit to target
5. `simulate(steps[0], userWallet)` -> abort if revert
6. `createWorkflow(config)` -> `executeWorkflow(workflowId)`
7. Insert `executions_log` row with `action: "rotate"`

Internal stubs: `fetchProtocolRates()` — returns hardcoded Aave/Morpho APYs

### Done When
- [ ] Cron initialized in `src/index.ts` on startup
- [ ] `should_rotate: false` exits cleanly with log message
- [ ] 3-step bundle structure matches `WorkflowConfig` type from M3

---

## M7 — DCA Engine Module

**Service:** `nexus-agent`
**Purpose:** Execute scheduled USDC to ETH/wBTC swaps via Uniswap V3. Uses KeeperHub MEV protection (private routing). Final mainnet demo uses gas sponsorship.

**Uniswap V3 Router (Sepolia):** `0xE592427A0AEce92De3Edee1F18E0157C05861564`
**Trigger:** Per-wallet cron from `active_workflows.cron_schedule`

### Gas Logic

| Gas % of purchase | Action |
|---|---|
| > 5% | delay 60 min, log reason |
| <= 5% | execute immediately, slippage 0.5% |

### Files

#### `nexus-agent/src/modules/dca.ts`

Exported function: `run(userWallet: string): Promise<void>`

Execution flow:
1. Query `active_workflows` for `type: "dca"` and `status: "active"`
2. If no workflow found, return early
3. Estimate gas (stubbed as $6 until Phase 8 wires real estimator)
4. `generateObject({ schema: DCASchema, system: DCA_SYSTEM_PROMPT, prompt: JSON.stringify({ purchaseAmountUSD: workflow.amount, estimatedGasUSD, sourceAsset: "USDC", targetAsset: "ETH" }) })`
5. If `execute_swap: false` -> insert `executions_log` with reason, return
6. `buildUniswapCalldata(amount, slippage)` (stub)
7. `simulate(txPayload, userWallet)` -> abort if revert
8. `createWorkflow({ triggerType: "manual", gasStrategy: "standard" })` -> `executeWorkflow()`
9. Insert `executions_log` success row

Slippage is hardcoded read from brain schema (`max_slippage_percentage`), always 0.5%.

### Done When
- [ ] Reads cron schedule from `active_workflows` table (not hardcoded)
- [ ] Gas-too-high path delays and logs without executing
- [ ] Slippage cannot be overridden to anything other than 0.5%

---

## M8 — PayChain Module

**Service:** `nexus-agent`
**Purpose:** Parse natural language payroll commands into structured recurring payment workflows. Enforces spending ceilings and collision detection via Three-Tier Safety Hooks.

**Trigger:** `POST /api/payroll` with `{ userMessage: string, walletAddress: string }`

### Safety Gates (in order)

1. Address validation — must match `0x[40 hex chars]`
2. Spending ceiling — amount > $1,000 USDC requires confirmation
3. Collision detection — one active payroll per recipient (unique DB index)

### Files

#### `nexus-agent/src/modules/paychain.ts`

Exported types: `PaychainRequest { userMessage, walletAddress }`, `PaychainResponse { success, verification_required, message, workflowId? }`

Exported function: `handle(req: PaychainRequest): Promise<PaychainResponse>`

Execution flow:
1. Query `active_workflows` for existing `type: "payroll"` entries for this wallet
2. `generateObject({ schema: PayChainSchema, system: PAYCHAIN_SYSTEM_PROMPT, prompt: JSON.stringify({ userMessage, existingPayrollRecipients: [...] }) })`
3. If `recommendation.verification_required: true` -> return `{ success: false, verification_required: true, message: decision.userExplanation }` — do not create any workflow
4. `createWorkflow({ triggerType: "cron", cronSchedule: recommendation.cron_schedule, steps: [ERC20 transfer calldata] })`
5. Insert into `active_workflows`
6. Return `{ success: true, workflowId }`

Internal stub: `buildTransferCalldata()` — returns `"0x"` until Phase 8 wires real ERC20 encoding

### Done When
- [ ] `verification_required: true` returns to caller without creating any KeeperHub workflow
- [ ] Duplicate payroll is blocked at DB unique index level (catches constraint violation)
- [ ] `handle()` connected to `POST /api/payroll` in `src/index.ts`

---

## M9 — Agent API Server

**Service:** `nexus-agent`
**Purpose:** Express HTTP server exposing all module functions as REST endpoints. Initializes all background cron loops on startup.

### Files

#### `nexus-agent/package.json`

```json
{
  "name": "nexus-agent",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:seed": "tsx src/db/seed.ts"
  },
  "dependencies": {
    "ai": "^4.0.0",
    "@ai-sdk/openai": "^1.0.0",
    "drizzle-orm": "^0.32.0",
    "pg": "^8.11.0",
    "zod": "^3.23.0",
    "@modelcontextprotocol/sdk": "^1.0.0",
    "express": "^4.19.0",
    "dotenv": "^16.4.0",
    "node-cron": "^3.0.0",
    "ethers": "^6.13.0"
  },
  "devDependencies": {
    "tsx": "^4.16.0",
    "typescript": "^5.5.0",
    "@types/node": "^22.0.0",
    "@types/pg": "^8.11.0",
    "@types/express": "^4.17.0",
    "drizzle-kit": "^0.23.0"
  }
}
```

#### `nexus-agent/tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "outDir": "dist",
    "rootDir": "src",
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

#### `nexus-agent/.env.example`

```
GITHUB_TOKEN=             # GitHub Personal Access Token (PAT)
DATABASE_URL=             # postgres://user:pass@host:5432/nexusagent
KEEPERHUB_API_KEY=        # kh_... key from KeeperHub dashboard
KEEPERHUB_MCP_URL=        # https://mcp.keeperhub.com
AGENTIC_WALLET_ADDRESS=   # 0x... Turnkey/Para MPC wallet address
ALCHEMY_RPC_URL=          # https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY
INFURA_RPC_URL=           # https://sepolia.infura.io/v3/YOUR_KEY
PORT=3001
```

#### `nexus-agent/src/index.ts`

Express app with these endpoints:

```
GET  /health                       -> { status: "ok", service: "nexus-agent" }
GET  /api/portfolio/:walletAddress -> active_workflows + stubbed HF
GET  /api/feed/:walletAddress      -> executions_log (last 20 rows, DESC)
POST /api/chat                     -> stub reply (real brain wired in M10 integration)
POST /api/payroll                  -> delegates to modules/paychain.ts handle()
```

On startup (`app.listen` callback):
- Guardian cron: `*/5 * * * *`
- Yield cron: `*/15 * * * *`
- DCA cron: `0 * * * *`
- All crons call module `run(DEMO_WALLET)` and catch errors to console

Graceful shutdown: `process.on("SIGTERM", ...)` exits cleanly.

#### `nexus-agent/README.md`

Sections: Overview, Setup (5 steps), Endpoints table, Environment variables table

### Full nexus-agent Folder Tree

```
nexus-agent/
├── package.json
├── tsconfig.json
├── drizzle.config.ts
├── .env.example
├── README.md
└── src/
    ├── index.ts
    ├── db/
    │   ├── schema.ts
    │   ├── client.ts
    │   └── seed.ts
    ├── brain/
    │   ├── provider.ts
    │   └── schemas.ts
    ├── lib/
    │   ├── mcp-client.ts
    │   ├── rpc.ts
    │   └── simulate.ts
    └── modules/
        ├── guardian.ts
        ├── yield-rotator.ts
        ├── dca.ts
        └── paychain.ts
```

### Done When
- [ ] `GET /health` returns 200 with JSON
- [ ] `GET /api/portfolio/:wallet` returns DB workflow data
- [ ] `GET /api/feed/:wallet` returns `executions_log` rows
- [ ] `POST /api/payroll` delegates to paychain module correctly
- [ ] All 3 cron loops log startup confirmation to console

---

## M10 — Dashboard

**Service:** `nexus-dashboard`
**Purpose:** Next.js 14 (App Router) visual interface for NexusAgent. Six pages showing portfolio health, live execution feed, resilience log, alerts, AI chat, and workflow template store.

### Design System Rules
- Dark mode only — background `#0a0b0f`, surface `#111318`
- Accent: indigo `#6366f1`
- Success: `#22c55e` / Danger: `#ef4444` / Warning: `#f59e0b`
- Glass cards: `backdrop-filter: blur(12px); background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.07)`
- Fonts: `Inter` (body) + `Space Grotesk` (headings) via `next/font/google`
- Animations: health gauge arc entrance, fade-up cards, pulse glow on critical HF
- No Tailwind — vanilla CSS custom properties only

---

### Files

#### `nexus-dashboard/package.json`

```json
{
  "name": "nexus-dashboard",
  "version": "1.0.0",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start"
  },
  "dependencies": {
    "next": "14.2.5",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "recharts": "^2.12.0",
    "lucide-react": "^0.414.0",
    "@tanstack/react-query": "^5.51.0",
    "clsx": "^2.1.0"
  },
  "devDependencies": {
    "typescript": "^5.5.0",
    "@types/node": "^22.0.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0"
  }
}
```

#### `nexus-dashboard/tsconfig.json`

Standard Next.js 14 TypeScript config. Path alias: `@/*` -> `./` (maps to project root).

#### `nexus-dashboard/next.config.ts`

Minimal App Router config — no `pages/` dir. No special plugins needed.

#### `nexus-dashboard/.env.example`

```
NEXT_PUBLIC_AGENT_URL=http://localhost:3001   # nexus-agent base URL
NEXT_PUBLIC_WALLET_ADDRESS=                   # Demo wallet address to display
```

---

#### `nexus-dashboard/app/globals.css`

Full design system CSS. All values come from custom properties — never hardcoded inline.

**Custom properties on `:root`:**
```
--color-bg: #0a0b0f
--color-surface: #111318
--color-surface-2: #16181f
--color-border: rgba(255, 255, 255, 0.07)
--color-primary: #6366f1
--color-primary-dim: rgba(99, 102, 241, 0.15)
--color-success: #22c55e
--color-success-dim: rgba(34, 197, 94, 0.15)
--color-danger: #ef4444
--color-danger-dim: rgba(239, 68, 68, 0.15)
--color-warning: #f59e0b
--color-warning-dim: rgba(245, 158, 11, 0.15)
--color-text: #f1f5f9
--color-text-muted: #64748b
--font-body: var(--font-inter), system-ui, sans-serif
--font-heading: var(--font-space-grotesk), var(--font-inter), sans-serif
--radius-sm: 6px
--radius-md: 10px
--radius-lg: 16px
```

**Utility classes:**
- `.glass` — glassmorphism card
- `.glass-hover` — glass + transform on hover
- `.btn-primary` — indigo filled button with hover lift
- `.btn-ghost` — transparent border button
- `.badge` — base pill badge
- `.badge-success`, `.badge-danger`, `.badge-warning`, `.badge-neutral` — colored variants
- `.section-title` — heading with Space Grotesk
- `.app-shell` — flex row: sidebar + main
- `.main-content` — flex grow, overflow scroll, padding

**Keyframe animations:**
- `@keyframes fadeUp` — `opacity 0->1, translateY 12px->0` over 0.4s
- `@keyframes pulse-glow` — box-shadow pulse using `--color-danger` for critical HF warning
- `@keyframes spin-gauge` — `stroke-dashoffset` animate from 0 to target value on mount (SVG arc)
- `@keyframes shimmer` — skeleton loading shimmer

---

#### `nexus-dashboard/app/layout.tsx`

```tsx
import type { Metadata } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import Sidebar from "@/components/Sidebar";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-space-grotesk" });

export const metadata: Metadata = {
  title: "NexusAgent Dashboard",
  description: "Autonomous Web3 wealth management — powered by KeeperHub & GitHub Models",
  keywords: ["DeFi", "AI agent", "KeeperHub", "Aave", "liquidation protection"],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${spaceGrotesk.variable}`}>
      <body>
        <div className="app-shell">
          <Sidebar />
          <main className="main-content">{children}</main>
        </div>
      </body>
    </html>
  );
}
```

---

#### `nexus-dashboard/components/Sidebar.tsx`

Left navigation rail — 64px wide on desktop, bottom bar on mobile.

Uses `usePathname()` from `next/navigation` for active state detection.

Nav items (in order):
| Path | Icon | Label |
|---|---|---|
| `/` | `LayoutDashboard` | Portfolio |
| `/feed` | `Activity` | Live Feed |
| `/resilience` | `ShieldCheck` | Resilience |
| `/alerts` | `Bell` | Alerts |
| `/chat` | `MessageSquare` | AI Chat |
| `/templates` | `Store` | Templates |

Styling details:
- Active item: `border-left: 2px solid var(--color-primary)` + `background: var(--color-primary-dim)`
- Inactive: transparent, `color: var(--color-text-muted)`, hover lift
- Brand logo at top: "NX" monogram in indigo circle
- All icons from `lucide-react`, size 20px

---

#### `nexus-dashboard/components/HealthGauge.tsx`

Animated SVG arc gauge component.

**Props:**
```ts
type HealthGaugeProps = {
  value: number;    // 0.0 – 3.0 (HF range)
  label: string;    // e.g. "Aave V3 Position"
  size?: number;    // SVG diameter, default 200
};
```

**Color logic:**
- `value < 1.15` -> `var(--color-danger)` + `pulse-glow` animation class on container
- `value < 1.40` -> `var(--color-warning)`
- `value >= 1.40` -> `var(--color-success)`

**SVG structure:**
- Background arc: full 270-degree sweep, `var(--color-border)`, `strokeLinecap: round`
- Value arc: `stroke-dasharray` calculated as `(value / 3.0) * arcLength`, animated via CSS `spin-gauge`
- Centered text: large numeric value in `var(--font-heading)`, label below in muted color
- Zone tick marks at 1.15 and 1.40

---

#### `nexus-dashboard/components/TransactionCard.tsx`

Reusable card for Feed and Resilience pages.

**Props:**
```ts
type TransactionCardProps = {
  action: string;
  amount: number;
  asset: string;
  status: "success" | "reverted_simulation" | "reverted_chain" | "pending";
  timestamp: string;
  txHash?: string;
  reason?: string;
};
```

**Visual per status:**
- `success` -> `.badge-success` + Etherscan link icon if `txHash` present
- `reverted_simulation` -> `.badge-warning` + green "Gas Saved" chip (key selling point for judges)
- `reverted_chain` -> `.badge-danger` + `reason` text shown below
- `pending` -> `.badge-neutral` with shimmer animation on the amount field

Card layout: action label (bold) + amount + asset on left, status badge + timestamp on right.

---

#### `nexus-dashboard/app/page.tsx` — Portfolio Overview

Page title: "Portfolio Overview"

Sections (top to bottom):
1. **Header strip** — wallet address (truncated `0x1234...abcd`) + "Synced just now" muted text
2. **Health Factor Hero** — large `<HealthGauge value={1.87} label="Aave V3 Sepolia" size={240} />` centered with fadeUp animation
3. **Position Stats Row** — 3 glass cards in a grid:
   - Collateral: `$12,400 USDC`
   - Debt: `$6,600 USDC`
   - LTV: `53.2%` with a thin progress bar
4. **Protocol APY Table** — glass card containing a table:
   | Protocol | Asset | Supply APY | Borrow APY | Status |
   |---|---|---|---|---|
   | Aave V3 | USDC | 4.2% | 5.8% | Current |
   | Compound V3 | USDC | 5.1% | 7.2% | — |
   | Morpho Blue | USDC | 5.8% | 6.9% | — |
5. **Active Workflows** — row of colored pill badges: `Guardian (active)`, `DCA: 100 USDC/week`, `No Payroll`

Data: hardcoded demo values in Phase stub. Replaced with `fetch(NEXT_PUBLIC_AGENT_URL/api/portfolio/...)` in integration phase.

---

#### `nexus-dashboard/app/feed/page.tsx` — Live Transaction Feed

Page title: "Live Transaction Feed"

Layout:
1. **Step stepper** — horizontal 4-step indicator at top:
   `Triggered` -> `Simulating` -> `Broadcasting` -> `Mined`
   Each step is a circle + label, connected by a line. Active step highlighted in `--color-primary`.
2. **Feed toggle** — "All | Success | Reverted | Pending" filter tabs
3. **Transaction list** — vertical list of `<TransactionCard>` items with `fadeUp` stagger
4. **Auto-refresh badge** — green pulsing dot + "Live" text in top right

Demo data (3 cards):
- `action: "repay", amount: 500, asset: "USDC", status: "success", txHash: "0xabc..."` 
- `action: "swap", amount: 100, asset: "USDC", status: "reverted_simulation", reason: "Gas 8.5% of purchase"`
- `action: "dca", amount: 100, asset: "USDC", status: "pending"`

---

#### `nexus-dashboard/app/resilience/page.tsx` — Resilience Log

Page title: "Resilience Log"
Subtitle: "Every execution path is captured. Zero gas wasted on failures."

3-column glass grid (equal width):

**Column 1 — Happy Path** (green `CheckCircle` icon)
- Header: "Happy Path" in green
- Description: "Transaction simulated, broadcast, and mined."
- Demo entry: repay 500 USDC, txHash present, gas used shown

**Column 2 — Gas Adjusted** (amber `Clock` icon)
- Header: "Gas Adjusted" in amber
- Description: "Execution delayed because gas exceeded 5% of purchase."
- Demo entry: DCA swap delayed 60 min, gas was $8.50 on $100 purchase

**Column 3 — Caught Revert** (red `ShieldX` icon)
- Header: "Caught Revert" in red
- Description: "Simulation caught a revert. No gas spent. Reason logged."
- Demo entry: swap reverted — `Insufficient allowance` reason, `Gas Saved` badge

---

#### `nexus-dashboard/app/alerts/page.tsx` — Alerts Panel

Page title: "Alerts"

List of alert cards (glass, full width, stacked):

4 demo alerts:
1. `danger` / `liquidation_risk` — "Wallet B health factor dropped to 1.05. Guardian module triggered repay."
2. `warning` / `gas_spike` — "DCA swap delayed 60 minutes. Gas at 8.2% of 100 USDC purchase."
3. `warning` / `cycle_limit` — "Wallet B has used $950 of $1,000 monthly repayment budget. $50 remaining."
4. `neutral` / `workflow_paused` — "Yield rotator: no profitable rotation. APY delta 0.06% < threshold. Next check in 15 min."

Each card structure: left-border color stripe + severity icon + message + relative timestamp.

---

#### `nexus-dashboard/app/chat/page.tsx` — AI Chat

Page title: "AI Chat"

Split layout — no separator line, just column sizes:
- **Left panel (28%):** "Context" glass card showing:
  - Mini `<HealthGauge value={1.87} size={100} label="HF" />`
  - Active modules count: `3 workflows running`
  - Last execution: `repay 2 hours ago`
  - Current model: `meta-llama-3.3-70b-instruct`
- **Right panel (72%):** Chat window glass card
  - Message history area (scrollable, `overflow-y: auto`)
  - Message bubbles: user right-aligned (indigo), agent left-aligned (surface-2)
  - Input row: text input + Send button (indigo, `ArrowRight` icon)
  - On send: POST to `/api/chat` route handler

Demo pre-seeded messages:
- User: "What's my current health factor?"
- Agent: "Your Aave V3 position has a health factor of 1.87. You are currently in the safe zone. No action required."

#### `nexus-dashboard/app/api/chat/route.ts`

```ts
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { message } = await req.json();
  // Stub — replaced with real proxy to nexus-agent /api/chat in integration phase
  return NextResponse.json({
    reply: `[STUB] Received: "${message}". Real GitHub Models brain wired during integration.`,
  });
}
```

---

#### `nexus-dashboard/app/templates/page.tsx` — Workflow Template Store

Page title: "Workflow Template Store"
Subtitle: "Fork and deploy in under 60 seconds."

Responsive grid — 3 columns desktop / 2 tablet / 1 mobile:

6 template cards (glass, hover lift):

| # | Emoji | Name | Description | Tag color |
|---|---|---|---|---|
| 1 | Shield | Aave Guardian | Auto-repay when HF < 1.15. Prevents liquidation on Aave V3 Sepolia. | indigo |
| 2 | Calendar | USDC-to-ETH Weekly DCA | Buy ETH every Monday with 100 USDC via Uniswap V3. | green |
| 3 | Repeat | Stablecoin Yield Rotator | Move USDC to highest APY protocol every 15 minutes. | blue |
| 4 | Banknote | Developer Payroll | Send 500 USDC to a wallet every Friday at 9am. | purple |
| 5 | Bell | Liquidation Notifier | Alert Discord/Telegram when HF drops below 1.5. | amber |
| 6 | Scale | Multi-Protocol Rebalancer | Maintain 33/33/33 split across Aave, Compound, Morpho. | pink |

Each card:
- Large emoji icon in colored circle
- Template name in `var(--font-heading)`
- Description text in muted color
- Tag badge (colored per table above)
- "Deploy in 60s" green chip
- `Fork Template` button (full width, indigo, `ExternalLink` icon)

---

#### `nexus-dashboard/README.md`

Sections: Overview, Setup (4 steps), Pages table, Environment variables, Design system notes

---

### Full nexus-dashboard Folder Tree

```
nexus-dashboard/
├── package.json
├── tsconfig.json
├── next.config.ts
├── .env.example
├── README.md
├── app/
│   ├── globals.css
│   ├── layout.tsx
│   ├── page.tsx
│   ├── feed/
│   │   └── page.tsx
│   ├── resilience/
│   │   └── page.tsx
│   ├── alerts/
│   │   └── page.tsx
│   ├── chat/
│   │   └── page.tsx
│   ├── templates/
│   │   └── page.tsx
│   └── api/
│       └── chat/
│           └── route.ts
└── components/
    ├── Sidebar.tsx
    ├── HealthGauge.tsx
    └── TransactionCard.tsx
```

### Done When
- [ ] `pnpm dev` starts without errors
- [ ] All 6 pages load in browser with no broken imports
- [ ] `HealthGauge` arc animates on load and shows correct color zone
- [ ] `TransactionCard` renders all 4 status variants correctly with correct badge colors
- [ ] Template store renders all 6 cards in responsive grid
- [ ] No white backgrounds anywhere — full dark mode enforced
- [ ] Fonts are Inter (body) and Space Grotesk (headings) — no browser defaults

---

## M11 — Upstream PRs (Onboarding UX Bounty)

**Target:** `KeeperHub/keeperhub` via fork `Assassin859/keeperhub`
**Fork location:** `C:\Users\maitr\Downloads\keeperhub`
**Prize:** $1,000 Best Onboarding UX Improvement Bounty
**Rule:** Run `pnpm biome check --write` on all changed files before committing

---

### PR 1 — Dynamic Testnet Workspace Hints

**Branch:** `feat/dynamic-testnet-hints`
**Target file:** `lib/onboarding/getting-started-config.ts`

**The Friction Point:**
The "Get Started" onboarding launcher shows recommendation chips to guide new developers. The current chips have:
- Static prompt strings with no actual contract addresses (e.g. just "Monitor my Aave v3 health factor")
- The `walletAddress` field in `ChipContext` is received by the parent component but completely ignored by `getMonitorTargets()` and `getYieldStrategies()` — developers must Google testnet addresses manually

**What to Change:**

1. Refactor `getMonitorTargets(ctx: ChipContext)` to consume `ctx.walletAddress`:
   - If `ctx.walletAddress` is present, inject Aave V3 Sepolia Pool `0x6Ae43d3271ff68408378a467C62b15264c8d77e4` into the prompt string
   - Same for Uniswap V3 Sepolia Router in yield strategy chips

2. Add `isTestnet?: boolean` to the `Chip` type so the UI can render a "Testnet Ready" badge

3. Add two new chip entries to `getMonitorTargets`:
   - USDC-to-ETH DCA: `"Swap 100 USDC for ETH every week on Sepolia using Uniswap V3 at router 0xE592427A0AEce92De3Edee1F18E0157C05861564"`
   - Recurring Payments: `"Send 200 USDC to 0xRecipient every Friday at 9am"`

**Code draft location:** `PRs.md §PR 1`

**Commit message:** `feat(onboarding): inject dynamic testnet contract addresses into workspace chips`

**PR description must include:**
- Screenshot of before (static prompt) vs after (address injected)
- Table of Sepolia addresses added
- Note that `walletAddress` in ChipContext was previously unused

---

### PR 2 — Dev-Login Automatic Database Recovery

**Branch:** `fix/dev-login-migration-recovery`
**Target file:** `scripts/dev-login.ts`

**The Friction Point:**
New developers frequently run `pnpm db:push` to test local schema changes before running the standard `pnpm dev:login` flow. This leaves the Drizzle migration journal (`drizzle.__drizzle_migrations`) out of sync with the actual database tables. When `dev:bootstrap` then runs during `dev:login`, it crashes with:
- `exited with status 1`
- No error message displayed
- No recovery instructions
- Developer must manually diagnose and run `backfill-drizzle-migrations.ts`

**What to Change in `runStep()`:**

1. Change `stdio: "inherit"` to `stdio: "pipe"` to capture stderr output
2. After non-zero exit status, parse captured output for `"relation already exists"` string
3. If migration mismatch detected:
   - Print: `> Migration drift detected (relational collision in drizzle.__drizzle_migrations)`
   - Print: `> Running scripts/backfill-drizzle-migrations.ts automatically...`
   - Auto-invoke `spawnSync("pnpm", ["tsx", "scripts/backfill-drizzle-migrations.ts"])`
   - If repair succeeds: print `> Success! Re-running bootstrap...` and retry original step
   - If repair fails: fall through to original error throw
4. For non-migration errors: re-emit captured stderr to `process.stderr` before throwing

**Code draft location:** `PRs.md §PR 2`

**Commit message:** `fix(scripts): auto-recover drizzle migration drift in dev-login`

**PR description must include:**
- Exact reproduction steps (run `pnpm db:push` then `pnpm dev:login`)
- Before: silent crash output
- After: clear recovery terminal log
- Note: repair script already exists, this just auto-invokes it

---

### PR 3 — Troubleshooting & Key Classification Docs

**Branch:** `docs/troubleshooting-guide`
**Target file:** `docs/getting-started/quickstart.md`

**The Friction Point:**
The quickstart guide covers only the happy path. Four recurring blockers are completely undocumented — confirmed by testing the local development flow:

1. **HTTP 429 Rate Limited** — frequent during high-frequency agent loop testing
2. **OAuth Browser Redirect Timeout** — breaks when developing inside Docker containers or VMs
3. **API Key Mismatch (401 Unauthorized)** — caused by using `kh_` org key where `wfb_` is required
4. **No testnet faucet guidance** — Turnkey/Para wallets start with zero balance

**What to Append:**

Add a `## Troubleshooting & Common Errors` section at the bottom of the file.

Section content:

**1. HTTP 429 (Rate Limited)**
- Cause: agent loop or triggers firing too frequently during development testing
- Solution: implement exponential backoff; check `X-RateLimit-Remaining` and `X-RateLimit-Reset` headers
- Tip: use `setTimeout` with jitter in local dev loops

**2. OAuth Handshake Redirect Timeout**
- Cause: `claude mcp add ...` or local MCP daemon opens browser but redirect fails in containers/VMs
- Solution: expose port 3000 from container to host, or set `DEV_LOGIN_URL` in `.env.local` to external routing IP
- Alternative: use API key auth instead of OAuth for CI/CD environments

**3. API Key Authorization Failures (HTTP 401)**
- Clear table distinguishing the two key types:
  | Prefix | Key Type | Used For |
  |---|---|---|
  | `kh_...` | Organization Key | MCP queries, audit logs, CLI auth |
  | `wfb_...` | Workflow Trigger Key | Webhook trigger URL authentication only |
- Common mistake: passing `kh_` key to a webhook trigger endpoint

**4. Getting Sepolia Testnet Funds**
- Copy wallet address from profile dropdown in KeeperHub dashboard
- Navigate to `sepoliafaucet.com` or Alchemy Sepolia Faucet
- Request testnet ETH (required for gas on all Sepolia transactions)
- For USDC on Sepolia: use Aave Sepolia faucet at `https://app.aave.com/faucet/`

**Code draft location:** `PRs.md §PR 3`

**Commit message:** `docs(quickstart): add troubleshooting guide for common dev setup errors`

**PR description must include:**
- List of the 4 friction points with evidence they are undocumented
- Note that all 4 issues were encountered during NexusAgent development

---

### PR Submission Process (All 3 PRs)

For each PR in order:
1. `cd C:\Users\maitr\Downloads\keeperhub`
2. `git checkout main` (or `agent` — confirm upstream default branch)
3. `git pull upstream main`
4. `git checkout -b <branch-name>`
5. Apply code changes from `PRs.md` draft
6. `pnpm biome check --write` (required — confirm no lint errors)
7. `git add -A`
8. `git commit -m "<conventional-commit-message>"`
9. `git push origin <branch-name>`
10. Open PR on GitHub: `Assassin859/keeperhub` -> `KeeperHub/keeperhub`

### Submission Checklist

- [ ] PR 1 branch pushed: `feat/dynamic-testnet-hints`
- [ ] PR 2 branch pushed: `fix/dev-login-migration-recovery`
- [ ] PR 3 branch pushed: `docs/troubleshooting-guide`
- [ ] All 3 PRs open against correct upstream branch
- [ ] Biome lint passes on all 3 PRs
- [ ] PR titles match conventional commit messages exactly
- [ ] All 3 PR links added to DoraHacks submission under **Bounty: Best Onboarding UX Improvement**

### Done When
- [ ] All 3 PRs are open, not draft, and have complete PR descriptions
- [ ] No requested changes from upstream maintainers outstanding
- [ ] DoraHacks submission references all 3 PR links

---

## Quick Reference — What Goes Where

```
keeperhub-guardian/          <- This folder (drafts only, no git)
├── plan.md                  <- This file
├── context.md, goal.md      <- Spec docs
├── model.md                 <- AI schema specs
├── database.md              <- DB schema specs
├── PRs.md                   <- PR code drafts
├── draft-schemas/           <- Early schema prototypes
├── nexus-agent/             <- M1-M9 draft files
│   ├── package.json
│   ├── tsconfig.json
│   ├── drizzle.config.ts
│   ├── .env.example
│   ├── README.md
│   └── src/
│       ├── index.ts
│       ├── db/ ...
│       ├── brain/ ...
│       ├── lib/ ...
│       └── modules/ ...
└── nexus-dashboard/         <- M10 draft files
    ├── package.json
    ├── tsconfig.json
    ├── next.config.ts
    ├── .env.example
    ├── README.md
    ├── app/ ...
    └── components/ ...
```

**On July 27:** Copy `nexus-agent/` and `nexus-dashboard/` into the cloned hackathon repo. Run `npm install`. Make first commit.
