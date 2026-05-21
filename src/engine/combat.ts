// Combat resolver. Pure: (state, params) => state.
//
// Root combat algorithm (base game, no faction quirks):
//   1. Optional defender ambush → +2 hits to attacker.
//      Optional attacker counter-ambush → both ambushes cancel.
//   2. Roll 2 combat dice (faces 0,0,1,1,2,3).
//      Attacker takes the *higher* die, defender the *lower*.
//   3. Defenseless modifier: if defender has 0 warriors in the clearing,
//      the attacker's roll gets +1 hit.
//   4. Each side's outgoing hits are capped by its own warriors in the
//      clearing (you need warriors to deal hits).
//   5. Apply hits. Warriors are removed before buildings/tokens.
//      For removed enemy buildings/tokens, the remover scores 1 VP each.
//
// Faction-specific extras (outrage, Brutal Tactics, Armorers, Sappers, etc.)
// are added by their respective phases by composing this resolver.

import { produce } from 'immer';
import type {
  GameState, ClearingState, ClearingId, Faction, BuildingInstance, TokenInstance,
} from './types';
import { mulberry32, rollDie, mixSeed } from './rng';
import { getCard, type CardId } from './cards';

export interface CombatParams {
  clearing: ClearingId;
  attacker: Faction;
  defender: Faction;
  attackerAmbush?: CardId;
  defenderAmbush?: CardId;
}

export interface CombatOutcome {
  /** Hits dealt by attacker to defender (after caps and ambush). */
  attackerHits: number;
  /** Hits dealt by defender to attacker (after caps and ambush). */
  defenderHits: number;
  attackerPiecesRemoved: { warriors: number; buildings: number; tokens: number };
  defenderPiecesRemoved: { warriors: number; buildings: number; tokens: number };
  attackerVp: number;
  defenderVp: number;
  defenderDefenseless: boolean;
  dice: [number, number];
  ambushCancelled: boolean;
  ambushedByDefender: boolean;
  ambushedByAttacker: boolean;
}

/** Compute the outcome from a *snapshot* clearing — no state mutation. */
export function computeCombatOutcome(
  clearing: ClearingState,
  attacker: Faction,
  defender: Faction,
  dice: [number, number],
  attackerAmbush: boolean,
  defenderAmbush: boolean,
): CombatOutcome {
  const attWarriorsStart = clearing.warriors[attacker] ?? 0;
  const defWarriorsStart = clearing.warriors[defender] ?? 0;

  let ambushCancelled = false;
  let attackerHitsFromAmbush = 0;
  let defenderHitsFromAmbush = 0;
  if (attackerAmbush && defenderAmbush) {
    ambushCancelled = true;
  } else {
    if (defenderAmbush) defenderHitsFromAmbush = 2;
    if (attackerAmbush) attackerHitsFromAmbush = 2;
  }

  // Apply ambush hits to warriors before dice (warriors removed first).
  const attWarriorsAfterAmbush = Math.max(0, attWarriorsStart - defenderHitsFromAmbush);
  const defWarriorsAfterAmbush = Math.max(0, defWarriorsStart - attackerHitsFromAmbush);
  // If attacker is wiped by ambush, combat ends.
  let attackerHits = attackerHitsFromAmbush;
  let defenderHits = defenderHitsFromAmbush;
  let defenderDefenseless = defWarriorsAfterAmbush === 0;

  if (attWarriorsAfterAmbush > 0) {
    const [d1, d2] = dice;
    let attRoll = Math.max(d1, d2);
    let defRoll = Math.min(d1, d2);
    if (defenderDefenseless) attRoll += 1;
    // Caps: a side can only deal as many hits as it has warriors in the clearing.
    attackerHits += Math.min(attRoll, attWarriorsAfterAmbush);
    defenderHits += Math.min(defRoll, defWarriorsAfterAmbush);
  }

  // Apply hits — warriors first, then buildings/tokens. Each removed enemy
  // building/token scores 1 VP for the remover.
  const defResult = applyHits(
    defWarriorsAfterAmbush, clearing.buildings, clearing.tokens, defender, attackerHits,
  );
  const attResult = applyHits(
    attWarriorsAfterAmbush, clearing.buildings, clearing.tokens, attacker, defenderHits,
  );

  // Warriors actually removed *including* the ambush phase.
  const attWarriorsRemoved = (attWarriorsStart - attWarriorsAfterAmbush) + attResult.warriorsRemoved;
  const defWarriorsRemoved = (defWarriorsStart - defWarriorsAfterAmbush) + defResult.warriorsRemoved;

  return {
    attackerHits,
    defenderHits,
    attackerPiecesRemoved: {
      warriors: attWarriorsRemoved,
      buildings: attResult.buildingsRemoved,
      tokens: attResult.tokensRemoved,
    },
    defenderPiecesRemoved: {
      warriors: defWarriorsRemoved,
      buildings: defResult.buildingsRemoved,
      tokens: defResult.tokensRemoved,
    },
    attackerVp: defResult.buildingsRemoved + defResult.tokensRemoved,
    defenderVp: attResult.buildingsRemoved + attResult.tokensRemoved,
    defenderDefenseless,
    dice,
    ambushCancelled,
    ambushedByDefender: defenderAmbush && !ambushCancelled,
    ambushedByAttacker: attackerAmbush && !ambushCancelled,
  };
}

