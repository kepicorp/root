import { useEffect, useState } from 'react';
import type { GameState, Action, Faction, CardSuit } from '../engine/types';
import { activeFaction } from '../engine/loop';
import { getLegalActions } from '../engine/legal';
import { getCard } from '../engine/cards';
import type { MapIntent } from './Board';

const SUIT_COLOR: Record<CardSuit, string> = {
  fox: '#d97a3c', mouse: '#e6c34a', rabbit: '#9bbd58', bird: '#7da3c9',
};

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
  'marquise.overwork',
  'marquise.craft',                // single button + card picker
  'marquise.spendBirdForExtra',    // single button + card picker
  'alliance.spreadSympathy',
  'alliance.revolt',
  'alliance.organize',
  'alliance.battle',
  'alliance.mobilize',
  'alliance.move',
  'vagabond.move',
  'vagabond.slip',
  'vagabond.strike',
  'vagabond.aid',                  // collapsed into one button + (card × faction) picker
  'vagabond.repair',
  'eyrie.addToDecree',             // surfaced via the Decree slots in EyriePanel
  'eyrie.executeRecruit',
  'eyrie.executeMove',
  'eyrie.executeBattle',
  'eyrie.executeBuild',
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
  // Two-step intents like Overwork / Mobilize / Craft ("pick a card, then
  // go") use tiny local picker states. Esc dismisses any open picker.
  const [overworkPicking, setOverworkPicking] = useState(false);
  const [mobilizePicking, setMobilizePicking] = useState(false);
  const [craftPicking, setCraftPicking] = useState(false);
  const [spendBirdPicking, setSpendBirdPicking] = useState(false);
  const [aidPicking, setAidPicking] = useState(false);
  const [repairPicking, setRepairPicking] = useState(false);
  function closeAllPickers(): void {
    setOverworkPicking(false);
    setMobilizePicking(false);
    setCraftPicking(false);
    setSpendBirdPicking(false);
    setAidPicking(false);
    setRepairPicking(false);
  }
  useEffect(() => {
    function onKey(ev: KeyboardEvent) {
      if (ev.key === 'Escape') closeAllPickers();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => {
    if (mapIntent?.kind !== 'marquise.overwork') setOverworkPicking(false);
  }, [mapIntent]);
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
  const hasMapMoves = isHuman && allLegals.some(a =>
    a.kind === 'marquise.march'
    || a.kind === 'vagabond.move'
    || a.kind === 'vagabond.slip'
    || a.kind === 'eyrie.executeMove'
  );

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
  // Cards that can be spent on Overwork (matching at least one sawmill).
  const overworkCards = new Set<string>();
  // Cards the Alliance can Mobilize.
  const mobilizeCards = new Set<string>();
  // Marquise can craft item-cards.
  const craftCards = new Set<string>();
  // Marquise can spend a bird card for an extra daylight action.
  const spendBirdCards = new Set<string>();
  // Vagabond can aid: (card × faction with warriors here in matching suit).
  const aidLegals: Array<{ cardId: string; faction: Exclude<Faction, 'vagabond'> }> = [];
  // Vagabond can repair (per damaged item kind).
  const repairItems = new Set<string>();
  let canSpreadSympathy = false;
  let canRevolt = false;
  let canOrganize = false;
  let canEyrieRecruit = false;
  const eyrieBattleDefenders = new Set<Faction>();
  let canEyrieBuild = false;
  let canEyrieMove = false;
  for (const a of allLegals) {
    if (a.kind === 'marquise.build')           buildable.add(a.building);
    else if (a.kind === 'marquise.battle')     marquiseBattleDefenders.add(a.defender);
    else if (a.kind === 'marquise.overwork')   overworkCards.add(a.cardId);
    else if (a.kind === 'alliance.battle')     allianceBattleDefenders.add(a.defender);
    else if (a.kind === 'alliance.mobilize')   mobilizeCards.add(a.cardId);
    else if (a.kind === 'vagabond.strike')     vagabondStrikeDefenders.add(a.faction);
    else if (a.kind === 'alliance.spreadSympathy') canSpreadSympathy = true;
    else if (a.kind === 'alliance.revolt')         canRevolt = true;
    else if (a.kind === 'alliance.organize')       canOrganize = true;
    else if (a.kind === 'eyrie.executeRecruit')    canEyrieRecruit = true;
    else if (a.kind === 'eyrie.executeMove')       canEyrieMove = true;
    else if (a.kind === 'eyrie.executeBattle')     eyrieBattleDefenders.add(a.defender);
    else if (a.kind === 'eyrie.executeBuild')      canEyrieBuild = true;
    else if (a.kind === 'marquise.craft')             craftCards.add(a.cardId);
    else if (a.kind === 'marquise.spendBirdForExtra') spendBirdCards.add(a.cardId);
    else if (a.kind === 'vagabond.aid')               aidLegals.push({ cardId: a.cardId, faction: a.faction });
    else if (a.kind === 'vagabond.repair')            repairItems.add(a.itemKind);
  }
  // canEyrieMove drives only the map hint; movement is map-driven via the
  // existing source→destination click flow, not an explicit button.
  void canEyrieMove;
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
  if (canEyrieRecruit) {
    intentButtons.push({ label: 'Recruit (Decree)', intent: { kind: 'eyrie.executeRecruit' }, group: 'main' });
  }
  for (const d of eyrieBattleDefenders) {
    intentButtons.push({ label: `Battle ${FACTION_LABEL[d]} (Decree)`, intent: { kind: 'eyrie.executeBattle', defender: d }, group: 'main' });
  }
  if (canEyrieBuild) {
    intentButtons.push({ label: 'Build Roost (Decree)', intent: { kind: 'eyrie.executeBuild' }, group: 'main' });
  }
  const intentButtonsByGroup: Record<'birdsong' | 'main', IntentButton[]> = { birdsong: [], main: [] };
  for (const b of intentButtons) intentButtonsByGroup[b.group].push(b);

  function intentEquals(a: MapIntent, b: MapIntent): boolean {
    if (a.kind !== b.kind) return false;
    if (a.kind === 'build' && b.kind === 'build')                       return a.building === b.building;
    if (a.kind === 'marquise.battle' && b.kind === 'marquise.battle')   return a.defender === b.defender;
    if (a.kind === 'alliance.battle' && b.kind === 'alliance.battle')   return a.defender === b.defender;
    if (a.kind === 'vagabond.strike' && b.kind === 'vagabond.strike')   return a.defender === b.defender;
    if (a.kind === 'eyrie.executeBattle' && b.kind === 'eyrie.executeBattle') return a.defender === b.defender;
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
          ⤵ <strong>Click the map</strong> to {active === 'marquise'
            ? <>move warriors (<em>March</em> = 2 moves per turn)</>
            : active === 'vagabond'
              ? <>move the Vagabond</>
              : <>resolve a Decree move</>}.
        </div>
      )}

      {GROUP_ORDER.map(g => {
        const list = groups[g] ?? [];
        const ibs = g === 'birdsong' ? intentButtonsByGroup.birdsong
                  : g === 'main'     ? intentButtonsByGroup.main
                  : [];
        const showOverwork = g === 'main' && overworkCards.size > 0;
        const showMobilize = g === 'main' && mobilizeCards.size > 0;
        const showCraft = g === 'main' && craftCards.size > 0;
        const showSpendBird = g === 'bonus' && spendBirdCards.size > 0;
        const showAid = g === 'main' && aidLegals.length > 0;
        const showRepair = g === 'main' && repairItems.size > 0;
        if (list.length === 0 && ibs.length === 0
            && !showOverwork && !showMobilize && !showCraft
            && !showSpendBird && !showAid && !showRepair) return null;
        const overworkArmed = mapIntent?.kind === 'marquise.overwork';
        return (
          <div key={g} className={`action-group action-group-${g}`}>
            <div className="action-group-label">{GROUP_LABEL[g]}</div>
            <div className="actions-grid">
              {ibs.map(renderIntentButton)}
              {showOverwork && (
                <button
                  className={`btn action-btn ${overworkArmed || overworkPicking ? 'armed' : ''} faction-${active}`}
                  onClick={() => {
                    if (overworkArmed) { setMapIntent(null); return; }
                    setOverworkPicking(p => !p);
                  }}
                  title="Pick a card to discard, then click a matching sawmill clearing"
                >
                  <span className="action-label">Overwork</span>
                  {overworkArmed && <span className="action-detail">click map · Esc to cancel</span>}
                  {overworkPicking && !overworkArmed && <span className="action-detail">pick a card below</span>}
                </button>
              )}
              {showMobilize && (
                <button
                  className={`btn action-btn ${mobilizePicking ? 'armed' : ''} faction-${active}`}
                  onClick={() => setMobilizePicking(p => !p)}
                  title="Pick a card to add to your supporters"
                >
                  <span className="action-label">Mobilize</span>
                  {mobilizePicking && <span className="action-detail">pick a card below</span>}
                </button>
              )}
              {showCraft && (
                <button
                  className={`btn action-btn ${craftPicking ? 'armed' : ''} faction-${active}`}
                  onClick={() => setCraftPicking(p => !p)}
                  title="Craft an item card from your hand"
                >
                  <span className="action-label">Craft</span>
                  {craftPicking && <span className="action-detail">pick a card below</span>}
                </button>
              )}
              {showSpendBird && (
                <button
                  className={`btn action-btn ${spendBirdPicking ? 'armed' : ''} faction-${active}`}
                  onClick={() => setSpendBirdPicking(p => !p)}
                  title="Discard a bird-suit card to take an extra daylight action"
                >
                  <span className="action-label">Bird → extra action</span>
                  {spendBirdPicking && <span className="action-detail">pick a bird card below</span>}
                </button>
              )}
              {showAid && (
                <button
                  className={`btn action-btn ${aidPicking ? 'armed' : ''} faction-${active}`}
                  onClick={() => setAidPicking(p => !p)}
                  title="Give a card to a faction with warriors here"
                >
                  <span className="action-label">Aid faction</span>
                  {aidPicking && <span className="action-detail">pick a card + recipient below</span>}
                </button>
              )}
              {showRepair && (
                <button
                  className={`btn action-btn ${repairPicking ? 'armed' : ''} faction-${active}`}
                  onClick={() => setRepairPicking(p => !p)}
                  title="Exhaust your hammer to repair a damaged item"
                >
                  <span className="action-label">Repair</span>
                  {repairPicking && <span className="action-detail">pick an item below</span>}
                </button>
              )}
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
            {showOverwork && overworkPicking && (
              <div className="action-card-picker">
                <div className="action-card-picker-title">
                  Overwork — pick a card to discard
                  <button className="btn ghost small" onClick={() => setOverworkPicking(false)} aria-label="Cancel">×</button>
                </div>
                <div className="action-card-picker-list">
                  {Array.from(overworkCards).map(id => {
                    const c = getCard(id);
                    return (
                      <button
                        key={id}
                        className="action-card-pick"
                        style={{ borderColor: SUIT_COLOR[c.suit] }}
                        onClick={() => {
                          setMapIntent({ kind: 'marquise.overwork', cardId: id });
                          setOverworkPicking(false);
                        }}
                      >
                        <span className="action-card-pick-suit" style={{ background: SUIT_COLOR[c.suit] }} />
                        <span className="action-card-pick-name">{c.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {showMobilize && mobilizePicking && (
              <div className="action-card-picker">
                <div className="action-card-picker-title">
                  Mobilize — pick a card to become a supporter
                  <button className="btn ghost small" onClick={() => setMobilizePicking(false)} aria-label="Cancel">×</button>
                </div>
                <div className="action-card-picker-list">
                  {Array.from(mobilizeCards).map(id => {
                    const c = getCard(id);
                    return (
                      <button
                        key={id}
                        className="action-card-pick"
                        style={{ borderColor: SUIT_COLOR[c.suit] }}
                        onClick={() => {
                          dispatch({ kind: 'alliance.mobilize', cardId: id });
                          setMobilizePicking(false);
                        }}
                      >
                        <span className="action-card-pick-suit" style={{ background: SUIT_COLOR[c.suit] }} />
                        <span className="action-card-pick-name">{c.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {showCraft && craftPicking && (
              <div className="action-card-picker">
                <div className="action-card-picker-title">
                  Craft — pick a card to craft
                  <button className="btn ghost small" onClick={() => setCraftPicking(false)} aria-label="Cancel">×</button>
                </div>
                <div className="action-card-picker-list">
                  {Array.from(craftCards).map(id => {
                    const c = getCard(id);
                    return (
                      <button
                        key={id}
                        className="action-card-pick"
                        style={{ borderColor: SUIT_COLOR[c.suit] }}
                        onClick={() => {
                          dispatch({ kind: 'marquise.craft', cardId: id });
                          setCraftPicking(false);
                        }}
                      >
                        <span className="action-card-pick-suit" style={{ background: SUIT_COLOR[c.suit] }} />
                        <span className="action-card-pick-name">{c.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {showSpendBird && spendBirdPicking && (
              <div className="action-card-picker">
                <div className="action-card-picker-title">
                  Spend bird — pick a card to discard
                  <button className="btn ghost small" onClick={() => setSpendBirdPicking(false)} aria-label="Cancel">×</button>
                </div>
                <div className="action-card-picker-list">
                  {Array.from(spendBirdCards).map(id => {
                    const c = getCard(id);
                    return (
                      <button
                        key={id}
                        className="action-card-pick"
                        style={{ borderColor: SUIT_COLOR[c.suit] }}
                        onClick={() => {
                          dispatch({ kind: 'marquise.spendBirdForExtra', cardId: id });
                          setSpendBirdPicking(false);
                        }}
                      >
                        <span className="action-card-pick-suit" style={{ background: SUIT_COLOR[c.suit] }} />
                        <span className="action-card-pick-name">{c.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {showAid && aidPicking && (
              <div className="action-card-picker">
                <div className="action-card-picker-title">
                  Aid — pick a card + recipient
                  <button className="btn ghost small" onClick={() => setAidPicking(false)} aria-label="Cancel">×</button>
                </div>
                <div className="action-card-picker-list">
                  {aidLegals.map(({ cardId, faction }, i) => {
                    const c = getCard(cardId);
                    return (
                      <button
                        key={`${cardId}-${faction}-${i}`}
                        className="action-card-pick"
                        style={{ borderColor: SUIT_COLOR[c.suit] }}
                        onClick={() => {
                          dispatch({ kind: 'vagabond.aid', cardId, faction });
                          setAidPicking(false);
                        }}
                      >
                        <span className="action-card-pick-suit" style={{ background: SUIT_COLOR[c.suit] }} />
                        <span className="action-card-pick-name">{c.name} → <strong>{faction}</strong></span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {showRepair && repairPicking && (
              <div className="action-card-picker">
                <div className="action-card-picker-title">
                  Repair — pick a damaged item
                  <button className="btn ghost small" onClick={() => setRepairPicking(false)} aria-label="Cancel">×</button>
                </div>
                <div className="action-card-picker-list">
                  {Array.from(repairItems).map(item => (
                    <button
                      key={item}
                      className="action-card-pick"
                      onClick={() => {
                        dispatch({ kind: 'vagabond.repair', itemKind: item as never });
                        setRepairPicking(false);
                      }}
                    >
                      <span className="action-card-pick-name">{item}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
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
