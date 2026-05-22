import { produce } from 'immer';
import type { GameState, Action, ClearingId, Faction } from '../../types';
import { getCard, type CardId } from '../../cards';
import { AUTUMN_MAP, getAdjacent } from '../../map';
import { declareBattle } from '../../combat';
import { SYMPATHY_VP_TRACK, SYMPATHY_COST } from './state';
import { applyFavor } from '../../effects';
import { onEnterBirdsong } from '../../loop';
import type { AllianceAction } from './actions';

function isAllianceTurn(state: GameState): boolean {
  return state.factionOrder[state.activeIndex] === 'alliance';
}

function clearingSuit(clearing: ClearingId): 'fox' | 'mouse' | 'rabbit' {
  return AUTUMN_MAP.clearings.find(c => c.id === clearing)!.suit;
}

function matchesSuit(cardId: CardId, suit: 'fox' | 'mouse' | 'rabbit'): boolean {
  const s = getCard(cardId).suit;
  return s === suit || s === 'bird';
}

/** Alliance rules a clearing when its warriors + sympathy + bases beat
 *  every other faction's pieces there. Mirrors the rule used elsewhere
 *  for movement legality. */
function allianceRules(state: GameState, clearing: ClearingId): boolean {
  const cl = state.map.clearings[clearing];
  if (!cl) return false;
  const al = state.factions.alliance;
  if (!al) return false;
  const mine = (cl.warriors.alliance ?? 0)
    + cl.tokens.filter(t => t.faction === 'alliance').length
    + cl.buildings.filter(b => b.faction === 'alliance').length;
  if (mine <= 0) return false;
  for (const f of ['marquise', 'eyrie', 'vagabond'] as const) {
    const theirs = (cl.warriors[f] ?? 0)
      + cl.tokens.filter(t => t.faction === f).length
      + cl.buildings.filter(b => b.faction === f).length;
    if (theirs >= mine) return false;
  }
  return true;
}


function returnToSupply(draft: GameState, clearing: ClearingId, faction: Faction): void {
  const cl = draft.map.clearings[clearing]!;
  const n = cl.warriors[faction] ?? 0;
  cl.warriors[faction] = 0;
  if (n <= 0) return;
  if (faction === 'marquise' && draft.factions.marquise) draft.factions.marquise.warriorSupply += n;
  else if (faction === 'eyrie' && draft.factions.eyrie) draft.factions.eyrie.warriorSupply += n;
  else if (faction === 'alliance' && draft.factions.alliance) draft.factions.alliance.warriorSupply += n;
}

