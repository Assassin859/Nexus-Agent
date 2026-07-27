# KeeperHub NexusAgent — Project Plan

**Hackathon:** Agents Onchain (DoraHacks) · **Dates:** July 27 – Aug 13, 2026
**Team:** 2 people · **Chain:** Ethereum (Sepolia for build/test, Mainnet for final transaction)
**Targets:** Grand Prize + Best Onboarding UX Improvement bounty

---

## 1. One-line pitch

An autonomous Web3 wealth management agent built using Vercel AI SDK + GitHub Models API (Llama-3.3-70B) that integrates with 22/22 KeeperHub execution surfaces to protect lending positions, compound yield, run DCA schedules, and execute payroll.

---

## 2. Technical Flow & System Overview

```
       [User Intent / Natural Language Input]
                          │
                          ▼
       [Vercel AI SDK + GitHub Models Brain] ◄──────────────┐
       (meta-llama-3.3-70b-instruct Serverless)             │
                          │                                 │
         1. Check state & history                           │ 2. Ask options /
                          ▼                                 │    warn limits
           [Postgres DB (Drizzle ORM)] ─────────────────────┘
         - Workflows, cycles, logs, loans
                          │
         3. Confirmed / valid action
                          ▼
            [KeeperHub MCP / REST Endpoint]
            (lib/execute/simulate.ts Check)
                          │
             ┌────────────┴────────────┐
             ▼                         ▼
     [Simulate Success]        [Simulate Revert]
             │                         │
             ▼                         ▼
   [Broadcast transaction]      [Abort transaction]
  - Private routing (MEV)       - Log error reason
  - Gas strategy pricing        - Save gas fees
  - Sponsored mainnet txn       - Update local DB logs
             │                         │
             └────────────┬────────────┘
                          ▼
               [Next.js Dashboard UI]
```

---

## 3. Core Features & Codebase Integrations

### 3.1 Vercel AI SDK + GitHub Models Decision Loop
- **Dynamic Context Injection**: Merges live Aave V3 health factors, current APY rates, and wallet balances with **historical state** (previous repayments, current repayment cycle progress, and registered workflows) from the local Postgres DB.
- **Serverless Tool-Calling**: Queries the high-performance `meta-llama-3.3-70b-instruct` model, enabling it to call database tools to scan for active cycles or workflows before generating transaction recommendations.
- **Reasoning-First Schemas**: Refactors Zod output validation schemas to force the model to complete logical checks (limits, risk, and user message formatting) prior to recommending numeric transaction payloads. This eliminates wallet balance and debt repayment limit hallucinations.
- **Decision Engine**:
  - **Lending Protection**: Trigger repay/deposit actions when health factor drops below 1.15, capping suggestions to physical wallet balances.
  - **Yield Rotation**: Withdraw, swap, and re-deposit stablecoins when target APY delta > gas break-even threshold.
  - **Dollar-Cost Averaging**: Scheduled swaps (USDC to ETH) managed on a cron trigger.
- **RPC Resiliency**: Routes read queries through `lib/rpc/provider-factory.ts` using configured fallbacks.

### 3.2 Next.js Dashboard UI & Stateful Agent Loop
- **Portfolio Overview**: Live health factor animation gauge, LTV ratios, and protocol APY charts.
- **Interactive Chat Widget**: Embedded chat client where the user interacts with the brain, allowing conversational confirmation prompts when database collisions are detected.
- **Live Transaction Feed**: Real-time step timeline tracking: `Triggered → Simulating → Pending Broadcast → Mined`.
- **Resilience Log**: Visual card summaries explaining Happy Path runs vs Gas Adjusted runs vs Caught Reverts and Wallet Limit Capping.
- **Workflow Template Store**: Catalog of 6 pre-built templates that new developers can fork and deploy in under 60 seconds (UX bounty target).

---

## 4. KeeperHub Surfaces to Integrate

1. **MCP Server**: Programmatic workflow management (`create_workflow`, `execute_workflow`, `get_execution_status`, `get_execution_logs`).
2. **CLI (`kh`)**: CLI configuration, account status, token audits, and quick execution checks.
3. **Smart Gas Strategy**: Leverages percentile-optimized gas pricing to avoid stuck txns.
4. **x402 / MPP**: Micropayment protocols used to pay for agent execution and compute.
5. **Agentic Wallet**: Turnkey/MPC non-custodial wallet configured with Three-Tier Safety Hooks.

---

## 5. Best Onboarding UX Improvement Bounty Strategy

We target 3 upstream PR contributions to the `KeeperHub/keeperhub` repository:

1. **Dynamic hints in config (`lib/onboarding/getting-started-config.ts`)**:
   - Use user's `walletAddress` context to automatically populate Sepolia contract addresses (Aave Pool, Uniswap V3 Router) inside recommendations chips.
2. **Migration fail-safes (`scripts/dev-login.ts`)**:
   - Auto-detect database journal conflicts and execute `scripts/backfill-drizzle-migrations.ts` on local login boot.
3. **Troubleshooting docs (`docs/getting-started/quickstart.md`)**:
   - Write instructions covering HTTP `429` rate limits, OAuth timeouts, key differences, and testnet faucets.

---

## 6. Two-person role split

- **Person A — Agent & Backend Integration**:
  - Sets up GitHub developer token access and credentials.
  - Integrates Vercel AI SDK + GitHub Models decision loops.
  - Builds Aave monitoring, yield rotators, and DCA executors.
  - Wires up the KeeperHub MCP endpoints, Agentic Wallet, and x402 settings.
  - Configures the Railway Node.js backend deployments.
- **Person B — Dashboard, UX & Bounty Write-up**:
  - Builds Next.js Dashboard pages (Overview, Feed, Resilience Log, Chat, Template Store).
  - Drafts and tests the 3 upstream PR fixes.
  - Compiles the final DoraHacks documentation and demo video.

---

## 7. Timeline (July 27 – Aug 13)

| Days | Focus |
|---|---|
| 1–3 | Setup & verification: GitHub Models endpoints, PAT credential testing, and initial PR workspace validation. |
| 4–7 | Agent decision loop: write Vercel AI SDK decision schemas, connect Aave readers, and simulate swaps. |
| 8–10 | Dashboard pages: Portfolio gauges, Live Feed, Resilience Log. First draft of upstream PR commits. |
| 11–12 | Chat widget, Template Store, and stage Sepolia failure cases. |
| 13–15 | Live execution: Execute one sponsored transaction on Ethereum Mainnet. |
| 16–17 | Deliverables: PR submissions upstream, record demo video, and finalize DoraHacks submission. |
