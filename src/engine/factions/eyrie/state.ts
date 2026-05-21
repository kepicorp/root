// Eyrie Dynasties per-faction state. Phase 3 fills this in.

import type { CardId } from '../../cards';
import type { ClearingId } from '../../types';

export type DecreeSlot = 'recruit' | 'move' | 'battle' | 'build';
export type EyrieLeader = 'despot' | 'commander' | 'charismatic' | 'builder';

export interface EyrieState {
  warriorSupply: number;       // 20 max
  roosts: ClearingId[];        // up to 7
  leader: EyrieLeader;
  viziers: CardId[];           // 2 bird cards
  decree: Record<DecreeSlot, CardId[]>;
  usedLeaders: EyrieLeader[];  // for cycling
}

export const INITIAL_EYRIE_STATE: EyrieState = {
  warriorSupply: 20,
  roosts: [],
  leader: 'despot',
  viziers: [],
  decree: { recruit: [], move: [], battle: [], build: [] },
  usedLeaders: [],
};
