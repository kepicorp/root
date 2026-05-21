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
const cardFiles  = import.meta.glob('./raw/cards/*.{png,jpg,jpeg,webp}', { eager: true, as: 'url' });
const boardFiles = import.meta.glob('./raw/board/*.{png,jpg,jpeg,webp}', { eager: true, as: 'url' });
const factionFiles = import.meta.glob('./raw/factions/**/*.{png,jpg,jpeg,webp}', { eager: true, as: 'url' });
const itemFiles  = import.meta.glob('./raw/items/*.{png,jpg,jpeg,webp}', { eager: true, as: 'url' });
const domFiles   = import.meta.glob('./raw/dominance/*.{png,jpg,jpeg,webp}', { eager: true, as: 'url' });

function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[!'"()]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function lookup(map: Record<string, string>, prefix: string, name: string): string | null {
  const candidates = [
    `${prefix}${name}.png`,
    `${prefix}${name}.jpg`,
    `${prefix}${name}.jpeg`,
    `${prefix}${name}.webp`,
  ];
  for (const c of candidates) if (map[c]) return map[c]!;
  return null;
}

/** Board backdrop, if present. */
export function boardArt(): string | null {
  return lookup(boardFiles, './raw/board/', 'autumn');
}

/** Card art by exact card name (e.g., "Mousefolk Sword"). Returns null if missing. */
export function cardArt(cardName: string): string | null {
  return lookup(cardFiles, './raw/cards/', slug(cardName));
}

/** Generic card back, used for opponents' hands. */
export function cardBackArt(): string | null {
  return lookup(cardFiles, './raw/cards/', 'back');
}

/** Faction icon (small symbol). */
export function factionIcon(faction: Faction): string | null {
  return lookup(factionFiles, `./raw/factions/${faction}/`, 'icon');
}

/** Warrior token sprite for a faction. */
export function warriorArt(faction: Faction): string | null {
  return lookup(factionFiles, `./raw/factions/${faction}/`, 'warrior');
}

/** Building art for a faction (e.g., 'sawmill', 'roost', 'base-fox'). */
export function buildingArt(faction: Faction, kind: string): string | null {
  return lookup(factionFiles, `./raw/factions/${faction}/`, kind);
}

/** Item icon. */
export function itemArt(kind: ItemKind): string | null {
  return lookup(itemFiles, './raw/items/', kind);
}

/** Dominance-card art by suit. */
export function dominanceArt(suit: Suit | 'bird'): string | null {
  return lookup(domFiles, './raw/dominance/', suit);
}

/** Tally of how many asset files were found, for the status indicator. */
export function assetReport(): { cards: number; factionArt: number; items: number; board: boolean } {
  return {
    cards: Object.keys(cardFiles).length,
    factionArt: Object.keys(factionFiles).length,
    items: Object.keys(itemFiles).length,
    board: boardArt() !== null,
  };
}
