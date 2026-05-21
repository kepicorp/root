// Vagabond faction panel. Phase 5 fills this in.

import type { GameState, Action } from '../../engine/types';

interface Props {
  state: GameState;
  isHuman: boolean;
  dispatch: (a: Action) => void;
}

export function VagabondPanel({ state }: Props) {
  const v = state.factions.vagabond;
  if (!v) return null;
  return (
    <div className="faction-panel vagabond">
      <h3>Vagabond — {v.character}</h3>
      <div>Clearing: {v.clearing} · Items: {v.items.length} · Quests done: {v.completedQuests.length}</div>
      <div>
        Relationships:
        {' '}M:{String(v.relationships.marquise)}
        {' '}E:{String(v.relationships.eyrie)}
        {' '}A:{String(v.relationships.alliance)}
      </div>
      <em>Mechanics arrive in Phase 5.</em>
    </div>
  );
}
