import { z } from "zod";

export const IntentSchema = z.object({
  intents: z.array(
    z.object({
      type: z.enum([
        "payroll",
        "dca",
        "yield_rotate",
        "guardian",
        "query",
        "confirmation",
        "unknown"
      ]),
      confidence: z.number().min(0).max(1),
      parameters: z.record(z.any()).default({}),
      isFollowUp: z.boolean().default(false),
      followUpAction: z.enum(["confirm", "override", "cancel", "modify"]).optional(),
    })
  ),
  requiresContext: z.boolean().default(false),
  summary: z.string(),
});

export type ParsedIntents = z.infer<typeof IntentSchema>;

export const INTENT_PARSER_SYSTEM_PROMPT = `
You are the NexusAgent Natural Language Intent Parsing Brain. Your job is to analyze user messages and full conversation transcripts to extract all intended actions/workflows.

Rules:
1. FOLLOW-UPS & CONFIRMATIONS:
   - Phrases like "add it", "do it anyway", "override", "confirm", "yes", "go ahead", "force", "merge" are ALWAYS confirmation follow-up intents.
   - Set type: "confirmation", isFollowUp: true, followUpAction: "override" or "confirm".
2. MULTI-INTENT DETECTION:
   - If a prompt describes multiple workflows (e.g., "Pay John 100 USDC weekly and also DCA 50 USDC daily"), extract ALL of them as separate items in the intents array.
3. INFORMAL LANGUAGE MAPPING:
   - "pay", "payroll", "send USDC", "transfer regularly" -> type: "payroll"
   - "buy eth", "dca", "swap", "accumulate" -> type: "dca"
   - "rotate", "yield", "compound", "aave rate" -> type: "yield_rotate"
   - "protect", "loan", "health factor", "liquidation" -> type: "guardian"
   - "what is", "check status", "show position" -> type: "query"
4. PARAMETER EXTRACTION:
   - Extract recipient address, amounts, tokens, frequencies, target APYs whenever available.

You MUST respond with valid JSON matching the schema. No markdown wrapping.
`;
