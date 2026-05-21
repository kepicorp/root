# Root

A web implementation of the asymmetric woodland board game *Root*, played solo against AI opponents or with friends through a hosted website that anyone can create or join games on.

- **Engine**: pure TypeScript, `(state, action) → state`, Immer-immutable, deterministic given a seed.
- **UI**: React + Vite + SVG. Click-to-move, hover-to-inspect, faction panels, animated score chips, save/load.
- **Multiplayer**: hosted website. Anyone visits, creates a room, and shares the link — 1–4 humans plus AI fillers.
- **AI**: a priority-based bot drives every faction not played by a human.
- **Persistence**: every room is a JSON file on disk; survives server restarts. Stale rooms (idle > 90 days) are auto-pruned.

## Quick start

Pick whichever fits.

### 1. Solo, single-player

```bash
npm install
npm run dev
```

Open <http://localhost:5173>. On the landing page click **Play solo**, then pick a faction.

### 2. Hosted multi-room (Docker, recommended)

```bash
docker compose up --build
```

Builds the production bundle and starts the multi-room server. Everything is on **port 8787**:

- `http://localhost:8787/` — landing page (Create / Join / Solo)
- `http://localhost:8787/r/<id>` — a specific room (shareable link)
- `http://localhost:8787/api/rooms` — REST: `POST` creates a room, `GET /:id` checks existence
- `http://localhost:8787/ws?room=<id>` — WebSocket endpoint
- `http://localhost:8787/healthz` — liveness check

Room data persists to `./data/rooms/<id>.json`. Mount that path as a Docker volume in production to survive container rebuilds.

### 3. Hosted multi-room (development, without Docker)

```bash
npm run host
```

Starts Vite on `:5173` with hot reload and the multi-room server on `:8787`. Use Vite for the UI; the WS server still owns rooms.

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

In solo mode the game auto-saves to `localStorage`; reopening the tab resumes it. In multiplayer the server is the source of truth, so the room URL is the resume mechanism — share the link, anyone can rejoin.

## Multiplayer flow

1. Visit the homepage → click **Create game**. The server allocates a 6-character room code (e.g. `hupq5d`) and the URL updates to `/r/hupq5d`.
2. Share the URL. Others paste it into **Join a game** or just click the link — they auto-connect to the same room.
3. Each player claims one faction seat in the lobby. The Vagabond player also picks their character.
4. Anyone clicks **Start game**. Unclaimed seats become AI bots.
5. The server validates each action against the player's seat (faction prefix must match), applies the reducer, and broadcasts new state to everyone.

If a player closes the tab, their seat is freed and the AI takes over. They can rejoin from the same URL and reclaim any free seat.

## Stale-room cleanup

Rooms idle for **90 days** with no live subscribers are automatically pruned. The server runs the check on startup and every 6 hours.

For manual / scheduled cleanup outside the server (e.g., a cron job while the server is down):

```bash
npm run prune-stale                 # default: 90 days
node scripts/prune-stale.mjs --days 30
node scripts/prune-stale.mjs --dry-run
DATA_DIR=/var/lib/root/rooms node scripts/prune-stale.mjs
```

The script operates directly on the JSON files in `DATA_DIR`, so it's safe to run while the server is running (it just won't see in-memory state that hasn't yet been flushed to disk — debounced at 500 ms).

## Admin page

Set `ADMIN_PASSWORD` on the server (env var or `.env`) to enable the `/admin` page. Without it, the admin routes return `503 Service Unavailable` so a misconfigured server can't accidentally accept any token.

Once enabled, visit `http://<host>:8787/admin`, sign in with the configured password, and you get:

- A live list of every room — ID, created/last-activity timestamps, lobby vs in-game state, whether anyone's currently connected, and which factions are claimed.
- A **Delete** button per row.
- A **Prune stale rooms** form with a day cutoff and a dry-run toggle.

The password is checked in constant time against the env value. The browser stores the token in `localStorage` so refreshing keeps you signed in; **Sign out** clears it.

### Setting the password

Pick one:

```bash
# 1. Local .env file (loaded automatically by docker compose):
echo 'ADMIN_PASSWORD=your-secret' >> .env

# 2. Inline with docker compose:
ADMIN_PASSWORD=your-secret docker compose up

# 3. On a host running the server directly:
ADMIN_PASSWORD=your-secret npm run server
```

`.env` is gitignored. Keep the password out of committed files.

### Admin REST endpoints

All require `Authorization: Bearer <password>`.

| Method   | Path                       | Body                            | Response                                 |
| -------- | -------------------------- | ------------------------------- | ---------------------------------------- |
| `POST`   | `/api/admin/check`         | —                               | `{ ok: true }`                            |
| `GET`    | `/api/admin/rooms`         | —                               | `{ rooms: RoomInfo[] }`                   |
| `DELETE` | `/api/admin/rooms/:id`     | —                               | `{ id, removed: boolean }`               |
| `POST`   | `/api/admin/prune`         | `{ days?: number, dryRun?: bool }` | `{ dryRun, removed?/wouldRemove?, kept }` |

## Adding your own art

