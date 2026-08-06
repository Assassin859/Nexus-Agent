# NexusAgent — Autonomous DeFi Guardian on KeeperHub

> **Hackathon:** [Agents Onchain (DoraHacks)](https://dorahacks.io/) · July 27 – Aug 13, 2026  
> **Repo:** [github.com/Assassin859/Nexus-Agent](https://github.com/Assassin859/Nexus-Agent)

**NexusAgent doesn't trust its execution layer's word — it independently re-checks Aave on-chain state after every Guardian action, and refuses to broadcast anything the pre-flight simulation can't prove is safe.**

Live production stack: **multi-candidate Reasoning Harness**, **mined Base Sepolia Guardian repays / DCA / yield rotates** (RPC-verified on Feed), **35 mined txs** on Feed (incl. live mining session Aug 6), **mainnet x402** paid marketplace consumption ([BaseScan](https://basescan.org/tx/0xd15442dc664d157c241d418434111442d8481d8bef9e4dd0233f7c0471591f68)), **4× Tempo Moderato** attestation txs, and a **published** KeeperHub listing (`nexus-guardian-hf-read`).

## Live URLs

| Service | URL |
|---------|-----|
| **Dashboard** | https://spirited-heart-production-b5c5.up.railway.app |
| **Tempo proofs** | https://spirited-heart-production-b5c5.up.railway.app/tempo |
| **Agent API** | https://nexus-agent-production-7783.up.railway.app |
| **Chains** | Base Sepolia (84532) · Base mainnet x402 (8453) · Tempo Moderato (42431) |
| **Monitored wallet** | `0x89f97Cb35236a1d0190FB25B31C5C0fF4107Ec1b` |

---

## Judge path (no wallet required)

Open the dashboard **without signing in** — Portfolio, Feed, Resilience, Workflows, and Chat load in **public preview** (read-only live data for the monitored wallet). Demo wallet data stays readable even if a previous SIWE session left a JWT in the browser (no 403 on judge path).

**Manual Aave controls (signed-in):** After SIWE + KeeperHub Sync (`kh_…`), use **Aave Position Controls** on Portfolio or chat (*"Supply 50 USDC to Aave"*, *"Repay 25 USDC"*) — preview then confirm. USDC is debited from the **agentic MPC wallet**; supply/repay use `onBehalfOf` the monitored wallet. In **dual-wallet** mode, borrow may require Aave credit delegation; withdraw uses agentic Aave supply only.

1. [Portfolio](https://spirited-heart-production-b5c5.up.railway.app) — live HF, collateral, workflows summary, Aave controls (signed-in)  
2. [Resilience](https://spirited-heart-production-b5c5.up.railway.app/resilience) — simulation intercept → mined repay arc  
3. [Feed](https://spirited-heart-production-b5c5.up.railway.app/feed) — defaults to **on-chain proofs** (pinned BaseScan/Tempo links + mined txs only); toggle **All decisions** for full cron log  
4. [Workflows](https://spirited-heart-production-b5c5.up.railway.app/workflows) — PayChain, DCA, Guardian, Yield + platform modules  
5. [/tempo](https://spirited-heart-production-b5c5.up.railway.app/tempo) — 4 attestation txs with Tempo Explorer links  
6. [Marketplace listing](https://app.keeperhub.com/hub?tab=marketplace) — slug `nexus-guardian-hf-read`  
7. [Workflows → Integrations card](https://spirited-heart-production-b5c5.up.railway.app/workflows) — **Paid call verified** + [Base mainnet x402 tx](https://basescan.org/tx/0xd15442dc664d157c241d418434111442d8481d8bef9e4dd0233f7c0471591f68)

**Optional sign-in:** MetaMask (Base Sepolia) → KeeperHub Sync (`kh_...`) → full write access (chat, templates, custom workflows). Use **Return to public preview** if you connected by accident.

**30s narration:** Resilience → simulation card → Feed (**RPC verified** badge) → BaseScan repay link → *"We don't trust the platform's word — independent Aave RPC check after every repay."*

### Live-trigger demo (video segment B)

Sign in with the **monitored demo wallet** MetaMask account so feed proofs stay visible while chat/triggers run. Chat writes (payroll, DCA schedule) require a personal `kh_...` API key in KeeperHub Sync.

| Trigger | Expected on demo |
|---------|------------------|
| `POST /api/trigger/guardian` | 200 — likely `hold` when HF is healthy |
| `POST /api/trigger/dca` | 200 — Sepolia Uniswap may revert; show mined DCA proof in Feed instead |
| `POST /api/trigger/yield` | 200 — on-chain skip (dual-wallet); Yield Rotate tile already has 3 mined proofs |
| Chat payroll | USDC debits **agentic MPC wallet**, not MetaMask — see dual-wallet banner on Workflows |

**Pre-recording checklist:**

```powershell
pnpm --prefix nexus-agent run verify
pnpm --prefix nexus-agent run build
pnpm --prefix nexus-dashboard exec tsc --noEmit
$env:AGENT_URL="https://nexus-agent-production-7783.up.railway.app"
$env:DASHBOARD_URL="https://spirited-heart-production-b5c5.up.railway.app"
pnpm --prefix nexus-agent run smoke:tier2
pnpm --prefix nexus-agent run smoke:live-triggers
```

1. Incognito → Portfolio HF loads without sign-in  
2. Feed → **On-chain proofs** → swap + 3 rotate rows with BaseScan  
3. Resilience → **Yield Rotate** tile > 0 → click to filter  
4. Rehearsal browser with old SIWE token → pages still load (public demo data)  
5. Live segment: SIWE as demo wallet → chat read-only works without `kh_` key  

---

## Why NexusAgent (vs. typical submissions)

| Dimension | Typical agent demo | NexusAgent |
|-----------|-------------------|------------|
| Deployment | Localhost | **Live Railway** dashboard + agent |
| On-chain proof | Simulated / one tx | **35 mined txs** (repays + DCA + yield + payroll + Tempo + x402) |
| Decision logic | Single LLM answer | **Multi-candidate Reasoning Harness** |
| Failure handling | Hidden | **Resilience** feed (simulation intercept) |
| KeeperHub | Consumer only | **Publisher** (`nexus-guardian-hf-read`) + Tempo MCP |
| Tests | Ad hoc | **119** harness tests + production smoke (`smoke:tier2`, `smoke:live-triggers`) |

Full competitor cross-check: [docs/COMPETITIVE_POSITION.md](docs/COMPETITIVE_POSITION.md)

---

## What it does

AI brain that monitors Aave V3.2 health factors, runs a **multi-candidate Reasoning Harness**, pre-flight simulates every tx, and executes via **KeeperHub MCP** + Turnkey MPC wallet.

**Guardian** — mined repay txs (HF recovery) plus documented simulation → success resilience arc. **PayChain** — KeeperHub cron payroll scheduling (USDC debits **agentic MPC wallet** in dual-wallet mode). **Tier 2** — marketplace HF-read listing, Tempo Moderato proofs. **DCA / Yield** — mined proof scripts (`dca:proof`, `yield:proof`); cron yield trigger skips on-chain when wallets differ.

---

## Repo layout

```
nexus-agent/       # Express API, cron modules, MCP, Postgres
nexus-dashboard/   # Next.js 14 dashboard (/tempo, /feed, /resilience, /workflows)
docs/              # TECHNICAL_SPEC.md, COMPETITIVE_POSITION.md
```

---

## Tech stack

Node.js 22 · Next.js 14 · Vercel AI SDK v4 · OpenRouter (`google/gemini-2.5-flash`) · KeeperHub MCP · SIWE JWT · Postgres (Drizzle) · Ethers.js v6 · Base Sepolia · Tempo Moderato

---

## Quickstart (local)

```bash
git clone https://github.com/Assassin859/Nexus-Agent.git && cd Nexus-Agent
cp .env.example .env   # fill OPENROUTER, DATABASE_URL, ALCHEMY, KEEPERHUB, wallets, JWT_SECRET

pnpm --prefix nexus-agent install && pnpm --prefix nexus-dashboard install
pnpm --prefix nexus-agent run db:migrate

pnpm --prefix nexus-agent dev      # :3001
pnpm --prefix nexus-dashboard dev  # :3000
```

Browser: SIWE sign-in → KeeperHub Sync (`kh_...`) → Chat: *"What is my health factor?"*

---

## Verification (judges & developers)

```bash
pnpm --prefix nexus-agent run verify              # 119 harness tests (Tier A + optional HTTP)
pnpm --prefix nexus-agent run verify:integration  # integration checks
pnpm --prefix nexus-agent run smoke:tier2         # production Tier 2 (set AGENT_URL + DASHBOARD_URL)
pnpm --prefix nexus-agent run smoke:live-triggers # guardian/dca/yield triggers + mined feed
pnpm --prefix nexus-agent run e2e                 # full-system E2E
pnpm --prefix nexus-agent run surfaces            # KeeperHub MCP surface catalog
pnpm --prefix nexus-agent exec tsx src/scripts/db-audit.ts

# On-chain proof scripts (local, production DATABASE_URL)
pnpm --prefix nexus-agent run yield:proof:prepare
pnpm --prefix nexus-agent run yield:proof
pnpm --prefix nexus-agent run dca:proof
pnpm --prefix nexus-agent run mine:session   # multi-round DCA + yield + repay (local)
```

---

## On-chain proof (Guardian)

| Tx | BaseScan |
|----|----------|
| `0x23f6424…770df3` | [repay $1000](https://sepolia.basescan.org/tx/0x23f6424d9dbcb2b77c13a3ca6d4e4117c7e37d4d8e433549519ec4df2c770df3) |
| `0xd2d8ce6…a4f127` | [repay $1000](https://sepolia.basescan.org/tx/0xd2d8ce6bf3138e981d5157089dfb90b1255f91e3d8523ae0d9dc18cf43a4f127) |
| `0xa8400540…9a17d` | [repay $467](https://sepolia.basescan.org/tx/0xa8400540184814ad5a08a50c3742c832e4bc2720f5301245e8e70ecef079a17d) |
| `0x162a4163…b0fb` | [repay $533](https://sepolia.basescan.org/tx/0x162a4163ac4843c717611541ec71056224a551865eb7dc4f8117c27feea0b0fb) |

**PayChain payroll proof (Base Sepolia):**

| Tx | BaseScan |
|----|----------|
| `0x5a113d7…6391d` | [payroll $0.01 USDC](https://sepolia.basescan.org/tx/0x5a113d704ef78f510119d4e10959bc49c3a3869da571df67606583d2fc66391d) |

**DCA proof (Base Sepolia):**

| Tx | BaseScan |
|----|----------|
| `0xb1d5d0…214ca` | [DCA $2 USDC leg](https://sepolia.basescan.org/tx/0xb1d5d0cd6acd22d0602eda018fee969e57bde5c3dceffeb5275072594f3214ca) |

Sepolia Uniswap V3 USDC→WETH pools are illiquid; proof script mines the USDC disbursement leg via KeeperHub MCP (same feed `swap` action).

**Yield rotate proofs (Base Sepolia, 3× Aave→Compound):**

| Round | Tx | BaseScan |
|-------|-----|----------|
| 1 | `0x76ed48…d68a1` | [rotate $1.50](https://sepolia.basescan.org/tx/0x76ed48b021ee8239ec05ff0ea7a0deff0d98fc55c367f78eea5575c0d80d68a1) |
| 2 | `0x42ee23…211e` | [rotate $1.50](https://sepolia.basescan.org/tx/0x42ee234ed84381d94807e9843ffb234a89b84c3e2bc32226ec7dd860d191211e) |
| 3 | `0x33b945…6c13` | [rotate $1.50](https://sepolia.basescan.org/tx/0x33b945bb07802f0972139974ec4a1473e1f98c9b96de0881eccfd279a9856c13) |

Proof scripts execute on the **agentic** signer but log to the **monitored** wallet for Feed visibility. Cron yield trigger still skips on-chain when wallets differ (no Aave `withdraw` onBehalfOf).

**Tempo Moderato proof (4× transfer-with-memo):**

| # | Tx | Explorer |
|---|-----|----------|
| 1 | `0xc60706…ce4ec74` | [Tempo Explorer](https://explore.testnet.tempo.xyz/tx/0xc60706a09597c96ac47f5082dc2d7cfb137cf61f7abaf3f3ab003997ace4ec74) |
| 2 | `0x64e57b…d12b87` | [Tempo Explorer](https://explore.testnet.tempo.xyz/tx/0x64e57b1a27b8efdda803f4d6c7113e27cea5c1877652f0ffa47c394b6ad12b87) |
| 3 | `0xceba5b…ebded3` | [Tempo Explorer](https://explore.testnet.tempo.xyz/tx/0xceba5bead95ab9cf64e18fc801622a985d5405ddb38dfd5f855c1f4ac1ebded3) |
| 4 | `0x36a595…554fd` | [Tempo Explorer](https://explore.testnet.tempo.xyz/tx/0x36a595cace20493791aeab8400f7ff9633fcafbbb3c5da136604658cde1554fd) |

**Dashboard:** [/tempo](https://spirited-heart-production-b5c5.up.railway.app/tempo) · Public proof = **Tempo Explorer** (KeeperHub `/executions/…` links 404 for external viewers)

**Marketplace:** [`nexus-guardian-hf-read`](https://app.keeperhub.com/hub?tab=marketplace) — read-only HF snapshot ($0.01/call). Publish: `pnpm --prefix nexus-agent run marketplace:publish-hf`

**x402 paid HF-read (Base mainnet):**

| Tx | BaseScan |
|----|----------|
| `0xd15442…591f68` | [x402 $0.01 USDC](https://basescan.org/tx/0xd15442dc664d157c241d418434111442d8481d8bef9e4dd0233f7c0471591f68) |

Separate buyer wallet via `@keeperhub/wallet` (not org `kh_` key). Payment settles on Base mainnet (8453); HF read executes on Base Sepolia (84532).

---

## Dual-wallet model

| Wallet | Env | Role |
|--------|-----|------|
| Monitored | `NEXT_PUBLIC_WALLET_ADDRESS` | MetaMask — Aave position reads |
| Agentic signer | `AGENTIC_WALLET_ADDRESS` | KeeperHub MPC — signs repays (`onBehalfOf`), PayChain payroll, proof scripts |

Yield rotator **cron** skips on-chain when these differ (no Aave `withdraw` onBehalfOf). **Proof scripts** (`yield:proof`, `dca:proof`) execute on the agentic signer and log to the monitored wallet for Feed visibility. PayChain payroll USDC is debited from the agentic wallet — see dual-wallet banner on Workflows.

---

## Deployment (Railway)

Two services: **nexus-agent** (Express + cron + Postgres) and **nexus-dashboard** (Next.js).

**Agent env (required):** `DATABASE_URL`, `JWT_SECRET`, `KEEPERHUB_API_KEY`, `AGENTIC_WALLET_ADDRESS`, `ALCHEMY_RPC_URL`, `OPENROUTER_API_KEY`, `BRAIN_MODEL`

**Dashboard env:** `NEXT_PUBLIC_AGENT_URL` (agent public URL), `NEXT_PUBLIC_WALLET_ADDRESS`

See [.env.example](.env.example) for full variable list. **Never commit `.env`.**

Dashboard uses **Next.js API proxies** for SIWE/settings (no browser CORS to agent required).

---

## Documentation

| Doc | Use |
|-----|-----|
| [docs/TECHNICAL_SPEC.md](docs/TECHNICAL_SPEC.md) | Architecture, harness, schemas, modules |
| [docs/COMPETITIVE_POSITION.md](docs/COMPETITIVE_POSITION.md) | Why us vs. typical submissions |
| [docs/DISCORD_UPSTREAM_PRS.md](docs/DISCORD_UPSTREAM_PRS.md) | Paste-ready Discord post for upstream PRs #1895–#1898 |

---

## Known constraints

- **KeeperHub OAuth ≠ API key** — full MCP write access requires pasting org `kh_...` key in KeeperHub Sync after SIWE  
- **Dual-wallet** — Yield cron skips on-chain; PayChain debits agentic MPC wallet; proof scripts bypass for demo txs  
- **Public demo read** — demo wallet is always readable (even with stale JWT from a prior SIWE session)  
- **Guardian at safe HF** — logs `hold`, not a new repay (by design — no wasted gas)  
- **DCA live trigger** — Sepolia Uniswap illiquid; mined DCA proof uses USDC disbursement fallback  
- **MCP availability** — if KeeperHub MCP is unreachable, workflows register locally until sync succeeds  

---

*Agents Onchain 2026 · KeeperHub MCP · Base Sepolia · Tempo Moderato*
