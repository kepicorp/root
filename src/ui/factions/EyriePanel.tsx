// Eyrie faction panel. Phase 3 fills this in.

import type { GameState, Action } from '../../engine/types';

interface Props {
  state: GameState;
  isHuman: boolean;
  dispatch: (a: Action) => void;
}

export function EyriePanel({ state }: Props) {
  const e = state.factions.eyrie;
  if (!e) return null;
  return (
    <div className="faction-panel eyrie">
      <h3>Eyrie Dynasties</h3>
      <div>Warriors: {e.warriorSupply} · Roosts: {e.roosts.length}/7 · Leader: {e.leader}</div>
      <em>Mechanics arrive in Phase 3.</em>
    </div>
  );
}
