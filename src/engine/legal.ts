// Aggregate legal actions across factions. The engine asks the active faction
// (and only the active faction) for its legal action set; each faction
// reducer module provides its own implementation.

import type { GameState, Action } from './types';
import { activeFaction } from './loop';
import { marquiseLegalActions } from './factions/marquise/reducer';
import { eyrieLegalActions } from './factions/eyrie/reducer';
import { allianceLegalActions } from './factions/alliance/reducer';
import { vagabondLegalActions } from './factions/vagabond/reducer';
import { defenderAmbushOptions } from './combat';

export function getLegalActions(state: GameState): Action[] {
  if (state.phase === 'setup' || state.phase === 'gameOver') return [];

  // When a prompt is pending, the respondent's response is the only legal
  // action — the game is paused until they answer.
  const prompt = state.pendingPrompts[0];
  if (prompt && prompt.kind === 'combat.defenderAmbush') {
    const payload = prompt.payload as { clearing: number };
    const ambushes = defenderAmbushOptions(state, payload.clearing, prompt.faction);
    const out: Action[] = [{ kind: 'combat.skipAmbush', faction: prompt.faction }];
    for (const cardId of ambushes) {
      out.push({ kind: 'combat.playAmbush', faction: prompt.faction, cardId });
    }
    return out;
  }

  const f = activeFaction(state);
  const factionActions =
    f === 'marquise' ? marquiseLegalActions(state) :
    f === 'eyrie'    ? eyrieLegalActions(state)    :
    f === 'alliance' ? allianceLegalActions(state) :
    f === 'vagabond' ? vagabondLegalActions(state) :
    [];
  // System actions are always available.
  return [
    { kind: 'system.advancePhase' },
    { kind: 'system.endTurn' },
    ...factionActions,
  ];
}
