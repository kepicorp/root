// Modal overlay shown when the active human player must discard down to
// their hand-size limit at the end of evening. Lists every card in hand,
// click one to discard it; repeats until the engine's pendingDiscard
// counter reaches 0.

import { useEffect } from 'react';
import type { GameState, Action, Faction, CardSuit } from '../engine/types';
import { getCard } from '../engine/cards';
import { activeFaction } from '../engine/loop';
import { CardIcon, CardDetails } from './CardIcon';

const SUIT_COLOR: Record<CardSuit, string> = {
  fox: '#c03428', mouse: '#e07858', rabbit: '#f0c030', bird: '#5aabaa',
};

interface Props {
  state: GameState;
  playerFaction: Faction | null;
  dispatch: (a: Action) => void;
}

function pendingFor(state: GameState, faction: Faction): number {
  const f = state.factions[faction];
  if (!f) return 0;
  return (f as { pendingDiscard?: number }).pendingDiscard ?? 0;
}

export function DiscardPicker({ state, playerFaction, dispatch }: Props) {
  // Esc just dismisses the overlay if shown — the engine still demands a
  // discard; the overlay reappears when the player tries to advance.
  useEffect(() => { /* no-op placeholder for any keybinds we might add later */ }, []);

  if (!playerFaction) return null;
  const active = activeFaction(state);
  if (active !== playerFaction) return null;
  if (state.phase !== 'evening') return null;
  const left = pendingFor(state, playerFaction);
  if (left <= 0) return null;

  const hand = state.hands[playerFaction];
  if (hand.length === 0) return null;

  function discard(cardId: string) {
    switch (playerFaction) {
      case 'marquise': dispatch({ kind: 'marquise.discardCard', cardId }); return;
      case 'eyrie':    dispatch({ kind: 'eyrie.discardCard',    cardId }); return;
      case 'alliance': dispatch({ kind: 'alliance.discardCard', cardId }); return;
      case 'vagabond': dispatch({ kind: 'vagabond.discardCard', cardId }); return;
    }
  }

  return (
    <div className="discard-picker-backdrop" role="dialog" aria-label="Choose cards to discard">
      <div className="discard-picker">
        <div className="discard-picker-title">
          Pick <strong>{left}</strong> card{left === 1 ? '' : 's'} to discard
        </div>
        <div className="discard-picker-cards">
          {hand.map(id => {
            const c = getCard(id);
            return (
              <button
                key={id}
                type="button"
                className="card discard-pick-card"
                style={{ borderColor: SUIT_COLOR[c.suit] }}
                onClick={() => discard(id)}
                title={`Discard ${c.name}`}
              >
                <div className="card-body">
                  <div className="card-name">{c.name}</div>
                  <CardIcon card={c} size={36} />
                  <CardDetails card={c} />
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
