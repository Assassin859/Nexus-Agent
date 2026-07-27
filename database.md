# NexusAgent Stateful Database Schema (Drizzle ORM)

This document details the PostgreSQL database design for **NexusAgent**, showcasing the multi-tenant wallet isolation pattern and state machines used to prevent AI hallucinations and execution collisions.

---

## 1. Multi-Tenant Wallet Isolation

To ensure that different connected wallets do not see, edit, or conflict with each other's parameters:
*   **Every table** contains a `user_wallet` column.
*   The `user_wallet` field stores the user's 42-character Ethereum address (lowercase).
*   All queries initiated by the Node.js loop or dashboard API filter strictly by this address.

---

## 2. Table Schemas (TypeScript / Drizzle ORM)

### 2.1 Repayment Cycles Table (`repayment_cycles`)
Tracks periodic limits and historical spending per user/wallet to enforce budget safety checks.

```typescript
import { pgTable, uuid, varchar, integer, timestamp } from "drizzle-orm/pg-core";

export const repaymentCycles = pgTable("repayment_cycles", {
  id: uuid("id").defaultRandom().primaryKey(),
  userWallet: varchar("user_wallet", { length: 42 }).notNull().index(), // Multi-tenant key
  cycleStart: timestamp("cycle_start").notNull(),
  cycleEnd: timestamp("cycle_end").notNull(),
  cycleLimitUSD: integer("cycle_limit_usd").notNull(),
  totalRepaidThisCycleUSD: integer("total_repaid_this_cycle_usd").default(0),
});
```

### 2.2 Active Workflows Table (`active_workflows`)
Stores registered automations (DCA, Payroll, Guardian, Yield) and enforces a unique constraint to prevent duplicate workflow registrations.

```typescript
import { pgTable, uuid, varchar, integer, uniqueIndex } from "drizzle-orm/pg-core";

export const activeWorkflows = pgTable("active_workflows", {
  id: uuid("id").defaultRandom().primaryKey(),
  userWallet: varchar("user_wallet", { length: 42 }).notNull().index(), // Multi-tenant key
  type: varchar("type").notNull(), // 'dca' | 'payroll' | 'guardian' | 'yield'
  recipientAddress: varchar("recipient_address", { length: 42 }), // For payroll
  amount: integer("amount").notNull(), // Swaps / repayment sizes
  cronSchedule: varchar("cron_schedule", { length: 100 }),
  status: varchar("status", { length: 20 }).default("active"), // 'active' | 'paused' | 'completed'
}, (table) => {
  return {
    // Unique index: a user can only have one active payroll workflow per recipient
    uniquePayroll: uniqueIndex("unique_active_payroll").on(
      table.userWallet, 
      table.recipientAddress, 
      table.status
    ),
  };
});
```

### 2.3 Executions Log Table (`executions_log`)
Maintains an audit trail of every run (Happy Path, dry runs/simulations, and caught failures).

```typescript
import { pgTable, uuid, varchar, integer, timestamp } from "drizzle-orm/pg-core";
import { activeWorkflows } from "./active_workflows";

export const executionsLog = pgTable("executions_log", {
  id: uuid("id").defaultRandom().primaryKey(),
  userWallet: varchar("user_wallet", { length: 42 }).notNull().index(), // Multi-tenant key
  workflowId: uuid("workflow_id").references(() => activeWorkflows.id),
  action: varchar("action").notNull(), // 'repay' | 'swap' | 'rotate'
  amount: integer("amount").notNull(),
  status: varchar("status").notNull(), // 'success' | 'reverted_simulation' | 'reverted_chain'
  reason: varchar("reason"), // Error message description
  txHash: varchar("tx_hash", { length: 66 }),
  timestamp: timestamp("timestamp").defaultNow(),
});
```

---

## 3. The Seed Strategy (`pnpm db:seed`)

To demonstrate safety features to hackathon judges, the database is populated with two default setups:

1.  **Wallet A (Safe Path — `0xSafe...`):**
    *   Health Factor: `1.87` (Stable)
    *   No pending executions or cycle limit overruns.
    *   Active DCA configured: `100 USDC` to `ETH` weekly.
2.  **Wallet B (Risk Path — `0xRisk...`):**
    *   Health Factor: `1.05` (Critical Liquidation Risk)
    *   Pending repayment workflow already in database log.
    *   Cycle limit: `1000 USDC` limit, with `950 USDC` already spent this cycle.
    *   AI Action: The system flags the risk but blocks execution of another repayment to prevent exceeding the monthly budget limit.
