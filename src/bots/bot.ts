// Simple greedy bot. Phase 6 will replace per-faction with Clockwork-style
// decision tables; this baseline ensures a non-human faction always
// progresses the game and never gets stuck.

import type { GameState, Action, Faction } from '../engine/types';
import { getLegalActions } from '../engine/legal';
import { pickEyrieAction } from './eyrie';
import { AUTUMN_MAP, getAdjacent } from '../engine/map';

/** Heuristic priorities — higher first. */
const PRIORITY: Record<string, number> = {
  // Score-generating
  'marquise.build':                 100,
  'marquise.beginMarch':             60,
  'marquise.march':                  60,
  'marquise.endMarch':               10,
  'marquise.craftDecision':          95,
  'marquise.craft':                  90,
  'marquise.finishCrafting':         20,
  'eyrie.chooseLeader':              95,   // must happen before decree adds
  'eyrie.resolveDecree':            100,   // only offered when turmoil is forced
  'eyrie.resolveTurmoilStep':       110,
  'eyrie.executeRecruit':           100,
  'eyrie.executeMove':               90,
  'eyrie.executeBattle':             85,
  'eyrie.executeBuild':             100,
  'alliance.spreadSympathy':        100,
  'alliance.revolt':                100,
  'alliance.organize':               80,
  'vagabond.exploreRuin':           100,
  'vagabond.aid':                    60,
  'vagabond.strike':                 50,
  // Resource-building
  'marquise.placeWood':              80,
  'marquise.recruit':                70,
  'marquise.overwork':               40,
  'vagabond.refresh':                80,
  'vagabond.pickRefreshItem':        60,
  'vagabond.skipRefreshItem':         5,
  'vagabond.moveAllyWarriors':       40,
  'vagabond.skipAllyMove':            5,
  'vagabond.move':                   30,
  'eyrie.addToDecree':               60,
  'alliance.mobilize':               40,
  // Battles only when score-positive (default low)
  'marquise.battle':                 20,
  'eyrie.battle':                    20,
  'alliance.battle':                 20,
  'alliance.recruit':                70,
  // Combat prompts — bot ambushes when it can, otherwise skips.
  'combat.playAmbush':               50,
  'combat.chooseOptional':           40,
  'combat.chooseRemovalPieces':      35,
  'combat.resolveFieldHospitals':    30,
  'combat.skipAmbush':                5,
  // Discard resolution — high priority so a stuck bot clears it immediately
  'marquise.discardCard':            35,
  'eyrie.discardCard':               35,
  'alliance.discardCard':            35,
  'vagabond.discardCard':            35,
  'vagabond.removeItem':             35,
  // Phase-ending fallbacks
  'eyrie.endBirdsong':               65,  // higher than addToDecree so bot adds 1 card then stops
  'eyrie.endCrafting':                65,
  'marquise.endDaylight':             1,
  'alliance.endDaylight':             1,
  'vagabond.payRelationshipCost':     30, // prefer paying to preserve relationships
  'vagabond.acceptHostility':         10,
  'system.resolveOutrage':            25,
  'vagabond.endDaylight':             1,
  'marquise.evening':                10,
  'eyrie.evening':                   10,
  'alliance.evening':                10,
  'vagabond.evening':                10,
  'system.advancePhase':              5,
  'system.endTurn':                   2,
};

function seededJitter(state: GameState, salt: number): number {
  const x = (Math.imul(state.seed >>> 0, 1664525) + Math.imul((state.rngStep + 1 + salt) >>> 0, 1013904223)) >>> 0;
  return (x % 1000) / 1000;
}

