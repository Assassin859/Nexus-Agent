# NexusAgent — Competitive Position (Agents Onchain 2026)

> **Purpose:** Judge-facing contrast vs. typical hackathon submissions. Not a takedown of other teams — a map of where NexusAgent invests proof depth.  
> **Last updated:** 2026-08-04 · **Production smoke:** `pnpm --prefix nexus-agent run smoke:tier2` (7/7 passed)

---

## One-line moat

**Production autonomous DeFi Guardian that independently re-verifies Aave after every repay (RPC, not platform status), with mined Base Sepolia repays, Base mainnet x402 publisher proof, a formal Reasoning Harness, and verifiable Tempo Moderato proofs — not a chat wrapper or single-script demo.**

---

## NexusAgent vs. typical agent submission

| Dimension | Typical submission | NexusAgent |
|-----------|-------------------|------------|
| **Deployment** | Localhost / README only | [Live dashboard](https://spirited-heart-production-b5c5.up.railway.app) + [agent API](https://nexus-agent-production-7783.up.railway.app) |
| **On-chain proof** | Simulated or one tx | **4× Guardian repays** + **4× Tempo** + **mainnet x402** ([BaseScan](https://basescan.org/tx/0xd15442dc664d157c241d418434111442d8481d8bef9e4dd0233f7c0471591f68)) |
| **Execution trust** | Platform status only | **Independent Aave RPC verify** after repay (`RPC verified` on Feed) |
| **Decision logic** | Single LLM reply | **Multi-candidate Reasoning Harness** + safety floor override ([TECHNICAL_SPEC.md](TECHNICAL_SPEC.md) §3) |
| **Pre-flight** | Optional / hidden | **Simulation intercept** visible on Resilience feed |
| **KeeperHub depth** | Guardian, PayChain cron, marketplace publish, Tempo workflow, MCP surface tests |
| **Marketplace** | Consume only | **Published** `nexus-guardian-hf-read` ($0.01/call x402) |
| **Multi-chain story** | Single L2 | **Base Sepolia** (Aave) + **Base mainnet** (x402) + **Tempo Moderato** (42431) |
| **Audit trail** | Ad hoc logs | Postgres `executions_log`, chain-aware Feed |
| **Integration constraints** | Undocumented | KeeperHub OAuth vs API key, dual-wallet yield guard documented in README |
| **Test harness** | Sparse | **80+** offline tests + Tier 2 production smoke |

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
| **Proof table** | 7 Sepolia txs + execution ids | 4 Base repays + 4 Tempo txs |
| **Our edge** | — | **DeFi Guardian** story, **dual-chain**, dashboard **/chat/workflows**, harness ontology |
| **Their edge** | Narrower scope = sharper demo, 56 tests, bounty starter template submitted | — |

---

## What judges should click (in order)

**No MetaMask required** — Portfolio, Feed, and Resilience load in **public preview** automatically.

1. [Dashboard Portfolio](https://spirited-heart-production-b5c5.up.railway.app) — live HF for monitored wallet  
2. [Tempo page](https://spirited-heart-production-b5c5.up.railway.app/tempo) — **Tempo Explorer** links (not KeeperHub `/executions/…` — 404 outside org)  
3. [Live Feed](https://spirited-heart-production-b5c5.up.railway.app/feed) — mined repays + `tempo_transfer` rows  
4. [Resilience](https://spirited-heart-production-b5c5.up.railway.app/resilience) — simulation → success arc  
5. [Workflows](https://spirited-heart-production-b5c5.up.railway.app/workflows) — PayChain, DCA, Guardian, Yield  
6. [Marketplace listing](https://app.keeperhub.com/hub?tab=marketplace) — slug `nexus-guardian-hf-read`  
7. [Workflows → Integrations](https://spirited-heart-production-b5c5.up.railway.app/workflows) — x402 **Paid call verified** + BaseScan link  
8. BaseScan repay: [`0x23f6424…`](https://sepolia.basescan.org/tx/0x23f6424d9dbcb2b77c13a3ca6d4e4117c7e37d4d8e433549519ec4df2c770df3)  
9. BaseScan x402: [`0xd15442…`](https://basescan.org/tx/0xd15442dc664d157c241d418434111442d8481d8bef9e4dd0233f7c0471591f68)

---

## Honest gaps (say these proactively)

1. **Dual-wallet** — Yield rotator skips on-chain when monitored ≠ agentic MPC wallet  
2. **KeeperHub OAuth ≠ API key** — paste org `kh_…` in KeeperHub Sync after SIWE for full MCP write access  
3. **HF marketplace widget** — listing live + **paid mainnet x402 proof** ([BaseScan](https://basescan.org/tx/0xd15442dc664d157c241d418434111442d8481d8bef9e4dd0233f7c0471591f68)); external paid calls execute on Base Sepolia; dashboard widget uses org MCP + local Aave fallback (no auto-pay)  
4. **Sign & Hold** — blocked upstream on KeeperHub MCP (roadmap item)  
5. **Deplex / ApprovalSentinel** — stronger on approval-security narrow scope; we lead on **DeFi harness + multi-chain proof stack**

---

## Production verification (re-run before judging)

```bash
pnpm --prefix nexus-agent run verify                    # 80+ passed
AGENT_URL=https://nexus-agent-production-7783.up.railway.app pnpm --prefix nexus-agent run smoke:tier2
pnpm --prefix nexus-agent exec tsx src/scripts/db-audit.ts
pnpm --prefix nexus-agent run e2e
```

---

*See also: [README.md](../README.md) · [TECHNICAL_SPEC.md](TECHNICAL_SPEC.md)*
