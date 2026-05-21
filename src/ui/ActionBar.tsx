import type { GameState, Action, Faction } from '../engine/types';
import { activeFaction } from '../engine/loop';
import { getLegalActions } from '../engine/legal';
import type { MapIntent } from './Board';

interface ActionBarProps {
  state: GameState;
  playerFaction: Faction | null;
  dispatch: (action: Action) => void;
  onBegin: (f: Faction) => void;
  mapIntent: MapIntent | null;
  setMapIntent: (intent: MapIntent | null) => void;
}

const FACTIONS: Faction[] = ['marquise', 'eyrie', 'alliance', 'vagabond'];

/** These action kinds are surfaced outside the ActionBar — either as
 *  map-driven intents (build / battle / etc., applied by clicking the
 *  Board) or in a faction-specific panel (Eyrie's Decree slots). */
const MAP_DRIVEN: ReadonlySet<string> = new Set([
  'marquise.march',
  'marquise.build',
  'marquise.battle',
  'alliance.spreadSympathy',
  'alliance.revolt',
  'alliance.organize',
  'alliance.battle',
  'vagabond.move',
  'vagabond.slip',
  'vagabond.strike',
  'eyrie.addToDecree', // surfaced via the Decree slots in EyriePanel
]);

const BUILDING_LABEL: Record<'sawmill' | 'workshop' | 'recruiter', string> = {
  sawmill:   'Build Sawmill',
  workshop:  'Build Workshop',
  recruiter: 'Build Recruiter',
};

const FACTION_LABEL: Record<Faction, string> = {
  marquise: 'Marquise',
  eyrie:    'Eyrie',
  alliance: 'Alliance',
  vagabond: 'Vagabond',
};

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

export function ActionBar({ state, playerFaction, dispatch, onBegin, mapIntent, setMapIntent }: ActionBarProps) {
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
  const hasMapMoves = isHuman && allLegals.some(a => a.kind === 'marquise.march' || a.kind === 'vagabond.move' || a.kind === 'vagabond.slip');

  // Group actions
  const groups: Record<string, Action[]> = { birdsong: [], main: [], bonus: [], end: [] };
  for (const a of filtered) {
    const meta = ACTION_META[a.kind];
    const g = meta?.group ?? 'main';
    if (groups[g]) groups[g]!.push(a);
  }

  // Synthesize map-intent buttons. We collapse every per-clearing legal of
  // a given action kind into one (or a handful of) ActionBar buttons that
  // arm a MapIntent; the Board does the actual targeting on click.
  const buildable = new Set<'sawmill' | 'workshop' | 'recruiter'>();
  const marquiseBattleDefenders = new Set<Faction>();
  const allianceBattleDefenders = new Set<Faction>();
  const vagabondStrikeDefenders = new Set<Faction>();
  let canSpreadSympathy = false;
  let canRevolt = false;
  let canOrganize = false;
  for (const a of allLegals) {
    if (a.kind === 'marquise.build')           buildable.add(a.building);
    else if (a.kind === 'marquise.battle')     marquiseBattleDefenders.add(a.defender);
    else if (a.kind === 'alliance.battle')     allianceBattleDefenders.add(a.defender);
    else if (a.kind === 'vagabond.strike')     vagabondStrikeDefenders.add(a.faction);
    else if (a.kind === 'alliance.spreadSympathy') canSpreadSympathy = true;
    else if (a.kind === 'alliance.revolt')         canRevolt = true;
    else if (a.kind === 'alliance.organize')       canOrganize = true;
  }
  type IntentButton = { label: string; intent: MapIntent; group: 'birdsong' | 'main' };
  const intentButtons: IntentButton[] = [];
  for (const b of ['sawmill', 'workshop', 'recruiter'] as const) {
    if (buildable.has(b)) intentButtons.push({ label: BUILDING_LABEL[b], intent: { kind: 'build', building: b }, group: 'main' });
  }
  for (const d of marquiseBattleDefenders) {
    intentButtons.push({ label: `Battle ${FACTION_LABEL[d]}`, intent: { kind: 'marquise.battle', defender: d }, group: 'main' });
  }
  if (canSpreadSympathy) intentButtons.push({ label: 'Spread Sympathy', intent: { kind: 'alliance.spreadSympathy' }, group: 'birdsong' });
  if (canRevolt)         intentButtons.push({ label: 'Revolt!',         intent: { kind: 'alliance.revolt' },         group: 'birdsong' });
  if (canOrganize)       intentButtons.push({ label: 'Organize',        intent: { kind: 'alliance.organize' },       group: 'main' });
  for (const d of allianceBattleDefenders) {
    intentButtons.push({ label: `Battle ${FACTION_LABEL[d]}`, intent: { kind: 'alliance.battle', defender: d }, group: 'main' });
  }
  for (const d of vagabondStrikeDefenders) {
    intentButtons.push({ label: `Strike ${FACTION_LABEL[d]}`, intent: { kind: 'vagabond.strike', defender: d }, group: 'main' });
  }
  const intentButtonsByGroup: Record<'birdsong' | 'main', IntentButton[]> = { birdsong: [], main: [] };
  for (const b of intentButtons) intentButtonsByGroup[b.group].push(b);

  function intentEquals(a: MapIntent, b: MapIntent): boolean {
    if (a.kind !== b.kind) return false;
    if (a.kind === 'build' && b.kind === 'build')                       return a.building === b.building;
    if (a.kind === 'marquise.battle' && b.kind === 'marquise.battle')   return a.defender === b.defender;
    if (a.kind === 'alliance.battle' && b.kind === 'alliance.battle')   return a.defender === b.defender;
    if (a.kind === 'vagabond.strike' && b.kind === 'vagabond.strike')   return a.defender === b.defender;
    return true;
  }
  function renderIntentButton(b: IntentButton) {
    const armed = mapIntent != null && intentEquals(mapIntent, b.intent);
    return (
      <button
        key={`${b.intent.kind}-${'building' in b.intent ? b.intent.building : 'defender' in b.intent ? b.intent.defender : ''}`}
        className={`btn action-btn ${armed ? 'armed' : 'primary'} faction-${active}`}
        onClick={() => setMapIntent(armed ? null : b.intent)}
        title={armed ? 'Click again to cancel' : 'Then click a clearing on the map'}
      >
        <span className="action-label">{b.label}</span>
        {armed && <span className="action-detail">click map · Esc to cancel</span>}
      </button>
    );
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
          ⤵ <strong>Click the map</strong> to move warriors (March = 2 moves per turn).
        </div>
      )}

      {GROUP_ORDER.map(g => {
        const list = groups[g] ?? [];
        const ibs = g === 'birdsong' ? intentButtonsByGroup.birdsong
                  : g === 'main'     ? intentButtonsByGroup.main
                  : [];
        if (list.length === 0 && ibs.length === 0) return null;
        return (
          <div key={g} className={`action-group action-group-${g}`}>
            <div className="action-group-label">{GROUP_LABEL[g]}</div>
            <div className="actions-grid">
              {ibs.map(renderIntentButton)}
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
