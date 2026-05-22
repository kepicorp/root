import type { CardId } from '../../cards';
import type { ClearingId, Suit } from '../../types';

export interface AllianceState {
  warriorSupply: number;
  officers: number;
  supporters: CardId[];
  bases: Partial<Record<Suit, ClearingId>>;
  sympathy: ClearingId[];
  daylightActionsLeft: number;
  birdsongDone: boolean;
  pendingDiscard: number;
}

export const INITIAL_ALLIANCE_STATE: AllianceState = {
  warriorSupply: 10,
  officers: 0,
  supporters: [],
  bases: {},
  sympathy: [],
  daylightActionsLeft: 2,  // resets to 2+officers each turn; must be non-zero from turn 1
  birdsongDone: false,
  pendingDiscard: 0,
};

export const SYMPATHY_VP_TRACK = [1, 1, 1, 2, 2, 3, 3, 4, 4, 5] as const;
export const SYMPATHY_COST     = [1, 1, 1, 2, 2, 2, 3, 3, 3, 4] as const;
