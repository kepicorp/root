import { useState, useEffect } from 'react';
import type { GameState, Faction, CardSuit } from '../../engine/types';
import { getCard } from '../../engine/cards';
import { cardArt } from '../../assets';
import { CardIcon, CardDetails } from '../CardIcon';

const SUIT_COLOR: Record<CardSuit, string> = {
  fox: '#c03428', mouse: '#e07858', rabbit: '#f0c030', bird: '#5aabaa',
};

interface Props {
  state: GameState;
  faction: Faction;
}

export function CraftedCards({ state, faction }: Props) {
  const [zoomed, setZoomed] = useState<string | null>(null);

  const persistents = state.craftedPersistents.filter(e => e.faction === faction);
  // Clear zoom when the crafted cards list changes (removed cards won't fire mouseLeave).
  useEffect(() => { setZoomed(null); }, [persistents.length]);
  const items = state.craftedItemLog.filter(e => e.faction === faction);

  if (persistents.length === 0 && items.length === 0) return null;

  return (
    <div className="crafted-cards">
      {persistents.length > 0 && (
        <>
          <div className="crafted-cards-title">Crafted cards</div>
          <div className="crafted-cards-list">
            {persistents.map((e, i) => {
              const c = getCard(e.cardId);
              const art = cardArt(c);
              return (
                <div
                  key={i}
                  className={`crafted-card-row${art ? ' crafted-card-has-art' : ''}`}
                  style={{ borderColor: SUIT_COLOR[c.suit] }}
                  title={c.name}
                  onMouseEnter={() => art && setZoomed(art)}
                  onMouseLeave={() => setZoomed(null)}
                >
                  {art ? (
                    <img src={art} alt={c.name} className="crafted-card-art" />
                  ) : (
                    <>
                      <span className="crafted-card-suit" style={{ background: SUIT_COLOR[c.suit] }} />
                      <span className="crafted-card-suit-label" style={{ color: SUIT_COLOR[c.suit] }}>{c.suit}</span>
                      <span className="crafted-card-name">{c.name}</span>
                      <CardIcon card={c} size={18} />
                      <CardDetails card={c} />
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
      {items.length > 0 && (
        <>
          <div className="crafted-cards-title">Crafted items</div>
          <div className="crafted-cards-items">
            {items.map((e, i) => (
              <span key={i} className="crafted-item-badge">{e.item}</span>
            ))}
          </div>
        </>
      )}
      {zoomed && (
        <div className="card-zoom" aria-hidden>
          <img src={zoomed} alt="" />
        </div>
      )}
    </div>
  );
}
