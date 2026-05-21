// Zustand store that mirrors the local game store but is driven by network
// snapshots from the server. The UI can read from this store identically to
// the local one.

import { create } from 'zustand';
import { useEffect } from 'react';
import type { GameState, Action, Faction } from '../engine/types';
import { netClient, type NetState } from './network';

interface NetGameStore {
  net: NetState;
  state: GameState | null;
  playerFaction: Faction | null;
  dispatch: (action: Action) => void;
  setSnapshot: (s: NetState) => void;
}

export const useNetGame = create<NetGameStore>((set) => ({
  net: netClient.getState(),
  state: null,
  playerFaction: null,
  dispatch: (action) => netClient.dispatch(action),
  setSnapshot: (s) => set({ net: s, state: s.state, playerFaction: s.yourFaction }),
}));

/** Hook to wire the network client to the store. Call once near the root. */
export function useNetBridge(): void {
  const setSnapshot = useNetGame((s) => s.setSnapshot);
  useEffect(() => netClient.subscribe(setSnapshot), [setSnapshot]);
}
