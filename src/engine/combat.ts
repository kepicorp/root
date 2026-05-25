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
import { AUTUMN_MAP } from './map';

export interface CombatModifiers {
  extraAttackerHits?: number;          // Brutal Tactics, Bold Leadership: +1 uncapped hit to attacker
  extraDefenderHits?: number;          // Sappers: +1 uncapped hit to defender
  ignoreAttackerRolledHits?: boolean;  // Armorers on attacker: zero out attacker's rolled hits
  ignoreDefenderRolledHits?: boolean;  // Armorers on defender: zero out defender's rolled hits
  guerrillaWar?: boolean;              // Alliance defender gets the higher die, attacker the lower
  brutalTacticsActive?: boolean;       // Attacker has Brutal Tactics (for VP note in outcome)
  defenderBonusWarriors?: number;      // Lookouts: defender places N warriors before roll
}

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
  brutalTacticsUsed?: boolean;
  guerrillaWarUsed?: boolean;
}

/** Compute the outcome from a *snapshot* clearing — no state mutation. */
export function computeCombatOutcome(
  clearing: ClearingState,
  attacker: Faction,
  defender: Faction,
  dice: [number, number],
  attackerAmbush: boolean,
  defenderAmbush: boolean,
  modifiers: CombatModifiers = {},
): CombatOutcome {
  const attWarriorsStart = clearing.warriors[attacker] ?? 0;
  const defWarriorsStart = (clearing.warriors[defender] ?? 0) + (modifiers.defenderBonusWarriors ?? 0);

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
    // Guerrilla War: Alliance defender gets the higher die, attacker gets the lower.
    let attRoll = modifiers.guerrillaWar ? Math.min(d1, d2) : Math.max(d1, d2);
    let defRoll = modifiers.guerrillaWar ? Math.max(d1, d2) : Math.min(d1, d2);
    if (defenderDefenseless) attRoll += 1;
    // Caps: a side can only deal as many hits as it has warriors in the clearing.
    let attRolledHits = Math.min(attRoll, attWarriorsAfterAmbush);
    let defRolledHits = Math.min(defRoll, defWarriorsAfterAmbush);
    // Armorers: zero out own rolled hits (ambush hits are not rolled hits).
    if (modifiers.ignoreAttackerRolledHits) attRolledHits = 0;
    if (modifiers.ignoreDefenderRolledHits) defRolledHits = 0;
    attackerHits += attRolledHits;
    defenderHits += defRolledHits;
  }

  // Extra uncapped hits from crafted persistents.
  if (modifiers.extraAttackerHits) attackerHits += modifiers.extraAttackerHits;
  if (modifiers.extraDefenderHits) defenderHits += modifiers.extraDefenderHits;

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
    brutalTacticsUsed: modifiers.brutalTacticsActive ?? false,
    guerrillaWarUsed: modifiers.guerrillaWar ?? false,
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

// ─── Crafted-persistent helpers ───────────────────────────────────────────────

/** Return the cardId of a crafted persistent matching `cardName` for `faction`,
 *  or null if they don't have it. */
export function hasCraftedPersistent(
  state: GameState, faction: Faction, cardName: string,
): string | null {
  const entry = state.craftedPersistents.find(
    e => e.faction === faction && getCard(e.cardId).name === cardName,
  );
  return entry?.cardId ?? null;
}

/** Remove a crafted persistent by cardId from the play area and return it to
 *  the owner's hand. */
export function returnCraftedToHand(draft: GameState, faction: Faction, cardId: string): void {
  const idx = draft.craftedPersistents.findIndex(e => e.cardId === cardId && e.faction === faction);
  if (idx >= 0) {
    draft.craftedPersistents.splice(idx, 1);
    draft.hands[faction].push(cardId);
  }
}

/** Remove a crafted persistent by cardId from the play area and push it to
 *  the discard pile. */
