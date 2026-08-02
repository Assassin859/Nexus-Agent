# NexusAgent — Autonomous DeFi Guardian on KeeperHub

> **Hackathon:** [Agents Onchain (DoraHacks)](https://dorahacks.io/) · July 27 – Aug 13, 2026  
> **Repo:** [github.com/Assassin859/Nexus-Agent](https://github.com/Assassin859/Nexus-Agent)

## Live demo

| Service | URL |
|---------|-----|
| **Dashboard** | https://spirited-heart-production-b5c5.up.railway.app |
| **Agent API** | https://nexus-agent-production-7783.up.railway.app |
| **Chain** | Base Sepolia (84532) |

Sign in with MetaMask (Base Sepolia) → paste `kh_...` in KeeperHub Sync modal → Portfolio / Feed / Resilience.

---

## What it does

AI brain that monitors Aave V3.2 health factors, runs a **multi-candidate Reasoning Harness**, pre-flight simulates every tx, and executes via **KeeperHub MCP** + Turnkey MPC wallet.

**Lead with Guardian** — 2 mined repay txs (HF ~1.05 → ~1.32) plus a documented simulation → success resilience arc. PayChain proves KeeperHub cron scheduling. DCA/Yield are scaffolded (testnet liquidity / dual-wallet constraints — stated in runbook).

---

## Repo layout

```
nexus-agent/       # Express API, cron modules, MCP, Postgres
nexus-dashboard/   # Next.js 14 dashboard
docs/              # TECHNICAL_SPEC.md (authoritative architecture)
submission_runbook.md · railway_setup.md · KEEPERHUB_BUGS.md
```

---

## Tech stack

Node.js 22 · Next.js 14 · Vercel AI SDK v4 · OpenRouter (`google/gemini-2.5-flash`) · KeeperHub MCP · SIWE JWT · Postgres (Drizzle) · Ethers.js v6 · Base Sepolia

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

## Verification (2026-08-02)

```bash
pnpm --prefix nexus-agent run verify              # 41 passed, 2 skipped
pnpm --prefix nexus-agent run verify:integration  # 42 passed, 2 skipped
pnpm --prefix nexus-agent run phase2              # 4/4 modules
pnpm --prefix nexus-agent run e2e
```

Bugfix sprint complete (22 audit items). Tier C skipped: cycle TTL rollover, PayChain compensating cancel.

---

## On-chain proof (Guardian)

| Tx | BaseScan |
|----|----------|
| `0x23f6424…770df3` | [repay $1000](https://sepolia.basescan.org/tx/0x23f6424d9dbcb2b77c13a3ca6d4e4117c7e37d4d8e433549519ec4df2c770df3) |
| `0xd2d8ce6…a4f127` | [repay $1000](https://sepolia.basescan.org/tx/0xd2d8ce6bf3138e981d5157089dfb90b1255f91e3d8523ae0d9dc18cf43a4f127) |

Full resilience arc + video script: [submission_runbook.md](submission_runbook.md)

---

## Dual-wallet model

| Wallet | Env | Role |
|--------|-----|------|
| Monitored | `NEXT_PUBLIC_WALLET_ADDRESS` | MetaMask — Aave position reads |
| Agentic signer | `AGENTIC_WALLET_ADDRESS` | KeeperHub MPC — signs repays (`onBehalfOf`) |

Yield rotator skips on-chain when these differ (no Aave `withdraw` onBehalfOf).

---

## Deployment

See [railway_setup.md](railway_setup.md). Dashboard uses **Next.js API proxies** for SIWE/settings (no browser CORS to agent required).

---

## Documentation

| Doc | Use |
|-----|-----|
| [docs/TECHNICAL_SPEC.md](docs/TECHNICAL_SPEC.md) | Architecture, harness, schemas, modules (judges) |
| [submission_runbook.md](submission_runbook.md) | Demo script, submission fields, checklist |
| [railway_setup.md](railway_setup.md) | Production env vars & troubleshooting |
| [KEEPERHUB_BUGS.md](KEEPERHUB_BUGS.md) | UX bounty — reproducible KeeperHub friction |
| [PRs.md](PRs.md) | Upstream PR drafts |
| [plan.md](plan.md) | Submission batches & status |
| [model.md](model.md) | Zod schemas reference |

**Archived (historical):** [goal.md](goal.md) · [context.md](context.md) · [implementation_plan.md](implementation_plan.md) · [KeeperHub_Guardian_Project_Plan.md](KeeperHub_Guardian_Project_Plan.md)

---

## Known limitations

KeeperHub OAuth ≠ API key (BUG-02) · MCP cold-start stubs · Guardian `hold` at safe HF · Compound APY fallback on Sepolia · dual-wallet yield skip · OpenRouter paid model recommended

Details: [submission_runbook.md](submission_runbook.md) · [KEEPERHUB_BUGS.md](KEEPERHUB_BUGS.md)

---

*Agents Onchain 2026 · KeeperHub MCP · Base Sepolia*
