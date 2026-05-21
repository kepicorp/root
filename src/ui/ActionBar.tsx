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

/** Per-action display metadata. */
interface ActionMeta { label: string; group: string; primary?: boolean; }
const ACTION_META: Record<string, ActionMeta> = {
  // Marquise
  'marquise.placeWood':           { label: 'Place wood',          group: 'birdsong',    primary: true },
  'marquise.build':               { label: 'Build',               group: 'main',        primary: true },
  'marquise.recruit':             { label: 'Recruit',             group: 'main' },
  'marquise.overwork':            { label: 'Overwork',            group: 'main' },
  'marquise.battle':              { label: 'Battle',              group: 'main' },
  'marquise.craft':               { label: 'Craft',               group: 'main' },
  'marquise.spendBirdForExtra':   { label: 'Bird → extra action', group: 'bonus' },
  'marquise.endDaylight':         { label: 'End daylight',        group: 'end' },
  'marquise.evening':             { label: 'End evening',         group: 'end',         primary: true },
  // Eyrie
  'eyrie.addToDecree':            { label: 'Add to decree',       group: 'birdsong',    primary: true },
  'eyrie.endBirdsong':            { label: 'Done with decree',    group: 'end' },
  'eyrie.resolveDecree':          { label: 'Resolve decree',      group: 'main',        primary: true },
  'eyrie.evening':                { label: 'End evening',         group: 'end',         primary: true },
  // Alliance
  'alliance.spreadSympathy':      { label: 'Spread sympathy',     group: 'birdsong',    primary: true },
  'alliance.revolt':              { label: 'Revolt!',             group: 'birdsong',    primary: true },
  'alliance.mobilize':            { label: 'Mobilize',            group: 'main' },
  'alliance.organize':            { label: 'Organize',            group: 'main' },
  'alliance.battle':              { label: 'Battle',              group: 'main' },
  'alliance.endDaylight':         { label: 'End daylight',        group: 'end' },
  'alliance.evening':             { label: 'End evening',         group: 'end',         primary: true },
  // Vagabond
  'vagabond.refresh':             { label: 'Refresh items',       group: 'birdsong',    primary: true },
  'vagabond.exploreRuin':         { label: 'Explore ruin',        group: 'main',        primary: true },
  'vagabond.aid':                 { label: 'Aid faction',         group: 'main' },
  'vagabond.strike':              { label: 'Strike',              group: 'main' },
  'vagabond.repair':              { label: 'Repair item',         group: 'main' },
  'vagabond.endDaylight':         { label: 'End daylight',        group: 'end' },
  'vagabond.evening':             { label: 'End evening',         group: 'end',         primary: true },
};

const GROUP_ORDER = ['birdsong', 'main', 'bonus', 'end'] as const;
const GROUP_LABEL: Record<string, string> = {
  birdsong: 'Birdsong',
  main: 'Actions',
  bonus: 'Bonus',
  end: 'End phase',
};

function actionDetail(a: Action): string {
  const parts: string[] = [];
  for (const key of Object.keys(a)) {
    if (key === 'kind' || key === 'supporterCards') continue;
    const v = (a as any)[key];
    if (Array.isArray(v)) continue;
    parts.push(`${key} ${v}`);
  }
  return parts.join(' · ');
}

export function ActionBar({ state, playerFaction, dispatch, onBegin }: ActionBarProps) {
  if (state.phase === 'setup') {
    return (
      <div className="actionbar setup">
        <div className="actionbar-title">Choose your faction</div>
        <div className="actions-grid">
          {FACTIONS.map((f) => (
            <button key={f} className={`btn faction-${f}`} onClick={() => onBegin(f)}>
              {f}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (state.phase === 'gameOver') {
    return (
      <div className="actionbar game-over">
        <div className="actionbar-title">Game over</div>
        {state.winner && (
          <div className="game-over-msg">
            <strong>{state.winner.faction}</strong> wins via {state.winner.via}.
          </div>
        )}
      </div>
    );
  }

  const active = activeFaction(state);
  const isHuman = active === playerFaction;
  const allLegals = isHuman ? getLegalActions(state) : [];
  const filtered = allLegals.filter(a => !MAP_DRIVEN.has(a.kind) && a.kind !== 'system.advancePhase' && a.kind !== 'system.endTurn');
  const hasMapMoves = isHuman && allLegals.some(a => MAP_DRIVEN.has(a.kind));

  // Group actions
  const groups: Record<string, Action[]> = { birdsong: [], main: [], bonus: [], end: [] };
  for (const a of filtered) {
    const meta = ACTION_META[a.kind];
    const g = meta?.group ?? 'main';
    if (groups[g]) groups[g]!.push(a);
  }

  if (!isHuman) {
    return (
      <div className="actionbar ai-thinking">
        <div className="actionbar-title">AI turn — <em>{active}</em></div>
        <div className="ai-pulse"><span /><span /><span /></div>
      </div>
    );
  }

  return (
    <div className="actionbar your-turn">
      <div className="actionbar-title">
        Your turn <span className="dim">({state.phase})</span>
      </div>

      {hasMapMoves && (
        <div className="actionbar-hint map-hint">
          ⤵ <strong>Click the map</strong> to move warriors.
        </div>
      )}

      {GROUP_ORDER.map(g => {
        const list = groups[g] ?? [];
        if (list.length === 0) return null;
        return (
          <div key={g} className={`action-group action-group-${g}`}>
            <div className="action-group-label">{GROUP_LABEL[g]}</div>
            <div className="actions-grid">
              {list.slice(0, 20).map((a, i) => {
                const meta = ACTION_META[a.kind];
                const label = meta?.label ?? a.kind.split('.')[1];
                const detail = actionDetail(a);
                return (
                  <button
                    key={`${a.kind}-${i}`}
                    className={`btn action-btn ${meta?.primary ? 'primary' : ''} faction-${active}`}
                    onClick={() => dispatch(a)}
                    title={a.kind + (detail ? ' · ' + detail : '')}
                  >
                    <span className="action-label">{label}</span>
                    {detail && <span className="action-detail">{detail}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      {filtered.length === 0 && (
        <div className="dim">No actions available. Advance the phase.</div>
      )}

      <div className="action-system-row">
        <button className="btn ghost" onClick={() => dispatch({ kind: 'system.advancePhase' })}>
          Advance phase →
        </button>
      </div>
    </div>
  );
}
