import type { CardId } from '../../cards';
import type { CardSuit, ClearingId, Faction, ItemKind, ForestId } from '../../types';
export type { ClearingId };

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
  exploredRuins: ClearingId[];
  coalitionPartner?: Exclude<Faction, 'vagabond'>;
  slipped: boolean;
  daylightActionsLeft: number;
  /** Ranger only: clearing where a Hideout camp token is placed. */
  hideout?: ClearingId;
  pendingDiscard: number;
  /** Number of satchel/damaged items the Vagabond must permanently remove during evening. */
  pendingItemRemoval: number;
  /** Set after a battle/strike removes pieces from a non-hostile faction.
   *  Must be resolved (pay card or accept hostility) before further actions. */
  pendingRelationshipCost?: { faction: Exclude<Faction, 'vagabond'>; suit: CardSuit };
  /** Set after completing a quest; player must choose cards or VP before continuing. */
  pendingQuestReward?: string;
  /** Set after aiding a faction that has crafted items; player may take one. */
  pendingAidItemTake?: { faction: Exclude<Faction, 'vagabond'> };
  /** Number of items still to be picked for refresh during birdsong. */
  pendingRefresh: number;
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
  exploredRuins: [],
  slipped: false,
  daylightActionsLeft: 0,
  pendingDiscard: 0,
  pendingItemRemoval: 0,
  pendingRefresh: 0,
};

export const STARTING_ITEMS: Record<VagabondCharacter, ItemKind[]> = {
  thief:  ['torch', 'boots', 'tea', 'sword'],
  tinker: ['torch', 'boots', 'bag', 'hammer'],
  ranger: ['torch', 'boots', 'sword', 'crossbow'],
};
