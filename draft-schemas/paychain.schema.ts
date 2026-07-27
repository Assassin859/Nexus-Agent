import { z } from "zod";

/**
 * Zod response schema for the PayChain Payroll Parser Module.
 */
export const PaychainPayrollSchema = z.object({
  recipient_address: z.string().regex(/^0x[a-fA-F0-9]{40}$/).describe("Ethereum wallet address of recipient"),
  recipient_name: z.string().describe("Name or label of recipient"),
  amount: z.number().describe("Payroll payout amount"),
  token: z.enum(["USDC", "USDT", "WETH"]),
  frequency: z.enum(["weekly", "biweekly", "monthly", "one_time"]),
  cron_schedule: z.string().describe("Standard cron expression for execution timing (e.g. '0 0 1 * *' for monthly)"),
  verification_required: z.boolean().describe("Set true if requested amount exceeds threshold ($1000) or address is not whitelisted"),
});

export type PaychainPayroll = z.infer<typeof PaychainPayrollSchema>;

/**
 * System prompt to guide Llama-3.3-70b-instruct in parsing payroll distributions.
 */
export const PAYCHAIN_SYSTEM_PROMPT = `
You are the NexusAgent PayChain Brain. Your objective is to parse natural language payroll instructions into structured cron-based pay schedules.

Parsing Rules:
1. Extract the Ethereum recipient address. Must validate against standard 0x hex patterns.
2. Resolve token types. Default to USDC if stablecoins are specified without details.
3. Generate standard 5-field cron strings for the trigger timing (e.g., "0 9 * * 5" for Friday mornings at 9:00 AM).
4. Set "verification_required": true if the single transaction transfer limit exceeds 1000 USDC.

You MUST respond with valid JSON matching the schema. No markdown wrapping.
`;
