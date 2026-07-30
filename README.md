# NexusAgent — Autonomous Web3 Wealth Management Agent

> **Hackathon:** Agents Onchain (DoraHacks) · **Dates:** July 27 – Aug 13, 2026  
> **Built for:** Grand Prize ($2,000) + Best Onboarding UX Improvement Bounty ($1,000)  
> **Tech Stack:** Node.js + Next.js 14 + Vercel AI SDK (Native Tool Calling) + GitHub Models (gpt-4o-mini) + KeeperHub MCP + SIWE (Web3 Wallet Sign-In) + Postgres (Drizzle ORM)

---

## What Is NexusAgent?

NexusAgent is an **AI brain** that monitors your onchain positions and autonomously acts on them using **KeeperHub as its execution layer**.

> *KeeperHub is the railway network — powerful infrastructure for scheduled, gas-managed, MEV-protected onchain execution.  
> NexusAgent is the autonomous train driver — it reads your portfolio in real-time, reasons about what action to take, and tells KeeperHub exactly what to execute and when.*

The user never manually configures a workflow. They talk to the AI in plain English, sign in with SIWE Web3 authentication, and the agent executes on-chain transactions autonomously.

---

## Architecture & Native AI Tool Calling Engine

> 📖 **Full Technical Architecture Specification:** For an in-depth dive into our Domain Decision Ontology, Dual-Wallet Architecture, Reasoning Harness, and Security Model, read the canonical [Technical Specification](docs/TECHNICAL_SPEC.md).

```
User Message ("dca 50 usdc into eth weekly", "pay dev team 20 usdc every thursday", "cancel all dca")
                                │
                                ▼
         ┌──────────────────────────────────────────────┐
         │       NexusAgent Conversational Agent        │
         │generateText(model: gpt-4o-mini, maxSteps: 5) │
         │     Powered by Vercel AI SDK Native Tools    │
         └──────────────────────┬───────────────────────┘
                                │
          ┌─────────────────────┴─────────────────────┐
          ▼                                           ▼
[Native Tool Execution]                     [Conversational Response]
  • schedulePayroll()                        "I've set up a weekly DCA swap of
  • scheduleDCA()                             50 USDC into ETH for your wallet!"
  • cancelWorkflows()
  • listWorkflows()
  • listPayees()
  • queryPortfolio()
  • triggerStrategy()
  • getLiveTransactions()
          │
          ▼
┌─────────────────────────────────────────────────────────┐
│                 KeeperHub MCP Execution                 │
│  • Turnkey MPC Wallet Signing (AGENTIC_WALLET)          │
│  • Flashbots MEV-Protected Swaps & Gas Sponsorship      │
│  • Etherscan Live Tx Verification Links                 │
└─────────────────────────────────────────────────────────┘
```

---

## Key Features & Architecture

1. **Native AI SDK Tool Calling Loop**: Powered by `gpt-4o-mini` with `maxSteps: 5`. Handles typos (`cancle`), natural language schedules, and multi-step user prompts without rigid keyword shortcuts.
2. **Dual-Wallet Scoping & Signer Alignment**:
   - `monitoredWallet` (`userWallet`): Read-only target account monitored by the agent.
   - `signerWallet` (`AGENTIC_WALLET_ADDRESS`): KeeperHub Turnkey MPC wallet executing on-chain transactions on behalf of the user (supported for Aave repay/supply via `onBehalfOf`).
   - Yield Rotation is cleanly scoped to positions owned directly by `AGENTIC_WALLET`.
3. **Agent-Cron DCA Engine**:
   - Direct agent-cron hourly evaluation for scheduled token swaps (`active_workflows`).
   - Single-active DCA constraint per wallet with automatic upsert semantics.
4. **Resilience & Pre-Flight Intercept Engine**:
   - Every transaction is pre-flight simulated prior to broadcast, wasting **0 gas** on contract reverts.
   - 15-minute pending lock TTL cleanup ensures stuck executions never block future strategy cycles.
