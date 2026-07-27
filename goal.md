# NexusAgent — Complete Project Goal & Specification

**Hackathon:** Agents Onchain (DoraHacks) · **Dates:** July 27 – Aug 13, 2026
**Team:** 2 people · **Chain:** Ethereum (Sepolia for build/test → Mainnet for final)
**Targets:** Grand Prize ($5,000 pool) + Best Onboarding UX Improvement Bounty ($1,000)

---

## One-Line Pitch

> *A fully autonomous Web3 wealth management agent platform built with Vercel AI SDK and GitHub Models API (Llama-3.3-70B), utilizing 22/22 KeeperHub execution surfaces to protect positions, optimize yield, Dollar-Cost Average, and run automated payroll.*

---

## What Is NexusAgent?

NexusAgent is a personal AI wealth manager that lives onchain. Using the **Vercel AI SDK** configured with the **GitHub Models API** provider, the user defines high-level goals in plain English, and the agent translates and runs them through KeeperHub workflows.

- 🛡️ **Protects** your lending positions (Aave V3) from liquidation
- 🔄 **Grows** stablecoin yield by rotating funds dynamically between Aave, Compound, and Morpho
- 📅 **Buys** assets on a schedule (Dollar-Cost Averaging) via Uniswap V3 swaps
- 💸 **Pays** your team/developers on a recurring schedule (DAO Payroll)
- 🏪 **Onboards** new developers with a visual template catalog

---

## The 4-Layer Architecture

