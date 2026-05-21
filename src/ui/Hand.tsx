import { useState } from 'react';
import type { GameState, Faction } from '../engine/types';
import { getCard } from '../engine/cards';
import { cardArt, factionIcon } from '../assets';
import { CardIcon, CardDetails } from './CardIcon';

interface HandProps {
  state: GameState;
  faction: Faction | null;
}

const SUIT_COLOR: Record<string, string> = {
  fox: '#d97a3c',
  mouse: '#e6c34a',
  rabbit: '#9bbd58',
  bird: '#7da3c9',
};

export function Hand({ state, faction }: HandProps) {
  const [zoomed, setZoomed] = useState<string | null>(null);

  if (!faction) {
    return (
      <div className="hand empty">
        <em>Pick a faction to begin.</em>
      </div>
    );
  }
  const cards = state.hands[faction];
  const icon = factionIcon(faction);
  return (
    <div className="hand">
      <div className="hand-label">
        {icon && <img src={icon} alt="" className="faction-icon" />}
        Hand · {faction} <span className="dim hand-count">({cards.length})</span>
      </div>
      <div className="hand-cards">
        {cards.length === 0 && <em className="dim">— empty —</em>}
        {cards.map((id) => {
          const c = getCard(id);
          const art = cardArt(c.name);
          return (
            <div
              key={id}
              className="card"
              style={{ borderColor: SUIT_COLOR[c.suit] }}
              title={`${c.name} · ${c.category}`}
              onMouseEnter={() => art && setZoomed(art)}
              onMouseLeave={() => setZoomed(null)}
            >
              {art && <img src={art} alt="" className="card-art-bg" />}
              <div className="card-body">
                <div className="card-name">{c.name}</div>
                <CardIcon card={c} size={48} />
                <CardDetails card={c} />
              </div>
            </div>
          );
        })}
      </div>
      {zoomed && (
        <div className="card-zoom" aria-hidden>
          <img src={zoomed} alt="" />
        </div>
      )}
    </div>
  );
}
