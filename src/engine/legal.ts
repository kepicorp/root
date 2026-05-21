// Aggregate legal actions across factions. The engine asks the active faction
// (and only the active faction) for its legal action set; each faction
// reducer module provides its own implementation.

import type { GameState, Action } from './types';
import { activeFaction } from './loop';
import { marquiseLegalActions } from './factions/marquise/reducer';
import { eyrieLegalActions } from './factions/eyrie/reducer';
import { allianceLegalActions } from './factions/alliance/reducer';
import { vagabondLegalActions } from './factions/vagabond/reducer';

export function getLegalActions(state: GameState): Action[] {
  if (state.phase === 'setup' || state.phase === 'gameOver') return [];
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
