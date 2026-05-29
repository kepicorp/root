# Bug

This is a list of bugs and features, sorted by global mechanics or faction.

## Open

### General

- [x] The card royal dominance require 4 ressources of any kind but you need at least 4 ressources.
  - Already working: `canMeetCraftCost` handles bird wildcard as "any suit"; Royal Claim only requires ruling clearings, not paying resources.
- [x] Dominance should only be taken into account at the next turn it seems (Check the rules)
  - Already correctly implemented: `checkVictory` in `loop.ts` only checks dominance during the dominance faction's own birdsong (`state.factionOrder[state.activeIndex] === state.dominance.faction` and `state.phase === 'birdsong'`).

### Vagabond

- [x] Available quest to do should be visible in the YOUR TURN during daylight
  - Fixed: completable quests now show as buttons in the Actions group of the ActionBar during daylight, with item requirements and VP displayed.
- [x] I would like to pick the item I want to refresh
  - Fixed: `onEnterBirdsong` now sets `v.pendingRefresh` instead of auto-refreshing. During birdsong the player is offered each exhausted item as a pick button plus a "Skip remaining" option. Bot handles via PRIORITY entries.
- [x] It seems that can I move between multuple clearing with the slip move. I should not be able to make two.
  - Already enforced: `v.slipped = true` is set in all slip cases and `finishVagabondTurn` resets it. (Was marked resolved previously; re-confirmed no code change needed.)
- [x] Crafting uses hammer per ressource I should not be able to craft a 3 ressources card with 2 hammers.
  - Already correctly implemented: `vagabond.craft` reducer computes `hammersNeeded` as the sum of all cost entries and exhausts that many hammers (or face-up items for Tinker). Legal actions gate on `availableCraftPower >= powerNeeded`.
- [x] Aiding Ally should score 2 VP (§9.7.a)
  - Fixed: `vagabond.aid` reducer now checks `wasAllied` before bumping the relationship; if already allied it always awards 2 VP. Aid picker VP hint updated to show +2 VP for allied factions.
- [x] The Allied status does not seem implemented here are the rules:
  - Fixed:
    - **(a) Aiding Ally** — already done: scoring 2 VP each time you Aid an Allied faction.
    - **(b) Moving with Ally** — after the Vagabond moves, `pendingAllyMove` is set if an allied faction has warriors at the source clearing. The player chooses how many to bring (count picker in ActionBar) or skips. Bot prefers bringing them.
    - **(c) Attacking with Ally** — `vagabond.battle` now accepts optional `allyFaction`. When set, max attacker hits = ally warriors in clearing + undamaged swords. ActionBar shows a "Battle [X] with [Ally] ally" button alongside the normal battle.
    - **(d) Taking Hits with Ally** — defender hits damage vagabond items first; overflow removes ally warriors. If ally warriors removed > items damaged in the same battle, that faction becomes Hostile (§9.7.d).

---

## Done

### General

- [x] When playing as a human it seems that there are still actions that are taken automatically. I should pick every actions.
  - Fixed: added a safety guard in `runOneAIAction` — the bot now explicitly refuses to dispatch any action whose kind prefix matches the human player's faction (e.g. `marquise.*` actions can never be auto-dispatched when the human plays Marquise). The root cause could not be reproduced from static analysis but this guard prevents it regardless.
- [x] Card suit indicators (fox/rabbit/mouse/bird) were inconsistent — hard to distinguish colored dots in pickers and no indicator on art cards.
  - Fixed: all card pickers (ActionBar + Eyrie decree) now show a colored suit name label next to the dot; art cards in Hand now show a small colored badge in the corner.
- [x] Give the power of a card like better burrow bank even if I have not bought it.
  - Fixed: Better Burrow Bank (and other persistent cards) can now be activated from `craftedPersistents` — once crafted it stays in play and can be used each birdsong without discarding. Hand-play version still discards as before.
- [x] I would like to see the list of each player bought card and power like better burrow banks or brutal tactics if they bought the card
  - Fixed: all four faction panels now show a "Crafted cards" section listing every persistent card the faction has crafted, with suit colour indicators.
- [x] Cards like Stand and Deliver, Royal Claim, Tax Collector, Command Warren, Codebreakers, Cobbler, Better Burrow Bank should only grant their power after being crafted, not just from being in hand.
  - Fixed: all `category: 'persistent'` cards are now skipped entirely in the hand loop of `cardEffectLegalActions`. Their reducers now gate on `hasCraftedPersistent` instead of `hasCard`, and no longer discard the card on use (persistent cards stay in play).
