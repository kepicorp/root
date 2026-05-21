// Zustand store wrapping the pure engine. The UI reads `state` and calls
// `dispatch(action)` to advance; the store re-runs the reducer and stores
// the new state.

import { create } from 'zustand';
import type { GameState, Action, Faction } from '../engine/types';
import { newGame, reduce } from '../engine/state';
import { startGame } from '../engine/loop';

interface Store {
  state: GameState;
  playerFaction: Faction | null;       // which faction the human is playing
  dispatch: (action: Action) => void;
  reset: (seed?: number) => void;
  begin: (faction: Faction) => void;
}

const initial = newGame({ seed: 1 });

export const useGame = create<Store>((set) => ({
  state: initial,
  playerFaction: null,
  dispatch: (action) => set((s) => ({ state: reduce(s.state, action) })),
  reset: (seed) => set({ state: newGame({ seed }), playerFaction: null }),
  begin: (faction) => set((s) => ({
    state: startGame(s.state),
    playerFaction: faction,
  })),
}));
