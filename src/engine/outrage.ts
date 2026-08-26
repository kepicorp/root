import type { ClearingId, Faction, GameState, OutrageTrigger, PendingOutrage } from './types';
import { AUTUMN_MAP } from './map';

function clearingSuit(clearing: ClearingId): 'fox' | 'mouse' | 'rabbit' | null {
  const suit = AUTUMN_MAP.clearings.find((c) => c.id === clearing)?.suit;
  if (suit === 'fox' || suit === 'mouse' || suit === 'rabbit') return suit;
  return null;
}

export function enqueueOutrage(
  draft: GameState,
  faction: Faction,
  clearing: ClearingId,
  trigger: OutrageTrigger,
): void {
  if (faction === 'alliance') return;
  const suit = clearingSuit(clearing);
  if (!suit) return;
  const payload: PendingOutrage = { clearing, faction, suit, trigger };
  if (!draft.pendingOutrage) {
    draft.pendingOutrage = payload;
    return;
  }
  if (!draft.pendingOutrageQueue) draft.pendingOutrageQueue = [];
  draft.pendingOutrageQueue.push(payload);
}

export function hasAllianceSympathy(state: GameState, clearing: ClearingId): boolean {
  const cl = state.map.clearings[clearing];
  if (!cl) return false;
  return cl.tokens.some((t) => t.faction === 'alliance' && t.kind === 'sympathy');
}
