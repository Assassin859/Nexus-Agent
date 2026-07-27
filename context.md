# Hackathon Context & Technical Setup Specifications

This document serves as the zero-git-history repository footprint checklist for the **Agents Onchain Hackathon (DoraHacks)**, keeping all development planning completely safe from pre-start checks.

---

## 1. Hackathon Details & Guidelines

- **Duration**: July 27 – August 13, 2026 (UTC+2)
- **Primary Goal**: Build an onchain AI agent that executes transactions **exclusively** through KeeperHub. Working onchain transactions are heavily prioritized over mockups.
- **Upstream Target Repository**: `https://github.com/KeeperHub/keeperhub`
- **Fork Target**: `https://github.com/Assassin859/keeperhub` (local workspace: `C:\Users\maitr\Downloads\keeperhub`)
- **Cash Prizes**:
  - **Grand Prize**: 1st ($2,000) | 2nd ($1,200) | 3rd ($800)
  - **Best Onboarding UX Bounty**: $1,000 (split between two winners, stackable)

---

## 2. Onboarding UX Bounty Objectives (PR Targets)

To win the onboarding bounty, we will submit three production-ready Pull Requests to the upstream repository addressing real developer setup friction points:

1.  **Dynamic Workspace Hints** (`lib/onboarding/getting-started-config.ts`):
    - Replace static prompts in the `agent` branch with dynamic forms that suggest testnet contracts (e.g. Aave Sepolia Pool: `0x6Ae43d3271ff68408378a467C62b15264c8d77e4`) using the provided `walletAddress` context.
2.  **Local DB Migration Fail-safes** (`scripts/dev-login.ts`):
    - Catch table collisions in `drizzle.__drizzle_migrations` and automatically execute `scripts/backfill-drizzle-migrations.ts` on workspace initialization, saving new developers from silent command crashes.
3.  **Comprehensive Error Documentation** (`docs/getting-started/quickstart.md`):
    - Add troubleshooting guides for standard HTTP `429` rate-limit responses, browser-handshake authentication limits, `kh_` vs `wfb_` key classification, and faucet resources.

---

## 3. Technical Integration Schemas

### 3.1 AI Decision Stack (Vercel AI SDK + GitHub Models + Drizzle ORM)
We execute serverless AI logic using the Vercel AI SDK's `@ai-sdk/openai` provider pointing to the GitHub Models endpoint, supported by a stateful local database.
- **Base Endpoint**: `https://models.inference.ai.azure.com`
- **Model Selection**: `meta-llama-3.3-70b-instruct` (high-performance 70B parameter model).
- **Authentication**: Authenticate using a standard GitHub Personal Access Token (PAT) assigned to `GITHUB_TOKEN`.
- **Decision Schema**: Enforced via Zod object parsing (`generateObject` / `generateText`) utilizing **Reasoning-First** structures (forcing logic logs and messages prior to final transaction payloads).
- **MCP Tool Calling**: Resolves natural language prompts into target JSON configurations to invoke the KeeperHub MCP server tools.
- **Stateful Memory**: Node.js pulls previous executions, cycles, and limits from the local Postgres database (detailed in [database.md](file:///c:/Users/maitr/Downloads/keeperhub-guardian/database.md)) and appends them to prompt variables so the LLM is fully context-aware.

### 3.2 Pre-Start GitHub Models Key Setup (Pre-Hackathon Testing)
To call the GitHub Models endpoint from your local machine or from Railway:
1.  **Generate Token**: Go to your GitHub profile settings -> **Developer Settings** -> **Personal Access Tokens (classic)** or **Fine-grained tokens**.
2.  **Assign Scopes**: Create a token. No special scopes are required for public model inference, but you can assign `read:user` if needed.
3.  **Configure Environment**: Add the token to your local `.env.local` file:
    ```env
    GITHUB_TOKEN=ghp_yourTokenHere
    ```
4.  **No Server Footprint**: This eliminates the need to host Ollama or allocate RAM containers on Railway, allowing your backend services to run safely on the Railway free tier (<100MB).

### 3.3 Aave V3 Health Factor Math
The agent calculates the lending position safety using:
- **Collateral Balance** ($C_i$) and **Liquidation Threshold** ($LT_i$)
- **Debt Balance** ($D_i$)

$$\text{Health Factor} = \frac{\sum (C_i \text{ in USD} \times LT_i)}{\sum (D_i \text{ in USD})}$$

When health factor falls below `1.15`, the agent initiates a KeeperHub transaction:
- **Repay action calldata**: Target `Aave V3 Pool` (`0x6Ae43d3271ff68408378a467C62b15264c8d77e4`) with the `repay` function signature.
- **Deposit action calldata**: Target `Aave V3 Pool` with the `supply` function signature.

### 3.4 Pre-Flight Checks & Simulation API
- Target endpoint: `lib/execute/simulate.ts`
- Before executing a transaction, send a request to verify:
  - `wouldRevert`: Must be `false`.
  - `gasEstimate`: Read gas units to optimize the next execution.
  - If a revert is caught (e.g. missing allowance), display it in the **Resilience Log** and halt execution to save gas fees.

---

## 4. Work Rules (July 27)

- **Do NOT run `git init`** in the `keeperhub-guardian` folder before July 27, 2026.
- Keep all pre-written files, specs, and JSON ABIs in this folder as plain drafts.
- On July 27, copy files incrementally into the cloned repository to maintain a natural commit history.
- Ensure all PR additions conform to the Biome configurations and conventional commit PR formatting rules in the fork's `CLAUDE.md`.
