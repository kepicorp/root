#!/usr/bin/env node
// Print every filename the asset loader will look for under src/assets/raw/.
// Run: node scripts/list-asset-names.mjs

function slug(name) {
  return name
    .toLowerCase()
    .replace(/[!'"()]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Hard-coded mirror of cards/factions/items so this works without tsx.
const cards = [
  'Ambush! (fox)', 'Ambush! (mouse)', 'Ambush! (rabbit)', 'Ambush! (bird)',
  'Armorers', 'Brutal Tactics', 'Royal Claim', 'Sappers', 'Scouting Party',
  'Codebreakers', 'Tax Collector', 'Cobbler', 'Command Warren',
  'Better Burrow Bank', 'Stand and Deliver!',
  'Favor of the Foxes', 'Favor of the Mice', 'Favor of the Rabbits',
  'Mousefolk Sword', 'Foxfolk Steel', 'Arms Trader', 'Sword',
  'Crossbow', 'Smithy', 'A Visit to Friends', 'Travel Gear',
  'Gently Used Knapsack', 'Root Tea', 'Anvil', 'Bank Check',
  'Investments', 'Mouse-in-a-Sack', 'Royal Decree',
  'back',
];
const dominance = ['fox', 'mouse', 'rabbit', 'bird'];
const items = ['sword', 'hammer', 'crossbow', 'boots', 'bag', 'tea', 'coin', 'torch'];

const buildings = {
  marquise: ['icon', 'warrior', 'sawmill', 'workshop', 'recruiter', 'keep'],
  eyrie:    ['icon', 'warrior', 'roost'],
  alliance: ['icon', 'warrior', 'base-fox', 'base-mouse', 'base-rabbit', 'sympathy'],
  vagabond: ['icon', 'warrior'],
};

console.log('# Expected files under src/assets/raw/\n');
console.log('## Board');
console.log('board/autumn.png\n');
console.log('## Cards');
for (const n of [...new Set(cards.map(slug))].sort()) console.log(`cards/${n}.png`);
console.log('\n## Items');
for (const i of items) console.log(`items/${i}.png`);
console.log('\n## Dominance');
for (const s of dominance) console.log(`dominance/${s}.png`);
console.log('\n## Factions');
for (const [faction, names] of Object.entries(buildings)) {
  for (const n of names) console.log(`factions/${faction}/${n}.png`);
}
