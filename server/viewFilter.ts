// Per-recipient projection of GameState. The canonical state on the server
// is the full source of truth (engine reducers and the bot run against it),
// but every WebSocket recipient gets a filtered copy where information they
// shouldn't see is replaced with an opaque sentinel id.
//
// What we hide:
//   - The deck's order (hidden from everyone — knowing the next draw is a
//     cheat).
//   - Every faction's hand except the recipient's own.
//   - Alliance supporters, unless the recipient is Alliance.
//   - Vagabond quest hand, unless the recipient is Vagabond.
//
// What we keep public: discard pile, crafted persistents, item supply,
// scores, the map, log, scores, all faction public state (buildings,
// tokens, warriors, decree, leader, etc).
//
// Array LENGTHS are preserved so the UI's count-based renderers (e.g.
// opponent hand stacks) keep working unchanged.

import { produce } from 'immer';
import { ALL_FACTIONS, type Faction, type GameState } from '../src/engine/types';

export const HIDDEN_CARD_ID = 'hidden';

export function filterStateForRecipient(state: GameState, recipient: Faction | null): GameState {
  return produce(state, draft => {
    for (let i = 0; i < draft.deck.length; i++) draft.deck[i] = HIDDEN_CARD_ID;

    for (const f of ALL_FACTIONS) {
      if (f === recipient) continue;
      const hand = draft.hands[f];
      for (let i = 0; i < hand.length; i++) hand[i] = HIDDEN_CARD_ID;
    }

    const alliance = draft.factions.alliance;
    if (alliance && recipient !== 'alliance') {
      for (let i = 0; i < alliance.supporters.length; i++) alliance.supporters[i] = HIDDEN_CARD_ID;
    }

    const vagabond = draft.factions.vagabond;
    if (vagabond && recipient !== 'vagabond') {
      // Legacy `quests` (shared-deck stash, unused) — hide for symmetry.
      for (let i = 0; i < vagabond.quests.length; i++) vagabond.quests[i] = HIDDEN_CARD_ID;
    }
    // Quest deck draw order is private to everyone (knowing the next quest
    // = cheating); the face-up `questDisplay` and `completedQuests` are
    // public game state and stay as-is.
    if (vagabond) {
      for (let i = 0; i < vagabond.questDeck.length; i++) vagabond.questDeck[i] = HIDDEN_CARD_ID;
    }
  });
}
