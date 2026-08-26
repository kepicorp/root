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

import { produce } from "immer";
import { awardVictoryPoints } from './victory';
import { discardCard } from './cards';
import type {
  GameState,
  ClearingState,
  ClearingId,
  Faction,
  CombatOverlayParty,
  CombatOverlayState,
  BuildingInstance,
  TokenInstance,
} from "./types";
import { mulberry32, rollDie, mixSeed } from "./rng";
import { getCard, type CardId } from "./cards";
import { AUTUMN_MAP } from "./map";
import { enqueueOutrage } from './outrage';

export interface CombatModifiers {
  extraAttackerHits?: number; // Brutal Tactics, Bold Leadership: +1 uncapped hit to attacker
  extraDefenderHits?: number; // Sappers: +1 uncapped hit to defender
  ignoreAttackerRolledHits?: boolean; // Armorers on attacker: zero out attacker's rolled hits
  ignoreDefenderRolledHits?: boolean; // Armorers on defender: zero out defender's rolled hits
  guerrillaWar?: boolean; // Alliance defender gets the higher die, attacker the lower
  brutalTacticsActive?: boolean; // Attacker has Brutal Tactics (for VP note in outcome)
  defenderBonusWarriors?: number; // Lookouts: defender places N warriors before roll
}

export interface CombatParams {
  clearing: ClearingId;
  attacker: Faction;
  defender: Faction;
  attackerAmbush?: CardId;
  defenderAmbush?: CardId;
}

type CombatEffectKey =
  | "useBrutalTactics"
  | "useBoldLeadership"
  | "useLookouts"
  | "useSappers"
  | "useAttackerArmorers"
  | "useDefenderArmorers";

interface CombatChoiceState {
  useBrutalTactics: boolean;
  useBoldLeadership: boolean;
  useLookouts: boolean;
  useSappers: boolean;
  useAttackerArmorers: boolean;
  useDefenderArmorers: boolean;
  asked: CombatEffectKey[];
}

interface CombatOptionalPromptPayload {
  params: CombatParams;
  choices: CombatChoiceState;
  effect: CombatEffectKey;
  label: string;
}

interface CombatRemovalOrderPromptPayload {
  params: CombatParams;
  choices: CombatChoiceState;
  removalSelections: Partial<Record<"attacker" | "defender", string[]>>;
  side: "attacker" | "defender";
  required: number;
  available: Array<{ id: string; kind: string; category: "building" | "token" }>;
}

interface CombatFieldHospitalsPromptPayload {
  clearing: ClearingId;
  suit: "fox" | "mouse" | "rabbit";
  warriorsLost: number;
}

