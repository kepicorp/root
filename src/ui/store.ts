import { create } from 'zustand';
import { produce } from 'immer';
import type { GameState, Action, Faction } from '../engine/types';
import { newGame, reduce } from '../engine/state';
import { startGame, checkVictory } from '../engine/loop';
import { performSetup } from '../engine/setup';
import { checkCoalitionVictory } from '../engine/factions/vagabond/reducer';
import type { VagabondCharacter } from '../engine/factions/vagabond/state';
import { STARTING_ITEMS } from '../engine/factions/vagabond/state';
import { playUntilHuman } from '../bots/bot';

interface BeginOptions {
  vagabondCharacter?: VagabondCharacter;
}

interface Store {
  state: GameState;
  playerFaction: Faction | null;
  dispatch: (action: Action) => void;
  autoPlayAI: () => void;
  reset: (seed?: number) => void;
  begin: (faction: Faction, opts?: BeginOptions) => void;
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
    next = playUntilHuman(next, (st, a) => postAction(reduce(st, a)), s.playerFaction);
    return { state: next };
  }),
  autoPlayAI: () => set((s) => {
    const next = playUntilHuman(s.state, (st, a) => postAction(reduce(st, a)), s.playerFaction);
    return { state: next };
  }),
  reset: (seed) => set({ state: newGame({ seed }), playerFaction: null }),
  begin: (faction, opts) => set((s) => {
    // Optionally set Vagabond character before setup runs.
    let base = s.state;
    if (opts?.vagabondCharacter) {
      base = produce(base, draft => {
        if (draft.factions.vagabond) {
          draft.factions.vagabond.character = opts.vagabondCharacter!;
          draft.factions.vagabond.items = [];
          for (const kind of STARTING_ITEMS[opts.vagabondCharacter!]) {
            draft.factions.vagabond.items.push({ kind, state: 'face-up', exhausted: false });
          }
        }
      });
    }
    let next = startGame(performSetup(base));
    next = playUntilHuman(next, (st, a) => postAction(reduce(st, a)), faction);
    return { state: next, playerFaction: faction };
  }),
}));
