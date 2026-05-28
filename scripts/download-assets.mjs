#!/usr/bin/env node
// Downloads all card art from the Leder Games CDN into src/assets/raw/cards/.
// Run with: npm run download-assets
// Safe to re-run — skips files that already exist.

import { createWriteStream, existsSync, mkdirSync } from 'fs';
import { get } from 'https';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const RAW_DIR = join(ROOT, 'src/assets/raw/cards');
const CDN = 'https://ledercards.netlify.app/cards/root/en-US';

mkdirSync(RAW_DIR, { recursive: true });

function slug(name) {
  return name.toLowerCase()
    .replace(/[!'"()]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/, '');
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    if (existsSync(dest)) { resolve('skip'); return; }
    const file = createWriteStream(dest);
    get(url, res => {
      if (res.statusCode !== 200) {
        file.close();
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      res.pipe(file);
      file.on('finish', () => file.close(() => resolve('ok')));
    }).on('error', reject);
  });
}

// Maps engine card name (or suit-variant name) → CDN filename stem.
// Keep in sync with CDN_CARD_MAP in src/assets/index.ts.
const CDN_CARD_MAP = {
  // Ambushes
  'Ambush! (fox)':           'card-ambushfox',
  'Ambush! (mouse)':         'card-ambushmouse',
  'Ambush! (rabbit)':        'card-ambushbunny',
  'Ambush! (bird)':          'card-ambushbird',
  // Persistents
  'Armorers':                'card-armorers',
  'Brutal Tactics':          'card-brutaltactics',
  'Royal Claim':             'card-royalclaim',
  'Sappers':                 'card-sappers',
  'Scouting Party':          'card-scoutingparty',
  'Codebreakers':            'card-codebreakers',
  'Tax Collector':           'card-taxcollector',
  'Cobbler':                 'card-cobbler',
  'Command Warren':          'card-commandwarren',
  'Better Burrow Bank':      'card-betterburrowbank',
  'Stand and Deliver!':      'card-standanddeliver',
  // Favors
  'Favor of the Foxes':      'card-favorofthefoxes',
  'Favor of the Mice':       'card-favorofthemice',
  'Favor of the Rabbits':    'card-favoroftherabbits',
  // Item cards
  'Foxfolk Steel':           'card-foxfolksteel',
  'Arms Trader':             'card-armstrader',
  'Sword':                   'card-sword',
  'Crossbow (bird)':         'card-crossbowbird',
  'Crossbow (mouse)':        'card-crossbowmouse',
  'A Visit to Friends':      'card-avisittofriends',
  'Travel Gear (fox)':       'card-travelgearfox',
  'Travel Gear (mouse)':     'card-travelgearmouse',
  'Gently Used Knapsack':    'card-gentlyusedknapsack',
  'Root Tea (rabbit)':       'card-rootteabunny',
  'Root Tea (fox)':          'card-rootteafox',
  'Root Tea (mouse)':        'card-rootteamouse',
  'Anvil':                   'card-anvil',
  'Investments':             'card-investments',
  'Mouse-in-a-Sack':         'card-mouseinasack',
  'Birdy Bindle':            'card-birdybindle',
  "Smuggler's Trail":        'card-smugglerstrail',
  'Bake Sale':               'card-bakesale',
  'Protection Racket':       'card-protectionracket',
  'Woodland Runners':        'card-woodlandrunners',
  // Dominance
  'Dominance · Foxes':       'card-dominancefox',
  'Dominance · Mice':        'card-dominancemouse',
  'Dominance · Rabbits':     'card-dominancebunny',
  'Dominance · Birds':       'card-dominancebird',
  // S&D persistents
  'Apprentice':              'card-apprentice',
  'Bold Leadership':         'card-boldleadership',
  'Brazen Demagogue':        'card-brazendemagogue',
  'Feather Rufflers':        'card-featherrufflers',
  'Fox Squires':             'card-foxsquires',
  'Friend of the Foxes':     'card-friendofthefoxes',
  'Friend of the Mice':      'card-friendofthemice',
  'Friend of the Rabbits':   'card-friendoftherabbits',
  'Hidden Warrens':          'card-hiddenwarrens',
  'Lookouts':                'card-lookouts',
  'Mice-in-a-Bush':          'card-miceinabush',
  'Mouse Squires':           'card-mousesquires',
  'Rabbit Squires':          'card-rabbitsquires',
  'Raiding Party':           'card-raidingparty',
  'Riversteads':             'card-riversteads',
  'Shadow Council':          'card-shadowcouncil',
  'Silver-Tongue':           'card-silvertongue',
  'Sky Couriers':            'card-skycouriers',
  'Spy Network':             'card-spynetwork',
  'Standard Bearer':         'card-standardbearer',
  'Supply Train':            'card-supplytrain',
  'Tactician':               'card-tactician',
  'The Faithful':            'card-thefaithful',
};

const entries = Object.entries(CDN_CARD_MAP);
let ok = 0, skipped = 0, failed = 0;

for (const [cardName, cdnStem] of entries) {
  const url  = `${CDN}/${cdnStem}.webp`;
  const dest = join(RAW_DIR, `${slug(cardName)}.webp`);
  try {
    const result = await download(url, dest);
    if (result === 'skip') {
      process.stdout.write(`  skip  ${slug(cardName)}.webp\n`);
      skipped++;
    } else {
      process.stdout.write(`  ok    ${slug(cardName)}.webp\n`);
      ok++;
    }
  } catch (e) {
    process.stderr.write(`  FAIL  ${slug(cardName)}.webp — ${e.message}\n`);
    failed++;
  }
}

console.log(`\nDone: ${ok} downloaded, ${skipped} already present, ${failed} failed.`);
if (failed > 0) process.exit(1);
