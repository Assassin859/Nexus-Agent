CREATE TABLE IF NOT EXISTS "payees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_wallet" varchar(42) NOT NULL,
	"name" varchar NOT NULL,
	"type" varchar NOT NULL,
	"payout_mode" varchar DEFAULT 'direct',
	"vault_pool_address" varchar(42),
	"recipient_addresses" jsonb NOT NULL,
	"member_count" integer DEFAULT 1,
	"parent_team_id" uuid,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_settings" (
	"user_wallet" varchar(42) PRIMARY KEY NOT NULL,
	"keeperhub_api_key" varchar(255),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "active_workflows" ADD COLUMN "keeperhub_workflow_id" varchar(255);--> statement-breakpoint
ALTER TABLE "active_workflows" ADD COLUMN "updated_at" timestamp DEFAULT now();--> statement-breakpoint
ALTER TABLE "executions_log" ADD COLUMN "ai_analysis" jsonb;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payees_user_wallet_idx" ON "payees" USING btree ("user_wallet");