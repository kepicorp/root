import type { ClearingId, Faction } from '../../types';
import type { CardId } from '../../cards';

export type MarquiseAction =
  | { kind: 'marquise.placeWood' }
  | { kind: 'marquise.build'; clearing: ClearingId; building: 'sawmill' | 'workshop' | 'recruiter' }
  | { kind: 'marquise.recruit' }
  | { kind: 'marquise.overwork'; clearing: ClearingId; cardId: CardId }
  | { kind: 'marquise.beginMarch' }
  | { kind: 'marquise.march'; from: ClearingId; to: ClearingId; count: number }
  | { kind: 'marquise.endMarch' }
  | { kind: 'marquise.battle'; clearing: ClearingId; defender: Faction }
  | { kind: 'marquise.craftDecision'; decision: 'yes' | 'no' }
  | { kind: 'marquise.finishCrafting' }
  | { kind: 'marquise.craft'; cardId: CardId }
  | { kind: 'marquise.spendBirdForExtra'; cardId: CardId }
  | { kind: 'marquise.endDaylight' }
  | { kind: 'marquise.evening' }
  | { kind: 'marquise.discardCard'; cardId: CardId };
