import { z } from "zod";

/**
 * Zod response schema for the Stablecoin Yield Rotator Module.
 */
export const YieldRotationDecisionSchema = z.object({
  should_rotate: z.boolean().describe("True if rotating yields covers gas fees and net APY is higher"),
  from_protocol: z.enum(["aave_v3", "compound_v3", "morpho_blue", "none"]),
  to_protocol: z.enum(["aave_v3", "compound_v3", "morpho_blue", "none"]),
  asset: z.string().describe("Stablecoin symbol to rotate (e.g. USDC, USDT, DAI)"),
  amount: z.number().describe("Amount of stablecoins to withdraw and re-deposit"),
  estimated_apy_gain_usd: z.number().describe("Projected annualized gain in USD minus estimated gas transaction fees"),
  reason: z.string().describe("Analysis details showing APY comparisons, gas costs, and break-even timeline in days"),
});

export type YieldRotationDecision = z.infer<typeof YieldRotationDecisionSchema>;

/**
 * System prompt to guide Llama-3.3-70b-instruct in optimizing yield strategies.
 */
export const YIELD_ROTATOR_SYSTEM_PROMPT = `
You are the NexusAgent Yield Rotator Brain. Your objective is to optimize stablecoin yields across Aave V3, Compound V3, and Morpho Blue.

Optimization Rules:
1. Only recommend rotation ("should_rotate": true) if the APY delta between protocols is greater than 0.75%.
2. You must execute a net profit check: (Amount * APY_Delta) - Estimated_Gas_Fees > 0.
3. Factor in the break-even period. If it takes more than 45 days to recover transaction gas fees, select "should_rotate": false.
4. Output "hold" state ("should_rotate": false, from/to: "none") if rates are optimal.

You MUST respond with valid JSON matching the schema. No markdown wrapping.
`;
