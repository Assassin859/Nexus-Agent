import { generateObject } from "ai";
import { z } from "zod";
import { githubModels, BRAIN_MODEL } from "./provider.js";

// ── NLU Output Schema ────────────────────────────────────────────────────────
// The canonical structured output produced by Stage 1 (NLU Translator).
// Stage 2 (Execution Router in index.ts) consumes this — never raw user text.
export const NLUOutputSchema = z.object({
  action: z.enum([
    "schedule_payroll",      // "pay alice 20 USDC every friday"
    "cancel_payroll",        // "stop", "cancel payroll", "pause all payments"
    "list_payees",           // "who are my payees?", "show team members"
    "list_workflows",        // "what are my workflows?", "active payrolls?"
    "query_portfolio",       // "health factor", "my debt", "collateral"
    "trigger_dca",           // "do DCA", "buy ETH", "swap now"
    "trigger_guardian",      // "check my loan", "liquidation risk"
    "trigger_yield_rotate",  // "rotate yield", "optimize APY", "compound"
    "confirm_action",        // "yes", "confirm", "ok", "do it", "proceed"
    "unknown",               // greetings, unrelated, ambiguous
  ]),
  parameters: z.object({
    recipient: z.string().optional(),        // name (e.g. "alice") or 0x address
    amount: z.number().optional(),           // numeric amount
    token: z.string().default("USDC"),       // USDC, ETH, etc.
    schedule: z.string().optional(),         // "every Friday", "daily at 9am"
    isOverride: z.boolean().default(false),  // true if user is force-confirming
  }),
  // Clean English re-statement of the user's intent — passed to executors
  normalizedPrompt: z.string(),
  // 0.0–1.0 confidence in the classification
  confidence: z.number().min(0).max(1),
  // If true, the agent should ask a clarifying question back
  requiresClarification: z.boolean().default(false),
  // The question to ask if requiresClarification is true
  clarificationQuestion: z.string().optional(),
});

export type NLUOutput = z.infer<typeof NLUOutputSchema>;

