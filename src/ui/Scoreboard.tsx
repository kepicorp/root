import type { GameState, Faction } from '../engine/types';
import { ALL_FACTIONS } from '../engine/types';
import { activeFaction } from '../engine/loop';
import { useGame } from './store';

const FACTION_COLOR: Record<string, string> = {
  marquise: '#d97a3c',
  eyrie:    '#7da3c9',
  alliance: '#9bbd58',
  vagabond: '#b8a37a',
};

export function Scoreboard({ state }: { state: GameState }) {
  const scoreTick = useGame((s) => s.scoreTick);
  const active = state.phase !== 'setup' && state.phase !== 'gameOver'
    ? activeFaction(state)
    : null;
  return (
    <div className="scoreboard" role="group" aria-label="Faction scores">
      {ALL_FACTIONS.map((f: Faction) => {
        const isActive = f === active;
        const present = state.factions[f] !== undefined;
        const score = state.scores[f];
        const targetReached = score >= 30;
        return (
          <div
            key={f}
            className={`score ${isActive ? 'active' : ''} ${present ? '' : 'absent'} ${targetReached ? 'target' : ''}`}
            style={{ borderColor: FACTION_COLOR[f] }}
            aria-label={`${f}: ${score} victory points${isActive ? ', active turn' : ''}`}
          >
            <div className="score-faction" style={{ color: FACTION_COLOR[f] }}>{f}</div>
            <div className="score-value" key={scoreTick[f]}>
              {score}
            </div>
          </div>
        );
      })}
    </div>
  );
}
