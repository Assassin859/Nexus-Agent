# NexusAgent Database Schema Reference (Drizzle ORM + PostgreSQL)

> Hosted on Railway free tier. Accessed by both `nexus-agent` (read/write) and `nexus-dashboard` (read via API proxy).

---

## 1. Architecture Role

The database serves three purposes:

1. **Stateful Memory for the AI** — every LLM call receives the current cycle budget, pending tx count, and active workflow list. This prevents hallucination bugs (model over-spending, duplicate execution).
2. **Audit Trail Mirror** — every agent action is written to `executions_log`, which the dashboard reads to render the Live Feed and Resilience Log.
3. **Multi-Tenant Isolation** — every table has a `user_wallet` column. All queries filter strictly by wallet address. No wallet ever sees another wallet's data.

---

## 2. Table Schemas

### 2.1 `repayment_cycles` — Monthly Budget Tracker

Used by **Guardian** to prevent over-spending in a single cycle.

```typescript
export const repaymentCycles = pgTable("repayment_cycles", {
  id:                      uuid("id").defaultRandom().primaryKey(),
  userWallet:              varchar("user_wallet", { length: 42 }).notNull().index(),
  cycleStart:              timestamp("cycle_start").notNull(),
  cycleEnd:                timestamp("cycle_end").notNull(),
  cycleLimitUSD:           integer("cycle_limit_usd").notNull(),          // Default: $1,000
  totalRepaidThisCycleUSD: integer("total_repaid_this_cycle_usd").default(0),
});
```

**How it's used:** Guardian reads `cycleLimitUSD - totalRepaidThisCycleUSD` and passes `cycleRemainingBudget` into the LLM prompt. The schema enforces `recommendation.amount <= cycleRemainingBudget`.

---

### 2.2 `active_workflows` — Registered Cron Schedules

Stores every PayChain payroll workflow, DCA schedule, or Guardian standing order registered for a wallet.

```typescript
export const activeWorkflows = pgTable("active_workflows", {
  id:               uuid("id").defaultRandom().primaryKey(),
  userWallet:       varchar("user_wallet", { length: 42 }).notNull().index(),
  type:             varchar("type").notNull(),            // 'payroll' | 'dca' | 'rotate' | 'guardian'
  recipientAddress: varchar("recipient_address", { length: 42 }),  // PayChain only
  amount:           integer("amount").notNull(),          // USDC amount
  cronSchedule:     varchar("cron_schedule", { length: 100 }),     // 5-field cron string
  status:           varchar("status", { length: 20 }).default("active"), // 'active' | 'paused' | 'completed'
}, (table) => ({
  // Prevents double-registering the same recipient payroll
  uniquePayroll: uniqueIndex("unique_active_payroll").on(
    table.userWallet,
    table.recipientAddress,
    table.status
  ),
}));
```

**How it's used:**
- PayChain checks this table before registering a new payroll (`registeredWorkflowCollision` check)
- DCA module reads this table to find the active DCA amount/schedule for the wallet
- `/workflows` dashboard page reads this table to display human-readable cron schedules

**Cron → Human Readable (dashboard):**
- `0 9 * * 5` → "Every Friday at 9:00 AM"
- `0 9 * * *` → "Every day at 9:00 AM"
- `0 9 1,15 * *` → "On the 1st & 15th of each month at 9:00 AM"
- `0 9 1 * *` → "On the 1st of each month at 9:00 AM"

---

### 2.3 `executions_log` — Append-Only Audit Trail

Every agent action — successes, simulation reverts, gas delays, holds — is written here.

```typescript
export const executionsLog = pgTable("executions_log", {
  id:         uuid("id").defaultRandom().primaryKey(),
  userWallet: varchar("user_wallet", { length: 42 }).notNull().index(),
  workflowId: uuid("workflow_id").references(() => activeWorkflows.id),
  action:     varchar("action").notNull(),   // 'repay' | 'swap' | 'rotate' | 'hold' | 'simulation'
  amount:     integer("amount").notNull(),
  status:     varchar("status").notNull(),   // see status values below
  reason:     varchar("reason"),             // AI userExplanation or revert message (max 250 chars)
  txHash:     varchar("tx_hash", { length: 66 }),
  timestamp:  timestamp("timestamp").defaultNow(),
});
```

**Status Values:**

| Status | Meaning | Dashboard Location |
|---|---|---|
| `success` | Action executed via KeeperHub | Live Feed |
| `reverted_simulation` | `estimateGas()` caught a revert — no gas spent | Resilience Log |
| `reverted_chain` | Onchain revert after broadcast | Live Feed (error) |
| `pending` | KeeperHub workflow created, awaiting mining | Live Feed |

**Flow:**
```
Agent decides → simulate() → 
  ├── revert caught → insert(status: "reverted_simulation") → Resilience Log
  └── gas ok → createWorkflow() → executeWorkflow() → insert(status: "success") → Live Feed
```

---

## 3. AI Hallucination Prevention

Two bugs were discovered during pre-hackathon testing and fixed with schema design:

### Bug 1 — Wallet Over-Spending
The model recommended repaying $1,500 USDC when the wallet only had $500. Fix:

```typescript
// In GuardianDecisionSchema:
recommendation: z.object({
  amount: z.number().describe(
    "Capped strictly at min(available wallet balance, cycleRemainingBudgetUSD)"
  ),
})

// In Guardian system prompt:
// "WALLET CAP: recommendation.amount must NEVER exceed walletBalance."
```

### Bug 2 — Duplicate Execution
The stateless model would re-trigger repayments in the same cycle. Fix:

```typescript
// Guardian reads DB before calling LLM:
const pendingTx = await db.query.executionsLog.findFirst({
  where: and(
    eq(executionsLog.userWallet, userWallet),
    eq(executionsLog.status, "pending")
  ),
});

// Injected into prompt:
executionHistory: pendingTx ? ["pending_transaction_exists"] : []

// Schema rule enforced:
// "CYCLE LOCK: If executionHistory contains a pending transaction, output action: block_transaction"
```

### The Reasoning-First Pattern
Every schema forces an `analysis` object *before* the `recommendation` object. This makes the LLM compute bounds (wallet balance check, gas calculation, break-even analysis) in its reasoning step before outputting the action — not after.

```
analysis: { walletLimitExceeded, cycleRemainingBudgetUSD, safetyStatus }  ← reasoning
     ↓
recommendation: { action, amount }                                         ← decision
```

---

## 4. Migration & Setup

```bash
cd nexus-agent
pnpm db:migrate    # Applies all Drizzle migrations to Postgres
```

Schema file: `nexus-agent/src/db/schema.ts`
Client singleton: `nexus-agent/src/db/client.ts`
Migrations: `nexus-agent/drizzle/`

> **Note:** `pnpm db:seed` was removed. The demo wallet (`0x89f97Cb...`) populates naturally through real agent interactions — Guardian polls every 5 min, Yield every 15 min.
