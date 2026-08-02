import { pgTable, uuid, varchar, integer, timestamp, uniqueIndex, index, jsonb } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// 1. Repayment Cycles Table: Enforces spending limits per cycle per wallet
export const repaymentCycles = pgTable("repayment_cycles", {
  id: uuid("id").defaultRandom().primaryKey(),
  userWallet: varchar("user_wallet", { length: 42 }).notNull(),
  cycleStart: timestamp("cycle_start").notNull(),
  cycleEnd: timestamp("cycle_end").notNull(),
  cycleLimitUSD: integer("cycle_limit_usd").notNull(),
  totalRepaidThisCycleUSD: integer("total_repaid_this_cycle_usd").default(0),
}, (table) => ({
  userWalletIdx: index("repayment_cycles_user_wallet_idx").on(table.userWallet),
}));

// 2. Active Workflows Table: Tracks scheduled triggers (DCA, Payroll, Guardian)
export const activeWorkflows = pgTable("active_workflows", {
  id: uuid("id").defaultRandom().primaryKey(),
  userWallet: varchar("user_wallet", { length: 42 }).notNull(),
  type: varchar("type").notNull(), // 'dca' | 'payroll' | 'guardian' | 'yield'
  recipientAddress: varchar("recipient_address", { length: 42 }), // For payroll/transfers
  amount: integer("amount").notNull(), // Amount in stablecoins/USD equivalent
  cronSchedule: varchar("cron_schedule", { length: 100 }),
  status: varchar("status", { length: 20 }).default("active"), // 'active' | 'paused' | 'completed'
  keeperhubWorkflowId: varchar("keeperhub_workflow_id", { length: 255 }),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  userWalletIdx: index("active_workflows_user_wallet_idx").on(table.userWallet),
  uniquePayroll: uniqueIndex("unique_active_payroll").on(
    table.userWallet,
    table.recipientAddress,
    table.status
  ),
}));

// 3. Executions Log Table: Holds auditing data for transactions, simulations, and dry runs
export const executionsLog = pgTable("executions_log", {
  id: uuid("id").defaultRandom().primaryKey(),
  userWallet: varchar("user_wallet", { length: 42 }).notNull(),
  workflowId: uuid("workflow_id").references(() => activeWorkflows.id),
  action: varchar("action").notNull(), // 'repay' | 'swap' | 'rotate' | 'payroll' | 'simulation'
  amount: integer("amount").notNull(),
  status: varchar("status").notNull(), // 'success' | 'reverted_simulation' | 'reverted_chain' | 'pending'
  reason: varchar("reason"), // AI userExplanation (short summary)
  aiAnalysis: jsonb("ai_analysis"), // Full structured AI analysis object from Zod schema
  txHash: varchar("tx_hash", { length: 66 }),
  timestamp: timestamp("timestamp").defaultNow(),
}, (table) => ({
  userWalletIdx: index("executions_log_user_wallet_idx").on(table.userWallet),
  pendingLockIdx: uniqueIndex("executions_log_pending_lock_idx")
    .on(table.userWallet, table.action)
    .where(sql`${table.status} = 'pending'`),
}));

// 4. User Settings Table: Stores per-user KeeperHub credentials in Postgres for production
export const userSettings = pgTable("user_settings", {
  userWallet: varchar("user_wallet", { length: 42 }).primaryKey(),
  keeperhubApiKey: varchar("keeperhub_api_key", { length: 255 }),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// 5. Payees Directory Table: Manages single payees, named team members, and vault pools
export const payees = pgTable("payees", {
  id: uuid("id").defaultRandom().primaryKey(),
  userWallet: varchar("user_wallet", { length: 42 }).notNull(),
  name: varchar("name").notNull(),                      // e.g. "dev team" or "Alice"
  type: varchar("type").notNull(),                      // 'single' | 'team'
  payoutMode: varchar("payout_mode").default("direct"),  // 'direct' | 'vault_pool'
  vaultPoolAddress: varchar("vault_pool_address", { length: 42 }),
  recipientAddresses: jsonb("recipient_addresses").notNull(), // Array of { name: string, address: string }
  memberCount: integer("member_count").default(1),
  parentTeamId: uuid("parent_team_id"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  payeesUserWalletIdx: index("payees_user_wallet_idx").on(table.userWallet),
}));