- [x] Some cards are still with the wrong UI like "Travel Gear" for Mouse suit that show Fox suite UI.
  - Fixed: `cardArt()` now accepts a full `Card` object instead of just the name. The `CDN_CARD_MAP` was keyed on card name alone, so all Travel Gear cards mapped to the Fox image. Added suit-variant keys (e.g., `'Travel Gear (mouse)'`) so each variant maps to its correct CDN image. Same fix applied to Crossbow, Root Tea, and all other multi-suit item cards. `Hand.tsx` updated to pass the full Card object.
- [x] Crafted cards are not visible maybe we can add them to the UI on the right side as small card under the description of the faction. Crafted card should also be removed from hand and put in the new area. The power of the card should then be granted to the player. When I mouse over the small card I should see it big in front of me the same way we currently do with the hand. Feel free to ask me clarifying questions.
  - Fixed: `CraftedCards` component now shows both persistent cards (with thumbnail art and hover-zoom matching the Hand component) and item badges from `craftedItemLog`. Persistent cards are already removed from hand on craft. Hover over a crafted card thumbnail to see it full-size, same as hand cards.
- [x] For factions that can craft items you should be able to see them also on the faction details UI on the left side visible for everyone.
  - Fixed: `craftedItemLog` added to `GameState`; Marquise and Alliance `craft` reducers push each crafted item to the log. Faction panels can now filter `state.craftedItemLog` to show their items.
- [x] the max hand count does not seem to be taken into account as I had 8 card in hand during an evening phase. card crafted should not be visible in the hand but in the UI next to the factions details on the left side.
  - Fixed: `advancePhase` (triggered by the "Advance phase →" button) now refuses to advance when the active faction has a pending discard, pending item removal, pending relationship cost, or pending outrage — so the player can no longer skip the discard step. `Hand.tsx` now shows `(current/limit)` — e.g. `(3/5)` or `(4/6)` for Vagabond with bags. Crafted persistent cards are removed from hand on craft and shown in the faction panel via `CraftedCards`.
- [x] when moving (or marching) inside a controled alliance spot with sympathy I should be prompted to give a card to supporter group following the ruleset (matching the clearing suit or a bird or a supported is added from the deck)
  - Fixed: `pendingOutrage` state in `GameState` is set when Marquise or Eyrie move into a clearing with Alliance sympathy. Legal actions for the moving faction are gated until outrage is resolved: player picks a matching-suit or bird card to give to Alliance supporters, or if no matching card exists, Alliance draws from the deck. ActionBar shows an inline picker.
- [x] Not all cards are downloaded with the `download-assets` like card root tea fox or travel gear fox.
  - Fixed: `cardArt()` now tries `slug(variantName)` (e.g. `root-tea-fox.webp`) before `slug(baseName)` when looking in `raw/cards/`. The download script already saved files under variant slugs; the lookup just wasn't checking the right filename first.

### Dominance

- [x] It is saying I can use dominance when I don't have a dominance card in hand.
  - Fixed: dominance cards are now shuffled into the shared deck; the button only appears when you have one in hand (≥10 VP required to play it).

### Alliance

- [x] You are not supposed to be able to spread alliance on a clearing with the marquise keep on it.
  - Fixed: `allianceLegalActions` now skips clearings with a keep token.
- [x] Add a wood counter to know how much wood I can spend.
  - Fixed: Marquise panel now shows both "Wood supply" (tokens not yet placed) and "Wood on board" (placed tokens spendable for building). Note: this is a Marquise mechanic; Alliance does not use wood.
- [x] I should only be able to craft item if I have enough sympathy in the clearings. I can't use sympathy on a town twice in the same turn so if I have own sympathy in one two rabbits I can't craft an item for 1 rabbit and another one for two.
  - Fixed: `AllianceState` now tracks `craftedThisTurn`; craft legal actions and the reducer compute remaining sympathy power per suit (total sympathy pips minus already-consumed pips this turn) before offering or allowing each craft.
- [x] Spread Sympathy should use the suit card first then the bird card.
  - Fixed: supporters are sorted by exact-suit first, bird (wild) last before slicing to the required count. Same fix applied to Revolt.
