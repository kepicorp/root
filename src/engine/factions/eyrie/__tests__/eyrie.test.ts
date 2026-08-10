import { describe, expect, it } from 'vitest';
import { newGame, reduce } from '../../../state';
import { startGame } from '../../../loop';
import { setupEyrie, EYRIE_CORNER } from '../setup';
import type { DecreeSlot } from '../state';

function makeEyrieGame() {
  return startGame(setupEyrie(newGame({ seed: 7, factions: ['eyrie'] })));
}

function decreeCountsForViziers(state: ReturnType<typeof makeEyrieGame>): Record<DecreeSlot, number> {
  const e = state.factions.eyrie!;
  const viziers = new Set(e.viziers);
  return {
    recruit: e.decree.recruit.filter(id => viziers.has(id)).length,
    move: e.decree.move.filter(id => viziers.has(id)).length,
    battle: e.decree.battle.filter(id => viziers.has(id)).length,
    build: e.decree.build.filter(id => viziers.has(id)).length,
  };
}

describe('Eyrie decree rules', () => {
  it('placing leader re-seats loyal viziers in the leader slots', () => {
    let s = makeEyrieGame();
    s = reduce(s, { kind: 'eyrie.chooseLeader', leader: 'charismatic' });
    const counts = decreeCountsForViziers(s);
    expect(counts).toEqual({ recruit: 1, move: 0, battle: 1, build: 0 });
  });

  it('charismatic recruit places 2 warriors when executing recruit', () => {
    let s = makeEyrieGame();
    s = reduce(s, { kind: 'eyrie.chooseLeader', leader: 'charismatic' });
    s = {
      ...s,
      phase: 'daylight',
      factions: {
        ...s.factions,
        eyrie: {
          ...s.factions.eyrie!,
          needsLeaderChoice: false,
        },
      },
    };

    const before = s.map.clearings[EYRIE_CORNER]!.warriors.eyrie ?? 0;
    const legal = s.factions.eyrie && s.phase === 'daylight';
    expect(legal).toBe(true);

    const next = reduce(s, { kind: 'eyrie.executeRecruit', clearing: EYRIE_CORNER });
    const after = next.map.clearings[EYRIE_CORNER]!.warriors.eyrie ?? 0;
    expect(after - before).toBe(2);
    expect(next.factions.eyrie!.warriorSupply).toBe(s.factions.eyrie!.warriorSupply - 2);
  });

  it('charismatic recruit also places 2 warriors during auto-resolve', () => {
    let s = makeEyrieGame();
    s = reduce(s, { kind: 'eyrie.chooseLeader', leader: 'charismatic' });
    s = {
      ...s,
      phase: 'daylight',
      factions: {
        ...s.factions,
        eyrie: {
          ...s.factions.eyrie!,
          needsLeaderChoice: false,
        },
      },
    };

    const before = s.map.clearings[EYRIE_CORNER]!.warriors.eyrie ?? 0;
    const next = reduce(s, { kind: 'eyrie.resolveDecree' });
    const after = next.map.clearings[EYRIE_CORNER]!.warriors.eyrie ?? 0;

    expect(after - before).toBe(2);
  });
});