export function allianceReducer(state: GameState, action: Action): GameState {
  if (!action.kind.startsWith('alliance.')) return state;
  if (!isAllianceTurn(state)) return state;
  const a = action as AllianceAction;

  switch (a.kind) {
    case 'alliance.spreadSympathy':
      return produce(state, draft => {
        const al = draft.factions.alliance!;
        if (al.sympathy.includes(a.clearing)) return;
        const suit = clearingSuit(a.clearing);
        const need = SYMPATHY_COST[Math.min(al.sympathy.length, SYMPATHY_COST.length - 1)] ?? 4;
        const valid = a.supporterCards.filter(id => matchesSuit(id, suit));
        if (valid.length < need) return;
        // Spend supporters
        for (const id of valid.slice(0, need)) {
          const idx = al.supporters.indexOf(id);
          if (idx >= 0) {
            al.supporters.splice(idx, 1);
            draft.discard.push(id);
          }
        }
        al.sympathy.push(a.clearing);
        draft.map.clearings[a.clearing]!.tokens.push({ faction: 'alliance', kind: 'sympathy' });
        const vp = SYMPATHY_VP_TRACK[Math.min(al.sympathy.length - 1, SYMPATHY_VP_TRACK.length - 1)] ?? 0;
        draft.scores.alliance += vp;
        draft.log.push({ turn: draft.turn, faction: 'alliance', message: `Spread sympathy to ${a.clearing} (+${vp} VP).` });
      });

    case 'alliance.mobilize':
      return produce(state, draft => {
        if (draft.phase !== 'daylight') return;
        const al = draft.factions.alliance!;
        const idx = draft.hands.alliance.indexOf(a.cardId);
        if (idx < 0) return;
        draft.hands.alliance.splice(idx, 1);
        // Supporters stack is capped at 5 unless at least one base is on the
        // board; if full, the card is discarded instead.
        const hasBase = Object.keys(al.bases).length > 0;
        if (!hasBase && al.supporters.length >= 5) {
          draft.discard.push(a.cardId);
          draft.log.push({ turn: draft.turn, faction: 'alliance', message: `Supporter stack full — discarded ${a.cardId}.` });
        } else {
          al.supporters.push(a.cardId);
          draft.log.push({ turn: draft.turn, faction: 'alliance', message: `Mobilized a supporter.` });
        }
        // Mobilize is FREE — does not cost an officer action.
      });

    case 'alliance.organize':
      return produce(state, draft => {
        const al = draft.factions.alliance!;
        const cl = draft.map.clearings[a.clearing]!;
        if ((cl.warriors.alliance ?? 0) <= 0) return;
        if (al.sympathy.includes(a.clearing)) return;
        cl.warriors.alliance = (cl.warriors.alliance ?? 0) - 1;
        al.warriorSupply += 1;
        al.sympathy.push(a.clearing);
        cl.tokens.push({ faction: 'alliance', kind: 'sympathy' });
        const vp = SYMPATHY_VP_TRACK[Math.min(al.sympathy.length - 1, SYMPATHY_VP_TRACK.length - 1)] ?? 0;
        draft.scores.alliance += vp;
        al.daylightActionsLeft -= 1;
      });

    case 'alliance.revolt':
      return produce(state, draft => {
        const al = draft.factions.alliance!;
        if (!al.sympathy.includes(a.clearing)) return;
        const suit = clearingSuit(a.clearing);
        const valid = a.supporterCards.filter(id => matchesSuit(id, suit));
        if (valid.length < 2) return;
        if (al.bases[suit] !== undefined) return;
        for (const id of valid.slice(0, 2)) {
          const idx = al.supporters.indexOf(id);
          if (idx >= 0) {
            al.supporters.splice(idx, 1);
            draft.discard.push(id);
          }
        }
        // Remove enemy warriors/tokens.
        const cl = draft.map.clearings[a.clearing]!;
        let vp = 0;
        for (const f of ['marquise', 'eyrie', 'vagabond'] as const) returnToSupply(draft, a.clearing, f);
        const remainingBuildings: typeof cl.buildings = [];
        for (const b of cl.buildings) {
          if (b.faction !== 'alliance') vp += 1; else remainingBuildings.push(b);
        }
        cl.buildings = remainingBuildings;
        // Place base + warriors per base on board.
        const basesBefore = Object.keys(al.bases).length;
        cl.buildings.push({ faction: 'alliance', kind: `base-${suit}` });
        al.bases[suit] = a.clearing;
        const warriorsToPlace = basesBefore + 1;
        cl.warriors.alliance = (cl.warriors.alliance ?? 0) + warriorsToPlace;
        al.warriorSupply = Math.max(0, al.warriorSupply - warriorsToPlace);
        al.officers += 1;
        draft.scores.alliance += vp;
        draft.log.push({ turn: draft.turn, faction: 'alliance', message: `Revolt in ${a.clearing}! +${vp} VP, base placed.` });
      });

    case 'alliance.battle': {
      if (state.phase !== 'daylight') return state;
      const al = state.factions.alliance!;
      if (al.daylightActionsLeft <= 0) return state;
      const pre = produce(state, draft => {
        draft.factions.alliance!.daylightActionsLeft -= 1;
      });
      return declareBattle(pre, { clearing: a.clearing, attacker: 'alliance', defender: a.defender });
    }

    case 'alliance.move':
      return produce(state, draft => {
        if (draft.phase !== 'daylight') return;
        const al = draft.factions.alliance!;
        if (al.daylightActionsLeft <= 0) return;
        if (!getAdjacent(AUTUMN_MAP, a.from).includes(a.to)) return;
        if (!(allianceRules(draft, a.from) || allianceRules(draft, a.to))) return;
        const fromCl = draft.map.clearings[a.from]!;
        const toCl = draft.map.clearings[a.to]!;
        const have = fromCl.warriors.alliance ?? 0;
        const n = Math.min(a.count, have);
        if (n <= 0) return;
        fromCl.warriors.alliance = have - n;
        toCl.warriors.alliance = (toCl.warriors.alliance ?? 0) + n;
        al.daylightActionsLeft -= 1;
        draft.log.push({ turn: draft.turn, faction: 'alliance', message: `Moved ${n} from ${a.from} → ${a.to}.` });
      });

    case 'alliance.craft':
      return produce(state, draft => {
        if (draft.phase !== 'daylight') return;
        const al = draft.factions.alliance!;
        const card = getCard(a.cardId);
        if (card.category !== 'item' && card.category !== 'persistent' && card.category !== 'favor') return;
        // Alliance crafts using sympathy as power — requires at least one
        // sympathy token on the board.
        if (al.sympathy.length <= 0) return;
        const idx = draft.hands.alliance.indexOf(a.cardId);
        if (idx < 0) return;
        draft.hands.alliance.splice(idx, 1);
        if (card.craftVp) draft.scores.alliance += card.craftVp;
        if (card.item) draft.itemSupply.push(card.item);
        if (card.category === 'persistent') draft.craftedPersistents.push({ faction: 'alliance', cardId: a.cardId });
        if (card.category === 'favor') applyFavor(draft, card.suit, 'alliance');
        draft.discard.push(a.cardId);
        draft.log.push({ turn: draft.turn, faction: 'alliance', message: `Crafted ${card.name} (+${card.craftVp ?? 0} VP).` });
      });

    case 'alliance.trainOfficer':
      return produce(state, draft => {
        if (draft.phase !== 'daylight') return;
        const al = draft.factions.alliance!;
        if (al.officers >= 10) return;
        // Spend a bird-suit supporter to gain an officer.
        // Train is FREE — does not cost an officer action.
        const idx = al.supporters.indexOf(a.cardId);
        if (idx < 0) return;
        const card = getCard(a.cardId);
        if (card.suit !== 'bird') return;
        al.supporters.splice(idx, 1);
        draft.discard.push(a.cardId);
        al.officers += 1;
        // Training also immediately grants one more officer-limited action slot
        // for the rest of this daylight.
        al.daylightActionsLeft += 1;
        draft.log.push({ turn: draft.turn, faction: 'alliance', message: `Trained an officer (now ${al.officers}).` });
      });

    case 'alliance.endDaylight':
      return produce(state, draft => {
        draft.factions.alliance!.daylightActionsLeft = 0;
        draft.phase = 'evening';
      });

    case 'alliance.evening':
      return produce(state, draft => {
        if (draft.phase !== 'evening') return;
        const al = draft.factions.alliance!;
        if (al.pendingDiscard > 0) return;
        const draws = 1 + Object.keys(al.bases).length;
        for (let i = 0; i < draws; i++) {
          const c = draft.deck.pop();
          if (!c) break;
          draft.hands.alliance.push(c);
        }
        const excess = draft.hands.alliance.length - 5;
        if (excess > 0) {
          al.pendingDiscard = excess;
          draft.log.push({ turn: draft.turn, faction: 'alliance', message: `Evening: drew ${draws}, must discard ${excess}.` });
          return;
        }
        finishAllianceTurn(draft, draws);
      });

    case 'alliance.discardCard':
      return produce(state, draft => {
        const al = draft.factions.alliance!;
        if (al.pendingDiscard <= 0) return;
        const idx = draft.hands.alliance.indexOf(a.cardId);
        if (idx < 0) return;
        draft.hands.alliance.splice(idx, 1);
        draft.discard.push(a.cardId);
        al.pendingDiscard -= 1;
        if (al.pendingDiscard === 0) finishAllianceTurn(draft, 0);
      });

    default:
      return state;
  }
}

