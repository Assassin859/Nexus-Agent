# NexusAgent — Competitive Position (Agents Onchain 2026)

> **Purpose:** Judge-facing contrast vs. typical hackathon submissions. Not a takedown of other teams — a map of where NexusAgent invests proof depth.  
> **Last updated:** 2026-08-02 · **Production smoke:** `pnpm --prefix nexus-agent run smoke:tier2` (7/7 passed)

---

## One-line moat

**Production autonomous DeFi Guardian with a formal multi-candidate Reasoning Harness, mined Base Sepolia repays, a published KeeperHub marketplace listing, and verifiable Tempo Moderato proofs — not a chat wrapper or single-script demo.**

---

## NexusAgent vs. typical agent submission

| Dimension | Typical submission | NexusAgent |
|-----------|-------------------|------------|
| **Deployment** | Localhost / README only | [Live dashboard](https://spirited-heart-production-b5c5.up.railway.app) + [agent API](https://nexus-agent-production-7783.up.railway.app) |
| **On-chain proof** | Simulated or one tx | **4× Guardian repays** + **4× Tempo** transfer-with-memo ([/tempo](https://spirited-heart-production-b5c5.up.railway.app/tempo)) |
| **Decision logic** | Single LLM reply | **Multi-candidate Reasoning Harness** + safety floor override ([TECHNICAL_SPEC.md](TECHNICAL_SPEC.md) §3) |
| **Pre-flight** | Optional / hidden | **Simulation intercept** visible on Resilience feed |
| **KeeperHub depth** | 1–2 MCP tools | Guardian, PayChain cron, marketplace publish, Tempo workflow, 17 surface checks ([MCP-SURFACES.md](MCP-SURFACES.md)) |
| **Marketplace** | Consume only | **Published** `nexus-guardian-hf-read` ($0.01/call x402) |
| **Multi-chain story** | Single L2 | **Base Sepolia** (Aave) + **Tempo Moderato** (42431) |
| **Audit trail** | Ad hoc logs | Postgres `executions_log` (500+ rows), chain-aware Feed |
| **Ecosystem contribution** | None | [BUGS.md](../BUGS.md) UX bounty (12+ friction items, reproducible) |
| **Test harness** | Sparse | **60** offline tests + Tier 2 production smoke |

---

## Cross-check vs. named competitors (public READMEs, Aug 2026)

### [Deplex](https://github.com/webski101/deplex) · [deplex.vercel.app](https://deplex.vercel.app)

| | Deplex | NexusAgent |
|---|--------|------------|
| **Problem** | Wallet incident response (approvals, drains) | DeFi lending liquidation protection + payroll/DCA |
| **Decision engine** | Deterministic policy compiler (**no LLM**) | LLM + **formal harness** (judge feedback: ontology over interface) |
| **Proof style** | Hash-chained audit log + Sepolia revoke txs | Postgres feed + BaseScan + Tempo Explorer |
| **Tests** | 297 offline | 60 harness + production smoke |
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

**No MetaMask required** — Portfolio, Feed, and Resilience load in read-only demo mode automatically.

1. [Dashboard Portfolio](https://spirited-heart-production-b5c5.up.railway.app) — live HF ~1.86 (demo mode banner)
2. [Tempo page](https://spirited-heart-production-b5c5.up.railway.app/tempo) — **Tempo Explorer** links (not KeeperHub `/executions/…` — 404 outside org)  
3. [Live Feed](https://spirited-heart-production-b5c5.up.railway.app/feed) — mined repays + `tempo_transfer` rows  
4. [Resilience](https://spirited-heart-production-b5c5.up.railway.app/resilience) — simulation → success arc  
5. [Marketplace listing](https://app.keeperhub.com/hub?tab=marketplace) — slug `nexus-guardian-hf-read`  
6. BaseScan repay: [`0x23f6424…`](https://sepolia.basescan.org/tx/0x23f6424d9dbcb2b77c13a3ca6d4e4117c7e37d4d8e433549519ec4df2c770df3)

---

## Honest gaps (say these proactively)

1. **Dual-wallet** — Yield rotator skips on-chain when monitored ≠ agentic MPC wallet  
2. **KeeperHub OAuth ≠ API key** — paste `kh_…` ([BUG-02](../BUGS.md))  
3. **HF marketplace widget** — falls back to local Aave on x402 (listing is live; paid call optional)  
4. **Sign & Hold** — blocked upstream ([FRICTION-03](../BUGS.md))  
5. **Deplex / ApprovalSentinel** — stronger on approval-security narrow scope; we lead on **DeFi harness + multi-chain proof stack**

---

## Production verification (re-run before judging)

```bash
pnpm --prefix nexus-agent run verify                    # 60 passed
AGENT_URL=https://nexus-agent-production-7783.up.railway.app pnpm --prefix nexus-agent run smoke:tier2
pnpm --prefix nexus-agent exec tsx src/scripts/db-audit.ts
```

---

*See also: [submission_runbook.md](../submission_runbook.md) · [README.md](../README.md)*
