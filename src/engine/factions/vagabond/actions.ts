import type { CardId } from '../../cards';
import type { ClearingId, Faction, ItemKind } from '../../types';

export type VagabondAction =
  | { kind: 'vagabond.slip'; to: ClearingId }
  | { kind: 'vagabond.move'; to: ClearingId }
  | { kind: 'vagabond.exploreRuin' }
  | { kind: 'vagabond.aid'; faction: Exclude<Faction, 'vagabond'>; cardId: CardId }
  | { kind: 'vagabond.strike'; clearing: ClearingId; faction: Exclude<Faction, 'vagabond'> }
  | { kind: 'vagabond.repair'; itemKind: ItemKind }
  | { kind: 'vagabond.completeQuest'; questId: string }
  | { kind: 'vagabond.formCoalition'; faction: Exclude<Faction, 'vagabond'> }
  | { kind: 'vagabond.refresh' }
  | { kind: 'vagabond.endDaylight' }
  | { kind: 'vagabond.evening' };