function discardCraftedPersistentById(draft: GameState, cardId: string): void {
  const idx = draft.craftedPersistents.findIndex(e => e.cardId === cardId);
  if (idx >= 0) {
    draft.craftedPersistents.splice(idx, 1);
    draft.discard.push(cardId);
  }
}

/** Full reducer entry point for resolving a combat. */
export function resolveCombat(state: GameState, params: CombatParams): GameState {
  const rng = mulberry32(mixSeed(state.seed, state.rngStep + 1));
  const dice: [number, number] = [rollDie(rng), rollDie(rng)];

  const clearing = state.map.clearings[params.clearing];
  if (!clearing) throw new Error(`Bad clearing: ${params.clearing}`);

  // ── Detect crafted persistents that affect this combat ────────────────────
  const brutalTacticsId    = hasCraftedPersistent(state, params.attacker, 'Brutal Tactics');
  const sappersId          = hasCraftedPersistent(state, params.defender, 'Sappers');
  const boldLeadershipId   = hasCraftedPersistent(state, params.attacker, 'Bold Leadership');
  const lookoutsId         = hasCraftedPersistent(state, params.defender, 'Lookouts');
  // Alliance Guerrilla War is a faction ability, not a card.
  const guerrillaWar       = params.defender === 'alliance' && !!state.factions.alliance;
  const attackerArmorersId = hasCraftedPersistent(state, params.attacker, 'Armorers');
  const defenderArmorersId = hasCraftedPersistent(state, params.defender, 'Armorers');

  // Lookouts: auto-place up to 3 warriors from the defender's supply before rolling.
  let lookoutsWarriors = 0;
  if (lookoutsId) {
    if (params.defender === 'marquise') lookoutsWarriors = Math.min(3, state.factions.marquise?.warriorSupply ?? 0);
    else if (params.defender === 'eyrie') lookoutsWarriors = Math.min(3, state.factions.eyrie?.warriorSupply ?? 0);
    else if (params.defender === 'alliance') lookoutsWarriors = Math.min(3, state.factions.alliance?.warriorSupply ?? 0);
  }

  const baseModifiers: CombatModifiers = {
    extraAttackerHits: (brutalTacticsId ? 1 : 0) + (boldLeadershipId ? 1 : 0),
    extraDefenderHits: sappersId ? 1 : 0,
    guerrillaWar,
    brutalTacticsActive: !!brutalTacticsId,
    defenderBonusWarriors: lookoutsWarriors,
  };

  // Preliminary pass without Armorers so we can tell if each side actually
  // takes rolled hits before deciding to spend the card.
  const prelim = computeCombatOutcome(
    clearing, params.attacker, params.defender, dice,
    !!params.attackerAmbush, !!params.defenderAmbush,
    baseModifiers,
  );

  // Armorers: only spend if the faction actually takes rolled hits
  // (ambush hits are not rolled hits, so subtract them when checking).
  const attAmbushHits = (!!params.defenderAmbush && !(!!params.attackerAmbush && !!params.defenderAmbush)) ? 2 : 0;
  const defAmbushHits = (!!params.attackerAmbush && !(!!params.attackerAmbush && !!params.defenderAmbush)) ? 2 : 0;
  const useAttackerArmorers = !!attackerArmorersId && prelim.defenderHits > attAmbushHits;
  const useDefenderArmorers = !!defenderArmorersId && prelim.attackerHits > defAmbushHits;

  const outcome = (useAttackerArmorers || useDefenderArmorers)
    ? computeCombatOutcome(
        clearing, params.attacker, params.defender, dice,
        !!params.attackerAmbush, !!params.defenderAmbush,
        {
          ...baseModifiers,
          ignoreAttackerRolledHits: useAttackerArmorers,
          ignoreDefenderRolledHits: useDefenderArmorers,
        },
      )
    : prelim;

  return produce(state, draft => {
    draft.rngStep += 1;
    const cl = draft.map.clearings[params.clearing]!;

    // Lookouts: physically place warriors before casualties are applied.
    if (lookoutsId && lookoutsWarriors > 0) {
      cl.warriors[params.defender] = (cl.warriors[params.defender] ?? 0) + lookoutsWarriors;
      if (params.defender === 'marquise' && draft.factions.marquise) draft.factions.marquise.warriorSupply -= lookoutsWarriors;
      else if (params.defender === 'eyrie' && draft.factions.eyrie) draft.factions.eyrie.warriorSupply -= lookoutsWarriors;
      else if (params.defender === 'alliance' && draft.factions.alliance) draft.factions.alliance.warriorSupply -= lookoutsWarriors;
    }

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

    // Brutal Tactics: defender scores 1 extra VP (penalty for the attacker).
    if (brutalTacticsId) {
      draft.scores[params.defender] = (draft.scores[params.defender] ?? 0) + 1;
    }

    // Return removed warriors to their owners' supplies. Vagabond has no
    // warrior supply — they take item damage instead, handled in Phase 5.
    returnWarriorsToSupply(draft, params.attacker, outcome.attackerPiecesRemoved.warriors);
    returnWarriorsToSupply(draft, params.defender, outcome.defenderPiecesRemoved.warriors);

    // Vagabond doesn't have warriors — incoming hits damage items instead.
    // Face-up items flip to damaged first, then face-down items, until the
    // hits are absorbed (or the Vagabond runs out of items).
    if (params.defender === 'vagabond' && draft.factions.vagabond) {
      let toDamage = outcome.attackerHits;
      const items = draft.factions.vagabond.items;
      for (const it of items) {
        if (toDamage <= 0) break;
        if (it.state === 'face-up') { it.state = 'damaged'; toDamage -= 1; }
      }
      for (const it of items) {
        if (toDamage <= 0) break;
        if (it.state === 'face-down') { it.state = 'damaged'; toDamage -= 1; }
      }
      if (outcome.attackerHits > toDamage) {
        draft.log.push({
          turn: draft.turn, faction: 'vagabond',
          message: `Vagabond took ${outcome.attackerHits - toDamage} item damage.`,
        });
      }
    }

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

    // Discard spent crafted persistents; return one-time-per-combat cards to hand.
    const cardNotes: string[] = [];
    if (boldLeadershipId) {
      returnCraftedToHand(draft, params.attacker, boldLeadershipId);
      cardNotes.push('Bold Leadership');
    }
    if (lookoutsId && lookoutsWarriors > 0) {
      returnCraftedToHand(draft, params.defender, lookoutsId);
      cardNotes.push('Lookouts');
    }
    if (sappersId) {
      discardCraftedPersistentById(draft, sappersId);
      cardNotes.push('Sappers');
    }
    if (useAttackerArmorers && attackerArmorersId) {
      discardCraftedPersistentById(draft, attackerArmorersId);
      cardNotes.push(`Armorers (${params.attacker})`);
    }
    if (useDefenderArmorers && defenderArmorersId) {
      discardCraftedPersistentById(draft, defenderArmorersId);
      cardNotes.push(`Armorers (${params.defender})`);
    }
    if (brutalTacticsId) {
      cardNotes.push('Brutal Tactics');
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
    const gwNote = outcome.guerrillaWarUsed ? ' [Guerrilla War]' : '';
    const cardNote = cardNotes.length ? ` [${cardNotes.join(', ')}]` : '';
    draft.log.push({
      turn: draft.turn,
      faction: params.attacker,
      message:
        `Battle in clearing ${params.clearing}${tag}${ambushNote}${gwNote}${cardNote}: ` +
        `${params.attacker} dealt ${outcome.attackerHits} hits, ` +
        `${params.defender} dealt ${outcome.defenderHits} hits ` +
        `(dice ${outcome.dice[0]}/${outcome.dice[1]})`,
    });
    if (brutalTacticsId) {
      draft.log.push({
        turn: draft.turn,
        faction: params.defender,
        message: `Brutal Tactics! ${params.defender} scores 1 VP.`,
      });
    }
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

/** Find every matching-suit ambush card a defender could play for a battle
 *  at the given clearing. Matching = same suit as the clearing OR bird. */
export function defenderAmbushOptions(state: GameState, clearing: ClearingId, defender: Faction): CardId[] {
  const meta = AUTUMN_MAP.clearings.find(c => c.id === clearing);
  if (!meta) return [];
  return (state.hands[defender] ?? []).filter(id => {
    const c = getCard(id);
    return c.category === 'ambush' && (c.suit === meta.suit || c.suit === 'bird');
  });
}

/** Battle entry point used by every faction's battle/strike action. Queues
 *  pending prompts for Mice-in-a-Bush (cancel) and defender ambush in turn.
 *  If the attacker has Scouting Party crafted, the ambush prompt is skipped. */
export function declareBattle(state: GameState, params: CombatParams): GameState {
  if (state.pendingPrompts.some(p =>
    p.kind === 'combat.defenderAmbush' || p.kind === 'combat.miceCancel',
  )) {
    return state; // Already mid-prompt.
  }
  // Mice-in-a-Bush: defender may cancel this battle by discarding the card.
  const miceId = hasCraftedPersistent(state, params.defender, 'Mice-in-a-Bush');
  if (miceId) {
    return produce(state, draft => {
      draft.pendingPrompts.push({
        id: `miceCancel-${draft.turn}-${params.clearing}`,
        kind: 'combat.miceCancel',
        faction: params.defender,
        payload: { ...params, miceId },
      });
      draft.log.push({
        turn: draft.turn, faction: 'system',
        message: `${params.defender} may cancel the battle with Mice-in-a-Bush.`,
      });
    });
  }
  const ambushes = defenderAmbushOptions(state, params.clearing, params.defender);
  const scoutingId = hasCraftedPersistent(state, params.attacker, 'Scouting Party');
  if (scoutingId || ambushes.length === 0) {
    return resolveCombat(state, params);
  }
  return produce(state, draft => {
    draft.pendingPrompts.push({
      id: `defAmbush-${draft.turn}-${params.clearing}`,
      kind: 'combat.defenderAmbush',
      faction: params.defender,
      payload: params,
    });
    draft.log.push({
      turn: draft.turn,
      faction: 'system',
      message: `${params.defender} may play an ambush against ${params.attacker}'s battle in clearing ${params.clearing}.`,
    });
  });
}

/** Resolve a Mice-in-a-Bush cancel prompt. */
export function resolveMiceCancelPrompt(
  state: GameState,
  options: { cancel: boolean },
): GameState {
  const prompt = state.pendingPrompts.find(p => p.kind === 'combat.miceCancel');
  if (!prompt) return state;
  const payload = prompt.payload as CombatParams & { miceId: string };
  // Remove the prompt first.
  const after = produce(state, draft => {
    draft.pendingPrompts = draft.pendingPrompts.filter(p => p.id !== prompt.id);
  });
  if (options.cancel) {
    // Discard Mice-in-a-Bush and cancel the battle.
    return produce(after, draft => {
      discardCraftedPersistentById(draft, payload.miceId);
      draft.log.push({
        turn: draft.turn, faction: payload.defender,
        message: `Mice-in-a-Bush: cancelled battle in clearing ${payload.clearing}.`,
      });
    });
  }
  // Proceed: continue to ambush check.
  return declareBattle(after, payload);
}

/** Resolve a queued ambush prompt — the defender either plays their card
 *  or skips. Both paths call resolveCombat with the queued params and pop
 *  the prompt. */
export function resolveAmbushPrompt(state: GameState, options: { playedCard?: CardId }): GameState {
  const prompt = state.pendingPrompts.find(p => p.kind === 'combat.defenderAmbush');
  if (!prompt) return state;
  const params = prompt.payload as CombatParams;
  const next: CombatParams = options.playedCard
    ? { ...params, defenderAmbush: options.playedCard }
    : params;
  const after = resolveCombat(state, next);
  return produce(after, draft => {
    draft.pendingPrompts = draft.pendingPrompts.filter(p => p.id !== prompt.id);
  });
}
