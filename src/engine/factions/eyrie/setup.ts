// Eyrie setup. Phase 3 fills this in.
//
// Per Root rules:
//   • Place 1 roost in your corner clearing (diagonally opposite Marquise).
//     If Marquise has a warrior there, remove it. Place 6 warriors there.
//   • Choose a leader; place 2 random bird-suit cards face-up as viziers
//     under your faction board (they remain in your decree permanently).
//   • Place starting decree cards per the leader.
//   • Draw 3 cards.

import type { GameState } from '../../types';

export function setupEyrie(state: GameState): GameState {
  return state; // Phase 3 will implement.
}

export const EYRIE_CORNER = 12;
