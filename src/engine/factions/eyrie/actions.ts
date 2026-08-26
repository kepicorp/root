import type { CardId } from '../../cards';
import type { ClearingId, Faction } from '../../types';
import type { DecreeSlot, EyrieLeader } from './state';

export type EyrieAction =
  | { kind: 'eyrie.setupChooseLeader'; leader: EyrieLeader }
  | { kind: 'eyrie.chooseLeader'; leader: EyrieLeader }
  | { kind: 'eyrie.addToDecree'; slot: DecreeSlot; cardId: CardId }
  | { kind: 'eyrie.endBirdsong' }
  | { kind: 'eyrie.endCrafting' }
  // Per-step manual Decree resolution. The player chooses any unresolved
  // card in the current column, then applies its effect.
  | { kind: 'eyrie.executeRecruit'; clearing: ClearingId; cardId?: CardId }
  | { kind: 'eyrie.executeMove';    from: ClearingId; to: ClearingId; count: number; cardId?: CardId }
  | { kind: 'eyrie.executeBattle';  clearing: ClearingId; defender: Faction; cardId?: CardId }
  | { kind: 'eyrie.executeBuild';   clearing: ClearingId; cardId?: CardId }
  // Resolve everything left automatically (Turmoil if anything is stuck).
  | { kind: 'eyrie.resolveDecree' }
  | { kind: 'eyrie.resolveTurmoilStep' }
  // Craft using roost power during daylight (outside Decree).
  | { kind: 'eyrie.craft'; cardId: CardId }
  | { kind: 'eyrie.evening' }
  | { kind: 'eyrie.discardCard'; cardId: CardId };
