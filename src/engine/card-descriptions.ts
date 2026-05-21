// One-line, glanceable summaries of what each card does. The engine doesn't
// fully implement every effect, but the description tells the player what
// the card *would* do in the real game so they can make informed choices.
//
// Keyed by card name (multiple printed copies of the same card share a
// description). Categories fall back to a generic blurb when a card isn't
// listed explicitly.

import type { Card } from './cards';

const BY_NAME: Record<string, string> = {
  // Ambushes — one per suit. Played during battle in matching-suit clearings.
  'Ambush! (fox)':    'Battle: deal 2 hits if attacked in a fox clearing.',
  'Ambush! (mouse)':  'Battle: deal 2 hits if attacked in a mouse clearing.',
  'Ambush! (rabbit)': 'Battle: deal 2 hits if attacked in a rabbit clearing.',
  'Ambush! (bird)':   'Battle: deal 2 hits if attacked in any clearing.',

  // Persistent effects.
  'Armorers':           'Defending: discard to ignore all of the attacker\'s rolled hits.',
  'Brutal Tactics':     'Attacking: deal +1 hit; defender scores 1 VP.',
  'Royal Claim':        'Birdsong: discard to score 1 VP per clearing you rule.',
  'Sappers':            'Defending: discard to deal +1 hit before the attacker rolls.',
  'Scouting Party':     'Your attacks ignore Ambush cards.',
  'Codebreakers':       'Daylight: peek at another player\'s hand.',
  'Tax Collector':      'Daylight: remove one of your warriors from the board to draw a card.',
  'Cobbler':            'Evening: take an extra Move action.',
  'Command Warren':     'Daylight: take an extra Battle action.',
  'Better Burrow Bank': 'Birdsong: you and another player each draw a card.',
  'Stand and Deliver!': 'Birdsong: take a random card from another player\'s hand.',

  // Favors — board-wipe in matching-suit clearings.
  'Favor of the Foxes':   'Remove all non-fox pieces from every fox clearing. Score 1 VP per piece removed.',
  'Favor of the Mice':    'Remove all non-mouse pieces from every mouse clearing. Score 1 VP per piece removed.',
  'Favor of the Rabbits': 'Remove all non-rabbit pieces from every rabbit clearing. Score 1 VP per piece removed.',

  // Dominance.
  'Dominance · Foxes':   'Place face up. Win if you rule 3 fox clearings at the start of your birdsong.',
  'Dominance · Mice':    'Place face up. Win if you rule 3 mouse clearings at the start of your birdsong.',
  'Dominance · Rabbits': 'Place face up. Win if you rule 3 rabbit clearings at the start of your birdsong.',
  'Dominance · Birds':   'Place face up. Win if you rule any 2 opposite-corner clearings.',

  // Item crafts (descriptions cover the *card*, not the item it produces).
  'Mousefolk Sword':    'Craft → Sword. Each sword lets the Vagabond exhaust to deal a hit.',
  'Foxfolk Steel':      'Craft → Sword. Each sword lets the Vagabond exhaust to deal a hit.',
  'Arms Trader':        'Craft → Sword.',
  'Sword':              'Craft → Sword.',
  'Crossbow':           'Craft → Crossbow. Lets the Vagabond strike at range.',
  'Smithy':             'Craft → Hammer. Hammers repair damaged items.',
  'A Visit to Friends': 'Craft → Boots. Boots let the Vagabond move and slip without exhausting.',
  'Travel Gear':        'Craft → Boots.',
  'Gently Used Knapsack':'Craft → Bag. Bags raise the Vagabond\'s hand-size cap.',
  'Root Tea':           'Craft → Tea. Each tea refreshes one extra exhausted item at birdsong.',
  'Anvil':              'Craft → Coin. Coins let the Vagabond draw extra cards on evening.',
  'Bank Check':         'Craft → Coin.',
  'Investments':        'Craft → Torch. Torches let the Vagabond explore ruins.',
  'Mouse-in-a-Sack':    'Craft → Bag.',
  'Royal Decree':       'Eyrie filler — adds a bird card to the deck.',
};

export function cardDescription(card: Card): string {
  return BY_NAME[card.name] ?? GENERIC_BY_CATEGORY[card.category];
}

const GENERIC_BY_CATEGORY: Record<Card['category'], string> = {
  ambush:     'Battle: negate the attacker\'s hits.',
  dominance:  'Place face up to chase a non-VP win condition.',
  item:       'Craft to add this item to the supply.',
  persistent: 'Ongoing effect while in play.',
  immediate:  'One-shot effect, then discard.',
  favor:      'Wipe non-suit pieces from matching clearings.',
};
