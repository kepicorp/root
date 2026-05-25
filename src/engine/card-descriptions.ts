// One-line, glanceable summaries of what each card does (October 2025 edition).
// Keyed by card name — multiple printed copies of the same card share one entry.

import type { Card } from './cards';

const BY_NAME: Record<string, string> = {
  // ── Ambushes ───────────────────────────────────────────────────────────────
  'Ambush! (fox)':    'Battle: deal 2 hits immediately if attacked in a fox clearing.',
  'Ambush! (mouse)':  'Battle: deal 2 hits immediately if attacked in a mouse clearing.',
  'Ambush! (rabbit)': 'Battle: deal 2 hits immediately if attacked in a rabbit clearing.',
  'Ambush! (bird)':   'Battle: deal 2 hits immediately if attacked in any clearing.',

  // ── Favors ────────────────────────────────────────────────────────────────
  'Favor of the Foxes':   'Craft: remove all enemy pieces from fox clearings. Score 1 VP per piece removed.',
  'Favor of the Mice':    'Craft: remove all enemy pieces from mouse clearings. Score 1 VP per piece removed.',
  'Favor of the Rabbits': 'Craft: remove all enemy pieces from rabbit clearings. Score 1 VP per piece removed.',

  // ── Item crafts ────────────────────────────────────────────────────────────
  'Foxfolk Steel':        'Craft → Sword (2 VP). Each sword lets the Vagabond deal a hit.',
  'Arms Trader':          'Craft → Sword (2 VP).',
  'Sword':                'Craft → Sword (2 VP).',
  'Crossbow':             'Craft → Crossbow (1 VP). Lets the Vagabond strike at range.',
  'Smithy':               'Craft → Hammer (2 VP). Hammers repair damaged Vagabond items.',
  'A Visit to Friends':   'Craft → Boots (1 VP). Boots let the Vagabond move without exhausting.',
  'Travel Gear':          'Craft → Boots (1 VP).',
  'Gently Used Knapsack': 'Craft → Bag (1 VP). Bags raise the Vagabond\'s hand-size cap.',
  'Mouse-in-a-Sack':      'Craft → Bag (1 VP).',
  'Root Tea':             'Craft → Tea (2 VP). Tea refreshes one extra exhausted item each birdsong.',
  'Anvil':                'Craft → Coin (2 VP). Coins let the Vagabond draw extra cards on evening.',
  'Investments':          'Craft → Torch (1 VP). Torches let the Vagabond explore ruins.',

  // ── Persistent: combat modifiers ──────────────────────────────────────────
  'Armorers':       'Battle (defender): discard to ignore ALL rolled hits taken this battle.',
  'Sappers':        'Battle (defender): discard to deal one extra hit before the attacker rolls.',
  'Brutal Tactics': 'Battle (attacker): deal one extra hit, but the defender scores 1 VP.',
  'Scouting Party': 'Passive: as attacker, your battles ignore the defender\'s ambush cards.',

  // ── Persistent: birdsong actions ──────────────────────────────────────────
  'Royal Claim':        'Birdsong: discard to score 1 VP per clearing you rule.',
  'Better Burrow Bank': 'Birdsong: draw one card; if you do, choose an enemy who also draws one card.',
  'Stand and Deliver!': 'Birdsong: take a random card from a chosen enemy\'s hand; they score 1 VP.',
  'Hidden Warrens':     'Birdsong: return to hand to move from a clearing you rule to an adjacent one.',
  'Riversteads':        'Birdsong: must draw one card per river clearing where you have warriors, then discard.',

  // ── Persistent: daylight actions ──────────────────────────────────────────
  'Tax Collector':  'Daylight: remove one of your warriors from the board to draw a card.',
  'Command Warren': 'Daylight start: may initiate one extra battle.',
  'Codebreakers':   'Daylight: look at another player\'s hand once this turn.',

  // ── Persistent: evening action ────────────────────────────────────────────
  'Cobbler': 'Evening start: may take one free move action.',

  // ── Persistent: movement helpers (return to hand) ─────────────────────────
  'Supply Train':    'After moving: return to hand to take one more move to or from your destination.',
  'Raiding Party':   'After moving: return to hand to battle in your destination.',
  'Standard Bearer': 'After attacking: return to hand to battle in the same clearing again.',
  'Tactician':       'Battle (before roll): return to hand to move once into the battle clearing.',

  // ── Persistent: combat helpers ────────────────────────────────────────────
  'Bold Leadership': 'Battle (attacker): must deal one extra hit; then return to hand or discard.',
  'Lookouts':        'Battle (defender): must place one warrior in the clearing before the roll; return to hand or discard.',
  'Mice-in-a-Bush':  'Battle (defender): discard or spend a matching-suit card to cancel the battle.',

  // ── Persistent: suit helpers ──────────────────────────────────────────────
  'Fox Squires':           'Daylight: spend this or a fox card to battle or move in a fox clearing.',
  'Mouse Squires':         'Daylight: spend this or a mouse card to battle or move in a mouse clearing.',
  'Rabbit Squires':        'Daylight: spend this or a rabbit card to battle or move in a rabbit clearing.',
  'Friend of the Foxes':   'Once per turn: treat one fox card (even ambush) as any suit.',
  'Friend of the Mice':    'Once per turn: treat one mouse card (even ambush) as any suit.',
  'Friend of the Rabbits': 'Once per turn: treat one rabbit card (even ambush) as any suit.',

  // ── Persistent: card economy ──────────────────────────────────────────────
  'Spy Network':    'Daylight: give a card to an enemy to take one of their crafted persistents.',
  'Shadow Council': 'Birdsong: spend a card to force a player to battle in a clearing you rule.',
  'Apprentice':     'Birdsong: must craft a card for free; if successful, draw a card.',

  // ── Persistent: special ───────────────────────────────────────────────────
  'Silver-Tongue':   'Once per turn: move up to two pieces as part of any one effect.',
  'Feather Rufflers':'Immediate: place two warriors in a clearing with your pieces, then discard.',
  'Brazen Demagogue':'Evening: must take a dominance card and discard a matching-suit card.',

  // ── Dominance ─────────────────────────────────────────────────────────────
  'Dominance · Foxes':   'Place face-up. Win by ruling 3 fox clearings at start of your birdsong.',
  'Dominance · Mice':    'Place face-up. Win by ruling 3 mouse clearings at start of your birdsong.',
  'Dominance · Rabbits': 'Place face-up. Win by ruling 3 rabbit clearings at start of your birdsong.',
  'Dominance · Birds':   'Place face-up. Win by ruling any 2 opposite-corner clearings.',
};

export function cardDescription(card: Card): string {
  return BY_NAME[card.name] ?? GENERIC_BY_CATEGORY[card.category];
}

const GENERIC_BY_CATEGORY: Record<Card['category'], string> = {
  ambush:     'Battle: deal 2 immediate hits (matching-suit clearing).',
  dominance:  'Place face-up to chase a non-VP win condition.',
  item:       'Craft to add this item token to the shared supply.',
  persistent: 'Ongoing effect while held in hand.',
  immediate:  'One-shot effect, then discard.',
  favor:      'Craft to remove enemy pieces from matching-suit clearings.',
};
