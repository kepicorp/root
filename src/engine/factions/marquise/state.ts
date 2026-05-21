// Marquise de Cat per-faction state.

export interface MarquiseState {
  warriorSupply: number;       // warriors available off-board (max 25)
  wood: number;                // wood tokens in supply (separate from on-board wood tokens)
  buildings: {
    sawmill: number;           // count placed on board (0..6)
    workshop: number;
    recruiter: number;
  };
  keep?: { clearing: number };
  // Sub-phase tracking
  daylightActionsLeft: number;
  recruitedThisTurn: boolean;
  birdsongDone: boolean;
  craftedThisTurn: string[];   // card ids used to craft this turn (for de-dup)
  bonusActionUsed: boolean;    // bird-card extra action consumed
  pendingDiscard: number;      // cards to discard before evening completes
}

export const INITIAL_MARQUISE_STATE: MarquiseState = {
  warriorSupply: 25,
  wood: 8,
  buildings: { sawmill: 0, workshop: 0, recruiter: 0 },
  daylightActionsLeft: 3,
  recruitedThisTurn: false,
  birdsongDone: false,
  craftedThisTurn: [],
  bonusActionUsed: false,
  pendingDiscard: 0,
};
