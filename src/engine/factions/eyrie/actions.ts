import type { CardId } from '../../cards';
import type { DecreeSlot, EyrieLeader } from './state';

export type EyrieAction =
  | { kind: 'eyrie.chooseLeader'; leader: EyrieLeader }
  | { kind: 'eyrie.addToDecree'; slot: DecreeSlot; cardId: CardId }
  | { kind: 'eyrie.endBirdsong' }
  | { kind: 'eyrie.resolveDecree' }
  | { kind: 'eyrie.evening' };
