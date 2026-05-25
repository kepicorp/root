import type { GameState, Faction, CardSuit } from '../../engine/types';
import { getCard } from '../../engine/cards';

const SUIT_COLOR: Record<CardSuit, string> = {
  fox: '#d97a3c', mouse: '#e6c34a', rabbit: '#9bbd58', bird: '#7da3c9',
};

interface Props {
  state: GameState;
  faction: Faction;
}

export function CraftedCards({ state, faction }: Props) {
  const cards = state.craftedPersistents.filter(e => e.faction === faction);
  if (cards.length === 0) return null;
  return (
    <div className="crafted-cards">
      <div className="crafted-cards-title">Crafted cards</div>
      {cards.map((e, i) => {
        const c = getCard(e.cardId);
        return (
          <div key={i} className="crafted-card-row" style={{ borderColor: SUIT_COLOR[c.suit] }}>
            <span className="crafted-card-suit" style={{ background: SUIT_COLOR[c.suit] }} />
            <span className="crafted-card-suit-label" style={{ color: SUIT_COLOR[c.suit] }}>{c.suit}</span>
            <span className="crafted-card-name">{c.name}</span>
          </div>
        );
      })}
    </div>
  );
}
