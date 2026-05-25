import { produce } from 'immer';
import type { GameState, Action, ClearingId, Faction, ItemKind } from '../../types';
import { getCard } from '../../cards';
import { AUTUMN_MAP, getAdjacent, getForest, forestsAtClearing, adjacentForests } from '../../map';
import { applyFavor } from '../../effects';
import { onEnterBirdsong } from '../../loop';
import type { VagabondAction } from './actions';
import type { Relationship } from './state';
import { getQuest } from './quests';

function isVagabondTurn(state: GameState): boolean {
  return state.factionOrder[state.activeIndex] === 'vagabond';
}

const REL_LADDER: Relationship[] = ['indifferent', 1, 2, 3, 'allied'];

function findItem(items: { kind: ItemKind; state: string; exhausted: boolean }[], kind: ItemKind) {
  return items.find(i => i.kind === kind && i.state === 'face-up' && !i.exhausted);
}

function exhaustItem(items: { kind: ItemKind; state: string; exhausted: boolean }[], kind: ItemKind): boolean {
  const it = findItem(items, kind);
  if (!it) return false;
  it.exhausted = true;
  return true;
}

function bumpRelationship(rel: Relationship): Relationship {
  if (rel === 'hostile') return 'hostile';
  const idx = REL_LADDER.indexOf(rel);
  if (idx < 0 || idx === REL_LADDER.length - 1) return rel;
  return REL_LADDER[idx + 1]!;
}

function returnWarriors(draft: GameState, clearing: ClearingId, faction: Faction, n: number): void {
  const cl = draft.map.clearings[clearing]!;
  cl.warriors[faction] = Math.max(0, (cl.warriors[faction] ?? 0) - n);
  if (faction === 'marquise' && draft.factions.marquise) draft.factions.marquise.warriorSupply += n;
  else if (faction === 'eyrie' && draft.factions.eyrie) draft.factions.eyrie.warriorSupply += n;
  else if (faction === 'alliance' && draft.factions.alliance) draft.factions.alliance.warriorSupply += n;
}

