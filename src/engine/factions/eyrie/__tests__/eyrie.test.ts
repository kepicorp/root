import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { newGame, reduce } from '../../../state';
import { startGame } from '../../../loop';
import { getLegalActions } from '../../../legal';
import { performSetup } from '../../../setup';
import { setupEyrie, EYRIE_CORNER } from '../setup';
import type { DecreeSlot } from '../state';
import { eyrieRules } from '../decree';

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

  it('logs the suit and card name when adding to decree', () => {
    let s = makeEyrieGame();
    s = reduce(s, { kind: 'eyrie.chooseLeader', leader: 'charismatic' });
    s = {
      ...s,
      phase: 'birdsong',
      hands: {
        ...s.hands,
        eyrie: ['c1'],
      },
      factions: {
        ...s.factions,
        eyrie: {
          ...s.factions.eyrie!,
          needsLeaderChoice: false,
          cardsAddedThisBirdsong: 0,
          birdCardsAddedThisBirdsong: 0,
        },
      },
    };

    const next = reduce(s, { kind: 'eyrie.addToDecree', slot: 'recruit', cardId: 'c1' });
    const lastLog = next.log[next.log.length - 1];
    expect(lastLog?.faction).toBe('eyrie');
    expect(lastLog?.message).toBe('Added fox card Ambush! (fox) to recruit decree.');
  });

  it('allows at most one bird-suit decree add per birdsong', () => {
    let s = makeEyrieGame();
    s = reduce(s, { kind: 'eyrie.chooseLeader', leader: 'charismatic' });
    s = {
      ...s,
      phase: 'birdsong',
      hands: {
        ...s.hands,
        eyrie: ['c4', 'c5', 'c1'],
      },
      factions: {
        ...s.factions,
        eyrie: {
          ...s.factions.eyrie!,
          needsLeaderChoice: false,
          cardsAddedThisBirdsong: 0,
          birdCardsAddedThisBirdsong: 0,
        },
      },
    };

    const afterFirstBird = reduce(s, { kind: 'eyrie.addToDecree', slot: 'move', cardId: 'c4' });
    const birdAdds = afterFirstBird.factions.eyrie!.birdCardsAddedThisBirdsong;
    expect(birdAdds).toBe(1);

    const birdAddLegals = getLegalActions(afterFirstBird)
      .filter(a => a.kind === 'eyrie.addToDecree' && a.cardId === 'c5');
    expect(birdAddLegals.length).toBe(0);

    const afterSecondBirdAttempt = reduce(afterFirstBird, { kind: 'eyrie.addToDecree', slot: 'battle', cardId: 'c5' });
    expect(afterSecondBirdAttempt).toBe(afterFirstBird);

    const afterFoxAdd = reduce(afterFirstBird, { kind: 'eyrie.addToDecree', slot: 'battle', cardId: 'c1' });
    expect(afterFoxAdd).not.toBe(afterFirstBird);
    expect(afterFoxAdd.factions.eyrie!.cardsAddedThisBirdsong).toBe(2);
  });

  it('queues a defender ambush prompt before resolving eyrie battle', () => {
    let s = startGame(performSetup(newGame({ seed: 7, factions: ['marquise', 'eyrie'] })));
    s = produce(s, (draft) => {
      draft.phase = 'daylight';
      draft.activeIndex = draft.factionOrder.indexOf('eyrie');
      draft.hands.marquise = ['c3'];
      draft.factions.eyrie!.decree = { recruit: [], move: [], battle: ['c32'], build: [] };
      draft.factions.eyrie!.resolutionLeft = { recruit: 0, move: 0, battle: 1, build: 0 };
      draft.map.clearings[12]!.warriors.eyrie = 3;
      draft.map.clearings[12]!.warriors.marquise = 1;
    });

    const next = reduce(s, { kind: 'eyrie.executeBattle', clearing: 12, defender: 'marquise' });

    expect(next.pendingPrompts[0]?.kind).toBe('combat.defenderAmbush');
    expect(next.pendingPrompts[0]?.faction).toBe('marquise');
    expect(next.battleOverlay?.status).toBe('defender-ambush-prompt');
    expect(next.hands.marquise).toContain('c3');
  });

  it('rules when tied for presence if eyrie warriors are at least the tied factions', () => {
    let s = makeEyrieGame();
    s = produce(s, draft => {
      const cl = draft.map.clearings[3]!;
      cl.warriors.eyrie = 2;
      cl.warriors.marquise = 2;
      cl.buildings = cl.buildings.filter(b => b.faction !== 'eyrie' && b.faction !== 'marquise');
    });
    expect(eyrieRules(s, 3)).toBe(true);
  });

  it('does not rule tie if eyrie has fewer warriors than tied faction', () => {
    let s = makeEyrieGame();
    s = produce(s, draft => {
      const cl = draft.map.clearings[3]!;
      cl.warriors.eyrie = 1;
      cl.warriors.marquise = 2;
      cl.buildings.push({ faction: 'eyrie', kind: 'roost' });
      // Presence tie at 2 each, but eyrie warriors are fewer.
      cl.buildings = cl.buildings.filter((b, i) => b.faction !== 'marquise' || i !== 0);
    });
    expect(eyrieRules(s, 3)).toBe(false);
  });

  it('does not rule tie without eyrie warriors present', () => {
    let s = makeEyrieGame();
    s = produce(s, draft => {
      const cl = draft.map.clearings[3]!;
      cl.warriors.eyrie = 0;
      cl.warriors.marquise = 1;
      cl.buildings.push({ faction: 'eyrie', kind: 'roost' });
      // Presence tie at 1 each, but eyrie has no warriors present.
      cl.buildings = cl.buildings.filter((b, i) => b.faction !== 'marquise' || i !== 0);
    });
    expect(eyrieRules(s, 3)).toBe(false);
  });
});
