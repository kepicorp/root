# Bug

This is a list of bugs and features.
The are sorted by either global mechanics or faction.

## General

- [x] When playing as a human it seems that there are still actions that are taken automatically. I should pick every actions.
  - Fixed: added a safety guard in `runOneAIAction` — the bot now explicitly refuses to dispatch any action whose kind prefix matches the human player's faction (e.g. `marquise.*` actions can never be auto-dispatched when the human plays Marquise). The root cause could not be reproduced from static analysis but this guard prevents it regardless.

## Dominance

- [x] It is saying I can use dominance when I don't have a dominance card in hand.
  - Fixed: dominance cards are now shuffled into the shared deck; the button only appears when you have one in hand (≥10 VP required to play it).

## Alliance

- [x] You are not supposed to be able to spread alliance on a clearing with the marquise keep on it.
  - Fixed: `allianceLegalActions` now skips clearings with a keep token.

## Eyrie

- [x] Verify the rules but I don't think you can build two roost in the same clearing
  - Fixed: `executeBuild`, `eyrieLegalActions`, and `findSlotTarget` all now block building a roost in a clearing that already has one.
- [x] It seems that I can't add a bird card to a decree.
  - Fixed: `canAdd` in EyriePanel now also requires `!e.needsLeaderChoice && e.cardsAddedThisBirdsong === 0`. Previously the decree slot buttons were enabled even when the leader hadn't been confirmed or a card was already added, so the action dispatched but the reducer silently rejected it. The leader picker visibility now uses a separate `isEyrieBirdsong` flag so it still appears when leader confirmation is required.

## Marquise

- [x] It does not seem to let me build my cards
  - Fixed: `marquiseLegalActions` now generates `marquise.craft` legal actions based on workshop crafting power vs card cost. The "Craft" button now appears in daylight when workshops are in play and matching cards are in hand.
- [x] The cost of card is not taken into account, I can play a card in my hand if I don't have the workshop required. Are you sure you are taking into account the fox, rabbit and mice cost of each cards ?
  - Fixed: `marquise.craft` reducer now verifies per-suit workshop power (minus already-used power this turn) before allowing the craft. `marquiseLegalActions` also subtracts already-consumed workshop power from `craftedThisTurn` so previously-crafted cards are accounted for.
- [x] can you indicate the cost in wood to build a new buiilding ?
  - Fixed: build intent buttons in ActionBar now show the wood cost, e.g. "Build Sawmill (2 wood)".
- [x] I get the right to use bird card for extra action in spite of not having any bird cards in my hand (check bird_marquise.png screenshot)
  - Fixed: `marquiseLegalActions` now excludes dominance cards (category `'dominance'`) from the bird-card-for-extra-action check. The Bird Dominance card drawn from the shared deck was being offered as a spendable bird card.
