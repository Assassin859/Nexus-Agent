# NexusAgent — Autonomous Web3 Wealth Management Agent

> **Hackathon:** [Agents Onchain (DoraHacks)](https://dorahacks.io/) · **Dates:** July 27 – Aug 13, 2026  
> **Targets:** Grand Prize ($2,000) + Best Onboarding UX Improvement Bounty ($1,000)  
> **Repository:** [github.com/Assassin859/Nexus-Agent](https://github.com/Assassin859/Nexus-Agent)

---

## What Is NexusAgent?

NexusAgent is an **AI brain** that monitors onchain DeFi positions and autonomously acts on them using **KeeperHub as its execution layer**.

> *KeeperHub is the railway network — scheduled, gas-managed, MEV-protected onchain execution.  
> NexusAgent is the autonomous train driver — it reads your portfolio, reasons about risk and yield, and tells KeeperHub what to execute and when.*

Users talk to the agent in plain English, sign in with **SIWE (Sign-In With Ethereum)**, and the backend runs Guardian, DCA, Yield, and PayChain modules on cron — with every transaction pre-flight simulated before broadcast.

---

## Repository Structure

```
keeperhub-guardian/
├── nexus-agent/          # Node.js backend — AI brain, cron modules, MCP, Postgres
│   ├── src/
│   │   ├── brain/        # provider.ts, agent-tools.ts, Zod schemas
│   │   ├── modules/      # guardian, dca, yield-rotator, paychain
│   │   ├── lib/          # aave, calldata, mcp-client, rpc, simulate
│   │   └── scripts/      # phase2-run, check-logs, clear-db, verify-full-system, smoke tests
│   └── drizzle/          # Postgres migrations
├── nexus-dashboard/      # Next.js 14 dashboard (App Router)
│   ├── app/              # Portfolio, Chat, Workflows, Feed, Resilience, …
│   ├── .env.local        # NEXT_PUBLIC_AGENT_URL (gitignored — copy from .env.example)
│   └── components/       # Sidebar, DecisionMatrixCard, TransactionCard, …
├── docs/TECHNICAL_SPEC.md
├── submission_runbook.md # Verification commands, known limits, deployment notes
├── KEEPERHUB_BUGS.md     # Documented KeeperHub integration friction (hackathon material)
└── .env.example          # Single root .env — loaded by nexus-agent/src/lib/env.ts
```

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Backend** | Node.js 22, Express, TypeScript, Drizzle ORM, Postgres |
| **Frontend** | Next.js 14 (App Router), React 18, Tailwind CSS 4 |
| **AI Brain** | Vercel AI SDK v4 — `generateText` + `generateObject` + native tool calling |
| **LLM Provider** | **OpenRouter** (`google/gemini-2.5-flash`, paid) → Gemini → OpenAI → GitHub Models (last-resort fallback) |
| **Execution** | KeeperHub MCP, Turnkey MPC agentic wallet, Base Sepolia |
| **Auth** | SIWE JWT (MetaMask sign-in) + optional KeeperHub OAuth |
| **Chain** | **Base Sepolia** — Aave V3.2, Compound V3, Uniswap V3 |

---

## Architecture

```
User Message ("dca 50 usdc weekly", "what's my health factor?", "pay dev team 20 USDC every Thursday")
                                │
                                ▼
         ┌──────────────────────────────────────────────┐
         │       NexusAgent Conversational Agent        │
         │   getBrainModel() via OpenRouter (gemini-2.5-flash) │
         │     Vercel AI SDK · maxSteps: 5 · 8 tools    │
         └──────────────────────┬───────────────────────┘
                                │
          ┌─────────────────────┴─────────────────────┐
          ▼                                           ▼
[Native Tool Execution]                     [Conversational Response]
  schedulePayroll · scheduleDCA               Natural language reply
  cancelWorkflows · listWorkflows
  listPayees · queryPortfolio
  triggerStrategy · getLiveTransactions
          │
          ▼
┌─────────────────────────────────────────────────────────┐
│              Background Cron Modules (always on)        │
│  Guardian (5 min) · Yield Rotator (15 min) · DCA (1 hr) │
└──────────────────────────┬──────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────┐
│                 KeeperHub MCP Execution                 │
│  Turnkey MPC signing (AGENTIC_WALLET_ADDRESS)           │
│  Pre-flight simulation · 15-min pending TTL cleanup   │
│  BaseScan links when real txHash exists (else Simulated) │
└─────────────────────────────────────────────────────────┘
                           ▼
                    executions_log (Postgres)
                           ▼
              Dashboard Live Feed + Decision Matrix
```

> Full architecture spec: [docs/TECHNICAL_SPEC.md](docs/TECHNICAL_SPEC.md)

---

## Dashboard (Implemented)

### Sidebar navigation order

| # | Page | Route | Purpose |
|---|------|-------|---------|
| 1 | **Portfolio** | `/` | Live Aave V3.2 position — HF, collateral, debt, LTV, APY delta |
| 2 | **AI Chat** | `/chat` | Natural-language agent with 8 native tools |
| 3 | **Workflows** | `/workflows` | Active payroll / DCA / rotate schedules |
| 4 | **Payees** | `/payees` | Saved recipients, teams, vault pools |
| 5 | **Live Feed** | `/feed` | Real-time execution audit log + Decision Matrix |
| 6 | **Resilience** | `/resilience` | Simulation outcomes + Decision Matrix |
| 7 | **Alerts** | `/alerts` | Liquidation & strategy alert history |
| 8 | **Templates** | `/templates` | 6 pre-built workflow templates (Fork & Deploy) |

### AI Decision Matrix (`DecisionMatrixCard`)

Shown on **Live Feed** and **Resilience**. Buckets recent `executions_log` rows into autonomous decision paths:

| Path | Bucket rule | Color |
|------|-------------|-------|
| **Hold** | `action === "hold"` | Green |
| **Partial Repay** | `repay` / `supply_collateral` + HF 1.10–1.40 or `safetyStatus === "warning"` | Yellow |
| **Full Repay** | `repay` + HF &lt; 1.10 or `safetyStatus === "critical_liquidation_risk"` | Red |
| **Yield Rotate** | `action === "rotate"` | Blue |
| **Guarded / Blocked** | `action === "block_transaction"` | Gray |

Also displays **Successful Executions (Recent)** — count of `status === "success"` in the last 50 feed rows.

### Transaction proof badges (`TransactionCard`)

Every execution log row shows:

| Badge | When |
|-------|------|
| **KeeperHub MPC** | Real on-chain tx with valid non-stub `txHash` |
| **Simulated** | `simulated_stub`, missing hash, or MCP stub mode |
| **In-Flight** | `status === "pending"` |

Footer links: **View on KeeperHub** when `aiAnalysis.workflowId` is present and non-stub; otherwise **KeeperHub Managed** label. **BaseScan** link only when a real `txHash` exists → `https://sepolia.basescan.org/tx/0x...`

Plus: copyable tx hash (when present) and expandable **AI Reasoning** panel (`harnessRecommendation`, `harnessOverride`, `healthFactor`, etc.).

> **Honest status:** Guardian **`hold`s** at safe HF (~3.26 historically; ~1.32 after repay). **On-chain proof verified:** 2 mined `repay` txs on BaseScan (see [submission_runbook.md](submission_runbook.md)).

### KeeperHub connection (3-tier sidebar model)

| Tier | State | Meaning |
|------|-------|---------|
| Green | KeeperHub MCP Connected | `kh_...` API key saved in Postgres |
| Amber | OAuth Session Active | Signed into KeeperHub web — still needs API key for MCP |
| Amber | KeeperHub Unlinked | No connection |

API key is saved via **KeeperHub Sync Modal** (manual paste + SIWE) or root `.env` `KEEPERHUB_API_KEY`.

---

## AI Brain Provider (`nexus-agent/src/brain/provider.ts`)

Priority order — first configured wins:

```
OPENROUTER_API_KEY  →  GEMINI_API_KEY  →  OPENAI_API_KEY  →  GITHUB_TOKEN
```

**Recommended (production):**

```bash
OPENROUTER_API_KEY=sk-or-v1-...
BRAIN_MODEL=google/gemini-2.5-flash
```

Free OpenRouter models (`:free` suffix) are rate-limited and several IDs are deprecated — use paid `gemini-2.5-flash` for demos.

Provider logs at startup: `AI brain provider initialized { provider: "openrouter", model: "..." }`

---

## Submission focus (DoraHacks 2026)

**Lead with Guardian** — the only module with mined on-chain proof (2 repay txs, HF ~1.05 → ~1.32) plus a documented **simulation → success** resilience arc in `/resilience`.

**PayChain** demonstrates KeeperHub scheduling (payroll workflow on cron). **DCA and Yield** are implemented and template-visible but intentionally **scaffolding**: DCA swap hits testnet liquidity limits; Yield skips when monitored MetaMask ≠ agentic MPC wallet. Frame these as roadmap modules for unified-wallet deployments rather than silent gaps.

Demo order: Portfolio → Feed (BaseScan repay links) → Resilience (reverted_simulation cards) → Chat → Templates (Guardian fork) → KeeperHub workflow link.

---

## Autonomous Modules

### Guardian — Liquidation Protection
- **File:** `nexus-agent/src/modules/guardian.ts`
- **Cron:** every 5 minutes
- Reads Aave V3.2 Health Factor on **Base Sepolia** for the monitored wallet
- AI `generateObject` with Reasoning Harness (4 candidate actions ranked, harness can override LLM)
- Persists `healthFactor`, `safetyStatus`, harness fields in `aiAnalysis` JSON
- Actions: `repay`, `supply_collateral`, `hold`, `block_transaction`
- Thresholds: critical &lt; 1.10 · warning 1.10–1.40 · hold &gt; 1.40

### Yield Rotator — APY Optimization *(secondary / demo-limited)*
- **Cron:** every 15 minutes
- Compares Aave V3.2 vs Compound V3 USDC supply APY on Base Sepolia
- **Compound APY:** on-chain `supplyRatePerSecond` may fail on Base Sepolia test deployments — falls back to configured default APY in logs
- **Dual-wallet constraint:** skips on-chain rotation when `monitoredWallet ≠ AGENTIC_WALLET_ADDRESS` (Aave withdraw has no `onBehalfOf`)

### DCA Engine — Dollar-Cost Averaging *(secondary)*
- **Cron:** every hour
- USDC → ETH via Uniswap V3; delays if gas &gt; 5% of purchase value
- Single active DCA per wallet (upsert semantics)
- Chat + `/api/dca/schedule` for registration

### PayChain — Recurring Payroll *(secondary)*
- Natural-language payroll from chat
- Team remainder cent distribution ($100 / 3 → $33, $33, $34)
- Compensating `cancelWorkflow()` rollback on partial failure
- Duplicate collision detection + payee auto-creation

---

## Chat Agent Tools (8 native tools)

| Tool | Example user phrase |
|------|---------------------|
| `schedulePayroll` | "pay alice 50 USDC every friday" |
| `scheduleDCA` | "dca 50 usdc into eth weekly" |
| `cancelWorkflows` | "stop all payrolls" |
| `listWorkflows` | "what are my active workflows?" |
| `listPayees` | "show my team members" |
| `queryPortfolio` | "what is my health factor?" |
| `triggerStrategy` | "trigger guardian now" |
| `getLiveTransactions` | "show recent basescan links" |

Chat requires **SIWE authentication** (MetaMask sign-in in sidebar).

---

## On-Chain Contracts (Base Sepolia)

| Contract | Address |
|----------|---------|
| Aave V3.2 Pool | `0x8bAB6d1b75f19e9eD9fCe8b9BD338844fF79aE27` |
| USDC (Aave test) | `0xba50Cd2A20f6DA35D788639E581bca8d0B5d4D5f` |
| WETH | `0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9` |
| Compound V3 cUSDC | `0xAec1F48e02Cfb822Be958B68C7957156EB3F0b6e` |

Reference: [Aave V3 Base Sepolia address book](https://github.com/bgd-labs/aave-address-book/blob/main/src/AaveV3BaseSepolia.sol)

---

## Dual-Wallet Architecture

| Wallet | Env var | Role |
|--------|---------|------|
| **Monitored wallet** | `NEXT_PUBLIC_WALLET_ADDRESS` | User's MetaMask — Aave position read here (HF, collateral, debt) |
| **Agentic signer** | `AGENTIC_WALLET_ADDRESS` | KeeperHub Turnkey MPC wallet — signs & broadcasts txs (`onBehalfOf` repay/supply) |

These are **different addresses**. Portfolio reads the monitored wallet; execution uses the agentic wallet.

---

## Environment Variables

Copy `.env.example` → `.env` at the **repo root** (not inside `nexus-agent/`).

### Required for local demo

| Variable | Purpose |
|----------|---------|
| `OPENROUTER_API_KEY` | Primary AI brain (get key at [openrouter.ai/keys](https://openrouter.ai/keys)) |
| `BRAIN_MODEL` | `google/gemini-2.5-flash` (recommended) |
| `DATABASE_URL` | Postgres connection string |
| `ALCHEMY_RPC_URL` | Base Sepolia RPC (`https://base-sepolia.g.alchemy.com/v2/...`) |
| `KEEPERHUB_API_KEY` | `kh_...` org key for real MCP execution |
| `AGENTIC_WALLET_ADDRESS` | KeeperHub MPC signer wallet |
| `NEXT_PUBLIC_AGENT_URL` | `http://localhost:3001` |
| `NEXT_PUBLIC_WALLET_ADDRESS` | Monitored MetaMask address (has Aave loan) |
| `JWT_SECRET` | Required in production |

### Optional / fallback

| Variable | Purpose |
|----------|---------|
| `GEMINI_API_KEY` | Direct Google Gemini (if OpenRouter unavailable) |
| `GEMINI_MODEL` | Default `gemini-2.0-flash` |
| `OPENAI_API_KEY` / `GITHUB_TOKEN` | Legacy fallbacks |
| `INFURA_RPC_URL` | RPC fallback |
| `OPENROUTER_SITE_URL` | Referer header for OpenRouter analytics |
| `ALERT_CHANNEL` | `telegram` \| `discord` \| `email` |
| `ALLOWED_ORIGINS` | CORS — add dashboard URL for production |

---

## Quickstart (Team Setup)

### 1. Clone & install

```bash
git clone https://github.com/Assassin859/Nexus-Agent.git
cd Nexus-Agent
cp .env.example .env
# Fill in all required variables above

pnpm --prefix nexus-agent install
pnpm --prefix nexus-dashboard install
```

### 2. Database

```bash
pnpm --prefix nexus-agent run db:migrate
# Optional: seed demo data
pnpm --prefix nexus-agent run db:seed
```

### 3. Run both services

```bash
# Terminal 1 — Backend (port 3001)
pnpm --prefix nexus-agent dev

# Terminal 2 — Dashboard (port 3000)
pnpm --prefix nexus-dashboard dev
```

### 4. Browser setup

1. Open **http://localhost:3000**
2. Click **Sign In with Ethereum** (MetaMask, Base Sepolia)
3. Open **KeeperHub Sync Modal** → paste `kh_...` API key → Save & Sync
4. Go to **AI Chat** → ask *"What is my Aave health factor?"*
5. Check **Live Feed** → Decision Matrix + execution cards

### 5. Dashboard against Railway (local UI → cloud agent)

Create `nexus-dashboard/.env.local`:

```bash
NEXT_PUBLIC_AGENT_URL=https://nexus-agent-production-7783.up.railway.app
NEXT_PUBLIC_WALLET_ADDRESS=0x89f97Cb35236a1d0190FB25B31C5C0fF4107Ec1b
```

Restart `pnpm --prefix nexus-dashboard dev` after editing. SIWE and KeeperHub key save call Railway directly — ensure Railway `JWT_SECRET` matches root `.env` and `ALLOWED_ORIGINS` includes `http://localhost:3000` (or leave unset; server defaults include it).

---

## Railway Deployment

Deploy **`nexus-agent`** as a Node service + **Postgres** plugin on Railway Hobby.

### `nexus-agent` service variables

```
OPENROUTER_API_KEY=sk-or-v1-...
BRAIN_MODEL=google/gemini-2.5-flash
DATABASE_URL=<from Railway Postgres plugin>
ALCHEMY_RPC_URL=https://base-sepolia.g.alchemy.com/v2/...
KEEPERHUB_API_KEY=kh_...
AGENTIC_WALLET_ADDRESS=0x...
JWT_SECRET=<random secret — must match local if running phase2 against Railway>
ALLOWED_ORIGINS=https://your-dashboard-url.vercel.app
NODE_ENV=production
```

Production URL: `https://nexus-agent-production-7783.up.railway.app`

### Dashboard (Vercel or Railway)

```
NEXT_PUBLIC_AGENT_URL=https://your-nexus-agent.up.railway.app
NEXT_PUBLIC_WALLET_ADDRESS=0x...
```

Remove `GEMINI_API_KEY` from Railway if using OpenRouter exclusively.

### Production parity check (local JWT → Railway API)

`JWT_SECRET` in root `.env` must **byte-match** Railway before running:

```powershell
$env:AGENT_URL="https://nexus-agent-production-7783.up.railway.app"
pnpm --prefix nexus-agent run phase2   # exit 0 = all four modules OK
pnpm --prefix nexus-agent run logs     # hold, rotate, swap rows in shared Postgres
pnpm --prefix nexus-agent run surfaces # warm KeeperHub MCP (surfaces 3–12)
```

---

## Verification & Test Harnesses

```bash
# Unit tests (CI fast-track) — requires ALCHEMY_RPC_URL for full Tier B coverage
pnpm --prefix nexus-agent run verify
# Full env: 21 passed | 2 skipped | 0 failed
# Minimal env (no RPC): fewer Tier B runs skipped — paste exact Summary line, do not round

# Integration (+ DB connectivity)
pnpm --prefix nexus-agent run verify:integration
# Full env: 22 passed | 2 skipped | 0 failed

# End-to-end module triggers (local or Railway via AGENT_URL)
pnpm --prefix nexus-agent run e2e        # markets + chat + templates + feed audit
pnpm --prefix nexus-agent run phase2      # Guardian → Yield → DCA → PayChain
pnpm --prefix nexus-agent run logs        # Postgres executions_log (sorted desc)
pnpm --prefix nexus-agent run surfaces    # KeeperHub MCP surface tests

# Maintenance
pnpm --prefix nexus-agent exec tsx src/scripts/clear-db.ts   # wipe executions_log

# OpenRouter AI brain smoke test
pnpm --prefix nexus-agent exec tsx src/scripts/test-openrouter-smoke.ts

# Live Guardian evaluation
pnpm --prefix nexus-agent exec tsx src/scripts/test-guardian-run.ts

# Scan Aave position (V3.2 pool)
pnpm --prefix nexus-agent exec tsx src/scripts/scan-aave-position.ts

# Dashboard production build
pnpm --prefix nexus-dashboard build
```

**Tier C tests always skipped** (not yet in harness): Guardian cycle TTL rollover, PayChain compensating cancel workflow.

**Expected smoke test output:**

```
Testing AI Brain Provider: openrouter (google/gemini-2.5-flash)
✅ SMOKE TEST PASSED: OpenRouter provider is fully operational!
```

---

## Execution Status (August 2026)

| Capability | Status |
|------------|--------|
| Live Aave V3.2 reads (HF, collateral, debt) on Base Sepolia | Verified |
| OpenRouter chat + structured Guardian `generateObject` | Verified |
| Reasoning Harness + `aiAnalysis` persistence | Verified |
| Pre-flight simulation + Resilience logging | Verified |
| KeeperHub MCP workflow registration (PayChain cron) | Verified |
| Mined on-chain tx + BaseScan proof | **Verified** — Guardian repay (2 txs; HF ~1.05 → ~1.32) |

Label submissions with BaseScan links when `executions_log.txHash` is populated (see runbook for proof hashes).

---

## Phase 2 Verified Proofs (Postgres `executions_log`)

| Module | Action | Status | Notes |
|--------|--------|--------|-------|
| **Guardian** | `hold` | `success` | HF ~3.26 > 1.40 — no broadcast (historical) |
| **Guardian** | `repay` | `success` + txHash | HF ~1.05 → ~1.32; agentic wallet funded; approve+repay via KeeperHub |
| **Yield** | `rotate` | `success` | Dual-wallet ownership guard skip |
| **DCA** | `swap` | schedule OK | `active_workflows` row registered |
| **PayChain** | `payroll` | workflow registered | NL + 2-step confirm → KeeperHub cron |

Re-run: `pnpm --prefix nexus-agent run phase2` then `pnpm --prefix nexus-agent run logs`

Details: [submission_runbook.md](submission_runbook.md)

---

## API Endpoints (Backend)

| Method | Route | Auth | Purpose |
|--------|-------|------|---------|
| GET | `/health` | No | Health check |
| GET | `/api/auth/challenge` | No | SIWE nonce |
| POST | `/api/auth/verify` | No | SIWE JWT issuance |
| GET | `/api/portfolio/:wallet` | JWT | Aave position + workflows |
| GET | `/api/feed/:wallet` | JWT | Execution log (last 50) |
| POST | `/api/chat` | JWT | Conversational agent |
| POST | `/api/payroll` | JWT | PayChain trigger |
| POST | `/api/dca/schedule` | JWT | Register DCA workflow |
| GET/POST | `/api/payees` | JWT | Payee directory |
| GET/POST | `/api/user/settings` | JWT | Per-wallet KeeperHub key |
| POST | `/api/trigger/guardian` | JWT | Manual Guardian run |
| POST | `/api/trigger/dca` | JWT | Manual DCA run |
| POST | `/api/trigger/yield` | JWT | Manual Yield run |

---

## Known Limitations & Team Notes

| Topic | Detail |
|-------|--------|
| **KeeperHub OAuth ≠ API key** | Web sign-in does not auto-sync `kh_...` to the agent. Must paste key in modal or set env var. See [KEEPERHUB_BUGS.md](KEEPERHUB_BUGS.md) BUG-02 |
| **OpenRouter** | Paid `gemini-2.5-flash` recommended; free `:free` models rate-limited / deprecated |
| **Gemini direct API** | Separate from Google AI Pro — needs API billing for production quotas |
| **GitHub Models** | Retired — last-resort fallback only via `GITHUB_TOKEN` |
| **Dual-wallet** | Yield rotator skips on-chain when monitored ≠ agentic wallet |
| **On-chain proof** | BaseScan links only when real `txHash` in DB — else Simulated badge |
| **MCP cold start** | First workflow after idle may return `wf-stub-*` / `simulated_stub` — warm with `pnpm run surfaces` (BUG-04) |
| **Compound APY** | Base Sepolia Compound contract may return empty rate data — fallback APY used |
| **Template Fork & Deploy** | Guardian, DCA, Payroll deploy via API; Yield/Rebalancer show blocked badge; Liquidation Notifier → Chat |
| **Stub executions** | Without funded agentic wallet + valid KeeperHub key, txs show **Simulated** badge |
| **Feed window** | Decision Matrix counts last **50** executions only |
| **Tier C verify tests** | Cycle rollover + compensating cancel assertions not implemented yet |

---

## Documentation Index

| Document | Contents |
|----------|----------|
| [docs/TECHNICAL_SPEC.md](docs/TECHNICAL_SPEC.md) | Full architecture, schemas, security model |
| [submission_runbook.md](submission_runbook.md) | Verification commands, deployment, honest execution limits |
| [plan.md](plan.md) | Master execution roadmap (batches & gates) |
| [KEEPERHUB_BUGS.md](KEEPERHUB_BUGS.md) | Reproducible KeeperHub bugs (bounty material) |
| [model.md](model.md) | Zod schemas & Reasoning-First pattern reference |
| [.env.example](.env.example) | Root backend environment variables |
| [nexus-dashboard/.env.example](nexus-dashboard/.env.example) | Dashboard `NEXT_PUBLIC_*` variables |

---

## Team Contacts & Contributing

- **Branch workflow:** feature branches → PR to `main`
- **Never commit** `.env` — only `.env.example` with placeholders
- **Pre-push checklist:** `verify` + `test-openrouter-smoke.ts` + `phase2` + dashboard `build`
- **Questions:** open a GitHub issue or ping in team chat

---

*Built for Agents Onchain · Powered by KeeperHub MCP · Base Sepolia testnet*
