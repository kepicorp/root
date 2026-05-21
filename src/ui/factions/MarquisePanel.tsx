// Marquise faction panel. Phase 2 fills this in.

import type { GameState, Action } from '../../engine/types';

interface Props {
  state: GameState;
  isHuman: boolean;
  dispatch: (a: Action) => void;
}

export function MarquisePanel({ state }: Props) {
  const m = state.factions.marquise;
  if (!m) return null;
  return (
    <div className="faction-panel marquise">
      <h3>Marquise de Cat</h3>
      <div>Warriors: {m.warriorSupply} · Wood: {m.wood}</div>
      <div>Sawmills: {m.buildings.sawmill}/6 · Workshops: {m.buildings.workshop}/6 · Recruiters: {m.buildings.recruiter}/6</div>
      <em>Mechanics arrive in Phase 2.</em>
    </div>
  );
}
