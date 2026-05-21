// Orchestrates per-faction setup. Called once after newGame() before play begins.
//
// Setup order per Root rules:
//   1. Marquise picks corner, places initial board.
//   2. Eyrie picks diagonally opposite corner.
//   3. Alliance draws hand + 3 supporters (no board placement).
//   4. Vagabond places pawn in a ruin, picks character.
// After all setups, each faction draws to 3 cards.

import { produce } from 'immer';
import type { GameState } from './types';
import { setupMarquise } from './factions/marquise/setup';
import { setupEyrie } from './factions/eyrie/setup';
import { setupAlliance } from './factions/alliance/setup';
import { setupVagabond } from './factions/vagabond/setup';

export function performSetup(state: GameState): GameState {
  let s = state;
  if (s.factions.marquise) s = setupMarquise(s);
  if (s.factions.eyrie)    s = setupEyrie(s);
  if (s.factions.alliance) s = setupAlliance(s);
  if (s.factions.vagabond) s = setupVagabond(s);
  return produce(s, draft => {
    draft.log.push({
      turn: draft.turn,
      faction: 'system',
      message: 'Setup complete.',
    });
  });
}
