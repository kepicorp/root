import { produce } from 'immer';
import type { GameState, Action, ClearingId } from '../../types';
import type { CardId } from '../../cards';
import { getCard } from '../../cards';
import { AUTUMN_MAP, getAdjacent } from '../../map';
import { resolveCombat } from '../../combat';
import { onEnterBirdsong } from '../../loop';
import { ROOST_VP_TRACK, LEADER_VIZIER_SLOTS, type EyrieLeader, type DecreeSlot, type EyrieState } from './state';
import { findSlotTarget, eyrieRules, suitMatches } from './decree';
import type { EyrieAction } from './actions';

function isEyrieTurn(state: GameState): boolean {
  return state.factionOrder[state.activeIndex] === 'eyrie';
}

const NEXT_LEADER: Record<EyrieLeader, EyrieLeader> = {
  despot: 'commander', commander: 'charismatic', charismatic: 'builder', builder: 'despot',
};

const RESOLUTION_ORDER: DecreeSlot[] = ['recruit', 'move', 'battle', 'build'];

function ensureResolution(e: EyrieState): void {
  if (e.resolutionLeft) return;
  e.resolutionLeft = {
    recruit: e.decree.recruit.length,
    move:    e.decree.move.length,
    battle:  e.decree.battle.length,
    build:   e.decree.build.length,
  };
}

/** Returns the next slot in resolution order that still has cards to
 *  resolve, or null when the player is done. */
function currentSlot(e: EyrieState): DecreeSlot | null {
  if (!e.resolutionLeft) return e.decree.recruit.length > 0 ? 'recruit'
                              : e.decree.move.length > 0    ? 'move'
                              : e.decree.battle.length > 0  ? 'battle'
                              : e.decree.build.length > 0   ? 'build'
                              : null;
  for (const s of RESOLUTION_ORDER) if (e.resolutionLeft[s] > 0) return s;
  return null;
}

/** The card whose effect the player must resolve next within `slot`. */
function nextCardForSlot(e: EyrieState, slot: DecreeSlot): CardId | null {
  const all = e.decree[slot];
  if (!e.resolutionLeft) return all[0] ?? null;
  const idx = all.length - e.resolutionLeft[slot];
  return all[idx] ?? null;
}

/** All slots empty → advance to evening + log + reset counters. */
function maybeFinishResolution(draft: GameState): void {
  const e = draft.factions.eyrie!;
  if (currentSlot(e) != null) return;
  e.resolutionLeft = undefined;
  e.decreeResolved = true;
  draft.phase = 'evening';
  draft.log.push({ turn: draft.turn, faction: 'eyrie', message: 'Decree resolved.' });
}

function triggerTurmoil(draft: GameState): void {
  const e = draft.factions.eyrie!;
  // Lose 1 VP for EVERY bird card in the Decree, including Loyal Viziers.
  // Then remove all non-Loyal cards; viziers stay.
  let vpLost = 0;
  for (const slot of RESOLUTION_ORDER) {
    const keep: CardId[] = [];
    for (const id of e.decree[slot]) {
      if (getCard(id).suit === 'bird') vpLost += 1;  // count ALL bird cards
      if (e.viziers.includes(id)) keep.push(id);     // keep viziers
      else draft.discard.push(id);                    // discard the rest
    }
    e.decree[slot] = keep;
  }
  draft.scores.eyrie = Math.max(0, draft.scores.eyrie - vpLost);
  if (e.usedLeaders.length >= 3) e.usedLeaders = [];
  e.usedLeaders.push(e.leader);
  e.leader = NEXT_LEADER[e.leader];
  // Wipe decree completely (viziers are still in e.viziers; they'll be
  // re-seated in the chosen leader's slots when chooseLeader is called).
  e.decree = { recruit: [], move: [], battle: [], build: [] };
  e.resolutionLeft = undefined;
  e.decreeResolved = true;
  e.needsLeaderChoice = true;
  draft.phase = 'evening';
  draft.log.push({
    turn: draft.turn,
    faction: 'eyrie',
    message: `Turmoil! lost ${vpLost} VP. New leader: ${e.leader}.`,
  });
}

