# Rulebook coverage

A snapshot of which official-rule actions are reachable in the UI and which
gameplay details remain as follow-ups. Updated 2026-05-22.

## What's covered

### Marquise de Cat

| Action | UI | Notes |
|---|---|---|
| Place wood (birdsong) | ✓ | `Place wood` button |
| Build (sawmill / workshop / recruiter) | ✓ | Map-driven intent. Pick a building type → click a legal clearing. Non-legal clearings dim. |
| Recruit | ✓ | One-button (auto-places at all recruiters). |
| Overwork | ✓ | Pick a card → click a matching-suit sawmill clearing. |
| March (up to 2 moves) | ✓ | Click source → click destination → count picker. Click `March` again for the second move. |
| Battle | ✓ | Map-driven intent (one button per defender). Defender-ambush prompt fires when applicable. |
| Craft (item / persistent / favor) | ✓ | Single `Craft` button + card picker. Favor cards wipe matching-suit clearings + award 1 VP per piece removed. |
| Spend bird for extra action | ✓ | Single button + card picker. |
| Discard down to hand limit | ✓ | Modal picker at end of evening. |

### Eyrie Dynasties

| Action | UI | Notes |
|---|---|---|
| Choose leader | ✓ | Button row in `EyriePanel` during birdsong (any leader, anytime). |
| Emergency Orders (empty-hand draw) | ✓ | Auto-fires on entering Eyrie birdsong with empty hand. |
| Add to Decree | ✓ | Click a Decree slot in `EyriePanel` → card picker. Slots show count + suit-pip breakdown. |
| End birdsong | ✓ | Button. |
| Resolve Decree — manual | ✓ | Per-step actions `executeRecruit / executeMove / executeBattle / executeBuild`, drained in slot order. Map highlights legal targets. Counters shown in `EyriePanel`. |
| Resolve Decree — auto | ✓ | `Resolve decree` button finishes remaining cards automatically. Turmoil fires correctly. |
| Turmoil scoring + leader cycle | ✓ | Engine. |
| Evening (score roosts, draw, discard) | ✓ | |

### Woodland Alliance

| Action | UI | Notes |
|---|---|---|
| Spread Sympathy | ✓ | Map-driven intent. |
| Revolt | ✓ | Map-driven intent. |
| Organize | ✓ | Map-driven intent. |
| Mobilize | ✓ | One button + card picker. |
| Move warriors | ✓ | Map-driven (count picker, like Marquise march). `allianceRules` counts warriors + sympathy + bases. |
| Battle | ✓ | Map-driven intent. Defender ambush prompt fires. |
| Train officer | ✓ | Button + bird-supporter picker. |
| Craft | ✓ | Button + card picker. Crafting power = sympathy on the board. Favor cards apply via the shared resolver. |
| Discard | ✓ | Same modal as everyone. |
| **Supporter pile** | ✓ | Always visible to the Alliance player only (face-down to opponents). |

### Vagabond

| Action | UI | Notes |
|---|---|---|
| Slip | ✓ | Click adjacent clearing during birdsong. |
| Move (clearing → clearing) | ✓ | Click adjacent clearing during daylight. Costs 1 boot (+1 if hostile destination). |
| **Move (forest)** | ✓ | Six forest tiles render between the clearings. Click a forest from your clearing to enter; click a bordering clearing while in a forest to exit. |
| Explore ruin | ✓ | Button when standing on a ruin with a torch. |
| Aid | ✓ | Single button + (card × faction) picker. |
| Strike | ✓ | Map-driven intent (per defender). Strike doesn't trigger the ambush prompt (not a battle). |
| Repair | ✓ | Single button + damaged-item picker. |
| Refresh | ✓ | Button. |
| Complete quest | ✓ | Engine + Quest Display refill. 9-card quest deck; +1 VP per repeat completion of the same suit. |
| Form coalition | ✓ | Allowed only with a strictly-last-place faction. Coalition victory check fires when the partner crosses 30 VP. |
| Craft | ✓ | Button + card picker. Crafting power = exhausting a face-up hammer. |
| **Item damage in combat** | ✓ | Defending against a battle damages face-up items first, then face-down items. |
| Discard | ✓ | Modal. |

