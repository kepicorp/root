// Vagabond setup. Phase 5 fills this in.
//
// Per Root rules:
//   • Choose a character (Thief / Tinker / Ranger).
//   • Place pawn in any clearing with a ruin.
//   • Gain starting items per character (face-up, unexhausted):
//       - Thief: torch, boots, tea, sword
//       - Tinker: torch, boots, bag, hammer
//       - Ranger: torch, boots, sword, crossbow
//   • Place 4 ruins on map (face-down item under each); on explore, gain
//     the item and 1 VP.
//   • Initialize relationships: indifferent with every non-Vagabond faction.
//   • Draw 3 cards.

import type { GameState } from '../../types';

export function setupVagabond(state: GameState): GameState {
  return state; // Phase 5 will implement.
}
