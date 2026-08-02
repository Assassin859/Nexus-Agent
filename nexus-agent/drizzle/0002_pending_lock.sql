CREATE UNIQUE INDEX IF NOT EXISTS "executions_log_pending_lock_idx" ON "executions_log" USING btree ("user_wallet","action") WHERE "status" = 'pending';
