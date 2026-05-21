import type { CardId } from '../../cards';
import type { ClearingId, Faction } from '../../types';

export type AllianceAction =
  | { kind: 'alliance.spreadSympathy'; clearing: ClearingId; supporterCards: CardId[] }
  | { kind: 'alliance.mobilize'; cardId: CardId }
  | { kind: 'alliance.organize'; clearing: ClearingId }
  | { kind: 'alliance.revolt'; clearing: ClearingId; supporterCards: CardId[] }
  | { kind: 'alliance.battle'; clearing: ClearingId; defender: Faction }
  | { kind: 'alliance.move'; from: ClearingId; to: ClearingId; count: number }
  | { kind: 'alliance.craft'; cardId: CardId }
  | { kind: 'alliance.trainOfficer'; cardId: CardId }
  | { kind: 'alliance.endDaylight' }
  | { kind: 'alliance.evening' }
  | { kind: 'alliance.discardCard'; cardId: CardId };
