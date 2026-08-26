import { produce } from 'immer';
import type { Action, ClearingId, Faction, GameState, SetupState } from './types';
import { getCard } from './cards';
import { AUTUMN_MAP, getAdjacent } from './map';
import { mulberry32 } from './rng';
import { LEADER_VIZIER_SLOTS, type EyrieLeader } from './factions/eyrie/state';
import { STARTING_ITEMS, INITIAL_VAGABOND_STATE, type VagabondCharacter } from './factions/vagabond/state';
import { QUEST_DECK, QUEST_DISPLAY_SIZE } from './factions/vagabond/quests';
import { setupMarquise } from './factions/marquise/setup';
import { setupEyrie } from './factions/eyrie/setup';
import { setupAlliance } from './factions/alliance/setup';
import { setupVagabond } from './factions/vagabond/setup';

const CORNERS: ClearingId[] = [1, 3, 10, 12];

function oppositeCorner(corner: ClearingId): ClearingId | null {
  if (corner === 1) return 12;
  if (corner === 12) return 1;
  if (corner === 3) return 10;
  if (corner === 10) return 3;
  return null;
}

function marquiseSetupTargets(corner: ClearingId): ClearingId[] {
  return [corner, ...getAdjacent(AUTUMN_MAP, corner)];
}

function currentSetupFaction(state: GameState): Faction | null {
  if (!state.setup) return null;
  return state.setup.order[state.setup.activeIndex] ?? null;
}

function isSetupDoneForFaction(state: SetupState, faction: Faction): boolean {
  if (faction === 'marquise') return state.marquisePlacedBuildings.length >= 3;
  if (faction === 'eyrie') return state.eyrieLeaderChosen === true;
  if (faction === 'alliance') return state.allianceReady === true;
  if (faction === 'vagabond') return state.vagabondCharacterChosen === true && state.vagabondRuinChosen === true;
  return false;
}

function advanceSetupIndex(setup: SetupState): void {
  while (setup.activeIndex < setup.order.length && isSetupDoneForFaction(setup, setup.order[setup.activeIndex]!)) {
    setup.activeIndex += 1;
  }
}

function finalizeSetupIfComplete(draft: GameState): void {
  if (!draft.setup) return;
  if (draft.setup.activeIndex < draft.setup.order.length) return;
  draft.phase = 'birdsong';
  draft.activeIndex = 0;
  draft.log.push({
    turn: draft.turn,
    faction: 'system',
    message: `Game start: ${draft.factionOrder[0]} birdsong`,
  });
}

export function initializeSetupState(state: GameState): GameState {
  if (state.setup) return state;
  return produce(state, draft => {
    draft.setup = {
      order: draft.factionOrder.slice(),
      activeIndex: 0,
      marquisePlacedBuildings: [],
    };
  });
}

export function getSetupLegalActions(state: GameState): Action[] {
  if (state.phase !== 'setup' || !state.setup) return [];
  const active = currentSetupFaction(state);
  if (!active) return [];

  if (active === 'marquise' && state.factions.marquise) {
    if (!state.setup.marquiseCorner) {
      return CORNERS.map((clearing) => ({ kind: 'marquise.setupChooseCorner', clearing }) as Action);
    }
    const placed = new Set(state.setup.marquisePlacedBuildings);
    const remaining = (['sawmill', 'workshop', 'recruiter'] as const).filter((b) => !placed.has(b));
    const targets = marquiseSetupTargets(state.setup.marquiseCorner);
    const out: Action[] = [];
    for (const building of remaining) {
      for (const clearing of targets) {
        const meta = AUTUMN_MAP.clearings.find((c) => c.id === clearing);
        if (!meta) continue;
        const cl = state.map.clearings[clearing]!;
        if (cl.buildings.length >= meta.buildingSlots) continue;
        out.push({ kind: 'marquise.setupPlaceBuilding', building, clearing });
      }
    }
    return out;
  }

  if (active === 'eyrie' && state.factions.eyrie) {
    if (state.setup.eyrieLeaderChosen) return [];
    return (['despot', 'commander', 'charismatic', 'builder'] as const)
      .map((leader) => ({ kind: 'eyrie.setupChooseLeader', leader }) as Action);
  }

  if (active === 'alliance' && state.factions.alliance) {
    if (state.setup.allianceReady) return [];
    return [{ kind: 'alliance.setupReady' } as Action];
  }

  if (active === 'vagabond' && state.factions.vagabond) {
    if (!state.setup.vagabondCharacterChosen) {
      return (['thief', 'tinker', 'ranger'] as VagabondCharacter[])
        .map((character) => ({ kind: 'vagabond.setupChooseCharacter', character }) as Action);
    }
    if (!state.setup.vagabondRuinChosen) {
      return AUTUMN_MAP.clearings
        .filter((c) => c.hasRuin)
        .map((c) => ({ kind: 'vagabond.setupChooseRuin', clearing: c.id }) as Action);
    }
    return [];
  }

  return [];
}