The app ships with original stylized SVG art so the board, faction icons, items, and dominance cards are visible out of the box. To use your own scans, drop files into `src/assets/raw/` and the loader will prefer them over the built-ins on a per-file basis.

### Where to drop files

```
src/assets/raw/
├── board/autumn.png              ← SVG-backdrop map image
├── cards/
│   ├── back.png                  ← generic card back
│   ├── mousefolk-sword.png       ← one file per card, named after the card
│   └── …
├── factions/
│   ├── marquise/
│   │   ├── icon.png · warrior.png
│   │   └── sawmill.png · workshop.png · recruiter.png · keep.png
│   ├── eyrie/
│   │   └── icon.png · warrior.png · roost.png
│   ├── alliance/
│   │   ├── icon.png · warrior.png · sympathy.png
│   │   └── base-fox.png · base-mouse.png · base-rabbit.png
│   └── vagabond/
│       └── icon.png · warrior.png
├── items/
│   └── sword.png · hammer.png · crossbow.png · boots.png
│   └── bag.png · tea.png · coin.png · torch.png
└── dominance/
    └── fox.png · mouse.png · rabbit.png · bird.png
```

### Naming rule

Filenames are **lowercase kebab-case** matches of the card or piece name. Punctuation (`!`, `'`, `"`, parentheses) is stripped; spaces and other separators become `-`. For example, "Ambush! (fox)" becomes `cards/ambush-fox.png`.

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

The `src/assets/raw/` folder is **gitignored** and excluded from the Docker build context. Anything you put there stays local — never committed, never pushed, never baked into the public image unless you deliberately change that. Treat scanned game art as private/local use only.

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
src/sim/            headless game runner (used in tests)

server/             multi-room WebSocket + static server
├── protocol.ts     ClientMessage / ServerMessage types (shared)
├── room.ts         per-room state authority, bot loop, action authority
├── rooms.ts        RoomManager: create / lookup / persist / prune
├── static.ts       tiny dep-free static-file handler with SPA fallback
└── index.ts        http + ws on a single port

scripts/
├── list-asset-names.mjs   print every filename the asset loader expects
└── prune-stale.mjs        standalone stale-room cleanup

PLAN.md             phased plan: scope, architecture decisions, what's done
CLAUDE.md           project guide for future Claude sessions
```

## Scripts

| Command                | What it does                                                  |
| ---------------------- | ------------------------------------------------------------- |
| `npm run dev`          | Vite dev server, single-player local                          |
| `npm run host`         | Vite (with `--host`) + multi-room WS server, two ports        |
| `npm run server`       | Multi-room server only (serves `./dist` if it exists)         |
| `npm run build`        | Production bundle into `dist/`                                |
| `npm run preview`      | Preview the built bundle locally                              |
| `npm test`             | Vitest                                                        |
| `npm run test:watch`   | Vitest watch                                                  |
| `npm run typecheck`    | `tsc -b --noEmit`                                             |
| `npm run prune-stale`  | One-shot stale-room cleanup (`--days N`, `--dry-run`)         |

Plus `docker compose up --build` for the containerized deployment.

## Environment variables

| Variable             | Default              | Purpose                                                |
| -------------------- | -------------------- | ------------------------------------------------------ |
| `PORT`               | `8787`               | HTTP + WebSocket port for the server                   |
| `DIST_DIR`           | `./dist`             | Where to serve the React bundle from                   |
| `DATA_DIR`           | `./data/rooms`       | Where to write per-room JSON files                     |
| `MAX_ROOM_AGE_DAYS`  | `90`                 | Rooms idle longer than this are pruned                 |
| `ADMIN_PASSWORD`     | _unset_              | Enables `/admin`. Empty/unset → admin disabled (503)   |

A `.env.example` is included; copy to `.env` and edit. Both `npm run dev`/`host` and `docker compose` pick it up automatically.

## Tests

```bash
npm test
```

47 tests across:

- **Engine** — map adjacency, deck integrity, combat math (ambush, defenseless, hit caps, VP-per-cardboard), turn loop, per-faction setup and reducers.
- **Property tests** (`fast-check`) — RNG determinism, hit-cap bounds, deck uniqueness, score monotonicity.
- **Sim runner** — bot-vs-bot games complete without crashing across multiple seeds.

## Status

Implementation is tracked in `PLAN.md`. Phases 0–8 are complete; the hosted-website pivot (multi-room + persistence + cleanup) is in progress. Known simplifications:

- Eyrie strategy is weak — the bot doesn't compose its Decree carefully, so it often falls into Turmoil before building roosts. The rules engine is in place; the AI just needs more thought.
- Vagabond quest deck and full coalition flow are minimal.
- Hidden hands are not yet view-filtered server-side: in multiplayer, the entire `GameState` is broadcast to every connected client. Don't play with adversarial opponents on a public deployment until this is wired up.
- Players don't have persistent identity, so closing the tab gives up your seat (a bot takes over). Rejoining lets you grab any free seat.

## License

The code in this repository is mine. The game itself, the rules, and any artwork you choose to add are © Leder Games. This project is intended for personal use; deploying publicly should be done with original art only.
