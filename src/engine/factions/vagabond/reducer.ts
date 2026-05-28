import { produce } from 'immer';
import type { GameState, Action, CardSuit, ClearingId, Faction, ItemKind } from '../../types';
import { getCard } from '../../cards';
import { AUTUMN_MAP, getAdjacent, getForest, forestsAtClearing, adjacentForests } from '../../map';
import { applyFavor } from '../../effects';
import { onEnterBirdsong } from '../../loop';
import { mulberry32, mixSeed, rollDie } from '../../rng';
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

/** VP scored when aid improves to the given relationship level. */
function aidVpForRelationship(rel: Relationship): number {
  if (rel === 1) return 1;
  if (rel === 2) return 2;
  if (rel === 3) return 3;
  if (rel === 'allied') return 4;
  return 0; // hostile or indifferent — no VP
}

// Items on tracks (T/X/B = Torch/Crossbow/Bag): each face-up copy gives +2 satchel capacity,
// and each track holds at most 3 items.
const TRACK_ITEMS: readonly ItemKind[] = ['torch', 'crossbow', 'bag'];
const TRACK_LIMIT = 3;

/** Max items allowed in satchel + damaged box. */
function itemCapacity(items: { kind: ItemKind; state: string }[]): number {
  const faceUpTrackCount = TRACK_ITEMS.reduce(
    (sum, kind) => sum + items.filter(i => i.kind === kind && i.state === 'face-up').length,
    0,
  );
  return 6 + 2 * faceUpTrackCount;
}

/** Count of items currently in satchel (face-down) or damaged box (damaged). */
function satchelAndDamagedCount(items: { state: string }[]): number {
  return items.filter(i => i.state === 'face-down' || i.state === 'damaged').length;
}

