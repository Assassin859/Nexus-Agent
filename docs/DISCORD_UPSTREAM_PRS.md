# Discord post — KeeperHub upstream PRs (P4)

Paste into the hackathon Discord / KeeperHub community channel.

---

**NexusAgent upstream PRs (built while shipping our Guardian + marketplace stack)**

While building [NexusAgent](https://spirited-heart-production-b5c5.up.railway.app) for Agents Onchain, we hit real platform friction and opened four PRs on KeeperHub/keeperhub:

**#1895 — Dev-login recovery + testnet onboarding chips**
https://github.com/KeeperHub/keeperhub/pull/1895
Auto-recovers from Drizzle migration drift after `db:push`, surfaces testnet balance chips with pool addresses in Get Started (BUG-01, BUG-05).

**#1896 — MCP platform gaps**
https://github.com/KeeperHub/keeperhub/pull/1896
Deprecated execution-status aliases (BUG-06), MCP tool catalog as discovery source of truth (BUG-10), new tools (`validate_cron`, `list_executions`, Tempo hold/release/cancel), cold-start `Retry-After` hints (BUG-04).

**#1897 — Auth error envelopes + hackathon docs**
https://github.com/KeeperHub/keeperhub/pull/1897
Structured `apiError()` on auth routes (KEEP-489), Pro-plan badges on gated templates, expanded hackathon quickstart (OAuth vs API keys, rate limits, EVM-only simulate callout).

**#1898 — Chain-slug mismatch + public execution links** ⭐
https://github.com/KeeperHub/keeperhub/pull/1898
Fixes `CHAIN_MISMATCH` false-positives on marketplace listings using human-readable chain slugs (BUG-03), and adds **`/executions/[id]` as a public read-only share page** — judges and reviewers can view a workflow execution without org credentials. This was **FRICTION-09** from our build writeup; it directly unblocks verifying our `nexus-guardian-hf-read` marketplace listing and any external demo links.

**Live demo:** https://spirited-heart-production-b5c5.up.railway.app  
**Marketplace listing:** `nexus-guardian-hf-read` on app.keeperhub.com

Happy to help review or test any of these on staging.

---
