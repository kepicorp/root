import { produce } from 'immer';
import type { GameState, Action, ClearingId, Faction } from '../../types';
import type { CardId } from '../../cards';
import { getCard } from '../../cards';
import type { CardSuit } from '../../types';
import { AUTUMN_MAP, getAdjacent } from '../../map';
import { declareBattle } from '../../combat';
import { applyFavor } from '../../effects';
import { onEnterBirdsong } from '../../loop';
import { vpForBuilding, buildCost } from './scoring';
import { canMeetCraftCost } from '../../craft-utils';
import type { MarquiseAction } from './actions';

const ACTIVE: Faction = 'marquise';

function isMarquiseTurn(state: GameState): boolean {
  return state.factionOrder[state.activeIndex] === ACTIVE;
}

/** Marquise rules a clearing iff they have the most warriors+buildings, or own the keep.
 *  Per §2.5: tokens do not count toward rule. Keep is a Marquise faction ability (§6.2.1). */
function rules(state: GameState, clearing: ClearingId): boolean {
  const cl = state.map.clearings[clearing];
  if (!cl) return false;
  const m = state.factions.marquise;
  if (m?.keep?.clearing === clearing) return true;
  const counts: Record<string, number> = {};
  for (const [f, w] of Object.entries(cl.warriors)) counts[f] = (counts[f] ?? 0) + (w ?? 0);
  for (const b of cl.buildings) counts[b.faction] = (counts[b.faction] ?? 0) + 1;
  const mine = counts.marquise ?? 0;
  let topOther = 0;
  for (const [f, n] of Object.entries(counts)) {
    if (f !== 'marquise' && n > topOther) topOther = n;
  }
  return mine > 0 && mine > topOther;
}

/** Wood reachable from `clearing` via Marquise-ruled clearings, returns clearing ids holding wood. */
function reachableSawmillWood(state: GameState, clearing: ClearingId): ClearingId[] {
  const visited = new Set<ClearingId>([clearing]);
  const queue: ClearingId[] = [clearing];
  const wood: ClearingId[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    const cl = state.map.clearings[id]!;
    for (const t of cl.tokens) {
      if (t.faction === 'marquise' && t.kind === 'wood') wood.push(id);
    }
    for (const nb of getAdjacent(AUTUMN_MAP, id)) {
      if (visited.has(nb)) continue;
      if (!rules(state, nb) && nb !== clearing) continue;
      visited.add(nb);
      queue.push(nb);
    }
  }
  return wood;
}

function payWood(draft: GameState, fromClearings: ClearingId[], cost: number): boolean {
  const m = draft.factions.marquise!;
  let remaining = cost;
  for (const cid of fromClearings) {
    if (remaining <= 0) break;
    const cl = draft.map.clearings[cid]!;
    for (let i = cl.tokens.length - 1; i >= 0 && remaining > 0; i--) {
      const t = cl.tokens[i]!;
      if (t.faction === 'marquise' && t.kind === 'wood') {
        cl.tokens.splice(i, 1);
        m.wood += 1;
        remaining -= 1;
      }
    }
  }
  return remaining === 0;
}

function consumeCardFromHand(draft: GameState, cardId: CardId): boolean {
  const idx = draft.hands.marquise.indexOf(cardId);
  if (idx < 0) return false;
  draft.hands.marquise.splice(idx, 1);
  draft.discard.push(cardId);
  return true;
}