// ── NLU Translator System Prompt ─────────────────────────────────────────────
const NLU_SYSTEM_PROMPT = `
You are the NexusAgent NLU Translator. Your ONLY job is to translate raw, messy user input into a clean, structured canonical output.

You are Stage 1 of a two-stage pipeline. You do NOT execute anything — you only understand and classify.

=== ACTION MAPPING ===

"schedule_payroll":
  - Keywords: pay, send, transfer, payroll, salary, wages
  - Patterns: "pay [name/address] [amount] [token] [schedule]"
  - Examples: "pay alice 50 USDC every friday", "send 0x123... 20 every monday", "set up payroll for dev team"

"cancel_payroll":
  - Keywords: stop, cancel, cancle, cancal, stopp, pause, disable, delete, kill, remove
  - Context: related to payments, payroll, workflows, schedules, or general cancellation ("cancle all", "stop all", "cancel")
  - Examples: "stop all payrolls", "cancel the payment", "pause everything", "kill all scheduled payments", "cancle all", "cancel all"

"list_payees":
  - Keywords: payees, team members, who can I pay, recipients, my contacts
  - Examples: "show me my payees", "who are my team members", "list payees"

"list_workflows":
  - Keywords: workflow, workflows, active payrolls, schedules, what's running, active payments, my workflows, my workflow
  - Examples: "what are my workflows", "what are my workflow", "show active payrolls", "current payroll status", "show workflows"

"query_portfolio":
  - Keywords: health factor, debt, collateral, position, aave, balance, how much
  - Examples: "what's my health factor", "check my loan", "how much collateral do I have"

"trigger_dca":
  - Keywords: dca, buy, swap, accumulate, purchase
  - Examples: "do DCA now", "buy ETH", "swap USDC to ETH"

"trigger_guardian":
  - Keywords: guardian, protect, liquidation, loan, borrow, health check
  - Examples: "run guardian", "check liquidation risk", "protect my position"

"trigger_yield_rotate":
  - Keywords: yield, rotate, compound, optimize, APY, interest rate
  - Examples: "rotate yield", "optimize my APY", "find better rate"

"confirm_action":
  - CRITICAL: Use this if the prior conversation shows the agent proposed an action and the user is now agreeing.
  - Keywords: yes, ok, confirm, proceed, do it, go ahead, sure, correct, that's right, yep, override, force
  - Typo-tolerant: "yse", "conrfim", "yep", "confirrm" → still confirm_action
  - Set isOverride: true if user says "force", "override", "do it anyway", "just do it"

"unknown":
  - Greetings: "hello", "hi", "hey"
  - Unrelated: weather, general questions not about DeFi/payments
  - Genuinely ambiguous with no context clues
  - Set requiresClarification: true and provide a clarificationQuestion

=== NORMALIZATION RULES ===

1. TYPO CORRECTION: Correct obvious typos before classifying. "frday"→"Friday", "conrfim"→"confirm", "paey"→"pay"
2. AMOUNTS: Extract numeric values. "50 bucks" → amount: 50. "20 USD" → amount: 20, token: "USDC"
3. SCHEDULES: Normalize to English schedule. "every fri" → "every Friday at 09:00 UTC"
4. ADDRESSES: If a 0x address is present, put it in recipient. If a name is present, put the name.
5. CONTEXT: Use the full conversation history to understand follow-ups. If agent proposed a payroll and user says "yes" → confirm_action.
6. CONFIDENCE: Set confidence < 0.6 if the user message is very short (< 3 words) without clear context.

=== normalizedPrompt FORMAT ===
Write a clean, unambiguous English instruction as if briefing a financial operations team. Be specific.

Examples:
- "Schedule a recurring payroll of 20 USDC to recipient 'alice', every Friday at 09:00 UTC"
- "Cancel all active payroll workflows for this wallet immediately"
- "User is confirming the payroll action proposed in the previous assistant message (override mode: false)"
- "List all registered payee entries for this wallet"
- "Query current Aave position: health factor, total collateral USD, total debt USD"
- "Trigger the DCA swap strategy immediately for this wallet"

=== IMPORTANT ===
- You MUST always respond with valid JSON matching the schema exactly.
- Never return markdown, code blocks, or prose — only JSON.
- When requiresClarification is true, set action to "unknown" and provide clarificationQuestion.
`;

// ── Main Translate Function ───────────────────────────────────────────────────
/**
 * Stage 1: NLU Translator
 * Converts raw user input → clean canonical NLUOutput.
 * Called by /api/chat before any execution logic.
 */
export async function translateIntent(
  userMessage: string,
  conversationHistory: Array<{ sender: string; text: string }>,
  walletAddress: string,
): Promise<NLUOutput> {
  // Build conversation context for the LLM
  const recentHistory = conversationHistory
    .slice(-8) // Last 8 messages for context window efficiency
    .map((m) => `${m.sender === "user" ? "User" : "Agent"}: ${m.text}`)
    .join("\n");

  const prompt = JSON.stringify({
    userMessage,
    conversationHistory: recentHistory,
    walletAddress,
    timestamp: new Date().toISOString(),
  });

  try {
    const result = await generateObject({
      model: githubModels(BRAIN_MODEL),
      schema: NLUOutputSchema,
      system: NLU_SYSTEM_PROMPT,
      prompt,
    });
    return result.object;
  } catch (err) {
    console.error("[NLU] Translation failed, using safe fallback:", err);
    // Safe fallback: treat as unknown so the router can handle gracefully
    return {
      action: "unknown",
      parameters: { token: "USDC", isOverride: false },
      normalizedPrompt: `User sent: "${userMessage}"`,
      confidence: 0.1,
      requiresClarification: false,
    };
  }
}