- [x] No action available in evening in spite of having officers
  - Fixed: per §8.6.1, Alliance Military Operations (Move, Battle, Organize, Recruit) now appear during Evening, not Daylight. `alliance.endDaylight` no longer zeroes `daylightActionsLeft` — remaining officer actions carry into evening. `alliance.evening` (draw+discard) is always available so the player can skip remaining ops. Added `alliance.recruit` action (place a warrior in any clearing with a base).
- [x] Still no actions availabe in evening in spite of having officers. I just see the button end evening, could the button not be visible ? I should at least be able to move bottle organize or recruit
  - Fixed: old `endDaylight` zeroed `daylightActionsLeft`; saved games had `actions=0` in evening even with officers. `endDaylight` now resets to full officer count. `migrateState` restores the count for states already stuck. `alliance.move` added to the map-hint check so "Click the map to move warriors" appears during Alliance evening.

### Eyrie

- [x] what is the goal of the resolved decree button. I should just be able to do the action and if not go in tumroil.
  - Fixed: `eyrieLegalActions` no longer offers `eyrie.resolveDecree` upfront. Execute actions (`eyrie.executeRecruit`, `eyrie.executeMove`, `eyrie.executeBattle`, `eyrie.executeBuild`) are offered directly in daylight. `eyrie.resolveDecree` now only appears when no execute action is possible and the decree has unresolved slots — it auto-triggers turmoil. The button is labelled "Trigger Turmoil" in the ActionBar so the intent is clear.
- [x] Verify the rules but I don't think you can build two roost in the same clearing
  - Fixed: `executeBuild`, `eyrieLegalActions`, and `findSlotTarget` all now block building a roost in a clearing that already has one.
- [x] It seems that I can't add a bird card to a decree.
  - Fixed: `canAdd` in EyriePanel now requires `!e.needsLeaderChoice && e.cardsAddedThisBirdsong < 2`. Previously the slot buttons were enabled even when the leader hadn't been confirmed or the max adds were reached, so dispatching a card silently failed. Per rules the Eyrie must add 1 card per birdsong and may add a second; the limit in the reducer was raised to 2 accordingly. The leader picker uses a separate `isEyrieBirdsong` flag so it remains visible when leader confirmation is pending.
- [x] craft does not seem to be implemented for them. They should be able to build by using one resources for each roost in specific ressources
  - Fixed: `eyrie.craft` action added. Eyrie crafts during Daylight using roost power (1 pip per roost, by clearing suit). `craftedThisTurn` tracks used power within a turn. Craft button appears in ActionBar alongside Marquise/Alliance/Vagabond craft.

### Marquise

- [x] It does not seem to let me build my cards
  - Fixed: `marquiseLegalActions` now generates `marquise.craft` legal actions based on workshop crafting power vs card cost. The "Craft" button now appears in daylight when workshops are in play and matching cards are in hand.
- [x] The cost of card is not taken into account, I can play a card in my hand if I don't have the workshop required. Are you sure you are taking into account the fox, rabbit and mice cost of each cards ?
  - Fixed: `marquise.craft` reducer now verifies per-suit workshop power (minus already-used power this turn) before allowing the craft. `marquiseLegalActions` also subtracts already-consumed workshop power from `craftedThisTurn` so previously-crafted cards are accounted for.
- [x] can you indicate the cost in wood to build a new buiilding ?
  - Fixed: build intent buttons in ActionBar now show the wood cost, e.g. "Build Sawmill (2 wood)".
- [x] I get the right to use bird card for extra action in spite of not having any bird cards in my hand (check bird_marquise.png screenshot)
  - Fixed: `marquiseLegalActions` now excludes dominance cards (category `'dominance'`) from the bird-card-for-extra-action check. The Bird Dominance card drawn from the shared deck was being offered as a spendable bird card.
- [x] can you show me the building button but greyed out with the cost in wood to know how much would I am missing ?
  - Fixed: ActionBar now shows disabled building buttons (opacity 0.45) for buildings that are slot-available but have insufficient wood, with a "need N more wood" detail label.
- [x] on my third turn I could not place wood. I should be able to place wood until I have no more wood token available. So if I could place 4 wood but have only 2 wood available it should place just so 2 wood not disable the action.
  - Fixed: `marquise.placeWood` now checks `m.wood > 0` before each token and stops early when supply is exhausted. `payWood` now returns spent tokens to `m.wood`. The action always advances birdsong even when wood=0.
