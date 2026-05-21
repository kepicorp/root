// Alliance action union. Phase 4 fills this in.

import type { CardId } from '../../cards';
import type { ClearingId, Suit, Faction } from '../../types';

export type AllianceAction =
  | { kind: 'alliance.revolt'; clearing: ClearingId }
  | { kind: 'alliance.spreadSympathy'; clearing: ClearingId; supporterCards: CardId[] }
  | { kind: 'alliance.train'; cardId: CardId }
  | { kind: 'alliance.recruit' }
  | { kind: 'alliance.move'; from: ClearingId; to: ClearingId; count: number }
  | { kind: 'alliance.battle'; clearing: ClearingId; defender: Faction }
  | { kind: 'alliance.organize'; clearing: ClearingId }
  | { kind: 'alliance.mobilize'; cardId: CardId }
  | { kind: 'alliance.craft'; cardId: CardId }
  | { kind: 'alliance.takeSupporter'; cardId: CardId; suit: Suit }
  | { kind: 'alliance.endDaylight' };
