# NexusAgent — System Walkthrough & Verification Log

- **Chain:** Base Sepolia (Chain ID 84532)
- **Aave Pool:** V3.2 `0x8bAB6d1b75f19e9eD9fCe8b9BD338844fF79aE27`
- **AI Brain:** OpenRouter `google/gemini-2.5-flash` via `getBrainModel()`
- **Status:** Phase 0–2 complete; Phase 3 docs updated August 2026

---

## Architecture highlights

1. **Reasoning Harness** — `selectBestCandidate()` ranks LLM `candidateActions[]`; can override raw recommendation.
2. **Pre-flight simulation** — `estimateGas()` before KeeperHub broadcast; `reverted_simulation` in Resilience.
3. **Single pending row** — Guardian, DCA, Yield insert `pending` before MCP execute; 15m TTL expiry.
4. **Capped ERC20 approvals** — exact amount + 10% buffer via `ensureAllowance()`.
5. **Dual-wallet** — monitored MetaMask vs agentic MPC signer; yield skips when mismatched.
6. **SIWE JWT** — all protected API routes; `assertWalletScope` prevents IDOR.

Full spec: [docs/TECHNICAL_SPEC.md](docs/TECHNICAL_SPEC.md)

---

## Final build & verification log

```bash
pnpm --prefix nexus-agent run build          # 0 TS errors
pnpm --prefix nexus-dashboard run build      # 0 Next.js errors

pnpm --prefix nexus-agent run verify
# Summary: ✓ 18 passed | ⚠ 2 skipped | ✗ 0 failed

pnpm --prefix nexus-agent run verify:integration
# Summary: ✓ 19 passed | ⚠ 2 skipped | ✗ 0 failed

pnpm --prefix nexus-agent exec tsx src/scripts/test-openrouter-smoke.ts
# ✅ SMOKE TEST PASSED (google/gemini-2.5-flash)

pnpm --prefix nexus-agent run phase2
# Guardian → Yield → DCA → PayChain (4/4)

pnpm --prefix nexus-agent run surfaces
# 17 KeeperHub MCP surfaces

pnpm --prefix nexus-agent run logs
# executions_log sorted desc with reasons
```

**Skipped tests:** Guardian cycle TTL rollover, PayChain compensating cancel (Tier C — not implemented).

---

## Phase 2 execution proofs

| Module | Action | Status | Notes |
|--------|--------|--------|-------|
| Guardian | `hold` | `success` | HF ~3.26 |
| Yield | `rotate` | `success` | Ownership guard skip |
| DCA | `swap` | scheduled | `active_workflows` row |
| PayChain | `payroll` | workflow | KeeperHub cron registered |

Demo: [submission_runbook.md](submission_runbook.md)
