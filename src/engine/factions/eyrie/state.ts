import type { CardId } from '../../cards';
import type { ClearingId } from '../../types';

export type DecreeSlot = 'recruit' | 'move' | 'battle' | 'build';
export type EyrieLeader = 'despot' | 'commander' | 'charismatic' | 'builder';

export interface EyrieState {
  warriorSupply: number;
  roosts: ClearingId[];
  leader: EyrieLeader;
  viziers: CardId[];
  decree: Record<DecreeSlot, CardId[]>;
  usedLeaders: EyrieLeader[];
  birdsongDone: boolean;
  decreeResolved: boolean;
  eveningDone: boolean;
  // How many cards the Eyrie has added to the Decree during the current
  // birdsong. Resets each evening. The bot uses this to add at most one
  // card per turn; the human UI ignores it.
  cardsAddedThisBirdsong: number;
}

export const INITIAL_EYRIE_STATE: EyrieState = {
  warriorSupply: 20,
  roosts: [],
  leader: 'despot',
  viziers: [],
  decree: { recruit: [], move: [], battle: [], build: [] },
  usedLeaders: [],
  birdsongDone: false,
  decreeResolved: false,
  eveningDone: false,
  cardsAddedThisBirdsong: 0,
};

export const ROOST_VP_TRACK = [0, 0, 1, 2, 3, 4, 4, 5] as const;
