// Modal overlay shown to the defending human player when the engine has
// queued a defender-ambush prompt. Lists every matching-suit Ambush card
// in the defender's hand; clicking dispatches combat.playAmbush, the
// 'Skip' button dispatches combat.skipAmbush.

import type { GameState, Action, Faction, CardSuit } from '../engine/types';
import { getCard } from '../engine/cards';
import { defenderAmbushOptions } from '../engine/combat';

const SUIT_COLOR: Record<CardSuit, string> = {
  fox: '#c03428', mouse: '#e07858', rabbit: '#f0c030', bird: '#5aabaa',
};

interface Props {
  state: GameState;
  playerFaction: Faction | null;
  dispatch: (a: Action) => void;
}

export function AmbushPrompt({ state, playerFaction, dispatch }: Props) {
  const prompt = state.pendingPrompts.find(p => p.kind === 'combat.defenderAmbush');
  if (!prompt) return null;
  if (prompt.faction !== playerFaction) return null;

  const payload = prompt.payload as { clearing: number; attacker: Faction; defender: Faction };
  const options = defenderAmbushOptions(state, payload.clearing, prompt.faction);

  return (
    <div className="discard-picker-backdrop" role="dialog" aria-label="Defender ambush prompt">
      <div className="discard-picker" style={{ maxWidth: 520 }}>
        <div className="discard-picker-title">
          <strong>{payload.attacker}</strong> is attacking your forces in clearing{' '}
          <strong>{payload.clearing}</strong>. Play an Ambush?
        </div>
        <div className="discard-picker-cards" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
          {options.map(id => {
            const c = getCard(id);
            return (
              <button
                key={id}
                type="button"
                className="action-card-pick"
                style={{ borderColor: SUIT_COLOR[c.suit] }}
                onClick={() => dispatch({ kind: 'combat.playAmbush', faction: prompt.faction, cardId: id })}
              >
                <span className="action-card-pick-suit" style={{ background: SUIT_COLOR[c.suit] }} />
                <span className="action-card-pick-name">{c.name}</span>
              </button>
            );
          })}
          <button
            type="button"
            className="btn ghost"
            style={{ marginTop: 8 }}
            onClick={() => dispatch({ kind: 'combat.skipAmbush', faction: prompt.faction })}
          >
            Skip — take the hits
          </button>
        </div>
      </div>
    </div>
  );
}
