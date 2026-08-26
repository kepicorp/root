import { describe, expect, it } from 'vitest';
import { newGame } from '../../../state';
import { performSetup } from '../../../setup';
import { startGame } from '../../../loop';
import { BASE_SHARED_DECK } from '../../../cards';
import { allianceLegalActions } from '../reducer';
import { AUTUMN_MAP } from '../../../map';

function makeAllianceGame() {
  return startGame(performSetup(newGame({ seed: 11, factions: ['alliance'] })));
}

describe('Alliance setup and legality', () => {
  it('draws 3 supporters during setup and starts with no bases or sympathy', () => {
    const s = makeAllianceGame();
    expect(s.factions.alliance!.supporters).toHaveLength(3);
    expect(s.factions.alliance!.bases).toEqual({});
    expect(s.factions.alliance!.sympathy).toEqual([]);
  });

  it('offers sympathy spread in birdsong when it has enough matching supporters', () => {
    const foxCard = BASE_SHARED_DECK.find(c => c.suit === 'fox' && c.category !== 'dominance')!;
    const target = AUTUMN_MAP.clearings.find(c => c.suit === 'fox' && c.id !== 1) ?? AUTUMN_MAP.clearings.find(c => c.suit === 'fox')!;

    const s = produceAllianceState({
      phase: 'birdsong',
      activeIndex: 0,
      supporters: [foxCard.id],
      sympathy: [],
      bases: {},
      clearing: target.id,
    });

    const actions = allianceLegalActions(s);
    expect(actions.some(a => a.kind === 'alliance.spreadSympathy' && a.clearing === target.id)).toBe(true);
  });

  it('trains officers only with a matching base-suit or bird card in daylight', () => {
    const foxCard = BASE_SHARED_DECK.find(c => c.suit === 'fox' && c.category !== 'dominance')!;
    const mouseCard = BASE_SHARED_DECK.find(c => c.suit === 'mouse' && c.category !== 'dominance')!;
    const birdCard = BASE_SHARED_DECK.find(c => c.suit === 'bird' && c.category !== 'dominance')!;

    const s = produceAllianceState({
      phase: 'daylight',
      activeIndex: 0,
      supporters: [],
      sympathy: [],
      bases: { fox: 5 },
      hand: [foxCard.id, mouseCard.id, birdCard.id],
    });

    const actions = allianceLegalActions(s);
    expect(actions.some(a => a.kind === 'alliance.trainOfficer' && a.cardId === foxCard.id)).toBe(true);
    expect(actions.some(a => a.kind === 'alliance.trainOfficer' && a.cardId === birdCard.id)).toBe(true);
    expect(actions.some(a => a.kind === 'alliance.trainOfficer' && a.cardId === mouseCard.id)).toBe(false);
  });
});

function produceAllianceState(opts: {
  phase: 'birdsong' | 'daylight';
  activeIndex: number;
  supporters: string[];
  sympathy: number[];
  bases: Record<string, number>;
  hand?: string[];
  clearing?: number;
}) {
  const base = makeAllianceGame();
  return {
    ...base,
    phase: opts.phase,
    activeIndex: opts.activeIndex,
    factionOrder: ['alliance'],
    factions: {
      ...base.factions,
      alliance: {
        ...base.factions.alliance!,
        supporters: opts.supporters,
        sympathy: opts.sympathy,
        bases: opts.bases,
        officers: 1,
        daylightActionsLeft: 1,
      },
    },
    hands: {
      ...base.hands,
      alliance: opts.hand ?? base.hands.alliance,
    },
    map: {
      ...base.map,
      clearings: Object.fromEntries(Object.entries(base.map.clearings).map(([id, cl]) => [id, {
        ...cl,
        warriors: { ...cl.warriors, alliance: 1 },
      }])),
    },
  } as any;
}
