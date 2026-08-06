# NexusAgent — Competitive Position (Agents Onchain 2026)

> **Purpose:** Judge-facing contrast vs. typical hackathon submissions. Not a takedown of other teams — a map of where NexusAgent invests proof depth.  
> **Last updated:** 2026-08-06 · **Production smoke:** `smoke:tier2` **16/16** · `smoke:live-triggers` **8/8** · **35 mined** feed proofs

---

## One-line moat

**Production autonomous DeFi Guardian that independently re-verifies Aave after every repay (RPC, not platform status), with mined Base Sepolia repays, Base mainnet x402 publisher proof, a formal Reasoning Harness, and verifiable Tempo Moderato proofs — not a chat wrapper or single-script demo.**

---

## NexusAgent vs. typical agent submission

| Dimension | Typical submission | NexusAgent |
|-----------|-------------------|------------|
| **Deployment** | Localhost / README only | [Live dashboard](https://spirited-heart-production-b5c5.up.railway.app) + [agent API](https://nexus-agent-production-7783.up.railway.app) |
| **On-chain proof** | Simulated or one tx | **35 mined txs** — Guardian repays + DCA + yield rotates + payroll + 4× Tempo + mainnet x402 |
| **Execution trust** | Platform status only | **Independent RPC verify** after Guardian repay, Tempo transfer, and PayChain payroll (`RPC verified` on Feed) |
| **Decision logic** | Single LLM reply | **Multi-candidate Reasoning Harness** + safety floor override ([TECHNICAL_SPEC.md](TECHNICAL_SPEC.md) §3) |
| **Pre-flight** | Optional / hidden | **Simulation intercept** visible on Resilience feed |
| **KeeperHub depth** | Guardian, PayChain cron, marketplace publish, Tempo workflow, MCP surface tests |
| **Marketplace** | Consume only | **Published** `nexus-guardian-hf-read` ($0.01/call x402) |
| **Multi-chain story** | Single L2 | **Base Sepolia** (Aave) + **Base mainnet** (x402) + **Tempo Moderato** (42431) |
| **Audit trail** | Ad hoc logs | Postgres `executions_log`, chain-aware Feed |
| **Integration constraints** | Undocumented | KeeperHub OAuth vs API key, dual-wallet yield guard documented in README |
| **Test harness** | Sparse | **119** offline tests + Tier 2 + live-trigger production smoke |

---

## Cross-check vs. named competitors (public READMEs, Aug 2026)

### [Deplex](https://github.com/webski101/deplex) · [deplex.vercel.app](https://deplex.vercel.app)

| | Deplex | NexusAgent |
|---|--------|------------|
| **Problem** | Wallet incident response (approvals, drains) | DeFi lending liquidation protection + payroll/DCA |
| **Decision engine** | Deterministic policy compiler (**no LLM**) | LLM + **formal harness** (judge feedback: ontology over interface) |
| **Proof style** | Hash-chained audit log + Sepolia revoke txs | Postgres feed + BaseScan + Tempo Explorer |
| **Tests** | 297 offline | 60+ harness + production smoke |
| **Our edge** | — | **Aave HF recovery arc**, marketplace **publisher**, **Tempo** tier, live **Reasoning Harness** narrative |
| **Their edge** | Tamper-evident audit chain, zero-credential dashboard demo, deterministic policy | — |

### [ApprovalSentinel](https://github.com/yangyangnovelist-hub/approval-sentinel)

| | ApprovalSentinel | NexusAgent |
|---|------------------|------------|
| **Problem** | Dangerous ERC-20 approvals | Aave health factor + autonomous repay |
| **Safety gate** | Code-enforced confirm-before-revoke | Harness-ranked candidates + simulation |
| **Marketplace** | `approval-risk-rescan` ($0.01, live x402 challenge) | `nexus-guardian-hf-read` (HF snapshot) |
| **Proof table** | 7 Sepolia txs + execution ids | 4 Base repays + 1 DCA + 3 yield + 4 Tempo + x402 |
| **Our edge** | — | **DeFi Guardian** story, **dual-chain**, dashboard **/chat/workflows**, harness ontology |
| **Their edge** | Narrower scope = sharper demo, 56 tests, bounty starter template submitted | — |

---

## What judges should click (in order)

**No MetaMask required** — Portfolio, Feed, and Resilience load in **public preview** automatically. Demo wallet readable even if a prior SIWE session left a JWT in the browser.

1. [Dashboard Portfolio](https://spirited-heart-production-b5c5.up.railway.app) — live HF for monitored wallet  
2. [Tempo page](https://spirited-heart-production-b5c5.up.railway.app/tempo) — **Tempo Explorer** links (not KeeperHub `/executions/…` — 404 outside org)  
3. [Live Feed](https://spirited-heart-production-b5c5.up.railway.app/feed) — **On-chain proofs** default (35 mined) → swap / rotate / repay rows → BaseScan links  
4. [Resilience](https://spirited-heart-production-b5c5.up.railway.app/resilience) — simulation → success arc  
5. [Workflows](https://spirited-heart-production-b5c5.up.railway.app/workflows) — PayChain, DCA, Guardian, Yield  
6. [Marketplace listing](https://app.keeperhub.com/hub?tab=marketplace) — slug `nexus-guardian-hf-read`  
7. [Workflows → Integrations](https://spirited-heart-production-b5c5.up.railway.app/workflows) — x402 **Paid call verified** + BaseScan link  
8. BaseScan repays (4×): [`0x23f6424…`](https://sepolia.basescan.org/tx/0x23f6424d9dbcb2b77c13a3ca6d4e4117c7e37d4d8e433549519ec4df2c770df3) · [`0xd2d8ce6…`](https://sepolia.basescan.org/tx/0xd2d8ce6bf3138e981d5157089dfb90b1255f91e3d8523ae0d9dc18cf43a4f127) · [`0xa8400540…`](https://sepolia.basescan.org/tx/0xa8400540184814ad5a08a50c3742c832e4bc2720f5301245e8e70ecef079a17d) · [`0x162a4163…`](https://sepolia.basescan.org/tx/0x162a4163ac4843c717611541ec71056224a551865eb7dc4f8117c27feea0b0fb)  
9. BaseScan x402: [`0xd15442…`](https://basescan.org/tx/0xd15442dc664d157c241d418434111442d8481d8bef9e4dd0233f7c0471591f68)

---

## Honest gaps (say these proactively)

1. **Dual-wallet** — Yield cron skips on-chain; PayChain debits agentic MPC wallet; proof scripts demonstrate rotate/swap on agentic signer  
2. **KeeperHub OAuth ≠ API key** — paste org `kh_…` in KeeperHub Sync after SIWE for full MCP write access  
3. **HF marketplace widget** — listing live + **paid mainnet x402 proof** ([BaseScan](https://basescan.org/tx/0xd15442dc664d157c241d418434111442d8481d8bef9e4dd0233f7c0471591f68)); external paid calls execute on Base Sepolia; dashboard widget uses org MCP + local Aave fallback (no auto-pay)  
4. **Sign & Hold** — blocked upstream on KeeperHub MCP (roadmap item)  
5. **Deplex / ApprovalSentinel** — stronger on approval-security narrow scope; we lead on **DeFi harness + multi-chain proof stack**

---

## Upstream KeeperHub contributions (P4)

Platform fixes and docs submitted while building NexusAgent — separate from on-chain proof claims:

| PR | Summary |
|----|---------|
| [#1895](https://github.com/KeeperHub/keeperhub/pull/1895) | Dev-login recovery after Drizzle drift + testnet onboarding chips |
| [#1896](https://github.com/KeeperHub/keeperhub/pull/1896) | MCP aliases, tool catalog, Tempo hold/release tools, cold-start hints |
| [#1897](https://github.com/KeeperHub/keeperhub/pull/1897) | Auth error envelopes + hackathon quickstart docs |
| [#1898](https://github.com/KeeperHub/keeperhub/pull/1898) | **CHAIN_MISMATCH fix** + public `/executions/[id]` share pages (FRICTION-09) |

Discord draft for visibility: [docs/DISCORD_UPSTREAM_PRS.md](DISCORD_UPSTREAM_PRS.md)

---

## Production verification (re-run before judging)

```bash
pnpm --prefix nexus-agent run verify                    # 119 passed
$env:AGENT_URL="https://nexus-agent-production-7783.up.railway.app"
$env:DASHBOARD_URL="https://spirited-heart-production-b5c5.up.railway.app"
pnpm --prefix nexus-agent run smoke:tier2               # 16/16
pnpm --prefix nexus-agent run smoke:live-triggers       # 8/8
pnpm --prefix nexus-agent exec tsx src/scripts/db-audit.ts
pnpm --prefix nexus-agent run e2e
```

---

*See also: [README.md](../README.md) · [TECHNICAL_SPEC.md](TECHNICAL_SPEC.md)*
