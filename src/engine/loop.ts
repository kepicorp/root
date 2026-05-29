// Turn / phase machine.
//
// Each faction's turn runs Birdsong → Daylight → Evening, then control passes
// to the next faction in factionOrder. After the last faction in the round,
// the global turn counter increments.

import { produce } from 'immer';
import type { GameState, Phase, Faction, CardSuit } from './types';
import { AUTUMN_MAP } from './map';

const PHASE_SEQUENCE: readonly Phase[] = ['birdsong', 'daylight', 'evening'];

export function startGame(state: GameState): GameState {
  return produce(state, draft => {
    if (draft.phase !== 'setup') return;
    draft.phase = 'birdsong';
    draft.activeIndex = 0;
    draft.log.push({
      turn: draft.turn,
      faction: 'system',
      message: `Game start: ${draft.factionOrder[0]} birdsong`,
    });
  });
}

export function advancePhase(state: GameState): GameState {
  return produce(state, draft => {
    if (draft.phase === 'setup' || draft.phase === 'gameOver') return;
    // Block advance if the active faction has unresolved pending state.
    if (draft.pendingOutrage) return;
    const active = draft.factionOrder[draft.activeIndex];
    const m = draft.factions.marquise;
    const e = draft.factions.eyrie;
    const al = draft.factions.alliance;
    const v = draft.factions.vagabond;
    if (active === 'marquise' && m && m.pendingDiscard > 0) return;
    if (active === 'eyrie' && e && e.pendingDiscard > 0) return;
    if (active === 'alliance' && al && al.pendingDiscard > 0) return;
    if (active === 'vagabond' && v && (v.pendingDiscard > 0 || v.pendingItemRemoval > 0 || v.pendingRelationshipCost || v.pendingAllyMove)) return;
    const i = PHASE_SEQUENCE.indexOf(draft.phase);
    if (i < 0) return;
    if (i < PHASE_SEQUENCE.length - 1) {
      draft.phase = PHASE_SEQUENCE[i + 1]!;
      const faction = draft.factionOrder[draft.activeIndex]!;
      draft.log.push({
        turn: draft.turn,
        faction: 'system',
        message: `${faction} → ${draft.phase}`,
      });
    } else {
      // End of evening → next faction's birdsong.
      draft.activeIndex = (draft.activeIndex + 1) % draft.factionOrder.length;
      if (draft.activeIndex === 0) draft.turn += 1;
      draft.phase = 'birdsong';
      const faction = draft.factionOrder[draft.activeIndex]!;
      draft.log.push({
        turn: draft.turn,
        faction: 'system',
        message: `${faction} begins birdsong (turn ${draft.turn})`,
      });
    }
  });
}

/** Skip directly to the next faction's birdsong. */
export function endTurn(state: GameState): GameState {
  return produce(state, draft => {
    if (draft.phase === 'setup' || draft.phase === 'gameOver') return;
    draft.activeIndex = (draft.activeIndex + 1) % draft.factionOrder.length;
    if (draft.activeIndex === 0) draft.turn += 1;
    draft.phase = 'birdsong';
    draft.log.push({
      turn: draft.turn,
      faction: 'system',
      message: `Now: ${draft.factionOrder[draft.activeIndex]} birdsong (turn ${draft.turn})`,
    });
  });
}

/** Active faction this turn. */
export function activeFaction(state: GameState) {
  return state.factionOrder[state.activeIndex]!;
}

/** Check victory conditions (30 VP triggers immediate end; other paths are
 *  handled by the dominance / coalition modules in later phases). */
/** Hook fired by every faction's finishXxxTurn helper just after the
 *  phase advances to a new faction's birdsong. Handles per-faction
 *  start-of-turn effects (Eyrie Emergency Orders is the only one in the
 *  base rules: if their hand is empty, draw 1 card before they have to
 *  add to the Decree). */
export function onEnterBirdsong(draft: GameState): void {
  // Clear per-turn context tracking at the top of each new turn.
  delete draft.lastMoveClearing;
  delete draft.lastBattleClearing;
  delete draft.wildCard;
  const active = draft.factionOrder[draft.activeIndex];
  if (active === 'eyrie' && draft.factions.eyrie && draft.hands.eyrie.length === 0) {
    const c = draft.deck.pop();
    if (c) {
      draft.hands.eyrie.push(c);
      draft.log.push({ turn: draft.turn, faction: 'eyrie', message: 'Emergency Orders: drew 1 card.' });
    }
  }
  if (active === 'vagabond' && draft.factions.vagabond) {
    const v = draft.factions.vagabond;
    const teaCount = v.items.filter(i => i.kind === 'tea' && i.state === 'face-up').length;
    // §9.3.2: player picks which exhausted items to flip face-up (3 + 2 per tea).
    v.pendingRefresh = 3 + 2 * teaCount;
    // Ensure daylight actions are ready before the player clicks "Start daylight".
    v.daylightActionsLeft = 6;
  }
}

export function checkVictory(state: GameState): GameState {
  if (state.winner) return state;
  // Dominance win — only checked at the start of the dominance-faction's
  // birdsong.
  if (state.dominance && state.phase === 'birdsong'
      && state.factionOrder[state.activeIndex] === state.dominance.faction) {
    if (factionMeetsDominance(state, state.dominance.faction, state.dominance.suit)) {
      return produce(state, draft => {
        draft.winner = { faction: draft.dominance!.faction, via: 'dominance' };
        draft.phase = 'gameOver';
        draft.log.push({
          turn: draft.turn,
          faction: 'system',
          message: `${draft.dominance!.faction} achieved dominance — victory!`,
        });
      });
    }
  }
  for (const f of state.factionOrder) {
    if (state.scores[f] >= 30) {
      return produce(state, draft => {
        draft.winner = { faction: f, via: 'points' };
        draft.phase = 'gameOver';
        draft.log.push({
          turn: draft.turn,
          faction: 'system',
          message: `${f} reached 30 VP — victory!`,
        });
      });
    }
  }
  return state;
}

/** Whether `faction` rules enough matching-suit clearings to win dominance. */
function factionMeetsDominance(state: GameState, faction: Faction, suit: CardSuit): boolean {
  const ruled = new Set<number>();
  for (const cl of Object.entries(state.map.clearings)) {
    const id = Number(cl[0]);
    if (factionRules(state, faction, id)) ruled.add(id);
  }
  if (suit === 'bird') {
    return (ruled.has(1) && ruled.has(12)) || (ruled.has(4) && ruled.has(9));
  }
  const matching = AUTUMN_MAP.clearings.filter(c => c.suit === suit).map(c => c.id);
  return matching.filter(id => ruled.has(id)).length >= 3;
}

/** Generic "X rules clearing C" — warriors + buildings of X must beat every other
 *  faction's total there. Per §2.5: tokens and pawns do not count toward rule. */
function factionRules(state: GameState, faction: Faction, clearing: number): boolean {
  const cl = state.map.clearings[clearing];
  if (!cl) return false;
  const score = (f: string) =>
    ((cl.warriors as Record<string, number | undefined>)[f] ?? 0)
    + cl.buildings.filter(b => b.faction === f).length;
  const mine = score(faction);
  if (mine <= 0) return false;
  for (const other of ['marquise', 'eyrie', 'alliance', 'vagabond'] as const) {
    if (other === faction) continue;
    if (score(other) >= mine) return false;
  }
  return true;
}
