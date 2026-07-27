CREATE TABLE IF NOT EXISTS "active_workflows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_wallet" varchar(42) NOT NULL,
	"type" varchar NOT NULL,
	"recipient_address" varchar(42),
	"amount" integer NOT NULL,
	"cron_schedule" varchar(100),
	"status" varchar(20) DEFAULT 'active'
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "executions_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_wallet" varchar(42) NOT NULL,
	"workflow_id" uuid,
	"action" varchar NOT NULL,
	"amount" integer NOT NULL,
	"status" varchar NOT NULL,
	"reason" varchar,
	"tx_hash" varchar(66),
	"timestamp" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "repayment_cycles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_wallet" varchar(42) NOT NULL,
	"cycle_start" timestamp NOT NULL,
	"cycle_end" timestamp NOT NULL,
	"cycle_limit_usd" integer NOT NULL,
	"total_repaid_this_cycle_usd" integer DEFAULT 0
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "executions_log" ADD CONSTRAINT "executions_log_workflow_id_active_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."active_workflows"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "active_workflows_user_wallet_idx" ON "active_workflows" USING btree ("user_wallet");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "unique_active_payroll" ON "active_workflows" USING btree ("user_wallet","recipient_address","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "executions_log_user_wallet_idx" ON "executions_log" USING btree ("user_wallet");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "repayment_cycles_user_wallet_idx" ON "repayment_cycles" USING btree ("user_wallet");