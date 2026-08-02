# Submission Roadmap — August 2026

> **Live:** [Dashboard](https://spirited-heart-production-b5c5.up.railway.app) · [Agent](https://nexus-agent-production-7783.up.railway.app)

---

## ✅ Done

| Batch | Status |
|-------|--------|
| **1 — Production gate** | phase2 + logs against Railway ✅ |
| **2 — Dashboard E2E** | Railway deploy + SIWE + portfolio ✅ |
| **5 — Bugfix sprint** | 22 items, verify 41/42 ✅ |
| **Docs & deploy** | Next 14.2.35, pnpm lock, API proxies ✅ |

---

## 🔲 Remaining (before Aug 13)

| Batch | Task |
|-------|------|
| **3 — Rehearsal** | Timed runthrough of [submission_runbook.md](submission_runbook.md) video script |
| **4 — Submit** | Record 3-min video · DoraHacks form · final git push |

---

## Verify quick ref

```bash
pnpm --prefix nexus-agent run verify              # 41 passed
pnpm --prefix nexus-agent run verify:integration    # 42 passed
pnpm --prefix nexus-agent run phase2
pnpm --prefix nexus-agent run e2e
```

---

## Post-submission (P2)

Tier C harness tests · forced simulation script · Compound APY decode fix
