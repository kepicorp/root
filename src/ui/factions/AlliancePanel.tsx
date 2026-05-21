// Alliance faction panel. Phase 4 fills this in.

import type { GameState, Action } from '../../engine/types';

interface Props {
  state: GameState;
  isHuman: boolean;
  dispatch: (a: Action) => void;
}

export function AlliancePanel({ state, isHuman }: Props) {
  const a = state.factions.alliance;
  if (!a) return null;
  return (
    <div className="faction-panel alliance">
      <h3>Woodland Alliance</h3>
      <div>Warriors: {a.warriorSupply} · Officers: {a.officers} · Sympathy: {a.sympathy.length}/10</div>
      {isHuman ? (
        <div>Supporters: {a.supporters.length} (hidden from others)</div>
      ) : (
        <div>Supporters: {a.supporters.length}</div>
      )}
      <em>Mechanics arrive in Phase 4.</em>
    </div>
  );
}