function finishAllianceTurn(draft: GameState, _draws: number): void {
  const al = draft.factions.alliance!;
  al.birdsongDone = false;
  // Officer-limited actions (Organize / Battle / Move) get exactly al.officers
  // slots; free actions (Craft / Mobilize / Train) ignore this counter.
  al.daylightActionsLeft = al.officers;
  al.pendingDiscard = 0;
  draft.activeIndex = (draft.activeIndex + 1) % draft.factionOrder.length;
  if (draft.activeIndex === 0) draft.turn += 1;
  draft.phase = 'birdsong';
  draft.log.push({ turn: draft.turn, faction: 'alliance', message: `Turn ends; next: ${draft.factionOrder[draft.activeIndex]} birdsong.` });
  onEnterBirdsong(draft);
}

export function allianceLegalActions(state: GameState): Action[] {
  if (!isAllianceTurn(state)) return [];
  const out: Action[] = [];
  const al = state.factions.alliance;
  if (!al) return out;

  if (state.phase === 'birdsong') {
    // Try to spread sympathy
    for (const c of AUTUMN_MAP.clearings) {
      if (al.sympathy.includes(c.id)) continue;
      const matching = al.supporters.filter(id => matchesSuit(id, c.suit));
      const need = SYMPATHY_COST[Math.min(al.sympathy.length, SYMPATHY_COST.length - 1)] ?? 4;
      if (matching.length >= need) {
        out.push({ kind: 'alliance.spreadSympathy', clearing: c.id, supporterCards: matching.slice(0, need) });
      }
    }
    // Revolt
    for (const cid of al.sympathy) {
      const suit = clearingSuit(cid);
      if (al.bases[suit] !== undefined) continue;
      const matching = al.supporters.filter(id => matchesSuit(id, suit));
      if (matching.length >= 2) {
        out.push({ kind: 'alliance.revolt', clearing: cid, supporterCards: matching.slice(0, 2) });
      }
    }
  }
  if (state.phase === 'daylight') {
    // ── Free actions (unlimited, no officer cost) ────────────────────────────
    const hasBase = Object.keys(al.bases).length > 0;
    const stackFull = !hasBase && al.supporters.length >= 5;
    if (!stackFull) {
      for (const cardId of state.hands.alliance) {
        out.push({ kind: 'alliance.mobilize', cardId });
      }
    }
    // Train officer: spend a bird-suit supporter (free action).
    if (al.officers < 10) {
      for (const id of al.supporters) {
        if (getCard(id).suit === 'bird') {
          out.push({ kind: 'alliance.trainOfficer', cardId: id });
        }
      }
    }
    // Craft (free action) — needs at least one sympathy on the board.
    if (al.sympathy.length > 0) {
      for (const id of state.hands.alliance) {
        const card = getCard(id);
        if (card.category === 'item' || card.category === 'persistent' || card.category === 'favor') {
          out.push({ kind: 'alliance.craft', cardId: id });
        }
      }
    }
    // ── Officer-limited actions (Organize / Battle / Move) ──────────────────
    if (al.daylightActionsLeft > 0) {
      for (const c of AUTUMN_MAP.clearings) {
        const cl = state.map.clearings[c.id]!;
        if ((cl.warriors.alliance ?? 0) > 0 && !al.sympathy.includes(c.id)) {
          out.push({ kind: 'alliance.organize', clearing: c.id });
        }
        if ((cl.warriors.alliance ?? 0) > 0) {
          for (const f of ['marquise', 'eyrie', 'vagabond'] as const) {
            if ((cl.warriors[f] ?? 0) > 0 || cl.buildings.some(b => b.faction === f)) {
              out.push({ kind: 'alliance.battle', clearing: c.id, defender: f });
            }
          }
        }
        const have = cl.warriors.alliance ?? 0;
        if (have > 0) {
          for (const nb of getAdjacent(AUTUMN_MAP, c.id)) {
            if (allianceRules(state, c.id) || allianceRules(state, nb)) {
              out.push({ kind: 'alliance.move', from: c.id, to: nb, count: have });
            }
          }
        }
      }
    }
    out.push({ kind: 'alliance.endDaylight' });
  }
  if (state.phase === 'evening') {
    if (al.pendingDiscard > 0) {
      for (const cardId of state.hands.alliance) {
        out.push({ kind: 'alliance.discardCard', cardId });
      }
    } else {
      out.push({ kind: 'alliance.evening' });
    }
  }
  return out;
}
