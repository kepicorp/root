import { describe, expect, it } from "vitest";
import { computeCombatOutcome, defenderAmbushOptions, resolveCombat } from "../combat";
import { BASE_SHARED_DECK } from "../cards";
import { newGame, reduce } from "../state";
import type { ClearingState } from "../types";

const emptyClearing = (
  overrides: Partial<ClearingState> = {},
): ClearingState => ({
  warriors: {},
  buildings: [],
  tokens: [],
  vagabondHere: false,
  ...overrides,
});

function cardIdByName(name: string): string {
  const c = BASE_SHARED_DECK.find((x) => x.name === name);
  if (!c) throw new Error(`Missing card in base deck: ${name}`);
  return c.id;
}

describe("combat outcome (pure)", () => {
  it("ignores redacted hand placeholders when finding ambush options", () => {
    const base = newGame({ seed: 3 });
    const state = {
      ...base,
      hands: {
        ...base.hands,
        eyrie: ['hidden'],
      },
    };

    expect(defenderAmbushOptions(state, 1, "eyrie")).toEqual([]);
  });

  it("attacker takes higher die, defender takes lower", () => {
    const c = emptyClearing({ warriors: { marquise: 5, eyrie: 5 } });
    const out = computeCombatOutcome(
      c,
      "marquise",
      "eyrie",
      [3, 1],
      false,
      false,
    );
    expect(out.attackerHits).toBe(3);
    expect(out.defenderHits).toBe(1);
  });

  it("hits capped by attacker warriors", () => {
    const c = emptyClearing({ warriors: { marquise: 1, eyrie: 5 } });
    const out = computeCombatOutcome(
      c,
      "marquise",
      "eyrie",
      [3, 2],
      false,
      false,
    );
    expect(out.attackerHits).toBeLessThanOrEqual(1);
  });

  it("defenseless defender → attacker gets +1 hit", () => {
    const c = emptyClearing({
      warriors: { marquise: 3 },
      buildings: [{ faction: "eyrie", kind: "roost" }],
    });
    const out = computeCombatOutcome(
      c,
      "marquise",
      "eyrie",
      [2, 0],
      false,
      false,
    );
    expect(out.defenderDefenseless).toBe(true);
    // attacker rolls 2, +1 defenseless = 3 hits, capped by 3 warriors = 3
    expect(out.attackerHits).toBe(3);
    expect(out.defenderHits).toBe(0); // defender has no warriors
  });

  it("defender ambush deals +2 hits, attacker counter-ambush cancels", () => {
    const c = emptyClearing({ warriors: { marquise: 5, eyrie: 5 } });
    const withDefAmbush = computeCombatOutcome(
      c,
      "marquise",
      "eyrie",
      [3, 1],
      false,
      true,
    );
    expect(withDefAmbush.defenderHits).toBeGreaterThanOrEqual(3);
    expect(withDefAmbush.ambushedByDefender).toBe(true);

    const cancelled = computeCombatOutcome(
      c,
      "marquise",
      "eyrie",
      [3, 1],
      true,
      true,
    );
    expect(cancelled.ambushCancelled).toBe(true);
    expect(cancelled.defenderHits).toBe(1);
  });

  it("attacker scores 1 VP per enemy building/token removed", () => {
    const c = emptyClearing({
      warriors: { marquise: 5 },
      buildings: [
        { faction: "eyrie", kind: "roost" },
        { faction: "eyrie", kind: "roost" },
      ],
    });
    const out = computeCombatOutcome(
      c,
      "marquise",
      "eyrie",
      [3, 0],
      false,
      false,
    );
    expect(out.defenderDefenseless).toBe(true);
    expect(out.defenderPiecesRemoved.buildings).toBeGreaterThan(0);
    expect(out.attackerVp).toBe(out.defenderPiecesRemoved.buildings);
  });

  it("hits do not over-remove pieces", () => {
    const c = emptyClearing({
      warriors: { marquise: 5, eyrie: 1 },
      buildings: [{ faction: "eyrie", kind: "roost" }],
    });
    const out = computeCombatOutcome(
      c,
      "marquise",
      "eyrie",
      [3, 3],
      false,
      false,
    );
    // defender has 1 warrior + 1 building = 2 pieces; cannot lose more than 2.
    const totalDefRemoved =
      out.defenderPiecesRemoved.warriors +
      out.defenderPiecesRemoved.buildings +
      out.defenderPiecesRemoved.tokens;
    expect(totalDefRemoved).toBeLessThanOrEqual(2);
  });
});

