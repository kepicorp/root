import type { CardSuit } from './types';

/** Returns true if `power` can satisfy `cost`, treating 'bird' cost entries as
 *  wildcards that can be met by any remaining power after exact-suit costs are paid.
 *  §2.1.1: bird pips in a craft cost are wild. */
export function canMeetCraftCost(
  power: Partial<Record<CardSuit, number>>,
  cost: Partial<Record<string, number>>,
): boolean {
  const rem = { ...power } as Record<string, number>;
  // First satisfy exact-suit requirements.
  for (const [s, n] of Object.entries(cost)) {
    if (s === 'bird') continue;
    const need = n as number;
    if ((rem[s] ?? 0) < need) return false;
    rem[s] = (rem[s] ?? 0) - need;
  }
  // Then satisfy bird (wildcard) requirements from remaining power of any suit.
  const birdCost = (cost['bird'] ?? 0) as number;
  if (birdCost > 0) {
    const totalRemaining = Object.values(rem).reduce((a, b) => a + (b as number), 0);
    if (totalRemaining < birdCost) return false;
  }
  return true;
}
