# NexusAgent — Autonomous Web3 Wealth Management Agent

> **Hackathon:** Agents Onchain (DoraHacks) · **Dates:** July 27 – Aug 13, 2026
> **Built for:** Grand Prize ($2,000) + Best Onboarding UX Improvement Bounty ($1,000)
> **Tech Stack:** Node.js + Next.js 14 + Vercel AI SDK + GitHub Models (gpt-4o-mini) + KeeperHub MCP + Postgres (Drizzle ORM) + Railway (<100MB RAM)

---

## What Is NexusAgent?

NexusAgent is an **AI brain** that monitors your onchain positions and autonomously acts on them using **KeeperHub as its execution layer**.

> *KeeperHub is the railway network — powerful infrastructure for scheduled, gas-managed, MEV-protected onchain execution.
> NexusAgent is the autonomous train driver — it reads your portfolio in real-time, reasons about what action to take, and tells KeeperHub exactly what to execute and when.*

The user never manually configures a workflow. They talk to the AI in plain English. The AI reads live onchain state, makes a structured decision, and issues the KeeperHub command.

---

## Architecture

```
User's Wallet / DeFi Positions (Aave V3, Sepolia)
         │
         ▼
┌─────────────────────────────────────────────┐
│              NexusAgent BRAIN               │
│                                             │
│  1. READ  — lib/aave.ts                     │
│     Live Health Factor, collateral, debt,   │
│     USDC wallet balance, supply APY         │
│     via ethers.js → Sepolia RPC             │
│                                             │
│  2. THINK — brain/provider.ts + schemas.ts  │
│     Vercel AI SDK generateObject()          │
│     Model: gpt-4o-mini via GitHub Models    │
│     Enforced by Reasoning-First Zod schemas │
│                                             │
│  3. DECIDE — modules/                       │
│     guardian.ts  → repay / supply / hold    │
│     yield-rotator.ts → rotate protocol      │
│     dca.ts       → swap USDC → ETH          │
│     paychain.ts  → register payroll cron    │
└────────────────────┬────────────────────────┘
                     │ Structured JSON decision
                     ▼
┌─────────────────────────────────────────────┐
│              KeeperHub (HANDS)              │
│                                             │
│  Step 1 — Simulate                          │
│    lib/simulate.ts calls provider.estimateGas│
│    Caught reverts logged → Resilience Log   │
│    Zero gas wasted on failing transactions  │
│                                             │
│  Step 2 — Execute                           │
│    lib/mcp-client.ts → createWorkflow()     │
│    MPC wallet broadcasts with:              │
│      • Smart gas estimation                 │
│      • MEV protection (private routing)     │
│      • Nonce orchestration                  │
│      • Three-tier safety hooks              │
│                                             │
│  Step 3 — Audit Trail  ◄──────────────┐    │
│    KeeperHub logs every trigger,       │    │
│    simulation result, and tx outcome   │    │
│    Synced via get_execution_logs() MCP │    │
└────────────────────────────────────────┼───┘
                                         │ synced to Postgres
                     ┌───────────────────▼──────────────────┐
                     │        NexusAgent Dashboard           │
                     │                                       │
                     │  /             Portfolio + HF gauge   │
                     │  /workflows    Active cron schedules  │
                     │  /feed         Live execution events  │
                     │  /resilience   Sim results & reverts  │
                     │  /alerts       Anomalies & gas spikes │
                     │  /chat         AI command center      │
                     │  /templates    1-click workflow store  │
                     └───────────────────────────────────────┘
```

---

## Key Differentiators vs. Using KeeperHub Directly