/** Compute how a single owner's pieces absorb `hits` hits. Warriors first. */
function applyHits(
  ownerWarriors: number,
  buildings: BuildingInstance[],
  tokens: TokenInstance[],
  owner: Faction,
  hits: number,
): { warriorsRemoved: number; buildingsRemoved: number; tokensRemoved: number } {
  let remaining = hits;
  const warriorsRemoved = Math.min(ownerWarriors, remaining);
  remaining -= warriorsRemoved;

  let buildingsRemoved = 0;
  let tokensRemoved = 0;
  // Buildings first by default; the "attacker chooses" rule between buildings
  // and tokens is approximated here as "buildings first" — this matches
  // typical attacker preference (buildings score 1 VP each, same as tokens,
  // and removing a building usually opens slot for future plays).
  const ownBuildings = buildings.filter(b => b.faction === owner).length;
  while (remaining > 0 && buildingsRemoved < ownBuildings) {
    buildingsRemoved += 1;
    remaining -= 1;
  }
  const ownTokens = tokens.filter(t => t.faction === owner).length;
  while (remaining > 0 && tokensRemoved < ownTokens) {
    tokensRemoved += 1;
    remaining -= 1;
  }
  return { warriorsRemoved, buildingsRemoved, tokensRemoved };
}

/** Full reducer entry point for resolving a combat. */
export function resolveCombat(state: GameState, params: CombatParams): GameState {
  const rng = mulberry32(mixSeed(state.seed, state.rngStep + 1));
  const dice: [number, number] = [rollDie(rng), rollDie(rng)];

  const clearing = state.map.clearings[params.clearing];
  if (!clearing) throw new Error(`Bad clearing: ${params.clearing}`);

  const outcome = computeCombatOutcome(
    clearing,
    params.attacker,
    params.defender,
    dice,
    !!params.attackerAmbush,
    !!params.defenderAmbush,
  );

  return produce(state, draft => {
    draft.rngStep += 1;
    const cl = draft.map.clearings[params.clearing]!;

    // Remove warriors.
    cl.warriors[params.attacker] =
      (cl.warriors[params.attacker] ?? 0) - outcome.attackerPiecesRemoved.warriors;
    cl.warriors[params.defender] =
      (cl.warriors[params.defender] ?? 0) - outcome.defenderPiecesRemoved.warriors;

    // Remove buildings (defender's, then attacker's).
    cl.buildings = removeN(cl.buildings, params.defender, outcome.defenderPiecesRemoved.buildings);
    cl.buildings = removeN(cl.buildings, params.attacker, outcome.attackerPiecesRemoved.buildings);
    // Remove tokens.
    cl.tokens = removeNTokens(cl.tokens, params.defender, outcome.defenderPiecesRemoved.tokens);
    cl.tokens = removeNTokens(cl.tokens, params.attacker, outcome.attackerPiecesRemoved.tokens);

    // Score VP from removed enemy cardboard.
    draft.scores[params.attacker] = (draft.scores[params.attacker] ?? 0) + outcome.attackerVp;
    draft.scores[params.defender] = (draft.scores[params.defender] ?? 0) + outcome.defenderVp;

    // Return removed warriors to their owners' supplies. Vagabond has no
    // warrior supply — they take item damage instead, handled in Phase 5.
    returnWarriorsToSupply(draft, params.attacker, outcome.attackerPiecesRemoved.warriors);
    returnWarriorsToSupply(draft, params.defender, outcome.defenderPiecesRemoved.warriors);

    // Discard ambush cards used.
    for (const id of [params.attackerAmbush, params.defenderAmbush]) {
      if (!id) continue;
      // Cards came from someone's hand; remove from that hand and discard.
      for (const f of Object.keys(draft.hands) as Faction[]) {
        const idx = draft.hands[f].indexOf(id);
        if (idx >= 0) {
          draft.hands[f].splice(idx, 1);
          draft.discard.push(id);
          break;
        }
      }
    }

    // Log.
    const tag = outcome.defenderDefenseless ? ' (defenseless)' : '';
    const ambushNote = outcome.ambushCancelled
      ? ' [ambushes cancelled]'
      : outcome.ambushedByDefender
        ? ' [defender ambushed]'
        : outcome.ambushedByAttacker
          ? ' [attacker ambushed]'
          : '';
    draft.log.push({
      turn: draft.turn,
      faction: params.attacker,
      message:
        `Battle in clearing ${params.clearing}${tag}${ambushNote}: ` +
        `${params.attacker} dealt ${outcome.attackerHits} hits, ` +
        `${params.defender} dealt ${outcome.defenderHits} hits ` +
        `(dice ${outcome.dice[0]}/${outcome.dice[1]})`,
    });
  });
}

function returnWarriorsToSupply(draft: GameState, faction: Faction, count: number): void {
  if (count <= 0) return;
  const fs = draft.factions;
  if (faction === 'marquise' && fs.marquise) fs.marquise.warriorSupply += count;
  else if (faction === 'eyrie' && fs.eyrie) fs.eyrie.warriorSupply += count;
  else if (faction === 'alliance' && fs.alliance) fs.alliance.warriorSupply += count;
  // Vagabond pawn does not have a warrior supply.
}

function removeN(buildings: BuildingInstance[], faction: Faction, n: number): BuildingInstance[] {
  if (n <= 0) return buildings;
  const out: BuildingInstance[] = [];
  let removed = 0;
  for (const b of buildings) {
    if (b.faction === faction && removed < n) { removed += 1; continue; }
    out.push(b);
  }
  return out;
}

function removeNTokens(tokens: TokenInstance[], faction: Faction, n: number): TokenInstance[] {
  if (n <= 0) return tokens;
  const out: TokenInstance[] = [];
  let removed = 0;
  for (const t of tokens) {
    if (t.faction === faction && removed < n) { removed += 1; continue; }
    out.push(t);
  }
  return out;
}

/** True if `cardId` is an ambush card. */
export function isAmbushCard(cardId: CardId): boolean {
  return getCard(cardId).category === 'ambush';
}
