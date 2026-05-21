import { useEffect, useRef, useState } from 'react';
import type { GameState } from '../engine/types';
import { ALL_FACTIONS } from '../engine/types';

const FACTION_COLOR: Record<string, string> = {
  marquise: '#d97a3c',
  eyrie:    '#7da3c9',
  alliance: '#9bbd58',
  vagabond: '#b8a37a',
  system:   '#8a7045',
};

const FILTERS = ['system', ...ALL_FACTIONS] as const;
type Filter = typeof FILTERS[number];

export function Log({ state }: { state: GameState }) {
  const ref = useRef<HTMLDivElement>(null);
  const [hidden, setHidden] = useState<Set<Filter>>(new Set());

  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight });
  }, [state.log.length]);

  const entries = state.log.slice(-200).filter(e => !hidden.has(e.faction as Filter));

  return (
    <div className="log-container">
      <div className="log-filters" role="group" aria-label="Log filters">
        {FILTERS.map(f => (
          <button
            key={f}
            className={`log-filter ${hidden.has(f) ? 'off' : 'on'}`}
            style={{ borderColor: FACTION_COLOR[f] }}
            onClick={() => setHidden(prev => {
              const next = new Set(prev);
              if (next.has(f)) next.delete(f); else next.add(f);
              return next;
            })}
            aria-pressed={!hidden.has(f)}
          >
            {f}
          </button>
        ))}
      </div>
      <div className="log" ref={ref} role="log" aria-live="polite">
        {entries.map((e, i) => (
          <div className="log-entry" key={state.log.length - entries.length + i}>
            <span className="log-turn">T{e.turn}</span>
            <span className="log-faction" style={{ color: FACTION_COLOR[e.faction] ?? '#fff' }}>
              {e.faction}
            </span>
            <span className="log-msg">{e.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
