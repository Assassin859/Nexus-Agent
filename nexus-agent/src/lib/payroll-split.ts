/**
 * Calculates exact USDC transfer amounts per team member.
 * Distributes remainder cents to the final team member (e.g. $100 / 3 => [33, 33, 34]).
 */
export function splitTeamPayroll(totalAmount: number, memberCount: number): number[] {
  if (memberCount <= 0 || totalAmount <= 0) return [];
  const baseAmount = Math.floor(totalAmount / memberCount);
  const remainderCents = totalAmount - (baseAmount * memberCount);
  const result = new Array(memberCount).fill(baseAmount);
  if (result.length > 0) {
    result[result.length - 1] += remainderCents;
  }
  return result;
}
