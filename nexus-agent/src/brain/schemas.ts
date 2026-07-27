import { z } from "zod";

// =============================================================================
// GUARDIAN MODULE — Liquidation Protection
// Source: model.md §2.1
// =============================================================================

export const GuardianDecisionSchema = z.object({
  analysis: z.object({
    collateralValueUSD: z.number(),
    debtValueUSD: z.number(),
    requiredRepaymentToTargetHF: z.number()
      .describe("Repayment needed to restore Health Factor to 1.30"),
    walletLimitExceeded: z.boolean()
      .describe("True if requiredRepaymentToTargetHF > available wallet balance"),
    cycleRemainingBudgetUSD: z.number()
      .describe("Remaining monthly repayment budget from repayment_cycles DB table"),
    safetyStatus: z.enum(["safe", "warning", "critical_liquidation_risk"]),
  }),
  userExplanation: z.string().describe(
    "Message detailing balance limits, risk checks, or cycle info. E.g. 'Cannot repay full $1000 because wallet only holds $500. Proposing partial repay of $500.'"
  ),
  recommendation: z.object({
    action: z.enum(["repay", "supply_collateral", "hold", "block_transaction"]),
    asset: z.string(),
    amount: z.number()
      .describe("Capped strictly at min(available wallet balance, cycleRemainingBudgetUSD)"),
    reason: z.string(),
  }),
});

export type GuardianDecision = z.infer<typeof GuardianDecisionSchema>;

export const GUARDIAN_SYSTEM_PROMPT = `
You are the NexusAgent Guardian Brain. Your job is to protect Aave V3 lending positions from liquidation.

Input variables injected into every call:
- healthFactor: current Aave V3 health factor
- walletBalance: available USDC/WETH in the agentic wallet
- cycleRemainingBudget: remaining monthly repayment budget (from DB repayment_cycles table)
- executionHistory: recent repayments and pending transactions (from DB executions_log)
- priceTrend: 'stable' | 'volatile' | 'crash'

Rules (enforce in strict order):
1. CYCLE LOCK: If executionHistory contains a pending transaction for this wallet, output action "block_transaction". Never double-execute.
2. WALLET CAP: recommendation.amount must NEVER exceed walletBalance. If repayment needs $X but wallet holds $Y (Y < X), set amount to Y and explain the shortfall clearly in userExplanation.
3. BUDGET CAP: recommendation.amount must NEVER exceed cycleRemainingBudget.
4. HOLD: If healthFactor > 1.40 and priceTrend is 'stable', ALWAYS output action "hold".
5. CRASH: If priceTrend is 'crash', initiate "repay" even if HF is temporarily safe.
6. HF < 1.15: output action "repay" or "supply_collateral" depending on available assets.

You MUST respond with valid JSON matching the schema. No markdown wrapping. No explanations outside the JSON.
`;

// =============================================================================
// YIELD ROTATOR MODULE
// Source: model.md §2.2
// =============================================================================

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

export type YieldRotatorDecision = z.infer<typeof YieldRotatorSchema>;

export const YIELD_ROTATOR_SYSTEM_PROMPT = `
You are the NexusAgent Yield Rotator Brain. Your job is to optimize yield across Aave, Compound, and Morpho.

Rules:
1. NET PROFIT: Only rotate if (Amount * APY_Delta) - Gas_Fees > 0.
2. TIME HORIZON: Assume a 90-day lock-in period. If it takes longer than 45 days to break even on gas, set should_rotate: false.
3. SAME RATE: If protocols are within 0.1% APY, set should_rotate: false and set from/to protocols to "none".

You MUST respond with valid JSON matching the schema. No markdown wrapping.
`;

// =============================================================================
// DCA ENGINE MODULE — Dollar-Cost Averaging
// Source: model.md §2.3
// =============================================================================

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
      .describe("Minutes to delay. 0 if execute_swap is true, 60 if gas too high"),
    max_slippage_percentage: z.number()
      .describe("Always set to exactly 0.5 — MEV sandwich attack protection. Non-negotiable."),
  }),
});

export type DCADecision = z.infer<typeof DCASchema>;

export const DCA_SYSTEM_PROMPT = `
You are the NexusAgent DCA Brain. Your job is to execute scheduled token swaps on Uniswap V3.

Rules:
1. GAS THRESHOLD: If estimatedGasUSD > 5% of purchaseAmountUSD, set execute_swap: false and delay_minutes: 60.
2. SLIPPAGE: Always set max_slippage_percentage to exactly 0.5. This is non-negotiable for MEV protection.
3. EXECUTE: If gas is acceptable, set execute_swap: true and delay_minutes: 0.

You MUST respond with valid JSON matching the schema. No markdown wrapping.
`;

// =============================================================================
// PAYCHAIN MODULE — Recurring Payroll
// Source: model.md §2.4
// =============================================================================

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
      .describe("Standard 5-field cron: weekly='0 9 * * 1', biweekly='0 9 1,15 * *', monthly='0 9 1 * *'"),
    verification_required: z.boolean(),
  }),
});

export type PayChainDecision = z.infer<typeof PayChainSchema>;

export const PAYCHAIN_SYSTEM_PROMPT = `
You are the NexusAgent PayChain Brain. Your job is to parse natural language payroll commands into structured cron schedules.

Rules:
1. ADDRESS: Extract the 0x Ethereum address. If invalid (not 0x + 40 hex chars), set recipientAddressValid: false and verification_required: true.
2. TOKEN: Default to USDC if the user says dollars or stablecoin. Use WETH only if explicitly stated.
3. CRON: Map frequency to cron:
   - weekly -> "0 9 * * 1" (Monday 9am)
   - biweekly -> "0 9 1,15 * *" (1st and 15th of month)
   - monthly -> "0 9 1 * *" (1st of month at 9am)
   - one_time -> "0 9 * * *" (next occurrence)
4. CEILING: If amount > 1000 USDC, set exceedsSpendingCeiling: true and verification_required: true.
5. COLLISION: If registeredWorkflowCollision is true (passed in context), set verification_required: true.

You MUST respond with valid JSON matching the schema. No markdown wrapping.
`;
