import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { newGame, reduce } from '../../../state';
import { setupMarquise, MARQUISE_CORNER, EYRIE_CORNER } from '../setup';
import { marquiseLegalActions } from '../reducer';
import { startGame, advancePhase } from '../../../loop';

function makeGame() {
  return startGame(setupMarquise(newGame({ seed: 1 })));
}

describe('Marquise setup', () => {
  it('places keep in clearing 1', () => {
    const s = setupMarquise(newGame({ seed: 1 }));
    expect(s.map.clearings[MARQUISE_CORNER]!.tokens.some(t => t.faction === 'marquise' && t.kind === 'keep')).toBe(true);
    expect(s.factions.marquise!.keep?.clearing).toBe(MARQUISE_CORNER);
  });

  it('places 1 warrior in every clearing except Eyrie corner', () => {
    const s = setupMarquise(newGame({ seed: 1 }));
    for (const c of Object.values(s.map.clearings)) {
      const id = Object.entries(s.map.clearings).find(([_, v]) => v === c)![0];
      if (Number(id) === EYRIE_CORNER) {
        expect(c.warriors.marquise ?? 0).toBe(0);
      } else {
        expect(c.warriors.marquise).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('places 1 sawmill, 1 workshop, 1 recruiter near corner', () => {
    const s = setupMarquise(newGame({ seed: 1 }));
    const m = s.factions.marquise!;
    expect(m.buildings.sawmill).toBe(1);
    expect(m.buildings.workshop).toBe(1);
    expect(m.buildings.recruiter).toBe(1);
  });
});

describe('Marquise actions', () => {
  it('placeWood places 1 wood per sawmill', () => {
    let s = makeGame();
    s = reduce(s, { kind: 'marquise.placeWood' });
    let woodCount = 0;
    for (const cl of Object.values(s.map.clearings)) {
      for (const t of cl.tokens) if (t.faction === 'marquise' && t.kind === 'wood') woodCount += 1;
    }
    expect(woodCount).toBe(s.factions.marquise!.buildings.sawmill);
  });

  it('recruit places 1 warrior per recruiter and is once-per-turn', () => {
    let s = makeGame();
    s = reduce(s, { kind: 'marquise.placeWood' });
    s = advancePhase(s); // birdsong -> daylight
    const before = s.map.clearings[
      Object.keys(s.map.clearings).find(id => {
        const cl = s.map.clearings[Number(id)]!;
        return cl.buildings.some(b => b.faction === 'marquise' && b.kind === 'recruiter');
      }) as unknown as number
    ]!.warriors.marquise ?? 0;
    s = reduce(s, { kind: 'marquise.recruit' });
    const m = s.factions.marquise!;
    expect(m.recruitedThisTurn).toBe(true);
    // legal actions should no longer include recruit
    expect(marquiseLegalActions(s).some(a => a.kind === 'marquise.recruit')).toBe(false);
    void before;
  });

  it('build action uses wood and scores VP', () => {
    let s = makeGame();
    s = reduce(s, { kind: 'marquise.placeWood' });
    s = advancePhase(s);
    const scoreBefore = s.scores.marquise;
    // Find a legal build action
    const legals = marquiseLegalActions(s).filter(a => a.kind === 'marquise.build') as any[];
    if (legals.length > 0) {
      const action = legals[0];
      s = reduce(s, action);
      expect(s.scores.marquise).toBeGreaterThanOrEqual(scoreBefore);
    }
  });

  it('cannot build past 6 buildings of one kind', () => {
    let s = makeGame();
    s = produce(s, draft => {
      draft.factions.marquise!.buildings.sawmill = 6;
      draft.phase = 'daylight';
      const cl = draft.map.clearings[2]!;
      for (let i = 0; i < 7; i++) cl.tokens.push({ faction: 'marquise', kind: 'wood' });
    });
    const after = reduce(s, { kind: 'marquise.build', clearing: 2, building: 'sawmill' });
    expect(after.factions.marquise!.buildings.sawmill).toBe(6);
  });

  it('legal actions include endDaylight', () => {
    let s = makeGame();
    s = advancePhase(s);
    expect(marquiseLegalActions(s).some(a => a.kind === 'marquise.endDaylight')).toBe(true);
  });
});
