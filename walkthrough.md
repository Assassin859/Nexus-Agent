# NexusAgent — System Walkthrough & Verification Log

- **Chain:** Base Sepolia (Chain ID 84532)
- **Aave Pool:** V3.2 `0x8bAB6d1b75f19e9eD9fCe8b9BD338844fF79aE27`
- **AI Brain:** OpenRouter `google/gemini-2.5-flash` via `getBrainModel()`
- **KeeperHub MCP:** `https://app.keeperhub.com/mcp` (Bearer auth)
- **Status:** Phase 0–3 complete; docs updated August 2026

---

## Architecture highlights

1. **Reasoning Harness** — `selectBestCandidate()` ranks LLM `candidateActions[]`; can override raw recommendation.
2. **Pre-flight simulation** — `simulateErc20Action()` checks allowance before repay/swap; `reverted_simulation` in Resilience.
3. **Atomic cycle budget** — `reserveCycleBudget()` prevents double repay race; release on failure.
4. **Single pending row** — Guardian, DCA, Yield insert `pending` before MCP execute; 15m TTL expiry.
5. **Capped ERC20 approvals** — exact amount + 10% buffer via `ensureAllowance()`.
6. **Dual-wallet** — monitored MetaMask vs agentic MPC signer; yield skips when mismatched.
7. **SIWE JWT** — all protected API routes; `assertWalletScope` prevents IDOR.

Full spec: [docs/TECHNICAL_SPEC.md](docs/TECHNICAL_SPEC.md)

---

## Final build & verification log

```bash
pnpm --prefix nexus-agent run build          # 0 TS errors (Railway tsc)
pnpm --prefix nexus-dashboard run build      # 0 Next.js errors

pnpm --prefix nexus-agent run verify
# Live 2026-08-02: Summary: ✓ 36 passed | ⚠ 2 skipped | ✗ 0 failed

pnpm --prefix nexus-agent run verify:integration
# Live 2026-08-02: Summary: ✓ 37 passed | ⚠ 2 skipped | ✗ 0 failed

pnpm --prefix nexus-agent run e2e
# markets + chat + templates + module triggers + feed audit

pnpm --prefix nexus-agent exec tsx src/scripts/test-openrouter-smoke.ts
# ✅ SMOKE TEST PASSED (google/gemini-2.5-flash)

pnpm --prefix nexus-agent run phase2
# Guardian → Yield → DCA → PayChain (4/4)

pnpm --prefix nexus-agent run surfaces
# 17 KeeperHub MCP surfaces

pnpm --prefix nexus-agent exec tsx src/scripts/db-audit.ts
pnpm --prefix nexus-agent run logs
```

**Skipped tests:** Guardian cycle TTL rollover, PayChain compensating cancel (Tier C — not implemented).

---

## Phase 2 execution proofs

**Guardian resilience arc** (`reverted_simulation` → mined repay → hold):

| Order | Module | Action | Status | Notes |
|-------|--------|--------|--------|-------|
| 1 | Guardian | `repay` | `reverted_simulation` | 18:41:53 — allowance intercept |
| 2 | Guardian | `repay` | `reverted_simulation` | 18:45:04 — pre-fix intercept |
| 3 | Guardian | `repay` | `success` + txHash | [0x23f6424…](https://sepolia.basescan.org/tx/0x23f6424d9dbcb2b77c13a3ca6d4e4117c7e37d4d8e433549519ec4df2c770df3) |
| 4 | Guardian | `repay` | `success` + txHash | [0xd2d8ce6…](https://sepolia.basescan.org/tx/0xd2d8ce6bf3138e981d5157089dfb90b1255f91e3d8523ae0d9dc18cf43a4f127) — HF ~1.32 |
| 5 | Guardian | `hold` | `success` | Latest cron — safe HF |
| — | Yield | `rotate` | `success` | Ownership guard skip |
| — | DCA | `swap` | scheduled | KeeperHub `xle0r4d0ozhhxd1rqeb28` (local executor) |
| — | PayChain | `payroll` | workflow | KeeperHub `iu0toy0rena606e07ikxu` |

Demo: [submission_runbook.md](submission_runbook.md)

---

## Template store (direct deploy)

| Template | Deploy path |
|----------|-------------|
| Aave Guardian | `POST /api/trigger/guardian` → `/feed` |
| USDC → ETH DCA | `POST /api/dca/schedule` → `/workflows` |
| Developer Payroll | `POST /api/payroll` → `/workflows` |
| Yield / Rebalancer | Blocked (dual-wallet) |
| Liquidation Notifier | Chat prompt |
