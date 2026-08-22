import { describe, expect, it } from 'vitest';
import { runOne, runMany, runOneFromSnapshotText } from '../runner';
import { newGame } from '../../engine/state';
import { performSetup } from '../../engine/setup';
import { startGame } from '../../engine/loop';
import { buildStateSnapshot, serializeStateSnapshot } from '../../engine/stateSnapshot';

describe('sim runner (default policy)', () => {
  it('runs without crashing', () => {
    const r = runOne({ seed: 1, turnCap: 20 });
    expect(r.ended).not.toBe('crashed');
  });

  it('is deterministic for a given seed', () => {
    const a = runOne({ seed: 42, turnCap: 10 });
    const b = runOne({ seed: 42, turnCap: 10 });
    expect(a.turns).toBe(b.turns);
    expect(a.finalScores).toEqual(b.finalScores);
  });

  it('runMany produces an aggregate report', () => {
    const r = runMany({ count: 5, seedStart: 1, turnCap: 10 });
    expect(r.games).toBe(5);
    expect(r.crashes).toBe(0);
  });

  it('can resume from a saved snapshot text file', () => {
    const started = startGame(performSetup(newGame({ seed: 77 })));
    const text = serializeStateSnapshot(buildStateSnapshot(started, { source: 'offline', playerFaction: 'marquise' }));
    const a = runOneFromSnapshotText(text, { turnCap: 10 });
    const b = runOneFromSnapshotText(text, { turnCap: 10 });
    expect(a.ended).not.toBe('crashed');
    expect(a.finalScores).toEqual(b.finalScores);
    expect(a.turns).toBe(b.turns);
  });
});
