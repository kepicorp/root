// Vagabond action union. Phase 5 fills this in.

import type { CardId } from '../../cards';
import type { ClearingId, Faction, ItemKind } from '../../types';

export type VagabondAction =
  | { kind: 'vagabond.slip'; to: ClearingId }
  | { kind: 'vagabond.move'; to: ClearingId }
  | { kind: 'vagabond.battle'; clearing: ClearingId; defender: Exclude<Faction, 'vagabond'> }
  | { kind: 'vagabond.exploreRuin' }
  | { kind: 'vagabond.aid'; faction: Exclude<Faction, 'vagabond'>; cardId: CardId; itemKind?: ItemKind }
  | { kind: 'vagabond.quest'; cardId: CardId }
  | { kind: 'vagabond.strike'; clearing: ClearingId; faction: Exclude<Faction, 'vagabond'> }
  | { kind: 'vagabond.repair'; itemKind: ItemKind }
  | { kind: 'vagabond.craft'; cardId: CardId }
  | { kind: 'vagabond.endDaylight' };
