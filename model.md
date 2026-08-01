# NexusAgent AI Brain — Model Reference & Zod Schemas

> Reference for the **Vercel AI SDK + OpenRouter** integration used across all 4 NexusAgent modules.
> Current provider chain: `OPENROUTER_API_KEY` → `GEMINI_API_KEY` → `OPENAI_API_KEY` → `GITHUB_TOKEN`

---

## 1. Provider Setup (`brain/provider.ts`)

```typescript
import { generateObject } from "ai";
import { getBrainModel, getActiveBrainProvider } from "./provider.js";
import { GuardianDecisionSchema, GUARDIAN_SYSTEM_PROMPT } from "./schemas.js";

// getBrainModel() selects provider by env priority:
// OPENROUTER_API_KEY → GEMINI_API_KEY → OPENAI_API_KEY → GITHUB_TOKEN

const { object: decision } = await generateObject({
  model: getBrainModel(),
  schema: GuardianDecisionSchema,
  system: GUARDIAN_SYSTEM_PROMPT,
  prompt: JSON.stringify({
    healthFactor: 3.26,
    walletBalance: 11000,
    collateralValueUSD: 12114,
    debtValueUSD: 3122,
    cycleRemainingBudget: 1000,
    executionHistory: [],
    priceTrend: "stable",
  }),
});

// Startup log: getActiveBrainProvider()
// → { provider: "openrouter", model: "google/gemini-2.5-flash" }
```

**Why `generateObject()`?** It forces the LLM to return structured JSON matching the Zod schema. No hallucinated field names, no unstructured text, no missing fields. If the model output doesn't match, the Vercel AI SDK retries automatically.

---

## 2. The Reasoning-First Pattern

Every schema has two top-level objects:

```
analysis   → forces computation (bounds checks, break-even math, risk assessment)
     ↓
recommendation → the actual executable decision (action, amount, schedule)
```

This ordering is critical. Because LLMs generate tokens auto-regressively, placing the analysis *before* the recommendation forces the model to compute its constraints *before* it outputs the action. This eliminated two hallucination bugs found during testing.

---

## 3. Hallucination Bugs Found & Fixed

### Bug 1 — Wallet Over-Spending
**Symptom:** Model recommended repaying $1,500 USDC when wallet held only $500.
**Cause:** Standard chain-of-thought ignores hard physical constraints.
**Fix:** Schema `analysis.walletLimitExceeded` boolean + system prompt rule: *"recommendation.amount must NEVER exceed walletBalance."*

### Bug 2 — Duplicate Execution
**Symptom:** Model re-triggered repayments already processed in the same cycle.
**Cause:** Stateless model had no awareness of pending transactions.
**Fix:** Guardian reads `executions_log` for `status: "pending"` before calling LLM and injects `"pending_transaction_exists"` into `executionHistory`. Schema rule: *"If executionHistory contains a pending transaction, output action: block_transaction."*

---

## 4. All 4 Module Schemas (Production Versions)

### 4.1 Guardian — Liquidation Protection

**Input context injected (real on-chain data):**
```json
{
  "healthFactor": 1.12,
  "walletBalance": 500,
  "collateralValueUSD": 5000,
  "debtValueUSD": 4000,
  "cycleRemainingBudget": 650,
  "executionHistory": [],
  "priceTrend": "stable"
}
```

**Schema (`brain/schemas.ts`):**
```typescript
export const GuardianDecisionSchema = z.object({
  analysis: z.object({
    collateralValueUSD: z.number(),
    debtValueUSD: z.number(),
    requiredRepaymentToTargetHF: z.number()
      .describe("Repayment needed to restore Health Factor to 1.30"),
    walletLimitExceeded: z.boolean()
      .describe("True if requiredRepaymentToTargetHF > available wallet balance"),
    cycleRemainingBudgetUSD: z.number(),
    safetyStatus: z.enum(["safe", "warning", "critical_liquidation_risk"]),
  }),
  userExplanation: z.string(),
  recommendation: z.object({
    action: z.enum(["repay", "supply_collateral", "hold", "block_transaction"]),
    asset: z.string(),
    amount: z.number()
      .describe("Capped strictly at min(available wallet balance, cycleRemainingBudgetUSD)"),
    reason: z.string(),
  }),
});
```

**System Prompt rules (enforced in order):**
1. `CYCLE LOCK` — If pending tx exists → `block_transaction`
2. `WALLET CAP` — `amount <= walletBalance`
3. `BUDGET CAP` — `amount <= cycleRemainingBudget`
4. `HOLD` — If HF > 1.40 and stable → `hold`
5. `CRASH` — If priceTrend = 'crash' → `repay` regardless of HF
6. `HF < 1.15` → `repay` or `supply_collateral`

---

### 4.2 Yield Rotator — APY Optimization

**Input context injected (real on-chain rates):**
```json
{
  "aaveUSDCSupplyAPY": 4.2,
  "compoundUSDCSupplyAPY": 32.6,
  "morphoUSDCSupplyAPY": 8.1,
  "allocatedAmountUSD": 1000,
  "estimatedGasUSD": 4.50
}
```

