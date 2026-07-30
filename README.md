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

```
User Message ("cancel all", "pay dev team 20 usdc every thursday", "what's my health factor?")
                                │
                                ▼
         ┌──────────────────────────────────────────────┐
         │       NexusAgent Conversational Agent        │
         │ generateText(model: gpt-4o-mini, maxSteps: 5)│
         │     Powered by Vercel AI SDK Native Tools    │
         └──────────────────────┬───────────────────────┘
                                │
          ┌─────────────────────┴─────────────────────┐
          ▼                                           ▼
[Native Tool Execution]                     [Conversational Response]
  • schedulePayroll()                        "I've set up a payroll of 20 USDC
  • cancelPayrolls()                          to the dev team every Thursday!"
  • listWorkflows()
  • listPayees()
  • queryPortfolio()
  • triggerStrategy()
  • getLiveTransactions()
          │
          ▼
┌─────────────────────────────────────────────────────────┐
│                 KeeperHub MCP Execution                 │
│  • Turnkey MPC Wallet Signing (Google Sign-In Account)   │
│  • Flashbots MEV-Protected Swaps & Gas Sponsorship       │
│  • Etherscan Live Tx Verification Links                 │
└─────────────────────────────────────────────────────────┘
```

---

## Key Features

1. **Native AI SDK Tool Calling Loop**: Powered by `gpt-4o` with `maxSteps: 5`. Handles typos (`cancle`), slang, and complex multi-step user prompts without rigid keyword shortcuts.
2. **Google Sign-In + Turnkey MPC Wallet Alignment**: Connects Google accounts directly to KeeperHub Turnkey MPC wallets (`0x89f97Cb3...`), solving MetaMask address mismatch issues.
3. **Payee Directory & Auto-Creation**:
   - Detects missing payee names (`"dev team"`) and prompts the user with alternative registered payees (`"test team"`).
   - Automatically provisions new `Team` or `Single` payee entries in Postgres if confirmed (`"do it anyway"`).
4. **KeeperHub Workflow Payload Inspector**:
   - Inspect raw ERC20 calldata (`0xa9059cbb...`), gas strategies, target contracts, and cron schedules directly on every workflow card.
5. **Live Etherscan & Transaction Tracking**:
   - 1-click verification on Sepolia Etherscan and KeeperHub Execution Monitor.
   - Chat command `show live tx` outputs real-time execution logs with verified transaction hashes.
6. **Chat History Persistence**:
   - Persistent `localStorage` history guarded against initial render race conditions.

---

## Modules Reference

### 🛡️ Guardian — Liquidation Protection (`modules/guardian.ts`)
- **Cron:** every 5 minutes
- Evaluates live Aave V3 Health Factor, collateral, debt, and spending limits.
- Automatically repays debt or supplies collateral before liquidation threshold.

### 🔄 Yield Rotator — APY Optimization (`modules/yield-rotator.ts`)
- **Cron:** every 15 minutes
- Monitors live supply rates between Aave V3 and Compound V3 on Sepolia.
- Rotates deposits only when 90-day APY profit exceeds gas costs (break-even < 45 days).

### 📅 DCA Engine — Dollar-Cost Averaging (`modules/dca.ts`)
- **Cron:** every hour
- Executes recurring USDC → ETH swaps via Uniswap V3 with gas-price delays if gas > 5% of purchase value.

### 💸 PayChain — Recurring Payroll (`modules/paychain.ts`)
- Natural language payroll scheduler with duplicate collision detection, payee auto-creation, and spending ceiling enforcement.

---

## 7-Page Dashboard (`nexus-dashboard/`)

| Page | Route | Features |
|---|---|---|
| Portfolio | `/` | Live Aave V3 health factor gauge, collateral, and debt balance |
| Active Workflows | `/workflows` | Registered KeeperHub workflows, MPC payload inspector, Etherscan links |
| Live Feed | `/feed` | Real-time audit log of broadcasted on-chain transactions |
| Resilience Log | `/resilience` | Log of simulated reverts and pre-flight safety checks |
| Alerts | `/alerts` | Health factor warning threshold & gas spike alerts |
| AI Chat | `/chat` | Conversational command center powered by GPT-4o tool-calling |
| Payees | `/payees` | Registered single payees, team directories, and shared vault pools |

---

## Getting Started

### 1. Environment Setup
```bash
cp .env.example .env
```

Set key environment variables:
```env
GITHUB_TOKEN=ghp_...              # GitHub PAT for GPT-4o inference
DATABASE_URL=postgresql://...     # PostgreSQL database URL
KEEPERHUB_API_KEY=kh_...          # KeeperHub MCP API key
ALCHEMY_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY
NEXT_PUBLIC_WALLET_ADDRESS=0x89f97Cb35236a1d0190FB25B31C5C0fF4107Ec1b
```

### 2. Start Agent Backend
```bash
cd nexus-agent
pnpm install
pnpm dev           # Runs on http://localhost:3001
```

### 3. Start Dashboard
```bash
cd nexus-dashboard
pnpm install
pnpm dev           # Runs on http://localhost:3000
```

---

## License
MIT