/** True if the item can be added (track items are capped at TRACK_LIMIT). */
function canGainItem(items: { kind: ItemKind }[], kind: ItemKind): boolean {
  if (!TRACK_ITEMS.includes(kind)) return true;
  return items.filter(i => i.kind === kind).length < TRACK_LIMIT;
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

    case 'vagabond.slipToHideout':
      return produce(state, draft => {
        if (draft.phase !== 'birdsong') return;
        const v = draft.factions.vagabond!;
        if (v.character !== 'ranger') return;
        if (!v.hideout || v.inForest) return;
        if (v.hideout === v.clearing) return; // already there
        draft.map.clearings[v.clearing]!.vagabondHere = false;
        v.clearing = v.hideout;
        draft.map.clearings[v.hideout]!.vagabondHere = true;
        v.slipped = true;
        draft.log.push({ turn: draft.turn, faction: 'vagabond', message: `Ranger slipped to hideout at clearing ${v.hideout}.` });
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
        // Thief (Nimble) never pays extra boot for hostile destinations.
        if (v.character !== 'thief') {
          const destCl = draft.map.clearings[a.to]!;
          const hostilePresent = (['marquise', 'eyrie', 'alliance'] as const).some(faction => {
            return v.relationships[faction] === 'hostile' && (destCl.warriors[faction] ?? 0) > 0;
          });
          if (hostilePresent) {
            if (!exhaustItem(v.items, 'boots')) return;
          }
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
        // Items were already auto-refreshed in onEnterBirdsong; this just starts daylight.
        draft.phase = 'daylight';
      });

    case 'vagabond.move':
      return produce(state, draft => {
        if (draft.phase !== 'daylight') return;
        const v = draft.factions.vagabond!;
        if (v.daylightActionsLeft <= 0) return;
        if (!getAdjacent(AUTUMN_MAP, v.clearing).includes(a.to)) return;
        if (!exhaustItem(v.items, 'boots')) return;
        // Hostile destination: exhaust extra boot — Thief (Nimble) is exempt.
        if (v.character !== 'thief') {
          const destCl = draft.map.clearings[a.to]!;
          const hostilePresent = (['marquise', 'eyrie', 'alliance'] as const).some(f => {
            return v.relationships[f] === 'hostile' && (destCl.warriors[f] ?? 0) > 0;
          });
          if (hostilePresent) {
            if (!exhaustItem(v.items, 'boots')) return;
          }
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
        if (v.exploredRuins.includes(v.clearing)) return;
        if (!exhaustItem(v.items, 'torch')) return;
        // Mark the ruin as explored (removes it visually).
        v.exploredRuins.push(v.clearing);
        draft.map.clearings[v.clearing]!.ruinExplored = true;
        // The clearing gains a free building slot where the ruin token was.
        const cl = draft.map.clearings[v.clearing]!;
        cl.extraBuildingSlots = (cl.extraBuildingSlots ?? 0) + 1;
        // Give the specific item hidden under this ruin (random assignment in newGame overrides static map).
        const itemKind: ItemKind = cl.ruinItem ?? meta.ruinItem ?? (draft.itemSupply.shift() as ItemKind | undefined) ?? 'torch';
        // Track items (T/X/B) go face-up on their track if room; otherwise satchel.
        const itemState = canGainItem(v.items, itemKind) ? 'face-up' : 'face-down';
        v.items.push({ kind: itemKind, state: itemState, exhausted: false });
        draft.scores.vagabond += 1;
        v.daylightActionsLeft -= 1;
        draft.log.push({ turn: draft.turn, faction: 'vagabond', message: `Explored ruin in clearing ${v.clearing} — found ${itemKind}! (+1 VP)` });
      });

    case 'vagabond.battle':
      return produce(state, draft => {
        if (draft.phase !== 'daylight') return;
        const v = draft.factions.vagabond!;
        if (v.daylightActionsLeft <= 0) return;
        if (v.inForest) return;
        if (a.clearing !== v.clearing) return;
        if (!exhaustItem(v.items, 'sword')) return;
        const cl = draft.map.clearings[v.clearing]!;
        const defWarriors = cl.warriors[a.defender] ?? 0;
        const hasPieces = defWarriors > 0
          || cl.buildings.some(b => b.faction === a.defender)
          || cl.tokens.some(t => t.faction === a.defender);
        if (!hasPieces) return;
        // Roll dice using the shared rngStep counter.
        const rng = mulberry32(mixSeed(state.seed, state.rngStep + 1));
        draft.rngStep += 1;
        const d1 = rollDie(rng);
        const d2 = rollDie(rng);
        const defenseless = defWarriors === 0;
        // Vagabond pawn counts as 1 warrior for hit purposes.
        const attHits = Math.min(1, Math.max(d1, d2) + (defenseless ? 1 : 0));
        const defHits = Math.min(Math.min(d1, d2), defWarriors);
        // Apply attacker hits: warriors → buildings → tokens.
        let hitsLeft = attHits;
        let piecesRemoved = 0;
        const warriorsToRemove = Math.min(hitsLeft, defWarriors);
        if (warriorsToRemove > 0) {
          returnWarriors(draft, v.clearing, a.defender, warriorsToRemove);
          hitsLeft -= warriorsToRemove;
          piecesRemoved += warriorsToRemove;
          if (v.relationships[a.defender] === 'hostile') draft.scores.vagabond += warriorsToRemove;
        }
        if (hitsLeft > 0) {
          const bIdx = cl.buildings.findIndex(b => b.faction === a.defender);
          if (bIdx >= 0) { cl.buildings.splice(bIdx, 1); draft.scores.vagabond += 1; hitsLeft -= 1; piecesRemoved += 1; }
        }
        if (hitsLeft > 0) {
          const tIdx = cl.tokens.findIndex(t => t.faction === a.defender);
          if (tIdx >= 0) { cl.tokens.splice(tIdx, 1); draft.scores.vagabond += 1; piecesRemoved += 1; }
        }
        // Removing pieces from a non-hostile faction requires the player to either
        // discard a matching card or accept hostility.
        if (piecesRemoved > 0 && v.relationships[a.defender] !== 'hostile') {
          const meta = AUTUMN_MAP.clearings.find(c => c.id === v.clearing)!;
          v.pendingRelationshipCost = { faction: a.defender, suit: meta.suit as CardSuit };
        }
        // Apply defender hits: damage vagabond items (face-up → damaged, then face-down → damaged).
        let toDamage = defHits;
        for (const it of v.items) { if (toDamage <= 0) break; if (it.state === 'face-up')   { it.state = 'damaged'; toDamage -= 1; } }
        for (const it of v.items) { if (toDamage <= 0) break; if (it.state === 'face-down') { it.state = 'damaged'; toDamage -= 1; } }
        v.daylightActionsLeft -= 1;
        draft.log.push({ turn: draft.turn, faction: 'vagabond', message: `Battled ${a.defender}: rolled [${d1},${d2}] → dealt ${attHits} hit(s), took ${defHits} hit(s).` });
      });

    case 'vagabond.aid':
      return produce(state, draft => {
        if (draft.phase !== 'daylight') return;
        const v = draft.factions.vagabond!;
        if (v.daylightActionsLeft <= 0) return;
        const meta = AUTUMN_MAP.clearings.find(c => c.id === v.clearing)!;
        const card = getCard(a.cardId);
        if (card.suit !== meta.suit && card.suit !== 'bird') return;
        // Recipient must have any pieces in clearing (warriors, buildings, or tokens).
        const cl = draft.map.clearings[v.clearing]!;
        const hasPieces = (cl.warriors[a.faction] ?? 0) > 0
          || cl.buildings.some(b => b.faction === a.faction)
          || cl.tokens.some(t => t.faction === a.faction);
        if (!hasPieces) return;
        // Aid costs one face-up item (exhausted).
        if (!exhaustItem(v.items, a.itemKind)) return;
        const idx = draft.hands.vagabond.indexOf(a.cardId);
        if (idx < 0) return;
        draft.hands.vagabond.splice(idx, 1);
        draft.hands[a.faction].push(a.cardId);
        v.relationships[a.faction] = bumpRelationship(v.relationships[a.faction]);
        // Score VP equal to the numeric relationship level reached (I=1, II=2, III=3, Allied=4).
        const aidVp = aidVpForRelationship(v.relationships[a.faction]);
        if (aidVp > 0) draft.scores.vagabond += aidVp;
        v.daylightActionsLeft -= 1;
        draft.log.push({ turn: draft.turn, faction: 'vagabond', message: `Aided ${a.faction} (exhausted ${a.itemKind}); relationship → ${v.relationships[a.faction]}${aidVp > 0 ? ` (+${aidVp} VP)` : ''}.` });
      });

    case 'vagabond.stealCard':
      // Thief only: take a random card from a hostile faction's hand (costs 1 face-up item,
      // improves relationship, scores VP — same as Aid but gets rather than gives).
      return produce(state, draft => {
        if (draft.phase !== 'daylight') return;
        const v = draft.factions.vagabond!;
        if (v.character !== 'thief') return;
        if (v.daylightActionsLeft <= 0) return;
        if (v.relationships[a.faction] !== 'hostile') return;
        if (draft.hands[a.faction].length === 0) return;
        const cl = draft.map.clearings[v.clearing]!;
        const hasPieces = (cl.warriors[a.faction] ?? 0) > 0
          || cl.buildings.some(b => b.faction === a.faction)
          || cl.tokens.some(t => t.faction === a.faction);
        if (!hasPieces) return;
        if (!exhaustItem(v.items, a.itemKind)) return;
        // Steal: take a random card from the hostile faction (deterministic via rngStep).
        const rng = mulberry32(mixSeed(state.seed, state.rngStep + 1));
        draft.rngStep += 1;
        const stolenIdx = Math.floor(rng() * draft.hands[a.faction].length);
        const stolen = draft.hands[a.faction].splice(stolenIdx, 1)[0]!;
        draft.hands.vagabond.push(stolen);
        v.relationships[a.faction] = bumpRelationship(v.relationships[a.faction]);
        const stealVp = aidVpForRelationship(v.relationships[a.faction]);
        if (stealVp > 0) draft.scores.vagabond += stealVp;
        v.daylightActionsLeft -= 1;
        draft.log.push({ turn: draft.turn, faction: 'vagabond', message: `Thief stole a card from ${a.faction} (exhausted ${a.itemKind}); relationship → ${v.relationships[a.faction]}${stealVp > 0 ? ` (+${stealVp} VP)` : ''}.` });
      });

    case 'vagabond.placeHideout':
      // Ranger only: place a Hideout camp token in current clearing (costs 1 daylight action).
      return produce(state, draft => {
        if (draft.phase !== 'daylight') return;
        const v = draft.factions.vagabond!;
        if (v.character !== 'ranger') return;
        if (v.daylightActionsLeft <= 0) return;
        if (v.inForest) return;
        v.hideout = v.clearing;
        v.daylightActionsLeft -= 1;
        draft.log.push({ turn: draft.turn, faction: 'vagabond', message: `Ranger placed Hideout at clearing ${v.clearing}.` });
      });

    case 'vagabond.strike':
      return produce(state, draft => {
        if (draft.phase !== 'daylight') return;
        const v = draft.factions.vagabond!;
        if (v.daylightActionsLeft <= 0) return;
        if (a.clearing !== v.clearing) return;
        if (!exhaustItem(v.items, 'crossbow')) return;
        const clS = draft.map.clearings[v.clearing]!;
        const defWarriorsS = clS.warriors[a.faction] ?? 0;
        let pieceRemovedS = false;
        if (defWarriorsS > 0) {
          returnWarriors(draft, v.clearing, a.faction, 1);
          if (v.relationships[a.faction] === 'hostile') draft.scores.vagabond += 1;
          pieceRemovedS = true;
        } else {
          const bIdx = clS.buildings.findIndex(b => b.faction === a.faction);
          if (bIdx >= 0) { clS.buildings.splice(bIdx, 1); draft.scores.vagabond += 1; pieceRemovedS = true; }
          else {
            const tIdx = clS.tokens.findIndex(t => t.faction === a.faction);
            if (tIdx >= 0) { clS.tokens.splice(tIdx, 1); draft.scores.vagabond += 1; pieceRemovedS = true; }
          }
        }
        // Removing pieces from a non-hostile faction requires the player to either
        // discard a matching card or accept hostility.
        if (pieceRemovedS && v.relationships[a.faction] !== 'hostile') {
          const metaS = AUTUMN_MAP.clearings.find(c => c.id === v.clearing)!;
          v.pendingRelationshipCost = { faction: a.faction, suit: metaS.suit as CardSuit };
        }
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
        // Vagabond crafts by exhausting one hammer per cost point. Each hammer
        // provides 1 power of the current clearing's suit; bird-cost cards accept any suit.
        const meta = AUTUMN_MAP.clearings.find(c => c.id === v.clearing)!;
        const costEntries = Object.entries(card.craftCost) as [string, number][];
        const hammersNeeded = costEntries.reduce((s, [, n]) => s + n, 0);
        const suitOk = costEntries.every(([s]) => s === 'bird' || s === meta.suit);
        if (!suitOk || hammersNeeded === 0) return;
        // Tinker (Tinkerer) may exhaust any face-up items; others must use hammers.
        if (v.character === 'tinker') {
          let remaining = hammersNeeded;
          for (const it of v.items) {
            if (remaining <= 0) break;
            if (it.state === 'face-up' && !it.exhausted) { it.exhausted = true; remaining -= 1; }
          }
          if (remaining > 0) return; // not enough items
        } else {
          for (let h = 0; h < hammersNeeded; h++) {
            if (!exhaustItem(v.items, 'hammer')) return;
          }
        }
        const idx = draft.hands.vagabond.indexOf(a.cardId);
        if (idx < 0) return;
        draft.hands.vagabond.splice(idx, 1);
        if (card.craftVp) draft.scores.vagabond += card.craftVp;
        if (card.item) {
          // Crafted item goes to the Vagabond (track items go face-up if room, else satchel).
          const itemState = canGainItem(v.items, card.item) ? 'face-up' : 'face-down';
          v.items.push({ kind: card.item, state: itemState, exhausted: false });
        }
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
        if (v.pendingItemRemoval > 0) return;
        const coinCount = v.items.filter(i => i.kind === 'coin' && i.state === 'face-up').length;
        const draws = 1 + coinCount;
        for (let i = 0; i < draws; i++) {
          const c = draft.deck.pop();
          if (!c) break;
          draft.hands.vagabond.push(c);
        }
        const bagCount = v.items.filter(i => i.kind === 'bag' && i.state === 'face-up').length;
        const limit = 5 + bagCount;
        const cardExcess = draft.hands.vagabond.length - limit;
        if (cardExcess > 0) {
          v.pendingDiscard = cardExcess;
          draft.log.push({ turn: draft.turn, faction: 'vagabond', message: `Evening: drew ${draws}, must discard ${cardExcess} (limit ${limit}).` });
          return;
        }
        // Check item capacity: satchel + damaged items must not exceed capacity.
        const capacity = itemCapacity(v.items);
        const itemExcess = satchelAndDamagedCount(v.items) - capacity;
        if (itemExcess > 0) {
          v.pendingItemRemoval = itemExcess;
          draft.log.push({ turn: draft.turn, faction: 'vagabond', message: `Evening: item capacity ${capacity}, must permanently remove ${itemExcess} item(s) from satchel/damaged.` });
          return;
        }
        finishVagabondTurn(draft, draws);
      });

    case 'vagabond.removeItem':
      return produce(state, draft => {
        const v = draft.factions.vagabond!;
        if (v.pendingItemRemoval <= 0) return;
        const item = v.items[a.itemIdx];
        if (!item) return;
        if (item.state !== 'face-down' && item.state !== 'damaged') return;
        v.items.splice(a.itemIdx, 1);
        v.pendingItemRemoval -= 1;
        draft.log.push({ turn: draft.turn, faction: 'vagabond', message: `Permanently removed ${item.kind} from ${item.state === 'face-down' ? 'satchel' : 'damaged box'}.` });
        if (v.pendingItemRemoval === 0) finishVagabondTurn(draft, 0);
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

    case 'vagabond.payRelationshipCost':
      return produce(state, draft => {
        const v = draft.factions.vagabond!;
        if (!v.pendingRelationshipCost) return;
        const card = getCard(a.cardId);
        if (card.suit !== v.pendingRelationshipCost.suit && card.suit !== 'bird') return;
        const idx = draft.hands.vagabond.indexOf(a.cardId);
        if (idx < 0) return;
        draft.hands.vagabond.splice(idx, 1);
        draft.discard.push(a.cardId);
        const faction = v.pendingRelationshipCost.faction;
        v.pendingRelationshipCost = undefined;
        draft.log.push({ turn: draft.turn, faction: 'vagabond', message: `Discarded ${card.name} to preserve relationship with ${faction}.` });
      });

    case 'vagabond.acceptHostility':
      return produce(state, draft => {
        const v = draft.factions.vagabond!;
        if (!v.pendingRelationshipCost) return;
        const faction = v.pendingRelationshipCost.faction;
        v.relationships[faction] = 'hostile';
        v.pendingRelationshipCost = undefined;
        draft.log.push({ turn: draft.turn, faction: 'vagabond', message: `Accepted hostility with ${faction}.` });
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
  v.pendingItemRemoval = 0;
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
      // Ranger: slip to Hideout camp instead of walking.
      if (v.character === 'ranger' && v.hideout && v.hideout !== v.clearing) {
        out.push({ kind: 'vagabond.slipToHideout' });
      }
    }
  }
  if (state.phase === 'daylight' && v.daylightActionsLeft > 0) {
    // Pending relationship cost must be resolved before any other action.
    if (v.pendingRelationshipCost) {
      const { suit } = v.pendingRelationshipCost;
      for (const cardId of state.hands.vagabond) {
        const card = getCard(cardId);
        if (card.suit === suit || card.suit === 'bird') {
          out.push({ kind: 'vagabond.payRelationshipCost', cardId });
        }
      }
      out.push({ kind: 'vagabond.acceptHostility' });
      return out;
    }
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
      // Movement: 1 boot always required; Thief (Nimble) never needs the extra hostile boot.
      const hasBoot = findItem(v.items, 'boots');
      const hasTwoBoots = v.items.filter(i => i.kind === 'boots' && i.state === 'face-up' && !i.exhausted).length >= 2;
      if (hasBoot) {
        for (const nb of getAdjacent(AUTUMN_MAP, v.clearing)) {
          const destCl = state.map.clearings[nb]!;
          const hasHostile = (['marquise', 'eyrie', 'alliance'] as const).some(f =>
            v.relationships[f] === 'hostile' && (destCl.warriors[f] ?? 0) > 0,
          );
          // Thief (Nimble) can always move with 1 boot; others need a 2nd boot for hostile destinations.
          if (!hasHostile || v.character === 'thief' || hasTwoBoots) {
            out.push({ kind: 'vagabond.move', to: nb });
          }
        }
        for (const fid of forestsAtClearing(AUTUMN_MAP, v.clearing)) {
          out.push({ kind: 'vagabond.enterForest', forestId: fid });
        }
      }
      const meta = AUTUMN_MAP.clearings.find(c => c.id === v.clearing)!;
      const cl = state.map.clearings[v.clearing]!;
      // Explore
      if (meta.hasRuin && !v.exploredRuins.includes(v.clearing) && findItem(v.items, 'torch')) {
        out.push({ kind: 'vagabond.exploreRuin' });
      }
      // Battle (costs 1 sword; Vagabond pawn deals hits)
      if (findItem(v.items, 'sword')) {
        for (const f of ['marquise', 'eyrie', 'alliance'] as const) {
          const hasPieces = (cl.warriors[f] ?? 0) > 0
            || cl.buildings.some(b => b.faction === f)
            || cl.tokens.some(t => t.faction === f);
          if (hasPieces) out.push({ kind: 'vagabond.battle', defender: f, clearing: v.clearing });
        }
      }
      // Aid (costs 1 face-up item; recipient must have any pieces here)
      const availableItemKinds = new Set(
        v.items.filter(it => it.state === 'face-up' && !it.exhausted).map(it => it.kind),
      );
      if (availableItemKinds.size > 0) {
        for (const cardId of state.hands.vagabond) {
          const card = getCard(cardId);
          if (card.suit !== meta.suit && card.suit !== 'bird') continue;
          for (const f of ['marquise', 'eyrie', 'alliance'] as const) {
            const hasPieces = (cl.warriors[f] ?? 0) > 0
              || cl.buildings.some(b => b.faction === f)
              || cl.tokens.some(t => t.faction === f);
            if (!hasPieces) continue;
            for (const itemKind of availableItemKinds) {
              out.push({ kind: 'vagabond.aid', faction: f, cardId, itemKind });
            }
          }
        }
        // Thief (Steal): may take a card from a hostile faction instead of giving one.
        if (v.character === 'thief') {
          for (const f of ['marquise', 'eyrie', 'alliance'] as const) {
            if (v.relationships[f] !== 'hostile') continue;
            if (state.hands[f].length === 0) continue;
            const hasPieces = (cl.warriors[f] ?? 0) > 0
              || cl.buildings.some(b => b.faction === f)
              || cl.tokens.some(t => t.faction === f);
            if (!hasPieces) continue;
            for (const itemKind of availableItemKinds) {
              out.push({ kind: 'vagabond.stealCard', faction: f, itemKind });
            }
          }
        }
      }
      // Strike (costs 1 crossbow; targets warriors first, then buildings/tokens)
      if (findItem(v.items, 'crossbow')) {
        for (const f of ['marquise', 'eyrie', 'alliance'] as const) {
          const hasPieces = (cl.warriors[f] ?? 0) > 0
            || cl.buildings.some(b => b.faction === f)
            || cl.tokens.some(t => t.faction === f);
          if (hasPieces) out.push({ kind: 'vagabond.strike', clearing: v.clearing, faction: f });
        }
      }
      // Repair
      if (findItem(v.items, 'hammer') && v.items.some(i => i.state === 'damaged')) {
        const damaged = v.items.find(i => i.state === 'damaged')!;
        out.push({ kind: 'vagabond.repair', itemKind: damaged.kind });
      }
      // Craft — Tinker may use any face-up items; others must use hammers.
      // Each item/hammer gives 1 power of the clearing's suit; bird-cost cards accept any suit.
      const availableCraftPower = v.character === 'tinker'
        ? v.items.filter(i => i.state === 'face-up' && !i.exhausted).length
        : v.items.filter(i => i.kind === 'hammer' && i.state === 'face-up' && !i.exhausted).length;
      if (availableCraftPower > 0) {
        for (const cardId of state.hands.vagabond) {
          const card = getCard(cardId);
          if (card.category !== 'item' && card.category !== 'persistent' && card.category !== 'favor') continue;
          const costEntries = Object.entries(card.craftCost) as [string, number][];
          const powerNeeded = costEntries.reduce((s, [, n]) => s + n, 0);
          if (powerNeeded === 0) continue;
          if (powerNeeded > availableCraftPower) continue;
          const suitOk = costEntries.every(([s]) => s === 'bird' || s === meta.suit);
          if (suitOk) out.push({ kind: 'vagabond.craft', cardId });
        }
      }
      // Ranger: place Hideout camp in current clearing.
      if (v.character === 'ranger') {
        out.push({ kind: 'vagabond.placeHideout' });
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
  if (state.phase === 'daylight' && !v.pendingRelationshipCost) out.push({ kind: 'vagabond.endDaylight' });
  if (state.phase === 'evening') {
    if (v.pendingItemRemoval > 0) {
      v.items.forEach((item, idx) => {
        if (item.state === 'face-down' || item.state === 'damaged') {
          out.push({ kind: 'vagabond.removeItem', itemIdx: idx });
        }
      });
    } else if (v.pendingDiscard > 0) {
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
