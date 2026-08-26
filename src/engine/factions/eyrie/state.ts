import type { CardId } from '../../cards';
import type { ClearingId } from '../../types';

export type DecreeSlot = 'recruit' | 'move' | 'battle' | 'build';
export type EyrieLeader = 'despot' | 'commander' | 'charismatic' | 'builder';
export type TurmoilStep = 'humiliate' | 'purge' | 'depose' | 'rest';

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
  // Number of bird-suit cards added to the decree during the current
  // birdsong. At most one of the two adds may be bird-suit.
  birdCardsAddedThisBirdsong: number;
  // Per-step resolution counters used by the manual-resolution flow.
  // Lazily initialized when daylight starts (or when the first manual
  // resolution action fires) to the current Decree slot counts. The
  // player drains each in slot order; auto-resolve finishes the rest.
  resolutionLeft?: { recruit: number; move: number; battle: number; build: number };
  resolutionDone?: Record<DecreeSlot, CardId[]>;
  pendingDiscard: number;
  // True at game start and immediately after a Turmoil. The player must
  // choose a leader before adding to the Decree; cleared by chooseLeader.
  needsLeaderChoice: boolean;
  // Card IDs crafted during this daylight phase; used to track roost power spent.
  craftedThisTurn: CardId[];
  craftingDone: boolean;
  turmoilStep?: TurmoilStep;
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
  birdCardsAddedThisBirdsong: 0,
  pendingDiscard: 0,
  needsLeaderChoice: true,   // prompt for first leader before the first Decree add
  craftedThisTurn: [],
  craftingDone: false,
};

export const ROOST_VP_TRACK = [0, 0, 1, 2, 3, 4, 4, 5] as const;

/** The two Decree slots a leader's Loyal Viziers occupy. */
export const LEADER_VIZIER_SLOTS: Record<EyrieLeader, [DecreeSlot, DecreeSlot]> = {
  despot:      ['move', 'build'],
  commander:   ['move', 'battle'],
  charismatic: ['recruit', 'battle'],
  builder:     ['recruit', 'move'],
};
