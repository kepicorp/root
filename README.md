# Root

A web implementation of the asymmetric woodland board game *Root* (Leder Games), played solo against AI opponents or with friends on the same Wi-Fi.

- **Engine**: pure TypeScript, `(state, action) → state`, Immer-immutable, deterministic given a seed.
- **UI**: React + Vite + SVG. Click-to-move, hover-to-inspect, faction panels, animated score chips, save/load.
- **Multiplayer**: optional LAN mode — one machine hosts a WebSocket server, others join from any browser on the network.
- **AI**: a priority-based bot drives every faction not played by a human.

## Quick start

Three ways to run it, pick whichever fits.

### 1. Solo, single-player

```bash
npm install
npm run dev
```

Open <http://localhost:5173>. Pick a faction in the setup wizard; AI plays the other three.

### 2. LAN multiplayer (development)

```bash
npm run host
```

Starts Vite on `:5173` and the WebSocket server on `:8787` side-by-side. The terminal prints a URL like

```
http://192.168.x.x:5173/?host=ws://192.168.x.x:8787&name=YourName
```

Send that link to anyone on the same Wi-Fi. They land in the lobby, claim a faction seat, and the host clicks **Start game**. Any unclaimed seats are filled by AI bots.

### 3. LAN multiplayer (production / Docker)

```bash
docker compose up --build
```

Builds the production bundle and serves the UI **and** the WebSocket on a single port (default `8787`). Players open `http://<host-ip>:8787/` — no query parameters needed; the client auto-detects same-origin and connects.

## How to play

The map fills the left half of the screen; everything else lives on the right side and the bottom log strip.

- **Phase strip** (top): shows *Turn N · Faction · Birdsong / Daylight / Evening*, with a one-line description of the current phase.
- **Map**:
  - Click a clearing to **open its info panel** in the lower-left (warriors per faction, buildings, tokens, available slots, ruin status).
  - When it's your turn and you have units to move, the clearing pulses gold; click it then click a green-pulsing target to move.
  - **Zoom**: `+` / `−` buttons, mouse wheel, or `+` / `−` keys. Hit `0` to reset.
  - **Pan**: hold **Space** + drag, right-click drag, or Shift + drag.
  - **Legend** in the upper-left explains every icon (collapsible).
- **Scoreboard**: faction VP, current-turn indicator, glow when someone hits 30 VP.
- **Action panel**: actions are grouped by phase (Birdsong / Actions / Bonus / End); the primary suggested action highlights in gold. Movement actions are driven by the map, not buttons.
- **Hand**: your cards, hover for a zoomed view. Opponent hand sizes shown as face-down stacks.
- **Log**: every game event, with per-faction filter chips.

The game auto-saves to `localStorage` after every action. Closing and reopening the tab resumes the same game; pick **Resume** from the setup screen.

## Adding your own art

The app ships with original stylized SVG art so the board, faction icons, items, and dominance cards are visible out of the box. To use your own scans (e.g., from a physical copy of the game), drop files into `src/assets/raw/` and the loader will prefer them over the built-in art on a per-file basis.

### Where to drop files

```
src/assets/raw/
├── board/
│   └── autumn.png                ← the SVG-backdrop map image
├── cards/
│   ├── back.png                  ← generic card back
│   ├── mousefolk-sword.png       ← one file per card, named after the card
│   ├── foxfolk-steel.png
│   └── …
├── factions/
│   ├── marquise/
│   │   ├── icon.png              ← faction symbol (scoreboard, hand label)
│   │   ├── warrior.png           ← warrior token sprite
│   │   ├── sawmill.png
│   │   ├── workshop.png
│   │   ├── recruiter.png
│   │   └── keep.png
│   ├── eyrie/
│   │   ├── icon.png
│   │   ├── warrior.png
│   │   └── roost.png
│   ├── alliance/
│   │   ├── icon.png
│   │   ├── warrior.png
│   │   ├── base-fox.png
│   │   ├── base-mouse.png
│   │   ├── base-rabbit.png
│   │   └── sympathy.png
│   └── vagabond/
│       ├── icon.png
│       └── warrior.png
├── items/
│   ├── sword.png · hammer.png · crossbow.png · boots.png
│   ├── bag.png · tea.png · coin.png · torch.png
└── dominance/
    └── fox.png · mouse.png · rabbit.png · bird.png
```

### Naming rule