export interface CombatOutcome {
  /** Hits dealt by attacker to defender (after caps and ambush). */
  attackerHits: number;
  /** Hits dealt by defender to attacker (after caps and ambush). */
  defenderHits: number;
  attackerPiecesRemoved: {
    warriors: number;
    buildings: number;
    tokens: number;
  };
  defenderPiecesRemoved: {
    warriors: number;
    buildings: number;
    tokens: number;
  };
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

function snapshotParty(
  clearing: ClearingState,
  faction: Faction,
): CombatOverlayParty {
  return {
    faction,
    warriors: clearing.warriors[faction] ?? 0,
    buildings: clearing.buildings.filter((b) => b.faction === faction).length,
    tokens: clearing.tokens.filter((t) => t.faction === faction).length,
    buildingKinds: clearing.buildings
      .filter((b) => b.faction === faction)
      .map((b) => b.kind),
    tokenKinds: clearing.tokens
      .filter((t) => t.faction === faction)
      .map((t) => t.kind),
  };
}

function buildCombatOverlay(
  state: GameState,
  params: CombatParams,
  status: CombatOverlayState["status"],
): CombatOverlayState | undefined {
  const clearing = state.map.clearings[params.clearing];
  const meta = AUTUMN_MAP.clearings.find((c) => c.id === params.clearing);
  if (!clearing || !meta) return undefined;
  const seq = state.log.length + (state.battleOverlay ? 1 : 0);
  const id = `${state.turn}-${seq}-${params.clearing}-${params.attacker}-${params.defender}`;
  return {
    id,
    turn: state.turn,
    clearing: params.clearing,
    suit: meta.suit,
    attacker: snapshotParty(clearing, params.attacker),
    defender: snapshotParty(clearing, params.defender),
    status,
    modifiers: [],
  };
}

function defenderAmbushWipesAttacker(
  state: GameState,
  params: CombatParams,
): boolean {
  if (!params.defenderAmbush || params.attackerAmbush) return false;
  const clearing = state.map.clearings[params.clearing];
  if (!clearing) return false;
  const attackerWarriors = clearing.warriors[params.attacker] ?? 0;
  return attackerWarriors > 0 && attackerWarriors <= 2;
}

function casualtiesNeedOrderChoice(
  warriorsBefore: number,
  hitsTaken: number,
  buildingCount: number,
  tokenCount: number,
): boolean {
  const remainingAfterWarriors = Math.max(0, hitsTaken - warriorsBefore);
  return remainingAfterWarriors > 0 && (buildingCount + tokenCount) > remainingAfterWarriors;
}

function computePieceLossByOrder(
  warriorsBefore: number,
  buildingsBefore: number,
  tokensBefore: number,
  hitsTaken: number,
  order: "buildings-first" | "tokens-first",
): { warriorsRemoved: number; buildingsRemoved: number; tokensRemoved: number } {
  let remaining = hitsTaken;
  const warriorsRemoved = Math.min(warriorsBefore, remaining);
  remaining -= warriorsRemoved;

  let buildingsRemoved = 0;
  let tokensRemoved = 0;
  if (order === "buildings-first") {
    buildingsRemoved = Math.min(buildingsBefore, remaining);
    remaining -= buildingsRemoved;
    tokensRemoved = Math.min(tokensBefore, remaining);
  } else {
    tokensRemoved = Math.min(tokensBefore, remaining);
    remaining -= tokensRemoved;
    buildingsRemoved = Math.min(buildingsBefore, remaining);
  }
  return { warriorsRemoved, buildingsRemoved, tokensRemoved };
}

function sidePieceOptions(
  clearing: ClearingState,
  faction: Faction,
): Array<{ id: string; kind: string; category: "building" | "token" }> {
  const out: Array<{ id: string; kind: string; category: "building" | "token" }> = [];
  for (let i = 0; i < clearing.buildings.length; i++) {
    const b = clearing.buildings[i]!;
    if (b.faction !== faction) continue;
    out.push({ id: `b:${i}`, kind: b.kind, category: "building" });
  }
  for (let i = 0; i < clearing.tokens.length; i++) {
    const t = clearing.tokens[i]!;
    if (t.faction !== faction) continue;
    out.push({ id: `t:${i}`, kind: t.kind, category: "token" });
  }
  return out;
}

function emptyChoices(): CombatChoiceState {
  return {
    useBrutalTactics: false,
    useBoldLeadership: false,
    useLookouts: false,
    useSappers: false,
    useAttackerArmorers: false,
    useDefenderArmorers: false,
    asked: [],
  };
}

function canUseLookouts(state: GameState, defender: Faction): boolean {
  if (!hasCraftedPersistent(state, defender, "Lookouts")) return false;
  if (defender === "marquise") return (state.factions.marquise?.warriorSupply ?? 0) > 0;
  if (defender === "eyrie") return (state.factions.eyrie?.warriorSupply ?? 0) > 0;
  if (defender === "alliance") return (state.factions.alliance?.warriorSupply ?? 0) > 0;
  return false;
}

function lookoutsWarriorsFor(state: GameState, defender: Faction): number {
  if (!canUseLookouts(state, defender)) return 0;
  if (defender === "marquise") return Math.min(3, state.factions.marquise?.warriorSupply ?? 0);
  if (defender === "eyrie") return Math.min(3, state.factions.eyrie?.warriorSupply ?? 0);
  if (defender === "alliance") return Math.min(3, state.factions.alliance?.warriorSupply ?? 0);
  return 0;
}

function beginOptionalEffectsOrResolve(
  state: GameState,
  params: CombatParams,
): GameState {
  return continueOptionalEffectsOrResolve(state, params, emptyChoices());
}

function continueOptionalEffectsOrResolve(
  state: GameState,
  params: CombatParams,
  choices: CombatChoiceState,
): GameState {
  const prompt = nextOptionalPrompt(state, params, choices);
  if (!prompt) return resolveCombat(state, params, choices);
  return produce(state, (draft) => {
    draft.pendingPrompts.push({
      id: `opt-${draft.turn}-${params.clearing}-${prompt.effect}`,
      kind: "combat.optionalEffect",
      faction: prompt.faction,
      payload: {
        params,
        choices,
        effect: prompt.effect,
        label: prompt.label,
      } as CombatOptionalPromptPayload,
    });
    if (draft.battleOverlay) {
      draft.battleOverlay = {
        ...draft.battleOverlay,
        status: "optional-effect-prompt",
      };
    }
    draft.log.push({
      turn: draft.turn,
      faction: "system",
      message: `${prompt.faction} may use ${prompt.label}.`,
    });
  });
}

function nextOptionalPrompt(
  state: GameState,
  params: CombatParams,
  choices: CombatChoiceState,
): { faction: Faction; effect: CombatEffectKey; label: string } | null {
  if (!choices.asked.includes("useLookouts") && canUseLookouts(state, params.defender)) {
    return { faction: params.defender, effect: "useLookouts", label: "Lookouts" };
  }
  if (!choices.asked.includes("useBrutalTactics") && hasCraftedPersistent(state, params.attacker, "Brutal Tactics")) {
    return { faction: params.attacker, effect: "useBrutalTactics", label: "Brutal Tactics" };
  }
  if (!choices.asked.includes("useBoldLeadership") && hasCraftedPersistent(state, params.attacker, "Bold Leadership")) {
    return { faction: params.attacker, effect: "useBoldLeadership", label: "Bold Leadership" };
  }
  if (!choices.asked.includes("useSappers") && hasCraftedPersistent(state, params.defender, "Sappers")) {
    return { faction: params.defender, effect: "useSappers", label: "Sappers" };
  }
  if (!choices.asked.includes("useAttackerArmorers") && hasCraftedPersistent(state, params.attacker, "Armorers")) {
    return { faction: params.attacker, effect: "useAttackerArmorers", label: "Armorers" };
  }
  if (!choices.asked.includes("useDefenderArmorers") && hasCraftedPersistent(state, params.defender, "Armorers")) {
    return { faction: params.defender, effect: "useDefenderArmorers", label: "Armorers" };
  }
  return null;
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
  const defWarriorsStart =
    (clearing.warriors[defender] ?? 0) + (modifiers.defenderBonusWarriors ?? 0);

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
  const attWarriorsAfterAmbush = Math.max(
    0,
    attWarriorsStart - defenderHitsFromAmbush,
  );
  const defWarriorsAfterAmbush = Math.max(
    0,
    defWarriorsStart - attackerHitsFromAmbush,
  );
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
    defWarriorsAfterAmbush,
    clearing.buildings,
    clearing.tokens,
    defender,
    attackerHits,
  );
  const attResult = applyHits(
    attWarriorsAfterAmbush,
    clearing.buildings,
    clearing.tokens,
    attacker,
    defenderHits,
  );

