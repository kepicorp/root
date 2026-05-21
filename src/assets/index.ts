// Asset loader. Drops in your private Root scans from `src/assets/raw/` and
// the UI uses them automatically. Missing files fall back to text/shape
// rendering, so the app keeps working without any art.
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

/** Card art by exact card name (e.g., "Mousefolk Sword"). */
export function cardArt(cardName: string): string | null {
  return lookup(rawCardFiles, './raw/cards/', builtinCardFiles, './builtin/cards/', slug(cardName));
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
