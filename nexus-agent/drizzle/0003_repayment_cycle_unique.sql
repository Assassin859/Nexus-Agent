CREATE UNIQUE INDEX IF NOT EXISTS "repayment_cycles_user_wallet_unique" ON "repayment_cycles" USING btree ("user_wallet");
