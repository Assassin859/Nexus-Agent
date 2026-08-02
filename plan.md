# NexusAgent — Roadmap

> **UX bounty:** [BUGS.md](BUGS.md) · **MCP surfaces:** [docs/MCP-SURFACES.md](docs/MCP-SURFACES.md) · **Demo script:** [submission_runbook.md](submission_runbook.md)

---

## Tier 1 — Done

Production Railway · harness 52/54 · Guardian mined txs · PayChain cron · marketplace HF-read · Tempo Moderato proof · MCP surfaces doc

---

## Tier 2 — Competitive gaps

| Step | Action | Status |
|------|--------|--------|
| 2.1 | Marketplace HF-read | Done — slug `nexus-guardian-hf-read`, WF `15a4yssu4dkcim8fq3o70` |
| 2.2 | Tempo Moderato proof | Done — [tx `0xc60706…`](https://explore.testnet.tempo.xyz/tx/0xc60706a09597c96ac47f5082dc2d7cfb137cf61f7abaf3f3ab003997ace4ec74) |
| 2.3 | MCP surfaces doc | Done — [docs/MCP-SURFACES.md](docs/MCP-SURFACES.md) |
| 2.4 | Sign & Hold spike | Done — FRICTION-03 confirmed blocked in probe-mcp |
---

## Verify

```bash
pnpm --prefix nexus-agent run verify
pnpm --prefix nexus-agent run marketplace:publish-hf
pnpm --prefix nexus-agent run tempo:proof
pnpm --prefix nexus-agent run surfaces
pnpm --prefix nexus-dashboard run build
```

---

## Out of scope (Tier 3+)

Video · DoraHacks form · upstream PRs · bounty filing · bulk-proof demo runs
