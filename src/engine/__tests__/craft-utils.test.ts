import { describe, expect, it } from 'vitest';
import { canMeetCraftCost, spendCraftCost } from '../craft-utils';

describe('craft-utils', () => {
  it('bird cost consumes remaining suit power', () => {
    const power = { mouse: 1, fox: 0, rabbit: 0 } as const;
    const rem = { ...power };
    expect(spendCraftCost(rem, { bird: 1 })).toBe(true);
    expect(rem.mouse).toBe(0);
    expect(canMeetCraftCost(rem, { mouse: 1 })).toBe(false);
  });

  it('exact suit requirements are still strict', () => {
    expect(canMeetCraftCost({ fox: 1, rabbit: 2 }, { mouse: 1 })).toBe(false);
    expect(canMeetCraftCost({ mouse: 1 }, { mouse: 1 })).toBe(true);
  });

  it('bird card suit does not override recipe suit cost', () => {
    // Example: Sappers is a bird card, but recipe is mouse x1.
    expect(canMeetCraftCost({ fox: 1 }, { mouse: 1 })).toBe(false);
    expect(canMeetCraftCost({ mouse: 1 }, { mouse: 1 })).toBe(true);
  });
});
