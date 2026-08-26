import { describe, it, expect } from 'vitest';
import { newGame, reduce } from '../state';
import { getLegalActions } from '../legal';

describe('interactive setup flow', () => {
  it('starts with Marquise corner choice actions', () => {
    const s = newGame({ seed: 101 });
    const legal = getLegalActions(s);
    const corners = legal
      .filter((a): a is Extract<typeof a, { kind: 'marquise.setupChooseCorner' }> => a.kind === 'marquise.setupChooseCorner')
      .map((a) => a.clearing)
      .sort((a, b) => a - b);

    expect(s.phase).toBe('setup');
    expect(corners).toEqual([1, 3, 10, 12]);
  });

  it('applies setup choices and enters birdsong', () => {
    let s = newGame({ seed: 202 });

    s = reduce(s, { kind: 'marquise.setupChooseCorner', clearing: 3 });
    while (s.phase === 'setup' && s.setup?.order[s.setup.activeIndex] === 'marquise') {
      const legal = getLegalActions(s);
      const next = legal.find((a) => a.kind === 'marquise.setupPlaceBuilding');
      expect(next).toBeTruthy();
      s = reduce(s, next!);
    }

    let legal = getLegalActions(s);
    expect(legal.some((a) => a.kind === 'eyrie.setupChooseLeader')).toBe(true);
    s = reduce(s, { kind: 'eyrie.setupChooseLeader', leader: 'charismatic' });

    legal = getLegalActions(s);
    expect(legal).toEqual([{ kind: 'alliance.setupReady' }]);
    s = reduce(s, { kind: 'alliance.setupReady' });

    legal = getLegalActions(s);
    expect(legal.some((a) => a.kind === 'vagabond.setupChooseCharacter')).toBe(true);
    s = reduce(s, { kind: 'vagabond.setupChooseCharacter', character: 'ranger' });

    legal = getLegalActions(s);
    const ruinChoice = legal.find((a) => a.kind === 'vagabond.setupChooseRuin');
    expect(ruinChoice).toBeTruthy();
    s = reduce(s, ruinChoice!);

    expect(s.phase).toBe('birdsong');
    expect(s.factions.eyrie?.leader).toBe('charismatic');
    expect(s.factions.vagabond?.character).toBe('ranger');
    expect(s.factions.vagabond?.items.length).toBe(4);
  });
});
