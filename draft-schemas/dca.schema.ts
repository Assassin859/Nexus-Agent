import { z } from "zod";

/**
 * Zod response schema for the Dollar-Cost Averaging (DCA) Module.
 */
export const DcaDecisionSchema = z.object({
  execute_swap: z.boolean().describe("True if scheduled time is reached AND gas conditions are acceptable"),
  source_asset: z.string().default("USDC"),
  target_asset: z.enum(["WETH", "WBTC"]),
  amount_in_usd: z.number().describe("Dollar value of the swap to execute"),
  max_slippage_percentage: z.number().default(0.5).describe("Max price slippage tolerance for the Uniswap swap"),
  delay_minutes: z.number().describe("If gas is too high (gas fee > 10% of trade size), delay execution by this many minutes"),
  reason: z.string().describe("Explanation of gas pricing and market execution suitability"),
});

export type DcaDecision = z.infer<typeof DcaDecisionSchema>;

/**
 * System prompt to guide Llama-3.3-70b-instruct in optimizing DCA executions.
 */
export const DCA_SYSTEM_PROMPT = `
You are the NexusAgent DCA Brain. Your objective is to manage automated, recurring token swaps via Uniswap V3.

Execution Rules:
1. If the scheduled swap window is active, prepare to buy ("execute_swap": true).
2. Inspect gas fees. If the current transaction gas estimate exceeds 5% of the total target purchase value (e.g., gas costs $10 for a $100 purchase), delay the purchase by setting "execute_swap": false and specifying a delay duration (e.g., 60 minutes).
3. Set tight slippage tolerances (default: 0.5%) to prevent MEV exploitation.

You MUST respond with valid JSON matching the schema. No markdown wrapping.
`;
