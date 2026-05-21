import type { GameState } from '../engine/types';
import { ALL_FACTIONS } from '../engine/types';
import { activeFaction } from '../engine/loop';

const FACTION_COLOR: Record<string, string> = {
  marquise: '#d97a3c',
  eyrie:    '#7da3c9',
  alliance: '#9bbd58',
  vagabond: '#b8a37a',
};

export function Scoreboard({ state }: { state: GameState }) {
  const active = state.phase !== 'setup' && state.phase !== 'gameOver'
    ? activeFaction(state)
    : null;
  return (
    <div className="scoreboard">
      {ALL_FACTIONS.map((f) => {
        const isActive = f === active;
        const present = state.factions[f] !== undefined;
        return (
          <div
            key={f}
            className={`score ${isActive ? 'active' : ''} ${present ? '' : 'absent'}`}
            style={{ borderColor: FACTION_COLOR[f] }}
          >
            <div className="score-faction" style={{ color: FACTION_COLOR[f] }}>{f}</div>
            <div className="score-value">{state.scores[f]}</div>
          </div>
        );
      })}
    </div>
  );
}
