import type { GameState, Faction, CardSuit } from '../../engine/types';

const SUIT_COLOR: Record<CardSuit, string> = {
  fox: '#c03428', mouse: '#D68860', rabbit: '#f0c030', bird: '#5aabaa',
};

const SUIT_LABEL: Record<CardSuit, string> = {
  fox: 'Fox', mouse: 'Mouse', rabbit: 'Rabbit', bird: 'Bird',
};

interface Props {
  state: GameState;
  faction: Faction;
}

export function DominanceBadge({ state, faction }: Props) {
  const d = state.dominance;
  if (!d || d.faction !== faction) return null;
  const color = SUIT_COLOR[d.suit];
  return (
    <div className="dominance-badge" style={{ borderColor: color }}>
      <span className="dominance-badge-dot" style={{ background: color }} />
      <span className="dominance-badge-label" style={{ color }}>
        {SUIT_LABEL[d.suit]} Dominance
      </span>
      <span className="dominance-badge-hint dim">chasing non-VP win</span>
    </div>
  );
}