export function eyrieReducer(state: GameState, action: Action): GameState {
  if (!action.kind.startsWith('eyrie.')) return state;
  if (!isEyrieTurn(state)) return state;
  const a = action as EyrieAction;

  switch (a.kind) {
    case 'eyrie.chooseLeader':
      return produce(state, draft => {
        const e = draft.factions.eyrie!;
        const changing = e.leader !== a.leader;
        e.leader = a.leader;
        e.needsLeaderChoice = false;
        // After Turmoil the decree was cleared; re-seat the viziers in the
        // slots specified by the newly chosen leader.  On the very first turn
        // the viziers were placed by setupEyrie so only re-place after Turmoil
        // (signalled by the decree being otherwise empty).
        const totalDecreeCards = Object.values(e.decree).flat().length;
        if (totalDecreeCards === 0) {
          // Decree just reset — re-place viziers for this leader.
          const slots = LEADER_VIZIER_SLOTS[a.leader];
          if (e.viziers[0]) e.decree[slots[0]].push(e.viziers[0]);
          if (e.viziers[1]) e.decree[slots[1]].push(e.viziers[1]);
        } else if (changing) {
          // Mid-game leader swap (shouldn't happen per rules, but keep it safe).
          // Remove viziers from wherever they currently sit and re-place them.
          for (const slot of ['recruit', 'move', 'battle', 'build'] as const) {
            e.decree[slot] = e.decree[slot].filter(id => !e.viziers.includes(id));
          }
          const slots = LEADER_VIZIER_SLOTS[a.leader];
          if (e.viziers[0]) e.decree[slots[0]].push(e.viziers[0]);
          if (e.viziers[1]) e.decree[slots[1]].push(e.viziers[1]);
        }
        draft.log.push({ turn: draft.turn, faction: 'eyrie', message: `Leader chosen: ${a.leader}.` });
      });

    case 'eyrie.addToDecree':
      return produce(state, draft => {
        const e = draft.factions.eyrie!;
        if (draft.phase !== 'birdsong') return;
        if (e.needsLeaderChoice) return; // must pick leader first
        if (e.cardsAddedThisBirdsong >= 2) return; // max 2 adds per birdsong
        const idx = draft.hands.eyrie.indexOf(a.cardId);
        if (idx < 0) return;
        draft.hands.eyrie.splice(idx, 1);
        e.decree[a.slot].push(a.cardId);
        e.cardsAddedThisBirdsong += 1;
      });

    case 'eyrie.endBirdsong':
      return produce(state, draft => {
        draft.factions.eyrie!.birdsongDone = true;
        draft.phase = 'daylight';
      });

    case 'eyrie.executeRecruit':
      return produce(state, draft => {
        if (draft.phase !== 'daylight') return;
        const e = draft.factions.eyrie!;
        if (e.decreeResolved) return;
        ensureResolution(e);
        if (currentSlot(e) !== 'recruit') return;
        const cardId = nextCardForSlot(e, 'recruit');
        if (!cardId) return;
        const meta = AUTUMN_MAP.clearings.find(c => c.id === a.clearing);
        if (!meta) return;
        if (!suitMatches(getCard(cardId).suit, meta.suit)) return;
        const cl = draft.map.clearings[a.clearing]!;
        const hasRoost = cl.buildings.some(b => b.faction === 'eyrie' && b.kind === 'roost');
        if (!hasRoost) return;
        if (e.warriorSupply <= 0) return;
        cl.warriors.eyrie = (cl.warriors.eyrie ?? 0) + 1;
        e.warriorSupply -= 1;
        e.resolutionLeft!.recruit -= 1;
        draft.log.push({ turn: draft.turn, faction: 'eyrie', message: `Recruited 1 at clearing ${a.clearing}.` });
        maybeFinishResolution(draft);
      });

    case 'eyrie.executeMove':
      return produce(state, draft => {
        if (draft.phase !== 'daylight') return;
        const e = draft.factions.eyrie!;
        if (e.decreeResolved) return;
        ensureResolution(e);
        if (currentSlot(e) !== 'move') return;
        const cardId = nextCardForSlot(e, 'move');
        if (!cardId) return;
        const fromMeta = AUTUMN_MAP.clearings.find(c => c.id === a.from);
        if (!fromMeta) return;
        if (!suitMatches(getCard(cardId).suit, fromMeta.suit)) return;
        if (!getAdjacent(AUTUMN_MAP, a.from).includes(a.to)) return;
        if (!(eyrieRules(draft, a.from) || eyrieRules(draft, a.to))) return;
        const fromCl = draft.map.clearings[a.from]!;
        const toCl = draft.map.clearings[a.to]!;
        const available = fromCl.warriors.eyrie ?? 0;
        if (available <= 0) return;
        const moving = Math.max(1, Math.min(a.count, available));
        fromCl.warriors.eyrie = available - moving;
        toCl.warriors.eyrie = (toCl.warriors.eyrie ?? 0) + moving;
        e.resolutionLeft!.move -= 1;
        draft.lastMoveClearing = a.to;
        draft.log.push({ turn: draft.turn, faction: 'eyrie', message: `Moved 1 from ${a.from} → ${a.to}.` });
        maybeFinishResolution(draft);
      });

    case 'eyrie.executeBattle': {
      // Same shape as 'eyrie.executeBuild' below — validate, then apply.
      // Combat dice need to run outside the produce() draft so we resolve
      // it explicitly here.
      if (state.phase !== 'daylight') return state;
      const e0 = state.factions.eyrie!;
      if (e0.decreeResolved) return state;
      const pre = produce(state, draft => { ensureResolution(draft.factions.eyrie!); });
      const e = pre.factions.eyrie!;
      if (currentSlot(e) !== 'battle') return state;
      const cardId = nextCardForSlot(e, 'battle');
      if (!cardId) return state;
      const meta = AUTUMN_MAP.clearings.find(c => c.id === a.clearing);
      if (!meta || !suitMatches(getCard(cardId).suit, meta.suit)) return state;
      const cl = pre.map.clearings[a.clearing]!;
      if ((cl.warriors.eyrie ?? 0) <= 0) return state;
      const hasEnemy = (cl.warriors[a.defender] ?? 0) > 0
        || cl.buildings.some(b => b.faction === a.defender)
        || cl.tokens.some(t => t.faction === a.defender);
      if (!hasEnemy) return state;
      let s = resolveCombat(pre, { clearing: a.clearing, attacker: 'eyrie', defender: a.defender });
      s = produce(s, draft => {
        draft.factions.eyrie!.resolutionLeft!.battle -= 1;
        draft.lastBattleClearing = a.clearing;
        maybeFinishResolution(draft);
      });
      return s;
    }

    case 'eyrie.executeBuild':
      return produce(state, draft => {
        if (draft.phase !== 'daylight') return;
        const e = draft.factions.eyrie!;
        if (e.decreeResolved) return;
        ensureResolution(e);
        if (currentSlot(e) !== 'build') return;
        const cardId = nextCardForSlot(e, 'build');
        if (!cardId) return;
        const meta = AUTUMN_MAP.clearings.find(c => c.id === a.clearing);
        if (!meta || !suitMatches(getCard(cardId).suit, meta.suit)) return;
        if (!eyrieRules(draft, a.clearing)) return;
        const cl = draft.map.clearings[a.clearing]!;
        if (cl.buildings.some(b => b.faction === 'eyrie' && b.kind === 'roost')) return;
        const used = cl.buildings.length + cl.tokens.filter(t => t.kind === 'keep').length;
        if (used >= meta.buildingSlots) return;
        if (e.roosts.length >= 7) return;
        cl.buildings.push({ faction: 'eyrie', kind: 'roost' });
        e.roosts.push(a.clearing);
        e.resolutionLeft!.build -= 1;
        draft.log.push({ turn: draft.turn, faction: 'eyrie', message: `Built roost at clearing ${a.clearing}.` });
        maybeFinishResolution(draft);
      });

    case 'eyrie.resolveDecree': {
      // Auto-resolve whatever's left of the current Decree resolution.
      // The bot uses this; humans get it as an "auto-resolve rest" button.
      let s = state;
      if (s.phase !== 'daylight') return s;
      let e = s.factions.eyrie!;
      if (e.decreeResolved) return s;
      s = produce(s, draft => { ensureResolution(draft.factions.eyrie!); });
      e = s.factions.eyrie!;
      let failed = false;
      for (const slot of RESOLUTION_ORDER) {
        if (failed) break;
        while (e.resolutionLeft![slot] > 0) {
          const cardId = nextCardForSlot(e, slot);
          if (!cardId) break;
          const target = findSlotTarget(s, slot, cardId);
          if (target == null) { failed = true; break; }
          if (slot === 'battle') {
            const cl = s.map.clearings[target]!;
            const enemy = (['marquise', 'alliance', 'vagabond'] as const).find(f =>
              (cl.warriors[f] ?? 0) > 0
              || cl.buildings.some(b => b.faction === f)
              || cl.tokens.some(t => t.faction === f),
            );
            if (!enemy) { failed = true; break; }
            s = resolveCombat(s, { clearing: target, attacker: 'eyrie', defender: enemy });
            s = produce(s, draft => { draft.factions.eyrie!.resolutionLeft!.battle -= 1; });
          } else if (slot === 'move') {
            s = produce(s, draft => {
              const adj = getAdjacent(AUTUMN_MAP, target);
              let bestDest = adj[0]!;
              let bestScore = -1;
              for (const d of adj) {
                const dc = draft.map.clearings[d]!;
                const enemyW = (dc.warriors.marquise ?? 0) + (dc.warriors.alliance ?? 0) + (dc.warriors.vagabond ?? 0);
                const enemyP = dc.buildings.filter(b => b.faction !== 'eyrie').length
                             + dc.tokens.filter(t => t.faction !== 'eyrie').length;
                const score = enemyW * 2 + enemyP;
                if (score > bestScore) { bestScore = score; bestDest = d; }
              }
              const fromCl = draft.map.clearings[target]!;
              const toCl = draft.map.clearings[bestDest]!;
              const moving = Math.min(fromCl.warriors.eyrie ?? 0, 1);
              fromCl.warriors.eyrie = (fromCl.warriors.eyrie ?? 0) - moving;
              toCl.warriors.eyrie = (toCl.warriors.eyrie ?? 0) + moving;
              draft.factions.eyrie!.resolutionLeft!.move -= 1;
            });
          } else if (slot === 'recruit') {
            s = produce(s, draft => {
              const cl = draft.map.clearings[target]!;
              const ee = draft.factions.eyrie!;
              cl.warriors.eyrie = (cl.warriors.eyrie ?? 0) + 1;
              ee.warriorSupply -= 1;
              ee.resolutionLeft!.recruit -= 1;
            });
          } else { // build
            s = produce(s, draft => {
              const cl = draft.map.clearings[target]!;
              const ee = draft.factions.eyrie!;
              cl.buildings.push({ faction: 'eyrie', kind: 'roost' });
              ee.roosts.push(target as ClearingId);
              ee.resolutionLeft!.build -= 1;
            });
          }
          e = s.factions.eyrie!;
        }
      }
      return produce(s, draft => {
        if (failed) triggerTurmoil(draft);
        else maybeFinishResolution(draft);
      });
    }

    case 'eyrie.evening':
      return produce(state, draft => {
        if (draft.phase !== 'evening') return;
        const e = draft.factions.eyrie!;
        if (e.pendingDiscard > 0) return;
        const vp = ROOST_VP_TRACK[Math.min(e.roosts.length, ROOST_VP_TRACK.length - 1)] ?? 0;
        draft.scores.eyrie += vp;
        const draws = 1 + Math.floor(e.roosts.length / 3);
        for (let i = 0; i < draws; i++) {
          const c = draft.deck.pop();
          if (!c) break;
          draft.hands.eyrie.push(c);
        }
        const excess = draft.hands.eyrie.length - 5;
        if (excess > 0) {
          e.pendingDiscard = excess;
          draft.log.push({ turn: draft.turn, faction: 'eyrie', message: `Evening: scored ${vp} VP, drew ${draws}, must discard ${excess}.` });
          return;
        }
        finishEyrieTurn(draft, vp, draws);
      });

    case 'eyrie.discardCard':
      return produce(state, draft => {
        const e = draft.factions.eyrie!;
        if (e.pendingDiscard <= 0) return;
        const idx = draft.hands.eyrie.indexOf(a.cardId);
        if (idx < 0) return;
        draft.hands.eyrie.splice(idx, 1);
        draft.discard.push(a.cardId);
        e.pendingDiscard -= 1;
        if (e.pendingDiscard === 0) finishEyrieTurn(draft, 0, 0);
      });

    default:
      return state;
  }
}