- [x] at some point on turn 14 I had no action available during daylight which should not be possible. Maybe add a debug panel where I can see explicitely the counter and all
  - Fixed (root cause): pending-discard stuck state was the culprit — now all faction `legalActions` check `pendingDiscard > 0` before phase, so discards are always resolvable. Debug panel added: a collapsed "🔍 debug" toggle at the bottom of the ActionBar shows turn, phase, active faction, all per-faction counters (actions left, wood, discard, march, officers), pending outrage, and the full list of current legal action kinds with counts.
- [x] I should be able to spend any bird card for an extra action even a dominance card. Verify with the official rule.
  - Fixed: `marquiseLegalActions` no longer excludes dominance-category bird cards from the `spendBirdForExtra` check. Any bird-suit card is now valid.
- [x] I would like to see a counter with all the actions I have taken and how many are left during daylight.
  - Fixed: ActionBar now shows "Actions left: N" for Marquise, Alliance, and Vagabond during the daylight phase.
  - [x] I could not find the "Action left: N" counter for Marquise.
    - Fixed: counter now shows unconditionally during Marquise daylight (was hidden when actions=0).
- [x] It seems that was able to do more than 3 actions during my turns as Marquise here are the logs:
  - Fixed: `marquise.craft` now checks `daylightActionsLeft <= 0` and decrements on success. Crafting was previously free (unlimited). Craft actions are now inside the `daylightActionsLeft > 0` guard in legal actions.
- [x] I should always be able to discard a bird for an extra action even when I spent all my actions (currently the menu disapear)
  - Fixed: `spendBirdForExtra` legal action is now generated outside the `daylightActionsLeft > 0` guard, so it's always offered during Marquise daylight regardless of remaining actions.

### Vagabond

