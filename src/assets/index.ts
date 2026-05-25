// Asset loader. Drops in your private Root scans from `src/assets/raw/` and
// the UI uses them automatically. Missing files fall back to Leder Games CDN
// card images, then to text/shape rendering so the app works without any art.
//
// Naming convention (case-insensitive, lower-kebab):
//
//   src/assets/raw/board/autumn.png                  → board backdrop
//   src/assets/raw/cards/<slug-of-card-name>.png     → matched by card name
//   src/assets/raw/cards/back.png                    → generic card back
//   src/assets/raw/factions/<faction>/icon.png       → faction symbol
//   src/assets/raw/factions/<faction>/warrior.png    → token
//   src/assets/raw/factions/<faction>/<building>.png → 'sawmill', 'roost', etc.
//   src/assets/raw/items/<item>.png                  → 'sword', 'boots', etc.
//   src/assets/raw/dominance/<suit>.png              → 'fox', 'mouse', etc.

import type { Faction, ItemKind, Suit } from '../engine/types';

// ─── Leder Games CDN ────────────────────────────────────────────────────────
// Official card images served by Leder Games at cards.ledergames.com.
// Priority: raw/ (private scans) → CDN → builtin/ SVGs.

const CDN = 'https://ledercards.netlify.app/cards/root/en-US';

// Maps our engine card names to CDN filenames (without .webp extension).
// Only base-game shared-deck cards are included; unmapped cards fall through
// to builtin SVGs (text-only rendering).
const CDN_CARD_MAP: Readonly<Record<string, string>> = {
  // Ambushes
  'Ambush! (fox)':          'card-ambushfox',
  'Ambush! (mouse)':        'card-ambushmouse',
  'Ambush! (rabbit)':       'card-ambushbunny',
  'Ambush! (bird)':         'card-ambushbird',
  // Persistents
  'Armorers':               'card-armorers',
  'Brutal Tactics':         'card-brutaltactics',
  'Royal Claim':            'card-royalclaim',
  'Sappers':                'card-sappers',
  'Scouting Party':         'card-scoutingparty',
  'Codebreakers':           'card-codebreakers',
  'Tax Collector':          'card-taxcollector',
  'Cobbler':                'card-cobbler',
  'Command Warren':         'card-commandwarren',
  'Better Burrow Bank':     'card-betterburrowbank',
  'Stand and Deliver!':     'card-standanddeliver',
  // Favors
  'Favor of the Foxes':     'card-favorofthefoxes',
  'Favor of the Mice':      'card-favorofthemice',
  'Favor of the Rabbits':   'card-favoroftherabbits',
  // Item cards
  'Foxfolk Steel':          'card-foxfolksteel',
  'Arms Trader':            'card-armstrader',
  'Sword':                  'card-sword',
  'Crossbow':               'card-crossbowbird',
  'A Visit to Friends':     'card-avisittofriends',
  'Travel Gear':            'card-travelgearfox',
  'Gently Used Knapsack':   'card-gentlyusedknapsack',
  'Root Tea':               'card-rootteabunny',
  'Anvil':                  'card-anvil',
  'Investments':            'card-investments',
  'Mouse-in-a-Sack':        'card-mouseinasack',
  // Eyrie Emigre (Eyrie faction card sometimes shuffled in)
  'Eyrie Emigre':           'card-eyrieemigre',
  // Dominance cards (separate deck, but rendered the same way)
  'Dominance · Foxes':      'card-dominancefox',
  'Dominance · Mice':       'card-dominancemouse',
  'Dominance · Rabbits':    'card-dominancebunny',
  'Dominance · Birds':      'card-dominancebird',
  // October 2025 new persistent cards
  'Apprentice':             'card-apprentice',
  'Bold Leadership':        'card-boldleadership',
  'Brazen Demagogue':       'card-brazendemagogue',
  'Feather Rufflers':       'card-featherrufflers',
  'Fox Squires':            'card-foxsquires',
  'Friend of the Foxes':    'card-friendofthefoxes',
  'Friend of the Mice':     'card-friendofthemice',
  'Friend of the Rabbits':  'card-friendoftherabbits',
  'Hidden Warrens':         'card-hiddenwarrens',
  'Lookouts':               'card-lookouts',
  'Mice-in-a-Bush':         'card-miceinabush',
  'Mouse Squires':          'card-mousesquires',
  'Rabbit Squires':         'card-rabbitsquires',
  'Raiding Party':          'card-raidingparty',
  'Riversteads':            'card-riversteads',
  'Shadow Council':         'card-shadowcouncil',
  'Silver-Tongue':          'card-silvertongue',
  'Spy Network':            'card-spynetwork',
  'Standard Bearer':        'card-standardbearer',
  'Supply Train':           'card-supplytrain',
  'Tactician':              'card-tactician',
  'Smithy':                 'card-smithy',
};

function cdnCardUrl(cardName: string): string | null {
  const file = CDN_CARD_MAP[cardName];
  return file ? `${CDN}/${file}.webp` : null;
}