export function vagabondReducer(state: GameState, action: Action): GameState {
  if (!action.kind.startsWith('vagabond.')) return state;
  if (!isVagabondTurn(state)) return state;
  const a = action as VagabondAction;

  switch (a.kind) {
    case 'vagabond.slip':
      return produce(state, draft => {
        if (draft.phase !== 'birdsong') return;
        const v = draft.factions.vagabond!;
        if (v.inForest) return;
        if (!getAdjacent(AUTUMN_MAP, v.clearing).includes(a.to)) return;
        draft.map.clearings[v.clearing]!.vagabondHere = false;
        v.clearing = a.to;
        draft.map.clearings[a.to]!.vagabondHere = true;
        v.slipped = true;
      });

    case 'vagabond.slipToForest':
      return produce(state, draft => {
        if (draft.phase !== 'birdsong') return;
        const v = draft.factions.vagabond!;
        if (v.inForest) return;
        if (!forestsAtClearing(AUTUMN_MAP, v.clearing).includes(a.forestId)) return;
        draft.map.clearings[v.clearing]!.vagabondHere = false;
        v.inForest = a.forestId;
        v.slipped = true;
        draft.log.push({ turn: draft.turn, faction: 'vagabond', message: `Slipped into forest ${a.forestId}.` });
      });

    case 'vagabond.enterForest':
      return produce(state, draft => {
        if (draft.phase !== 'daylight') return;
        const v = draft.factions.vagabond!;
        if (v.daylightActionsLeft <= 0) return;
        if (v.inForest) {
          if (!adjacentForests(AUTUMN_MAP, v.inForest).includes(a.forestId)) return;
          if (!exhaustItem(v.items, 'boots')) return;
          v.inForest = a.forestId;
        } else {
          if (!forestsAtClearing(AUTUMN_MAP, v.clearing).includes(a.forestId)) return;
          if (!exhaustItem(v.items, 'boots')) return;
          draft.map.clearings[v.clearing]!.vagabondHere = false;
          v.inForest = a.forestId;
        }
        v.daylightActionsLeft -= 1;
        draft.log.push({ turn: draft.turn, faction: 'vagabond', message: `Entered forest ${a.forestId}.` });
      });

    case 'vagabond.exitForest':
      return produce(state, draft => {
        if (draft.phase !== 'daylight') return;
        const v = draft.factions.vagabond!;
        if (v.daylightActionsLeft <= 0) return;
        if (!v.inForest) return;
        const f = getForest(AUTUMN_MAP, v.inForest);
        if (!f.clearings.includes(a.to)) return;
        if (!exhaustItem(v.items, 'boots')) return;
        const destCl = draft.map.clearings[a.to]!;
        const hostilePresent = (['marquise', 'eyrie', 'alliance'] as const).some(faction => {
          const rel = v.relationships[faction];
          return rel !== 'allied' && (destCl.warriors[faction] ?? 0) > 0;
        });
        if (hostilePresent) {
          if (!exhaustItem(v.items, 'boots')) return;
        }
        v.inForest = undefined;
        v.clearing = a.to;
        draft.map.clearings[a.to]!.vagabondHere = true;
        v.daylightActionsLeft -= 1;
        draft.log.push({ turn: draft.turn, faction: 'vagabond', message: `Exited forest → clearing ${a.to}.` });
      });

    case 'vagabond.refresh':
      return produce(state, draft => {
        if (draft.phase !== 'birdsong') return;
        const v = draft.factions.vagabond!;
        const teaCount = v.items.filter(i => i.kind === 'tea' && i.state === 'face-up').length;
        let toRefresh = 3 + teaCount;
        for (const it of v.items) {
          if (toRefresh <= 0) break;
          if (it.exhausted && it.state === 'face-up') {
            it.exhausted = false;
            toRefresh -= 1;
          }
        }
        v.daylightActionsLeft = 6;
        draft.phase = 'daylight';
      });

    case 'vagabond.move':
      return produce(state, draft => {
        if (draft.phase !== 'daylight') return;
        const v = draft.factions.vagabond!;
        if (v.daylightActionsLeft <= 0) return;
        if (!getAdjacent(AUTUMN_MAP, v.clearing).includes(a.to)) return;
        if (!exhaustItem(v.items, 'boots')) return;
        // Hostile destination: exhaust extra boots
        const destCl = draft.map.clearings[a.to]!;
        const hostilePresent = (['marquise', 'eyrie', 'alliance'] as const).some(f => {
          const rel = v.relationships[f];
          return (rel !== 'allied') && (destCl.warriors[f] ?? 0) > 0;
        });
        if (hostilePresent) {
          if (!exhaustItem(v.items, 'boots')) return;
        }
        draft.map.clearings[v.clearing]!.vagabondHere = false;
        v.clearing = a.to;
        draft.map.clearings[a.to]!.vagabondHere = true;
        v.daylightActionsLeft -= 1;
      });

    case 'vagabond.exploreRuin':
      return produce(state, draft => {
        if (draft.phase !== 'daylight') return;
        const v = draft.factions.vagabond!;
        if (v.daylightActionsLeft <= 0) return;
        const meta = AUTUMN_MAP.clearings.find(c => c.id === v.clearing)!;
        if (!meta.hasRuin) return;
        if (!exhaustItem(v.items, 'torch')) return;
        // Treat ruin as removed; we don't track removal on Clearing state, so use a flag in vagabond state.
        v.ruinsExplored += 1;
        // Gain a face-down item from the supply (just take next available).
        const itemKind: ItemKind | undefined = draft.itemSupply.shift();
        if (itemKind) v.items.push({ kind: itemKind, state: 'face-down', exhausted: false });
        draft.scores.vagabond += 1;
        v.daylightActionsLeft -= 1;
        draft.log.push({ turn: draft.turn, faction: 'vagabond', message: `Explored ruin in ${v.clearing} (+1 VP).` });
      });

    case 'vagabond.aid':
      return produce(state, draft => {
        if (draft.phase !== 'daylight') return;
        const v = draft.factions.vagabond!;
        if (v.daylightActionsLeft <= 0) return;
        const meta = AUTUMN_MAP.clearings.find(c => c.id === v.clearing)!;
        const card = getCard(a.cardId);
        if (card.suit !== meta.suit && card.suit !== 'bird') return;
        // Recipient must have warriors in clearing
        const cl = draft.map.clearings[v.clearing]!;
        if ((cl.warriors[a.faction] ?? 0) <= 0) return;
        const idx = draft.hands.vagabond.indexOf(a.cardId);
        if (idx < 0) return;
        draft.hands.vagabond.splice(idx, 1);
        draft.hands[a.faction].push(a.cardId);
        v.relationships[a.faction] = bumpRelationship(v.relationships[a.faction]);
        v.daylightActionsLeft -= 1;
        draft.log.push({ turn: draft.turn, faction: 'vagabond', message: `Aided ${a.faction}; relationship → ${v.relationships[a.faction]}.` });
      });

    case 'vagabond.strike':
      return produce(state, draft => {
        if (draft.phase !== 'daylight') return;
        const v = draft.factions.vagabond!;
        if (v.daylightActionsLeft <= 0) return;
        if (a.clearing !== v.clearing) return;
        if (v.relationships[a.faction] === 'allied') return;
        if (!exhaustItem(v.items, 'crossbow')) return;
        const cl = draft.map.clearings[v.clearing]!;
        if ((cl.warriors[a.faction] ?? 0) <= 0) return;
        returnWarriors(draft, v.clearing, a.faction, 1);
        // +1 VP if hostile target
        if (v.relationships[a.faction] === 'hostile') draft.scores.vagabond += 1;
        v.daylightActionsLeft -= 1;
      });

    case 'vagabond.repair':
      return produce(state, draft => {
        if (draft.phase !== 'daylight') return;
        const v = draft.factions.vagabond!;
        if (!exhaustItem(v.items, 'hammer')) return;
        const damaged = v.items.find(i => i.state === 'damaged');
        if (!damaged) return;
        damaged.state = 'face-up';
      });

    case 'vagabond.craft':
      return produce(state, draft => {
        if (draft.phase !== 'daylight') return;
        const v = draft.factions.vagabond!;
        if (v.inForest) return;
        const card = getCard(a.cardId);
        if (card.category !== 'item' && card.category !== 'persistent' && card.category !== 'favor') return;
        // Vagabond crafts by exhausting one face-up item (the "hammer power").
        if (!exhaustItem(v.items, 'hammer')) return;
        const idx = draft.hands.vagabond.indexOf(a.cardId);
        if (idx < 0) return;
        draft.hands.vagabond.splice(idx, 1);
        if (card.craftVp) draft.scores.vagabond += card.craftVp;
        if (card.item) draft.itemSupply.push(card.item);
        if (card.category === 'persistent') draft.craftedPersistents.push({ faction: 'vagabond', cardId: a.cardId });
        if (card.category === 'favor') applyFavor(draft, card.suit, 'vagabond');
        draft.discard.push(a.cardId);
        draft.log.push({ turn: draft.turn, faction: 'vagabond', message: `Crafted ${card.name} (+${card.craftVp ?? 0} VP).` });
      });

    case 'vagabond.completeQuest':
      return produce(state, draft => {
        if (draft.phase !== 'daylight') return;
        const v = draft.factions.vagabond!;
        if (v.daylightActionsLeft <= 0) return;
        if (!v.questDisplay.includes(a.questId)) return;
        const quest = getQuest(a.questId);
        const meta = AUTUMN_MAP.clearings.find(c => c.id === v.clearing)!;
        if (meta.suit !== quest.suit) return;
        if (!exhaustItem(v.items, quest.item1)) return;
        if (!exhaustItem(v.items, quest.item2)) {
          // Roll back the first exhaust on failure to keep the state coherent.
          const it1 = v.items.find(i => i.kind === quest.item1 && i.state === 'face-up' && i.exhausted);
          if (it1) it1.exhausted = false;
          return;
        }
        // Remove from display, draw a replacement if available, bank the VP.
        v.questDisplay = v.questDisplay.filter(id => id !== a.questId);
        if (v.questDeck.length > 0) v.questDisplay.push(v.questDeck.shift()!);
        v.completedQuests.push(a.questId);
        const alreadyCompletedOfType = v.completedQuests.filter(id => id !== a.questId && getQuest(id).suit === quest.suit).length;
        // Real Root grants +1 VP per existing completion of the same quest;
        // we use the same per-suit bump for similar pressure.
        const vp = quest.baseVp + alreadyCompletedOfType;
        draft.scores.vagabond += vp;
        v.daylightActionsLeft -= 1;
        draft.log.push({ turn: draft.turn, faction: 'vagabond', message: `Completed quest ${a.questId} for ${vp} VP.` });
      });

    case 'vagabond.formCoalition':
      return produce(state, draft => {
        if (draft.phase !== 'daylight' && draft.phase !== 'evening') return;
        const v = draft.factions.vagabond!;
        if (v.coalitionPartner) return; // already allied
        const myScore = draft.scores.vagabond;
        const targetScore = draft.scores[a.faction];
        // Coalition is only legal with a faction in last place — i.e. strictly
        // worse than every other non-vagabond faction (and not above the Vagabond
        // either). Mirrors the spirit of the real rule.
        const others = (['marquise', 'eyrie', 'alliance'] as const).filter(f => f !== a.faction && draft.factions[f]);
        const isLastPlace = others.every(f => draft.scores[f] > targetScore);
        if (!isLastPlace) return;
        if (targetScore >= myScore) return;
        v.coalitionPartner = a.faction;
        // Vagabond becomes 'allied' with the partner (no longer attacks them).
        v.relationships[a.faction] = 'allied';
        draft.log.push({ turn: draft.turn, faction: 'vagabond', message: `Formed coalition with ${a.faction}.` });
      });

    case 'vagabond.endDaylight':
      return produce(state, draft => {
        if (draft.phase !== 'daylight') return;
        draft.factions.vagabond!.daylightActionsLeft = 0;
        draft.phase = 'evening';
      });

    case 'vagabond.evening':
      return produce(state, draft => {
        if (draft.phase !== 'evening') return;
        const v = draft.factions.vagabond!;
        if (v.pendingDiscard > 0) return;
        const coinCount = v.items.filter(i => i.kind === 'coin' && i.state === 'face-up').length;
        const draws = 1 + coinCount;
        for (let i = 0; i < draws; i++) {
          const c = draft.deck.pop();
          if (!c) break;
          draft.hands.vagabond.push(c);
        }
        const bagCount = v.items.filter(i => i.kind === 'bag' && i.state === 'face-up').length;
        const limit = 5 + bagCount;
        const excess = draft.hands.vagabond.length - limit;
        if (excess > 0) {
          v.pendingDiscard = excess;
          draft.log.push({ turn: draft.turn, faction: 'vagabond', message: `Evening: drew ${draws}, must discard ${excess} (limit ${limit}).` });
          return;
        }
        finishVagabondTurn(draft, draws);
      });

    case 'vagabond.discardCard':
      return produce(state, draft => {
        const v = draft.factions.vagabond!;
        if (v.pendingDiscard <= 0) return;
        const idx = draft.hands.vagabond.indexOf(a.cardId);
        if (idx < 0) return;
        draft.hands.vagabond.splice(idx, 1);
        draft.discard.push(a.cardId);
        v.pendingDiscard -= 1;
        if (v.pendingDiscard === 0) finishVagabondTurn(draft, 0);
      });

    default:
      return state;
  }
}