| Capability | KeeperHub alone | NexusAgent |
|---|---|---|
| Schedule a cron trigger | ✅ You configure it manually | ✅ AI creates it from plain English |
| Know current Aave APY | ❌ | ✅ Live on-chain reads every 15 min |
| Decide *whether* to rotate yield | ❌ | ✅ LLM computes APY delta + 90-day break-even |
| Detect Health Factor risk | ❌ | ✅ Guardian polls every 5 min |
| Refuse to double-pay same recipient | ❌ | ✅ PayChain collision detection in DB |
| "Pay my dev 200 USDC every Friday" | ❌ (manual config) | ✅ NL → Zod schema → KeeperHub workflow |
| Remember prior conversation context | ❌ | ✅ Full conversational memory in every prompt |
| Show *why* it acted | ❌ | ✅ AI reasoning stored in DB + surfaced in UI |
| Gas-aware swap delay | ❌ | ✅ DCA delays if gas > 5% of purchase value |

---

## Tools & Libraries — Complete Reference

### AI / Brain Layer
| Tool | File | What it does |
|---|---|---|
| `@ai-sdk/openai` | `brain/provider.ts` | Creates GitHub Models provider pointed at `models.inference.ai.azure.com` |
| `ai` (Vercel AI SDK) | All modules | `generateObject()` parses LLM output into typed Zod schema — no hallucination risk |
| `zod` | `brain/schemas.ts` | 4 Reasoning-First schemas: Guardian, YieldRotator, DCA, PayChain |
| GitHub Models (gpt-4o-mini) | `brain/provider.ts` | Zero-RAM serverless inference via GitHub PAT — free tier, no Ollama needed |

### Blockchain / Onchain
| Tool | File | What it does |
|---|---|---|
| `ethers` v6 | `lib/aave.ts`, `lib/rpc.ts`, `lib/calldata.ts`, `modules/dca.ts` | RPC provider, ABI encoding, gas price reads |
| `lib/aave.ts` | Guardian, YieldRotator | Reads `getUserAccountData()` + `getReserveData()` from Aave V3 Pool on Sepolia |
| `lib/calldata.ts` | Guardian, DCA, YieldRotator | Encodes `repay()`, `supply()`, `exactInputSingle()` (Uniswap V3), `supply()` (Compound V3) ABI calldata |
| `lib/rpc.ts` | All modules | Multi-RPC failover: Alchemy → Infura → public fallback |
| `lib/simulate.ts` | Guardian, DCA, YieldRotator | Calls `provider.estimateGas()` before any broadcast; logs reverts to DB |

### KeeperHub MCP
| Tool | File | What it does |
|---|---|---|
| `@modelcontextprotocol/sdk` | `lib/mcp-client.ts` | MCP client connecting to `https://mcp.keeperhub.com` |
| `createWorkflow()` | All modules | Registers a new workflow with trigger type, steps, and calldata |
| `executeWorkflow()` | All modules | Fires a registered workflow immediately |
| `getExecutionStatus()` | Dashboard API | Polls status: `pending → simulating → broadcasting → mined` |
| `getExecutionLogs()` | Dashboard API | Syncs KeeperHub audit trail to Postgres for dashboard display |
| `setGasSponsorship()` | Guardian | Enables sponsored gas on mainnet for final demo tx |
| `setMEVProtection()` | DCA, YieldRotator | Routes swaps privately to prevent sandwich attacks |
| `registerWebhookTrigger()` | PayChain | Creates a webhook URL for manual "Execute Now" overrides |
| `registerEventListener()` | Guardian | Event-driven trigger on HF drop below threshold |
| `sendKeeperNotification()` | All modules | Sends alerts to Discord/Telegram/Email |
| `getFailoverRPC()` | `lib/rpc.ts` | Falls back to KeeperHub-managed RPC if primary fails |

### Database
| Tool | File | What it does |
|---|---|---|
| `drizzle-orm` | `db/client.ts`, `db/schema.ts` | ORM for Postgres — typed queries, no raw SQL |
| `pg` | `db/client.ts` | PostgreSQL driver |
| `active_workflows` table | PayChain, DCA | Stores registered cron schedules per wallet |
| `executions_log` table | All modules | Append-only audit log: every action, status, and AI reason |
| `repayment_cycles` table | Guardian | Tracks monthly budget consumed to enforce spending caps |