**Schema:**
```typescript
export const YieldRotatorSchema = z.object({
  analysis: z.object({
    currentProtocol: z.string(),
    targetProtocol: z.string(),
    apyDelta: z.number().describe("Target APY minus current APY in percentage points"),
    estimatedGasUSD: z.number(),
    estimated90DayProfitUSD: z.number(),
    breakEvenGasThresholdUSD: z.number(),
    profitable: z.boolean()
      .describe("True only if estimated90DayProfitUSD > estimatedGasUSD and breakEvenDays <= 45"),
  }),
  userExplanation: z.string(),
  recommendation: z.object({
    should_rotate: z.boolean(),
    from_protocol: z.string(),
    to_protocol: z.string(),
    asset: z.string(),
    amount: z.number(),
  }),
});
```

**System Prompt rules:**
1. `NET PROFIT` — Only rotate if `(Amount × APY_Delta) - Gas_Fees > 0`
2. `TIME HORIZON` — Break-even must be ≤ 45 days (90-day horizon)
3. `SAME RATE` — If delta < 0.1%, `should_rotate: false`

---

### 4.3 DCA Engine — Dollar-Cost Averaging

**Input context injected (real gas price from RPC):**
```json
{
  "purchaseAmountUSD": 100,
  "estimatedGasUSD": 5.20,
  "sourceAsset": "USDC",
  "targetAsset": "ETH"
}
```

**Schema:**
```typescript
export const DCASchema = z.object({
  analysis: z.object({
    purchaseAmountUSD: z.number(),
    estimatedGasUSD: z.number(),
    gasAsPercentageOfPurchase: z.number(),
    gasLimitExceeded: z.boolean()
      .describe("True if estimatedGasUSD > 5% of purchaseAmountUSD"),
    recommendedDelayMinutes: z.number(),
  }),
  userExplanation: z.string(),
  recommendation: z.object({
    execute_swap: z.boolean(),
    source_asset: z.string(),
    target_asset: z.string(),
    amount_in_usd: z.number(),
    delay_minutes: z.number()
      .describe("0 if execute_swap is true, 60 if gas too high"),
    max_slippage_percentage: z.number()
      .describe("Always exactly 0.5 — MEV sandwich attack protection. Non-negotiable."),
  }),
});
```

**System Prompt rules:**
1. `GAS THRESHOLD` — If gas > 5% of purchase → `execute_swap: false`, `delay_minutes: 60`
2. `SLIPPAGE` — `max_slippage_percentage` = 0.5 always (MEV protection)
3. `EXECUTE` — If gas acceptable → `execute_swap: true`

---

### 4.4 PayChain — Recurring Payroll

**Input context injected (user NL + DB state):**
```json
{
  "userMessage": "Pay 0xABC...DEF 200 USDC every Friday",
  "existingWorkflowForRecipient": false,
  "currentActiveWorkflowCount": 2
}
```

**Schema:**
```typescript
export const PayChainSchema = z.object({
  analysis: z.object({
    exceedsSpendingCeiling: z.boolean()
      .describe("True if amount > 1000 USDC"),
    registeredWorkflowCollision: z.boolean()
      .describe("True if DB already has an active payroll workflow for this recipient"),
    recipientAddressValid: z.boolean()
      .describe("True if address matches 0x prefix + 40 hex characters"),
  }),
  userExplanation: z.string(),
  recommendation: z.object({
    recipient_address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
    recipient_name: z.string(),
    amount: z.number(),
    token: z.enum(["USDC", "USDT", "WETH"]),
    frequency: z.enum(["weekly", "biweekly", "monthly", "one_time"]),
    cron_schedule: z.string()
      .describe("5-field cron: weekly='0 9 * * 1', biweekly='0 9 1,15 * *', monthly='0 9 1 * *'"),
    verification_required: z.boolean(),
  }),
});
```

**System Prompt rules:**
1. `ADDRESS` — Extract 0x address; if invalid → `recipientAddressValid: false`, `verification_required: true`
2. `TOKEN` — Default USDC; use WETH only if explicitly stated
3. `CRON` — Map: weekly → `0 9 * * 1`, biweekly → `0 9 1,15 * *`, monthly → `0 9 1 * *`
4. `CEILING` — If amount > 1000 → `verification_required: true`
5. `COLLISION` — If recipient already has active workflow → `verification_required: true`

**Cron schedule → Human readable:**
| Frequency | Cron | Human |
|---|---|---|
| weekly | `0 9 * * 1` | Every Monday at 9:00 AM |
| biweekly | `0 9 1,15 * *` | On the 1st & 15th at 9:00 AM |
| monthly | `0 9 1 * *` | On the 1st of each month at 9:00 AM |
| daily | `0 9 * * *` | Every day at 9:00 AM |
| Friday | `0 9 * * 5` | Every Friday at 9:00 AM |

---

## 5. Model Selection Rationale

| Model | Role | Decision |
|---|---|---|
| `google/gemini-2.5-flash` (OpenRouter) | Primary production model | **Current default** — fast, reliable `generateObject()` |
| `gemini-2.0-flash` (direct Gemini API) | Fallback if OpenRouter unavailable | Via `GEMINI_API_KEY` |
| `gpt-4o-mini` (OpenAI / GitHub) | Last-resort fallback | Legacy; GitHub Models retired |

---

## 6. Serverless Inference Architecture

Using OpenRouter via Vercel AI SDK means:
- No Ollama container or local GPU
- Railway Node service runs &lt; 100MB RAM
- Inference is API-based — billed per token (OpenRouter credits)
- Primary credential: `OPENROUTER_API_KEY` + `BRAIN_MODEL=google/gemini-2.5-flash`
