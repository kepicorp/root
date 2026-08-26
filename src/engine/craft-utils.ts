import type { CardSuit } from './types';

/** Spend `cost` from `power` in-place. Returns false if there is not enough
 *  remaining power. Bird cost pips are wildcards that consume any remaining
 *  exact-suit power after exact requirements are paid. */
export function spendCraftCost(
  power: Partial<Record<CardSuit, number>>,
  cost: Partial<Record<string, number>>,
): boolean {
  const rem = power as Record<string, number>;
  for (const [s, n] of Object.entries(cost)) {
    if (s === 'bird') continue;
    const need = n as number;
    if ((rem[s] ?? 0) < need) return false;
    rem[s] = (rem[s] ?? 0) - need;
  }
  let birdNeed = (cost['bird'] ?? 0) as number;
  while (birdNeed > 0) {
    let pick: string | null = null;
    let best = 0;
    for (const suit of ['fox', 'mouse', 'rabbit', 'bird']) {
      const left = rem[suit] ?? 0;
      if (left > best) {
        best = left;
        pick = suit;
      }
    }
    if (!pick || best <= 0) return false;
    rem[pick] = best - 1;
    birdNeed -= 1;
  }
  return true;
}

/** Returns true if `power` can satisfy `cost`, treating 'bird' cost entries as
 *  wildcards that can be met by any remaining power after exact-suit costs are paid.
 *  §2.1.1: bird pips in a craft cost are wild. */
export function canMeetCraftCost(
  power: Partial<Record<CardSuit, number>>,
  cost: Partial<Record<string, number>>,
): boolean {
  const rem = { ...power } as Partial<Record<CardSuit, number>>;
  return spendCraftCost(rem, cost);
}
