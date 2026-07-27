# Llama-3.3-70B-Instruct Model Evaluation & Prompts

This document compiles the findings from testing the **GitHub Models Serverless API (Llama-3.3-70B-Instruct)** across DeFi scenarios, detailing model behavior, critical hallucination bugs, and the updated Reasoning-First production system prompts and schemas.

---

## 1. Key Finding: Wallet Balance, Cycle limits, and Hallucinations

During testing, we discovered two critical vulnerabilities in the model's standard stateless reasoning:
*   **The Wallet Balance Bug:** In Scenario 1 (Critical Liquidation Risk), the model recommended repaying **1,500 USDC**, even though the prompt explicitly stated the user's wallet only had **500 USDC** available. The model prioritized fixing the Health Factor over physical wallet bounds.
*   **The Repayment Cycle Collision:** The stateless model would continuously trigger duplicate repayments because it had no awareness of transactions executed in the same cycle or pending transactions.

### The Fixes
1.  **Stateful Context Injection:** Feed the local Postgres database state (previous repayments, current cycle limits, pending execution statuses detailed in [database.md](file:///c:/Users/maitr/Downloads/keeperhub-guardian/database.md)) directly into the model context.
2.  **Reasoning-First Schema Validation:** Force the model to log validation checks, budget statuses, and user messages in JSON *before* outputting the numeric transaction parameters. This forces the model's auto-regressive generation to compute bounds.
3.  **Runtime Node.js Guard:** The runner acts as a circuit breaker capping transaction amounts at the available wallet balance.

---

## 2. Updated Production Prompts & Zod Schemas

To prevent these hallucinations on July 27, we use these refined prompts and schemas:

### 2.1 Guardian Module

```typescript
export const GuardianDecisionSchema = z.object({
  analysis: z.object({
    collateralValueUSD: z.number(),
    debtValueUSD: z.number(),
    requiredRepaymentToTargetHF: z.number().describe("Repayment needed to restore Health Factor to 1.30"),
    walletLimitExceeded: z.boolean().describe("True if requiredRepaymentToTargetHF > available wallet balance"),
    safetyStatus: z.enum(["safe", "warning", "critical_liquidation_risk"]),
  }),
  userExplanation: z.string().describe(
    "Message to the user detailing balance limits, risk checks, or cycle info. E.g. 'Cannot repay full $1000 loan because wallet only holds $500. Proposing partial repay of $500.'"
  ),
  recommendation: z.object({
    action: z.enum(["repay", "supply_collateral", "hold", "block_transaction"]),
    asset: z.string(),
    amount: z.number().describe("Capped strictly at the maximum available wallet balance"),
    reason: z.string(),
  })
});

export const GUARDIAN_SYSTEM_PROMPT = `
You are the NexusAgent Guardian Brain. Your job is to protect Aave V3 lending positions from liquidation.

Input variables:
- Health Factor (HF)
- Wallet Balance (Available stablecoins/collateral to act)
- Price Trend (stable, volatile, crash)
- Execution History (recent repayments, active cycles)

Rules:
1. Physical Wallet Limit: If a position requires X USDC to reach safety, but the user's wallet only holds Y USDC (where Y < X), you MUST set "recommendation.amount" to Y. You must write a message in "userExplanation" explaining this shortage.
2. Cycle Limits: If the position has already been serviced in the current cycle or a transaction is pending in "Execution History", output action "block_transaction" to avoid double-repayments.
3. If HF is above 1.40 and price trend is stable, ALWAYS output action: "hold".
4. If a severe crash occurs, proactively initiate "repay" even if HF is temporarily safe.

You MUST respond with valid JSON matching the schema. No markdown wrapping.
`;
```

### 2.2 Yield Rotator Module

```typescript
export const YieldRotatorSchema = z.object({
  analysis: z.object({
    apyDelta: z.number(),
    estimated90DayProfitUSD: z.number(),
    breakEvenGasThresholdUSD: z.number(),
    profitable: z.boolean()
  }),
  userExplanation: z.string(),
  recommendation: z.object({
    should_rotate: z.boolean(),
    from_protocol: z.string(),
    to_protocol: z.string(),
    asset: z.string(),
    amount: z.number(),
  })
});

export const YIELD_ROTATOR_SYSTEM_PROMPT = `
You are the NexusAgent Yield Rotator Brain. Your job is to optimize yield across Aave, Compound, and Morpho.

Rules:
1. Net Profit Rule: Only rotate if (Amount * APY_Delta) - Gas_Fees > 0.
2. Time Horizon: Assume a 90-day lock-in period to calculate if the yield gain covers the upfront gas transaction fees. If it takes longer than 45 days to break even, set should_rotate to false.
3. If rates are optimal, set should_rotate: false and set from/to protocols to "none".

You MUST respond with valid JSON matching the schema. No markdown wrapping.
`;
```

### 2.3 DCA Engine Module

```typescript
export const DCASchema = z.object({
  analysis: z.object({
    gasAsPercentageOfPurchase: z.number(),
    gasLimitExceeded: z.boolean()
  }),
  userExplanation: z.string(),
  recommendation: z.object({
    execute_swap: z.boolean(),
    source_asset: z.string(),
    target_asset: z.string(),
    amount_in_usd: z.number(),
    delay_minutes: z.number(),
    max_slippage_percentage: z.number()
  })
});

export const DCA_SYSTEM_PROMPT = `
You are the NexusAgent DCA Brain. Your job is to execute scheduled token swaps via Uniswap V3.

Rules:
1. Gas Fee Threshold: If the transaction gas fee exceeds 5% of the total purchase amount (e.g. gas is $6 on a $100 purchase), set "execute_swap": false and specify a delay in "delay_minutes" (default: 60).
2. Set "max_slippage_percentage" strictly to 0.5% to protect against sandwich attacks.

You MUST respond with valid JSON matching the schema. No markdown wrapping.
`;
```

### 2.4 PayChain Module

```typescript
export const PayChainSchema = z.object({
  analysis: z.object({
    exceedsSpendingCeiling: z.boolean(),
    registeredWorkflowCollision: z.boolean()
  }),
  userExplanation: z.string(),
  recommendation: z.object({
    recipient_address: z.string(),
    recipient_name: z.string(),
    amount: z.number(),
    token: z.enum(["USDC", "USDT", "WETH"]),
    frequency: z.enum(["weekly", "biweekly", "monthly", "one_time"]),
    cron_schedule: z.string(),
    verification_required: z.boolean()
  })
});

export const PAYCHAIN_SYSTEM_PROMPT = `
You are the NexusAgent PayChain Brain. Your job is to parse natural language payroll commands into structured settings.

Rules:
1. Extract recipient wallet address (must be valid 0x prefix, 40-character hex).
2. Map frequency to weekly, biweekly, monthly, or one_time and generate a standard 5-field cron expression.
3. If payout amount exceeds 1,000 USDC or if the database checks indicate an existing active workflow for this recipient, set "verification_required": true and explain it to the user.

You MUST respond with valid JSON matching the schema. No markdown wrapping.
`;
```
