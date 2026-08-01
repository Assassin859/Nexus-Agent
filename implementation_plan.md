# Implementation Plan — Native Agentic Tools & Turnkey Sync

> ⚠️ **Historical document** — describes early GPT-4o / GitHub Models migration. **Current brain:** OpenRouter via `getBrainModel()` in `nexus-agent/src/brain/provider.ts`. See [README.md](README.md).

---

## Technical Architecture

### 1. Agent Brain Layer (`nexus-agent/src/brain/agent-tools.ts`)
Native function-calling tools created using Vercel AI SDK `tool()` and `zod`:
- `schedulePayroll`: Schedules recurring payroll/payouts, auto-detecting explicit overrides (`"do it anyway"`).
- `cancelPayrolls`: Cancels active workflows, updating Postgres records without unique constraint collisions.
- `listWorkflows`: Queries registered active workflows for the wallet.
- `listPayees`: Queries saved payees, single recipients, and shared vault pools.
- `queryPortfolio`: Returns live Aave position health factor, collateral, and debt.
- `triggerStrategy`: Immediately triggers DCA, Guardian, or Yield Rotator strategies.
- `getLiveTransactions`: Fetches recent execution logs with verified Sepolia Etherscan URLs.

### 2. Conversational Router (`nexus-agent/src/index.ts`)
- Calls `generateText({ model: githubModels("gpt-4o"), tools, maxSteps: 5 })`.
- Converts messy human prompts into multi-step autonomous tool executions and formats replies as clean bulleted markdown.

### 3. Google Sign-In & Turnkey MPC (`nexus-dashboard/context/WalletContext.tsx`)
- Maps Google email (`user@gmail.com`) to Turnkey MPC Wallet (`0x89f97Cb35236a1d0190FB25B31C5C0fF4107Ec1b`).
- Eliminates wallet address mismatches between MetaMask and KeeperHub MPC accounts.

### 4. Workflow Inspector & Verification (`nexus-dashboard/app/workflows/page.tsx`)
- Card buttons: **View on KeeperHub**, **Verify on Etherscan**, **Inspect Payload**.
- Interactive payload drawer displaying raw ERC20 calldata (`0xa9059cbb...`), target contract, gas strategy, and schedule.

---

## Verification & Status
- ✅ Native AI SDK tool calling verified for typos (`cancle all`), informal queries (`my workflow ?`), and complex prompts.
- ✅ Google Sign-In modal and wallet context state verified.
- ✅ Chat history persistence verified across route changes.
- ✅ All automated background cron jobs running cleanly.