// Vite glob imports — `as: 'url'` returns a string URL per file.
//
// Two layers:
//   1. `raw/` — the user's private scans (gitignored). Wins when present.
//   2. `builtin/` — original stylized SVGs shipped with the repo (fallback).
const rawCardFiles    = import.meta.glob('./raw/cards/*.{png,jpg,jpeg,webp,svg}',        { eager: true, as: 'url' });
const rawBoardFiles   = import.meta.glob('./raw/board/*.{png,jpg,jpeg,webp,svg}',        { eager: true, as: 'url' });
const rawFactionFiles = import.meta.glob('./raw/factions/**/*.{png,jpg,jpeg,webp,svg}',  { eager: true, as: 'url' });
const rawItemFiles    = import.meta.glob('./raw/items/*.{png,jpg,jpeg,webp,svg}',        { eager: true, as: 'url' });
const rawDomFiles     = import.meta.glob('./raw/dominance/*.{png,jpg,jpeg,webp,svg}',    { eager: true, as: 'url' });

const builtinCardFiles    = import.meta.glob('./builtin/cards/*.svg',        { eager: true, as: 'url' });
const builtinBoardFiles   = import.meta.glob('./builtin/board/*.svg',        { eager: true, as: 'url' });
const builtinFactionFiles = import.meta.glob('./builtin/factions/**/*.svg',  { eager: true, as: 'url' });
const builtinItemFiles    = import.meta.glob('./builtin/items/*.svg',        { eager: true, as: 'url' });
const builtinDomFiles     = import.meta.glob('./builtin/dominance/*.svg',    { eager: true, as: 'url' });

function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[!'"()]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function lookupIn(map: Record<string, string>, prefix: string, name: string): string | null {
  const candidates = [
    `${prefix}${name}.png`,
    `${prefix}${name}.jpg`,
    `${prefix}${name}.jpeg`,
    `${prefix}${name}.webp`,
    `${prefix}${name}.svg`,
  ];
  for (const c of candidates) if (map[c]) return map[c]!;
  return null;
}

function lookup(
  rawMap: Record<string, string>,
  rawPrefix: string,
  builtinMap: Record<string, string>,
  builtinPrefix: string,
  name: string,
): string | null {
  return lookupIn(rawMap, rawPrefix, name) ?? lookupIn(builtinMap, builtinPrefix, name);
}

/** Board backdrop. */
export function boardArt(): string | null {
  return lookup(rawBoardFiles, './raw/board/', builtinBoardFiles, './builtin/board/', 'autumn');
}

/** Card art by exact card name (e.g., "Armorers"). Priority: raw/ → CDN → builtin/. */
export function cardArt(cardName: string): string | null {
  return (
    lookupIn(rawCardFiles, './raw/cards/', slug(cardName)) ??
    cdnCardUrl(cardName) ??
    lookupIn(builtinCardFiles, './builtin/cards/', slug(cardName))
  );
}

/** Generic card back. */
export function cardBackArt(): string | null {
  return lookup(rawCardFiles, './raw/cards/', builtinCardFiles, './builtin/cards/', 'back');
}

/** Faction symbol. */
export function factionIcon(faction: Faction): string | null {
  return lookup(
    rawFactionFiles, `./raw/factions/${faction}/`,
    builtinFactionFiles, `./builtin/factions/${faction}/`,
    'icon',
  );
}

/** Warrior token sprite. */
export function warriorArt(faction: Faction): string | null {
  return lookup(
    rawFactionFiles, `./raw/factions/${faction}/`,
    builtinFactionFiles, `./builtin/factions/${faction}/`,
    'warrior',
  );
}

/** Building art (e.g., 'sawmill', 'roost', 'base-fox'). */
export function buildingArt(faction: Faction, kind: string): string | null {
  return lookup(
    rawFactionFiles, `./raw/factions/${faction}/`,
    builtinFactionFiles, `./builtin/factions/${faction}/`,
    kind,
  );
}

/** Item icon. */
export function itemArt(kind: ItemKind): string | null {
  return lookup(rawItemFiles, './raw/items/', builtinItemFiles, './builtin/items/', kind);
}

/** Dominance-card art by suit. */
export function dominanceArt(suit: Suit | 'bird'): string | null {
  return lookup(rawDomFiles, './raw/dominance/', builtinDomFiles, './builtin/dominance/', suit);
}

/** Counts of asset files for the status indicator. */
export function assetReport(): {
  cards: number; factionArt: number; items: number; board: boolean;
  rawCards: number; rawFaction: number; rawItems: number;
} {
  return {
    cards: Object.keys(rawCardFiles).length + Object.keys(builtinCardFiles).length,
    factionArt: Object.keys(rawFactionFiles).length + Object.keys(builtinFactionFiles).length,
    items: Object.keys(rawItemFiles).length + Object.keys(builtinItemFiles).length,
    board: boardArt() !== null,
    rawCards: Object.keys(rawCardFiles).length,
    rawFaction: Object.keys(rawFactionFiles).length,
    rawItems: Object.keys(rawItemFiles).length,
  };
}
