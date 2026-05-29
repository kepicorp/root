import type { CardId } from '../../cards';
import type { ClearingId, Faction, ItemKind, ForestId } from '../../types';

export type VagabondAction =
  | { kind: 'vagabond.slip'; to: ClearingId }
  | { kind: 'vagabond.slipToForest'; forestId: ForestId }
  | { kind: 'vagabond.slipToHideout' }
  | { kind: 'vagabond.move'; to: ClearingId }
  | { kind: 'vagabond.enterForest'; forestId: ForestId }
  | { kind: 'vagabond.exitForest'; to: ClearingId }
  | { kind: 'vagabond.exploreRuin' }
  | { kind: 'vagabond.battle'; defender: Exclude<Faction, 'vagabond'>; clearing: ClearingId }
  | { kind: 'vagabond.aid'; faction: Exclude<Faction, 'vagabond'>; cardId: CardId; itemKind: ItemKind }
  | { kind: 'vagabond.stealCard'; faction: Exclude<Faction, 'vagabond'>; itemKind: ItemKind }
  | { kind: 'vagabond.strike'; clearing: ClearingId; faction: Exclude<Faction, 'vagabond'> }
  | { kind: 'vagabond.repair'; itemKind: ItemKind }
  | { kind: 'vagabond.completeQuest'; questId: string }
  | { kind: 'vagabond.completeQuestReward'; questId: string; choice: 'cards' | 'vp' }
  | { kind: 'vagabond.formCoalition'; faction: Exclude<Faction, 'vagabond'> }
  | { kind: 'vagabond.placeHideout' }
  | { kind: 'vagabond.refresh' }
  | { kind: 'vagabond.craft'; cardId: CardId }
  | { kind: 'vagabond.endDaylight' }
  | { kind: 'vagabond.evening' }
  | { kind: 'vagabond.discardCard'; cardId: CardId }
  | { kind: 'vagabond.removeItem'; itemIdx: number }
  | { kind: 'vagabond.payRelationshipCost'; cardId: CardId }
  | { kind: 'vagabond.acceptHostility' };
