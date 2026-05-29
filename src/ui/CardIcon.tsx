// Visual badge for a card. Renders the suit icon (using the dominance-card
// art that ships with the project), a category glyph, and the crafted-item
// icon when applicable. Used inside the card body, sized so the icon row
// dominates the card.

import type { Card } from '../engine/cards';
import type { CardSuit } from '../engine/types';
import { dominanceArt, itemArt } from '../assets';
import { cardDescription } from '../engine/card-descriptions';

interface Props {
  card: Card;
  /** Edge length of each big icon in px. */
  size?: number;
}

const CATEGORY_LABEL: Record<Card['category'], string> = {
  ambush:     'Ambush',
  dominance:  'Dominance',
  item:       'Craft',
  persistent: 'Effect',
  immediate:  'One-shot',
  favor:      'Favor',
};

const CATEGORY_GLYPH: Record<Card['category'], string> = {
  ambush:     '⚡',
  dominance:  '♛',
  item:       '⚒',
  persistent: '⚙',
  immediate:  '★',
  favor:      '♥',
};

const SUIT_PIP_COLOR: Record<CardSuit, string> = {
  fox:    '#c03428',
  mouse:  '#e07858',
  rabbit: '#f0c030',
  bird:   '#5aabaa',
};

const SUIT_ORDER: CardSuit[] = ['fox', 'mouse', 'rabbit', 'bird'];

export function CardIcon({ card, size = 84 }: Props) {
  const suitArt = SUIT_ORDER.includes(card.suit) ? dominanceArt(card.suit) : null;
  const item = card.category === 'item' && card.item ? itemArt(card.item) : null;
  return (
    <div className="card-icon-row" title={`${card.name} · ${CATEGORY_LABEL[card.category]}`}>
      {suitArt && <img src={suitArt} alt={card.suit} className="card-suit-icon" style={{ width: size, height: size }} />}
      <span
        className={`card-category-glyph cat-${card.category}`}
        aria-label={CATEGORY_LABEL[card.category]}
        style={{ width: size, height: size, fontSize: Math.round(size * 0.6) }}
      >
        {CATEGORY_GLYPH[card.category]}
      </span>
      {item && <img src={item} alt={card.item} className="card-item-icon" style={{ width: size, height: size }} />}
    </div>
  );
}

/** Short power blurb + craft cost pips, rendered beneath the icon row. */
export function CardDetails({ card }: { card: Card }) {
  const description = cardDescription(card);
  const costEntries = SUIT_ORDER
    .map(s => [s, card.craftCost[s] ?? 0] as const)
    .filter(([, n]) => n > 0);
  return (
    <div className="card-details">
      <div className="card-description">{description}</div>
      {costEntries.length > 0 ? (
        <div className="card-cost" aria-label="Craft cost">
          <span className="card-cost-label">Cost:</span>
          {costEntries.map(([suit, n]) => (
            <span key={suit} className="card-cost-group">
              {Array.from({ length: n }).map((_, i) => (
                <span
                  key={i}
                  className="card-cost-pip"
                  style={{ background: SUIT_PIP_COLOR[suit] }}
                  title={suit}
                />
              ))}
            </span>
          ))}
          {card.craftVp != null && card.craftVp > 0 && (
            <span className="card-cost-vp">+{card.craftVp} VP</span>
          )}
        </div>
      ) : (
        <div className="card-cost dim">No craft cost.</div>
      )}
    </div>
  );
}
