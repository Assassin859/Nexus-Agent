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
│   │   └── scripts/      # smoke tests, verify harness, guardian runner
│   └── drizzle/          # Postgres migrations
├── nexus-dashboard/      # Next.js 14 dashboard (App Router)
│   ├── app/              # Portfolio, Chat, Workflows, Feed, Resilience, …
│   └── components/       # Sidebar, DecisionMatrixCard, TransactionCard, …
├── docs/TECHNICAL_SPEC.md
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
| **LLM Provider** | **OpenRouter** (primary, free models) → Gemini → OpenAI → GitHub Models (fallback) |
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
         │   getBrainModel() via OpenRouter (free tier) │
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
│  Base Sepolia Etherscan verification links              │
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
| **KeeperHub MPC** | Real on-chain tx with valid `txHash` |
| **Simulated** | `simulated_stub` or placeholder hash |
| **In-Flight** | `status === "pending"` |

Plus: copyable tx hash, expandable **AI Reasoning** panel (harness vs LLM recommendation), and **Live BaseScan** link → `https://sepolia.basescan.org/tx/0x...`

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

**Recommended (free):**

```bash
OPENROUTER_API_KEY=sk-or-v1-...
BRAIN_MODEL=google/gemini-2.0-flash-exp:free
```

Other free OpenRouter models that work: `meta-llama/llama-3.3-70b-instruct:free`, `openai/gpt-oss-20b:free` (code default).

Provider logs at startup: `AI brain provider initialized { provider: "openrouter", model: "..." }`

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

### Yield Rotator — APY Optimization
- **Cron:** every 15 minutes
- Compares Aave V3.2 vs Compound V3 USDC supply APY on Base Sepolia
- Rotates only when 90-day profit exceeds gas (break-even &lt; 45 days)
- Logs `action: "rotate"`

### DCA Engine — Dollar-Cost Averaging
- **Cron:** every hour
- USDC → ETH via Uniswap V3; delays if gas &gt; 5% of purchase value
- Single active DCA per wallet (upsert semantics)
- Chat + `/api/dca/schedule` for registration

### PayChain — Recurring Payroll
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
| `BRAIN_MODEL` | e.g. `google/gemini-2.0-flash-exp:free` |
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

---

## Railway Deployment

Deploy **`nexus-agent`** as a Node service + **Postgres** plugin on Railway Hobby.

### `nexus-agent` service variables

```
OPENROUTER_API_KEY=sk-or-v1-...
BRAIN_MODEL=google/gemini-2.0-flash-exp:free
DATABASE_URL=<from Railway Postgres plugin>
ALCHEMY_RPC_URL=https://base-sepolia.g.alchemy.com/v2/...
KEEPERHUB_API_KEY=kh_...
AGENTIC_WALLET_ADDRESS=0x...
JWT_SECRET=<random secret>
ALLOWED_ORIGINS=https://your-dashboard-url.vercel.app
NODE_ENV=production
```

### Dashboard (Vercel or Railway)

```
NEXT_PUBLIC_AGENT_URL=https://your-nexus-agent.up.railway.app
NEXT_PUBLIC_WALLET_ADDRESS=0x...
```

Remove `GEMINI_API_KEY` from Railway if using OpenRouter exclusively.

---

## Verification & Test Harnesses

```bash
# Unit tests (CI fast-track — no DB/RPC required)
pnpm --prefix nexus-agent run verify

# Integration mode (requires DATABASE_URL + optional RPC)
pnpm --prefix nexus-agent run verify:integration

# OpenRouter AI brain smoke test (generateText + generateObject)
pnpm --prefix nexus-agent exec tsx src/scripts/test-openrouter-smoke.ts

# Live Guardian evaluation against monitored wallet
pnpm --prefix nexus-agent exec tsx src/scripts/test-guardian-run.ts

# Scan Aave position across pool addresses
pnpm --prefix nexus-agent exec tsx src/scripts/scan-aave-position.ts

# Dashboard production build
pnpm --prefix nexus-dashboard build
```

**Expected smoke test output:**

```
Testing AI Brain Provider: openrouter (google/gemini-2.0-flash-exp:free)
✅ SMOKE TEST PASSED: OpenRouter provider is fully operational!
```

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

## Demo Script (5 minutes)

1. **Portfolio** — show live HF, collateral, debt from Base Sepolia Aave V3.2
2. **AI Chat** — *"What's my health factor?"* → tool call → live data
3. **AI Chat** — *"Trigger guardian strategy now"* → Guardian runs → log appears
4. **Live Feed** — Decision Matrix counts update; expand AI Reasoning panel
5. **Resilience** — show simulation intercept vs successful broadcast cards
6. **Templates** — Fork "Aave Guardian" → routes to chat with pre-filled prompt

---

## Known Limitations & Team Notes

| Topic | Detail |
|-------|--------|
| **KeeperHub OAuth ≠ API key** | Web sign-in does not auto-sync `kh_...` to the agent. Must paste key in modal or set env var. See [KEEPERHUB_BUGS.md](KEEPERHUB_BUGS.md) BUG-02 |
| **OpenRouter free tier** | Rate-limited (~RPM/RPD per model). Use `:free` models; retry on 429 |
| **Gemini direct API** | Separate from Google AI Pro subscription — needs API billing for production quotas |
| **GitHub Models** | Retired / deprecated — kept as last-resort fallback only |
| **Template Fork & Deploy** | Most templates route to Chat; only DCA template calls `/api/dca/schedule` directly |
| **Stub executions** | Without funded agentic wallet + valid KeeperHub key, txs show **Simulated** badge |
| **Feed window** | Decision Matrix counts last **50** executions only |

---

## Documentation Index

| Document | Contents |
|----------|----------|
| [docs/TECHNICAL_SPEC.md](docs/TECHNICAL_SPEC.md) | Full architecture, schemas, security model |
| [KEEPERHUB_BUGS.md](KEEPERHUB_BUGS.md) | Reproducible KeeperHub bugs + proposed fixes (bounty material) |
| [model.md](model.md) | Zod schemas & Reasoning-First pattern reference |
| [.env.example](.env.example) | All environment variables with comments |

---

## Team Contacts & Contributing

- **Branch workflow:** feature branches → PR to `main`
- **Never commit** `.env` — only `.env.example` with placeholders
- **Pre-push checklist:** `verify` + `test-openrouter-smoke.ts` + dashboard `build`
- **Questions:** open a GitHub issue or ping in team chat

---

*Built for Agents Onchain · Powered by KeeperHub MCP · Base Sepolia testnet*
