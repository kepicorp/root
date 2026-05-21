import { create } from 'zustand';
import type { GameState, Action, Faction } from '../engine/types';
import { newGame, reduce } from '../engine/state';
import { startGame, checkVictory } from '../engine/loop';
import { performSetup } from '../engine/setup';
import { checkCoalitionVictory } from '../engine/factions/vagabond/reducer';
import { playUntilHuman } from '../bots/bot';

interface Store {
  state: GameState;
  playerFaction: Faction | null;
  dispatch: (action: Action) => void;
  /** Run AI turns until it's the human's turn (or game over). */
  autoPlayAI: () => void;
  reset: (seed?: number) => void;
  begin: (faction: Faction) => void;
}

const initial = newGame({ seed: 1 });

function postAction(s: GameState): GameState {
  return checkCoalitionVictory(checkVictory(s));
}

export const useGame = create<Store>((set) => ({
  state: initial,
  playerFaction: null,
  dispatch: (action) => set((s) => {
    let next = postAction(reduce(s.state, action));
    // Auto-play AI factions after the human's action.
    next = playUntilHuman(next, (st, a) => postAction(reduce(st, a)), s.playerFaction);
    return { state: next };
  }),
  autoPlayAI: () => set((s) => {
    const next = playUntilHuman(s.state, (st, a) => postAction(reduce(st, a)), s.playerFaction);
    return { state: next };
  }),
  reset: (seed) => set({ state: newGame({ seed }), playerFaction: null }),
  begin: (faction) => set((s) => {
    let next = startGame(performSetup(s.state));
    // If the human isn't the first faction, run AI turns until human's turn.
    next = playUntilHuman(next, (st, a) => postAction(reduce(st, a)), faction);
    return { state: next, playerFaction: faction };
  }),
}));
