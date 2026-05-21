// Woodland Alliance per-faction state. Phase 4 fills this in.

import type { CardId } from '../../cards';
import type { ClearingId, Suit } from '../../types';

export interface AllianceState {
  warriorSupply: number;       // 10 max
  officers: number;            // 0..10
  supporters: CardId[];        // hidden; max 5 unless bases on board
  bases: Partial<Record<Suit, ClearingId>>;
  sympathy: ClearingId[];      // clearings with sympathy tokens
}

export const INITIAL_ALLIANCE_STATE: AllianceState = {
  warriorSupply: 10,
  officers: 0,
  supporters: [],
  bases: {},
  sympathy: [],
};
