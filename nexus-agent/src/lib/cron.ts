/**
 * Shared Cron Expression Parser for PayChain & DCA schedule modules.
 * Converts human language schedule phrases into standard 5-part cron expressions.
 */
export function parseCronFromMessage(message: string): string {
  const msgLower = message.toLowerCase();

  // Daily
  if (msgLower.includes("daily") || msgLower.includes("every day")) {
    return "0 9 * * *";
  }

  // Bi-weekly
  if (msgLower.includes("biweekly") || msgLower.includes("bi-weekly") || msgLower.includes("every 2 weeks")) {
    return "0 9 1,15 * *";
  }

  // Monthly
  if (msgLower.includes("monthly") || msgLower.includes("every month") || msgLower.includes("1st of")) {
    return "0 9 1 * *";
  }

  // Specific Day of Week
  if (msgLower.includes("monday")) return "0 9 * * 1";
  if (msgLower.includes("tuesday")) return "0 9 * * 2";
  if (msgLower.includes("wednesday")) return "0 9 * * 3";
  if (msgLower.includes("thursday")) return "0 9 * * 4";
  if (msgLower.includes("friday")) return "0 9 * * 5";
  if (msgLower.includes("saturday")) return "0 9 * * 6";
  if (msgLower.includes("sunday")) return "0 9 * * 0";

  // Default: Weekly on Monday at 9:00 AM UTC
  return "0 9 * * 1";
}

/**
 * Resolves a schedule candidate (natural language or cron string) into a valid 5-part cron expression.
 */
export function resolveCronSchedule(cronSchedule?: string, message?: string): string {
  const candidate = (cronSchedule || message || "").trim();
  if (!candidate) return "0 9 * * 1";
  // Already 5-field cron -> pass through
  if (/^\S+\s+\S+\s+\S+\s+\S+\s+\S+$/.test(candidate)) return candidate;
  return parseCronFromMessage(candidate);
}
