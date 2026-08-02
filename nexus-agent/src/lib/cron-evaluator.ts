/**
 * Pure 5-field Cron Expression Evaluator.
 * Checks if a standard 5-part cron expression ("min hour dom month dow") matches the target Date.
 * Handles exact numbers, wildcards (*), and comma lists (e.g. 1,15).
 */
export function shouldRunCronNow(cronExpression: string, now = new Date()): boolean {
  if (!cronExpression) {
    console.warn(`[CRON EVALUATOR] Invalid or missing cron expression — skipping.`);
    return false;
  }
  const parts = cronExpression.trim().split(/\s+/);
  if (parts.length !== 5) {
    console.warn(`[CRON EVALUATOR] Invalid cron expression: "${cronExpression}" — skipping.`);
    return false;
  }

  const [minRule, hourRule, domRule, monthRule, dowRule] = parts;

  const currentMin = now.getUTCMinutes();
  const currentHour = now.getUTCHours();
  const currentDom = now.getUTCDate();
  const currentMonth = now.getUTCMonth() + 1; // 1-12
  const currentDow = now.getUTCDay(); // 0-6 (0 = Sun)

  function matchField(rule: string, val: number): boolean {
    if (rule === "*") return true;
    if (rule.startsWith("*/")) {
      const step = parseInt(rule.slice(2), 10);
      if (!Number.isFinite(step) || step <= 0) return false;
      return val % step === 0;
    }
    const items = rule.split(",");
    for (const item of items) {
      if (item.trim() === String(val)) return true;
    }
    return false;
  }

  return (
    matchField(minRule, currentMin) &&
    matchField(hourRule, currentHour) &&
    matchField(domRule, currentDom) &&
    matchField(monthRule, currentMonth) &&
    matchField(dowRule, currentDow)
  );
}