  // Warriors actually removed *including* the ambush phase.
  const attWarriorsRemoved =
    attWarriorsStart - attWarriorsAfterAmbush + attResult.warriorsRemoved;
  const defWarriorsRemoved =
    defWarriorsStart - defWarriorsAfterAmbush + defResult.warriorsRemoved;

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
): {
  warriorsRemoved: number;
  buildingsRemoved: number;
  tokensRemoved: number;
} {
  let remaining = hits;
  const warriorsRemoved = Math.min(ownerWarriors, remaining);
  remaining -= warriorsRemoved;

  let buildingsRemoved = 0;
  let tokensRemoved = 0;
  // Buildings first by default; the "attacker chooses" rule between buildings
  // and tokens is approximated here as "buildings first" — this matches
  // typical attacker preference (buildings score 1 VP each, same as tokens,
  // and removing a building usually opens slot for future plays).
  const ownBuildings = buildings.filter((b) => b.faction === owner).length;
  while (remaining > 0 && buildingsRemoved < ownBuildings) {
    buildingsRemoved += 1;
    remaining -= 1;
  }
  const ownTokens = tokens.filter((t) => t.faction === owner).length;
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
  state: GameState,
  faction: Faction,
  cardName: string,
): string | null {
  const entry = state.craftedPersistents.find(
    (e) => e.faction === faction && getCard(e.cardId).name === cardName,
  );
  return entry?.cardId ?? null;
}

/** Remove a crafted persistent by cardId from the play area and return it to
 *  the owner's hand. */
export function returnCraftedToHand(
  draft: GameState,
  faction: Faction,
  cardId: string,
): void {
  const idx = draft.craftedPersistents.findIndex(
    (e) => e.cardId === cardId && e.faction === faction,
  );
  if (idx >= 0) {
    draft.craftedPersistents.splice(idx, 1);
    draft.hands[faction].push(cardId);
  }
}

/** Remove a crafted persistent by cardId from the play area and push it to
 *  the discard pile. */
function discardCraftedPersistentById(draft: GameState, cardId: string): void {
  const idx = draft.craftedPersistents.findIndex((e) => e.cardId === cardId);
  if (idx >= 0) {
    draft.craftedPersistents.splice(idx, 1);
    discardCard(draft, cardId);
  }
}

