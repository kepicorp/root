// Alliance faction panel. Shows public stats for everyone; the supporter
// pile (face-down to opponents) is fully revealed to the Alliance player.

import type { GameState, Action, CardSuit } from '../../engine/types';
import { getCard } from '../../engine/cards';
import { CraftedCards } from './CraftedCards';

interface Props {
  state: GameState;
  isHuman: boolean;
  dispatch: (a: Action) => void;
}

const SUIT_COLOR: Record<CardSuit, string> = {
  fox: '#c03428', mouse: '#e07858', rabbit: '#f0c030', bird: '#5aabaa',
};

export function AlliancePanel({ state, isHuman }: Props) {
  const a = state.factions.alliance;
  if (!a) return null;
  return (
    <div className="faction-panel alliance">
      <h3>Woodland Alliance</h3>
      <div>Warriors: {a.warriorSupply} · Officers: {a.officers} · Sympathy: {a.sympathy.length}/10</div>
      <div className="alliance-supporters-line">
        Supporters: <strong>{a.supporters.length}</strong>
        {isHuman ? ' (visible only to you)' : ' (face-down to you)'}
      </div>
      {isHuman && a.supporters.length > 0 && (
        <ul className="supporter-list" aria-label="Your face-down supporter cards">
          {a.supporters.map((id, i) => {
            const c = getCard(id);
            return (
              <li key={i} className="supporter-row" style={{ borderColor: SUIT_COLOR[c.suit] }}>
                <span className="supporter-pip" style={{ background: SUIT_COLOR[c.suit] }} />
                <span className="supporter-name">{c.name}</span>
                <span className="supporter-suit dim">{c.suit}</span>
              </li>
            );
          })}
        </ul>
      )}
      <CraftedCards state={state} faction="alliance" />
    </div>
  );
}
