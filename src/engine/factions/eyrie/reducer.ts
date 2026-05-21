import { produce } from 'immer';
import type { GameState, Action, ClearingId } from '../../types';
import type { CardId } from '../../cards';
import { getCard } from '../../cards';
import { AUTUMN_MAP, getAdjacent } from '../../map';
import { resolveCombat } from '../../combat';
import { ROOST_VP_TRACK, type EyrieLeader, type DecreeSlot } from './state';
import type { EyrieAction } from './actions';

function isEyrieTurn(state: GameState): boolean {
  return state.factionOrder[state.activeIndex] === 'eyrie';
}

function rules(state: GameState, clearing: ClearingId): boolean {
  const cl = state.map.clearings[clearing];
  if (!cl) return false;
  const counts: Record<string, number> = {};
  for (const [f, w] of Object.entries(cl.warriors)) counts[f] = (counts[f] ?? 0) + (w ?? 0);
  for (const b of cl.buildings) counts[b.faction] = (counts[b.faction] ?? 0) + 1;
  for (const t of cl.tokens) counts[t.faction] = (counts[t.faction] ?? 0) + 1;
  const mine = counts.eyrie ?? 0;
  let topOther = 0;
  for (const [f, n] of Object.entries(counts)) {
    if (f !== 'eyrie' && n > topOther) topOther = n;
  }
  return mine > 0 && mine > topOther;
}

function suitMatches(cardSuit: string, clearingSuit: string): boolean {
  return cardSuit === 'bird' || cardSuit === clearingSuit;
}

/** Find a clearing where the Eyrie can perform an action for a slot card. */
function findSlotTarget(state: GameState, slot: DecreeSlot, cardId: CardId): ClearingId | null {
  const cardSuit = getCard(cardId).suit;
  for (const c of AUTUMN_MAP.clearings) {
    if (!suitMatches(cardSuit, c.suit)) continue;
    const cl = state.map.clearings[c.id]!;
    if (slot === 'recruit') {
      const hasRoost = cl.buildings.some(b => b.faction === 'eyrie' && b.kind === 'roost');
      if (hasRoost && (state.factions.eyrie?.warriorSupply ?? 0) > 0) return c.id;
    } else if (slot === 'move') {
      if ((cl.warriors.eyrie ?? 0) > 0) {
        for (const nb of getAdjacent(AUTUMN_MAP, c.id)) {
          if (rules(state, c.id) || rules(state, nb)) return c.id;
        }
      }
    } else if (slot === 'battle') {
      if ((cl.warriors.eyrie ?? 0) > 0) {
        for (const f of ['marquise', 'alliance', 'vagabond'] as const) {
          if ((cl.warriors[f] ?? 0) > 0 || cl.buildings.some(b => b.faction === f) || cl.tokens.some(t => t.faction === f)) {
            return c.id;
          }
        }
      }
    } else if (slot === 'build') {
      if (!rules(state, c.id)) continue;
      const usedSlots = cl.buildings.length + cl.tokens.filter(t => t.kind === 'keep').length;
      if (usedSlots < c.buildingSlots && (state.factions.eyrie?.roosts.length ?? 0) < 7) return c.id;
    }
  }
  return null;
}

const NEXT_LEADER: Record<EyrieLeader, EyrieLeader> = {
  despot: 'commander', commander: 'charismatic', charismatic: 'builder', builder: 'despot',
};

