// Vagabond per-faction state. Phase 5 fills this in.

import type { CardId } from '../../cards';
import type { ClearingId, Faction, ItemKind } from '../../types';

export type VagabondCharacter = 'thief' | 'tinker' | 'ranger';
export type ItemState = 'face-up' | 'face-down' | 'damaged';
export type Relationship = 'hostile' | 'indifferent' | 1 | 2 | 3 | 'allied';

export interface CarriedItem {
  kind: ItemKind;
  state: ItemState;
  exhausted: boolean;
}

export interface VagabondState {
  character: VagabondCharacter;
  clearing: ClearingId;
  items: CarriedItem[];
  relationships: Record<Exclude<Faction, 'vagabond'>, Relationship>;
  quests: CardId[];
  completedQuests: CardId[];
  ruinsExplored: number;
  coalitionPartner?: Exclude<Faction, 'vagabond'>;
}

export const INITIAL_VAGABOND_STATE: VagabondState = {
  character: 'thief',
  clearing: 1, // overridden during setup
  items: [],
  relationships: { marquise: 'indifferent', eyrie: 'indifferent', alliance: 'indifferent' },
  quests: [],
  completedQuests: [],
  ruinsExplored: 0,
};
