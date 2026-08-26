import { produce } from 'immer';
import type { GameState, Action, ClearingId, CardSuit } from '../../types';
import type { CardId } from '../../cards';
import { discardCard, getCard } from '../../cards';
import { AUTUMN_MAP, getAdjacent } from '../../map';
import { declareBattle } from '../../combat';
import { applyFavor } from '../../effects';
import { onEnterBirdsong } from '../../loop';
import { ROOST_VP_TRACK, LEADER_VIZIER_SLOTS, type DecreeSlot, type EyrieState } from './state';
import { findSlotTarget, eyrieRules, suitMatches } from './decree';
import { canMeetCraftCost, spendCraftCost } from '../../craft-utils';
import { enqueueOutrage, hasAllianceSympathy } from '../../outrage';
import type { EyrieAction } from './actions';
import { awardVictoryPoints } from '../../victory';

function isEyrieTurn(state: GameState): boolean {
  return state.factionOrder[state.activeIndex] === 'eyrie';
}

const RESOLUTION_ORDER: DecreeSlot[] = ['recruit', 'move', 'battle', 'build'];

function eyrieRecruitCount(e: EyrieState): number {
  return e.leader === 'charismatic' ? 2 : 1;
}

function ensureResolution(e: EyrieState): void {
  if (e.resolutionLeft) {
    e.resolutionDone ??= { recruit: [], move: [], battle: [], build: [] };
    return;
  }
  e.resolutionLeft = {
    recruit: e.decree.recruit.length,
    move:    e.decree.move.length,
    battle:  e.decree.battle.length,
    build:   e.decree.build.length,
  };
  e.resolutionDone = { recruit: [], move: [], battle: [], build: [] };
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

function unresolvedCardsForSlot(e: EyrieState, slot: DecreeSlot): CardId[] {
  const done = e.resolutionDone?.[slot] ?? [];
  return e.decree[slot].filter(id => !done.includes(id));
}

function consumeDecreeCard(e: EyrieState, slot: DecreeSlot, cardId: CardId): void {
  e.resolutionDone![slot].push(cardId);
  e.resolutionLeft![slot] -= 1;
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
  // Humiliate is the first explicit step; Purge, Depose, and Rest are
  // advanced by legal actions so the UI can show each stage.
  let vpLost = 0;
  for (const slot of RESOLUTION_ORDER) {
    for (const id of e.decree[slot]) {
      if (getCard(id).suit === 'bird') vpLost += 1;
    }
  }
  draft.scores.eyrie = Math.max(0, draft.scores.eyrie - vpLost);
  draft.log.push({ turn: draft.turn, faction: 'eyrie', message: `Turmoil Humiliate: lost ${vpLost} VP for bird cards in the Decree.` });
  e.resolutionLeft = undefined;
  e.resolutionDone = undefined;
  e.decreeResolved = true;
  e.turmoilStep = 'purge';
}

export function eyrieReducer(state: GameState, action: Action): GameState {
  if (!action.kind.startsWith('eyrie.')) return state;
  if (!isEyrieTurn(state)) return state;
  const a = action as EyrieAction;

  switch (a.kind) {
    case 'eyrie.resolveTurmoilStep':
      return produce(state, draft => {
        const e = draft.factions.eyrie!;
        if (draft.phase !== 'daylight' || !e.turmoilStep) return;
        if (e.turmoilStep === 'purge') {
          for (const slot of RESOLUTION_ORDER) {
            const keep = e.decree[slot].filter(id => e.viziers.includes(id));
            for (const id of e.decree[slot]) if (!e.viziers.includes(id)) discardCard(draft, id);
            e.decree[slot] = keep;
          }
          e.turmoilStep = 'depose';
          draft.log.push({ turn: draft.turn, faction: 'eyrie', message: 'Turmoil Purge: discarded all Decree cards except Loyal Viziers.' });
          return;
        }
        if (e.turmoilStep === 'depose') {
          if (!e.needsLeaderChoice) {
            if (!e.usedLeaders.includes(e.leader)) e.usedLeaders.push(e.leader);
            e.needsLeaderChoice = true;
            draft.log.push({ turn: draft.turn, faction: 'eyrie', message: 'Turmoil Depose: choose a leader that has not been used this cycle.' });
          }
          return;
        }
        if (e.turmoilStep === 'rest') {
          e.turmoilStep = undefined;
          draft.phase = 'evening';
          draft.log.push({ turn: draft.turn, faction: 'eyrie', message: 'Turmoil Rest: daylight ended; begin Evening.' });
        }
      });

    case 'eyrie.chooseLeader':
      return produce(state, draft => {
        const e = draft.factions.eyrie!;
        if (!e.needsLeaderChoice) return;
        const choosingAfterTurmoil = draft.phase === 'daylight' && e.turmoilStep === 'depose';
        if (draft.phase !== 'birdsong' && draft.phase !== 'evening' && !choosingAfterTurmoil) return;
        const used = new Set(e.usedLeaders);
        const eligible = (['despot', 'commander', 'charismatic', 'builder'] as const)
          .filter(leader => !used.has(leader) || (used.size >= 4 && leader !== e.leader));
        if (!eligible.includes(a.leader)) return;
        const changing = e.leader !== a.leader;
        e.leader = a.leader;
        e.needsLeaderChoice = false;
        if (choosingAfterTurmoil) e.turmoilStep = 'rest';
        const totalDecreeCards = Object.values(e.decree).flat().length;
        if (totalDecreeCards === 0) {
          const slots = LEADER_VIZIER_SLOTS[a.leader];
          if (e.viziers[0]) e.decree[slots[0]].push(e.viziers[0]);
          if (e.viziers[1]) e.decree[slots[1]].push(e.viziers[1]);
        } else if (changing) {
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
        const card = getCard(a.cardId);
        const birdAdds = e.birdCardsAddedThisBirdsong ?? 0;
        if (card.suit === 'bird' && birdAdds >= 1) return; // at most one bird-suit add per birdsong
        const idx = draft.hands.eyrie.indexOf(a.cardId);
        if (idx < 0) return;
        draft.hands.eyrie.splice(idx, 1);
        e.decree[a.slot].push(a.cardId);
        e.cardsAddedThisBirdsong += 1;
        if (card.suit === 'bird') e.birdCardsAddedThisBirdsong = birdAdds + 1;
        draft.log.push({
          turn: draft.turn,
          faction: 'eyrie',
          message: `Added ${card.suit} card ${card.name} to ${a.slot} decree.`,
        });
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
        if (e.craftingDone === false && e.birdsongDone) return;
        if (e.decreeResolved) return;
        ensureResolution(e);
        if (currentSlot(e) !== 'recruit') return;
        const cardId = a.cardId ?? nextCardForSlot(e, 'recruit');
        if (!cardId) return;
        if (!unresolvedCardsForSlot(e, 'recruit').includes(cardId)) return;
        const meta = AUTUMN_MAP.clearings.find(c => c.id === a.clearing);
        if (!meta) return;
        if (!suitMatches(getCard(cardId).suit, meta.suit)) return;
        const cl = draft.map.clearings[a.clearing]!;
        const hasRoost = cl.buildings.some(b => b.faction === 'eyrie' && b.kind === 'roost');
        if (!hasRoost) return;
        if (e.warriorSupply <= 0) return;
        const toPlace = Math.min(eyrieRecruitCount(e), e.warriorSupply);
        cl.warriors.eyrie = (cl.warriors.eyrie ?? 0) + toPlace;
        e.warriorSupply -= toPlace;
        consumeDecreeCard(e, 'recruit', cardId);
        draft.log.push({
          turn: draft.turn,
          faction: 'eyrie',
          message: `Recruited ${toPlace} at clearing ${a.clearing}.`,
        });
        maybeFinishResolution(draft);
      });

    case 'eyrie.executeMove':
      return produce(state, draft => {
        if (draft.phase !== 'daylight') return;
        const e = draft.factions.eyrie!;
        if (e.craftingDone === false && e.birdsongDone) return;
        if (e.decreeResolved) return;
        ensureResolution(e);
        if (currentSlot(e) !== 'move') return;
        const cardId = a.cardId ?? nextCardForSlot(e, 'move');
        if (!cardId) return;
        if (!unresolvedCardsForSlot(e, 'move').includes(cardId)) return;
        const fromMeta = AUTUMN_MAP.clearings.find(c => c.id === a.from);
        if (!fromMeta) return;
        if (!suitMatches(getCard(cardId).suit, fromMeta.suit)) return;
        if (!(eyrieRules(draft, a.from) || eyrieRules(draft, a.to))) return;
        const fromCl = draft.map.clearings[a.from]!;
        const toCl = draft.map.clearings[a.to]!;
        const available = fromCl.warriors.eyrie ?? 0;
        if (available <= 0) return;
        const moving = Math.max(1, Math.min(a.count, available));
        fromCl.warriors.eyrie = available - moving;
        toCl.warriors.eyrie = (toCl.warriors.eyrie ?? 0) + moving;
        consumeDecreeCard(e, 'move', cardId);
        draft.lastMoveClearing = a.to;
        draft.log.push({ turn: draft.turn, faction: 'eyrie', message: `Moved 1 from ${a.from} → ${a.to}.` });
        if (hasAllianceSympathy(draft, a.to)) {
          enqueueOutrage(draft, 'eyrie', a.to, 'moveIntoSympathy');
        }
        maybeFinishResolution(draft);
      });

    case 'eyrie.executeBattle': {
      // Same shape as 'eyrie.executeBuild' below — validate, then apply.
      // Combat dice need to run outside the produce() draft so we resolve
      // it explicitly here.
      if (state.phase !== 'daylight') return state;
      const e0 = state.factions.eyrie!;
      if (e0.craftingDone === false && e0.birdsongDone) return state;
      if (e0.decreeResolved) return state;
      const pre = produce(state, draft => { ensureResolution(draft.factions.eyrie!); });
      const e = pre.factions.eyrie!;
      if (currentSlot(e) !== 'battle') return state;
      const cardId = a.cardId ?? nextCardForSlot(e, 'battle');
      if (!cardId) return state;
      if (!unresolvedCardsForSlot(e, 'battle').includes(cardId)) return state;
      const meta = AUTUMN_MAP.clearings.find(c => c.id === a.clearing);
      if (!meta || !suitMatches(getCard(cardId).suit, meta.suit)) return state;
      const cl = pre.map.clearings[a.clearing]!;
      if ((cl.warriors.eyrie ?? 0) <= 0) return state;
      const hasEnemy = (cl.warriors[a.defender] ?? 0) > 0
        || cl.buildings.some(b => b.faction === a.defender)
        || cl.tokens.some(t => t.faction === a.defender);
      if (!hasEnemy) return state;
      let s = declareBattle(pre, { clearing: a.clearing, attacker: 'eyrie', defender: a.defender });
      s = produce(s, draft => {
        consumeDecreeCard(draft.factions.eyrie!, 'battle', cardId);
        draft.lastBattleClearing = a.clearing;
        maybeFinishResolution(draft);
      });
      return s;
    }

    case 'eyrie.executeBuild':
      return produce(state, draft => {
        if (draft.phase !== 'daylight') return;
        const e = draft.factions.eyrie!;
        if (e.craftingDone === false && e.birdsongDone) return;
        if (e.decreeResolved) return;
        ensureResolution(e);
        if (currentSlot(e) !== 'build') return;
        const cardId = a.cardId ?? nextCardForSlot(e, 'build');
        if (!cardId) return;
        if (!unresolvedCardsForSlot(e, 'build').includes(cardId)) return;
        const meta = AUTUMN_MAP.clearings.find(c => c.id === a.clearing);
        if (!meta || !suitMatches(getCard(cardId).suit, meta.suit)) return;
        if (!eyrieRules(draft, a.clearing)) return;
        const cl = draft.map.clearings[a.clearing]!;
        if (cl.buildings.some(b => b.faction === 'eyrie' && b.kind === 'roost')) return;
        const used = cl.buildings.length + cl.tokens.filter(t => t.kind === 'keep').length + (meta.hasRuin && !cl.ruinExplored ? 1 : 0);
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
      if (e.craftingDone === false && e.birdsongDone) return s;
      if (e.decreeResolved) return s;
      s = produce(s, draft => { ensureResolution(draft.factions.eyrie!); });
      e = s.factions.eyrie!;
      let failed = false;
      for (const slot of RESOLUTION_ORDER) {
        if (failed) break;
        while (e.resolutionLeft![slot] > 0) {
          const cardId = unresolvedCardsForSlot(e, slot)[0];
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
            s = declareBattle(s, { clearing: target, attacker: 'eyrie', defender: enemy });
            s = produce(s, draft => consumeDecreeCard(draft.factions.eyrie!, 'battle', cardId));
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
              consumeDecreeCard(draft.factions.eyrie!, 'move', cardId);
            });
          } else if (slot === 'recruit') {
            s = produce(s, draft => {
              const cl = draft.map.clearings[target]!;
              const ee = draft.factions.eyrie!;
              const toPlace = Math.min(eyrieRecruitCount(ee), ee.warriorSupply);
              cl.warriors.eyrie = (cl.warriors.eyrie ?? 0) + toPlace;
              ee.warriorSupply -= toPlace;
              consumeDecreeCard(ee, 'recruit', cardId);
            });
          } else { // build
            s = produce(s, draft => {
              const cl = draft.map.clearings[target]!;
              const ee = draft.factions.eyrie!;
              cl.buildings.push({ faction: 'eyrie', kind: 'roost' });
              ee.roosts.push(target as ClearingId);
              consumeDecreeCard(ee, 'build', cardId);
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

    case 'eyrie.craft':
      return produce(state, draft => {
        if (draft.phase !== 'daylight') return;
        if (draft.factions.eyrie!.turmoilStep) return;
        if (draft.factions.eyrie!.craftingDone) return;
        const card = getCard(a.cardId);
        if (card.category !== 'item' && card.category !== 'persistent' && card.category !== 'favor') return;
        const e = draft.factions.eyrie!;
        // Compute roost power per suit: each roost in clearing X provides 1 pip of that clearing's suit.
        const power: Partial<Record<CardSuit, number>> = {};
        for (const roostClearing of e.roosts) {
          const cm = AUTUMN_MAP.clearings.find(c => c.id === roostClearing);
          if (cm) power[cm.suit] = (power[cm.suit] ?? 0) + 1;
        }
        // Subtract power already consumed this turn.
        for (const craftedId of e.craftedThisTurn) {
          if (!spendCraftCost(power, getCard(craftedId).craftCost)) return;
        }
        if (!canMeetCraftCost(power, card.craftCost)) return;
        const idx = draft.hands.eyrie.indexOf(a.cardId);
        if (idx < 0) return;
        draft.hands.eyrie.splice(idx, 1);
        e.craftedThisTurn.push(a.cardId);
        if (card.craftVp) awardVictoryPoints(draft, 'eyrie', card.craftVp, `crafting ${card.name}`);
        if (card.item) { draft.itemSupply.push(card.item); draft.craftedItemLog.push({ faction: 'eyrie', item: card.item }); }
        if (card.category === 'persistent') draft.craftedPersistents.push({ faction: 'eyrie', cardId: a.cardId });
        if (card.category === 'favor') applyFavor(draft, card.suit, 'eyrie');
        draft.log.push({ turn: draft.turn, faction: 'eyrie', message: `Crafted ${card.name} (+${card.craftVp ?? 0} VP).` });
      });

    case 'eyrie.endCrafting':
      return produce(state, draft => {
        if (draft.phase !== 'daylight') return;
        if (draft.factions.eyrie!.turmoilStep) return;
        draft.factions.eyrie!.craftingDone = true;
        draft.log.push({ turn: draft.turn, faction: 'eyrie', message: 'Finished crafting; resolving the Decree.' });
      });

    case 'eyrie.evening':
      return produce(state, draft => {
        if (draft.phase !== 'evening') return;
        const e = draft.factions.eyrie!;
        if (e.pendingDiscard > 0) return;
        const vp = ROOST_VP_TRACK[Math.min(e.roosts.length, ROOST_VP_TRACK.length - 1)] ?? 0;
        awardVictoryPoints(draft, 'eyrie', vp, `scoring ${e.roosts.length} roosts at evening`);
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
        discardCard(draft, a.cardId);
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
  e.birdCardsAddedThisBirdsong = 0;
  e.resolutionLeft = undefined;
  e.resolutionDone = undefined;
  e.resolutionDone = undefined;
  e.pendingDiscard = 0;
  e.craftedThisTurn = [];
  e.craftingDone = false;
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

  // Pending discard gates everything else, regardless of phase
  if (e.pendingDiscard > 0) {
    for (const cardId of state.hands.eyrie) {
      out.push({ kind: 'eyrie.discardCard', cardId });
    }
    return out;
  }

  // If outrage is pending for eyrie, ONLY resolve it
  if (state.pendingOutrage?.faction === 'eyrie') {
    const o = state.pendingOutrage;
    const matchingCards = state.hands.eyrie.filter(id => {
      const c = getCard(id);
      return c.suit === o.suit || c.suit === 'bird';
    });
    if (matchingCards.length > 0) {
      for (const cardId of matchingCards) {
        out.push({ kind: 'system.resolveOutrage', cardId });
      }
    } else {
      out.push({ kind: 'system.resolveOutrage' });
    }
    return out;
  }

  if (state.phase === 'daylight' && e.turmoilStep === 'purge') {
    out.push({ kind: 'eyrie.resolveTurmoilStep' });
  }
  if (state.phase === 'daylight' && e.turmoilStep === 'depose' && !e.needsLeaderChoice) {
    out.push({ kind: 'eyrie.resolveTurmoilStep' });
  }
  if (state.phase === 'daylight' && e.turmoilStep === 'rest') {
    out.push({ kind: 'eyrie.resolveTurmoilStep' });
  }
  if (state.phase === 'birdsong' || (state.phase === 'evening' && e.needsLeaderChoice) || (state.phase === 'daylight' && e.turmoilStep === 'depose' && e.needsLeaderChoice)) {
    // Official rule in this ruleset: add one or two cards to the Decree each birdsong.
    if (!e.needsLeaderChoice && e.cardsAddedThisBirdsong < 2) {
      const birdAdds = e.birdCardsAddedThisBirdsong ?? 0;
      for (const cardId of state.hands.eyrie) {
        const card = getCard(cardId);
        if (card.suit === 'bird' && birdAdds >= 1) continue;
        for (const slot of ['recruit', 'move', 'battle', 'build'] as const) {
          out.push({ kind: 'eyrie.addToDecree', slot, cardId });
        }
      }
    }
    // Leader pick — see task for timing; conditional handled in legals below.
    if (e.needsLeaderChoice) {
      const used = new Set(e.usedLeaders);
      const allLeaders = ['despot', 'commander', 'charismatic', 'builder'] as const;
      const eligible = allLeaders.filter(leader => !used.has(leader) || (used.size >= 4 && leader !== e.leader));
      for (const leader of eligible) {
        out.push({ kind: 'eyrie.chooseLeader', leader });
      }
    }
    // Must add at least 1 decree card and choose a leader before ending birdsong.
    if (!e.needsLeaderChoice && e.cardsAddedThisBirdsong >= 1) {
      out.push({ kind: 'eyrie.endBirdsong' });
    }
  }
  if (state.phase === 'daylight' && !e.turmoilStep && !e.craftingDone && e.roosts.length > 0) {
    // Craft using roost power — available throughout daylight, independent of Decree.
    const power: Partial<Record<CardSuit, number>> = {};
    for (const roostClearing of e.roosts) {
      const cm = AUTUMN_MAP.clearings.find(c => c.id === roostClearing);
      if (cm) power[cm.suit] = (power[cm.suit] ?? 0) + 1;
    }
    for (const craftedId of e.craftedThisTurn) {
      if (!spendCraftCost(power, getCard(craftedId).craftCost)) return out;
    }
    for (const cardId of state.hands.eyrie) {
      const card = getCard(cardId);
      if (card.category !== 'item' && card.category !== 'persistent' && card.category !== 'favor') continue;
      const cost = card.craftCost;
      if (!cost || Object.keys(cost).length === 0) continue;
      if (canMeetCraftCost(power, cost)) out.push({ kind: 'eyrie.craft', cardId });
    }
  }
  if (state.phase === 'daylight' && !e.turmoilStep && !e.craftingDone && e.roosts.length === 0) {
    out.push({ kind: 'eyrie.endCrafting' });
  }
  if (state.phase === 'daylight' && !e.turmoilStep && !e.craftingDone && e.roosts.length > 0) {
    out.push({ kind: 'eyrie.endCrafting' });
  }
  if (state.phase === 'daylight' && !e.turmoilStep && e.craftingDone && !e.decreeResolved) {
    // eyrie.resolveDecree is always offered so the bot and the player have an
    // escape hatch. The ActionBar hides it when execute actions are available
    // (it only makes sense when turmoil is the only option).
    out.push({ kind: 'eyrie.resolveDecree' });
    // What slot is the player currently draining? Generate every legal
    // execute-step for that slot so the UI can highlight clearings.
    const slot = currentSlot(e);
    const cardIds = slot ? unresolvedCardsForSlot(e, slot) : [];
    if (slot && cardIds.length > 0) {
      for (const cardId of cardIds) {
        const cardSuit = getCard(cardId).suit;
        for (const cm of AUTUMN_MAP.clearings) {
          if (!suitMatches(cardSuit, cm.suit)) continue;
        const cl = state.map.clearings[cm.id]!;
        if (slot === 'recruit') {
          const hasRoost = cl.buildings.some(b => b.faction === 'eyrie' && b.kind === 'roost');
          if (hasRoost && e.warriorSupply > 0) {
            out.push({ kind: 'eyrie.executeRecruit', clearing: cm.id, cardId });
          }
        } else if (slot === 'move') {
          const warriors = cl.warriors.eyrie ?? 0;
          if (warriors <= 0) continue;
          for (const nb of getAdjacent(AUTUMN_MAP, cm.id)) {
            if (eyrieRules(state, cm.id) || eyrieRules(state, nb)) {
              out.push({ kind: 'eyrie.executeMove', from: cm.id, to: nb, count: warriors, cardId });
            }
          }
        } else if (slot === 'battle') {
          if ((cl.warriors.eyrie ?? 0) <= 0) continue;
          for (const f of ['marquise', 'alliance', 'vagabond'] as const) {
            if ((cl.warriors[f] ?? 0) > 0
                || cl.buildings.some(b => b.faction === f)
                || cl.tokens.some(t => t.faction === f)) {
              out.push({ kind: 'eyrie.executeBattle', clearing: cm.id, defender: f, cardId });
            }
          }
        } else if (slot === 'build') {
          if (!eyrieRules(state, cm.id)) continue;
          if (cl.buildings.some(b => b.faction === 'eyrie' && b.kind === 'roost')) continue;
          const used = cl.buildings.length
            + cl.tokens.filter(t => t.kind === 'keep').length
            + (cm.hasRuin && !cl.ruinExplored ? 1 : 0);
          if (used < cm.buildingSlots && e.roosts.length < 7) {
            out.push({ kind: 'eyrie.executeBuild', clearing: cm.id, cardId });
          }
        }
        }
      }
    }
  }
  if (state.phase === 'evening' && !e.needsLeaderChoice) {
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
