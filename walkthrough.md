# Walkthrough — Quick Reference

> **Full demo script:** [submission_runbook.md](submission_runbook.md) · **Architecture:** [docs/TECHNICAL_SPEC.md](docs/TECHNICAL_SPEC.md)

**Live dashboard:** https://spirited-heart-production-b5c5.up.railway.app

## Verify (2026-08-02)

```bash
pnpm --prefix nexus-agent run verify              # 60 passed, 2 skipped
pnpm --prefix nexus-agent exec tsx src/scripts/smoke-tier2-dashboard.ts  # Tier 2 prod smoke
pnpm --prefix nexus-agent run marketplace:publish-hf
pnpm --prefix nexus-agent run tempo:proof         # optional — adds another Moderato tx
pnpm --prefix nexus-agent run verify:integration  # 42 passed, 2 skipped
pnpm --prefix nexus-agent run phase2              # Guardian → Yield → DCA → PayChain
pnpm --prefix nexus-dashboard run build
```

## Architecture highlights

1. **Reasoning Harness** — `selectBestCandidate()` ranks/overrides LLM candidates
2. **Pre-flight simulation** — `reverted_simulation` before broadcast (zero gas)
3. **Atomic pending locks** — partial unique index on `executions_log`
4. **Capped ERC20 approvals** — exact + 10% buffer (not `uint256.max`)
5. **SIWE JWT** — server-issued nonce, wallet scope on all routes
6. **API proxies** — dashboard server routes for auth (no browser CORS)

## Demo order

Portfolio → Feed (BaseScan) → Resilience (simulation arc) → Chat → KeeperHub workflow link