- [x] When exploring a ruin it should be removed from the map and add a slot. It should also give me an item according to the ruin, can you check the rules to make it work ?
  - Fixed: each ruin clearing now has a specific hidden item (clearing 3→crossbow, 6→hammer, 8→boots, 11→sword). Exploring: removes the ruin marker from the map, adds +1 building slot to that clearing, gives the specific item face-up. The `exploredRuins: ClearingId[]` array tracks which clearings have been explored (same ruin can't be explored twice).
- [x] Aiding a faction should improve the relationship can I see how much more help is needed to increase relationship status ? Can I also see all item crafted per player ? Make the Relationship status UI better.
  - Fixed: VagabondPanel now shows a full relationship ladder (Hostile → Indiff. → I → II → III → Allied) for each faction, with the current position highlighted and "+1 aid → next" hint. Crafted cards were already shown via the CraftedCards component.
- [x] Have you implemented the Allied faction bonuses ?
  - Fixed/clarified: (1) Moving into allied territory never costs extra boots — already enforced. (2) Cannot battle/strike an allied faction — already enforced. (3) Attacking (removing pieces via battle or strike) now correctly sets the relationship to hostile. (4) Killing pieces from a hostile faction gives +1 VP — already enforced. (5) Only HOSTILE (not indifferent) warriors in a destination clearing cost an extra boot — bug fixed (was incorrectly treating any non-allied as hostile for movement).
- [x] Need to click on refresh item to take action even if item are not exhausted
  - Fixed: item refresh now happens automatically in `onEnterBirdsong` for the Vagabond (3 + face-up tea items refreshed). The birdsong button is renamed "Start daylight" — it just transitions phase. No click needed when there's nothing to refresh.
- [x] Aid should give victory points can you show on the action button how much I would score and keep track of it
  - Fixed: each Aid now scores VP equal to the numeric relationship level reached after improving (I=1, II=2, III=3, Allied=4; hostile/indifferent=0). VP is logged and shown as a gold "+N VP" badge in the aid picker.
- [x] Is the tea action implemented ?
  - Yes: Tea (face-up) gives +1 item refresh per tea during birdsong. This now happens automatically in `onEnterBirdsong`. Bag gives +1 hand limit during evening. Coin gives +1 card draw during evening. All three passive item bonuses are implemented.
- [x] Vagabond crafting did not check clearing suit vs card cost, and crafted item cards gave the item to the shared supply instead of the Vagabond
  - Fixed: `vagabond.craft` now verifies clearing suit matches card cost (bird-cost accepts any suit), exhausts one item per cost point, and adds the item directly to `v.items` (face-up if track room, else satchel). Legal actions check total available power vs needed cost.
- [x] Character-specific abilities not implemented (Thief/Tinker/Ranger all played the same)
  - Fixed: **Thief** "Nimble" — never pays extra boot to move into/exit forest to hostile clearings (1 boot always sufficient). **Thief** "Steal" — new `vagabond.stealCard` action: exhaust 1 item, take a random card from a hostile faction's hand, improve relationship. **Tinker** "Tinkerer" — when crafting, any face-up item provides crafting power (not just hammers). **Ranger** "Hideout" — new `vagabond.placeHideout` (daylight, 1 action) + `vagabond.slipToHideout` (birdsong, slip to camp clearing for free).
- [x] Vagabond should be able to battle/strike an ally (or any non-hostile faction) by paying a card instead of automatically becoming hostile
  - Fixed: removed the blanket allied-block on `vagabond.battle` and `vagabond.strike`. After removing pieces from a non-hostile faction, `pendingRelationshipCost` is set (faction + clearing suit). Legal actions gate ALL other daylight actions until the player either discards a matching card (`vagabond.payRelationshipCost`) to preserve the relationship or clicks "Accept hostility" (`vagabond.acceptHostility`) to set the faction hostile. ActionBar shows an inline picker with matching hand cards plus the accept-hostility option. Bot prefers paying over accepting hostility.
- [x] Ruin items should be random
  - Fixed: `newGame()` now shuffles the 4 ruin items (crossbow, hammer, boots, sword) using a seeded RNG (`mulberry32(seed + 1)`) and assigns them to ruin clearings. The assigned item is stored in `ClearingState.ruinItem` so it overrides the static map defaults. The vagabond reducer reads `cl.ruinItem` first.
- [x] I can't "slip" during the birdsong phase when I start in a forest.
  - Fixed: `vagabond.slip` no longer blocks when `v.inForest`. When in a forest, slip exits to any of the forest's adjacent clearings (gated on `!v.slipped` as before). Legal actions updated to offer forest-exit slip during birdsong.
- [x] Have you properly implemented the Refresh. Flip two exhausted items face up for each T face up on the Refresh track, not counting T that you flip face up in this step. Then flip up three more exhausted items.
  - Fixed: `onEnterBirdsong` now uses `3 + 2 * teaCount` instead of `3 + teaCount` per §9.3.2.
- [x] It seems that can I move between multuple clearing with the slip move. I should not be able to make two.
  - Already enforced: `v.slipped = true` is set in all slip reducer cases (`vagabond.slip`, `vagabond.slipToHideout`, `vagabond.slipToForest`) and legal actions wrap slip offers in `if (!v.slipped)`. `finishVagabondTurn` resets it to false. No code change needed.
- [x] Special Action (Tinker Day Labor + Ranger Hideout repair)
  - Fixed: **Tinker Day Labor** — new `vagabond.dayLabor` action: exhaust 1 torch, take a card from the discard pile matching the clearing suit or bird. Legal actions offer all matching discard cards. ActionBar shows a "Day Labor" button with a discard picker. **Ranger Hideout** (special) — new `vagabond.rangerHideout` action: exhaust 1 torch, repair up to 3 damaged items, immediately end Daylight. Legal actions gate on torch + damaged items.
- [x] When you aid a faction with an item you can take it from them (Aid bonus from Crafted Items box)
  - Fixed: after `vagabond.aid`, if the target faction has crafted items in `craftedItemLog`, `pendingAidItemTake` is set on VagabondState. Legal actions then only offer `vagabond.takeAidItem` (for each available item kind) and `vagabond.skipAidItem`. ActionBar shows an inline picker with available items and a "Skip" button.
- [x] When I complete a quest I should be able to pick to draw two card or get victory points
  - Fixed: `vagabond.completeQuest` now sets `pendingQuestReward` instead of immediately awarding VP. Legal actions gate all other actions until the player dispatches `vagabond.completeQuestReward` with `choice: 'cards'` (draw 2) or `choice: 'vp'` (score `completedQuests.length` VP). ActionBar shows an inline picker.
- [x] The vagabond can form coalition only with a dominance card (rules: Instead, in games with four or more players, the Vagabond can activate a dominance card to form a coalition )
  - Fixed: `vagabond.formCoalition` legal actions now require a dominance card in hand. The reducer consumes (discards) the dominance card on coalition formation.
- [x] What is the point of the bag for vagabond ? Does it allow me to carry more item ? Do we have an item limit ? Check this and implement it according to rules.
  - Fixed: `itemCapacity` now returns `3 + faceUpBagCount` per §9.4.5 (3 base satchel slots + 1 per face-up Bag). The `pendingItemRemoval` mechanic at end of evening already enforces this limit.
