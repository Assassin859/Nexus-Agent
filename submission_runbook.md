# NexusAgent — Submission Runbook

> **Last verified:** 2026-08-02 · **Chain:** Base Sepolia (84532) · **Harness:** 41/42 passed

---

## Live URLs

| | |
|--|--|
| **Dashboard** | https://spirited-heart-production-b5c5.up.railway.app |
| **Agent** | https://nexus-agent-production-7783.up.railway.app |
| **Repo** | https://github.com/Assassin859/Nexus-Agent |
| **Monitored wallet** | `0x89f97Cb35236a1d0190FB25B31C5C0fF4107Ec1b` |

---

## Execution status

| Capability | Status |
|------------|--------|
| Live Aave V3.2 reads | ✅ |
| AI Chat + tool calling (OpenRouter) | ✅ |
| Guardian + Reasoning Harness | ✅ |
| Pre-flight simulation + Resilience log | ✅ |
| KeeperHub MCP workflows (PayChain cron) | ✅ |
| Mined on-chain Guardian repays | ✅ HF ~1.05 → ~1.32 |

**BaseScan proof:**

| Tx | Link |
|----|------|
| `0x23f6424…770df3` | [repay](https://sepolia.basescan.org/tx/0x23f6424d9dbcb2b77c13a3ca6d4e4117c7e37d4d8e433549519ec4df2c770df3) |
| `0xd2d8ce6…a4f127` | [repay](https://sepolia.basescan.org/tx/0xd2d8ce6bf3138e981d5157089dfb90b1255f91e3d8523ae0d9dc18cf43a4f127) |

---

## Guardian resilience arc (demo this)

| # | Status | Action | Notes |
|---|--------|--------|-------|
| 1 | `reverted_simulation` | repay | 18:41 UTC — allowance intercept, zero gas |
| 2 | `reverted_simulation` | repay | 18:45 UTC — pre-fix intercept |
| 3 | `success` + txHash | repay | [0x23f6424…](https://sepolia.basescan.org/tx/0x23f6424d9dbcb2b77c13a3ca6d4e4117c7e37d4d8e433549519ec4df2c770df3) |
| 4 | `success` + txHash | repay | [0xd2d8ce6…](https://sepolia.basescan.org/tx/0xd2d8ce6bf3138e981d5157089dfb90b1255f91e3d8523ae0d9dc18cf43a4f127) |
| 5 | `success` | hold | HF ~1.32 — no broadcast |

**30s narration:** `/resilience` → expand simulation card → `/feed` → BaseScan link → *"Simulation saved gas; approve+repay recovered HF."*

At safe HF, Guardian **holds** — use Feed history for repay proof.

---

## Module pitch

| Module | Story | Proof |
|--------|-------|-------|
| **Guardian** | Flagship | 2 mined txs + simulation arc |
| **PayChain** | KeeperHub cron | Workflow `iu0toy0rena606e07ikxu` |
| **DCA** | Scaffolding | KeeperHub registered; local executor |
| **Yield** | Constraint | Dual-wallet guard skip |

---

## Bulk proof generation (443+ execution logs)

Already **350+** real `executions_log` rows (Guardian hold/rotate/block, PayChain, DCA). To grow further:

```bash
pnpm --prefix nexus-agent run bulk-proof -- --target 100   # ~100 new rows + KeeperHub payroll workflows
pnpm --prefix nexus-agent exec tsx src/scripts/db-audit.ts   # total count + tx hashes
```

| Proof type | How generated | On-chain? |
|------------|---------------|-----------|
| Guardian hold/rotate | `bulk-proof` / cron / trigger | No (audit rows) |
| PayChain payroll | Direct KeeperHub cron registration | KeeperHub workflow (cron fires later) |
| DCA schedule | `registerDcaWorkflow` | KeeperHub + local executor log |
| Mined repay | HF critical + cycle budget | **Yes** — 2 BaseScan txs (flagship) |
| Templates | `/templates` Fork & Deploy = same API paths | Same as above |

**Do not use** `db:seed` — fabricates tx hashes.

---

## Verify commands

```bash
pnpm --prefix nexus-agent run verify
# Summary: ✓ 41 passed | ⚠ 2 skipped | ✗ 0 failed

pnpm --prefix nexus-agent run verify:integration
# Summary: ✓ 42 passed | ⚠ 2 skipped | ✗ 0 failed

pnpm --prefix nexus-agent run phase2 && pnpm --prefix nexus-agent run logs
pnpm --prefix nexus-agent run e2e
pnpm --prefix nexus-agent run surfaces
```

---

## Video script (~3 min)

| Time | Scene | Say |
|------|-------|-----|
| 0:00 | Portfolio (HF ~1.32) | Real Aave V3.2 on Base Sepolia |
| 0:30 | Chat: *"What is my health factor?"* | NL → live chain read |
| 1:00 | Feed → BaseScan repay links | Autonomous repay, HF recovered |
| 1:30 | Decision Matrix | Harness ranked repay vs hold |
| 2:00 | Resilience | Simulation intercept → success |
| 2:30 | KeeperHub workflow link | Execution via MCP + MPC |

---

## DoraHacks form fields

| Field | Value |
|-------|-------|
| **Name** | NexusAgent — Autonomous DeFi Guardian on KeeperHub |
| **Summary** | AI brain monitoring Aave HF, multi-candidate Reasoning Harness, pre-flight simulation, KeeperHub MCP execution on Base Sepolia. |
| **Dashboard** | https://spirited-heart-production-b5c5.up.railway.app |
| **Backend** | https://nexus-agent-production-7783.up.railway.app |
| **Stack** | Node 22, Next 14, Vercel AI SDK, OpenRouter gemini-2.5-flash, KeeperHub MCP, SIWE, Postgres |

---

## Pre-demo checklist

- [x] Production agent health + phase2
- [x] Dashboard deployed on Railway
- [x] Feed: repay txHashes + BaseScan links
- [x] Resilience: `reverted_simulation` cards
- [x] SIWE + KeeperHub sync on live dashboard
- [ ] Timed screen recording (< 3 min)
- [ ] DoraHacks form submitted

---

## Known limitations (tell judges)

1. Dual-wallet → Yield skips on-chain (roadmap: unified wallet)
2. KeeperHub OAuth ≠ API key — paste `kh_...` ([BUG-02](KEEPERHUB_BUGS.md))
3. MCP cold start may return stubs — warm with `pnpm run surfaces`
4. Guardian at safe HF logs `hold`, not a new repay
5. Paid OpenRouter model recommended
