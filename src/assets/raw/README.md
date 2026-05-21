# Asset drop folder

Place your private Root scans here. This folder is gitignored — nothing
in it will be committed, distributed, or pushed.

## Naming

Files are matched by **lowercase kebab-case** name. Punctuation (`!`, `'`,
`"`, parentheses) is stripped; spaces and other separators become `-`.

### Board
- `board/autumn.png` — the autumn map. Rendered as the SVG backdrop.

### Cards
One file per card, named after the card with the rule above:
- `cards/mousefolk-sword.png`
- `cards/foxfolk-steel.png`
- `cards/ambush-fox.png`
- `cards/favor-of-the-mice.png`
- `cards/cobbler.png`
- `cards/tax-collector.png`
- `cards/back.png` — generic card back (used for hidden hands)

Tip: run `node -e "console.log(require('./src/engine/cards').SHARED_DECK.map(c=>c.name).map(s=>s.toLowerCase().replace(/[!'\"()]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'')).join('\\n'))"`
to print the exact filenames the loader expects.

### Factions
Each faction has its own subfolder:
- `factions/marquise/icon.png` — small symbol shown in score chips, hand label, etc.
- `factions/marquise/warrior.png` — token sprite for a single warrior
- `factions/marquise/sawmill.png`
- `factions/marquise/workshop.png`
- `factions/marquise/recruiter.png`
- `factions/marquise/keep.png`

- `factions/eyrie/icon.png`
- `factions/eyrie/warrior.png`
- `factions/eyrie/roost.png`

- `factions/alliance/icon.png`
- `factions/alliance/warrior.png`
- `factions/alliance/base-fox.png`
- `factions/alliance/base-mouse.png`
- `factions/alliance/base-rabbit.png`
- `factions/alliance/sympathy.png`

- `factions/vagabond/icon.png`
- `factions/vagabond/warrior.png` — the pawn

### Items
- `items/sword.png`
- `items/hammer.png`
- `items/crossbow.png`
- `items/boots.png`
- `items/bag.png`
- `items/tea.png`
- `items/coin.png`
- `items/torch.png`

### Dominance
- `dominance/fox.png`
- `dominance/mouse.png`
- `dominance/rabbit.png`
- `dominance/bird.png`

## Legal

The art is Leder Games' copyright. This folder is for private/local use
only — never check it in, never serve it publicly. The `.gitignore`
already excludes `src/assets/raw/`.
