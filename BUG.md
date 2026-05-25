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

## Marquise

- [x] It does not seem to let me build my cards
  - Fixed: `marquiseLegalActions` now generates `marquise.craft` legal actions based on workshop crafting power vs card cost. The "Craft" button now appears in daylight when workshops are in play and matching cards are in hand.

