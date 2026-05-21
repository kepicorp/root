// Marquise action union. Phase 2 fills this in.
// Phase 1 ships with a tiny stub so the central Action type compiles.

import type { ClearingId } from '../../types';

export type MarquiseAction =
  | { kind: 'marquise.placeWood' }                            // birdsong
  | { kind: 'marquise.build'; clearing: ClearingId; building: 'sawmill' | 'workshop' | 'recruiter' }
  | { kind: 'marquise.recruit' }
  | { kind: 'marquise.overwork'; clearing: ClearingId; cardId: string }
  | { kind: 'marquise.march'; from: ClearingId; to: ClearingId; count: number }
  | { kind: 'marquise.battle'; clearing: ClearingId; defender: import('../../types').Faction }
  | { kind: 'marquise.craft'; cardId: string }
  | { kind: 'marquise.endDaylight' };