function finishEyrieTurn(draft: GameState, _vp: number, _draws: number): void {
  const e = draft.factions.eyrie!;
  e.birdsongDone = false;
  e.decreeResolved = false;
  e.eveningDone = true;
  e.cardsAddedThisBirdsong = 0;
  e.resolutionLeft = undefined;
  e.pendingDiscard = 0;
  draft.activeIndex = (draft.activeIndex + 1) % draft.factionOrder.length;
  if (draft.activeIndex === 0) draft.turn += 1;
  draft.phase = 'birdsong';
  draft.log.push({ turn: draft.turn, faction: 'eyrie', message: `Turn ends; next: ${draft.factionOrder[draft.activeIndex]} birdsong.` });
  onEnterBirdsong(draft);
}

export function eyrieLegalActions(state: GameState): Action[] {
  if (!isEyrieTurn(state)) return [];
  const out: Action[] = [];
  const e = state.factions.eyrie;
  if (!e) return out;
  if (state.phase === 'birdsong') {
    // Official rule: exactly one card added to the Decree per birdsong.
    if (!e.needsLeaderChoice && e.cardsAddedThisBirdsong < 2) {
      for (const cardId of state.hands.eyrie) {
        for (const slot of ['recruit', 'move', 'battle', 'build'] as const) {
          out.push({ kind: 'eyrie.addToDecree', slot, cardId });
        }
      }
    }
    // Leader pick — see task for timing; conditional handled in legals below.
    if (e.needsLeaderChoice) {
      // Show ALL four leaders so the player can confirm the current default
      // (Despot on turn 1) or switch to any other.
      for (const leader of ['despot', 'commander', 'charismatic', 'builder'] as const) {
        out.push({ kind: 'eyrie.chooseLeader', leader });
      }
    }
    out.push({ kind: 'eyrie.endBirdsong' });
  }
  if (state.phase === 'daylight' && !e.decreeResolved) {
    out.push({ kind: 'eyrie.resolveDecree' });
    // What slot is the player currently draining? Generate every legal
    // execute-step for that slot so the UI can highlight clearings.
    const slot = currentSlot(e);
    const cardId = slot ? nextCardForSlot(e, slot) : null;
    if (slot && cardId) {
      const cardSuit = getCard(cardId).suit;
      for (const cm of AUTUMN_MAP.clearings) {
        if (!suitMatches(cardSuit, cm.suit)) continue;
        const cl = state.map.clearings[cm.id]!;
        if (slot === 'recruit') {
          const hasRoost = cl.buildings.some(b => b.faction === 'eyrie' && b.kind === 'roost');
          if (hasRoost && e.warriorSupply > 0) {
            out.push({ kind: 'eyrie.executeRecruit', clearing: cm.id });
          }
        } else if (slot === 'move') {
          const warriors = cl.warriors.eyrie ?? 0;
          if (warriors <= 0) continue;
          for (const nb of getAdjacent(AUTUMN_MAP, cm.id)) {
            if (eyrieRules(state, cm.id) || eyrieRules(state, nb)) {
              out.push({ kind: 'eyrie.executeMove', from: cm.id, to: nb, count: warriors });
            }
          }
        } else if (slot === 'battle') {
          if ((cl.warriors.eyrie ?? 0) <= 0) continue;
          for (const f of ['marquise', 'alliance', 'vagabond'] as const) {
            if ((cl.warriors[f] ?? 0) > 0
                || cl.buildings.some(b => b.faction === f)
                || cl.tokens.some(t => t.faction === f)) {
              out.push({ kind: 'eyrie.executeBattle', clearing: cm.id, defender: f });
            }
          }
        } else if (slot === 'build') {
          if (!eyrieRules(state, cm.id)) continue;
          if (cl.buildings.some(b => b.faction === 'eyrie' && b.kind === 'roost')) continue;
          const used = cl.buildings.length + cl.tokens.filter(t => t.kind === 'keep').length;
          if (used < cm.buildingSlots && e.roosts.length < 7) {
            out.push({ kind: 'eyrie.executeBuild', clearing: cm.id });
          }
        }
      }
    }
  }
  if (state.phase === 'evening') {
    if (e.pendingDiscard > 0) {
      for (const cardId of state.hands.eyrie) {
        out.push({ kind: 'eyrie.discardCard', cardId });
      }
    } else {
      out.push({ kind: 'eyrie.evening' });
    }
  }
  return out;
}