export function reduceSetupAction(state: GameState, action: Action): GameState {
  if (state.phase !== 'setup' || !state.setup) return state;
  const active = currentSetupFaction(state);
  if (!active) return state;

  if (action.kind === 'marquise.setupChooseCorner') {
    if (active !== 'marquise') return state;
    return produce(state, draft => {
      if (!draft.setup || draft.setup.marquiseCorner) return;
      if (!CORNERS.includes(action.clearing)) return;
      const m = draft.factions.marquise;
      if (!m) return;

      const eyrieCorner = oppositeCorner(action.clearing);
      if (eyrieCorner == null) return;

      m.keep = { clearing: action.clearing };
      draft.map.clearings[action.clearing]!.tokens.push({ faction: 'marquise', kind: 'keep' });

      let placedWarriors = 0;
      for (const c of AUTUMN_MAP.clearings) {
        if (c.id === eyrieCorner) continue;
        draft.map.clearings[c.id]!.warriors.marquise = (draft.map.clearings[c.id]!.warriors.marquise ?? 0) + 1;
        placedWarriors += 1;
      }
      m.warriorSupply -= placedWarriors;
      draft.setup.marquiseCorner = action.clearing;
      draft.log.push({
        turn: draft.turn,
        faction: 'marquise',
        message: `Setup: chose corner ${action.clearing} and placed ${placedWarriors} warriors.`,
      });
    });
  }

  if (action.kind === 'marquise.setupPlaceBuilding') {
    if (active !== 'marquise') return state;
    return produce(state, draft => {
      if (!draft.setup?.marquiseCorner) return;
      const m = draft.factions.marquise;
      if (!m) return;
      if (draft.setup.marquisePlacedBuildings.includes(action.building)) return;
      const targets = marquiseSetupTargets(draft.setup.marquiseCorner);
      if (!targets.includes(action.clearing)) return;
      const meta = AUTUMN_MAP.clearings.find((c) => c.id === action.clearing);
      if (!meta) return;
      const cl = draft.map.clearings[action.clearing]!;
      if (cl.buildings.length >= meta.buildingSlots) return;
      cl.buildings.push({ faction: 'marquise', kind: action.building });
      m.buildings[action.building] += 1;
      draft.setup.marquisePlacedBuildings.push(action.building);
      draft.log.push({
        turn: draft.turn,
        faction: 'marquise',
        message: `Setup: placed ${action.building} in clearing ${action.clearing}.`,
      });
      advanceSetupIndex(draft.setup);
      draft.activeIndex = Math.min(draft.setup.activeIndex, Math.max(0, draft.factionOrder.length - 1));
      finalizeSetupIfComplete(draft);
    });
  }

  if (action.kind === 'eyrie.setupChooseLeader') {
    if (active !== 'eyrie') return state;
    return produce(state, draft => {
      if (!draft.setup || draft.setup.eyrieLeaderChosen) return;
      const e = draft.factions.eyrie;
      if (!e) return;
      const marquiseCorner = draft.setup.marquiseCorner ?? 1;
      const corner = oppositeCorner(marquiseCorner);
      if (!corner) return;
      const cl = draft.map.clearings[corner]!;

      const removed = cl.warriors.marquise ?? 0;
      if (removed > 0) {
        cl.warriors.marquise = 0;
        if (draft.factions.marquise) draft.factions.marquise.warriorSupply += removed;
      }

      cl.buildings.push({ faction: 'eyrie', kind: 'roost' });
      e.roosts.push(corner);
      cl.warriors.eyrie = (cl.warriors.eyrie ?? 0) + 6;
      e.warriorSupply -= 6;

      const birdIdx = draft.deck.map((id, i) => ({ id, i, suit: getCard(id).suit }))
        .filter((x) => x.suit === 'bird')
        .slice(0, 2);
      for (const x of birdIdx.reverse()) {
        e.viziers.push(x.id);
        draft.deck.splice(x.i, 1);
      }

      e.leader = action.leader as EyrieLeader;
      e.needsLeaderChoice = false;
      const slots = LEADER_VIZIER_SLOTS[e.leader];
      if (e.viziers[0]) e.decree[slots[0]].push(e.viziers[0]);
      if (e.viziers[1]) e.decree[slots[1]].push(e.viziers[1]);

      draft.setup.eyrieLeaderChosen = true;
      draft.log.push({
        turn: draft.turn,
        faction: 'eyrie',
        message: `Setup: roost + 6 warriors in clearing ${corner}; leader = ${e.leader}.`,
      });
      advanceSetupIndex(draft.setup);
      draft.activeIndex = Math.min(draft.setup.activeIndex, Math.max(0, draft.factionOrder.length - 1));
      finalizeSetupIfComplete(draft);
    });
  }

  if (action.kind === 'alliance.setupReady') {
    if (active !== 'alliance') return state;
    return produce(state, draft => {
      if (!draft.setup || draft.setup.allianceReady) return;
      const a = draft.factions.alliance;
      if (!a) return;
      for (let i = 0; i < 3; i++) {
        const c = draft.deck.pop();
        if (c) a.supporters.push(c);
      }
      draft.setup.allianceReady = true;
      draft.log.push({
        turn: draft.turn,
        faction: 'alliance',
        message: `Setup: drew ${a.supporters.length} supporters.`,
      });
      advanceSetupIndex(draft.setup);
      draft.activeIndex = Math.min(draft.setup.activeIndex, Math.max(0, draft.factionOrder.length - 1));
      finalizeSetupIfComplete(draft);
    });
  }

  if (action.kind === 'vagabond.setupChooseCharacter') {
    if (active !== 'vagabond') return state;
    return produce(state, draft => {
      if (!draft.setup || draft.setup.vagabondCharacterChosen) return;
      const v = draft.factions.vagabond;
      if (!v) return;
      v.character = action.character;
      v.items = [];
      draft.setup.vagabondCharacterChosen = true;
      draft.log.push({ turn: draft.turn, faction: 'vagabond', message: `Setup: chose ${action.character}.` });
    });
  }

  if (action.kind === 'vagabond.setupChooseRuin') {
    if (active !== 'vagabond') return state;
    return produce(state, draft => {
      if (!draft.setup || !draft.setup.vagabondCharacterChosen || draft.setup.vagabondRuinChosen) return;
      const v = draft.factions.vagabond;
      if (!v) return;
      const ruin = AUTUMN_MAP.clearings.find((c) => c.id === action.clearing && c.hasRuin);
      if (!ruin) return;

      if (draft.map.clearings[v.clearing]) {
        draft.map.clearings[v.clearing]!.vagabondHere = false;
      }
      v.clearing = action.clearing;
      draft.map.clearings[v.clearing]!.vagabondHere = true;

      const startItems = STARTING_ITEMS[v.character];
      v.items = [];
      for (const kind of startItems) {
        v.items.push({ kind, state: 'face-up', exhausted: false });
      }
      v.relationships = { ...INITIAL_VAGABOND_STATE.relationships };

      const ids = QUEST_DECK.map((q) => q.id);
      const rng = mulberry32(draft.seed ^ 0xfa11);
      for (let i = ids.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [ids[i], ids[j]] = [ids[j], ids[i]];
      }
      v.questDeck = ids;
      v.questDisplay = [];
      while (v.questDisplay.length < QUEST_DISPLAY_SIZE && v.questDeck.length > 0) {
        v.questDisplay.push(v.questDeck.shift()!);
      }

      draft.setup.vagabondRuinChosen = true;
      draft.log.push({
        turn: draft.turn,
        faction: 'vagabond',
        message: `Setup: ${v.character} at clearing ${v.clearing} with ${startItems.length} items.`,
      });
      advanceSetupIndex(draft.setup);
      draft.activeIndex = Math.min(draft.setup.activeIndex, Math.max(0, draft.factionOrder.length - 1));
      finalizeSetupIfComplete(draft);
    });
  }

  return state;
}

export function performSetup(state: GameState): GameState {
  let s = state;
  if (s.factions.marquise) s = setupMarquise(s);
  if (s.factions.eyrie)    s = setupEyrie(s);
  if (s.factions.alliance) s = setupAlliance(s);
  if (s.factions.vagabond) s = setupVagabond(s);
  return produce(s, draft => {
    draft.log.push({
      turn: draft.turn,
      faction: 'system',
      message: 'Setup complete.',
    });
  });
}
