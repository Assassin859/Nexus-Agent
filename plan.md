# NexusAgent — Roadmap

> **UX bounty:** [BUGS.md](BUGS.md) · **MCP surfaces:** [docs/MCP-SURFACES.md](docs/MCP-SURFACES.md) · **Demo script:** [submission_runbook.md](submission_runbook.md)

---

## Tier 1 — Done

Production Railway · harness 60/62 · Guardian mined txs · PayChain cron · marketplace HF-read · **4× Tempo Moderato proofs** · dashboard Integrations UI · MCP surfaces doc

---

## Tier 2 — Competitive gaps

| Step | Action | Status |
|------|--------|--------|
| 2.1 | Marketplace HF-read | Done — slug `nexus-guardian-hf-read`, WF `15a4yssu4dkcim8fq3o70` |
| 2.2 | Tempo Moderato proof | Done — **4 txs** (latest [`0x36a595…`](https://explore.testnet.tempo.xyz/tx/0x36a595cace20493791aeab8400f7ff9633fcafbbb3c5da136604658cde1554fd)) |
| 2.3 | MCP surfaces doc | Done — [docs/MCP-SURFACES.md](docs/MCP-SURFACES.md) |
| 2.4 | Sign & Hold spike | Done — FRICTION-03 confirmed blocked in probe-mcp |
| 2.5 | Dashboard Integrations UI | Done — Marketplace on Portfolio; **dedicated `/tempo` page** |
---

## Verify

```bash
pnpm --prefix nexus-agent run verify
pnpm --prefix nexus-agent run marketplace:publish-hf
pnpm --prefix nexus-agent run tempo:proof
pnpm --prefix nexus-agent exec tsx src/scripts/smoke-tier2-dashboard.ts   # production Tier 2 smoke
pnpm --prefix nexus-agent run surfaces
pnpm --prefix nexus-dashboard run build
```

---

## Out of scope (Tier 3+)

Video · DoraHacks form · upstream PRs · bounty filing · bulk-proof demo runs
