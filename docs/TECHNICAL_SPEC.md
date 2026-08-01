# NexusAgent — Technical Architecture & Implementation Specification

> **Target Audience:** Hackathon Judges (DoraHacks / Agents Onchain 2026), AI Engineers, Web3 Protocol Developers  
> **Repository:** [nexus-agent](https://github.com/Assassin859/Nexus-Agent)  
> **Tech Stack:** Node.js 22 + Next.js 14 (App Router) + Vercel AI SDK v4 + OpenRouter (google/gemini-2.5-flash / openai/gpt-oss-20b:free) + KeeperHub MCP + SIWE (Web3 Wallet Sign-In) + Postgres (Drizzle ORM) + Ethers.js v6

---

## 1. Executive Summary & Core Paradigm

**NexusAgent** is an autonomous Web3 wealth management agent and automated payroll engine built on top of **KeeperHub MCP**.

### The Core Analogy
* **KeeperHub** is the **railway infrastructure** — high-performance execution nodes capable of automated multi-step transactions, gas management, Flashbots MEV protection, and scheduled cron triggers.
* **NexusAgent** is the **autonomous train driver & central brain** — it continuously reads onchain portfolio state (Aave V3, Compound V3, Uniswap V3), evaluates financial safety and APY opportunities via a structured **Reasoning Harness & Domain Ontology**, and instructs KeeperHub on *what*, *when*, and *how* to execute onchain.

The end user never manually builds calldata, calculates gas limits, or constructs complex multi-step workflows. They simply interact in natural language via a conversational AI interface or sign in with their Web3 wallet.

---

## 2. System Architecture & High-Level Flow

```
                               ┌─────────────────────────────────────────────────────────┐
                               │                    USER INTERFACE                       │
                               │  Next.js 14 Dashboard · SIWE Wallet Auth · Live Chat UI  │
                               └───────────────────────────┬─────────────────────────────┘
                                                           │
                                             HTTP / SIWE Bearer JWT Token
                                                           │
                                                           ▼
┌────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                           NEXUS AGENT BACKEND (Express / TS)                                   │
│                                                                                                                │
│   ┌──────────────────────────────────────────────────────────────────────────────────────────────────────┐     │
│   │                               CONVERSATIONAL AI BRAIN (Vercel AI SDK)                                │     │
│   │   • Model: GitHub Models (gpt-4o-mini) with maxSteps: 5                                             │     │
│   │   • Native Tools: schedulePayroll, scheduleDCA, cancelWorkflows, queryPortfolio, triggerStrategy...  │     │
│   └──────────────────────────────────────────────────┬───────────────────────────────────────────────────┘     │
│                                                      │                                                         │
│   ┌──────────────────────────────────────────────────▼───────────────────────────────────────────────────┐     │
│   │                                       BACKGROUND AUTONOMOUS MODULES                                  │     │
│   │   🛡️ Guardian (5m cron)      🔄 Yield Rotator (15m cron)    📅 DCA Engine (Hourly)    💸 PayChain       │     │
│   │   • Aave V3 Health Factor    • Aave vs Compound APY        • Uniswap V3 Swaps        • Team Payrolls   │     │
│   │   • Cycle Budget & Locks     • 90-Day Break-Even Threshold • Gas Price Delays        • Cent Split      │     │
│   └──────────────────────────────────────────────────┬───────────────────────────────────────────────────┘     │
│                                                      │                                                         │
│   ┌──────────────────────────────────────────────────▼───────────────────────────────────────────────────┐     │
│   │                              REASONING HARNESS & DECISION ONTOLOGY LAYER                             │     │
│   │   • Domain Ontology: PortfolioPosition -> RiskState -> CandidateAction[] -> SimulationResult         │     │
│   │   • Multi-Candidate Evaluation & Ranking (Expected HF, Gas Cost, Risk Score)                         │     │
│   │   • Pre-Flight Simulation Intercept via provider.estimateGas()                                       │     │
│   │   • Capped Exact ERC20 Approvals (Amount + 10% Buffer) — Zero uint256.max Risk                      │     │
│   │   • Per-Module, Action-Scoped 15-Minute Stale Pending Lock TTL Expiry Guard                        │     │
│   └──────────────────────────────────────────────────┬───────────────────────────────────────────────────┘     │
└──────────────────────────────────────────────────────┼─────────────────────────────────────────────────────────┘
                                                       │
                                          JSON-RPC over Stdio / HTTP
                                                       │
                                                       ▼
┌────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                           KEEPERHUB MCP EXECUTION LAYER                                        │
│   • Turnkey MPC Wallet Signing (`AGENTIC_WALLET_ADDRESS`)                                                       │
│   • Flashbots MEV-Protected Private Bundles                                                                    │
│   • Onchain Execution on Ethereum Sepolia Testnet                                                              │
└────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Account Model & Dual-Wallet Scoping Architecture

NexusAgent features a **Dual-Wallet Architecture**, separating position monitoring from agentic signing:

```
┌───────────────────────────────────────────────┐     ┌───────────────────────────────────────────────┐
│     Monitored Wallet (`userWallet`)           │     │     Signer Wallet (`AGENTIC_WALLET_ADDRESS`)  │
│  • The user's primary Web3 account (MetaMask)  │     │  • Turnkey MPC wallet managed by KeeperHub    │
│  • Auth via SIWE (Sign-In with Ethereum)      │     │  • Signs and pays gas for onchain transactions│
│  • Target for Aave positions, transfers, DCA  │     │  • Calls `repay(..., onBehalfOf: userWallet)` │
└───────────────────────────────────────────────┘     └───────────────────────────────────────────────┘
```

### Protocol Integration & Boundary Matrix
* **Aave V3 `repay(asset, amount, rateMode, onBehalfOf)`**: The agentic MPC wallet (`from`) pays USDC to repay debt owned by `userWallet` (`onBehalfOf`). Fully dual-wallet compatible.
* **Aave V3 `supply(asset, amount, onBehalfOf, referralCode)`**: The agentic MPC wallet supplies collateral into Aave on behalf of `userWallet`. Fully dual-wallet compatible.
* **Uniswap V3 Swaps**: DCA swaps spend USDC from `signerWallet` and set `recipient = userWallet`, landing swapped ETH directly in the user's primary wallet.
* **Yield Rotator Scope Constraint**: Aave V3 `withdraw(asset, amount, to)` **lacks** an `onBehalfOf` parameter (it burns the caller's aTokens). Therefore, the **Yield Rotator** explicitly enforces `signerWallet === monitoredWallet` before executing Aave -> Compound rotates. For separate wallets, the agent logs a clear notice rather than attempting an invalid withdrawal.

---

## 3.5 Domain Decision Ontology & Multi-Candidate Reasoning Harness

Directly responding to office-hours feedback from hackathon judges (Luca & Jacob) — *“building a superior harness and ontology for reasoning, not another interface”* — NexusAgent introduces a formal **Domain Decision Ontology** and **Multi-Candidate Reasoning Harness**.

### 1. Domain Decision Ontology (Relational Entity Graph)
Rather than passing unstructured text to an LLM or relying on flat single-shot output, NexusAgent models financial decision-making as a strict relational graph:

```
┌───────────────────────────┐
│     PortfolioPosition     │  (HealthFactor, CollateralUSD, DebtUSD, AvailableBorrowsUSD)
└─────────────┬─────────────┘
              │ 1:1 Mapping
              ▼
┌───────────────────────────┐
│         RiskState         │  (safe | warning | critical_liquidation_risk | crash)
└─────────────┬─────────────┘
              │ Generates 1:N
              ▼
┌───────────────────────────┐
│     CandidateAction[]     │  (repay | supply_collateral | hold | block_transaction)
│  • expectedHealthFactor   │  • estimatedGasUSD
│  • riskScore (0-10)       │  • pros & cons
└─────────────┬─────────────┘
              │ Evaluated & Ranked by Harness
              ▼
┌───────────────────────────┐
│     SimulationResult      │  (wouldRevert: boolean, gasEstimate: bigint, revertReason)
└─────────────┬─────────────┘
              │ Selected Target
              ▼
┌───────────────────────────┐
│     ExecutedDecision      │  (KeeperHub Payload + Postgres Audit Log Entry)
└───────────────────────────┘
└─────────────┬─────────────┘
```

> **Market Oracle — `priceTrend`**: Derived at runtime from the Chainlink ETH/USD aggregator (Base Sepolia) by comparing the latest round to the previous round (approximate short-term move; on Base Sepolia, typically ~1h apart when markets are calm). `crash` is emitted if delta ≤ −7%; `volatile` if |delta| ≥ 3%; otherwise `stable`. Graceful fallback to `"stable"` on any RPC error so Guardian evaluation is never blocked.

### 2. Candidate Action Evaluation & Ranking Rules
In every decision cycle, the brain generates an array of 4 distinct **Candidate Actions** (`CandidateActionSchema`):
- **Network**: Base Sepolia Testnet (Chain ID `84532`)
- **Aave V3.2 Pool**: `0x8bAB6d1b75f19e9eD9fCe8b9BD338844fF79aE27`
- **Aave Test USDC**: `0xba50Cd2A20f6DA35D788639E581bca8d0B5d4D5f`
- **Block Explorer**: BaseScan (`https://sepolia.basescan.org`)
- **Note**: Legacy pool `0x07eA79...` is a separate deployment — not used by Aave app frontend.
- **Option C**: Supply Collateral
- **Option D**: Hold / Do Nothing

The runtime harness evaluates candidates using `selectBestCandidate(candidates, fallback)`:

| Evaluation Case | Harness Behavior |
|---|---|
| **Empty / Missing `candidateActions`** | Returns LLM fallback recommendation |
| **All Filtered Out** (`riskScore > 5` or `expectedHealthFactor < 1.25`) | Returns LLM fallback recommendation |
| **Eligible Candidates Found** | Sorts by `riskScore ASC`, then `expectedHealthFactor DESC`, then `estimatedGasUSD ASC`. Returns top ranked candidate. |
| **Hold Candidate Wins** | Executed via non-broadcasting Hold resilience log path |
| **`block_transaction` Candidate Wins** | Pre-empts execution, logging block audit entry |
| **Repay / Supply Selected** | Amount passes through deterministic cycle & wallet budget clamping guard |

### 3. Multi-Tier Reasoning Harness Constraints
Before any candidate action output by the LLM can reach KeeperHub execution, it must pass through 4 strict software guards:

1. **Cycle Budget Clamping Guard**: `clampedAmount = max(0, min(amount, cycleRemaining, agenticBalance))`. If clamped to 0, execution is aborted safely without wasting gas.
2. **Capped Allowance Safety Guard**: Unlike naive integrations that grant infinite `uint256.max` approvals, `ensureAllowance()` queries on-chain allowance and generates approvals for **exact required units + 10% buffer** (`BigInt(Math.ceil(amountUSD * 1.10 * 1e6))`). This adheres directly to KeeperHub's security philosophy of capped exposure. *(Note on residual allowance: The 10% buffer covers interest accrual; approvals are checked and re-approved exact-amount on each run).*
3. **Pre-Flight Simulation Guard**: Runs `simulate(tx)` using `provider.estimateGas()` before sending instructions to KeeperHub. If a transaction would revert, the harness intercepts it, wasting **0 gas**, and records a `reverted_simulation` log in the Resilience feed.
4. **Pending Lock TTL Guard**: Maintains a 15-minute lock on active executions. If an execution hangs, the harness automatically marks it `reverted_chain` (`"Pending lock expired (TTL 15m)"`), preventing stale lockouts.

---

## 4. Authentication, Security & UI Model

### 1. Web3 Wallet SIWE Auth (JWT)
* Users sign an EIP-4361 SIWE message via MetaMask.
* Backend verifies signature via `ethers.verifyMessage` and issues a signed JWT (`Bearer <token>`).
* Express middleware (`requireAuth`) decodes token and attaches `req.userWallet`.
* `assertWalletScope(req, targetWallet)` prevents IDOR vulnerabilities.

### 2. UI & System Status Model
The dashboard clearly separates **End-User Authentication** from **KeeperHub MCP Connection Health**:
* **User Authentication**: Handled via MetaMask SIWE login, granting access to private portfolio metrics and command triggers.
* **KeeperHub MCP Connection**: Managed via `KeeperHubSyncModal` (`/api/user/settings`), indicating whether the agent has valid API credentials to execute on-chain on behalf of the user.

---

## 5. Native AI SDK Tool-Calling Engine

Powered by Vercel AI SDK v4 and `gpt-4o-mini` (via GitHub Models), NexusAgent runs a natural language tool loop with `maxSteps: 5`.

### Registered Native AI Tools (`nexus-agent/src/brain/agent-tools.ts`)
1. **`schedulePayroll`**: Parses human instructions ("pay dev team 50 USDC every friday") -> resolves payees -> splits remainder cents -> registers KeeperHub workflows.
2. **`scheduleDCA`**: Parses DCA intent ("dca 50 usdc into eth weekly") -> resolves standard 5-part cron -> registers DCA active workflow.
3. **`cancelWorkflows`**: Supports `type: "payroll" | "dca" | "all"` and target payee name/address filtering. Features an early `type === "dca"` branch and excludes DCA rows when filtering by payee name.
4. **`listWorkflows`**: Queries active and historical workflows for the authenticated wallet.
5. **`listPayees`**: Returns single payees, team directories, and shared vault pools.
6. **`queryPortfolio`**: Fetches live Aave V3 health factor, debt, collateral, and Compound V3 APY comparisons.
7. **`triggerStrategy`**: Forces an immediate ad-hoc run of Guardian, Yield Rotator, or DCA.
8. **`getLiveTransactions`**: Fetches recent execution logs with verified Sepolia Etherscan links.

---

## 6. Deep Dive: Background Autonomous Modules

### 🛡️ Module 1: Guardian — Liquidation Protection (`modules/guardian.ts`)
* **Frequency:** Every 5 minutes (`*/5 * * * *`).
* **Cycle Budget System**: Tracks 30-day budget caps in `repayment_cycles`. Automatically handles 30-day cycle rollovers at the top of each run.
* **Wallet Normalization**: Uses normalized `monitoredWallet` for log insertions and notification alert keys (`${monitoredWallet.slice(0, 8)}:liquidation_risk`).
* **Execution Flow**:
  1. Checks active pending lock (<15m).
  2. Queries live Aave V3 position via RPC.
  3. Formulates LLM multi-candidate recommendation via `generateObject(GuardianDecisionSchema)`.
  4. Ranks candidate actions via `selectBestCandidate()`.
  5. Clamps amount to cycle budget and agentic wallet balance.
  6. Pre-flight simulates calldata via `simulate()`.
  7. **Auto-Prepends Capped Allowance**: Calls `ensureAllowance()` and prepends exact amount + 10% buffer approval step if needed.
  8. Inserts `pending` row into `executionsLog` with full selection audit payload (`aiAnalysisPayload`).
  9. Calls KeeperHub `createWorkflow` + `executeWorkflow` + `pollExecutionUntilSettled`.
  10. Updates `pending` row to `success`, `simulated_stub`, or `reverted_chain`.

---

### 🔄 Module 2: Yield Rotator — APY Optimization (`modules/yield-rotator.ts`)
* **Frequency:** Every 15 minutes (`*/15 * * * *`).
* **Live APY Query**: Reads Compound V3 USDC supply rate via contract call (`supplyRatePerSecond`) in `lib/compound.ts` and compares with Aave V3 USDC supply rate.
* **Economic Threshold**: Evaluates 90-day APY delta profit against Sepolia gas costs. Rotates deposits only when break-even is under 45 days.
* **3-Step Workflow Payload**:
  - Step 1: `Aave V3 withdraw`
  - Step 2: `USDC approve` (exact amount + 10% buffer via `ensureAllowance`)
  - Step 3: `Compound V3 supply`

---

### 📅 Module 3: DCA Engine — Dollar-Cost Averaging (`modules/dca.ts` & `dca-schedule.ts`)
* **Frequency:** Agent-cron hourly (`0 * * * *`).
* **Cron Schedule Matching**: `shouldRunCronNow(cronExpression)` in `lib/cron-evaluator.ts` parses standard 5-part cron expressions (`0 9 * * 1`) so DCA schedules run strictly at their designated UTC hour. Falsy/missing cron expressions default to `"0 9 * * 1"` (Monday 09:00 UTC).
* **Single-Active DCA Rule**: Enforces one active DCA workflow per user wallet with automatic upsert semantics.
* **Gas Spike Delay**: Delays execution if Uniswap gas estimate exceeds 5% of purchase value.
* **Single Pending Row Pattern**: Inserts single `pending` row prior to execution and updates top-level `status`, `txHash`, `reason`, and `aiAnalysis` upon completion.

---

### 💸 Module 4: PayChain — Automated Team Payroll (`modules/paychain.ts`)
* **Remainder Cent Distribution**: Uses pure helper `splitTeamPayroll(totalAmount, memberCount)` to handle odd divisions without floating-point drift ($100 / 3 => `[33, 33, 34]`). Enforces minimum 1 USDC per team member.
* **Compensating Cancel Pattern**:
  - Creates remote KeeperHub workflows first.
  - Wraps Postgres persistence in `db.transaction(...)`.
  - If DB insertion fails, catches error and issues compensating `cancelWorkflow()` calls for all created remote IDs to guarantee remote/local consistency.
* **Postgres UUID FK Linking**: Captures `insertedWf.id` via `.returning({ id: activeWorkflows.id })` in both team loop and vault-pool path, storing valid UUIDs in `executionsLog.workflowId`.

---

## 7. Database Schema Reference (PostgreSQL / Drizzle ORM)

> **Schema Source of Truth**: The authoritative definitions for all database tables are defined in `nexus-agent/src/db/schema.ts`.
```typescript
// 1. repayment_cycles — Enforces spending limits per cycle per wallet
export const repaymentCycles = pgTable("repayment_cycles", {
  id: uuid("id").defaultRandom().primaryKey(),
  userWallet: varchar("user_wallet", { length: 42 }).notNull(),
  cycleStart: timestamp("cycle_start").notNull(),        // ← cycleStart, not cycleStartDate
  cycleEnd: timestamp("cycle_end").notNull(),
  cycleLimitUSD: integer("cycle_limit_usd").notNull(),   // ← integer, not doublePrecision
  totalRepaidThisCycleUSD: integer("total_repaid_this_cycle_usd").default(0),
});

// 2. active_workflows — Tracks scheduled triggers (DCA, Payroll, Guardian, Yield)
export const activeWorkflows = pgTable("active_workflows", {
  id: uuid("id").defaultRandom().primaryKey(),
  userWallet: varchar("user_wallet", { length: 42 }).notNull(),
  type: varchar("type").notNull(),                       // 'dca' | 'payroll' | 'guardian' | 'yield'
  recipientAddress: varchar("recipient_address", { length: 42 }),
  amount: integer("amount").notNull(),                   // ← integer, not doublePrecision
  cronSchedule: varchar("cron_schedule", { length: 100 }),
  status: varchar("status", { length: 20 }).default("active"),
  keeperhubWorkflowId: varchar("keeperhub_workflow_id", { length: 255 }),
  updatedAt: timestamp("updated_at").defaultNow(),       // ← updatedAt only; no createdAt
});

// 3. executions_log — Audit log for all transactions, simulations, and dry runs
export const executionsLog = pgTable("executions_log", {
  id: uuid("id").defaultRandom().primaryKey(),
  userWallet: varchar("user_wallet", { length: 42 }).notNull(),
  workflowId: uuid("workflow_id").references(() => activeWorkflows.id),
  action: varchar("action").notNull(),                   // 'repay' | 'swap' | 'rotate' | 'payroll' | 'hold'
  amount: integer("amount").notNull(),                   // ← integer, not doublePrecision
  status: varchar("status").notNull(),                   // 'pending' | 'success' | 'delayed' | 'reverted_simulation' | 'reverted_chain' | 'simulated_stub'
  reason: varchar("reason"),                             // ← varchar nullable, not text.notNull()
  aiAnalysis: jsonb("ai_analysis"),                      // Full harness audit payload
  txHash: varchar("tx_hash", { length: 66 }),
  timestamp: timestamp("timestamp").defaultNow(),
});

// 4. user_settings — Per-user KeeperHub credentials
export const userSettings = pgTable("user_settings", {
  userWallet: varchar("user_wallet", { length: 42 }).primaryKey(),
  keeperhubApiKey: varchar("keeperhub_api_key", { length: 255 }), // ← varchar(255), not text
  updatedAt: timestamp("updated_at").defaultNow(),
});

// 5. payees — Payee directory (single recipients, teams, vault pools)
export const payees = pgTable("payees", {
  id: uuid("id").defaultRandom().primaryKey(),
  userWallet: varchar("user_wallet", { length: 42 }).notNull(),
  name: varchar("name").notNull(),
  type: varchar("type").notNull(),                       // 'single' | 'team'
  payoutMode: varchar("payout_mode").default("direct"),  // 'direct' | 'vault_pool'
  vaultPoolAddress: varchar("vault_pool_address", { length: 42 }),
  recipientAddresses: jsonb("recipient_addresses").notNull(),
  memberCount: integer("member_count").default(1),
  parentTeamId: uuid("parent_team_id"),
  createdAt: timestamp("created_at").defaultNow(),
});
```

---

## 8. Dashboard & Frontend Architecture (`nexus-dashboard`)

Built with Next.js 14 (App Router), Vanilla CSS tokens, and Lucide React icons across 7 core pages + Template Store:

| Page | Route | Description |
|---|---|---|
| **Portfolio** | `/` | Live Aave V3 Health Factor SVG gauge, LTV bar, debt/collateral metrics, dynamic Compound APY comparison, offline fallback state banner |
| **Active Workflows** | `/workflows` | Registered KeeperHub workflows, payload inspection, manual trigger controls, `KeeperHubSyncModal` key config |
| **Live Feed** | `/feed` | Audit log of all onchain transactions with 1-click Etherscan links |
| **Resilience Log** | `/resilience` | 4-card grid detailing pre-flight simulation reverts, gas delays, and safety intercepts |
| **Alerts** | `/alerts` | Categorized notification feed (Danger, Warning, Success, Info) with green success badges |
| **AI Chat** | `/chat` | Conversational command center with SIWE auth banners, quick prompts, and tool execution status |
| **Payees** | `/payees` | Payee directory manager for single recipients, dev teams, and vault pools |
| **Template Store** | `/templates` | 1-click KeeperHub automation templates with instant deployment modals |

---

## 9. System Verification Harness (`verify-full-system.ts`)

Run via `pnpm verify`:
* **Tier A (16 Unit Tests - Mandatory)**: Pure unit tests checking wallet normalization, MCP content parsers, candidate selection ranking & fallbacks, team payroll remainder division, cron evaluator matching & malformed expression guards, and ERC20 approve calldata selectors (`0x095ea7b3`).
* **Tier B (On-Chain RPC Queries)**: Validates Sepolia Alchemy RPC connection, Compound V3 APY queries, and `ensureAllowance` exact capped calldata generation.
* **Tier C (Integration Mode)**: Verifies PostgreSQL database connectivity (`--integration`).

---

## 10. Summary of Innovation & Hackathon Value

1. **Domain Decision Ontology & Multi-Candidate Evaluation**: Directly responds to judges' feedback with a formal relational model (`PortfolioPosition` -> `RiskState` -> `CandidateAction[]` -> `SimulationResult` -> `ExecutedDecision`) that generates, ranks, and compares multiple competing candidate actions per cycle.
2. **Capped Security Philosophy**: Replaces dangerous `uint256.max` approvals with exact-amount approvals (+10% safety buffer), matching KeeperHub's security posture.
3. **Zero Wasted Gas**: Pre-flight simulations intercept failing calls before broadcast.
4. **Onboarding UX**: Solves address mismatch and key management issues via SIWE Web3 auth, Turnkey MPC alignment, and native AI tool calling.
5. **Production Resilience**: Implements 15m pending lock TTL cleanup, remainder cent division rules, and compensating rollback cancellations.
