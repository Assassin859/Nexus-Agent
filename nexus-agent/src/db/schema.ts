import { pgTable, uuid, varchar, integer, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

// 1. Repayment Cycles Table: Enforces spending limits per cycle per wallet
export const repaymentCycles = pgTable("repayment_cycles", {
  id: uuid("id").defaultRandom().primaryKey(),
  userWallet: varchar("user_wallet", { length: 42 }).notNull().index(), // lowercase address
  cycleStart: timestamp("cycle_start").notNull(),
  cycleEnd: timestamp("cycle_end").notNull(),
  cycleLimitUSD: integer("cycle_limit_usd").notNull(),
  totalRepaidThisCycleUSD: integer("total_repaid_this_cycle_usd").default(0),
});

// 2. Active Workflows Table: Tracks scheduled triggers (DCA, Payroll, Guardian)
export const activeWorkflows = pgTable("active_workflows", {
  id: uuid("id").defaultRandom().primaryKey(),
  userWallet: varchar("user_wallet", { length: 42 }).notNull().index(),
  type: varchar("type").notNull(), // 'dca' | 'payroll' | 'guardian' | 'yield'
  recipientAddress: varchar("recipient_address", { length: 42 }), // For payroll/transfers
  amount: integer("amount").notNull(), // Amount in stablecoins/USD equivalent
  cronSchedule: varchar("cron_schedule", { length: 100 }),
  status: varchar("status", { length: 20 }).default("active"), // 'active' | 'paused' | 'completed'
}, (table) => {
  return {
    // Prevent duplicate active workflows for the same recipient
    uniquePayroll: uniqueIndex("unique_active_payroll").on(
      table.userWallet,
      table.recipientAddress,
      table.status
    ),
  };
});

// 3. Executions Log Table: Holds auditing data for transactions, simulations, and dry runs
export const executionsLog = pgTable("executions_log", {
  id: uuid("id").defaultRandom().primaryKey(),
  userWallet: varchar("user_wallet", { length: 42 }).notNull().index(),
  workflowId: uuid("workflow_id").references(() => activeWorkflows.id),
  action: varchar("action").notNull(), // 'repay' | 'swap' | 'rotate' | 'payroll'
  amount: integer("amount").notNull(),
  status: varchar("status").notNull(), // 'success' | 'reverted_simulation' | 'reverted_chain' | 'pending'
  reason: varchar("reason"), // Descriptive error message/hallucination block description
  txHash: varchar("tx_hash", { length: 66 }),
  timestamp: timestamp("timestamp").defaultNow(),
});