export function eyrieReducer(state: GameState, action: Action): GameState {
  if (!action.kind.startsWith('eyrie.')) return state;
  if (!isEyrieTurn(state)) return state;
  const a = action as EyrieAction;

  switch (a.kind) {
    case 'eyrie.chooseLeader':
      return produce(state, draft => {
        const e = draft.factions.eyrie!;
        e.leader = a.leader;
        draft.log.push({ turn: draft.turn, faction: 'eyrie', message: `Leader: ${a.leader}.` });
      });

    case 'eyrie.addToDecree':
      return produce(state, draft => {
        const e = draft.factions.eyrie!;
        if (draft.phase !== 'birdsong') return;
        const idx = draft.hands.eyrie.indexOf(a.cardId);
        if (idx < 0) return;
        draft.hands.eyrie.splice(idx, 1);
        e.decree[a.slot].push(a.cardId);
      });

    case 'eyrie.endBirdsong':
      return produce(state, draft => {
        draft.factions.eyrie!.birdsongDone = true;
        draft.phase = 'daylight';
      });

    case 'eyrie.resolveDecree': {
      let s = state;
      if (s.phase !== 'daylight') return s;
      const e = s.factions.eyrie!;
      if (e.decreeResolved) return s;
      let failed = false;
      const slots: DecreeSlot[] = ['recruit', 'move', 'battle', 'build'];
      for (const slot of slots) {
        if (failed) break;
        for (const cardId of e.decree[slot]) {
          const target = findSlotTarget(s, slot, cardId);
          if (target == null) { failed = true; break; }
          s = produce(s, draft => {
            const cl = draft.map.clearings[target]!;
            const ee = draft.factions.eyrie!;
            if (slot === 'recruit') {
              cl.warriors.eyrie = (cl.warriors.eyrie ?? 0) + 1;
              ee.warriorSupply -= 1;
            } else if (slot === 'move') {
              const adj = getAdjacent(AUTUMN_MAP, target);
              const dest = adj[0]!;
              const moving = Math.min(cl.warriors.eyrie ?? 0, 1);
              cl.warriors.eyrie = (cl.warriors.eyrie ?? 0) - moving;
              draft.map.clearings[dest]!.warriors.eyrie =
                (draft.map.clearings[dest]!.warriors.eyrie ?? 0) + moving;
            } else if (slot === 'build') {
              cl.buildings.push({ faction: 'eyrie', kind: 'roost' });
              ee.roosts.push(target);
            }
          });
          if (slot === 'battle') {
            // pick first eligible enemy
            const cl = s.map.clearings[target]!;
            const enemy =
              (['marquise', 'alliance', 'vagabond'] as const).find(f =>
                (cl.warriors[f] ?? 0) > 0 || cl.buildings.some(b => b.faction === f) || cl.tokens.some(t => t.faction === f),
              );
            if (!enemy) { failed = true; break; }
            s = resolveCombat(s, { clearing: target, attacker: 'eyrie', defender: enemy });
          }
        }
      }
      return produce(s, draft => {
        const e2 = draft.factions.eyrie!;
        if (failed) {
          // Turmoil
          let vpLost = 0;
          for (const slot of slots) {
            const keep: CardId[] = [];
            for (const id of e2.decree[slot]) {
              if (e2.viziers.includes(id)) keep.push(id);
              else {
                if (getCard(id).suit === 'bird') vpLost += 1;
                draft.discard.push(id);
              }
            }
            e2.decree[slot] = keep;
          }
          draft.scores.eyrie = Math.max(0, draft.scores.eyrie - vpLost);
          if (e2.usedLeaders.length >= 3) e2.usedLeaders = [];
          e2.usedLeaders.push(e2.leader);
          e2.leader = NEXT_LEADER[e2.leader];
          // Re-place viziers (simple: move + battle slots)
          e2.decree = { recruit: [], move: [], battle: [], build: [] };
          if (e2.viziers[0]) e2.decree.move.push(e2.viziers[0]);
          if (e2.viziers[1]) e2.decree.battle.push(e2.viziers[1]);
          draft.log.push({
            turn: draft.turn,
            faction: 'eyrie',
            message: `Turmoil! lost ${vpLost} VP. New leader: ${e2.leader}.`,
          });
        } else {
          draft.log.push({ turn: draft.turn, faction: 'eyrie', message: 'Decree resolved.' });
        }
        e2.decreeResolved = true;
        draft.phase = 'evening';
      });
    }

    case 'eyrie.evening':
      return produce(state, draft => {
        if (draft.phase !== 'evening') return;
        const e = draft.factions.eyrie!;
        // Score VP per roost count.
        const vp = ROOST_VP_TRACK[Math.min(e.roosts.length, ROOST_VP_TRACK.length - 1)] ?? 0;
        draft.scores.eyrie += vp;
        // Draw 1 + bonus per 3 roosts
        const draws = 1 + Math.floor(e.roosts.length / 3);
        for (let i = 0; i < draws; i++) {
          const c = draft.deck.pop();
          if (!c) break;
          draft.hands.eyrie.push(c);
        }
        while (draft.hands.eyrie.length > 5) {
          const c = draft.hands.eyrie.shift()!;
          draft.discard.push(c);
        }
        // Reset turn flags.
        e.birdsongDone = false;
        e.decreeResolved = false;
        e.eveningDone = true;
        // Advance.
        draft.activeIndex = (draft.activeIndex + 1) % draft.factionOrder.length;
        if (draft.activeIndex === 0) draft.turn += 1;
        draft.phase = 'birdsong';
        draft.log.push({ turn: draft.turn, faction: 'eyrie', message: `Evening: scored ${vp} VP, drew ${draws}.` });
      });

    default:
      return state;
  }
}

export function eyrieLegalActions(state: GameState): Action[] {
  if (!isEyrieTurn(state)) return [];
  const out: Action[] = [];
  const e = state.factions.eyrie;
  if (!e) return out;
  if (state.phase === 'birdsong') {
    for (const cardId of state.hands.eyrie) {
      for (const slot of ['recruit', 'move', 'battle', 'build'] as const) {
        out.push({ kind: 'eyrie.addToDecree', slot, cardId });
      }
    }
    out.push({ kind: 'eyrie.endBirdsong' });
  }
  if (state.phase === 'daylight' && !e.decreeResolved) {
    out.push({ kind: 'eyrie.resolveDecree' });
  }
  if (state.phase === 'evening') {
    out.push({ kind: 'eyrie.evening' });
  }
  return out;
}
