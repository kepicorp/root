import type { GameState, Action, Faction } from '../engine/types';
import { activeFaction } from '../engine/loop';
import { getLegalActions } from '../engine/legal';

interface ActionBarProps {
  state: GameState;
  playerFaction: Faction | null;
  dispatch: (action: Action) => void;
  onBegin: (f: Faction) => void;
}

const FACTIONS: Faction[] = ['marquise', 'eyrie', 'alliance', 'vagabond'];

/** Hide actions driven by clicking the map. */
const MAP_DRIVEN: ReadonlySet<string> = new Set([
  'marquise.march',
  'vagabond.move',
  'vagabond.slip',
]);

function actionLabel(a: Action): string {
  const k = a.kind.replace(/^[a-z]+\./, '');
  let extras = '';
  for (const key of Object.keys(a)) {
    if (key === 'kind') continue;
    const v = (a as any)[key];
    if (Array.isArray(v)) extras += ` ${key}=[${v.length}]`;
    else extras += ` ${key}=${v}`;
  }
  return `${k}${extras}`;
}

export function ActionBar({ state, playerFaction, dispatch, onBegin }: ActionBarProps) {
  if (state.phase === 'setup') {
    return (
      <div className="actionbar">
        <span className="actionbar-label">Choose your faction:</span>
        {FACTIONS.map((f) => (
          <button key={f} className={`btn faction-${f}`} onClick={() => onBegin(f)}>
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
  const allLegals = isHuman ? getLegalActions(state) : [];
  const buttonLegals = allLegals.filter(a => !MAP_DRIVEN.has(a.kind)).slice(0, 20);
  const hasMoveActions = isHuman && allLegals.some(a => MAP_DRIVEN.has(a.kind));

  return (
    <div className="actionbar">
      <span className="actionbar-label">
        Turn {state.turn} · {active} · {state.phase}
      </span>
      {isHuman ? (
        <>
          <div className="actions-list">
            {buttonLegals.length === 0 && <em>no actions</em>}
            {buttonLegals.map((a, i) => (
              <button
                key={i}
                className="btn action-btn"
                onClick={() => dispatch(a)}
                title={a.kind}
              >
                {actionLabel(a)}
              </button>
            ))}
          </div>
          {hasMoveActions && (
            <span className="actionbar-hint">click the map to move</span>
          )}
        </>
      ) : (
        <em>AI turn ({active})…</em>
      )}
    </div>
  );
}