function pickSetupAction(state: GameState, legals: Action[]): Action | null {
  if (legals.length === 0) return null;

  const cornerChoices = legals.filter((a): a is Extract<Action, { kind: 'marquise.setupChooseCorner' }> => a.kind === 'marquise.setupChooseCorner');
  if (cornerChoices.length > 0) {
    let best = cornerChoices[0]!;
    let bestScore = -Infinity;
    for (const choice of cornerChoices) {
      const targets = [choice.clearing, ...getAdjacent(AUTUMN_MAP, choice.clearing)];
      const slotScore = targets.reduce((sum, id) => {
        const meta = AUTUMN_MAP.clearings.find((c) => c.id === id);
        return sum + (meta?.buildingSlots ?? 0);
      }, 0);
      const score = slotScore + seededJitter(state, choice.clearing);
      if (score > bestScore) {
        bestScore = score;
        best = choice;
      }
    }
    return best;
  }

  const setupBuildings = legals.filter((a): a is Extract<Action, { kind: 'marquise.setupPlaceBuilding' }> => a.kind === 'marquise.setupPlaceBuilding');
  if (setupBuildings.length > 0) {
    const buildingBase: Record<'sawmill' | 'workshop' | 'recruiter', number> = {
      sawmill: 6,
      recruiter: 5,
      workshop: 4,
    };
    let best = setupBuildings[0]!;
    let bestScore = -Infinity;
    for (const choice of setupBuildings) {
      const degree = getAdjacent(AUTUMN_MAP, choice.clearing).length;
      const suit = AUTUMN_MAP.clearings.find((c) => c.id === choice.clearing)?.suit;
      const suitBonus = suit === 'rabbit' ? 0.3 : 0;
      const score = buildingBase[choice.building] + degree * 0.25 + suitBonus + seededJitter(state, choice.clearing * 11);
      if (score > bestScore) {
        bestScore = score;
        best = choice;
      }
    }
    return best;
  }

  const leaders = legals.filter((a): a is Extract<Action, { kind: 'eyrie.setupChooseLeader' }> => a.kind === 'eyrie.setupChooseLeader');
  if (leaders.length > 0) {
    const weights: Record<string, number> = { charismatic: 4, commander: 3, despot: 2, builder: 2 };
    let best = leaders[0]!;
    let bestScore = -Infinity;
    for (const choice of leaders) {
      const score = (weights[choice.leader] ?? 1) + seededJitter(state, choice.leader.length * 13);
      if (score > bestScore) {
        bestScore = score;
        best = choice;
      }
    }
    return best;
  }

  const vagabondChars = legals.filter((a): a is Extract<Action, { kind: 'vagabond.setupChooseCharacter' }> => a.kind === 'vagabond.setupChooseCharacter');
  if (vagabondChars.length > 0) {
    let best = vagabondChars[0]!;
    let bestScore = -Infinity;
    for (const choice of vagabondChars) {
      const score = (choice.character === 'thief' ? 0.25 : 0) + seededJitter(state, choice.character.length * 17);
      if (score > bestScore) {
        bestScore = score;
        best = choice;
      }
    }
    return best;
  }

  const vagabondRuins = legals.filter((a): a is Extract<Action, { kind: 'vagabond.setupChooseRuin' }> => a.kind === 'vagabond.setupChooseRuin');
  if (vagabondRuins.length > 0) {
    let best = vagabondRuins[0]!;
    let bestScore = -Infinity;
    for (const choice of vagabondRuins) {
      const degree = getAdjacent(AUTUMN_MAP, choice.clearing).length;
      const score = degree * 0.35 + seededJitter(state, choice.clearing * 19);
      if (score > bestScore) {
        bestScore = score;
        best = choice;
      }
    }
    return best;
  }

  return legals[0] ?? null;
}

export function pickAction(state: GameState): Action | null {
  const legals = getLegalActions(state);
  if (legals.length === 0) return null;
  if (state.phase === 'setup') {
    return pickSetupAction(state, legals);
  }
  // Faction-specific picker overrides the priority table where the priority
  // table is too coarse — Eyrie Decree composition is the obvious one.
  const active = state.factionOrder[state.activeIndex];
  if (active === 'eyrie') {
    const eyriePick = pickEyrieAction(state, legals);
    if (eyriePick) return eyriePick;
  }
  // Sort by priority desc; tie-break random-ish by stable order.
  const sorted = legals.slice().sort((a, b) => (PRIORITY[b.kind] ?? 0) - (PRIORITY[a.kind] ?? 0));
  return sorted[0] ?? null;
}

/** Apply bot actions until the active faction is `humanFaction` or the game ends. */
export function playUntilHuman(
  state: GameState,
  reducer: (s: GameState, a: Action) => GameState,
  humanFaction: Faction | null,
  maxSteps = 200,
): GameState {
  let s = state;
  for (let i = 0; i < maxSteps; i++) {
    if (s.winner) return s;
    if (s.phase === 'gameOver') return s;
    const active = s.factionOrder[s.activeIndex];
    if (active === humanFaction) return s;
    // Also stop when the human must respond to a pending prompt (e.g. defender ambush).
    if (humanFaction && s.pendingPrompts.length > 0 && s.pendingPrompts[0]!.faction === humanFaction) return s;
    const a = pickAction(s);
    if (!a) return s;
    const next = reducer(s, a);
    if (next === s) {
      // Stuck — try a system phase advance.
      const adv = reducer(s, { kind: 'system.advancePhase' });
      if (adv === s) return s;
      s = adv;
    } else {
      s = next;
    }
  }
  return s;
}
