# NexusAgent — Tier 1 Roadmap

> **UX bounty:** [BUGS.md](BUGS.md) · **Demo script (optional):** [submission_runbook.md](submission_runbook.md)

---

## Done

Production Railway · harness 41/42 · Guardian mined txs · PayChain cron · pagination · ETH chart · HF alignment · Live Feed pipeline · DB cleanup (0 mismatches) · agent log labels · commit `0c6dc38`

---

## Tier 1 — Ship and verify

| Step | Action | Status |
|------|--------|--------|
| 1 | Commit doc updates (`BUGS.md`, README, plan) | In progress |
| 2 | Push `main` → GitHub → Railway redeploy | Pending |
| 3 | Local verify (`verify` + dashboard `build`) | Pending |
| 4 | Production smoke (health, feed, portfolio, db-audit) | Pending |

---

## Verify

```bash
pnpm --prefix nexus-agent run verify
pnpm --prefix nexus-dashboard run build
pnpm --prefix nexus-agent exec tsx src/scripts/db-audit.ts
pnpm --prefix nexus-agent run phase2   # optional
```

---

## Out of scope (for now)

Video · DoraHacks form · marketplace · Tempo proof · upstream PRs · bulk-proof demo runs
