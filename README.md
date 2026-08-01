# NexusAgent — Autonomous Web3 Wealth Management Agent

> **Hackathon:** Agents Onchain (DoraHacks) · **Dates:** July 27 – Aug 13, 2026  
> **Built for:** Grand Prize ($2,000) + Best Onboarding UX Improvement Bounty ($1,000)  
> **Tech Stack:** Node.js + Next.js 14 + Vercel AI SDK (Native Tool Calling) + OpenRouter (Free AI Brain Models) + KeeperHub MPC + SIWE (Web3 Wallet Sign-In) + Postgres (Drizzle ORM)

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
         │  generateText(model: OpenRouter, maxSteps: 5)│
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
│  • Base Sepolia Etherscan Live Verification Links       │
└─────────────────────────────────────────────────────────┘
```

---

## Key Features & Architecture

1. **OpenRouter & Fallback AI Brain Layer**: Integrated OpenRouter with `@ai-sdk/openai` (`google/gemini-2.0-flash-exp:free`, `meta-llama/llama-3.3-70b-instruct:free`, `openai/gpt-oss-20b:free`) with seamless failover to Google AI Studio or GitHub Models.
2. **AI Decision Matrix & 5 Execution Paths**:
   - 🟢 **Hold Path**: Health Factor > 1.40 (Healthy passive monitoring)
   - 🟡 **Partial Repay**: 1.10 ≤ Health Factor ≤ 1.40 (Preemptive deleveraging)
   - 🔴 **Full Repay**: Health Factor < 1.10 (Critical liquidation defense)
   - 🔵 **Yield Rotate**: APY Arbitrage optimization (Aave V3.2 ↔ Compound V3)
   - ⚪ **Guarded**: Risk rule blocked or gas delay threshold active
3. **Dual-Wallet Scoping & Signer Alignment**:
   - `monitoredWallet` (`userWallet`): Read-only target account monitored by the agent.
   - `signerWallet` (`AGENTIC_WALLET_ADDRESS`): KeeperHub Turnkey MPC wallet executing on-chain transactions on behalf of the user (supported for Aave repay/supply via `onBehalfOf`).
4. **Agent-Cron DCA Engine**:
   - Direct agent-cron hourly evaluation for scheduled token swaps (`active_workflows`).
   - Single-active DCA constraint per wallet with automatic upsert semantics.
5. **Resilience & Pre-Flight Intercept Engine**:
   - Every transaction is pre-flight simulated prior to broadcast, wasting **0 gas** on contract reverts.
   - 15-minute pending lock TTL cleanup ensures stuck executions never block future strategy cycles.
6. **PayChain Team Remainder & Compensating Cancel Pattern**:
   - Distributes exact remainder cents to final team members ($100 / 3 => $33, $33, $34).
   - Remote KeeperHub workflows created prior to a failure are automatically rolled back via compensating `cancelWorkflow()` calls.
7. **Enhanced Audit & Transaction Proof Badging**:
   - Direct links to **Base Sepolia Etherscan** (`https://sepolia.basescan.org/tx/...`).
   - Provider badges: `🛡️ KeeperHub MPC` (Real on-chain tx), `⚡ Simulated` (Pre-flight stub), `⏳ In-Flight` (Pending).

---

## Modules Reference

### 🛡️ Guardian — Liquidation Protection (`nexus-agent/src/modules/guardian.ts`)
- **Cron:** every 5 minutes
- Evaluates live Aave V3 Health Factor, collateral, debt, and 30-day budget cycles.
- Automatically repays debt or supplies collateral before liquidation threshold (HF < 1.15).

### 🔄 Yield Rotator — APY Optimization (`nexus-agent/src/modules/yield-rotator.ts`)
- **Cron:** every 15 minutes
- Monitors live supply rates between Aave V3.2 (`0x8bAB6d...`) and Compound V3 on Base Sepolia using `lib/compound.ts`.
- Rotates deposits only when 90-day APY profit exceeds gas costs (break-even < 45 days).

### 📅 DCA Engine — Dollar-Cost Averaging (`nexus-agent/src/modules/dca.ts` & `nexus-agent/src/modules/dca-schedule.ts`)
- **Cron:** every hour
- Executes recurring USDC → ETH swaps via Uniswap V3 with gas-price delays if gas > 5% of purchase value.

### 💸 PayChain — Recurring Payroll (`nexus-agent/src/modules/paychain.ts`)
- Natural language payroll scheduler with duplicate collision detection, payee auto-creation, remainder cent distribution, and spending ceiling enforcement.

---

## Quickstart & Environment Setup

### 1. Clone & Install Dependencies
```bash
git clone https://github.com/Assassin859/Nexus-Agent.git
cd Nexus-Agent
pnpm install
```

### 2. Configure Root `.env`
```bash
OPENROUTER_API_KEY="sk-or-v1-..."
BRAIN_MODEL="openai/gpt-oss-20b:free"
DATABASE_URL="postgresql://postgres:password@localhost:5432/railway"
NEXT_PUBLIC_AGENT_URL="http://localhost:3001"
```

### 3. Run Backend Agent & Next.js Dashboard
```bash
# Terminal 1: Backend Agent Server (Port 3001)
pnpm --prefix nexus-agent dev

# Terminal 2: Next.js Dashboard UI (Port 3000)
pnpm --prefix nexus-dashboard dev
```

---

## Verification & Test Harnesses

```bash
# Run 19/19 Unit & Integration Tests
pnpm --prefix nexus-agent run verify:integration

# Run OpenRouter AI Brain Smoke Test
pnpm --prefix nexus-agent exec tsx src/scripts/test-openrouter-smoke.ts

# Evaluate Live Base Sepolia Guardian Position
pnpm --prefix nexus-agent exec tsx src/scripts/test-guardian-run.ts
```
