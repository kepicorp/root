import { useEffect, useState } from 'react';
import type { GameState, Action, Faction, CardSuit } from '../engine/types';
import { activeFaction } from '../engine/loop';
import { getLegalActions } from '../engine/legal';
import { getCard } from '../engine/cards';
import type { MapIntent } from './Board';
import { buildCost } from '../engine/factions/marquise/scoring';
import type { DecreeSlot, EyrieLeader } from '../engine/factions/eyrie/state';

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
  onUndo?: () => void;
  canUndo?: boolean;
}

const FACTIONS: Faction[] = ['marquise', 'eyrie', 'alliance', 'vagabond'];

/** These action kinds are surfaced outside the ActionBar — either as
 *  map-driven intents (build / battle / etc., applied by clicking the
 *  Board) or in a faction-specific panel (Eyrie's Decree slots). */
const MAP_DRIVEN: ReadonlySet<string> = new Set([
  'marquise.march',     // sub-moves are map-driven; beginMarch is the ActionBar button
  'marquise.build',
  'marquise.battle',
  'marquise.overwork',
  'marquise.craft',
  'marquise.spendBirdForExtra',
  'alliance.spreadSympathy',
  'alliance.revolt',
  'alliance.organize',
  'alliance.battle',
  'alliance.mobilize',
  'alliance.move',
  'alliance.craft',
  'alliance.trainOfficer',
  'vagabond.move',
  'vagabond.slip',
  'vagabond.slipToForest',
  'vagabond.enterForest',
  'vagabond.exitForest',
  'vagabond.battle',
  'vagabond.strike',
  'vagabond.aid',
  'vagabond.repair',
  'vagabond.craft',
  'vagabond.completeQuest',
  'vagabond.formCoalition',
  'vagabond.discardCard',
  'vagabond.removeItem',
  'vagabond.stealCard',
  'vagabond.slipToHideout',
  'vagabond.payRelationshipCost',
  'vagabond.acceptHostility',
  'system.resolveOutrage',
  'eyrie.addToDecree',
  'eyrie.chooseLeader',
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

const DECREE_SLOT_ORDER: DecreeSlot[] = ['recruit', 'move', 'battle', 'build'];
const DECREE_SLOT_LABEL: Record<DecreeSlot, string> = { recruit: 'Recruit', move: 'Move', battle: 'Battle', build: 'Build' };
const DECREE_SLOT_GLYPH: Record<DecreeSlot, string> = { recruit: '👥', move: '➜', battle: '⚔', build: '⌂' };
const EYRIE_LEADER_ABILITY: Record<EyrieLeader, string> = {
  despot:      'Score 1 VP per enemy building/token removed',
  commander:   '+1 hit when attacking',
  charismatic: 'Recruit places 2 warriors instead of 1',
  builder:     'Ignore Disdain for Trade when Crafting',
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
  'marquise.beginMarch':          { label: 'March',               group: 'main' },
  'marquise.endMarch':            { label: 'End march',           group: 'main' },
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
  'vagabond.refresh':             { label: 'Start daylight',      group: 'birdsong',    primary: true },
  'vagabond.slipToHideout':      { label: 'Slip to Hideout',     group: 'birdsong' },
  'vagabond.placeHideout':       { label: 'Place Hideout',       group: 'main' },
  'vagabond.exploreRuin':         { label: 'Explore ruin',        group: 'main',        primary: true },
  'vagabond.battle':              { label: 'Battle',              group: 'main',        primary: true },
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

export function ActionBar({ state, playerFaction, dispatch, onBegin, mapIntent, setMapIntent, onUndo, canUndo }: ActionBarProps) {
  // Two-step intents like Overwork / Mobilize / Craft ("pick a card, then
  // go") use tiny local picker states. Esc dismisses any open picker.
  const [overworkPicking, setOverworkPicking] = useState(false);
  const [mobilizePicking, setMobilizePicking] = useState(false);
  const [craftPicking, setCraftPicking] = useState(false);
  const [spendBirdPicking, setSpendBirdPicking] = useState(false);
  const [aidPicking, setAidPicking] = useState(false);
  const [stealPicking, setStealPicking] = useState(false);
  const [repairPicking, setRepairPicking] = useState(false);
  const [trainPicking, setTrainPicking] = useState(false);
  const [dominancePicking, setDominancePicking] = useState(false);
  const [royalClaimPicking, setRoyalClaimPicking] = useState(false);
  const [standAndDeliverPicking, setStandAndDeliverPicking] = useState(false);
  const [betterBurrowBankPicking, setBetterBurrowBankPicking] = useState(false);
  const [taxCollectorPicking, setTaxCollectorPicking] = useState(false);
  const [commandWarrenPicking, setCommandWarrenPicking] = useState(false);
  const [cobblerPicking, setCobblerPicking] = useState(false);
  const [hiddenWarrensPicking, setHiddenWarrensPicking] = useState(false);
  const [featherRufflersPicking, setFeatherRufflersPicking] = useState(false);
  const [supplyTrainPicking, setSupplyTrainPicking] = useState(false);
  const [raidingPartyPicking, setRaidingPartyPicking] = useState(false);
  const [standardBearerPicking, setStandardBearerPicking] = useState(false);
  const [tacticianPicking, setTacticianPicking] = useState(false);
  const [squiresPicking, setSquiresPicking] = useState(false);
  const [friendWildcardPicking, setFriendWildcardPicking] = useState(false);
  const [spyNetworkPicking, setSpyNetworkPicking] = useState(false);
  const [shadowCouncilPicking, setShadowCouncilPicking] = useState(false);
  const [apprenticePicking, setApprenticePicking] = useState(false);
  const [silverTonguePicking, setSilverTonguePicking] = useState(false);
  const [brazenDemagogPicking, setBrazenDemagogPicking] = useState(false);
  const [coalitionPicking, setCoalitionPicking] = useState(false);
  const [eyrieDecreeSlot, setEyrieDecreeSlot] = useState<DecreeSlot | null>(null);
  const [pendingCardMove, setPendingCardMove] = useState<{
    kind: string; cardId: string; from: number; to: number; max: number; pick: number;
  } | null>(null);
  function closeAllPickers(): void {
    setOverworkPicking(false);
    setMobilizePicking(false);
    setCraftPicking(false);
    setSpendBirdPicking(false);
    setAidPicking(false);
    setStealPicking(false);
    setRepairPicking(false);
    setTrainPicking(false);
    setDominancePicking(false);
    setRoyalClaimPicking(false);
    setStandAndDeliverPicking(false);
    setBetterBurrowBankPicking(false);
    setTaxCollectorPicking(false);
    setCommandWarrenPicking(false);
    setCobblerPicking(false);
    setHiddenWarrensPicking(false);
    setFeatherRufflersPicking(false);
    setSupplyTrainPicking(false);
    setRaidingPartyPicking(false);
    setStandardBearerPicking(false);
    setTacticianPicking(false);
    setSquiresPicking(false);
    setFriendWildcardPicking(false);
    setSpyNetworkPicking(false);
    setShadowCouncilPicking(false);
    setApprenticePicking(false);
    setSilverTonguePicking(false);
    setBrazenDemagogPicking(false);
    setCoalitionPicking(false);
    setEyrieDecreeSlot(null);
    setPendingCardMove(null);
  }
  function pickCardMove(kind: string, cardId: string, from: number, to: number, max: number, closeFn: () => void) {
    closeFn();
    if (max <= 1) {
      dispatch({ kind, faction: active!, cardId, from, to, count: 1 } as Action);
    } else {
      setPendingCardMove({ kind, cardId, from, to, max, pick: max });
    }
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
  // Human must also respond to pending prompts (e.g. defender ambush) even when
  // the active faction is the AI attacker.
  const pendingForHuman = state.pendingPrompts.length > 0
    && state.pendingPrompts[0]!.faction === playerFaction;
  const isHuman = active === playerFaction || pendingForHuman;
  const allLegals = isHuman ? getLegalActions(state) : [];
  const filtered = allLegals.filter(a => !MAP_DRIVEN.has(a.kind) && a.kind !== 'system.advancePhase' && a.kind !== 'system.endTurn');
  const hasMapMoves = isHuman && allLegals.some(a =>
    a.kind === 'marquise.march'
    || a.kind === 'vagabond.move'
    || a.kind === 'vagabond.slip'
    || a.kind === 'vagabond.enterForest'
    || a.kind === 'vagabond.exitForest'
    || a.kind === 'eyrie.executeMove'
  );
  const marchMovesLeft = isHuman && active === 'marquise'
    ? (state.factions.marquise?.marchMovesLeft ?? 0)
    : 0;

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
  // Each faction's craftable cards (only one of these can be non-empty
  // per turn, since only the active faction has legals). Same for the
  // optional "spend bird" / officer-training pickers.
  const craftCards = new Set<string>();
  const spendBirdCards = new Set<string>();
  const trainOfficerCards = new Set<string>();
  const vagabondBattleDefenders = new Set<Faction>();
  // Vagabond can aid: (card × faction × itemKind).
  const aidLegals: Array<{ cardId: string; faction: Exclude<Faction, 'vagabond'>; itemKind: string }> = [];
  // Thief can steal: (faction × itemKind).
  const stealLegals: Array<{ faction: Exclude<Faction, 'vagabond'>; itemKind: string }> = [];
  // Vagabond can repair (per damaged item kind).
  const repairItems = new Set<string>();
  // Persistent card effects (any faction).
  const royalClaimActions: Array<{ cardId: string }> = [];
  const standAndDeliverActions: Array<{ cardId: string; target: Faction }> = [];
  const betterBurrowBankActions: Array<{ cardId: string; target: Faction }> = [];
  const taxCollectorActions: Array<{ cardId: string; clearing: number }> = [];
  const commandWarrenActions: Array<{ cardId: string; clearing: number; defender: Faction }> = [];
  const cobblerActions: Array<{ cardId: string; from: number; to: number; count: number }> = [];
  const hiddenWarrensActions: Array<{ cardId: string; from: number; to: number; count: number }> = [];
  const featherRufflersActions: Array<{ cardId: string; clearing: number }> = [];
  const riversteadsActions: Array<{ cardId: string }> = [];
  const supplyTrainActions: Array<{ cardId: string; from: number; to: number; count: number }> = [];
  const raidingPartyActions: Array<{ cardId: string; clearing: number; defender: string }> = [];
  const standardBearerActions: Array<{ cardId: string; clearing: number; defender: string }> = [];
  const tacticianActions: Array<{ cardId: string; from: number; to: number; count: number }> = [];
  const squiresActions: Array<{ cardId: string; spendCard: string }> = [];
  const friendWildcardActions: Array<{ cardId: string; targetCard: string }> = [];
  const spyNetworkActions: Array<{ cardId: string; giveCard: string; target: string; takeCardId: string }> = [];
  const shadowCouncilActions: Array<{ cardId: string; spendCard: string; clearing: number; forceDefender: string }> = [];
  const apprenticeActions: Array<{ cardId: string; craftCardId: string }> = [];
  const silverTongueActions: Array<{ cardId: string; from: number; to: number; count: number }> = [];
  const brazenDemagogActions: Array<{ cardId: string; spendCard: string; takeDominance: string }> = [];
  const coalitionFactions = new Set<Faction>();
  const discardCardIds = new Set<string>();
  const removeItemIdxs: Array<{ itemIdx: number; kind: string; state: string }> = [];
  const payRelCostCards = new Set<string>();
  let canAcceptHostility = false;
  const outragePayCards = new Set<string>();
  let outrageAutoResolve = false;
  let canSpreadSympathy = false;
  let canRevolt = false;
  let canOrganize = false;
  let canEyrieRecruit = false;
  const eyrieBattleDefenders = new Set<Faction>();
  let canEyrieBuild = false;
  let canEyrieMove = false;
  const eyrieDecreeLegals: Array<{ slot: DecreeSlot; cardId: string }> = [];
  const eyrieLeaderLegals: EyrieLeader[] = [];
  for (const a of allLegals) {
    if (a.kind === 'marquise.build')           buildable.add(a.building);
    else if (a.kind === 'marquise.battle')     marquiseBattleDefenders.add(a.defender);
    else if (a.kind === 'marquise.overwork')   overworkCards.add(a.cardId);
    else if (a.kind === 'alliance.battle')     allianceBattleDefenders.add(a.defender);
    else if (a.kind === 'alliance.mobilize')   mobilizeCards.add(a.cardId);
    else if (a.kind === 'vagabond.battle')     vagabondBattleDefenders.add(a.defender);
    else if (a.kind === 'vagabond.strike')     vagabondStrikeDefenders.add(a.faction);
    else if (a.kind === 'alliance.spreadSympathy') canSpreadSympathy = true;
    else if (a.kind === 'alliance.revolt')         canRevolt = true;
    else if (a.kind === 'alliance.organize')       canOrganize = true;
    else if (a.kind === 'eyrie.executeRecruit')    canEyrieRecruit = true;
    else if (a.kind === 'eyrie.executeMove')       canEyrieMove = true;
    else if (a.kind === 'eyrie.executeBattle')     eyrieBattleDefenders.add(a.defender);
    else if (a.kind === 'eyrie.executeBuild')      canEyrieBuild = true;
    else if (a.kind === 'eyrie.addToDecree')       eyrieDecreeLegals.push({ slot: a.slot, cardId: a.cardId });
    else if (a.kind === 'eyrie.chooseLeader')      eyrieLeaderLegals.push(a.leader);
    else if (a.kind === 'marquise.craft')             craftCards.add(a.cardId);
    else if (a.kind === 'marquise.spendBirdForExtra') spendBirdCards.add(a.cardId);
    else if (a.kind === 'alliance.craft')             craftCards.add(a.cardId);
    else if (a.kind === 'alliance.trainOfficer')      trainOfficerCards.add(a.cardId);
    else if (a.kind === 'vagabond.craft')             craftCards.add(a.cardId);
    else if (a.kind === 'vagabond.aid')               aidLegals.push({ cardId: a.cardId, faction: a.faction, itemKind: a.itemKind });
    else if (a.kind === 'vagabond.stealCard')         stealLegals.push({ faction: a.faction, itemKind: a.itemKind });
    else if (a.kind === 'vagabond.repair')            repairItems.add(a.itemKind);
    else if (a.kind === 'card.royalClaim')            royalClaimActions.push({ cardId: a.cardId });
    else if (a.kind === 'card.standAndDeliver')       standAndDeliverActions.push({ cardId: a.cardId, target: a.target });
    else if (a.kind === 'card.betterBurrowBank')      betterBurrowBankActions.push({ cardId: a.cardId, target: a.target });
    else if (a.kind === 'card.taxCollector')          taxCollectorActions.push({ cardId: a.cardId, clearing: a.clearing });
    else if (a.kind === 'card.commandWarren')         commandWarrenActions.push({ cardId: a.cardId, clearing: a.clearing, defender: a.defender });
    else if (a.kind === 'card.cobbler')               cobblerActions.push({ cardId: a.cardId, from: a.from, to: a.to, count: a.count });
    else if (a.kind === 'card.hiddenWarrens')         hiddenWarrensActions.push({ cardId: a.cardId, from: a.from, to: a.to, count: a.count });
    else if (a.kind === 'card.featherRufflers')       featherRufflersActions.push({ cardId: a.cardId, clearing: a.clearing });
    else if (a.kind === 'card.riversteads')           riversteadsActions.push({ cardId: a.cardId });
    else if (a.kind === 'card.supplyTrain')           supplyTrainActions.push({ cardId: a.cardId, from: a.from, to: a.to, count: a.count });
    else if (a.kind === 'card.raidingParty')          raidingPartyActions.push({ cardId: a.cardId, clearing: a.clearing, defender: a.defender });
    else if (a.kind === 'card.standardBearer')        standardBearerActions.push({ cardId: a.cardId, clearing: a.clearing, defender: a.defender });
    else if (a.kind === 'card.tactician')             tacticianActions.push({ cardId: a.cardId, from: a.from, to: a.to, count: a.count });
    else if (a.kind === 'card.squires')               squiresActions.push({ cardId: a.cardId, spendCard: a.spendCard });
    else if (a.kind === 'card.friendWildcard')        friendWildcardActions.push({ cardId: a.cardId, targetCard: a.targetCard });
    else if (a.kind === 'card.spyNetwork')            spyNetworkActions.push({ cardId: a.cardId, giveCard: a.giveCard, target: a.target, takeCardId: a.takeCardId });
    else if (a.kind === 'card.shadowCouncil')         shadowCouncilActions.push({ cardId: a.cardId, spendCard: a.spendCard, clearing: a.clearing, forceDefender: a.forceDefender });
    else if (a.kind === 'card.apprenticeCraft')       apprenticeActions.push({ cardId: a.cardId, craftCardId: a.craftCardId });
    else if (a.kind === 'card.silverTongue')          silverTongueActions.push({ cardId: a.cardId, from: a.from, to: a.to, count: a.count });
    else if (a.kind === 'card.brazenDemagogue')       brazenDemagogActions.push({ cardId: a.cardId, spendCard: a.spendCard, takeDominance: a.takeDominance });
    else if (a.kind === 'vagabond.formCoalition')    coalitionFactions.add(a.faction);
    else if (a.kind === 'vagabond.discardCard')      discardCardIds.add(a.cardId);
    else if (a.kind === 'vagabond.removeItem') {
      const item = state.factions.vagabond?.items[a.itemIdx];
      if (item) removeItemIdxs.push({ itemIdx: a.itemIdx, kind: item.kind, state: item.state });
    }
    else if (a.kind === 'vagabond.payRelationshipCost') payRelCostCards.add(a.cardId);
    else if (a.kind === 'vagabond.acceptHostility')     canAcceptHostility = true;
    else if (a.kind === 'system.resolveOutrage') {
      if (a.cardId) outragePayCards.add(a.cardId);
      else outrageAutoResolve = true;
    }
  }
  // canEyrieMove drives only the map hint; movement is map-driven via the
  // existing source→destination click flow, not an explicit button.
  void canEyrieMove;
  type IntentButton = { label: string; intent: MapIntent; group: 'birdsong' | 'main' };
  const intentButtons: IntentButton[] = [];
  for (const b of ['sawmill', 'workshop', 'recruiter'] as const) {
    if (buildable.has(b)) {
      const cost = buildCost(state.factions.marquise?.buildings[b] ?? 0);
      intentButtons.push({ label: `${BUILDING_LABEL[b]} (${cost} wood)`, intent: { kind: 'build', building: b }, group: 'main' });
    }
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
  for (const d of vagabondBattleDefenders) {
    intentButtons.push({ label: `Battle ${FACTION_LABEL[d]}`, intent: { kind: 'vagabond.battle', defender: d }, group: 'main' });
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

  // Greyed-out building buttons: slot is available somewhere but not enough wood
  const greyedBuildings: { kind: 'sawmill' | 'workshop' | 'recruiter'; cost: number; missing: number }[] = [];
  if (active === 'marquise' && state.phase === 'daylight') {
    const marquise = state.factions.marquise;
    if (marquise && marquise.daylightActionsLeft > 0 && marquise.marchMovesLeft === 0) {
      const woodOnBoard = Object.values(state.map.clearings)
        .reduce((s, cl) => s + cl.tokens.filter(t => t.faction === 'marquise' && t.kind === 'wood').length, 0);
      for (const b of ['sawmill', 'workshop', 'recruiter'] as const) {
        if (buildable.has(b)) continue;
        if (marquise.buildings[b] >= 6) continue;
        const cost = buildCost(marquise.buildings[b]);
        const missing = Math.max(0, cost - woodOnBoard);
        if (missing > 0) greyedBuildings.push({ kind: b, cost, missing });
      }
    }
  }

  function intentEquals(a: MapIntent, b: MapIntent): boolean {
    if (a.kind !== b.kind) return false;
    if (a.kind === 'build' && b.kind === 'build')                       return a.building === b.building;
    if (a.kind === 'marquise.battle' && b.kind === 'marquise.battle')   return a.defender === b.defender;
    if (a.kind === 'alliance.battle' && b.kind === 'alliance.battle')   return a.defender === b.defender;
    if (a.kind === 'vagabond.battle' && b.kind === 'vagabond.battle')   return a.defender === b.defender;
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
        {pendingForHuman
          ? <>⚔ Defend! <span className="dim">({active} is attacking you)</span></>
          : <>Your turn <span className="dim">({state.phase})</span></>
        }
      </div>

      {canUndo && onUndo && (
        <button className="btn ghost small undo-btn" onClick={onUndo}>↩ Undo</button>
      )}

      {state.phase === 'daylight' && active === 'marquise' && state.factions.marquise && (
        <div className="actionbar-counter">
          Actions left: <strong>{state.factions.marquise.daylightActionsLeft}</strong>
        </div>
      )}
      {state.phase === 'daylight' && active === 'alliance' && state.factions.alliance && (
        <div className="actionbar-counter">
          Actions left: <strong>{state.factions.alliance.daylightActionsLeft}</strong>
        </div>
      )}
      {state.phase === 'daylight' && active === 'vagabond' && state.factions.vagabond && (
        <div className="actionbar-counter">
          Actions left: <strong>{state.factions.vagabond.daylightActionsLeft}</strong>
        </div>
      )}

      {marchMovesLeft > 0 && (
        <div className="actionbar-hint map-hint" style={{ borderColor: '#f0c060', color: '#f0e2c2' }}>
          ⚔ <strong>March in progress</strong> — {marchMovesLeft} move{marchMovesLeft === 1 ? '' : 's'} remaining.
          Click the map to pick a source and destination.
        </div>
      )}
      {hasMapMoves && marchMovesLeft === 0 && (
        <div className="actionbar-hint map-hint">
          ⤵ <strong>Click the map</strong> to {active === 'marquise'
            ? <>move warriors</>
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
        const showSteal = g === 'main' && stealLegals.length > 0;
        const showRepair = g === 'main' && repairItems.size > 0;
        const showTrain = g === 'main' && trainOfficerCards.size > 0;
        // Dominance card may be played during the player's birdsong once
        // they're at 10+ VP and a card is still in the supply.
        const dominanceHandCards = active != null
          ? (state.hands[active] ?? []).filter(id => getCard(id).category === 'dominance')
          : [];
        const dominanceEligible = isHuman
          && state.phase === 'birdsong'
          && active != null && active !== 'vagabond'
          && (state.scores[active] ?? 0) >= 10
          && state.dominance == null
          && dominanceHandCards.length > 0;
        const showDominance = g === 'birdsong' && dominanceEligible;
        const showRoyalClaim       = g === 'birdsong' && royalClaimActions.length > 0;
        const showStandAndDeliver  = g === 'birdsong' && standAndDeliverActions.length > 0;
        const showBetterBurrowBank = g === 'birdsong' && betterBurrowBankActions.length > 0;
        const showTaxCollector     = g === 'main'     && taxCollectorActions.length > 0;
        const showCommandWarren    = g === 'main'     && commandWarrenActions.length > 0;
        const showCobbler          = g === 'end'      && cobblerActions.length > 0;
        const showHiddenWarrens    = g === 'birdsong' && hiddenWarrensActions.length > 0;
        const showFeatherRufflers  = g === 'main'     && featherRufflersActions.length > 0;
        const showRiversteads      = g === 'birdsong' && riversteadsActions.length > 0;
        const showSupplyTrain      = supplyTrainActions.length > 0;
        const showRaidingParty     = raidingPartyActions.length > 0;
        const showStandardBearer   = standardBearerActions.length > 0;
        const showTactician        = tacticianActions.length > 0;
        const showSquires          = g === 'main'     && squiresActions.length > 0;
        const showFriendWildcard   = friendWildcardActions.length > 0;
        const showSpyNetwork       = g === 'main'     && spyNetworkActions.length > 0;
        const showShadowCouncil    = g === 'birdsong' && shadowCouncilActions.length > 0;
        const showApprentice       = g === 'birdsong' && apprenticeActions.length > 0;
        const showSilverTongue     = silverTongueActions.length > 0;
        const showBrazenDemagog    = g === 'end'      && brazenDemagogActions.length > 0;
        const showCoalition        = g === 'main'     && coalitionFactions.size > 0;
        const showDiscard          = g === 'end'      && discardCardIds.size > 0;
        const showRemoveItem       = g === 'end'      && removeItemIdxs.length > 0;
        const showPayRelationship  = g === 'main'     && (payRelCostCards.size > 0 || canAcceptHostility);
        const showOutrage          = g === 'main'     && (outragePayCards.size > 0 || outrageAutoResolve);
        const showEyrieDecree      = g === 'birdsong' && eyrieDecreeLegals.length > 0;
        const showEyrieLeader      = g === 'birdsong' && eyrieLeaderLegals.length > 0;
        if (list.length === 0 && ibs.length === 0
            && !showOverwork && !showMobilize && !showCraft
            && !showSpendBird && !showAid && !showRepair && !showTrain
            && !showDominance
            && !showRoyalClaim && !showStandAndDeliver && !showBetterBurrowBank
            && !showTaxCollector && !showCommandWarren && !showCobbler
            && !showHiddenWarrens && !showFeatherRufflers
            && !showRiversteads && !showSupplyTrain && !showRaidingParty && !showStandardBearer
            && !showTactician && !showSquires && !showFriendWildcard && !showSpyNetwork
            && !showShadowCouncil && !showApprentice && !showSilverTongue && !showBrazenDemagog
            && !showCoalition && !showDiscard && !showRemoveItem && !showSteal
            && !showPayRelationship && !showOutrage
            && !showEyrieDecree && !showEyrieLeader
            && greyedBuildings.length === 0) return null;
        const overworkArmed = mapIntent?.kind === 'marquise.overwork';
        return (
          <div key={g} className={`action-group action-group-${g}`}>
            <div className="action-group-label">{GROUP_LABEL[g]}</div>
            <div className="actions-grid">
              {ibs.map(renderIntentButton)}
              {showEyrieLeader && (
                <div className="eyrie-leader-picker-bar">
                  <span className="eyrie-leader-picker-bar-label">Choose leader:</span>
                  {eyrieLeaderLegals.map(leader => (
                    <button
                      key={leader}
                      className={`btn action-btn faction-eyrie`}
                      title={EYRIE_LEADER_ABILITY[leader]}
                      onClick={() => dispatch({ kind: 'eyrie.chooseLeader', leader })}
                    >
                      <span className="action-label">{leader}</span>
                      <span className="action-detail">{EYRIE_LEADER_ABILITY[leader]}</span>
                    </button>
                  ))}
                </div>
              )}
              {showEyrieDecree && (() => {
                const e = state.factions.eyrie!;
                const SUIT_ORDER_D: CardSuit[] = ['fox', 'mouse', 'rabbit', 'bird'];
                return (
                  <div className="eyrie-decree-bar">
                    {DECREE_SLOT_ORDER.map(slot => {
                      const slotLegals = eyrieDecreeLegals.filter(l => l.slot === slot);
                      const canAddToSlot = slotLegals.length > 0;
                      const pips: Record<CardSuit, number> = { fox: 0, mouse: 0, rabbit: 0, bird: 0 };
                      for (const id of e.decree[slot]) { const c = getCard(id); pips[c.suit] = (pips[c.suit] ?? 0) + 1; }
                      const armed = eyrieDecreeSlot === slot;
                      return (
                        <button
                          key={slot}
                          className={`btn decree-action-slot ${armed ? 'armed' : ''} faction-eyrie`}
                          disabled={!canAddToSlot}
                          onClick={() => canAddToSlot && setEyrieDecreeSlot(s => s === slot ? null : slot)}
                          title={canAddToSlot ? `Add a card to ${DECREE_SLOT_LABEL[slot]}` : DECREE_SLOT_LABEL[slot]}
                        >
                          <span className="decree-action-glyph">{DECREE_SLOT_GLYPH[slot]}</span>
                          <span className="decree-action-name">{DECREE_SLOT_LABEL[slot]}</span>
                          <span className="decree-action-count">{e.decree[slot].length}</span>
                          <span className="decree-action-pips">
                            {SUIT_ORDER_D.map(s => pips[s] > 0 ? (
                              <span key={s} style={{ display: 'inline-flex', gap: 2 }}>
                                {Array.from({ length: pips[s] }).map((_, i) => (
                                  <span key={i} className="decree-pip" style={{ background: SUIT_COLOR[s] }} />
                                ))}
                              </span>
                            ) : null)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                );
              })()}
              {showEyrieDecree && eyrieDecreeSlot && (() => {
                const slotLegals = eyrieDecreeLegals.filter(l => l.slot === eyrieDecreeSlot);
                const uniqueCards = [...new Map(slotLegals.map(l => [l.cardId, l])).values()];
                return (
                  <div className="action-card-picker">
                    <div className="action-card-picker-title">
                      Add to <strong>{DECREE_SLOT_LABEL[eyrieDecreeSlot]}</strong>
                      <button className="btn ghost small" onClick={() => setEyrieDecreeSlot(null)} aria-label="Cancel">×</button>
                    </div>
                    <div className="action-card-picker-list">
                      {uniqueCards.map(({ cardId }) => {
                        const c = getCard(cardId);
                        return (
                          <button
                            key={cardId}
                            className="action-card-pick"
                            style={{ borderColor: SUIT_COLOR[c.suit] }}
                            onClick={() => {
                              dispatch({ kind: 'eyrie.addToDecree', slot: eyrieDecreeSlot, cardId });
                              setEyrieDecreeSlot(null);
                            }}
                          >
                            <span className="action-card-pick-suit" style={{ background: SUIT_COLOR[c.suit] }} />
                            <span className="action-card-pick-suit-label" style={{ color: SUIT_COLOR[c.suit] }}>{c.suit}</span>
                            <span className="action-card-pick-name">{c.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
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
              {showSteal && (
                <button
                  className={`btn action-btn ${stealPicking ? 'armed' : ''} faction-${active}`}
                  onClick={() => setStealPicking(p => !p)}
                  title="Thief: take a card from a hostile faction's hand instead of giving one"
                >
                  <span className="action-label">Steal card</span>
                  {stealPicking && <span className="action-detail">pick a faction + item below</span>}
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
              {showTrain && (
                <button
                  className={`btn action-btn ${trainPicking ? 'armed' : ''} faction-${active}`}
                  onClick={() => setTrainPicking(p => !p)}
                  title="Spend a hand card matching a base clearing's suit to gain an officer"
                >
                  <span className="action-label">Train officer</span>
                  {trainPicking && <span className="action-detail">pick a hand card below</span>}
                </button>
              )}
              {showDominance && (
                <button
                  className={`btn action-btn ${dominancePicking ? 'armed' : ''} faction-${active}`}
                  onClick={() => setDominancePicking(p => !p)}
                  title="Abandon your VP track and chase the dominance win condition"
                >
                  <span className="action-label">Play Dominance</span>
                  {dominancePicking && <span className="action-detail">pick a card below</span>}
                </button>
              )}
              {showRoyalClaim && (
                royalClaimActions.length === 1
                  ? <button
                      className={`btn action-btn faction-${active}`}
                      onClick={() => dispatch({ kind: 'card.royalClaim', faction: active!, cardId: royalClaimActions[0]!.cardId })}
                      title="Score 1 VP per clearing you rule"
                    >
                      <span className="action-label">Royal Claim</span>
                    </button>
                  : <button
                      className={`btn action-btn ${royalClaimPicking ? 'armed' : ''} faction-${active}`}
                      onClick={() => setRoyalClaimPicking(p => !p)}
                      title="Score 1 VP per clearing you rule"
                    >
                      <span className="action-label">Royal Claim</span>
                      {royalClaimPicking && <span className="action-detail">pick a card below</span>}
                    </button>
              )}
              {showStandAndDeliver && (
                <button
                  className={`btn action-btn ${standAndDeliverPicking ? 'armed' : ''} faction-${active}`}
                  onClick={() => setStandAndDeliverPicking(p => !p)}
                  title="Take a random card from a faction; they score 1 VP"
                >
                  <span className="action-label">Stand and Deliver!</span>
                  {standAndDeliverPicking && <span className="action-detail">pick a target below</span>}
                </button>
              )}
              {showBetterBurrowBank && (
                <button
                  className={`btn action-btn ${betterBurrowBankPicking ? 'armed' : ''} faction-${active}`}
                  onClick={() => setBetterBurrowBankPicking(p => !p)}
                  title="You and another faction each draw a card"
                >
                  <span className="action-label">Better Burrow Bank</span>
                  {betterBurrowBankPicking && <span className="action-detail">pick a faction below</span>}
                </button>
              )}
              {showTaxCollector && (
                <button
                  className={`btn action-btn ${taxCollectorPicking ? 'armed' : ''} faction-${active}`}
                  onClick={() => setTaxCollectorPicking(p => !p)}
                  title="Remove one warrior to draw a card"
                >
                  <span className="action-label">Tax Collector</span>
                  {taxCollectorPicking && <span className="action-detail">pick a clearing below</span>}
                </button>
              )}
              {showCommandWarren && (
                <button
                  className={`btn action-btn ${commandWarrenPicking ? 'armed' : ''} faction-${active}`}
                  onClick={() => setCommandWarrenPicking(p => !p)}
                  title="Initiate a free battle"
                >
                  <span className="action-label">Command Warren</span>
                  {commandWarrenPicking && <span className="action-detail">pick a battle below</span>}
                </button>
              )}
              {showCobbler && (
                <button
                  className={`btn action-btn ${cobblerPicking ? 'armed' : ''} faction-${active}`}
                  onClick={() => setCobblerPicking(p => !p)}
                  title="Free move: move warriors to an adjacent clearing"
                >
                  <span className="action-label">Cobbler</span>
                  {cobblerPicking && <span className="action-detail">pick a move below</span>}
                </button>
              )}
              {showHiddenWarrens && (
                <button
                  className={`btn action-btn ${hiddenWarrensPicking ? 'armed' : ''} faction-${active}`}
                  onClick={() => setHiddenWarrensPicking(p => !p)}
                  title="Free move ignoring rule; card returns to hand"
                >
                  <span className="action-label">Hidden Warrens</span>
                  {hiddenWarrensPicking && <span className="action-detail">pick a move below</span>}
                </button>
              )}
              {showFeatherRufflers && (
                <button
                  className={`btn action-btn ${featherRufflersPicking ? 'armed' : ''} faction-${active}`}
                  onClick={() => setFeatherRufflersPicking(p => !p)}
                  title="Place 2 warriors in a clearing you rule; then discard"
                >
                  <span className="action-label">Feather Rufflers</span>
                  {featherRufflersPicking && <span className="action-detail">pick a clearing below</span>}
                </button>
              )}
              {showRiversteads && (
                <button
                  className={`btn action-btn faction-${active}`}
                  onClick={() => { const a = riversteadsActions[0]!; dispatch({ kind: 'card.riversteads', faction: active!, cardId: a.cardId }); }}
                  title="Draw 1 card per river clearing with your warriors; discard"
                >
                  <span className="action-label">Riversteads</span>
                </button>
              )}
              {showSupplyTrain && (
                <button
                  className={`btn action-btn ${supplyTrainPicking ? 'armed' : ''} faction-${active}`}
                  onClick={() => setSupplyTrainPicking(p => !p)}
                  title="Extra move to/from last destination; return to hand"
                >
                  <span className="action-label">Supply Train</span>
                  {supplyTrainPicking && <span className="action-detail">pick a move below</span>}
                </button>
              )}
              {showRaidingParty && (
                <button
                  className={`btn action-btn ${raidingPartyPicking ? 'armed' : ''} faction-${active}`}
                  onClick={() => setRaidingPartyPicking(p => !p)}
                  title="Battle at last move destination; return to hand"
                >
                  <span className="action-label">Raiding Party</span>
                  {raidingPartyPicking && <span className="action-detail">pick a battle below</span>}
                </button>
              )}
              {showStandardBearer && (
                <button
                  className={`btn action-btn ${standardBearerPicking ? 'armed' : ''} faction-${active}`}
                  onClick={() => setStandardBearerPicking(p => !p)}
                  title="Battle in the same clearing again; return to hand"
                >
                  <span className="action-label">Standard Bearer</span>
                  {standardBearerPicking && <span className="action-detail">pick a battle below</span>}
                </button>
              )}
              {showTactician && (
                <button
                  className={`btn action-btn ${tacticianPicking ? 'armed' : ''} faction-${active}`}
                  onClick={() => setTacticianPicking(p => !p)}
                  title="Move warriors to battle clearing; return to hand"
                >
                  <span className="action-label">Tactician</span>
                  {tacticianPicking && <span className="action-detail">pick a move below</span>}
                </button>
              )}
              {showSquires && (
                <button
                  className={`btn action-btn ${squiresPicking ? 'armed' : ''} faction-${active}`}
                  onClick={() => setSquiresPicking(p => !p)}
                  title="Spend squires or a matching-suit card for +1 action"
                >
                  <span className="action-label">Squires</span>
                  {squiresPicking && <span className="action-detail">pick a card to spend below</span>}
                </button>
              )}
              {showFriendWildcard && (
                <button
                  className={`btn action-btn ${friendWildcardPicking ? 'armed' : ''} faction-${active}`}
                  onClick={() => setFriendWildcardPicking(p => !p)}
                  title="Treat one matching-suit card as any suit this turn"
                >
                  <span className="action-label">Friend of...</span>
                  {friendWildcardPicking && <span className="action-detail">pick a card below</span>}
                </button>
              )}
              {showSpyNetwork && (
                <button
                  className={`btn action-btn ${spyNetworkPicking ? 'armed' : ''} faction-${active}`}
                  onClick={() => setSpyNetworkPicking(p => !p)}
                  title="Give a card, take an enemy's crafted persistent"
                >
                  <span className="action-label">Spy Network</span>
                  {spyNetworkPicking && <span className="action-detail">pick a trade below</span>}
                </button>
              )}
              {showShadowCouncil && (
                <button
                  className={`btn action-btn ${shadowCouncilPicking ? 'armed' : ''} faction-${active}`}
                  onClick={() => setShadowCouncilPicking(p => !p)}
                  title="Spend a card to force an enemy to battle in a clearing you rule"
                >
                  <span className="action-label">Shadow Council</span>
                  {shadowCouncilPicking && <span className="action-detail">pick below</span>}
                </button>
              )}
              {showApprentice && (
                <button
                  className={`btn action-btn ${apprenticePicking ? 'armed' : ''} faction-${active}`}
                  onClick={() => setApprenticePicking(p => !p)}
                  title="Craft a card for free; draw a card"
                >
                  <span className="action-label">Apprentice</span>
                  {apprenticePicking && <span className="action-detail">pick a card to craft below</span>}
                </button>
              )}
              {showSilverTongue && (
                <button
                  className={`btn action-btn ${silverTonguePicking ? 'armed' : ''} faction-${active}`}
                  onClick={() => setSilverTonguePicking(p => !p)}
                  title="Free move up to 2 warriors; return to hand"
                >
                  <span className="action-label">Silver-Tongue</span>
                  {silverTonguePicking && <span className="action-detail">pick a move below</span>}
                </button>
              )}
              {showBrazenDemagog && (
                <button
                  className={`btn action-btn ${brazenDemagogPicking ? 'armed' : ''} faction-${active}`}
                  onClick={() => setBrazenDemagogPicking(p => !p)}
                  title="Discard a fox card, take a dominance card"
                >
                  <span className="action-label">Brazen Demagogue</span>
                  {brazenDemagogPicking && <span className="action-detail">pick a faction below</span>}
                </button>
              )}
              {showCoalition && (
                <button
                  className={`btn action-btn ${coalitionPicking ? 'armed' : ''} faction-${active}`}
                  onClick={() => setCoalitionPicking(p => !p)}
                  title="Share your win condition with the last-place faction"
                >
                  <span className="action-label">Form Coalition</span>
                  {coalitionPicking && <span className="action-detail">pick a faction below</span>}
                </button>
              )}
              {g === 'main' && greyedBuildings.map(({ kind, cost, missing }) => (
                <button
                  key={`greyed-${kind}`}
                  className={`btn action-btn faction-${active}`}
                  disabled
                  style={{ opacity: 0.45 }}
                  title={`Need ${missing} more wood to build`}
                >
                  <span className="action-label">{BUILDING_LABEL[kind]} ({cost} wood)</span>
                  <span className="action-detail">need {missing} more wood</span>
                </button>
              ))}
              {list.filter(a => !a.kind.startsWith('card.')).slice(0, 20).map((a, i) => {
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
                        <span className="action-card-pick-suit-label" style={{ color: SUIT_COLOR[c.suit] }}>{c.suit}</span>
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
                        <span className="action-card-pick-suit-label" style={{ color: SUIT_COLOR[c.suit] }}>{c.suit}</span>
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
                          if (active === 'marquise')      dispatch({ kind: 'marquise.craft', cardId: id });
                          else if (active === 'alliance') dispatch({ kind: 'alliance.craft', cardId: id });
                          else if (active === 'vagabond') dispatch({ kind: 'vagabond.craft', cardId: id });
                          setCraftPicking(false);
                        }}
                      >
                        <span className="action-card-pick-suit" style={{ background: SUIT_COLOR[c.suit] }} />
                        <span className="action-card-pick-suit-label" style={{ color: SUIT_COLOR[c.suit] }}>{c.suit}</span>
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
                        <span className="action-card-pick-suit-label" style={{ color: SUIT_COLOR[c.suit] }}>{c.suit}</span>
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
                  Aid — pick a card + recipient (exhausts an item)
                  <button className="btn ghost small" onClick={() => setAidPicking(false)} aria-label="Cancel">×</button>
                </div>
                <div className="action-card-picker-list">
                  {[...new Map(aidLegals.map(a => [`${a.cardId}-${a.faction}-${a.itemKind}`, a])).values()].map(({ cardId, faction, itemKind }, i) => {
                    const c = getCard(cardId);
                    const relNow = state.factions.vagabond?.relationships[faction as Exclude<Faction, 'vagabond'>];
                    const REL_NEXT: Record<string, string | number> = { hostile: 'indifferent', indifferent: 1, '1': 2, '2': 3, '3': 'allied' };
                    const relAfter = relNow != null ? REL_NEXT[String(relNow)] : undefined;
                    const VP_FOR_REL: Record<string, number> = { '1': 1, '2': 2, '3': 3, allied: 4 };
                    const aidVp = relAfter != null ? (VP_FOR_REL[String(relAfter)] ?? 0) : 0;
                    return (
                      <button
                        key={`${cardId}-${faction}-${itemKind}-${i}`}
                        className="action-card-pick"
                        style={{ borderColor: SUIT_COLOR[c.suit] }}
                        onClick={() => {
                          dispatch({ kind: 'vagabond.aid', cardId, faction, itemKind: itemKind as never });
                          setAidPicking(false);
                        }}
                      >
                        <span className="action-card-pick-suit" style={{ background: SUIT_COLOR[c.suit] }} />
                        <span className="action-card-pick-suit-label" style={{ color: SUIT_COLOR[c.suit] }}>{c.suit}</span>
                        <span className="action-card-pick-name">{c.name} → <strong>{faction}</strong> <span className="dim">(exhaust {itemKind})</span>{aidVp > 0 && <span className="action-vp-hint"> +{aidVp} VP</span>}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {showSteal && stealPicking && (
              <div className="action-card-picker">
                <div className="action-card-picker-title">
                  Steal — take a card from a hostile faction (exhaust an item)
                  <button className="btn ghost small" onClick={() => setStealPicking(false)} aria-label="Cancel">×</button>
                </div>
                <div className="action-card-picker-list">
                  {[...new Map(stealLegals.map(s => [`${s.faction}-${s.itemKind}`, s])).values()].map(({ faction, itemKind }, i) => (
                    <button
                      key={`${faction}-${itemKind}-${i}`}
                      className="action-card-pick"
                      onClick={() => {
                        dispatch({ kind: 'vagabond.stealCard', faction, itemKind: itemKind as never });
                        setStealPicking(false);
                      }}
                    >
                      <span className="action-card-pick-name">Steal from <strong>{faction}</strong> <span className="dim">(exhaust {itemKind})</span><span className="action-vp-hint"> hostile→indiff</span></span>
                    </button>
                  ))}
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
            {showTrain && trainPicking && (
              <div className="action-card-picker">
                <div className="action-card-picker-title">
                  Train officer — pick a hand card matching a base clearing's suit
                  <button className="btn ghost small" onClick={() => setTrainPicking(false)} aria-label="Cancel">×</button>
                </div>
                <div className="action-card-picker-list">
                  {Array.from(trainOfficerCards).map(id => {
                    const c = getCard(id);
                    return (
                      <button
                        key={id}
                        className="action-card-pick"
                        style={{ borderColor: SUIT_COLOR[c.suit] }}
                        onClick={() => {
                          dispatch({ kind: 'alliance.trainOfficer', cardId: id });
                          setTrainPicking(false);
                        }}
                      >
                        <span className="action-card-pick-suit" style={{ background: SUIT_COLOR[c.suit] }} />
                        <span className="action-card-pick-suit-label" style={{ color: SUIT_COLOR[c.suit] }}>{c.suit}</span>
                        <span className="action-card-pick-name">{c.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {showDominance && dominancePicking && (
              <div className="action-card-picker">
                <div className="action-card-picker-title">
                  Play Dominance — pick a card
                  <button className="btn ghost small" onClick={() => setDominancePicking(false)} aria-label="Cancel">×</button>
                </div>
                <div className="action-card-picker-list">
                  {dominanceHandCards.map(id => {
                    const c = getCard(id);
                    return (
                      <button
                        key={id}
                        className="action-card-pick"
                        style={{ borderColor: SUIT_COLOR[c.suit] }}
                        onClick={() => {
                          dispatch({ kind: 'system.playDominance', faction: active!, cardId: id });
                          setDominancePicking(false);
                        }}
                      >
                        <span className="action-card-pick-suit" style={{ background: SUIT_COLOR[c.suit] }} />
                        <span className="action-card-pick-suit-label" style={{ color: SUIT_COLOR[c.suit] }}>{c.suit}</span>
                        <span className="action-card-pick-name">{c.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {showRoyalClaim && royalClaimPicking && (
              <div className="action-card-picker">
                <div className="action-card-picker-title">
                  Royal Claim — pick a card
                  <button className="btn ghost small" onClick={() => setRoyalClaimPicking(false)} aria-label="Cancel">×</button>
                </div>
                <div className="action-card-picker-list">
                  {royalClaimActions.map(({ cardId }, i) => {
                    const c = getCard(cardId);
                    return (
                      <button key={`${cardId}-${i}`} className="action-card-pick"
                        style={{ borderColor: SUIT_COLOR[c.suit] }}
                        onClick={() => { dispatch({ kind: 'card.royalClaim', faction: active!, cardId }); setRoyalClaimPicking(false); }}
                      >
                        <span className="action-card-pick-suit" style={{ background: SUIT_COLOR[c.suit] }} />
                        <span className="action-card-pick-suit-label" style={{ color: SUIT_COLOR[c.suit] }}>{c.suit}</span>
                        <span className="action-card-pick-name">{c.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {showStandAndDeliver && standAndDeliverPicking && (
              <div className="action-card-picker">
                <div className="action-card-picker-title">
                  Stand and Deliver! — pick a target
                  <button className="btn ghost small" onClick={() => setStandAndDeliverPicking(false)} aria-label="Cancel">×</button>
                </div>
                <div className="action-card-picker-list">
                  {[...new Set(standAndDeliverActions.map(a => a.target))].map(target => {
                    const first = standAndDeliverActions.find(a => a.target === target)!;
                    return (
                      <button key={target} className="action-card-pick"
                        onClick={() => { dispatch({ kind: 'card.standAndDeliver', faction: active!, cardId: first.cardId, target }); setStandAndDeliverPicking(false); }}
                      >
                        <span className="action-card-pick-name">→ <strong>{FACTION_LABEL[target]}</strong></span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {showBetterBurrowBank && betterBurrowBankPicking && (
              <div className="action-card-picker">
                <div className="action-card-picker-title">
                  Better Burrow Bank — pick a faction
                  <button className="btn ghost small" onClick={() => setBetterBurrowBankPicking(false)} aria-label="Cancel">×</button>
                </div>
                <div className="action-card-picker-list">
                  {[...new Set(betterBurrowBankActions.map(a => a.target))].map(target => {
                    const first = betterBurrowBankActions.find(a => a.target === target)!;
                    return (
                      <button key={target} className="action-card-pick"
                        onClick={() => { dispatch({ kind: 'card.betterBurrowBank', faction: active!, cardId: first.cardId, target }); setBetterBurrowBankPicking(false); }}
                      >
                        <span className="action-card-pick-name">{FACTION_LABEL[target]}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {showTaxCollector && taxCollectorPicking && (
              <div className="action-card-picker">
                <div className="action-card-picker-title">
                  Tax Collector — pick a clearing
                  <button className="btn ghost small" onClick={() => setTaxCollectorPicking(false)} aria-label="Cancel">×</button>
                </div>
                <div className="action-card-picker-list">
                  {[...new Map(taxCollectorActions.map(a => [a.clearing, a])).values()].map(a => (
                    <button key={a.clearing} className="action-card-pick"
                      onClick={() => { dispatch({ kind: 'card.taxCollector', faction: active!, cardId: a.cardId, clearing: a.clearing }); setTaxCollectorPicking(false); }}
                    >
                      <span className="action-card-pick-name">Clearing {a.clearing}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {showCommandWarren && commandWarrenPicking && (
              <div className="action-card-picker">
                <div className="action-card-picker-title">
                  Command Warren — pick a battle
                  <button className="btn ghost small" onClick={() => setCommandWarrenPicking(false)} aria-label="Cancel">×</button>
                </div>
                <div className="action-card-picker-list">
                  {commandWarrenActions.map((a, i) => (
                    <button key={i} className="action-card-pick"
                      onClick={() => { dispatch({ kind: 'card.commandWarren', faction: active!, cardId: a.cardId, clearing: a.clearing, defender: a.defender }); setCommandWarrenPicking(false); }}
                    >
                      <span className="action-card-pick-name">Attack {FACTION_LABEL[a.defender]} at Clearing {a.clearing}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {showCobbler && cobblerPicking && (
              <div className="action-card-picker">
                <div className="action-card-picker-title">
                  Cobbler — pick a move
                  <button className="btn ghost small" onClick={() => setCobblerPicking(false)} aria-label="Cancel">×</button>
                </div>
                <div className="action-card-picker-list">
                  {[...new Map(cobblerActions.map(a => [`${a.from}-${a.to}`, a])).entries()].map(([key, a]) => {
                    const max = Math.max(...cobblerActions.filter(x => x.from === a.from && x.to === a.to).map(x => x.count));
                    const best = cobblerActions.find(x => x.from === a.from && x.to === a.to && x.count === max)!;
                    return (
                      <button key={key} className="action-card-pick"
                        onClick={() => pickCardMove('card.cobbler', best.cardId, best.from, best.to, max, () => setCobblerPicking(false))}
                      >
                        <span className="action-card-pick-name">Move up to {max} from Clearing {a.from} → {a.to}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {showHiddenWarrens && hiddenWarrensPicking && (
              <div className="action-card-picker">
                <div className="action-card-picker-title">
                  Hidden Warrens — pick a move
                  <button className="btn ghost small" onClick={() => setHiddenWarrensPicking(false)} aria-label="Cancel">×</button>
                </div>
                <div className="action-card-picker-list">
                  {[...new Map(hiddenWarrensActions.map(a => [`${a.from}-${a.to}`, a])).entries()].map(([key, a]) => {
                    const max = Math.max(...hiddenWarrensActions.filter(x => x.from === a.from && x.to === a.to).map(x => x.count));
                    const best = hiddenWarrensActions.find(x => x.from === a.from && x.to === a.to && x.count === max)!;
                    return (
                      <button key={key} className="action-card-pick"
                        onClick={() => pickCardMove('card.hiddenWarrens', best.cardId, best.from, best.to, max, () => setHiddenWarrensPicking(false))}
                      >
                        <span className="action-card-pick-name">Move up to {max} from Clearing {a.from} → {a.to}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {showFeatherRufflers && featherRufflersPicking && (
              <div className="action-card-picker">
                <div className="action-card-picker-title">
                  Feather Rufflers — pick a clearing
                  <button className="btn ghost small" onClick={() => setFeatherRufflersPicking(false)} aria-label="Cancel">×</button>
                </div>
                <div className="action-card-picker-list">
                  {featherRufflersActions.map(a => (
                    <button key={a.clearing} className="action-card-pick"
                      onClick={() => { dispatch({ kind: 'card.featherRufflers', faction: active!, cardId: a.cardId, clearing: a.clearing }); setFeatherRufflersPicking(false); }}
                    >
                      <span className="action-card-pick-name">Place in Clearing {a.clearing}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {showSupplyTrain && supplyTrainPicking && (
              <div className="action-card-picker">
                <div className="action-card-picker-title">Supply Train — pick a move <button className="btn ghost small" onClick={() => setSupplyTrainPicking(false)} aria-label="Cancel">×</button></div>
                <div className="action-card-picker-list">
                  {[...new Map(supplyTrainActions.map(a => [`${a.from}-${a.to}`, a])).entries()].map(([key, a]) => {
                    const max = Math.max(...supplyTrainActions.filter(x => x.from === a.from && x.to === a.to).map(x => x.count));
                    const best = supplyTrainActions.find(x => x.from === a.from && x.to === a.to && x.count === max)!;
                    return <button key={key} className="action-card-pick" onClick={() => pickCardMove('card.supplyTrain', best.cardId, best.from, best.to, max, () => setSupplyTrainPicking(false))}><span className="action-card-pick-name">Move up to {max}: {a.from} → {a.to}</span></button>;
                  })}
                </div>
              </div>
            )}
            {showRaidingParty && raidingPartyPicking && (
              <div className="action-card-picker">
                <div className="action-card-picker-title">Raiding Party — pick a battle <button className="btn ghost small" onClick={() => setRaidingPartyPicking(false)} aria-label="Cancel">×</button></div>
                <div className="action-card-picker-list">
                  {[...new Map(raidingPartyActions.map(a => [`${a.clearing}-${a.defender}`, a])).entries()].map(([key, a]) => (
                    <button key={key} className="action-card-pick" onClick={() => { dispatch({ kind: 'card.raidingParty', faction: active!, cardId: a.cardId, clearing: a.clearing, defender: a.defender as any }); setRaidingPartyPicking(false); }}><span className="action-card-pick-name">Battle {a.defender} in {a.clearing}</span></button>
                  ))}
                </div>
              </div>
            )}
            {showStandardBearer && standardBearerPicking && (
              <div className="action-card-picker">
                <div className="action-card-picker-title">Standard Bearer — battle again <button className="btn ghost small" onClick={() => setStandardBearerPicking(false)} aria-label="Cancel">×</button></div>
                <div className="action-card-picker-list">
                  {[...new Map(standardBearerActions.map(a => [`${a.clearing}-${a.defender}`, a])).entries()].map(([key, a]) => (
                    <button key={key} className="action-card-pick" onClick={() => { dispatch({ kind: 'card.standardBearer', faction: active!, cardId: a.cardId, clearing: a.clearing, defender: a.defender as any }); setStandardBearerPicking(false); }}><span className="action-card-pick-name">Battle {a.defender} in {a.clearing}</span></button>
                  ))}
                </div>
              </div>
            )}
            {showTactician && tacticianPicking && (
              <div className="action-card-picker">
                <div className="action-card-picker-title">Tactician — move to battle clearing <button className="btn ghost small" onClick={() => setTacticianPicking(false)} aria-label="Cancel">×</button></div>
                <div className="action-card-picker-list">
                  {[...new Map(tacticianActions.map(a => [`${a.from}-${a.to}`, a])).entries()].map(([key, a]) => {
                    const max = Math.max(...tacticianActions.filter(x => x.from === a.from && x.to === a.to).map(x => x.count));
                    const best = tacticianActions.find(x => x.from === a.from && x.to === a.to && x.count === max)!;
                    return <button key={key} className="action-card-pick" onClick={() => pickCardMove('card.tactician', best.cardId, best.from, best.to, max, () => setTacticianPicking(false))}><span className="action-card-pick-name">Move up to {max}: {a.from} → {a.to}</span></button>;
                  })}
                </div>
              </div>
            )}
            {showSquires && squiresPicking && (
              <div className="action-card-picker">
                <div className="action-card-picker-title">Squires — pick a card to spend <button className="btn ghost small" onClick={() => setSquiresPicking(false)} aria-label="Cancel">×</button></div>
                <div className="action-card-picker-list">
                  {[...new Map(squiresActions.map(a => [`${a.cardId}-${a.spendCard}`, a])).entries()].map(([key, a]) => {
                    const sc = getCard(a.spendCard);
                    return <button key={key} className="action-card-pick" style={{ borderColor: SUIT_COLOR[sc.suit] }} onClick={() => { dispatch({ kind: 'card.squires', faction: active!, cardId: a.cardId, spendCard: a.spendCard }); setSquiresPicking(false); }}><span className="action-card-pick-suit" style={{ background: SUIT_COLOR[sc.suit] }} /><span className="action-card-pick-suit-label" style={{ color: SUIT_COLOR[sc.suit] }}>{sc.suit}</span><span className="action-card-pick-name">{a.spendCard === a.cardId ? getCard(a.cardId).name : sc.name}</span></button>;
                  })}
                </div>
              </div>
            )}
            {showFriendWildcard && friendWildcardPicking && (
              <div className="action-card-picker">
                <div className="action-card-picker-title">Friend — pick card to treat as any suit <button className="btn ghost small" onClick={() => setFriendWildcardPicking(false)} aria-label="Cancel">×</button></div>
                <div className="action-card-picker-list">
                  {[...new Map(friendWildcardActions.map(a => [`${a.cardId}-${a.targetCard}`, a])).entries()].map(([key, a]) => {
                    const tc = getCard(a.targetCard);
                    return <button key={key} className="action-card-pick" style={{ borderColor: SUIT_COLOR[tc.suit] }} onClick={() => { dispatch({ kind: 'card.friendWildcard', faction: active!, cardId: a.cardId, targetCard: a.targetCard }); setFriendWildcardPicking(false); }}><span className="action-card-pick-suit" style={{ background: SUIT_COLOR[tc.suit] }} /><span className="action-card-pick-suit-label" style={{ color: SUIT_COLOR[tc.suit] }}>{tc.suit}</span><span className="action-card-pick-name">{tc.name}</span></button>;
                  })}
                </div>
              </div>
            )}
            {showSpyNetwork && spyNetworkPicking && (
              <div className="action-card-picker">
                <div className="action-card-picker-title">Spy Network — give card, take persistent <button className="btn ghost small" onClick={() => setSpyNetworkPicking(false)} aria-label="Cancel">×</button></div>
                <div className="action-card-picker-list">
                  {[...new Map(spyNetworkActions.map(a => [`${a.giveCard}-${a.takeCardId}`, a])).entries()].map(([key, a]) => {
                    const gc = getCard(a.giveCard); const tc = getCard(a.takeCardId);
                    return <button key={key} className="action-card-pick" onClick={() => { dispatch({ kind: 'card.spyNetwork', faction: active!, cardId: a.cardId, giveCard: a.giveCard, target: a.target as any, takeCardId: a.takeCardId }); setSpyNetworkPicking(false); }}><span className="action-card-pick-name">Give {gc.name} → take {a.target}'s {tc.name}</span></button>;
                  })}
                </div>
              </div>
            )}
            {showShadowCouncil && shadowCouncilPicking && (
              <div className="action-card-picker">
                <div className="action-card-picker-title">Shadow Council — force a battle <button className="btn ghost small" onClick={() => setShadowCouncilPicking(false)} aria-label="Cancel">×</button></div>
                <div className="action-card-picker-list">
                  {[...new Map(shadowCouncilActions.map(a => [`${a.spendCard}-${a.clearing}-${a.forceDefender}`, a])).entries()].map(([key, a]) => {
                    const sc = getCard(a.spendCard);
                    return <button key={key} className="action-card-pick" style={{ borderColor: SUIT_COLOR[sc.suit] }} onClick={() => { dispatch({ kind: 'card.shadowCouncil', faction: active!, cardId: a.cardId, spendCard: a.spendCard, clearing: a.clearing, forceDefender: a.forceDefender as any }); setShadowCouncilPicking(false); }}><span className="action-card-pick-name">Spend {sc.name}: force {a.forceDefender} in clearing {a.clearing}</span></button>;
                  })}
                </div>
              </div>
            )}
            {showApprentice && apprenticePicking && (
              <div className="action-card-picker">
                <div className="action-card-picker-title">Apprentice — craft for free <button className="btn ghost small" onClick={() => setApprenticePicking(false)} aria-label="Cancel">×</button></div>
                <div className="action-card-picker-list">
                  {[...new Map(apprenticeActions.map(a => [`${a.craftCardId}`, a])).entries()].map(([key, a]) => {
                    const cc = getCard(a.craftCardId);
                    return <button key={key} className="action-card-pick" style={{ borderColor: SUIT_COLOR[cc.suit] }} onClick={() => { dispatch({ kind: 'card.apprenticeCraft', faction: active!, cardId: a.cardId, craftCardId: a.craftCardId }); setApprenticePicking(false); }}><span className="action-card-pick-suit" style={{ background: SUIT_COLOR[cc.suit] }} /><span className="action-card-pick-suit-label" style={{ color: SUIT_COLOR[cc.suit] }}>{cc.suit}</span><span className="action-card-pick-name">{cc.name}</span></button>;
                  })}
                </div>
              </div>
            )}
            {showSilverTongue && silverTonguePicking && (
              <div className="action-card-picker">
                <div className="action-card-picker-title">Silver-Tongue — free move (≤2 warriors) <button className="btn ghost small" onClick={() => setSilverTonguePicking(false)} aria-label="Cancel">×</button></div>
                <div className="action-card-picker-list">
                  {[...new Map(silverTongueActions.map(a => [`${a.from}-${a.to}`, a])).entries()].map(([key, a]) => {
                    const max = Math.min(2, Math.max(...silverTongueActions.filter(x => x.from === a.from && x.to === a.to).map(x => x.count)));
                    const best = silverTongueActions.find(x => x.from === a.from && x.to === a.to && x.count === max)!;
                    return <button key={key} className="action-card-pick" onClick={() => pickCardMove('card.silverTongue', best.cardId, best.from, best.to, max, () => setSilverTonguePicking(false))}><span className="action-card-pick-name">Move up to {max}: {a.from} → {a.to}</span></button>;
                  })}
                </div>
              </div>
            )}
            {pendingCardMove && (
              <div className="count-picker" role="dialog" aria-label="Choose how many warriors to move">
                <div className="count-picker-title">
                  Move from <strong>{pendingCardMove.from}</strong> → <strong>{pendingCardMove.to}</strong>
                </div>
                <div className="count-picker-row">
                  <button className="btn ghost small" onClick={() => setPendingCardMove(m => m && { ...m, pick: Math.max(1, m.pick - 1) })} disabled={pendingCardMove.pick <= 1}>−</button>
                  <span className="count-picker-value">{pendingCardMove.pick}</span>
                  <span className="count-picker-max">/ {pendingCardMove.max}</span>
                  <button className="btn ghost small" onClick={() => setPendingCardMove(m => m && { ...m, pick: Math.min(m.max, m.pick + 1) })} disabled={pendingCardMove.pick >= pendingCardMove.max}>+</button>
                  <input type="range" min={1} max={pendingCardMove.max} value={pendingCardMove.pick}
                    onChange={e => setPendingCardMove(m => m && { ...m, pick: +e.target.value })} />
                </div>
                <div className="count-picker-actions">
                  <button className="btn ghost" onClick={() => setPendingCardMove(null)}>Cancel</button>
                  <button className="btn primary" onClick={() => {
                    if (!pendingCardMove) return;
                    dispatch({ kind: pendingCardMove.kind, faction: active!, cardId: pendingCardMove.cardId, from: pendingCardMove.from, to: pendingCardMove.to, count: pendingCardMove.pick } as Action);
                    setPendingCardMove(null);
                  }}>Move {pendingCardMove.pick}</button>
                </div>
              </div>
            )}
            {showBrazenDemagog && brazenDemagogPicking && (
              <div className="action-card-picker">
                <div className="action-card-picker-title">Brazen Demagogue — discard fox card, take dominance <button className="btn ghost small" onClick={() => setBrazenDemagogPicking(false)} aria-label="Cancel">×</button></div>
                <div className="action-card-picker-list">
                  {[...new Map(brazenDemagogActions.map(a => [`${a.spendCard}`, a])).entries()].map(([key, a]) => {
                    const sc = getCard(a.spendCard);
                    return <button key={key} className="action-card-pick" style={{ borderColor: SUIT_COLOR[sc.suit] }} onClick={() => { dispatch({ kind: 'card.brazenDemagogue', faction: active!, cardId: a.cardId, spendCard: a.spendCard, takeDominance: a.takeDominance }); setBrazenDemagogPicking(false); }}><span className="action-card-pick-suit" style={{ background: SUIT_COLOR[sc.suit] }} /><span className="action-card-pick-suit-label" style={{ color: SUIT_COLOR[sc.suit] }}>{sc.suit}</span><span className="action-card-pick-name">{sc.name}</span></button>;
                  })}
                </div>
              </div>
            )}
            {showCoalition && coalitionPicking && (
              <div className="action-card-picker">
                <div className="action-card-picker-title">
                  Form Coalition — share win with the last-place faction
                  <button className="btn ghost small" onClick={() => setCoalitionPicking(false)} aria-label="Cancel">×</button>
                </div>
                <div className="action-card-picker-list">
                  {Array.from(coalitionFactions).map(f => (
                    <button
                      key={f}
                      className={`action-card-pick faction-${f}`}
                      onClick={() => { dispatch({ kind: 'vagabond.formCoalition', faction: f as Exclude<Faction, 'vagabond'> }); setCoalitionPicking(false); }}
                    >
                      <span className="action-card-pick-name">
                        {f[0].toUpperCase() + f.slice(1)}
                        <span className="dim"> — {state.scores[f] ?? 0} VP</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {showPayRelationship && (
              <div className="action-card-picker">
                <div className="action-card-picker-title">
                  You removed pieces from a non-hostile faction — discard a matching card to preserve the relationship, or accept hostility.
                  {state.factions.vagabond?.pendingRelationshipCost && (
                    <span className="dim"> (clearing suit: {state.factions.vagabond.pendingRelationshipCost.suit})</span>
                  )}
                </div>
                <div className="action-card-picker-list">
                  {Array.from(payRelCostCards).map(id => {
                    const c = getCard(id);
                    return (
                      <button
                        key={id}
                        className="action-card-pick"
                        style={{ borderColor: SUIT_COLOR[c.suit] }}
                        onClick={() => dispatch({ kind: 'vagabond.payRelationshipCost', cardId: id })}
                      >
                        <span className="action-card-pick-suit" style={{ background: SUIT_COLOR[c.suit] }} />
                        <span className="action-card-pick-suit-label" style={{ color: SUIT_COLOR[c.suit] }}>{c.suit}</span>
                        <span className="action-card-pick-name">{c.name}</span>
                      </button>
                    );
                  })}
                  {canAcceptHostility && (
                    <button
                      className="action-card-pick"
                      style={{ borderColor: '#c44' }}
                      onClick={() => dispatch({ kind: 'vagabond.acceptHostility' })}
                    >
                      <span className="action-card-pick-name" style={{ color: '#c44' }}>Accept hostility</span>
                    </button>
                  )}
                </div>
              </div>
            )}
            {showOutrage && (
              <div className="action-card-picker">
                <div className="action-card-picker-title">
                  <strong>Outrage!</strong> You moved into a clearing with Alliance sympathy.
                  {state.pendingOutrage && (
                    <span className="dim"> Clearing {state.pendingOutrage.clearing} ({state.pendingOutrage.suit})</span>
                  )}
                </div>
                <div className="action-card-picker-list">
                  {Array.from(outragePayCards).map(id => {
                    const c = getCard(id);
                    return (
                      <button
                        key={id}
                        className="action-card-pick"
                        style={{ borderColor: SUIT_COLOR[c.suit] }}
                        onClick={() => dispatch({ kind: 'system.resolveOutrage', cardId: id })}
                      >
                        <span className="action-card-pick-suit" style={{ background: SUIT_COLOR[c.suit] }} />
                        <span className="action-card-pick-suit-label" style={{ color: SUIT_COLOR[c.suit] }}>{c.suit}</span>
                        <span className="action-card-pick-name">{c.name} → Alliance supporters</span>
                      </button>
                    );
                  })}
                  {outrageAutoResolve && (
                    <button
                      className="action-card-pick"
                      style={{ borderColor: '#7da3c9' }}
                      onClick={() => dispatch({ kind: 'system.resolveOutrage' })}
                    >
                      <span className="action-card-pick-name" style={{ color: '#7da3c9' }}>No matching card — Alliance draws from deck</span>
                    </button>
                  )}
                </div>
              </div>
            )}
            {showDiscard && (
              <div className="action-card-picker">
                <div className="action-card-picker-title">
                  Discard down to hand limit — pick a card to discard
                  <span className="dim"> ({state.factions.vagabond?.pendingDiscard ?? 0} remaining)</span>
                </div>
                <div className="action-card-picker-list">
                  {Array.from(discardCardIds).map(id => {
                    const c = getCard(id);
                    return (
                      <button
                        key={id}
                        className="action-card-pick"
                        style={{ borderColor: SUIT_COLOR[c.suit] }}
                        onClick={() => dispatch({ kind: 'vagabond.discardCard', cardId: id })}
                      >
                        <span className="action-card-pick-suit" style={{ background: SUIT_COLOR[c.suit] }} />
                        <span className="action-card-pick-suit-label" style={{ color: SUIT_COLOR[c.suit] }}>{c.suit}</span>
                        <span className="action-card-pick-name">{c.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {showRemoveItem && (
              <div className="action-card-picker">
                <div className="action-card-picker-title">
                  Over item capacity — permanently remove an item from satchel or damaged box
                  <span className="dim"> ({state.factions.vagabond?.pendingItemRemoval ?? 0} remaining)</span>
                </div>
                <div className="action-card-picker-list">
                  {removeItemIdxs.map(({ itemIdx, kind, state: itemState }) => (
                    <button
                      key={itemIdx}
                      className="action-card-pick"
                      onClick={() => dispatch({ kind: 'vagabond.removeItem', itemIdx })}
                    >
                      <span className="action-card-pick-name">{kind} <span className="dim">({itemState === 'face-down' ? 'satchel' : 'damaged'})</span></span>
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

      <DebugPanel state={state} allLegals={allLegals} />
    </div>
  );
}

function DebugPanel({ state, allLegals }: { state: GameState; allLegals: Action[] }) {
  const [open, setOpen] = useState(false);
  const active = state.factionOrder[state.activeIndex];
  const m = state.factions.marquise;
  const al = state.factions.alliance;
  const v = state.factions.vagabond;
  const e = state.factions.eyrie;
  const kindCounts: Record<string, number> = {};
  for (const a of allLegals) kindCounts[a.kind] = (kindCounts[a.kind] ?? 0) + 1;

  return (
    <div className="debug-panel">
      <button className="debug-panel-toggle" onClick={() => setOpen(o => !o)}>
        🔍 debug {open ? '▲' : '▼'}
      </button>
      {open && (
        <div className="debug-panel-body">
          <div><strong>turn</strong> {state.turn} · <strong>phase</strong> {state.phase} · <strong>active</strong> {active}</div>
          {m && <div>marquise: actions={m.daylightActionsLeft} wood={m.wood} discard={m.pendingDiscard} march={m.marchMovesLeft}</div>}
          {al && <div>alliance: officers={al.officers} actions={al.daylightActionsLeft} discard={al.pendingDiscard}</div>}
          {v && <div>vagabond: actions={v.daylightActionsLeft} discard={v.pendingDiscard} removeItem={v.pendingItemRemoval}</div>}
          {e && <div>eyrie: discard={e.pendingDiscard}</div>}
          {state.pendingOutrage && <div>⚡ outrage: {state.pendingOutrage.faction} clearing {state.pendingOutrage.clearing}</div>}
          <div><strong>legal ({allLegals.length}):</strong> {Object.entries(kindCounts).map(([k, n]) => `${k}${n > 1 ? ` ×${n}` : ''}`).join(', ') || '—'}</div>
        </div>
      )}
    </div>
  );
}
