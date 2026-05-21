import { produce } from 'immer';
import type { GameState, Action, ClearingId, Faction, ItemKind } from '../../types';
import { getCard } from '../../cards';
import { AUTUMN_MAP, getAdjacent } from '../../map';
import type { VagabondAction } from './actions';
import type { Relationship } from './state';

function isVagabondTurn(state: GameState): boolean {
  return state.factionOrder[state.activeIndex] === 'vagabond';
}

const REL_LADDER: Relationship[] = ['indifferent', 1, 2, 3, 'allied'];

function findItem(items: { kind: ItemKind; state: string; exhausted: boolean }[], kind: ItemKind) {
  return items.find(i => i.kind === kind && i.state === 'face-up' && !i.exhausted);
}

function exhaustItem(items: { kind: ItemKind; state: string; exhausted: boolean }[], kind: ItemKind): boolean {
  const it = findItem(items, kind);
  if (!it) return false;
  it.exhausted = true;
  return true;
}

function bumpRelationship(rel: Relationship): Relationship {
  if (rel === 'hostile') return 'hostile';
  const idx = REL_LADDER.indexOf(rel);
  if (idx < 0 || idx === REL_LADDER.length - 1) return rel;
  return REL_LADDER[idx + 1]!;
}

function returnWarriors(draft: GameState, clearing: ClearingId, faction: Faction, n: number): void {
  const cl = draft.map.clearings[clearing]!;
  cl.warriors[faction] = Math.max(0, (cl.warriors[faction] ?? 0) - n);
  if (faction === 'marquise' && draft.factions.marquise) draft.factions.marquise.warriorSupply += n;
  else if (faction === 'eyrie' && draft.factions.eyrie) draft.factions.eyrie.warriorSupply += n;
  else if (faction === 'alliance' && draft.factions.alliance) draft.factions.alliance.warriorSupply += n;
}

export function vagabondReducer(state: GameState, action: Action): GameState {
  if (!action.kind.startsWith('vagabond.')) return state;
  if (!isVagabondTurn(state)) return state;
  const a = action as VagabondAction;

  switch (a.kind) {
    case 'vagabond.slip':
      return produce(state, draft => {
        if (draft.phase !== 'birdsong') return;
        const v = draft.factions.vagabond!;
        if (!getAdjacent(AUTUMN_MAP, v.clearing).includes(a.to)) return;
        draft.map.clearings[v.clearing]!.vagabondHere = false;
        v.clearing = a.to;
        draft.map.clearings[a.to]!.vagabondHere = true;
        v.slipped = true;
      });

    case 'vagabond.refresh':
      return produce(state, draft => {
        if (draft.phase !== 'birdsong') return;
        const v = draft.factions.vagabond!;
        const teaCount = v.items.filter(i => i.kind === 'tea' && i.state === 'face-up').length;
        let toRefresh = 3 + teaCount;
        for (const it of v.items) {
          if (toRefresh <= 0) break;
          if (it.exhausted && it.state === 'face-up') {
            it.exhausted = false;
            toRefresh -= 1;
          }
        }
        draft.phase = 'daylight';
      });

    case 'vagabond.move':
      return produce(state, draft => {
        if (draft.phase !== 'daylight') return;
        const v = draft.factions.vagabond!;
        if (v.daylightActionsLeft <= 0) return;
        if (!getAdjacent(AUTUMN_MAP, v.clearing).includes(a.to)) return;
        if (!exhaustItem(v.items, 'boots')) return;
        // Hostile destination: exhaust extra boots
        const destCl = draft.map.clearings[a.to]!;
        const hostilePresent = (['marquise', 'eyrie', 'alliance'] as const).some(f => {
          const rel = v.relationships[f];
          return (rel !== 'allied') && (destCl.warriors[f] ?? 0) > 0;
        });
        if (hostilePresent) {
          if (!exhaustItem(v.items, 'boots')) return;
        }
        draft.map.clearings[v.clearing]!.vagabondHere = false;
        v.clearing = a.to;
        draft.map.clearings[a.to]!.vagabondHere = true;
        v.daylightActionsLeft -= 1;
      });

    case 'vagabond.exploreRuin':
      return produce(state, draft => {
        if (draft.phase !== 'daylight') return;
        const v = draft.factions.vagabond!;
        if (v.daylightActionsLeft <= 0) return;
        const meta = AUTUMN_MAP.clearings.find(c => c.id === v.clearing)!;
        if (!meta.hasRuin) return;
        if (!exhaustItem(v.items, 'torch')) return;
        // Treat ruin as removed; we don't track removal on Clearing state, so use a flag in vagabond state.
        v.ruinsExplored += 1;
        // Gain a face-down item from the supply (just take next available).
        const itemKind: ItemKind | undefined = draft.itemSupply.shift();
        if (itemKind) v.items.push({ kind: itemKind, state: 'face-down', exhausted: false });
        draft.scores.vagabond += 1;
        v.daylightActionsLeft -= 1;
        draft.log.push({ turn: draft.turn, faction: 'vagabond', message: `Explored ruin in ${v.clearing} (+1 VP).` });
      });

    case 'vagabond.aid':
      return produce(state, draft => {
        if (draft.phase !== 'daylight') return;
        const v = draft.factions.vagabond!;
        if (v.daylightActionsLeft <= 0) return;
        const meta = AUTUMN_MAP.clearings.find(c => c.id === v.clearing)!;
        const card = getCard(a.cardId);
        if (card.suit !== meta.suit && card.suit !== 'bird') return;
        // Recipient must have warriors in clearing
        const cl = draft.map.clearings[v.clearing]!;
        if ((cl.warriors[a.faction] ?? 0) <= 0) return;
        const idx = draft.hands.vagabond.indexOf(a.cardId);
        if (idx < 0) return;
        draft.hands.vagabond.splice(idx, 1);
        draft.hands[a.faction].push(a.cardId);
        v.relationships[a.faction] = bumpRelationship(v.relationships[a.faction]);
        v.daylightActionsLeft -= 1;
        draft.log.push({ turn: draft.turn, faction: 'vagabond', message: `Aided ${a.faction}; relationship → ${v.relationships[a.faction]}.` });
      });

    case 'vagabond.strike':
      return produce(state, draft => {
        if (draft.phase !== 'daylight') return;
        const v = draft.factions.vagabond!;
        if (v.daylightActionsLeft <= 0) return;
        if (a.clearing !== v.clearing) return;
        if (v.relationships[a.faction] === 'allied') return;
        if (!exhaustItem(v.items, 'crossbow')) return;
        const cl = draft.map.clearings[v.clearing]!;
        if ((cl.warriors[a.faction] ?? 0) <= 0) return;
        returnWarriors(draft, v.clearing, a.faction, 1);
        // +1 VP if hostile target
        if (v.relationships[a.faction] === 'hostile') draft.scores.vagabond += 1;
        v.daylightActionsLeft -= 1;
      });

    case 'vagabond.repair':
      return produce(state, draft => {
        if (draft.phase !== 'daylight') return;
        const v = draft.factions.vagabond!;
        if (!exhaustItem(v.items, 'hammer')) return;
        const damaged = v.items.find(i => i.state === 'damaged');
        if (!damaged) return;
        damaged.state = 'face-up';
      });

    case 'vagabond.endDaylight':
      return produce(state, draft => {
        if (draft.phase !== 'daylight') return;
        draft.factions.vagabond!.daylightActionsLeft = 0;
        draft.phase = 'evening';
      });

    case 'vagabond.evening':
      return produce(state, draft => {
        if (draft.phase !== 'evening') return;
        const v = draft.factions.vagabond!;
        const coinCount = v.items.filter(i => i.kind === 'coin' && i.state === 'face-up').length;
        const draws = 1 + coinCount;
        for (let i = 0; i < draws; i++) {
          const c = draft.deck.pop();
          if (!c) break;
          draft.hands.vagabond.push(c);
        }
        const bagCount = v.items.filter(i => i.kind === 'bag' && i.state === 'face-up').length;
        while (draft.hands.vagabond.length > 5 + bagCount) {
          const c = draft.hands.vagabond.shift()!;
          draft.discard.push(c);
        }
        v.slipped = false;
        v.daylightActionsLeft = 6;
        draft.activeIndex = (draft.activeIndex + 1) % draft.factionOrder.length;
        if (draft.activeIndex === 0) draft.turn += 1;
        draft.phase = 'birdsong';
        draft.log.push({ turn: draft.turn, faction: 'vagabond', message: `Evening: drew ${draws}.` });
      });

    default:
      return state;
  }
}

