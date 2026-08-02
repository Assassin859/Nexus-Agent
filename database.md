# database.md — Schema Pointer

> **Source of truth:** `nexus-agent/src/db/schema.ts`  
> **Architecture context:** [docs/TECHNICAL_SPEC.md](docs/TECHNICAL_SPEC.md) §7

| Table | Purpose |
|-------|---------|
| `repayment_cycles` | 30-day Guardian repay budget per wallet |
| `active_workflows` | DCA, payroll, guardian, yield schedules + KeeperHub IDs |
| `executions_log` | All actions, simulations, tx hashes, `aiAnalysis` JSON |
| `user_settings` | Per-wallet `kh_...` API key |
| `payees` | Payroll recipients, teams, vault pools |

**Migrations:** `nexus-agent/drizzle/` · apply via `pnpm --prefix nexus-agent run db:migrate`

**Pending lock:** partial unique index on `(user_wallet, action) WHERE status = 'pending'`
