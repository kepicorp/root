import { useEffect, useRef } from 'react';
import type { GameState } from '../engine/types';

const FACTION_COLOR: Record<string, string> = {
  marquise: '#d97a3c',
  eyrie:    '#7da3c9',
  alliance: '#9bbd58',
  vagabond: '#b8a37a',
  system:   '#8a7045',
};

export function Log({ state }: { state: GameState }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight });
  }, [state.log.length]);

  return (
    <div className="log" ref={ref}>
      {state.log.slice(-200).map((e, i) => (
        <div className="log-entry" key={i}>
          <span className="log-turn">T{e.turn}</span>
          <span
            className="log-faction"
            style={{ color: FACTION_COLOR[e.faction] ?? '#fff' }}
          >
            {e.faction}
          </span>
          <span className="log-msg">{e.message}</span>
        </div>
      ))}
    </div>
  );
}
