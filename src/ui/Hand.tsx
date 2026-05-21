import type { GameState, Faction } from '../engine/types';
import { getCard } from '../engine/cards';

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
  if (!faction) {
    return (
      <div className="hand empty">
        <em>Pick a faction to begin.</em>
      </div>
    );
  }
  const cards = state.hands[faction];
  return (
    <div className="hand">
      <div className="hand-label">Hand · {faction}</div>
      <div className="hand-cards">
        {cards.length === 0 && <em className="dim">— empty —</em>}
        {cards.map((id) => {
          const c = getCard(id);
          return (
            <div
              key={id}
              className="card"
              style={{ borderColor: SUIT_COLOR[c.suit] }}
              title={`${c.name} · ${c.category}`}
            >
              <div className="card-suit" style={{ background: SUIT_COLOR[c.suit] }}>
                {c.suit}
              </div>
              <div className="card-name">{c.name}</div>
              <div className="card-cat">{c.category}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
