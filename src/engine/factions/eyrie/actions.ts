import type { CardId } from '../../cards';
import type { ClearingId, Faction } from '../../types';
import type { DecreeSlot, EyrieLeader } from './state';

export type EyrieAction =
  | { kind: 'eyrie.chooseLeader'; leader: EyrieLeader }
  | { kind: 'eyrie.addToDecree'; slot: DecreeSlot; cardId: CardId }
  | { kind: 'eyrie.endBirdsong' }
  // Per-step manual Decree resolution. Each consumes the next remaining
  // card in its slot (FIFO) and applies one effect with the player's
  // chosen clearing(s).
  | { kind: 'eyrie.executeRecruit'; clearing: ClearingId }
  | { kind: 'eyrie.executeMove';    from: ClearingId; to: ClearingId }
  | { kind: 'eyrie.executeBattle';  clearing: ClearingId; defender: Faction }
  | { kind: 'eyrie.executeBuild';   clearing: ClearingId }
  // Resolve everything left automatically (Turmoil if anything is stuck).
  | { kind: 'eyrie.resolveDecree' }
  | { kind: 'eyrie.evening' }
  | { kind: 'eyrie.discardCard'; cardId: CardId };
