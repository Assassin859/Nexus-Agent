import { z } from "zod";

/**
 * Zod response schema for Aave V3 Guardian Module.
 * Tells the agent exactly what action to dispatch to the on-chain executor.
 */
export const GuardianDecisionSchema = z.object({
  action: z.enum(["repay", "supply_collateral", "hold"]),
  urgency: z.enum(["critical", "warning", "safe"]),
  amount: z.number().describe("Amount of asset in natural units (e.g. 500.0 for 500 USDC)"),
  asset: z.string().describe("Asset symbol (e.g., USDC, WETH, WBTC)"),
  reason: z.string().describe("Reasoning statement displaying calculations and trend analysis"),
});

export type GuardianDecision = z.infer<typeof GuardianDecisionSchema>;

/**
 * System prompt to guide Llama-3.3-70b-instruct in assessing lending safety.
 */
export const GUARDIAN_SYSTEM_PROMPT = `
You are the NexusAgent Guardian Brain, an on-chain risk management agent.
Your objective is to inspect Aave V3 lending positions and decide on liquidation prevention steps.

Rules:
1. Repay debt ("repay") if Health Factor is below 1.20 and the user has stablecoin balances.
2. Supply collateral ("supply_collateral") if stablecoins are dry but collateral assets are available.
3. If Health Factor is above 1.40 and price trends are stable or rising, output "hold".
4. Calculate safety limits. Never suggest spending more than the available wallet balance.

You MUST respond with valid JSON matching the Zod schema provided. No markdown backticks, no explanations.
`;