/** Full reducer entry point for resolving a combat. */
export function resolveCombat(
  state: GameState,
  params: CombatParams,
  choices: CombatChoiceState = emptyChoices(),
  removalSelections: Partial<Record<"attacker" | "defender", string[]>> = {},
): GameState {
  const fallbackOverlay = buildCombatOverlay(state, params, "resolved");
  const carryOverlay = state.battleOverlay
    && state.battleOverlay.clearing === params.clearing
    && state.battleOverlay.attacker.faction === params.attacker
    && state.battleOverlay.defender.faction === params.defender
    && state.battleOverlay.status !== "resolved"
    && state.battleOverlay.status !== "cancelled"
    ? state.battleOverlay
    : undefined;

  const clearing = state.map.clearings[params.clearing];
  if (!clearing) throw new Error(`Bad clearing: ${params.clearing}`);
  const endedByAmbush = defenderAmbushWipesAttacker(state, params);
  const dice: [number, number] = endedByAmbush
    ? [0, 0]
    : (() => {
        const rng = mulberry32(mixSeed(state.seed, state.rngStep + 1));
        return [rollDie(rng), rollDie(rng)];
      })();

  // ── Detect crafted persistents that affect this combat ────────────────────
  const brutalTacticsId = hasCraftedPersistent(
    state,
    params.attacker,
    "Brutal Tactics",
  );
  const sappersId = hasCraftedPersistent(state, params.defender, "Sappers");
  const boldLeadershipId = hasCraftedPersistent(
    state,
    params.attacker,
    "Bold Leadership",
  );
  const lookoutsId = hasCraftedPersistent(state, params.defender, "Lookouts");
  // Alliance Guerrilla War is a faction ability, not a card.
  const guerrillaWar =
    params.defender === "alliance" && !!state.factions.alliance;
  const attackerArmorersId = hasCraftedPersistent(
    state,
    params.attacker,
    "Armorers",
  );
  const defenderArmorersId = hasCraftedPersistent(
    state,
    params.defender,
    "Armorers",
  );

  const useBrutal = choices.useBrutalTactics && !!brutalTacticsId;
  const useBold = choices.useBoldLeadership && !!boldLeadershipId;
  const useSappers = choices.useSappers && !!sappersId;
  const useLookouts = choices.useLookouts && !!lookoutsId;
  const lookoutsWarriors = useLookouts ? lookoutsWarriorsFor(state, params.defender) : 0;

  const baseModifiers: CombatModifiers = {
    extraAttackerHits: (useBrutal ? 1 : 0) + (useBold ? 1 : 0),
    extraDefenderHits: useSappers ? 1 : 0,
    guerrillaWar,
    brutalTacticsActive: useBrutal,
    defenderBonusWarriors: lookoutsWarriors,
  };

  // Preliminary pass without Armorers so we can tell if each side actually
  // takes rolled hits before deciding to spend the card.
  const prelim = computeCombatOutcome(
    clearing,
    params.attacker,
    params.defender,
    dice,
    !!params.attackerAmbush,
    !!params.defenderAmbush,
    baseModifiers,
  );

  const useAttackerArmorers = choices.useAttackerArmorers && !!attackerArmorersId;
  const useDefenderArmorers = choices.useDefenderArmorers && !!defenderArmorersId;

  const outcome =
    useAttackerArmorers || useDefenderArmorers
      ? computeCombatOutcome(
          clearing,
          params.attacker,
          params.defender,
          dice,
          !!params.attackerAmbush,
          !!params.defenderAmbush,
          {
            ...baseModifiers,
            ignoreAttackerRolledHits: useAttackerArmorers,
            ignoreDefenderRolledHits: useDefenderArmorers,
          },
        )
      : prelim;

  const attackerBuildings = clearing.buildings.filter((b) => b.faction === params.attacker).length;
  const attackerTokens = clearing.tokens.filter((t) => t.faction === params.attacker).length;
  const defenderBuildings = clearing.buildings.filter((b) => b.faction === params.defender).length;
  const defenderTokens = clearing.tokens.filter((t) => t.faction === params.defender).length;
  const attackerWarriors = clearing.warriors[params.attacker] ?? 0;
  const defenderWarriors = (clearing.warriors[params.defender] ?? 0) + lookoutsWarriors;
  const attackerCardboardHits = Math.max(0, outcome.defenderHits - attackerWarriors);
  const defenderCardboardHits = Math.max(0, outcome.attackerHits - defenderWarriors);
  const attackerOptions = sidePieceOptions(clearing, params.attacker);
  const defenderOptions = sidePieceOptions(clearing, params.defender);

  if (!endedByAmbush) {
    const askAttacker = removalSelections.attacker === undefined
      && casualtiesNeedOrderChoice(attackerWarriors, outcome.defenderHits, attackerBuildings, attackerTokens);
    if (askAttacker) {
      return produce(state, (draft) => {
        draft.pendingPrompts.push({
          id: `rm-pieces-${draft.turn}-${params.clearing}-attacker`,
          kind: "combat.removalPieces",
          faction: params.attacker,
          payload: {
            params,
            choices,
            removalSelections,
            side: "attacker",
            required: attackerCardboardHits,
            available: attackerOptions,
          } as CombatRemovalOrderPromptPayload,
        });
      });
    }
    const askDefender = removalSelections.defender === undefined
      && casualtiesNeedOrderChoice(defenderWarriors, outcome.attackerHits, defenderBuildings, defenderTokens);
    if (askDefender) {
      return produce(state, (draft) => {
        draft.pendingPrompts.push({
          id: `rm-pieces-${draft.turn}-${params.clearing}-defender`,
          kind: "combat.removalPieces",
          faction: params.defender,
          payload: {
            params,
            choices,
            removalSelections,
            side: "defender",
            required: defenderCardboardHits,
            available: defenderOptions,
          } as CombatRemovalOrderPromptPayload,
        });
      });
    }
  }

  const attackerOrder = "buildings-first" as const;
  const defenderOrder = "buildings-first" as const;
  const attackerLoss = computePieceLossByOrder(
    attackerWarriors,
    attackerBuildings,
    attackerTokens,
    outcome.defenderHits,
    attackerOrder,
  );
  const defenderLoss = computePieceLossByOrder(
    defenderWarriors,
    defenderBuildings,
    defenderTokens,
    outcome.attackerHits,
    defenderOrder,
  );
  const attackerSelected = removalSelections.attacker ?? attackerOptions.slice(0, attackerCardboardHits).map((p) => p.id);
  const defenderSelected = removalSelections.defender ?? defenderOptions.slice(0, defenderCardboardHits).map((p) => p.id);
  const attackerRemovedBuildings = attackerSelected.filter((id) => id.startsWith("b:")).length;
  const attackerRemovedTokens = attackerSelected.filter((id) => id.startsWith("t:")).length;
  const defenderRemovedBuildings = defenderSelected.filter((id) => id.startsWith("b:")).length;
  const defenderRemovedTokens = defenderSelected.filter((id) => id.startsWith("t:")).length;

  return produce(state, (draft) => {
    if (!endedByAmbush) draft.rngStep += 1;
    const cl = draft.map.clearings[params.clearing]!;

    // Lookouts: physically place warriors before casualties are applied.
    if (lookoutsId && lookoutsWarriors > 0) {
      cl.warriors[params.defender] =
        (cl.warriors[params.defender] ?? 0) + lookoutsWarriors;
      if (params.defender === "marquise" && draft.factions.marquise)
        draft.factions.marquise.warriorSupply -= lookoutsWarriors;
      else if (params.defender === "eyrie" && draft.factions.eyrie)
        draft.factions.eyrie.warriorSupply -= lookoutsWarriors;
      else if (params.defender === "alliance" && draft.factions.alliance)
        draft.factions.alliance.warriorSupply -= lookoutsWarriors;
    }

    // Remove warriors.
    cl.warriors[params.attacker] =
      (cl.warriors[params.attacker] ?? 0) -
      attackerLoss.warriorsRemoved;
    cl.warriors[params.defender] =
      (cl.warriors[params.defender] ?? 0) -
      defenderLoss.warriorsRemoved;

    // Remove buildings (defender's, then attacker's).
    const removedBuildingIndexes = new Set<number>();
    for (const id of defenderSelected) {
      if (!id.startsWith("b:")) continue;
      const idx = Number(id.slice(2));
      if (!Number.isNaN(idx)) removedBuildingIndexes.add(idx);
    }
    for (const id of attackerSelected) {
      if (!id.startsWith("b:")) continue;
      const idx = Number(id.slice(2));
      if (!Number.isNaN(idx)) removedBuildingIndexes.add(idx);
    }
    cl.buildings = cl.buildings.filter((_b, idx) => !removedBuildingIndexes.has(idx));
    // Sync faction-level building caches. `removeN` only touches the clearing
    // array; each faction also keeps an authoritative count/list that must
    // stay in sync so legal-action checks and VP tracks remain correct.
    for (const [side, n] of [
      [params.defender, defenderRemovedBuildings],
      [params.attacker, attackerRemovedBuildings],
    ] as const) {
      if (n <= 0) continue;
      // Which buildings were removed? removeN takes the first N for the faction.
      const removed = clearing.buildings
        .filter((b) => b.faction === side)
        .slice(0, n);
      if (side === "marquise" && draft.factions.marquise) {
        const m = draft.factions.marquise;
        for (const b of removed) {
          const k = b.kind as "sawmill" | "workshop" | "recruiter";
          if (m.buildings[k] > 0) m.buildings[k] -= 1;
        }
      } else if (side === "eyrie" && draft.factions.eyrie) {
        // At most one roost per clearing; splice it out.
        const idx = draft.factions.eyrie.roosts.indexOf(params.clearing);
        if (idx >= 0) draft.factions.eyrie.roosts.splice(idx, 1);
      } else if (side === "alliance" && draft.factions.alliance) {
        const suit = AUTUMN_MAP.clearings.find(
          (c) => c.id === params.clearing,
        )?.suit;
        if (suit) delete draft.factions.alliance.bases[suit];
      }
    }
    // Remove tokens.
    const removedTokenIndexes = new Set<number>();
    for (const id of defenderSelected) {
      if (!id.startsWith("t:")) continue;
      const idx = Number(id.slice(2));
      if (!Number.isNaN(idx)) removedTokenIndexes.add(idx);
    }
    for (const id of attackerSelected) {
      if (!id.startsWith("t:")) continue;
      const idx = Number(id.slice(2));
      if (!Number.isNaN(idx)) removedTokenIndexes.add(idx);
    }
    const defenderRemovedAllianceSympathy = defenderSelected.some((id) => {
      if (!id.startsWith('t:')) return false;
      const idx = Number(id.slice(2));
      if (Number.isNaN(idx)) return false;
      const token = clearing.tokens[idx];
      return token?.faction === 'alliance' && token.kind === 'sympathy';
    });
    const attackerRemovedAllianceSympathy = attackerSelected.some((id) => {
      if (!id.startsWith('t:')) return false;
      const idx = Number(id.slice(2));
      if (Number.isNaN(idx)) return false;
      const token = clearing.tokens[idx];
      return token?.faction === 'alliance' && token.kind === 'sympathy';
    });
    cl.tokens = cl.tokens.filter((_t, idx) => !removedTokenIndexes.has(idx));
    // Sync Alliance sympathy list. All Alliance tokens are sympathy tokens,
    // so any removal means this clearing's sympathy marker is gone.
    for (const [side, n] of [
      [params.defender, defenderRemovedTokens],
      [params.attacker, attackerRemovedTokens],
    ] as const) {
      if (n <= 0 || side !== "alliance" || !draft.factions.alliance) continue;
      const idx = draft.factions.alliance.sympathy.indexOf(params.clearing);
      if (idx >= 0) draft.factions.alliance.sympathy.splice(idx, 1);
    }
    if (defenderRemovedAllianceSympathy) {
      enqueueOutrage(draft, params.attacker, params.clearing, 'sympathyRemoved');
    }
    if (attackerRemovedAllianceSympathy) {
      enqueueOutrage(draft, params.defender, params.clearing, 'sympathyRemoved');
    }
    const keepClearingState = draft.factions.marquise?.keep?.clearing;
    if (keepClearingState != null) {
      const keepStillPresent = draft.map.clearings[keepClearingState]?.tokens
        .some((t) => t.faction === "marquise" && t.kind === "keep");
      if (!keepStillPresent && draft.factions.marquise) draft.factions.marquise.keep = undefined;
    }

    // Score VP from removed enemy cardboard.
    awardVictoryPoints(draft, params.attacker, defenderRemovedBuildings + defenderRemovedTokens, `removing enemy cardboard in clearing ${params.clearing}`);
    awardVictoryPoints(draft, params.defender, attackerRemovedBuildings + attackerRemovedTokens, `removing enemy cardboard in clearing ${params.clearing}`);

    // Brutal Tactics: defender scores 1 extra VP (penalty for the attacker).
    if (useBrutal) {
      awardVictoryPoints(draft, params.defender, 1, 'Brutal Tactics');
    }

    // Return removed warriors to their owners' supplies. Vagabond has no
    // warrior supply — they take item damage instead, handled in Phase 5.
    returnWarriorsToSupply(
      draft,
      params.attacker,
      attackerLoss.warriorsRemoved,
    );
    returnWarriorsToSupply(
      draft,
      params.defender,
      defenderLoss.warriorsRemoved,
    );

    // Vagabond doesn't have warriors — incoming hits damage items instead.
    // Face-up items flip to damaged first, then face-down items, until the
    // hits are absorbed (or the Vagabond runs out of items).
    if (params.defender === "vagabond" && draft.factions.vagabond) {
      let toDamage = outcome.attackerHits;
      const items = draft.factions.vagabond.items;
      for (const it of items) {
        if (toDamage <= 0) break;
        if (it.state === "face-up") {
          it.state = "damaged";
          toDamage -= 1;
        }
      }
      for (const it of items) {
        if (toDamage <= 0) break;
        if (it.state === "face-down") {
          it.state = "damaged";
          toDamage -= 1;
        }
      }
      if (outcome.attackerHits > toDamage) {
        draft.log.push({
          turn: draft.turn,
          faction: "vagabond",
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
          discardCard(draft, id);
          break;
        }
      }
    }

    // Discard spent crafted persistents; return one-time-per-combat cards to hand.
    const cardNotes: string[] = [];
    if (useBold && boldLeadershipId) {
      returnCraftedToHand(draft, params.attacker, boldLeadershipId);
      cardNotes.push("Bold Leadership");
    }
    if (useLookouts && lookoutsId && lookoutsWarriors > 0) {
      returnCraftedToHand(draft, params.defender, lookoutsId);
      cardNotes.push("Lookouts");
    }
    if (useSappers && sappersId) {
      discardCraftedPersistentById(draft, sappersId);
      cardNotes.push("Sappers");
    }
    if (useAttackerArmorers && attackerArmorersId) {
      discardCraftedPersistentById(draft, attackerArmorersId);
      cardNotes.push(`Armorers (${params.attacker})`);
    }
    if (useDefenderArmorers && defenderArmorersId) {
      discardCraftedPersistentById(draft, defenderArmorersId);
      cardNotes.push(`Armorers (${params.defender})`);
    }
    if (useBrutal) {
      cardNotes.push("Brutal Tactics");
    }

    // Keep a structured summary for the battle animation overlay.
    const baseOverlay = carryOverlay ?? fallbackOverlay;
    if (baseOverlay) {
      const modifierNotes: string[] = [];
      if (params.defenderAmbush) modifierNotes.push("Defender ambush dealt 2 hits before dice");
      if (params.attackerAmbush) modifierNotes.push("Attacker counter-ambush dealt 2 hits before dice");
      if (outcome.ambushCancelled) modifierNotes.push("Ambush cards cancelled each other");
      if (endedByAmbush) modifierNotes.push("Defender ambush eliminated all attacker warriors; battle ended before dice");
      if (outcome.guerrillaWarUsed) modifierNotes.push("Guerrilla War swapped high/low dice assignments");
      if (outcome.defenderDefenseless) modifierNotes.push("Defenseless: attacker gained +1 rolled hit");
      if (lookoutsWarriors > 0) modifierNotes.push(`Lookouts added ${lookoutsWarriors} defender warriors before roll`);
      if (useBold) modifierNotes.push("Bold Leadership added +1 attacker hit");
      if (useSappers) modifierNotes.push("Sappers added +1 defender hit");
      if (useAttackerArmorers) modifierNotes.push(`Armorers (${params.attacker}) negated own rolled hits`);
      if (useDefenderArmorers) modifierNotes.push(`Armorers (${params.defender}) negated own rolled hits`);
      if (useBrutal) modifierNotes.push("Brutal Tactics added +1 attacker hit and gave defender +1 VP");

      draft.battleOverlay = {
        ...baseOverlay,
        status: "resolved",
        defenderAmbushCardId: params.defenderAmbush,
        attackerAmbushCardId: params.attackerAmbush,
        dice: outcome.dice,
        attackerHits: outcome.attackerHits,
        defenderHits: outcome.defenderHits,
        defenderDefenseless: outcome.defenderDefenseless,
        endedByAmbush,
        modifiers: modifierNotes,
      };
    }

    // Log.
    const tag = outcome.defenderDefenseless ? " (defenseless)" : "";
    const ambushNote = outcome.ambushCancelled
      ? " [ambushes cancelled]"
      : outcome.ambushedByDefender
        ? " [defender ambushed]"
        : outcome.ambushedByAttacker
          ? " [attacker ambushed]"
          : "";
    const gwNote = outcome.guerrillaWarUsed ? " [Guerrilla War]" : "";
    const cardNote = cardNotes.length ? ` [${cardNotes.join(", ")}]` : "";
    draft.log.push({
      turn: draft.turn,
      faction: params.attacker,
      message:
        `Battle: ${params.attacker} attacked ${params.defender} in clearing ${params.clearing}${tag}${ambushNote}${gwNote}${cardNote}. ` +
        `Dice ${endedByAmbush ? "none" : `${outcome.dice[0]}/${outcome.dice[1]}`}. ` +
        `Final hits: ${params.attacker}→${params.defender} ${outcome.attackerHits}, ${params.defender}→${params.attacker} ${outcome.defenderHits}. ` +
        `Removed: ${params.defender} ${defenderLoss.warriorsRemoved}W/${defenderRemovedBuildings}B/${defenderRemovedTokens}T, ` +
        `${params.attacker} ${attackerLoss.warriorsRemoved}W/${attackerRemovedBuildings}B/${attackerRemovedTokens}T ` +
        `${endedByAmbush ? "(no dice rolled)" : `(dice ${outcome.dice[0]}/${outcome.dice[1]})`}`,
    });
    if (endedByAmbush) {
      draft.log.push({
        turn: draft.turn,
        faction: params.defender,
        message: `Ambush eliminated all attacking warriors. ${params.defender} wins the battle immediately.`,
      });
    }
    if (useBrutal) {
      draft.log.push({
        turn: draft.turn,
        faction: params.defender,
        message: `Brutal Tactics! ${params.defender} scores 1 VP.`,
      });
    }

    const battleSuit = AUTUMN_MAP.clearings.find((c) => c.id === params.clearing)?.suit;
    const marquiseLoss = params.attacker === "marquise"
      ? attackerLoss.warriorsRemoved
      : params.defender === "marquise"
        ? defenderLoss.warriorsRemoved
        : 0;
    const keepClearing = draft.factions.marquise?.keep?.clearing;
    const keepExists = keepClearing != null
      && !!draft.map.clearings[keepClearing]?.tokens.some((t) => t.faction === "marquise" && t.kind === "keep");
    if (marquiseLoss > 0 && battleSuit && keepExists) {
      const options = draft.hands.marquise.filter((id) => {
        const card = getCard(id);
        return card.suit === battleSuit || card.suit === "bird";
      });
      if (options.length > 0) {
        draft.pendingPrompts.push({
          id: `field-hospital-${draft.turn}-${params.clearing}`,
          kind: "combat.fieldHospitals",
          faction: "marquise",
          payload: {
            clearing: params.clearing,
            suit: battleSuit,
            warriorsLost: marquiseLoss,
          } as CombatFieldHospitalsPromptPayload,
        });
        draft.log.push({
          turn: draft.turn,
          faction: "marquise",
          message: `Field Hospitals: may spend ${battleSuit} or bird card to revive ${marquiseLoss} warrior(s) at the keep.`,
        });
      }
    }
  });
}

function returnWarriorsToSupply(
  draft: GameState,
  faction: Faction,
  count: number,
): void {
  if (count <= 0) return;
  const fs = draft.factions;
  if (faction === "marquise" && fs.marquise) fs.marquise.warriorSupply += count;
  else if (faction === "eyrie" && fs.eyrie) fs.eyrie.warriorSupply += count;
  else if (faction === "alliance" && fs.alliance)
    fs.alliance.warriorSupply += count;
  // Vagabond pawn does not have a warrior supply.
}

/** True if `cardId` is an ambush card. */
export function isAmbushCard(cardId: CardId): boolean {
  return getCard(cardId).category === "ambush";
}

/** Find every matching-suit ambush card a defender could play for a battle
 *  at the given clearing. Matching = same suit as the clearing OR bird. */
export function defenderAmbushOptions(
  state: GameState,
  clearing: ClearingId,
  defender: Faction,
): CardId[] {
  const meta = AUTUMN_MAP.clearings.find((c) => c.id === clearing);
  if (!meta) return [];
  return (state.hands[defender] ?? []).filter((id) => {
    // Network spectators and non-owning clients receive opaque hand-card
    // placeholders ("hidden"). They are not cards and must never reach the
    // card registry while rendering a combat prompt.
    if (id === "hidden") return false;
    const c = getCard(id);
    return c.category === "ambush" && (c.suit === meta.suit || c.suit === "bird");
  });
}

/** Battle entry point used by every faction's battle/strike action. Queues
 *  pending prompts for Mice-in-a-Bush (cancel) and defender ambush in turn.
 *  If the attacker has Scouting Party crafted, the ambush prompt is skipped. */
export function declareBattle(
  state: GameState,
  params: CombatParams,
): GameState {
  if (
    !params ||
    typeof params.clearing !== "number" ||
    !Number.isInteger(params.clearing) ||
    !state.map.clearings[params.clearing] ||
    params.attacker === params.defender ||
    !state.factions[params.attacker] ||
    !state.factions[params.defender]
  ) {
    return state;
  }

  const attackerWarriors = state.map.clearings[params.clearing].warriors[params.attacker] ?? 0;
  if (attackerWarriors <= 0) {
    return state;
  }
  if (
    state.pendingPrompts.some(
      (p) =>
        p.kind === "combat.defenderAmbush" ||
        p.kind === "combat.miceCancel" ||
        p.kind === "combat.attackerCounterAmbush" ||
        p.kind === "combat.optionalEffect" ||
        p.kind === "combat.removalPieces" ||
        p.kind === "combat.fieldHospitals",
    )
  ) {
    return state; // Already mid-prompt.
  }
  // Mice-in-a-Bush: defender may cancel this battle by discarding the card.
  const miceId = hasCraftedPersistent(state, params.defender, "Mice-in-a-Bush");
  if (miceId) {
    const overlay = buildCombatOverlay(state, params, "mice-cancel-prompt");
    return produce(state, (draft) => {
      draft.pendingPrompts.push({
        id: `miceCancel-${draft.turn}-${params.clearing}`,
        kind: "combat.miceCancel",
        faction: params.defender,
        payload: { ...params, miceId },
      });
      draft.battleOverlay = overlay;
      draft.log.push({
        turn: draft.turn,
        faction: "system",
        message: `${params.defender} may cancel the battle with Mice-in-a-Bush.`,
      });
    });
  }
  const ambushes = defenderAmbushOptions(
    state,
    params.clearing,
    params.defender,
  );
  const scoutingId = hasCraftedPersistent(
    state,
    params.attacker,
    "Scouting Party",
  );
  if (scoutingId || ambushes.length === 0) {
    return beginOptionalEffectsOrResolve(state, params);
  }
  const overlay = buildCombatOverlay(state, params, "defender-ambush-prompt");
  return produce(state, (draft) => {
    draft.pendingPrompts.push({
      id: `defAmbush-${draft.turn}-${params.clearing}`,
      kind: "combat.defenderAmbush",
      faction: params.defender,
      payload: params,
    });
    draft.battleOverlay = overlay;
    draft.log.push({
      turn: draft.turn,
      faction: "system",
      message: `${params.defender} may play an ambush against ${params.attacker}'s battle in clearing ${params.clearing}.`,
    });
  });
}

/** Resolve a Mice-in-a-Bush cancel prompt. */
export function resolveMiceCancelPrompt(
  state: GameState,
  options: { cancel: boolean },
): GameState {
  const prompt = state.pendingPrompts.find(
    (p) => p.kind === "combat.miceCancel",
  );
  if (!prompt) return state;
  const payload = prompt.payload as CombatParams & { miceId: string };
  // Remove the prompt first.
  const after = produce(state, (draft) => {
    draft.pendingPrompts = draft.pendingPrompts.filter(
      (p) => p.id !== prompt.id,
    );
  });
  if (options.cancel) {
    // Discard Mice-in-a-Bush and cancel the battle.
    return produce(after, (draft) => {
      discardCraftedPersistentById(draft, payload.miceId);
      if (draft.battleOverlay && draft.battleOverlay.clearing === payload.clearing) {
        draft.battleOverlay = {
          ...draft.battleOverlay,
          status: "cancelled",
          modifiers: [...draft.battleOverlay.modifiers, "Mice-in-a-Bush cancelled battle"],
        };
      }
      draft.log.push({
        turn: draft.turn,
        faction: payload.defender,
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
export function resolveAmbushPrompt(
  state: GameState,
  options: { playedCard?: CardId },
): GameState {
  const prompt = state.pendingPrompts.find(
    (p) => p.kind === "combat.defenderAmbush",
  );
  if (!prompt) return state;
  const params = prompt.payload as CombatParams;
  const withoutPrompt = produce(state, (draft) => {
    draft.pendingPrompts = draft.pendingPrompts.filter(
      (p) => p.id !== prompt.id,
    );
  });
  if (!options.playedCard) return beginOptionalEffectsOrResolve(withoutPrompt, params);

  const counterOptions = defenderAmbushOptions(
    withoutPrompt,
    params.clearing,
    params.attacker,
  );
  const next = { ...params, defenderAmbush: options.playedCard };
  if (counterOptions.length === 0) {
    if (defenderAmbushWipesAttacker(withoutPrompt, next)) return resolveCombat(withoutPrompt, next);
    return beginOptionalEffectsOrResolve(withoutPrompt, next);
  }

  return produce(withoutPrompt, (draft) => {
    draft.pendingPrompts.push({
      id: `attCounter-${draft.turn}-${params.clearing}`,
      kind: "combat.attackerCounterAmbush",
      faction: params.attacker,
      payload: next,
    });
    if (draft.battleOverlay) {
      draft.battleOverlay = {
        ...draft.battleOverlay,
        status: "attacker-counter-ambush-prompt",
        defenderAmbushCardId: options.playedCard,
      };
    }
    draft.log.push({
      turn: draft.turn,
      faction: "system",
      message: `${params.attacker} may cancel the ambush by playing a matching Ambush card.`,
    });
  });
}

export function resolveCounterAmbushPrompt(
  state: GameState,
  options: { playedCard?: CardId },
): GameState {
  const prompt = state.pendingPrompts.find(
    (p) => p.kind === "combat.attackerCounterAmbush",
  );
  if (!prompt) return state;
  const params = prompt.payload as CombatParams;
  const withoutPrompt = produce(state, (draft) => {
    draft.pendingPrompts = draft.pendingPrompts.filter(
      (p) => p.id !== prompt.id,
    );
  });
  const next = options.playedCard
    ? { ...params, attackerAmbush: options.playedCard }
    : params;
  if (defenderAmbushWipesAttacker(withoutPrompt, next)) return resolveCombat(withoutPrompt, next);
  return beginOptionalEffectsOrResolve(withoutPrompt, next);
}

export function resolveOptionalEffectPrompt(
  state: GameState,
  options: { use: boolean; effect: string; faction: Faction },
): GameState {
  const prompt = state.pendingPrompts.find(
    (p) => p.kind === "combat.optionalEffect",
  );
  if (!prompt || prompt.faction !== options.faction) return state;
  const payload = prompt.payload as CombatOptionalPromptPayload;
  if (payload.effect !== options.effect) return state;
  const effect = payload.effect;
  const nextChoices: CombatChoiceState = {
    ...payload.choices,
    asked: payload.choices.asked.includes(effect)
      ? payload.choices.asked
      : [...payload.choices.asked, effect],
    [effect]: options.use,
  } as CombatChoiceState;
  const after = produce(state, (draft) => {
    draft.pendingPrompts = draft.pendingPrompts.filter((p) => p.id !== prompt.id);
  });
  return continueOptionalEffectsOrResolve(after, payload.params, nextChoices);
}

export function resolveRemovalPiecesPrompt(
  state: GameState,
  options: {
    faction: Faction;
    side: "attacker" | "defender";
    pieceIds: string[];
  },
): GameState {
  const prompt = state.pendingPrompts.find((p) => p.kind === "combat.removalPieces");
  if (!prompt || prompt.faction !== options.faction) return state;
  const payload = prompt.payload as CombatRemovalOrderPromptPayload;
  if (payload.side !== options.side) return state;
  const allowed = new Set(payload.available.map((p) => p.id));
  const uniq = Array.from(new Set(options.pieceIds));
  if (uniq.length !== payload.required) return state;
  if (uniq.some((id) => !allowed.has(id))) return state;
  const nextSelections = {
    ...payload.removalSelections,
    [options.side]: uniq,
  };
  const after = produce(state, (draft) => {
    draft.pendingPrompts = draft.pendingPrompts.filter((p) => p.id !== prompt.id);
  });
  return resolveCombat(after, payload.params, payload.choices, nextSelections);
}

export function resolveFieldHospitalsPrompt(
  state: GameState,
  options: { faction: Faction; cardId?: CardId },
): GameState {
  const prompt = state.pendingPrompts.find((p) => p.kind === "combat.fieldHospitals");
  if (!prompt || prompt.faction !== options.faction || options.faction !== "marquise") return state;
  const payload = prompt.payload as CombatFieldHospitalsPromptPayload;
  // Reject an invalid payment without consuming the prompt. This keeps the
  // engine authoritative even if a client dispatches an action outside the UI.
  if (options.cardId) {
    if (!state.hands.marquise.includes(options.cardId)) return state;
    const card = getCard(options.cardId);
    if (card.suit !== payload.suit && card.suit !== "bird") return state;
  }
  const after = produce(state, (draft) => {
    draft.pendingPrompts = draft.pendingPrompts.filter((p) => p.id !== prompt.id);
  });
  return produce(after, (draft) => {
    const keepClearing = draft.factions.marquise?.keep?.clearing;
    if (keepClearing == null) return;
    const keepStillPresent = draft.map.clearings[keepClearing]?.tokens
      .some((t) => t.faction === "marquise" && t.kind === "keep");
    if (!keepStillPresent) return;
    if (!options.cardId) {
      draft.log.push({
        turn: draft.turn,
        faction: "marquise",
        message: "Field Hospitals skipped.",
      });
      return;
    }
    const idx = draft.hands.marquise.indexOf(options.cardId);
    if (idx < 0) return;
    const card = getCard(options.cardId);
    draft.hands.marquise.splice(idx, 1);
    discardCard(draft, options.cardId);
    const toRevive = Math.min(payload.warriorsLost, draft.factions.marquise?.warriorSupply ?? 0);
    if (toRevive <= 0) return;
    draft.map.clearings[keepClearing]!.warriors.marquise =
      (draft.map.clearings[keepClearing]!.warriors.marquise ?? 0) + toRevive;
    draft.factions.marquise!.warriorSupply -= toRevive;
    draft.log.push({
      turn: draft.turn,
      faction: "marquise",
      message: `Field Hospitals: spent ${card.name} to revive ${toRevive} warrior(s) at the keep.`,
    });
  });
}