export function marquiseReducer(state: GameState, action: Action): GameState {
  if (!action.kind.startsWith('marquise.')) return state;
  if (!isMarquiseTurn(state)) return state;
  const a = action as MarquiseAction;

  switch (a.kind) {
    case 'marquise.placeWood':
      return produce(state, draft => {
        if (draft.phase !== 'birdsong') return;
        const m = draft.factions.marquise!;
        if (m.birdsongDone) return;
        let placed = 0;
        for (const cl of Object.values(draft.map.clearings)) {
          if (m.wood <= 0) break;
          const sawmills = cl.buildings.filter(b => b.faction === 'marquise' && b.kind === 'sawmill').length;
          for (let i = 0; i < sawmills; i++) {
            if (m.wood <= 0) break;
            cl.tokens.push({ faction: 'marquise', kind: 'wood' });
            m.wood -= 1;
            placed += 1;
          }
        }
        m.birdsongDone = true;
        draft.log.push({ turn: draft.turn, faction: 'marquise', message: `Birdsong: placed ${placed} wood.` });
      });

    case 'marquise.build':
      return produce(state, draft => {
        if (draft.phase !== 'daylight') return;
        const m = draft.factions.marquise!;
        if (m.daylightActionsLeft <= 0) return;
        const cl = draft.map.clearings[a.clearing];
        if (!cl) return;
        const clMeta = AUTUMN_MAP.clearings.find(c => c.id === a.clearing)!;
        if (!rules(draft, a.clearing)) return;
        // Enemy tokens that would block? Skipping detailed hostile-token check.
        const totalSlots = clMeta.buildingSlots + (cl.extraBuildingSlots ?? 0);
        const usedSlots = cl.buildings.length + cl.tokens.filter(t => t.kind === 'keep').length;
        if (usedSlots >= totalSlots) return;
        if (m.buildings[a.building] >= 6) return;
        const cost = buildCost(m.buildings[a.building]);
        const reachable = reachableSawmillWood(draft, a.clearing);
        if (reachable.length < cost) return;
        if (!payWood(draft, reachable, cost)) return;
        cl.buildings.push({ faction: 'marquise', kind: a.building });
        m.buildings[a.building] += 1;
        const vp = vpForBuilding(a.building, m.buildings[a.building]);
        draft.scores.marquise += vp;
        m.daylightActionsLeft -= 1;
        draft.log.push({
          turn: draft.turn,
          faction: 'marquise',
          message: `Built ${a.building} in clearing ${a.clearing} (cost ${cost} wood, +${vp} VP).`,
        });
      });

    case 'marquise.recruit':
      return produce(state, draft => {
        if (draft.phase !== 'daylight') return;
        const m = draft.factions.marquise!;
        if (m.daylightActionsLeft <= 0 || m.recruitedThisTurn) return;
        let placed = 0;
        for (const [idStr, cl] of Object.entries(draft.map.clearings)) {
          const recruiters = cl.buildings.filter(b => b.faction === 'marquise' && b.kind === 'recruiter').length;
          for (let i = 0; i < recruiters; i++) {
            if (m.warriorSupply <= 0) break;
            cl.warriors.marquise = (cl.warriors.marquise ?? 0) + 1;
            m.warriorSupply -= 1;
            placed += 1;
          }
          void idStr;
        }
        m.recruitedThisTurn = true;
        m.daylightActionsLeft -= 1;
        draft.log.push({ turn: draft.turn, faction: 'marquise', message: `Recruited ${placed} warriors.` });
      });

    case 'marquise.overwork':
      return produce(state, draft => {
        if (draft.phase !== 'daylight') return;
        const m = draft.factions.marquise!;
        if (m.daylightActionsLeft <= 0) return;
        const cl = draft.map.clearings[a.clearing];
        if (!cl) return;
        const meta = AUTUMN_MAP.clearings.find(c => c.id === a.clearing)!;
        const sawmills = cl.buildings.filter(b => b.faction === 'marquise' && b.kind === 'sawmill').length;
        if (sawmills <= 0) return;
        const card = getCard(a.cardId);
        if (card.suit !== meta.suit && card.suit !== 'bird') return;
        if (!consumeCardFromHand(draft, a.cardId)) return;
        cl.tokens.push({ faction: 'marquise', kind: 'wood' });
        m.daylightActionsLeft -= 1;
        draft.log.push({ turn: draft.turn, faction: 'marquise', message: `Overworked sawmill in ${a.clearing}.` });
      });

    case 'marquise.beginMarch':
      return produce(state, draft => {
        if (draft.phase !== 'daylight') return;
        const m = draft.factions.marquise!;
        if (m.daylightActionsLeft <= 0) return;
        if (m.marchMovesLeft > 0) return; // already mid-march
        m.daylightActionsLeft -= 1;
        m.marchMovesLeft = 2;
        draft.log.push({ turn: draft.turn, faction: 'marquise', message: 'March begun (2 moves).' });
      });

    case 'marquise.march': {
      return produce(state, draft => {
        if (draft.phase !== 'daylight') return;
        const m = draft.factions.marquise!;
        if (m.marchMovesLeft <= 0) return; // must beginMarch first
        const from = draft.map.clearings[a.from];
        const to = draft.map.clearings[a.to];
        if (!from || !to) return;
        if (!getAdjacent(AUTUMN_MAP, a.from).includes(a.to)) return;
        if (!(rules(draft, a.from) || rules(draft, a.to))) return;
        const have = from.warriors.marquise ?? 0;
        const n = Math.min(a.count, have);
        if (n <= 0) return;
        from.warriors.marquise = have - n;
        to.warriors.marquise = (to.warriors.marquise ?? 0) + n;
        m.marchMovesLeft -= 1;
        draft.lastMoveClearing = a.to;
        draft.log.push({ turn: draft.turn, faction: 'marquise', message: `Marched ${n} from ${a.from} to ${a.to}.` });
        // Outrage: if destination has Alliance sympathy, moving faction must pay
        if (!draft.pendingOutrage) {
          const destCl = draft.map.clearings[a.to]!;
          if (destCl.tokens.some(t => t.faction === 'alliance' && t.kind === 'sympathy')) {
            const destMeta = AUTUMN_MAP.clearings.find(c => c.id === a.to)!;
            draft.pendingOutrage = { clearing: a.to, faction: 'marquise', suit: destMeta.suit as 'fox' | 'mouse' | 'rabbit' };
          }
        }
      });
    }

    case 'marquise.endMarch':
      return produce(state, draft => {
        draft.factions.marquise!.marchMovesLeft = 0;
      });

    case 'marquise.battle': {
      if (state.phase !== 'daylight') return state;
      const m = state.factions.marquise!;
      if (m.daylightActionsLeft <= 0) return state;
      // Spend the action up-front so the cost lands whether or not the
      // defender ambushes; declareBattle either resolves the combat
      // immediately or queues a defender-ambush prompt.
      const pre = produce(state, draft => {
        draft.factions.marquise!.daylightActionsLeft -= 1;
        draft.lastBattleClearing = a.clearing;
      });
      return declareBattle(pre, { clearing: a.clearing, attacker: 'marquise', defender: a.defender });
    }

    case 'marquise.craft':
      return produce(state, draft => {
        if (draft.phase !== 'daylight') return;
        const card = getCard(a.cardId);
        if (card.category !== 'item' && card.category !== 'persistent' && card.category !== 'favor') return;
        const m = draft.factions.marquise!;
        if (m.daylightActionsLeft <= 0) return;
        if (m.buildings.workshop <= 0) return;
        // Verify per-suit workshop power, accounting for already-used power this turn.
        const power: Partial<Record<CardSuit, number>> = {};
        for (const c of AUTUMN_MAP.clearings) {
          const cl = draft.map.clearings[c.id]!;
          const ws = cl.buildings.filter(b => b.faction === 'marquise' && b.kind === 'workshop').length;
          if (ws > 0) power[c.suit] = (power[c.suit] ?? 0) + ws;
        }
        for (const craftedId of m.craftedThisTurn) {
          for (const [s, n] of Object.entries(getCard(craftedId).craftCost)) {
            power[s as CardSuit] = Math.max(0, (power[s as CardSuit] ?? 0) - (n ?? 0));
          }
        }
        if (!canMeetCraftCost(power, card.craftCost)) return;
        if (!consumeCardFromHand(draft, a.cardId)) return;
        m.craftedThisTurn.push(a.cardId);
        m.daylightActionsLeft -= 1;
        if (card.craftVp) draft.scores.marquise += card.craftVp;
        if (card.item) { draft.itemSupply.push(card.item); draft.craftedItemLog.push({ faction: 'marquise', item: card.item }); }
        if (card.category === 'persistent') draft.craftedPersistents.push({ faction: 'marquise', cardId: a.cardId });
        if (card.category === 'favor') applyFavor(draft, card.suit, 'marquise');
        draft.log.push({ turn: draft.turn, faction: 'marquise', message: `Crafted ${card.name} (+${card.craftVp ?? 0} VP).` });
      });

    case 'marquise.spendBirdForExtra':
      return produce(state, draft => {
        if (draft.phase !== 'daylight') return;
        const m = draft.factions.marquise!;
        if (m.bonusActionUsed) return;
        const card = getCard(a.cardId);
        if (card.suit !== 'bird') return;
        if (!consumeCardFromHand(draft, a.cardId)) return;
        m.bonusActionUsed = true;
        m.daylightActionsLeft += 1;
        draft.log.push({ turn: draft.turn, faction: 'marquise', message: `Spent ${card.name} for an extra action.` });
      });

    case 'marquise.endDaylight':
      return produce(state, draft => {
        const m = draft.factions.marquise!;
        m.daylightActionsLeft = 0;
        if (draft.phase === 'daylight') draft.phase = 'evening';
        draft.log.push({ turn: draft.turn, faction: 'marquise', message: 'Daylight ended.' });
      });

    case 'marquise.evening':
      return produce(state, draft => {
        if (draft.phase !== 'evening') return;
        const m = draft.factions.marquise!;
        if (m.pendingDiscard > 0) return; // wait for player to finish discarding
        const draws = 1 + Math.floor(m.buildings.workshop / 3);
        for (let i = 0; i < draws; i++) {
          const c = draft.deck.pop();
          if (!c) break;
          draft.hands.marquise.push(c);
        }
        const excess = draft.hands.marquise.length - 5;
        if (excess > 0) {
          m.pendingDiscard = excess;
          draft.log.push({ turn: draft.turn, faction: 'marquise', message: `Evening: drew ${draws}, must discard ${excess}.` });
          return;
        }
        finishMarquiseTurn(draft, draws);
      });

    case 'marquise.discardCard':
      return produce(state, draft => {
        const m = draft.factions.marquise!;
        if (m.pendingDiscard <= 0) return;
        const idx = draft.hands.marquise.indexOf(a.cardId);
        if (idx < 0) return;
        draft.hands.marquise.splice(idx, 1);
        draft.discard.push(a.cardId);
        m.pendingDiscard -= 1;
        if (m.pendingDiscard === 0) finishMarquiseTurn(draft, 0);
      });

    default:
      return state;
  }
}