describe("resolveCombat (state reducer)", () => {
  it("removes pieces and awards VP", () => {
    let s = newGame({ seed: 7 });
    s = {
      ...s,
      map: {
        clearings: {
          ...s.map.clearings,
          1: {
            warriors: { marquise: 5, eyrie: 1 },
            buildings: [{ faction: "eyrie", kind: "roost" }],
            tokens: [],
            vagabondHere: false,
          },
        },
      },
    };
    const after = resolveCombat(s, {
      clearing: 1,
      attacker: "marquise",
      defender: "eyrie",
    });
    const cl = after.map.clearings[1]!;
    const totalDefBefore = 1 + 1; // 1 warrior + 1 building
    const totalDefAfter =
      (cl.warriors.eyrie ?? 0) +
      cl.buildings.filter((b) => b.faction === "eyrie").length;
    expect(totalDefAfter).toBeLessThanOrEqual(totalDefBefore);
    expect(after.scores.marquise).toBeGreaterThanOrEqual(0);
    expect(after.rngStep).toBe(s.rngStep + 1);
  });

  it("decrements marquise.buildings when a building is destroyed", () => {
    // Defender is marquise (defenseless — 0 warriors), guaranteeing ≥1 attacker hit
    // which flows to buildings after no warriors remain.
    let s = newGame({ seed: 1 });
    s = {
      ...s,
      factions: {
        ...s.factions,
        marquise: {
          ...s.factions.marquise!,
          buildings: { sawmill: 1, workshop: 0, recruiter: 0 },
        },
      },
      map: {
        clearings: {
          ...s.map.clearings,
          1: {
            warriors: { eyrie: 10 },
            buildings: [{ faction: "marquise", kind: "sawmill" }],
            tokens: [],
            vagabondHere: false,
          },
        },
      },
    };
    const after = resolveCombat(s, {
      clearing: 1,
      attacker: "eyrie",
      defender: "marquise",
    });
    const sawmillsOnBoard = Object.values(after.map.clearings)
      .flatMap((cl) => cl.buildings)
      .filter((b) => b.faction === "marquise" && b.kind === "sawmill").length;
    expect(after.factions.marquise!.buildings.sawmill).toBe(sawmillsOnBoard);
  });

  it("removes clearing from eyrie.roosts when roost is destroyed", () => {
    // Defender is eyrie (defenseless — 0 warriors), guaranteeing ≥1 attacker hit.
    let s = newGame({ seed: 1 });
    s = {
      ...s,
      factions: {
        ...s.factions,
        eyrie: { ...s.factions.eyrie!, roosts: [1] },
      },
      map: {
        clearings: {
          ...s.map.clearings,
          1: {
            warriors: { marquise: 10 },
            buildings: [{ faction: "eyrie", kind: "roost" }],
            tokens: [],
            vagabondHere: false,
          },
        },
      },
    };
    const after = resolveCombat(s, {
      clearing: 1,
      attacker: "marquise",
      defender: "eyrie",
    });
    const roostsOnBoard = Object.values(after.map.clearings)
      .flatMap((cl) => cl.buildings)
      .filter((b) => b.faction === "eyrie" && b.kind === "roost").length;
    expect(after.factions.eyrie!.roosts.length).toBe(roostsOnBoard);
  });

  it("removes clearing from alliance.sympathy when sympathy token is destroyed", () => {
    // Clearing 1 is fox. Alliance has sympathy there but no warriors/buildings,
    // so the defenseless attacker hit flows straight to the token.
    let s = newGame({ seed: 1 });
    s = {
      ...s,
      factions: {
        ...s.factions,
        alliance: { ...s.factions.alliance!, sympathy: [1] },
      },
      map: {
        clearings: {
          ...s.map.clearings,
          1: {
            warriors: { marquise: 10 },
            buildings: [],
            tokens: [{ faction: "alliance", kind: "sympathy" }],
            vagabondHere: false,
          },
        },
      },
    };
    const after = resolveCombat(s, {
      clearing: 1,
      attacker: "marquise",
      defender: "alliance",
    });
    const sympathyOnBoard = Object.values(after.map.clearings)
      .flatMap((cl) => cl.tokens)
      .filter((t) => t.faction === "alliance" && t.kind === "sympathy").length;
    expect(after.factions.alliance!.sympathy.length).toBe(sympathyOnBoard);
    expect(after.pendingOutrage).toMatchObject({
      faction: 'marquise',
      clearing: 1,
      suit: 'fox',
      trigger: 'sympathyRemoved',
    });
  });

  it('resolves queued outrage with reveal+draw fallback before next payment', () => {
    const mouseCard = BASE_SHARED_DECK.find((c) => c.suit === 'mouse')!.id;
    const drawCard = BASE_SHARED_DECK.find((c) => c.suit === 'fox')!.id;
    let s = newGame({ seed: 5 });
    s = {
      ...s,
      hands: {
        ...s.hands,
        marquise: [mouseCard],
      },
      deck: [drawCard],
      pendingOutrage: {
        faction: 'marquise',
        clearing: 3,
        suit: 'rabbit',
        trigger: 'moveIntoSympathy',
      },
      pendingOutrageQueue: [{
        faction: 'marquise',
        clearing: 4,
        suit: 'mouse',
        trigger: 'sympathyRemoved',
      }],
    };

    let next = reduce(s, { kind: 'system.resolveOutrage' });
    expect(next.factions.alliance!.supporters).toContain(drawCard);
    expect(next.pendingOutrage).toMatchObject({ clearing: 4, suit: 'mouse', trigger: 'sympathyRemoved' });
    expect(next.pendingOutrageQueue).toBeUndefined();
    expect(next.log.some((e) => e.message.includes('revealed hand to Alliance'))).toBe(true);

    next = reduce(next, { kind: 'system.resolveOutrage', cardId: mouseCard });
    expect(next.pendingOutrage).toBeUndefined();
    expect(next.factions.alliance!.supporters).toContain(mouseCard);
    expect(next.hands.marquise).not.toContain(mouseCard);
  });

  it("clears alliance.bases entry when base is destroyed", () => {
    // Clearing 1 is fox suit. Defender is alliance (defenseless), guaranteeing ≥1 hit.
    let s = newGame({ seed: 1 });
    s = {
      ...s,
      factions: {
        ...s.factions,
        alliance: { ...s.factions.alliance!, bases: { fox: 1 } },
      },
      map: {
        clearings: {
          ...s.map.clearings,
          1: {
            warriors: { marquise: 10 },
            buildings: [{ faction: "alliance", kind: "base-fox" }],
            tokens: [],
            vagabondHere: false,
          },
        },
      },
    };
    const after = resolveCombat(s, {
      clearing: 1,
      attacker: "marquise",
      defender: "alliance",
    });
    const basesOnBoard = Object.values(after.map.clearings)
      .flatMap((cl) => cl.buildings)
      .filter((b) => b.faction === "alliance").length;
    const trackedBases = Object.keys(after.factions.alliance!.bases).length;
    expect(trackedBases).toBe(basesOnBoard);
  });

  it("is deterministic for a given seed", () => {
    const make = () => {
      const s = newGame({ seed: 42 });
      return {
        ...s,
        map: {
          clearings: {
            ...s.map.clearings,
            1: {
              warriors: { marquise: 4, eyrie: 4 },
              buildings: [],
              tokens: [],
              vagabondHere: false,
            },
          },
        },
      };
    };
    const a = resolveCombat(make(), {
      clearing: 1,
      attacker: "marquise",
      defender: "eyrie",
    });
    const b = resolveCombat(make(), {
      clearing: 1,
      attacker: "marquise",
      defender: "eyrie",
    });
    expect(a.scores).toEqual(b.scores);
    expect(a.map.clearings[1]!.warriors).toEqual(b.map.clearings[1]!.warriors);
  });

  it("rejects battle declarations when the attacker has no warriors in the clearing", () => {
    let s = newGame({ seed: 19 });
    s = {
      ...s,
      activeIndex: s.factionOrder.indexOf("marquise"),
      phase: "daylight",
      map: {
        clearings: {
          ...s.map.clearings,
          1: {
            warriors: { marquise: 0, eyrie: 3 },
            buildings: [],
            tokens: [],
            vagabondHere: false,
          },
        },
      },
    };

    const next = reduce(s, {
      kind: "combat.declare",
      clearing: 1,
      attacker: "marquise",
      defender: "eyrie",
    });

    expect(next).toBe(s);
    expect(next.pendingPrompts).toHaveLength(0);
    expect(next.map.clearings[1]!.warriors).toEqual({ marquise: 0, eyrie: 3 });
  });

  it("sequences optional combat prompts in deterministic order", () => {
    const brutalId = cardIdByName("Brutal Tactics");
    const sappersId = cardIdByName("Sappers");
    const attackerArmorersId = cardIdByName("Armorers");

    let s = newGame({ seed: 13 });
    s = {
      ...s,
      activeIndex: s.factionOrder.indexOf("marquise"),
      phase: "daylight",
      hands: {
        marquise: [],
        eyrie: [],
        alliance: [],
        vagabond: [],
      },
      craftedPersistents: [
        { faction: "marquise", cardId: brutalId },
        { faction: "marquise", cardId: attackerArmorersId },
        { faction: "eyrie", cardId: sappersId },
      ],
      map: {
        clearings: {
          ...s.map.clearings,
          1: {
            warriors: { marquise: 5, eyrie: 5 },
            buildings: [],
            tokens: [],
            vagabondHere: false,
          },
        },
      },
    };

    let next = reduce(s, {
      kind: "combat.declare",
      clearing: 1,
      attacker: "marquise",
      defender: "eyrie",
    });

    let prompt = next.pendingPrompts[0];
    expect(prompt?.kind).toBe("combat.optionalEffect");
    expect(prompt?.faction).toBe("marquise");
    expect((prompt?.payload as { effect: string }).effect).toBe("useBrutalTactics");

    next = reduce(next, {
      kind: "combat.chooseOptional",
      faction: "marquise",
      effect: "useBrutalTactics",
      use: false,
    });

    prompt = next.pendingPrompts[0];
    expect(prompt?.kind).toBe("combat.optionalEffect");
    expect(prompt?.faction).toBe("eyrie");
    expect((prompt?.payload as { effect: string }).effect).toBe("useSappers");

    next = reduce(next, {
      kind: "combat.chooseOptional",
      faction: "eyrie",
      effect: "useSappers",
      use: false,
    });

    prompt = next.pendingPrompts[0];
    expect(prompt?.kind).toBe("combat.optionalEffect");
    expect(prompt?.faction).toBe("marquise");
    expect((prompt?.payload as { effect: string }).effect).toBe("useAttackerArmorers");
  });

  it("applies chosen optional effects and skips declined ones", () => {
    const brutalId = cardIdByName("Brutal Tactics");

    const makeBase = () => {
      let s = newGame({ seed: 21 });
      s = {
        ...s,
        activeIndex: s.factionOrder.indexOf("marquise"),
        phase: "daylight",
        hands: {
          marquise: [],
          eyrie: [],
          alliance: [],
          vagabond: [],
        },
        craftedPersistents: [{ faction: "marquise", cardId: brutalId }],
        map: {
          clearings: {
            ...s.map.clearings,
            1: {
              warriors: { marquise: 5, eyrie: 5 },
              buildings: [],
              tokens: [],
              vagabondHere: false,
            },
          },
        },
      };
      return s;
    };

    const runWithChoice = (useBrutal: boolean) => {
      let s = reduce(makeBase(), {
        kind: "combat.declare",
        clearing: 1,
        attacker: "marquise",
        defender: "eyrie",
      });
      const p = s.pendingPrompts[0];
      expect(p?.kind).toBe("combat.optionalEffect");
      expect((p?.payload as { effect: string }).effect).toBe("useBrutalTactics");
      s = reduce(s, {
        kind: "combat.chooseOptional",
        faction: "marquise",
        effect: "useBrutalTactics",
        use: useBrutal,
      });
      expect(s.pendingPrompts.length).toBe(0);
      return s;
    };

    const used = runWithChoice(true);
    const skipped = runWithChoice(false);

    expect(used.scores.eyrie).toBe(skipped.scores.eyrie + 1);
    const usedLog = used.log[used.log.length - 1]?.message ?? "";
    const skippedLog = skipped.log[skipped.log.length - 1]?.message ?? "";
    expect(usedLog.includes("Brutal Tactics")).toBe(true);
    expect(skippedLog.includes("Brutal Tactics")).toBe(false);
  });

  it("ends battle immediately when defender ambush wipes attacker warriors", () => {
    const foxAmbush = cardIdByName("Ambush! (fox)");
    let s = newGame({ seed: 33 });
    s = {
      ...s,
      activeIndex: s.factionOrder.indexOf("marquise"),
      phase: "daylight",
      hands: {
        ...s.hands,
        eyrie: [foxAmbush],
      },
      map: {
        clearings: {
          ...s.map.clearings,
          1: {
            warriors: { marquise: 2, eyrie: 3 },
            buildings: [],
            tokens: [],
            vagabondHere: false,
          },
        },
      },
    };

    let next = reduce(s, {
      kind: "combat.declare",
      clearing: 1,
      attacker: "marquise",
      defender: "eyrie",
    });
    expect(next.pendingPrompts[0]?.kind).toBe("combat.defenderAmbush");

    next = reduce(next, {
      kind: "combat.playAmbush",
      faction: "eyrie",
      cardId: foxAmbush,
    });

    expect(next.pendingPrompts.length).toBe(0);
    expect(next.battleOverlay?.endedByAmbush).toBe(true);
    expect(next.battleOverlay?.dice).toEqual([0, 0]);
    expect(next.rngStep).toBe(s.rngStep);
    expect(next.factions.marquise?.warriorSupply).toBe((s.factions.marquise?.warriorSupply ?? 0) + 2);
    expect(next.log.some((e) => e.message.includes("(no dice rolled)"))).toBe(true);
    expect(next.log.some((e) => e.message.includes("wins the battle immediately"))).toBe(true);
  });

  it("offers attacker a counter-ambush before a wiping defender ambush resolves", () => {
    const foxAmbush = cardIdByName("Ambush! (fox)");
    let s = newGame({ seed: 34 });
    s = {
      ...s,
      activeIndex: s.factionOrder.indexOf("marquise"),
      phase: "daylight",
      hands: {
        ...s.hands,
        marquise: [foxAmbush],
        eyrie: [foxAmbush],
      },
      map: {
        clearings: {
          ...s.map.clearings,
          1: {
            warriors: { marquise: 2, eyrie: 3 },
            buildings: [],
            tokens: [],
            vagabondHere: false,
          },
        },
      },
    };

    let next = reduce(s, {
      kind: "combat.declare",
      clearing: 1,
      attacker: "marquise",
      defender: "eyrie",
    });
    expect(next.pendingPrompts[0]?.kind).toBe("combat.defenderAmbush");

    next = reduce(next, {
      kind: "combat.playAmbush",
      faction: "eyrie",
      cardId: foxAmbush,
    });
    expect(next.pendingPrompts[0]?.kind).toBe("combat.attackerCounterAmbush");

    next = reduce(next, {
      kind: "combat.playAmbush",
      faction: "marquise",
      cardId: foxAmbush,
    });

    expect(next.pendingPrompts.length).toBe(0);
    expect(next.battleOverlay?.attackerAmbushCardId).toBe(foxAmbush);
    expect(next.battleOverlay?.endedByAmbush).not.toBe(true);
    expect(next.factions.marquise?.warriorSupply).toBe(s.factions.marquise?.warriorSupply ?? 0);
  });

  it("offers and accepts a bird ambush for a non-bird clearing", () => {
    const birdAmbush = cardIdByName("Ambush! (bird)");
    let s = newGame({ seed: 41 });
    s = {
      ...s,
      activeIndex: s.factionOrder.indexOf("marquise"),
      phase: "daylight",
      hands: { ...s.hands, marquise: [], eyrie: [birdAmbush] },
      map: {
        clearings: {
          ...s.map.clearings,
          1: emptyClearing({ warriors: { marquise: 3, eyrie: 2 } }),
        },
      },
    };

    const prompted = reduce(s, {
      kind: "combat.declare", clearing: 1, attacker: "marquise", defender: "eyrie",
    });
    expect(prompted.pendingPrompts[0]?.kind).toBe("combat.defenderAmbush");

    const resolved = reduce(prompted, {
      kind: "combat.playAmbush", faction: "eyrie", cardId: birdAmbush,
    });
    expect(resolved.hands.eyrie).not.toContain(birdAmbush);
    expect(resolved.battleOverlay?.defenderAmbushCardId).toBe(birdAmbush);
  });

  it("holds battle on defender ambush prompt until the defender responds", () => {
    const foxAmbush = cardIdByName("Ambush! (fox)");
    let s = newGame({ seed: 77 });
    s = {
      ...s,
      activeIndex: s.factionOrder.indexOf("marquise"),
      phase: "daylight",
      hands: { ...s.hands, eyrie: [foxAmbush] },
      map: {
        clearings: {
          ...s.map.clearings,
          1: emptyClearing({ warriors: { marquise: 3, eyrie: 2 } }),
        },
      },
    };

    const prompted = reduce(s, {
      kind: "combat.declare",
      clearing: 1,
      attacker: "marquise",
      defender: "eyrie",
    });

    expect(prompted.pendingPrompts[0]?.kind).toBe("combat.defenderAmbush");
    expect(prompted.battleOverlay?.status).toBe("defender-ambush-prompt");
  });

  it("only offers a counter-ambush when the attacker has a matching-suit or bird ambush", () => {
    const foxAmbush = cardIdByName("Ambush! (fox)");
    const mouseAmbush = cardIdByName("Ambush! (mouse)");
    let s = newGame({ seed: 78 });
    s = {
      ...s,
      activeIndex: s.factionOrder.indexOf("marquise"),
      phase: "daylight",
      hands: { ...s.hands, marquise: [mouseAmbush], eyrie: [foxAmbush] },
      map: {
        clearings: {
          ...s.map.clearings,
          1: emptyClearing({ warriors: { marquise: 3, eyrie: 2 } }),
        },
      },
    };

    const prompted = reduce(s, {
      kind: "combat.declare",
      clearing: 1,
      attacker: "marquise",
      defender: "eyrie",
    });
    const defenderPlayed = reduce(prompted, {
      kind: "combat.playAmbush",
      faction: "eyrie",
      cardId: foxAmbush,
    });
    expect(defenderPlayed.pendingPrompts[0]?.kind).not.toBe("combat.attackerCounterAmbush");
    expect(defenderPlayed.battleOverlay?.defenderAmbushCardId).toBe(foxAmbush);
  });

  it("creates a fresh battle overlay id for each battle", () => {
    let s = newGame({ seed: 49 });
    s = {
      ...s,
      map: {
        clearings: {
          ...s.map.clearings,
          1: {
            warriors: { marquise: 4, eyrie: 4 },
            buildings: [],
            tokens: [],
            vagabondHere: false,
          },
        },
      },
    };

    const one = resolveCombat(s, {
      clearing: 1,
      attacker: "marquise",
      defender: "eyrie",
    });
    const firstId = one.battleOverlay?.id;
    expect(firstId).toBeTruthy();

    const two = resolveCombat(one, {
      clearing: 1,
      attacker: "marquise",
      defender: "eyrie",
    });
    const secondId = two.battleOverlay?.id;
    expect(secondId).toBeTruthy();
    expect(secondId).not.toBe(firstId);
  });

  it("prompts defender to choose cardboard removal order when no warriors remain", () => {
    let s = newGame({ seed: 57 });
    s = {
      ...s,
      factions: {
        ...s.factions,
        marquise: {
          ...s.factions.marquise!,
          keep: { clearing: 1 },
          buildings: { sawmill: 1, workshop: 0, recruiter: 0 },
        },
      },
      map: {
        clearings: {
          ...s.map.clearings,
          1: {
            warriors: { eyrie: 1, marquise: 0 },
            buildings: [{ faction: "marquise", kind: "sawmill" }],
            tokens: [{ faction: "marquise", kind: "keep" }],
            vagabondHere: false,
          },
        },
      },
    };

    let next = reduce(s, {
      kind: "combat.declare",
      clearing: 1,
      attacker: "eyrie",
      defender: "marquise",
    });
    expect(next.pendingPrompts[0]?.kind).toBe("combat.removalPieces");
    const removalPayload = next.pendingPrompts[0]!.payload as {
      available: Array<{ id: string; kind: string; category: 'building' | 'token' }>;
      side: 'attacker' | 'defender';
    };
    const keepId = removalPayload.available.find((p) => p.category === 'token' && p.kind === 'keep')?.id;
    expect(keepId).toBeTruthy();

    next = reduce(next, {
      kind: "combat.chooseRemovalPieces",
      faction: "marquise",
      side: removalPayload.side,
      pieceIds: [keepId!],
    });

    expect(next.factions.marquise?.keep).toBeUndefined();
    expect(next.map.clearings[1]!.tokens.some((t) => t.kind === "keep")).toBe(false);
  });

  it("prompts and resolves Marquise Field Hospitals after Marquise warrior losses", () => {
    const foxAmbush = cardIdByName("Ambush! (fox)");
    const rabbitAmbush = cardIdByName("Ambush! (rabbit)");
    let s = newGame({ seed: 61 });
    s = {
      ...s,
      factions: {
        ...s.factions,
        marquise: {
          ...s.factions.marquise!,
          keep: { clearing: 5 },
        },
      },
      hands: {
        ...s.hands,
        marquise: [foxAmbush, rabbitAmbush],
      },
      map: {
        clearings: {
          ...s.map.clearings,
          1: {
            warriors: { eyrie: 3, marquise: 2 },
            buildings: [],
            tokens: [],
            vagabondHere: false,
          },
          5: {
            ...s.map.clearings[5]!,
            warriors: { ...(s.map.clearings[5]!.warriors ?? {}), marquise: 0 },
            tokens: [{ faction: "marquise", kind: "keep" }],
          },
        },
      },
    };

    let next = resolveCombat(s, {
      clearing: 1,
      attacker: "eyrie",
      defender: "marquise",
      attackerAmbush: "__test_attacker_ambush__",
    });
    expect(next.pendingPrompts[0]?.kind).toBe("combat.fieldHospitals");

    const rejected = reduce(next, {
      kind: "combat.resolveFieldHospitals",
      faction: "marquise",
      cardId: rabbitAmbush,
    });
    expect(rejected.pendingPrompts[0]?.kind).toBe("combat.fieldHospitals");
    expect(rejected.hands.marquise).toContain(rabbitAmbush);

    const keepBefore = next.map.clearings[5]!.warriors.marquise ?? 0;
    next = reduce(next, {
      kind: "combat.resolveFieldHospitals",
      faction: "marquise",
      cardId: foxAmbush,
    });
    const keepAfter = next.map.clearings[5]!.warriors.marquise ?? 0;
    expect(keepAfter).toBeGreaterThan(keepBefore);
    expect(next.hands.marquise.includes(foxAmbush)).toBe(false);
  });
});
