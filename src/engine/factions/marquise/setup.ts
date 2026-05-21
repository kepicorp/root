// Marquise setup. Phase 2 fills this in.
//
// Per Root rules:
//   • Place keep in your chosen corner clearing.
//   • Place 1 warrior in every clearing except the diagonally opposite corner.
//   • Place 1 sawmill, 1 workshop, 1 recruiter — one each in your home or
//     adjacent clearings (1 building per clearing).
//   • Draw 3 cards.

import type { GameState } from '../../types';

export function setupMarquise(state: GameState): GameState {
  return state; // Phase 2 will implement.
}

/** The corner clearing the Marquise occupies. */
export const MARQUISE_CORNER = 1;