function finishMarquiseTurn(draft: GameState, drawsLogged: number): void {
  const m = draft.factions.marquise!;
  m.birdsongDone = false;
  m.recruitedThisTurn = false;
  m.daylightActionsLeft = 3;
  m.bonusActionUsed = false;
  m.craftedThisTurn = [];
  m.pendingDiscard = 0;
  m.marchMovesLeft = 0;
  draft.activeIndex = (draft.activeIndex + 1) % draft.factionOrder.length;
  if (draft.activeIndex === 0) draft.turn += 1;
  draft.phase = 'birdsong';
  const tail = drawsLogged > 0 ? `Evening: drew ${drawsLogged}; ` : '';
  draft.log.push({ turn: draft.turn, faction: 'marquise', message: `${tail}next: ${draft.factionOrder[draft.activeIndex]} birdsong.` });
  onEnterBirdsong(draft);
}

export function marquiseLegalActions(state: GameState): Action[] {
  if (!isMarquiseTurn(state)) return [];
  const out: Action[] = [];
  const m = state.factions.marquise;
  if (!m) return out;

  // Pending discard gates everything else, regardless of phase
  if (m.pendingDiscard > 0) {
    for (const cardId of state.hands.marquise) {
      out.push({ kind: 'marquise.discardCard', cardId });
    }
    return out;
  }

  // If outrage is pending for marquise, ONLY resolve it
  if (state.pendingOutrage?.faction === 'marquise') {
    const o = state.pendingOutrage;
    const matchingCards = state.hands.marquise.filter(id => {
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

  if (state.phase === 'birdsong' && !m.birdsongDone) {
    out.push({ kind: 'marquise.placeWood' });
  }
  if (state.phase === 'daylight') {
    // Mid-march: only march sub-moves and end-march are legal.
    if (m.marchMovesLeft > 0) {
      for (const c of AUTUMN_MAP.clearings) {
        const have = state.map.clearings[c.id]!.warriors.marquise ?? 0;
        if (have <= 0) continue;
        for (const nb of getAdjacent(AUTUMN_MAP, c.id)) {
          if (rules(state, c.id) || rules(state, nb)) {
            out.push({ kind: 'marquise.march', from: c.id, to: nb, count: have });
          }
        }
      }
      out.push({ kind: 'marquise.endMarch' });
      return out; // nothing else allowed while mid-march
    }
    if (m.daylightActionsLeft > 0) {
      // Build candidates
      for (const kind of ['sawmill', 'workshop', 'recruiter'] as const) {
        if (m.buildings[kind] >= 6) continue;
        for (const c of AUTUMN_MAP.clearings) {
          const cl = state.map.clearings[c.id]!;
          if (cl.buildings.length + cl.tokens.filter(t => t.kind === 'keep').length >= c.buildingSlots + (cl.extraBuildingSlots ?? 0)) continue;
          if (!rules(state, c.id)) continue;
          const cost = buildCost(m.buildings[kind]);
          if (reachableSawmillWood(state, c.id).length < cost) continue;
          out.push({ kind: 'marquise.build', clearing: c.id, building: kind });
        }
      }
      // Recruit
      if (!m.recruitedThisTurn && m.buildings.recruiter > 0 && m.warriorSupply > 0) {
        out.push({ kind: 'marquise.recruit' });
      }
      // Begin March (the March button — march sub-moves come after)
      const hasMovablePieces = AUTUMN_MAP.clearings.some(c => {
        const have = state.map.clearings[c.id]!.warriors.marquise ?? 0;
        return have > 0 && getAdjacent(AUTUMN_MAP, c.id).some(nb => rules(state, c.id) || rules(state, nb));
      });
      if (hasMovablePieces) {
        out.push({ kind: 'marquise.beginMarch' });
      }
      // Overwork
      for (const c of AUTUMN_MAP.clearings) {
        const cl = state.map.clearings[c.id]!;
        const sawmills = cl.buildings.filter(b => b.faction === 'marquise' && b.kind === 'sawmill').length;
        if (sawmills === 0) continue;
        for (const cardId of state.hands.marquise) {
          const card = getCard(cardId);
          if (card.suit === c.suit || card.suit === 'bird') {
            out.push({ kind: 'marquise.overwork', clearing: c.id, cardId });
          }
        }
      }
      // Battle (anywhere Marquise has warriors with an enemy present)
      for (const c of AUTUMN_MAP.clearings) {
        const cl = state.map.clearings[c.id]!;
        if ((cl.warriors.marquise ?? 0) <= 0) continue;
        for (const f of ['eyrie', 'alliance', 'vagabond'] as const) {
          if ((cl.warriors[f] ?? 0) > 0 || cl.buildings.some(b => b.faction === f) || cl.tokens.some(t => t.faction === f)) {
            out.push({ kind: 'marquise.battle', clearing: c.id, defender: f });
          }
        }
      }
      // Craft — using workshop power (workshops in each suit clearing)
      if (m.buildings.workshop > 0) {
        const power: Partial<Record<CardSuit, number>> = {};
        for (const c of AUTUMN_MAP.clearings) {
          const cl = state.map.clearings[c.id]!;
          const ws = cl.buildings.filter(b => b.faction === 'marquise' && b.kind === 'workshop').length;
          if (ws > 0) power[c.suit] = (power[c.suit] ?? 0) + ws;
        }
        // Subtract power already consumed this turn
        for (const craftedId of m.craftedThisTurn) {
          for (const [s, n] of Object.entries(getCard(craftedId).craftCost)) {
            power[s as CardSuit] = Math.max(0, (power[s as CardSuit] ?? 0) - (n ?? 0));
          }
        }
        for (const cardId of state.hands.marquise) {
          const card = getCard(cardId);
          if (card.category !== 'item' && card.category !== 'persistent' && card.category !== 'favor') continue;
          const cost = card.craftCost;
          if (!cost || Object.keys(cost).length === 0) continue;
          if (canMeetCraftCost(power, cost)) out.push({ kind: 'marquise.craft', cardId });
        }
      }
    }
    // Bird card for extra action (any bird card including dominance is valid per rules)
    // Available even at 0 actions left — to get one more action.
    if (!m.bonusActionUsed) {
      for (const cardId of state.hands.marquise) {
        const c = getCard(cardId);
        if (c.suit === 'bird') {
          out.push({ kind: 'marquise.spendBirdForExtra', cardId });
          break;
        }
      }
    }
    out.push({ kind: 'marquise.endDaylight' });
  }
  if (state.phase === 'evening') {
    if (m.pendingDiscard > 0) {
      for (const cardId of state.hands.marquise) {
        out.push({ kind: 'marquise.discardCard', cardId });
      }
    } else {
      out.push({ kind: 'marquise.evening' });
    }
  }
  return out;
}
