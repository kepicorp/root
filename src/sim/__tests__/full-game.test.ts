import { describe, expect, it } from 'vitest';
import { runOne } from '../runner';
import { pickAction } from '../../bots/bot';
import type { Action } from '../../engine/types';

describe('full bot-vs-bot game', () => {
  it('completes a few hundred steps without crashing', () => {
    const r = runOne({
      seed: 1,
      turnCap: 100,
      policy: (s) => (pickAction(s) ?? ({ kind: 'system.advancePhase' } as Action)),
    });
    expect(r.ended).not.toBe('crashed');
    expect(r.steps).toBeGreaterThan(0);
  });

  it('multiple seeds all complete without crashing', () => {
    for (let seed = 1; seed <= 5; seed++) {
      const r = runOne({
        seed,
        turnCap: 50,
        policy: (s) => (pickAction(s) ?? ({ kind: 'system.advancePhase' } as Action)),
      });
      expect(r.ended).not.toBe('crashed');
    }
  });
});
