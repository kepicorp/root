import { describe, expect, it } from 'vitest';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BASE_SHARED_DECK } from '../cards';
import { newGame, reduce } from '../state';
import { startGame, advancePhase, activeFaction, checkVictory } from '../loop';
import { getLegalActions } from '../legal';
import { ActionBar } from '../../ui/ActionBar';

function cardIdByName(name: string): string {
  const card = BASE_SHARED_DECK.find((x) => x.name === name);
  if (!card) throw new Error(`Missing card in base deck: ${name}`);
  return card.id;
}

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
    s = {
      ...s,
      factions: {
        ...s.factions,
        eyrie: {
          ...s.factions.eyrie!,
          needsLeaderChoice: false,
        },
      },
    };
    const totalSteps = s.factionOrder.length * 3; // birdsong/daylight/evening per faction
    for (let i = 0; i < totalSteps; i++) s = advancePhase(s);
    expect(s.turn).toBe(2);
    expect(s.activeIndex).toBe(0);
    expect(s.phase).toBe('birdsong');
  });

  it('only exposes actions for the active faction plus system actions', () => {
    const s = startGame(newGame({ seed: 42 }));
    const active = activeFaction(s);
    const legal = getLegalActions(s);

    expect(legal.some(a => a.kind === 'system.advancePhase')).toBe(true);
    expect(legal.some(a => a.kind === 'system.endTurn')).toBe(true);

    expect(legal.every((action) => {
      if (action.kind === 'system.advancePhase' || action.kind === 'system.endTurn') return true;
      if ('faction' in action) return action.faction === active;
      return true;
    })).toBe(true);
  });

  it('blocks system actions while the active Eyrie is still choosing a leader', () => {
    let s = startGame(newGame({ seed: 7 }));
    s = {
      ...s,
      activeIndex: s.factionOrder.indexOf('eyrie'),
      phase: 'birdsong',
      factions: {
        ...s.factions,
        eyrie: {
          ...s.factions.eyrie!,
          needsLeaderChoice: true,
        },
      },
    };

    expect(getLegalActions(s).some(a => a.kind === 'system.advancePhase')).toBe(false);
    expect(getLegalActions(s).some(a => a.kind === 'system.endTurn')).toBe(false);
    expect(advancePhase(s)).toBe(s);
  });

  it('blocks system actions while the active Vagabond still has refresh picks to resolve', () => {
    let s = startGame(newGame({ seed: 11 }));
    s = {
      ...s,
      activeIndex: s.factionOrder.indexOf('vagabond'),
      phase: 'birdsong',
      factions: {
        ...s.factions,
        vagabond: {
          ...s.factions.vagabond!,
          pendingRefresh: 2,
        },
      },
    };

    expect(getLegalActions(s).some(a => a.kind === 'system.advancePhase')).toBe(false);
    expect(getLegalActions(s).some(a => a.kind === 'system.endTurn')).toBe(false);
    expect(advancePhase(s)).toBe(s);
  });

  it('shows the Vagabond daylight action counter in the action bar during daylight', () => {
    let s = startGame(newGame({ seed: 5 }));
    s = {
      ...s,
      activeIndex: s.factionOrder.indexOf('vagabond'),
      phase: 'daylight',
      factions: {
        ...s.factions,
        vagabond: {
          ...s.factions.vagabond!,
          daylightActionsLeft: 4,
        },
      },
    };

    const html = renderToStaticMarkup(
      React.createElement(ActionBar, {
        state: s,
        playerFaction: 'vagabond',
        dispatch: () => {},
        mapIntent: null,
        setMapIntent: () => {},
      }),
    );

    expect(html).toContain('Actions left:');
    expect(html).toContain('4');
  });

  it('blocks phase advance while a combat prompt is still pending', () => {
    const foxAmbush = cardIdByName('Ambush! (fox)');
    let s = startGame(newGame({ seed: 321 }));
    s = {
      ...s,
      hands: {
        ...s.hands,
        eyrie: [foxAmbush],
      },
      map: {
        clearings: {
          ...s.map.clearings,
          1: {
            warriors: { marquise: 3, eyrie: 2 },
            buildings: [],
            tokens: [],
            vagabondHere: false,
          },
        },
      },
    };

    const prompted = reduce(s, {
      kind: 'combat.declare',
      clearing: 1,
      attacker: 'marquise',
      defender: 'eyrie',
    });

    expect(prompted.pendingPrompts.length).toBeGreaterThan(0);
    expect(getLegalActions(prompted).some(a => a.kind === 'system.advancePhase')).toBe(false);
    expect(advancePhase(prompted)).toBe(prompted);
    expect(reduce(prompted, { kind: 'system.endTurn' })).toBe(prompted);
  });

  it('rejects invalid action payloads without mutating state', () => {
    const base = startGame(newGame({ seed: 99 }));
    const invalid = {
      kind: 'combat.declare',
      clearing: -1,
      attacker: 'marquise',
      defender: 'eyrie',
    } as any;

    const next = reduce(base, invalid);
    expect(next).toBe(base);
  });

  it('rejects battle declarations when the attacker has no warriors in the clearing', () => {
    const base = startGame(newGame({ seed: 100 }));
    const next = reduce(base, {
      kind: 'combat.declare',
      clearing: 1,
      attacker: 'marquise',
      defender: 'eyrie',
    });

    expect(next).toBe(base);
  });

  it('limits legal actions during a defender ambush prompt to valid ambush responses', () => {
    const foxAmbush = cardIdByName('Ambush! (fox)');
    const mouseAmbush = cardIdByName('Ambush! (mouse)');
    let s = startGame(newGame({ seed: 123 }));
    s = {
      ...s,
      hands: {
        ...s.hands,
        eyrie: [foxAmbush, mouseAmbush],
      },
      map: {
        clearings: {
          ...s.map.clearings,
          1: {
            warriors: { marquise: 3, eyrie: 2 },
            buildings: [],
            tokens: [],
            vagabondHere: false,
          },
        },
      },
    };

    const prompted = reduce(s, {
      kind: 'combat.declare',
      clearing: 1,
      attacker: 'marquise',
      defender: 'eyrie',
    });

    const legal = getLegalActions(prompted);
    expect(legal).toContainEqual({ kind: 'combat.skipAmbush', faction: 'eyrie' });
    expect(legal).toContainEqual({ kind: 'combat.playAmbush', faction: 'eyrie', cardId: foxAmbush });
    expect(legal).not.toContainEqual({ kind: 'combat.playAmbush', faction: 'eyrie', cardId: mouseAmbush });
  });

  it('limits legal actions during a counter-ambush prompt to matching attacker responses', () => {
    const foxAmbush = cardIdByName('Ambush! (fox)');
    const mouseAmbush = cardIdByName('Ambush! (mouse)');
    let s = startGame(newGame({ seed: 456 }));
    s = {
      ...s,
      hands: {
        ...s.hands,
        marquise: [foxAmbush, mouseAmbush],
        eyrie: [foxAmbush],
      },
      map: {
        clearings: {
          ...s.map.clearings,
          1: {
            warriors: { marquise: 2, eyrie: 3 },
            buildings: [],
            tokens: [],
            vagabondHere: false,
          },
        },
      },
    };

    let prompted = reduce(s, {
      kind: 'combat.declare',
      clearing: 1,
      attacker: 'marquise',
      defender: 'eyrie',
    });
    prompted = reduce(prompted, {
      kind: 'combat.playAmbush',
      faction: 'eyrie',
      cardId: foxAmbush,
    });

    const legal = getLegalActions(prompted);
    expect(legal).toContainEqual({ kind: 'combat.skipAmbush', faction: 'marquise' });
    expect(legal).toContainEqual({ kind: 'combat.playAmbush', faction: 'marquise', cardId: foxAmbush });
    expect(legal).not.toContainEqual({ kind: 'combat.playAmbush', faction: 'marquise', cardId: mouseAmbush });
  });

  it('renders ambush responses once, not duplicated in the generic action list', () => {
    const foxAmbush = cardIdByName('Ambush! (fox)');
    let s = startGame(newGame({ seed: 999 }));
    s = {
      ...s,
      hands: {
        ...s.hands,
        eyrie: [foxAmbush],
      },
      map: {
        clearings: {
          ...s.map.clearings,
          1: {
            warriors: { marquise: 3, eyrie: 2 },
            buildings: [],
            tokens: [],
            vagabondHere: false,
          },
        },
      },
    };

    const prompted = reduce(s, {
      kind: 'combat.declare',
      clearing: 1,
      attacker: 'marquise',
      defender: 'eyrie',
    });

    const html = renderToStaticMarkup(
      React.createElement(ActionBar, {
        state: prompted,
        playerFaction: 'eyrie',
        dispatch: () => {},
        mapIntent: null,
        setMapIntent: () => {},
      }),
    );

    expect((html.match(/Skip Ambush/g) ?? []).length).toBe(1);
    expect((html.match(/Play .*Ambush/g) ?? []).length).toBe(1);
    expect(html).not.toContain('End daylight');
    expect(html).not.toContain('Your turn');
  });

  it('declares a winner when a faction reaches 30 VP', () => {
    let s = startGame(newGame({ seed: 321 }));
    s = {
      ...s,
      scores: {
        ...s.scores,
        marquise: 30,
      },
    };

    const next = checkVictory(s);
    expect(next.winner).toEqual({ faction: 'marquise', via: 'points' });
    expect(next.phase).toBe('gameOver');
  });

  it('locks the UI and legal actions after a winner is declared', () => {
    let s = startGame(newGame({ seed: 321 }));
    s = {
      ...s,
      phase: 'gameOver',
      winner: { faction: 'marquise', via: 'points' },
      scores: {
        ...s.scores,
        marquise: 30,
      },
    };

    expect(getLegalActions(s)).toEqual([]);

    const html = renderToStaticMarkup(
      React.createElement(ActionBar, {
        state: s,
        playerFaction: 'marquise',
        dispatch: () => {},
        mapIntent: null,
        setMapIntent: () => {},
      }),
    );

    expect(html).toContain('Game over');
    expect(html).not.toContain('Your turn');
    expect(html).not.toContain('Skip Ambush');
  });

  it('locks the state after a winner is declared', () => {
    let s = startGame(newGame({ seed: 654 }));
    s = {
      ...s,
      winner: { faction: 'eyrie', via: 'points' },
      phase: 'gameOver',
      scores: {
        ...s.scores,
        eyrie: 30,
      },
    };

    const next = reduce(s, { kind: 'system.advancePhase' });
    expect(next).toBe(s);
    const nextTurn = reduce(s, { kind: 'marquise.placeWood' });
    expect(nextTurn).toBe(s);
  });
});
