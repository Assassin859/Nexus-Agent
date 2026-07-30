# NexusAgent — System Architecture & Feature Walkthrough

## Summary of Accomplishments

NexusAgent has been upgraded to a **Fully Autonomous Agentic Web3 Wealth Manager** powered by:
- **GPT-4o Native Tool Calling** (Vercel AI SDK `generateText` with `maxSteps: 5`)
- **Google Sign-In + Turnkey MPC Alignment** (解決 MetaMask wallet address mismatch)
- **Interactive KeeperHub Payload & Calldata Inspector**
- **Payee Directory Auto-Creation & Collision Avoidance**
- **Persistent Chat History & Real-Time Etherscan Verification**

---

## 1. Native Agent Tool Loop (`agent-tools.ts` & `index.ts`)

Instead of hardcoded regex or rigid intent schemas, the agent uses **GPT-4o with Native AI Tools**:

```ts
const result = await generateText({
  model: githubModels("gpt-4o"),
  system: "You are NexusAgent, an autonomous DeFi wealth manager...",
  messages,
  tools: createAgentTools(wallet),
  maxSteps: 5,
});
```

### Registered Tools
1. `schedulePayroll`: Parses schedules, checks payees, and handles `"do it anyway"` overrides.
2. `cancelPayrolls`: Cancels active workflows safely without Postgres unique constraint errors.
3. `listWorkflows`: Returns active cron schedules and statuses.
4. `listPayees`: Lists registered single payees, team members, and vault pools.
5. `queryPortfolio`: Reads live Aave position health factor, collateral, and debt.
6. `triggerStrategy`: Fires DCA, Guardian, or Yield Rotator immediately.
7. `getLiveTransactions`: Fetches execution logs with clickable Sepolia Etherscan links.

---

## 2. Google Sign-In with KeeperHub Turnkey MPC

- **Problem Addressed:** MetaMask wallet address (`0x...`) is often different from the user's KeeperHub Turnkey MPC wallet.
- **Solution Built:** `WalletContext.tsx` now supports **Google Sign-In**. Entering your Google email automatically maps to your Turnkey MPC wallet (`0x89f97Cb3...`), displaying your Google account status in the left navigation sidebar.

---

## 3. Workflows Page & Payload Inspector (`/workflows`)

Every workflow card includes:
- **View on KeeperHub Button**: Direct link (`https://app.keeperhub.com/workflows/:id`)
- **Etherscan Verification Link**: (`https://sepolia.etherscan.io/address/:recipient`)
- **Inspect Calldata Toggle**: Reveals target contract (`0x94a9D9...` USDC), raw ERC20 transfer calldata (`0xa9059cbb...`), MEV protection status (Flashbots bundler), and trigger frequency.

---

## 4. Chat Persistence & Formatting

- Guarded `localStorage` loading using `useRef` to prevent initial render wipes on navigation.
- Formats structured lists with clean Markdown bullet points and emojis instead of raw text tables.

---

## Verification Test Log

| User Prompt | Action Taken | Result |
|---|---|---|
| `"my workflow ?"` | Tool: `listWorkflows` | Formatted bulleted list of 5 workflows |
| `"cancle all"` *(typo)* | Tool: `cancelPayrolls` | Cancelled 4 active workflows in Postgres |
| `"who are my payees?"` | Tool: `listPayees` | Displayed `dev team` and `test team` |
| `"am i going to get liquidated?"` | Tool: `queryPortfolio` | Computed HF=99 and confirmed position safety |
| `"show live tx"` | Tool: `getLiveTransactions` | Returned recent transactions with live Etherscan links |
| `"pay dev team 20 USDC every thursday"` | Payee Validation | Detected missing payee → warned user |
| `"do it anyway"` | Payee Auto-Creation | Auto-provisioned `dev team` in DB & registered workflow |
