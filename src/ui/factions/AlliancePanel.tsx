// Alliance faction panel. Shows public stats for everyone; the supporter
// pile (face-down to opponents) is fully revealed to the Alliance player.

import type { GameState, Action } from '../../engine/types';
import { CraftedCards } from './CraftedCards';

interface Props {
  state: GameState;
  isHuman: boolean;
  dispatch: (a: Action) => void;
}

export function AlliancePanel({ state, isHuman: _isHuman }: Props) {
  const a = state.factions.alliance;
  if (!a) return null;
  return (
    <div className="faction-panel alliance">
      <h3>Woodland Alliance</h3>
      <div>Warriors: {a.warriorSupply} · Officers: {a.officers} · Sympathy: {a.sympathy.length}/10</div>
      <div className="alliance-supporters-line">
        Supporters: <strong>{a.supporters.length}</strong>
      </div>
      <CraftedCards state={state} faction="alliance" />
    </div>
  );
}
