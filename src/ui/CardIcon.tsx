// Visual badge for a card. Renders the suit icon (using the dominance-card
// art that ships with the project) plus a small category glyph so the
// player can read what each card does at a glance, even when no per-card
// scan is loaded.

import type { Card } from '../engine/cards';
import { dominanceArt, itemArt } from '../assets';

interface Props {
  card: Card;
  /** Render the inline-suit icon larger (default 14px). */
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

export function CardIcon({ card, size = 14 }: Props) {
  const suitArt = card.suit === 'bird' || card.suit === 'fox' || card.suit === 'mouse' || card.suit === 'rabbit'
    ? dominanceArt(card.suit)
    : null;
  const item = card.category === 'item' && card.item ? itemArt(card.item) : null;
  return (
    <span className="card-icon-row" title={`${card.name} · ${CATEGORY_LABEL[card.category]}`}>
      {suitArt && <img src={suitArt} alt={card.suit} className="card-suit-icon" style={{ width: size, height: size }} />}
      <span className={`card-category-glyph cat-${card.category}`} aria-label={CATEGORY_LABEL[card.category]}>
        {CATEGORY_GLYPH[card.category]}
      </span>
      {item && <img src={item} alt={card.item} className="card-item-icon" style={{ width: size, height: size }} />}
    </span>
  );
}