The system operates across four primary modules, isolated per user wallet via a stateful schema detailed in [database.md](file:///c:/Users/maitr/Downloads/keeperhub-guardian/database.md).
```
┌──────────────────────────────────────────────────────────────┐
│                       LAYER 1: BRAIN                          │
│          Vercel AI SDK + GitHub Models (Serverless)           │
│   Meta-Llama-3.3-70B Tool-Calling + Reasoning-First Zod      │
└───────────────────────────┬──────────────────────────────────┘
                            │ read/write context
┌───────────────────────────▼──────────────────────────────────┐
│                    LAYER 2: STATE DATABASE                    │
│            Drizzle ORM + Local Postgres (Railway)            │
│  Tracks active workflows, previous repayments, cycle budgets  │
└───────────────────────────┬──────────────────────────────────┘
                            │ filtered JSON payload
┌───────────────────────────▼──────────────────────────────────┐
│                    LAYER 3: EXECUTION (MCP)                   │
│        NexusAgent Node.js Loop (Railway <100MB Node service)  │
│    4 Modules → KeeperHub MCP → Simulation → Onchain Broadcast │
└───────────────────────────┬──────────────────────────────────┘
                            │ logs + sync data
┌───────────────────────────▼──────────────────────────────────┐
│                    LAYER 4: VISIBILITY                        │
│               Next.js Dashboard (Railway <100MB)              │
│     6 pages showing history, chat, templates & resilience     │
└──────────────────────────────────────────────────────────────┘
```

---

## KeeperHub Feature Coverage (All 22 Features Used)

| KeeperHub Feature | How NexusAgent Uses It | Module |
|---|---|---|
| **MCP Server** | Agent queries MCP for current configurations and registers/triggers workflows via MCP tools. | All modules |
| **CLI (`kh`)** | Dev scripts for auth, wallet setup, and database migrations. | Setup + CI scripts |
| **Visual Workflow Builder** | Auto-generates workflow templates for the Marketplace. | Template Store |
| **AI-Assisted Building** | LLM via Vercel AI SDK parses text, checks DB state for collisions, then creates templates. | PayChain NL input |
| **Scheduled Triggers (Cron)** | DCA runs on schedule; Yield checks run every 15 min. | DCA + Yield modules |
| **Webhook Triggers** | Dashboard "Execute Now" button fires webhook. | Manual override UI |
| **Event-Driven Triggers** | Watches onchain events (price drops, health factor changes). | Guardian module |
| **Manual Triggers** | "Rebalance Now" button in dashboard. | Portfolio module |
| **Smart Gas Estimation** | Applied to every broadcast via KeeperHub automatically. | All txns |
| **Gas Sponsorship (Mainnet)** | Final demo mainnet txn uses sponsored gas. | Grand Prize txn |
| **MEV Protection (Private Routing)** | All swaps routed privately to prevent sandwich attacks. | Yield swaps, DCA buys |
| **Simulation-before-Submit** | Every action simulated before executing — caught failures logged in Postgres DB. | Resilience Log |
| **Audit Trail & Execution Logs** | Synced via MCP `get_execution_logs` to Postgres; feeds the dashboard. | Dashboard |
| **Multi-RPC Failover** | RPC failures silently fail over, zero downtime. | Agent reliability |
| **Nonce Orchestration** | Concurrent workflow runs don't collide. | Multi-module agent |
| **Agentic Wallet (Turnkey/MPC)** | Agent's own wallet with no private key exposure. | All transactions |
| **Three-Tier Safety Hooks** | Spending limits: max $500/txn, whitelist protocols only. | Policy config |
| **x402 Protocol** | Agent pays for external API data (price feeds, APY rates) autonomously. | Data fetching |
| **MPP (Micro-Payment Protocol)** | Agent pays for compute on Railway autonomously. | Infrastructure |
| **Notifications (Discord/Telegram/Email)** | Alerts sent on liquidation risk, cycle limits, or overrides. | Alerts Panel |
| **Webhook Actions** | Agent posts execution results to a custom endpoint to sync DB state. | Resilience Log |
| **Conditional Logic** | If HF < 1.15 and DB confirms no pending TX → repay; else → hold. | Decision engine |

**Coverage: 22/22 KeeperHub features ✅**

---

## Layer 1 — The Brain (Vercel AI SDK + GitHub Models Integration)

We use the official `@ai-sdk/openai` provider mapped to the GitHub Models endpoint. We authenticate using a standard GitHub Personal Access Token (PAT). This allows the agent to call massive 70B parameter models (such as `meta-llama-3.3-70b-instruct`) for free with zero local or server RAM overhead.

```typescript
import { createOpenAI } from '@ai-sdk/openai';
import { generateObject } from 'ai';
import { z } from 'zod';

// Initialize the OpenAI-compatible GitHub Models provider
const githubModels = createOpenAI({
  baseURL: 'https://models.inference.ai.azure.com',
  apiKey: process.env.GITHUB_TOKEN, // GitHub Personal Access Token
});

const { object } = await generateObject({
  model: githubModels('meta-llama-3.3-70b-instruct'),
  schema: z.object({
    activate_modules: z.array(z.enum(['guardian', 'dca', 'paychain', 'yield'])),
    guardian_config: z.object({ protocol: z.string(), hf_threshold: z.number() }).optional(),
    dca_config: z.object({ asset: z.string(), amount_usdc: z.number(), frequency: z.string() }).optional(),
  }),
  prompt: "I want to protect my Aave loan, buy ETH every week, and pay my developer 200 USDC every Friday",
});
```

---

## Layer 2 — The 4 Agent Modules

### 🛡️ Module 1: Guardian (Liquidation Protection)
- **Protocol:** Aave V3 on Sepolia (`0x6Ae43d3271ff68408378a467C62b15264c8d77e4`)
- **Action:** If Health Factor < 1.15, execute `repay` or supply collateral `supply`. If < 1.05, trigger a full unwind swap.

### 🔄 Module 2: Yield Rotator
- **Protocols:** Aave V3, Compound V3, Morpho Blue.
- **Action:** Rotates stablecoin allocations when APY delta > threshold and break-even gas calculation is positive.

### 📅 Module 3: DCA Engine (Dollar-Cost Averaging)
- **Action:** Swaps USDC for ETH/wBTC on a scheduled trigger using Uniswap V3. Uses mainnet gas sponsorship for the final demonstration.

### 💸 Module 4: PayChain (Recurring Payments)
- **Action:** Automated payroll and recurrent operations utilizing the **x402/MPP** micropayment protocols. Enforces whitelists and spending ceilings via KeeperHub Three-Tier Safety Hooks.

### 🏪 Module 5: Workflow Template Store (Onboarding UX Bounty)
- **Action:** Provides 6 pre-built workflow templates that new developers can fork and deploy in under 60 seconds.

---

## Layer 3 — The Dashboard (6 Pages)

1. **Portfolio Overview** — Live Health Factor animated gauge, LTV ratios, and protocol APYs.
2. **Live Transaction Feed** — Real-time event logging: `Triggered → Simulating → Pending → Mined`.
3. **Resilience Log** — Side-by-side transaction run visualizer showing: Happy Path, Gas Adjusted Path, and Caught Revert (zero gas wasted).
4. **Alerts Panel** — Logging anomalies, gas spikes, and Telegram alerts.
5. **AI Chat** — Dynamic chat window with the GitHub Models provider.
6. **Workflow Template Store** — Marketplace with one-click deploy configurations.

---

## Railway Deployment Architecture

1. **nexus-agent** (Node.js agent loop integrating KeeperHub MCP, RPCs, and GitHub Models API).
2. **nexus-dashboard** (Next.js 14 public client and portfolio manager UI).

Both services run serverless integrations, using less than 100MB of RAM, keeping deployment 100% within the Railway Free Trial tier (no Dockerized Ollama required).
