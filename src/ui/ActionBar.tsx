import type { GameState, Action, Faction } from '../engine/types';
import { activeFaction } from '../engine/loop';

interface ActionBarProps {
  state: GameState;
  playerFaction: Faction | null;
  dispatch: (action: Action) => void;
  onBegin: (f: Faction) => void;
}

const FACTIONS: Faction[] = ['marquise', 'eyrie', 'alliance', 'vagabond'];

export function ActionBar({ state, playerFaction, dispatch, onBegin }: ActionBarProps) {
  if (state.phase === 'setup') {
    return (
      <div className="actionbar">
        <span className="actionbar-label">Choose your faction:</span>
        {FACTIONS.map((f) => (
          <button key={f} className="btn" onClick={() => onBegin(f)}>
            {f}
          </button>
        ))}
      </div>
    );
  }

  if (state.phase === 'gameOver') {
    return (
      <div className="actionbar">
        <strong>Game over.</strong>
        {state.winner && (
          <span> {state.winner.faction} wins via {state.winner.via}.</span>
        )}
      </div>
    );
  }

  const active = activeFaction(state);
  const isHuman = active === playerFaction;
  return (
    <div className="actionbar">
      <span className="actionbar-label">
        Turn {state.turn} · {active} · {state.phase}
      </span>
      <button className="btn" onClick={() => dispatch({ kind: 'system.advancePhase' })}>
        Next phase
      </button>
      <button className="btn" onClick={() => dispatch({ kind: 'system.endTurn' })}>
        End turn
      </button>
      <span className="actionbar-hint">
        {isHuman ? 'Your turn (faction actions come in Phase 2+)' : 'AI placeholder'}
      </span>
    </div>
  );
}
