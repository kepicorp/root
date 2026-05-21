// Marquise de Cat per-faction state.
// Filled in by Phase 2. For Phase 1 this is a minimal stub so the rest of
// the engine compiles. Phase 2 agent: extend this interface; do not narrow
// the existing fields.

export interface MarquiseState {
  warriorSupply: number;       // 25 max
  wood: number;                // wood tokens in supply (not on board)
  buildings: {
    sawmill: number;           // 0..6 placed
    workshop: number;          // 0..6
    recruiter: number;         // 0..6
  };
  keep?: { clearing: number };
}

export const INITIAL_MARQUISE_STATE: MarquiseState = {
  warriorSupply: 25,
  wood: 8,
  buildings: { sawmill: 0, workshop: 0, recruiter: 0 },
};
