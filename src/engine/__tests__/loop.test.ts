import { describe, expect, it } from 'vitest';
import { newGame } from '../state';
import { startGame, advancePhase, activeFaction } from '../loop';

describe('turn / phase loop', () => {
  it('starts the first faction in birdsong', () => {
    const s = startGame(newGame({ seed: 1 }));
    expect(s.phase).toBe('birdsong');
    expect(s.turn).toBe(1);
    expect(activeFaction(s)).toBe(s.factionOrder[0]);
  });

  it('rotates birdsong → daylight → evening → next faction', () => {
    let s = startGame(newGame({ seed: 1 }));
    expect(s.phase).toBe('birdsong');
    s = advancePhase(s);
    expect(s.phase).toBe('daylight');
    s = advancePhase(s);
    expect(s.phase).toBe('evening');
    s = advancePhase(s);
    expect(s.phase).toBe('birdsong');
    expect(s.activeIndex).toBe(1);
  });

  it('increments turn when wrapping past the last faction', () => {
    let s = startGame(newGame({ seed: 1 }));
    const totalSteps = s.factionOrder.length * 3; // birdsong/daylight/evening per faction
    for (let i = 0; i < totalSteps; i++) s = advancePhase(s);
    expect(s.turn).toBe(2);
    expect(s.activeIndex).toBe(0);
    expect(s.phase).toBe('birdsong');
  });
});