### Shared mechanics

| Mechanic | UI | Notes |
|---|---|---|
| Combat dice | ✓ | Auto-rolled per the standard 0/0/1/1/2/3 die. Higher die → attacker, lower → defender. Defenseless +1 hit. |
| Defender ambush | ✓ | Marquise and Alliance battles pause on `pendingPrompts`; defender (human or bot) picks via `AmbushPrompt` modal. Hits get +2 either way. |
| Favor of the X | ✓ | Crafted by any faction with the appropriate craft power — wipes non-crafter pieces in matching-suit clearings. |
| Dominance card play | ✓ | `Play Dominance` button when active human has ≥10 VP. Sets `state.dominance`, zeros their VP track. |
| Dominance win | ✓ | `checkVictory` fires at the start of the dominance faction's next birdsong: rule 3 matching-suit clearings (or 2 opposite-corner clearings for the bird Dominance). |
| Coalition win | ✓ | Vagabond wins when their coalition partner reaches 30 VP. |
| Persistent identity (rejoin tokens) | ✓ | Sticky seats in-game; tokens persist across server restarts. |
| Hidden-info view filtering | ✓ | Opponent hands / deck order / supporters / Vagabond quest deck redacted server-side. |
| End-of-evening discard | ✓ | Per-faction `pendingDiscard` + picker modal. |
| Map legend | ✓ | Pinned to top-left of the board pane (in screen space, not the SVG). |

## Known gaps (gameplay polish, no user button to add)

These are documented places where the engine takes shortcuts. None of them
blocks a player from interacting with the rule that **does** have UI; they're
passive effects or strategic nuances we haven't wired yet.

- **Persistent card effects don't fire.** Sappers, Armorers, Brutal Tactics,
  Scouting Party, Codebreakers, Tax Collector, Cobbler, Command Warren,
  Better Burrow Bank, Stand and Deliver, and Royal Claim can all be
  crafted, but their effects are placeholders.
- **Eyrie battles + Vagabond strike** skip the defender-ambush prompt. Only
  Marquise and Alliance battles trigger it.
- **Attacker counter-ambush.** Real rules let the attacker cancel the
  defender's ambush by spending a matching ambush of their own.
- **Outrage.** When Alliance sympathy is removed by an enemy, the attacker
  must give the Alliance a matching-suit card (or draw one to give).
- **Vagabond character abilities.** Thief's "steal a card" daylight action,
  Tinker's bonus draw, and Ranger's hostile-cost bypass aren't reflected
  in the legal-actions list yet.
- **Quest deck draw action.** The quest display refills automatically after
  a completion; there's no explicit "draw a quest" button (real rules let
  the Vagabond spend an action to refresh the display).
- **Eyrie bot still Turmoils** at ~5 / game average on hard seeds. Engine
  fix (smarter move destination) reduced this from ~6.4 but it's not zero.

## How to extend

- New per-faction actions go under `src/engine/factions/<name>/{actions,reducer,state}.ts`.
  Surface them via `XxxLegalActions(state)`. The dispatcher in
  `src/engine/state.ts` routes by the action-kind prefix.
- UI: collapse multi-target actions into a single button + picker using the
  pattern shared by Overwork / Mobilize / Craft / Aid / Train / Dominance
  in `src/ui/ActionBar.tsx`. For map-targeted actions, extend the
  `MapIntent` union in `src/ui/Board.tsx` and add a case to `matchIntent`.
- Pause-and-respond mechanics use `state.pendingPrompts`. See
  `combat.declareBattle` / `resolveAmbushPrompt` and `getLegalActions`'s
  prompt short-circuit for the pattern.