### Server / Infrastructure
| Tool | File | What it does |
|---|---|---|
| `express` | `index.ts` | REST API: `/api/portfolio`, `/api/feed`, `/api/payroll`, `/api/trigger/*` |
| `node-cron` | `index.ts` | Guardian: every 5 min · Yield: every 15 min · DCA: every hour |
| `cors` | `index.ts` | Allows dashboard (port 3000) to call agent (port 3001) |
| `dotenv` | `index.ts` | Loads `.env` with `override: true` to avoid system env conflicts |
| `tsx` | `package.json` | TypeScript execution + hot-reload in dev |
| Next.js 14 App Router | `nexus-dashboard/` | Dashboard frontend with 7 pages |
| Railway | Deployment | Hosts both services on free tier (<100MB RAM each) |

---

## 4 Agent Modules

### 🛡️ Guardian — Liquidation Protection (`modules/guardian.ts`)
**Cron:** every 5 minutes

1. Reads live Aave V3 position (HF, collateral, debt, wallet balance)
2. Reads repayment cycle budget from DB
3. AI decides: `repay` / `supply_collateral` / `hold` / `block_transaction`
4. Enforces: wallet balance cap, monthly budget cap, pending-tx lock
5. Simulates tx → if revert caught, aborts (zero gas wasted)
6. Creates KeeperHub workflow → executes → logs to DB

### 🔄 Yield Rotator — APY Optimization (`modules/yield-rotator.ts`)
**Cron:** every 15 minutes

1. Reads live Aave V3 and Compound V3 USDC supply rates from on-chain
2. AI computes: APY delta, 90-day profit, gas break-even
3. Rotates only if profit > gas cost and break-even < 45 days
4. Encodes `withdraw()` → `supply()` calldata for cross-protocol move
5. Creates KeeperHub workflow with MEV protection enabled

### 📅 DCA Engine — Dollar-Cost Averaging (`modules/dca.ts`)
**Cron:** every hour

1. Checks DB for active DCA workflow for this wallet
2. Reads real-time gas price from Sepolia RPC
3. AI decides: execute now vs delay 60min (if gas > 5% of purchase)
4. Encodes `exactInputSingle()` Uniswap V3 USDC→ETH calldata
5. Simulates → creates KeeperHub workflow → executes

### 💸 PayChain — Recurring Payroll (`modules/paychain.ts`)
**Trigger:** user natural language input via `/api/payroll`

1. Parses NL: "Pay 0xABC 200 USDC every Friday" → structured Zod object
2. Checks DB for recipient collision (prevents duplicate workflows)
3. Enforces $1,000 USDC spending ceiling
4. Registers KeeperHub workflow with `triggerType: "cron"`
5. Logs to `active_workflows` table

---

## 7-Page Dashboard (`nexus-dashboard/`)

| Page | Route | Data Source |
|---|---|---|
| Portfolio | `/` | Live Aave V3 via `/api/portfolio` — real HF gauge |
| Active Workflows | `/workflows` | DB `active_workflows` — human-readable cron schedule |
| Live Feed | `/feed` | DB `executions_log` — ordered by timestamp desc |
| Resilience Log | `/resilience` | DB `executions_log` filtering `reverted_simulation` status |
| Alerts | `/alerts` | DB feed + threshold checks |
| AI Chat | `/chat` | `/api/chat` → nexus-agent `/api/payroll` + yield/DCA triggers |
| Templates | `/templates` | 6 pre-built 1-click workflow templates |

---

## Getting Started (Local)

### Prerequisites
- Node.js 18+ and pnpm
- PostgreSQL (Railway free tier or local)
- GitHub Personal Access Token (for GitHub Models inference)
- Alchemy and/or Infura Sepolia RPC URLs

