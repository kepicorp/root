import { useState } from 'react';
import type { GameState, Faction } from '../engine/types';
import { getCard } from '../engine/cards';
import { cardArt, cardBackArt, factionIcon } from '../assets';
import { CardIcon } from './CardIcon';

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
        Hand · {faction}
      </div>
      <div className="hand-cards">
        {cards.length === 0 && <em className="dim">— empty —</em>}
        {cards.map((id) => {
          const c = getCard(id);
          const art = cardArt(c.name);
          return (
            <div
              key={id}
              className={`card ${art ? 'has-art' : ''}`}
              style={{ borderColor: SUIT_COLOR[c.suit] }}
              title={`${c.name} · ${c.category}`}
              onMouseEnter={() => art && setZoomed(art)}
              onMouseLeave={() => setZoomed(null)}
            >
              {art ? (
                <>
                  <img src={art} alt={c.name} className="card-img" />
                  <CardIcon card={c} />
                </>
              ) : (
                <>
                  <div className="card-suit" style={{ background: SUIT_COLOR[c.suit] }}>
                    {c.suit}
                  </div>
                  <div className="card-name">{c.name}</div>
                  <CardIcon card={c} />
                </>
              )}
            </div>
          );
        })}
      </div>
      {zoomed && (
        <div className="card-zoom" aria-hidden>
          <img src={zoomed} alt="" />
        </div>
      )}
      <OpponentHands state={state} you={faction} />
    </div>
  );
}

function OpponentHands({ state, you }: { state: GameState; you: Faction }) {
  const back = cardBackArt();
  const others = (Object.keys(state.hands) as Faction[]).filter(
    (f) => f !== you && state.factions[f] !== undefined,
  );
  if (others.length === 0) return null;
  return (
    <div className="opponent-hands">
      {others.map((f) => (
        <div key={f} className="opp-hand">
          <span className="opp-hand-label">{f}</span>
          <div className="opp-hand-stack">
            {state.hands[f].slice(0, 6).map((_, i) =>
              back ? (
                <img key={i} src={back} alt="" className="card-back-mini" />
              ) : (
                <div key={i} className="card-back-mini placeholder" />
              ),
            )}
            <span className="opp-hand-count">{state.hands[f].length}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