export function vagabondLegalActions(state: GameState): Action[] {
  if (!isVagabondTurn(state)) return [];
  const out: Action[] = [];
  const v = state.factions.vagabond;
  if (!v) return out;

  if (state.phase === 'birdsong') {
    out.push({ kind: 'vagabond.refresh' });
    for (const nb of getAdjacent(AUTUMN_MAP, v.clearing)) {
      out.push({ kind: 'vagabond.slip', to: nb });
    }
  }
  if (state.phase === 'daylight' && v.daylightActionsLeft > 0) {
    // Move
    if (findItem(v.items, 'boots')) {
      for (const nb of getAdjacent(AUTUMN_MAP, v.clearing)) {
        out.push({ kind: 'vagabond.move', to: nb });
      }
    }
    // Explore
    const meta = AUTUMN_MAP.clearings.find(c => c.id === v.clearing)!;
    if (meta.hasRuin && findItem(v.items, 'torch') && v.ruinsExplored < 4) {
      out.push({ kind: 'vagabond.exploreRuin' });
    }
    // Aid
    const cl = state.map.clearings[v.clearing]!;
    for (const cardId of state.hands.vagabond) {
      const card = getCard(cardId);
      if (card.suit !== meta.suit && card.suit !== 'bird') continue;
      for (const f of ['marquise', 'eyrie', 'alliance'] as const) {
        if ((cl.warriors[f] ?? 0) > 0) out.push({ kind: 'vagabond.aid', faction: f, cardId });
      }
    }
    // Strike
    if (findItem(v.items, 'crossbow')) {
      for (const f of ['marquise', 'eyrie', 'alliance'] as const) {
        if (v.relationships[f] === 'allied') continue;
        if ((cl.warriors[f] ?? 0) > 0) out.push({ kind: 'vagabond.strike', clearing: v.clearing, faction: f });
      }
    }
    // Repair
    if (findItem(v.items, 'hammer') && v.items.some(i => i.state === 'damaged')) {
      const damaged = v.items.find(i => i.state === 'damaged')!;
      out.push({ kind: 'vagabond.repair', itemKind: damaged.kind });
    }
  }
  if (state.phase === 'daylight') out.push({ kind: 'vagabond.endDaylight' });
  if (state.phase === 'evening') out.push({ kind: 'vagabond.evening' });
  return out;
}

/** Coalition victory check: called whenever scores change. */
export function checkCoalitionVictory(state: GameState): GameState {
  if (state.winner) return state;
  const v = state.factions.vagabond;
  if (!v?.coalitionPartner) return state;
  if (state.scores[v.coalitionPartner] >= 30) {
    return produce(state, draft => {
      draft.winner = { faction: 'vagabond', via: 'coalition' };
      draft.phase = 'gameOver';
    });
  }
  return state;
}
