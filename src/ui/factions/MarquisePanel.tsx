import type { GameState, Action } from '../../engine/types';
import { CraftedCards } from './CraftedCards';
import { DominanceBadge } from './DominanceBadge';
import { buildCost } from '../../engine/factions/marquise/scoring';

interface Props {
  state: GameState;
  isHuman: boolean;
  dispatch: (a: Action) => void;
}

export function MarquisePanel({ state }: Props) {
  const m = state.factions.marquise;
  if (!m) return null;
  const woodOnBoard = Object.values(state.map.clearings)
    .reduce((sum, cl) => sum + cl.tokens.filter(t => t.faction === 'marquise' && t.kind === 'wood').length, 0);
  return (
    <div className="faction-panel marquise">
      <h3>Marquise de Cat</h3>
      <div className="faction-stats">
        <span>Warriors: <strong>{m.warriorSupply}</strong></span>
        <span>Wood supply: <strong>{m.wood}</strong></span>
        <span>Wood on board: <strong>{woodOnBoard}</strong></span>
      </div>
      <div className="faction-stats">
        <span>Sawmills: <strong>{m.buildings.sawmill}/6</strong></span>
        <span>Workshops: <strong>{m.buildings.workshop}/6</strong></span>
        <span>Recruiters: <strong>{m.buildings.recruiter}/6</strong></span>
      </div>
      <div className="faction-projection">
        <strong>Building cost in wood</strong>
        <span>Next: {buildCost(Math.max(m.buildings.sawmill, m.buildings.workshop, m.buildings.recruiter))}</span>
        <span>At 1 / 2 / 3 buildings: {buildCost(1)} / {buildCost(2)} / {buildCost(3)}</span>
      </div>
      <DominanceBadge state={state} faction="marquise" />
      <CraftedCards state={state} faction="marquise" />
    </div>
  );
}