5. **PayChain Team Remainder & Compensating Cancel Pattern**:
   - Distributes exact remainder cents to final team members ($100 / 3 => $33, $33, $34).
   - Remote KeeperHub workflows created prior to a failure are automatically rolled back via compensating `cancelWorkflow()` calls.
6. **3-Tier Connection UI Model**:
   - **Tier 1 (MCP Connected):** Full remote execution with active API key.
   - **Tier 2 (OAuth Session Active):** Connected via OAuth, prompt to add API key.
   - **Tier 3 (Unlinked / SIWE Auth Required):** Prompt to authenticate via Web3 wallet.

---

## Modules Reference

### 🛡️ Guardian — Liquidation Protection (`modules/guardian.ts`)
- **Cron:** every 5 minutes
- Evaluates live Aave V3 Health Factor, collateral, debt, and 30-day budget cycles.
- Automatically repays debt or supplies collateral before liquidation threshold (HF < 1.15).

### 🔄 Yield Rotator — APY Optimization (`modules/yield-rotator.ts`)
- **Cron:** every 15 minutes
- Monitors live supply rates between Aave V3 and Compound V3 on Sepolia using `lib/compound.ts`.
- Rotates deposits only when 90-day APY profit exceeds gas costs (break-even < 45 days).

### 📅 DCA Engine — Dollar-Cost Averaging (`modules/dca.ts` & `modules/dca-schedule.ts`)
- **Cron:** every hour
- Executes recurring USDC → ETH swaps via Uniswap V3 with gas-price delays if gas > 5% of purchase value.

### 💸 PayChain — Recurring Payroll (`modules/paychain.ts`)
- Natural language payroll scheduler with duplicate collision detection, payee auto-creation, remainder cent distribution, and spending ceiling enforcement.

---

## 7-Page Dashboard & Template Store (`nexus-dashboard/`)

| Page | Route | Features |
|---|---|---|
| Portfolio | `/` | Live Aave V3 health factor gauge, collateral, debt, and Compound APYs |
| Active Workflows | `/workflows` | Registered KeeperHub workflows, MPC payload inspector, Etherscan links |
| Live Feed | `/feed` | Real-time audit log of broadcasted on-chain transactions |
| Resilience Log | `/resilience` | 4-card grid log of simulated reverts, gas delays, and pre-flight checks |
| Alerts | `/alerts` | Health factor warning threshold, repayment success, & gas spike alerts |
| AI Chat | `/chat` | Conversational command center with SIWE auth guards and tool calling |
| Payees | `/payees` | Registered single payees, team directories, and shared vault pools |
| Template Store | `/templates` | Pre-configured KeeperHub automation templates with 1-click deployment |

---

## Getting Started

### 1. Environment Setup
```bash
cp .env.example .env
```

Set key environment variables in the repo-root `.env`:
```env
GITHUB_TOKEN=ghp_...              # GitHub PAT for gpt-4o-mini inference
DATABASE_URL=postgresql://...     # PostgreSQL database URL
KEEPERHUB_API_KEY=kh_...          # KeeperHub MCP API key
AGENTIC_WALLET_ADDRESS=0x89f9...  # KeeperHub MPC signer wallet
JWT_SECRET=your_jwt_secret_here   # Required in production
ALCHEMY_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY
```

### 2. Database Setup & Seed Data
```bash
cd nexus-agent
pnpm db:migrate
pnpm db:seed           # Seeds demo repayment cycles and active workflows
```

### 3. Run System Verification Suite
```bash
pnpm verify            # Executes Tier A & Tier B verification checks
```

### 4. Start Agent Backend & Dashboard
```bash
# Terminal 1: Agent Backend
cd nexus-agent
pnpm dev               # Runs on http://localhost:3001

# Terminal 2: Next.js Dashboard
cd nexus-dashboard
pnpm dev               # Runs on http://localhost:3000
```

---

## Upstream Integration & Friction Notes

For detailed documentation on KeeperHub MCP integration friction, upstream pull requests, and protocol edge cases identified during development, see [KEEPERHUB_BUGS.md](./KEEPERHUB_BUGS.md).

---

## License
MIT