Filenames are **lowercase kebab-case** matches of the card or piece name. Punctuation (`!`, `'`, `"`, parentheses) is stripped; spaces and other separators become `-`. For example, the card "Ambush! (fox)" becomes `cards/ambush-fox.png`.

Run this to print every expected filename:

```bash
node scripts/list-asset-names.mjs
```

Supported formats: `.png`, `.jpg`, `.jpeg`, `.webp`, `.svg`.

### Verifying they loaded

The header shows a status pill:

- `art: stylized fallback (…)` — the built-in SVGs are in use.
- `art: N cards + M faction + K items (your scans)` — your files in `raw/` are being used.

The loader is per-file, so you can scan things in piecemeal (e.g., just the board first, then warriors) and missing files keep their built-in fallback.

### Legal note

The `src/assets/raw/` folder is **gitignored** (only its README is committed). Anything you put there stays local to your machine — never committed, never pushed, never served by the production Docker image unless you bake it in deliberately. Treat scanned game art as private/local use only; do not redistribute.

## Architecture

```
src/engine/         pure TypeScript game engine (no React, no DOM)
├── map.ts          12-clearing autumn map, adjacency, ruins
├── cards.ts        54-card shared deck + 4 dominance
├── combat.ts       generic combat resolver (ambush, defenseless, hit caps)
├── loop.ts         birdsong → daylight → evening rotation, victory check
├── state.ts        newGame(), reducer dispatcher
├── setup.ts        per-faction initial board placement
├── rng.ts          seeded mulberry32; rollDie returns 0/0/1/1/2/3
├── legal.ts        getLegalActions(state) — single source of truth
└── factions/
    ├── marquise/   full Marquise mechanics (Phase 2)
    ├── eyrie/      decree slots + turmoil + leader cycle
    ├── alliance/   supporters, sympathy, revolt, mobilize
    └── vagabond/   items, characters, slip/refresh, explore, aid, strike

src/bots/bot.ts     priority-based action picker for non-human factions
src/ui/             React components + Zustand stores
src/assets/         art loader (raw/ overrides builtin/)
src/sim/            headless game runner (npm run sim, used in tests)

server/             LAN multiplayer (Node + ws)
├── protocol.ts     ClientMessage / ServerMessage types (shared with client)
├── room.ts         canonical game state, seat claim, bot loop, authority check
├── static.ts       tiny dep-free static-file handler for the built bundle
└── index.ts        http + ws on a single port

PLAN.md             phased plan: scope, architecture decisions, what's done
```

## Scripts

| Command            | What it does                                                |
| ------------------ | ----------------------------------------------------------- |
| `npm run dev`      | Vite dev server, single-player local                        |
| `npm run host`     | Vite (with `--host`) + WS server, two ports, LAN multiplayer |
| `npm run server`   | WebSocket / static server only (expects an existing `dist/`) |
| `npm run build`    | Production bundle into `dist/`                              |
| `npm run preview`  | Preview the built bundle locally                            |
| `npm test`         | Run the Vitest suite                                        |
| `npm run test:watch` | Vitest watch mode                                         |
| `npm run typecheck`| `tsc -b --noEmit`                                           |

Plus `docker compose up --build` for the containerized deployment.

## Tests

47 tests across:

- **Engine** — map adjacency, deck integrity, combat math (ambush, defenseless, hit caps, VP-per-cardboard), turn loop, per-faction setup and reducers.
- **Property tests** (`fast-check`) — RNG determinism, hit-cap bounds, deck uniqueness, score monotonicity.
- **Sim runner** — bot-vs-bot games complete without crashing across multiple seeds.

```bash
npm test
```

## Status

Implementation is tracked in `PLAN.md`. Phases 0–8 are complete; Phase 10 (LAN multiplayer + Docker) is in progress. Known simplifications:

- Eyrie strategy is weak — the bot doesn't compose its Decree carefully, so it often falls into Turmoil before building roosts. The rules engine is in place; the AI just needs more thought.
- Vagabond quest deck and full coalition flow are minimal.
- Hidden hands are not yet view-filtered server-side: in LAN mode, the entire `GameState` is broadcast to every connected client. Don't play with adversarial opponents until this is wired up.

## License

The code in this repository is mine. The game itself, the rules, and any artwork you choose to add are © Leder Games. This project is intended for personal/local use only; do not deploy publicly with copyrighted assets.