### 1. Environment Setup
```bash
cp .env.example .env
```

Fill in `.env`:
```env
GITHUB_TOKEN=ghp_...              # GitHub PAT — used for AI inference (free)
DATABASE_URL=postgresql://...     # Railway or local Postgres connection string
KEEPERHUB_API_KEY=kh_...          # KeeperHub org API key
ALCHEMY_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY
INFURA_RPC_URL=https://sepolia.infura.io/v3/YOUR_KEY
NEXT_PUBLIC_WALLET_ADDRESS=0x...  # Demo wallet address
AGENTIC_WALLET_ADDRESS=0x...      # KeeperHub MPC wallet address
```

### 2. Start the Agent Backend
```bash
cd nexus-agent
pnpm install
pnpm db:migrate    # Apply Drizzle schema to Postgres
pnpm dev           # Agent API on http://localhost:3001
```

### 3. Start the Dashboard
```bash
cd nexus-dashboard
pnpm install
pnpm dev           # Dashboard on http://localhost:3000
```

---

## KeeperHub Features Used (22/22)

| # | Feature | Where Used |
|---|---|---|
| 1 | MCP Server | `lib/mcp-client.ts` — all agent ↔ KeeperHub comms |
| 2 | CLI (`kh`) | Dev setup, auth, DB migrations |
| 3 | Visual Workflow Builder | Template Store auto-generates configs |
| 4 | AI-Assisted Building | PayChain NL → Zod → workflow |
| 5 | Scheduled Triggers (Cron) | DCA (hourly), Yield (15min), PayChain workflows |
| 6 | Webhook Triggers | Dashboard "Execute Now" button |
| 7 | Event-Driven Triggers | Guardian on HF threshold event |
| 8 | Manual Triggers | `/api/trigger/guardian`, `/api/trigger/dca`, `/api/trigger/yield` |
| 9 | Smart Gas Estimation | Applied to every broadcast |
| 10 | Gas Sponsorship | Final mainnet demo tx |
| 11 | MEV Protection | All Uniswap swaps (DCA + Yield) |
| 12 | Simulation-before-Submit | `lib/simulate.ts` — every action pre-flighted |
| 13 | Audit Trail | `get_execution_logs()` → DB → Live Feed + Resilience |
| 14 | Multi-RPC Failover | `lib/rpc.ts` — Alchemy → Infura → public |
| 15 | Nonce Orchestration | Concurrent module runs don't collide |
| 16 | Agentic Wallet (Turnkey/MPC) | `AGENTIC_WALLET_ADDRESS` — no private key exposure |
| 17 | Three-Tier Safety Hooks | Spending limits + protocol whitelist |
| 18 | x402 Protocol | Agent pays for price feed data autonomously |
| 19 | MPP (Micro-Payment Protocol) | Agent pays for Railway compute |
| 20 | Notifications | `sendKeeperNotification()` — Discord/Telegram/Email |
| 21 | Webhook Actions | Posts execution results to sync DB state |
| 22 | Conditional Logic | If HF < 1.15 AND no pending tx → repay; else → hold |

---

## Bounty Contributions (Upstream PRs)

Three production-ready PRs targeting the **$1,000 Best Onboarding UX Improvement Bounty**:

1. **Dynamic Testnet Workspace Hints** — Inject Sepolia contract addresses into recommendation chips using `walletAddress` context (`lib/onboarding/getting-started-config.ts`)
2. **Local DB Migration Recovery** — Auto-run `backfill-drizzle-migrations.ts` on collision in `drizzle.__drizzle_migrations` (`scripts/dev-login.ts`)
3. **Troubleshooting Guide** — HTTP 429 rate limits, container redirect timeouts, `kh_` vs `wfb_` key classification (`docs/getting-started/quickstart.md`)

See [PRs.md](./PRs.md) for full PR specifications.

---

## License
MIT
