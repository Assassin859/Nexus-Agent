import { z } from "zod";

// =============================================================================
// 1. GUARDIAN MODULE (Liquidation Protection)
// =============================================================================

export const GuardianDecisionSchema = z.object({
  analysis: z.object({
    collateralValueUSD: z.number(),
    debtValueUSD: z.number(),
    currentHealthFactor: z.number(),
    requiredRepaymentToTargetHF: z.number().describe("USDC amount needed to restore HF to safety threshold (1.30)"),
    walletLimitExceeded: z.boolean().describe("True if requiredRepaymentToTargetHF > available wallet balance"),
    cycleRemainingBudgetUSD: z.number().describe("Remaining cycle budget from database repayment_cycles"),
    safetyStatus: z.enum(["safe", "warning", "critical_liquidation_risk"]),
  }),
  userExplanation: z.string().describe(
    "Plain English message explaining the findings, budget checks, and suggested mitigation plan."
  ),
  recommendation: z.object({
    action: z.enum(["repay", "supply_collateral", "hold", "block_transaction"]),
    asset: z.string().describe("Asset symbol to act upon (e.g. USDC, WETH)"),
    amount: z.number().describe("Amount to execute, strictly capped at available wallet balance and remaining cycle budget"),
    reason: z.string(),
  }),
});

export type GuardianDecision = z.infer<typeof GuardianDecisionSchema>;

export const GUARDIAN_SYSTEM_PROMPT = `
You are the NexusAgent Guardian Brain. Your objective is to protect Aave V3 lending positions from liquidation.

Inputs injected:
- healthFactor: current Aave V3 health factor
- walletBalance: available USDC/WETH in the agentic wallet
- cycleRemainingBudget: remaining monthly repayment budget (from DB)
- executionHistory: recent repayments and pending transactions (from DB)
- priceTrend: 'stable' | 'volatile' | 'crash'

Rules (enforce in order):
1. CYCLE LOCK: If executionHistory contains a pending transaction, output action "block_transaction" to avoid double repayments.
2. WALLET CAP: recommendation.amount must NEVER exceed walletBalance. If repayment needs $X but wallet holds $Y (Y < X), set amount to Y and explain in userExplanation.
3. BUDGET CAP: recommendation.amount must NEVER exceed cycleRemainingBudget.
4. HOLD: If healthFactor > 1.40 and priceTrend is 'stable', always output action "hold".
5. CRASH: If priceTrend is 'crash', initiate "repay" even if HF is temporarily safe.
6. HF < 1.15: action "repay" or "supply_collateral" depending on assets.

Respond with valid JSON matching the schema. No markdown wrapping.
`;

// =============================================================================
// 2. YIELD ROTATOR MODULE
// =============================================================================

export const YieldRotatorSchema = z.object({
  analysis: z.object({
    currentProtocol: z.string(),
    targetProtocol: z.string(),
    apyDelta: z.number().describe("Target APY minus current APY in percentage points"),
    estimatedGasUSD: z.number(),
    estimated90DayProfitUSD: z.number(),
    breakEvenDays: z.number(),
    profitable: z.boolean().describe("True only if breakEvenDays <= 45"),
  }),
  userExplanation: z.string().describe("Explanation detailing the yield rotation gains and gas offset checks."),
  recommendation: z.object({
    should_rotate: z.boolean(),
    from_protocol: z.string(),
    to_protocol: z.string(),
    asset: z.string(),
    amount: z.number(),
  }),
});

export type YieldRotator = z.infer<typeof YieldRotatorSchema>;

export const YIELD_ROTATOR_SYSTEM_PROMPT = `
You are the NexusAgent Yield Rotator Brain. Your job is to optimize yield across Aave, Compound, and Morpho.

Rules:
1. NET PROFIT: Only rotate if (amount * apyDelta / 365 * 90) - estimatedGasUSD > 0.
2. BREAK-EVEN CAP: If it takes more than 45 days to break even on gas, set should_rotate: false.
3. SAME RATE: If protocols are within 0.1% APY of each other, set should_rotate: false.
4. Set from/to protocols to "none" when should_rotate is false.

Respond with valid JSON matching the schema. No markdown wrapping.
`;

// =============================================================================
// 3. DCA ENGINE MODULE (Dollar-Cost Averaging)
// =============================================================================

export const DCASchema = z.object({
  analysis: z.object({
    purchaseAmountUSD: z.number(),
    estimatedGasUSD: z.number(),
    gasAsPercentageOfPurchase: z.number(),
    gasLimitExceeded: z.boolean().describe("True if gas > 5% of purchase value"),
    recommendedDelayMinutes: z.number(),
  }),
  userExplanation: z.string(),
  recommendation: z.object({
    execute_swap: z.boolean(),
    source_asset: z.string(),
    target_asset: z.string(),
    amount_in_usd: z.number(),
    delay_minutes: z.number().describe("Minutes to delay. 0 if execute_swap is true"),
    max_slippage_percentage: z.number().describe("Always set to 0.5 to prevent MEV frontrunning"),
  }),
});

export type DCADecision = z.infer<typeof DCASchema>;

export const DCA_SYSTEM_PROMPT = `
You are the NexusAgent DCA Brain. Your job is to execute scheduled token swaps on Uniswap V3.

Rules:
1. GAS THRESHOLD: If estimatedGasUSD > 5% of purchaseAmountUSD, set execute_swap: false and delay_minutes: 60.
2. SLIPPAGE: Always set max_slippage_percentage to exactly 0.5. Non-negotiable safety limit.
3. EXECUTE: If gas is acceptable, set execute_swap: true and delay_minutes: 0.

Respond with valid JSON matching the schema. No markdown wrapping.
`;

// =============================================================================
// 4. PAYCHAIN MODULE (Recurring Payroll)
// =============================================================================

export const PayChainSchema = z.object({
  analysis: z.object({
    exceedsSpendingCeiling: z.boolean().describe("True if amount > 1000 USDC"),
    registeredWorkflowCollision: z.boolean().describe("True if DB already has active payroll for this recipient"),
    recipientAddressValid: z.boolean().describe("True if address matches 0x[40 hex chars] pattern"),
  }),
  userExplanation: z.string().describe("Clear summary showing recipient name, frequency details, and approval checks."),
  recommendation: z.object({
    recipient_address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
    recipient_name: z.string(),
    amount: z.number(),
    token: z.enum(["USDC", "USDT", "WETH"]),
    frequency: z.enum(["weekly", "biweekly", "monthly", "one_time"]),
    cron_schedule: z.string().describe("Standard 5-field cron schedule"),
    verification_required: z.boolean(),
  }),
});

export type PayChainDecision = z.infer<typeof PayChainSchema>;

export const PAYCHAIN_SYSTEM_PROMPT = `
You are the NexusAgent PayChain Brain. Your job is to parse natural language payroll instructions into structured cron schedules.

Rules:
1. ADDRESS: Extract 0x Ethereum address. If invalid, set recipientAddressValid: false and verification_required: true.
2. TOKEN: Default to USDC if user says dollars or stablecoin.
3. CRON: Map frequency -> cron:
   - weekly -> "0 9 * * 1" (Monday 9am)
   - biweekly -> "0 9 1,15 * *" (1st and 15th)
   - monthly -> "0 9 1 * *" (1st of month)
   - one_time -> "0 9 * * *" (next occurrence)
4. CEILING: If amount > 1000 USDC, set exceedsSpendingCeiling: true and verification_required: true.
5. COLLISION: If registeredWorkflowCollision is true (passed in context), set verification_required: true.

Respond with valid JSON matching the schema. No markdown wrapping.
`;