function finishVagabondTurn(draft: GameState, _draws: number): void {
  const v = draft.factions.vagabond!;
  v.slipped = false;
  v.daylightActionsLeft = 6;
  v.pendingDiscard = 0;
  draft.activeIndex = (draft.activeIndex + 1) % draft.factionOrder.length;
  if (draft.activeIndex === 0) draft.turn += 1;
  draft.phase = 'birdsong';
  draft.log.push({ turn: draft.turn, faction: 'vagabond', message: `Turn ends; next: ${draft.factionOrder[draft.activeIndex]} birdsong.` });
  onEnterBirdsong(draft);
}

export function vagabondLegalActions(state: GameState): Action[] {
  if (!isVagabondTurn(state)) return [];
  const out: Action[] = [];
  const v = state.factions.vagabond;
  if (!v) return out;

  if (state.phase === 'birdsong') {
    out.push({ kind: 'vagabond.refresh' });
    if (!v.inForest) {
      for (const nb of getAdjacent(AUTUMN_MAP, v.clearing)) {
        out.push({ kind: 'vagabond.slip', to: nb });
      }
      for (const fid of forestsAtClearing(AUTUMN_MAP, v.clearing)) {
        out.push({ kind: 'vagabond.slipToForest', forestId: fid });
      }
    }
  }
  if (state.phase === 'daylight' && v.daylightActionsLeft > 0) {
    // Move + forest entry/exit. While in a forest, almost everything else
    // is gated off — you have to step back into a clearing first.
    if (v.inForest) {
      if (findItem(v.items, 'boots')) {
        const f = getForest(AUTUMN_MAP, v.inForest);
        for (const cid of f.clearings) out.push({ kind: 'vagabond.exitForest', to: cid });
        for (const fid of adjacentForests(AUTUMN_MAP, v.inForest)) {
          out.push({ kind: 'vagabond.enterForest', forestId: fid });
        }
      }
    } else {
      if (findItem(v.items, 'boots')) {
        for (const nb of getAdjacent(AUTUMN_MAP, v.clearing)) {
          out.push({ kind: 'vagabond.move', to: nb });
        }
        for (const fid of forestsAtClearing(AUTUMN_MAP, v.clearing)) {
          out.push({ kind: 'vagabond.enterForest', forestId: fid });
        }
      }
      const meta = AUTUMN_MAP.clearings.find(c => c.id === v.clearing)!;
      // Explore
      if (meta.hasRuin && findItem(v.items, 'torch') && v.ruinsExplored < 4) {
        out.push({ kind: 'vagabond.exploreRuin' });
      }
      // Aid
      const cl = state.map.clearings[v.clearing]!;
      for (const cardId of state.hands.vagabond) {
        const card = getCard(cardId);
        if (card.suit !== meta.suit && card.suit !== 'bird') continue;
        for (const f of ['marquise', 'eyrie', 'alliance'] as const) {
          if ((cl.warriors[f] ?? 0) > 0) out.push({ kind: 'vagabond.aid', faction: f, cardId });
        }
      }
      // Strike
      if (findItem(v.items, 'crossbow')) {
        for (const f of ['marquise', 'eyrie', 'alliance'] as const) {
          if (v.relationships[f] === 'allied') continue;
          if ((cl.warriors[f] ?? 0) > 0) out.push({ kind: 'vagabond.strike', clearing: v.clearing, faction: f });
        }
      }
      // Repair
      if (findItem(v.items, 'hammer') && v.items.some(i => i.state === 'damaged')) {
        const damaged = v.items.find(i => i.state === 'damaged')!;
        out.push({ kind: 'vagabond.repair', itemKind: damaged.kind });
      }
      // Craft — exhausts a hammer, consumes a card.
      if (findItem(v.items, 'hammer')) {
        for (const cardId of state.hands.vagabond) {
          const card = getCard(cardId);
          if (card.category === 'item' || card.category === 'persistent' || card.category === 'favor') {
            out.push({ kind: 'vagabond.craft', cardId });
          }
        }
      }
      // Complete quest
      for (const questId of v.questDisplay) {
        const q = getQuest(questId);
        if (q.suit !== meta.suit) continue;
        if (!findItem(v.items, q.item1)) continue;
        if (q.item1 !== q.item2 && !findItem(v.items, q.item2)) continue;
        if (q.item1 === q.item2) {
          const count = v.items.filter(i => i.kind === q.item1 && i.state === 'face-up' && !i.exhausted).length;
          if (count < 2) continue;
        }
        out.push({ kind: 'vagabond.completeQuest', questId });
      }
    }
    // Form coalition — only with a strictly-last-place faction.
    if (!v.coalitionPartner) {
      const candidates = (['marquise', 'eyrie', 'alliance'] as const).filter(f => state.factions[f]);
      for (const f of candidates) {
        const others = candidates.filter(o => o !== f);
        if (others.every(o => state.scores[o] > state.scores[f]) && state.scores[f] < state.scores.vagabond) {
          out.push({ kind: 'vagabond.formCoalition', faction: f });
        }
      }
    }
  }
  if (state.phase === 'daylight') out.push({ kind: 'vagabond.endDaylight' });
  if (state.phase === 'evening') {
    if (v.pendingDiscard > 0) {
      for (const cardId of state.hands.vagabond) {
        out.push({ kind: 'vagabond.discardCard', cardId });
      }
    } else {
      out.push({ kind: 'vagabond.evening' });
    }
  }
  return out;
}

/** Coalition victory check: called whenever scores change. */
export function checkCoalitionVictory(state: GameState): GameState {
  if (state.winner) return state;
  const v = state.factions.vagabond;
  if (!v?.coalitionPartner) return state;
  if (state.scores[v.coalitionPartner] >= 30) {
    return produce(state, draft => {
      draft.winner = { faction: 'vagabond', via: 'coalition' };
      draft.phase = 'gameOver';
    });
  }
  return state;
}
