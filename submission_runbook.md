# NexusAgent — Submission Runbook (DoraHacks / Agents Onchain 2026)

> **Last verified:** 2026-08-01 (live harness run) · **Chain:** Base Sepolia (84532)

---

## Honest execution status

| Capability | Status |
|------------|--------|
| Live Aave V3.2 position reads (HF, collateral, debt) | ✅ Verified |
| AI Chat with tool calling (OpenRouter / `gemini-2.5-flash`) | ✅ Verified |
| Guardian evaluation + Reasoning Harness (`hold` at HF ~3.26; `repay` at HF ~1.05) | ✅ Verified |
| Pre-flight simulation + Resilience logging | ✅ Verified |
| KeeperHub MCP workflow registration (PayChain cron) | ✅ Verified |
| Mined on-chain tx with BaseScan proof | ✅ **Verified** — Guardian repay (2 txs, HF 1.05 → 1.32) |

**On-chain proof (Base Sepolia):**

| Tx | Action | BaseScan |
|----|--------|----------|
| `0x23f6424d9dbcb2b77c13a3ca6d4e4117c7e37d4d8e433549519ec4df2c770df3` | repay $1000 | [View](https://sepolia.basescan.org/tx/0x23f6424d9dbcb2b77c13a3ca6d4e4117c7e37d4d8e433549519ec4df2c770df3) |
| `0xd2d8ce6bf3138e981d5157089dfb90b1255f91e3d8523ae0d9dc18cf43a4f127` | repay $1000 | [View](https://sepolia.basescan.org/tx/0xd2d8ce6bf3138e981d5157089dfb90b1255f91e3d8523ae0d9dc18cf43a4f127) |

UI shows **Simulated** badge when `simulated_stub` or no `txHash`.

---

## Phase 2 verified proofs (Postgres `executions_log`)

| Module | Action | Status | Reason (summary) |
|--------|--------|--------|------------------|
| **Guardian** | `hold` | `success` | HF ~3.26 > 1.40 — no broadcast (historical) |
| **Guardian** | `repay` | `success` + txHash | HF ~1.05 → 1.32; agentic wallet funded; KeeperHub approve+repay |
| **Yield Rotator** | `rotate` | `success` | Dual-wallet ownership guard skip |
| **DCA Engine** | `swap` | schedule OK | Workflow registered in `active_workflows` |
| **PayChain** | `payroll` | workflow registered | KeeperHub cron + 2-step confirm |

Re-run: `pnpm --prefix nexus-agent run phase2` then `pnpm --prefix nexus-agent run logs`

---

## Verification commands (exact counts)

Live output from `2026-08-01`:

```bash
pnpm --prefix nexus-agent run verify
```

```
Summary: ✓ 21 passed | ⚠ 2 skipped | ✗ 0 failed
```

```bash
pnpm --prefix nexus-agent run verify:integration
```

```
Summary: ✓ 22 passed | ⚠ 2 skipped | ✗ 0 failed
```

Other commands:

```bash
pnpm --prefix nexus-agent exec tsx src/scripts/test-openrouter-smoke.ts
pnpm --prefix nexus-agent exec tsx src/scripts/db-audit.ts   # full Postgres audit
pnpm --prefix nexus-agent exec tsx src/scripts/fix-repayment-cycle.ts  # cap over-repaid cycles
pnpm --prefix nexus-agent run surfaces    # 17 KeeperHub MCP surfaces
pnpm --prefix nexus-agent run phase2      # 4 autonomous modules
pnpm --prefix nexus-agent run logs
```

Skipped Tier C tests: Guardian cycle TTL rollover, PayChain compensating cancel (not yet implemented in harness).

---

## 🎬 Video demo script (~3 minutes)

| Time | Scene | Action | Say |
|------|-------|--------|-----|
| 0:00 | **Portfolio** | Show HF ~1.32 (post-repay) or replay earlier ~1.05 state | "Real Aave V3.2 position on Base Sepolia — not mock data." |
| 0:30 | **AI Chat** | *"What is my health factor?"* | "Natural language → live chain read via tool calling." |
| 1:00 | **Live Feed** | Expand latest `repay` row with txHash → BaseScan link | "Critical HF triggered autonomous repay — two mined txs, HF recovered." |
| 1:30 | **Decision Matrix** | Point at Repay + Hold buckets | "Harness ranked repay when HF critical; holds when safe." |
| 2:00 | **Resilience** | Show `reverted_simulation` then success after allowance fix | "Pre-flight simulation saves gas; approve+repay workflow." |
| 2:30 | **KeeperHub** | Open workflow link (`iu0toy0…` or repay execution) | "Execution layer is KeeperHub MCP + Turnkey MPC wallet." |

**Live demo tip:** At HF ~1.32 Guardian will `hold`. Use **Feed history** for repay proof, or temporarily lower HF for a live trigger.

**De-emphasize in pitch:** DCA swap (testnet liquidity), Yield (dual-wallet guard). Lead with Guardian + Resilience arc below.

---

## Resilience demo script (~30 seconds)

Use these **real** `executions_log` rows (timestamps UTC, 2026-08-01):

| Order | Time | Status | Action | Notes |
|-------|------|--------|--------|-------|
| 1 | 18:41:53 | `reverted_simulation` | repay | Allowance error — zero gas wasted |
| 2 | 18:45:04 | `reverted_simulation` | repay | Same intercept (pre-fix) |
| 3 | 18:45:07 | `success` | repay | [Tx 0x23f6424…](https://sepolia.basescan.org/tx/0x23f6424d9dbcb2b77c13a3ca6d4e4117c7e37d4d8e433549519ec4df2c770df3) |
| 4 | 18:45:11 | `success` | repay | [Tx 0xd2d8ce6…](https://sepolia.basescan.org/tx/0xd2d8ce6bf3138e981d5157089dfb90b1255f91e3d8523ae0d9dc18cf43a4f127) |
| 5 | (latest) | `success` | hold | HF ~1.32 — no further repay needed |

**On screen:**
1. Open `/resilience` → expand a `reverted_simulation` card → read `ERC20: transfer amount exceeds allowance`.
2. Open `/feed` → expand a `success` repay row → click **BaseScan** link.
3. Say: *"Simulation intercepted the revert before broadcast. After the allowance-aware fix, approve+repay mined on-chain — HF recovered from ~1.05 to ~1.32."*

---

## 🏆 DoraHacks submission fields

| Field | Value |
|-------|-------|
| **Project name** | NexusAgent — Autonomous DeFi Guardian on KeeperHub |
| **Repo** | https://github.com/Assassin859/Nexus-Agent |
| **Live backend** | https://nexus-agent-production-7783.up.railway.app |
| **Dashboard** | Local or deployed Next.js (`NEXT_PUBLIC_AGENT_URL` → Railway agent) |
| **Chain** | Base Sepolia |
| **Monitored wallet** | `0x89f97Cb35236a1d0190FB25B31C5C0fF4107Ec1b` |
| **Short summary** | AI brain that monitors Aave health factors, runs a multi-candidate Reasoning Harness, pre-flight simulates every tx, and executes via KeeperHub MCP on Base Sepolia. |
| **Tech stack** | Node.js 22, Next.js 14, Vercel AI SDK v4, OpenRouter (`google/gemini-2.5-flash`), KeeperHub MCP, SIWE JWT, Postgres, Ethers.js v6 |

---

## Module positioning (submission story)

| Module | Role in submission | On-chain proof |
|--------|-------------------|----------------|
| **Guardian** | Flagship — autonomous liquidation protection | 2 mined repay txs + simulation intercepts |
| **PayChain** | Scheduling proof — KeeperHub cron payroll | Workflow `iu0toy0rena606e07ikxu` |
| **DCA** | Registered workflow; swap scaffolding | KeeperHub `3fd2ctluvz7rdtf5yj0va`; live swap blocked on testnet |
| **Yield** | Documented constraint | Dual-wallet guard skip (roadmap: unified wallet) |

## Known limitations (tell judges proactively)

1. **Dual-wallet:** Monitored MetaMask ≠ agentic MPC signer → Yield rotator skips on-chain (no Aave `withdraw` onBehalfOf). Stated as roadmap, not a silent failure.
2. **KeeperHub OAuth ≠ API key** ([KEEPERHUB_BUGS.md](KEEPERHUB_BUGS.md) BUG-02) — paste `kh_...` in Sync Modal or set env var.
3. **MCP cold start** — first workflow may return `wf-stub-*`; warm with `pnpm run surfaces`.
4. **Guardian at safe HF** — logs `hold`, not a mined repay.
5. **OpenRouter** — paid model recommended; free `:free` models rate-limited / deprecated.

---

## Pre-demo checklist

**Automated rehearsal (2026-08-01):** `AGENT_URL=https://nexus-agent-production-7783.up.railway.app pnpm --prefix nexus-agent exec tsx src/scripts/full-system-e2e.ts` → **18/18 passed** (HF 1.32, 2 repay txHashes in feed, 2 `reverted_simulation` rows, chat + templates OK). Estimated manual walkthrough from video script: **~2:30** (under 3 min target).

- [x] Production health + portfolio API (HF ~1.32)
- [x] Feed shows repay rows with txHash (`0x23f6424…`, `0xd2d8ce6…`)
- [x] Resilience arc rows present in DB (`reverted_simulation` → `success` repay)
- [x] BaseScan links valid (see on-chain proof table above)
- [ ] MetaMask on Base Sepolia, SIWE signed in (manual)
- [ ] KeeperHub `kh_...` key saved (green sidebar)
- [ ] Railway: `BRAIN_MODEL=google/gemini-2.5-flash`, `JWT_SECRET` set
- [ ] Feed UI: repay rows show **KeeperHub MPC** badge + BaseScan links (not Simulated)
- [ ] Workflows page: KeeperHub links use `iu0toy0…` / `3fd2ctl…` (not Postgres UUID)
- [ ] Resilience page: `reverted_simulation` cards visible for allowance arc
- [ ] BaseScan tab pre-opened: `https://sepolia.basescan.org/tx/0x23f6424d9dbcb2b77c13a3ca6d4e4117c7e37d4d8e433549519ec4df2c770df3`
- [ ] Timed screen recording under 3 minutes
