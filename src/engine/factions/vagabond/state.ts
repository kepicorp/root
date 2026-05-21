import type { CardId } from '../../cards';
import type { ClearingId, Faction, ItemKind, ForestId } from '../../types';

export type VagabondCharacter = 'thief' | 'tinker' | 'ranger';
export type ItemFace = 'face-up' | 'face-down' | 'damaged';
export type Relationship = 'hostile' | 'indifferent' | 1 | 2 | 3 | 'allied';

export interface CarriedItem {
  kind: ItemKind;
  state: ItemFace;
  exhausted: boolean;
}

export interface VagabondState {
  character: VagabondCharacter;
  /** Clearing the Vagabond was last in. Stays valid even when the Vagabond
   *  is currently sitting in a forest (so the UI still has somewhere
   *  meaningful to anchor). */
  clearing: ClearingId;
  /** Set when the Vagabond is inside a forest tile instead of a clearing.
   *  `clearing` keeps pointing at the clearing they came from. */
  inForest?: ForestId;
  items: CarriedItem[];
  relationships: Record<Exclude<Faction, 'vagabond'>, Relationship>;
  quests: CardId[];          // legacy: shared-deck cards (unused)
  completedQuests: string[]; // ids of completed quest cards (from QUEST_DECK)
  questDeck: string[];       // face-down draw pile of QuestCard.ids
  questDisplay: string[];    // face-up available quests
  ruinsExplored: number;
  coalitionPartner?: Exclude<Faction, 'vagabond'>;
  slipped: boolean;
  daylightActionsLeft: number;
  pendingDiscard: number;
}

export const INITIAL_VAGABOND_STATE: VagabondState = {
  character: 'thief',
  clearing: 3,
  items: [],
  relationships: { marquise: 'indifferent', eyrie: 'indifferent', alliance: 'indifferent' },
  quests: [],
  completedQuests: [],
  questDeck: [],
  questDisplay: [],
  ruinsExplored: 0,
  slipped: false,
  daylightActionsLeft: 0,
  pendingDiscard: 0,
};

export const STARTING_ITEMS: Record<VagabondCharacter, ItemKind[]> = {
  thief:  ['torch', 'boots', 'tea', 'sword'],
  tinker: ['torch', 'boots', 'bag', 'hammer'],
  ranger: ['torch', 'boots', 'sword', 'crossbow'],
};
