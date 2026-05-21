# Project guide for future Claude sessions

This file is for Claude (the AI assistant). It captures the conventions, shape, and gotchas of this codebase that aren't obvious from a fresh look.

## What this project is

A web implementation of the *Root* board game with AI opponents and hosted multiplayer. Pure-TS engine, React UI, Node WebSocket server for multi-room hosting. See `PLAN.md` for the phased implementation plan and `README.md` for the user-facing docs.

## Key architectural rules

- **Engine is pure.** Anything under `src/engine/` must be a function of its inputs — no DOM, no `window`, no `fetch`, no `Math.random()` outside of `mulberry32(seed)`. The reducer signature is `(GameState, Action) => GameState` using Immer's `produce`. This is load-bearing for replay/determinism/tests.
- **One reducer per faction.** Each faction owns its folder under `src/engine/factions/<name>/` with `state.ts`, `actions.ts`, `reducer.ts`, `setup.ts`. The top-level dispatcher (`src/engine/state.ts`) routes based on action-kind prefix (`marquise.*` → `marquiseReducer`).
- **`getLegalActions(state)` is the single source of truth.** The UI builds buttons from it, the bot picks from it, the multiplayer authority check uses it. If you find yourself hard-coding "what's playable now" anywhere else, you're drifting — push the logic into the per-faction `xxxLegalActions(state)` function.
- **Combat is generic.** `src/engine/combat.ts` has *one* `resolveCombat()` that handles ambush, defenseless, hit caps, building/token removal, and VP-per-cardboard. Faction reducers should *call* it, not duplicate it. The Vagabond is an exception — its combat is in `src/engine/factions/vagabond/combat.ts` because the rules diverge enough that sharing isn't a win.
- **Server runs the same engine.** `server/room.ts` imports directly from `src/engine/` and `src/bots/`. There's no engine fork. If you change a reducer, both client and server pick it up.

## Layout cheat sheet

```
src/engine/        pure TS engine (no DOM)
src/bots/bot.ts    priority-table action picker; used by client AND server
src/ui/            React components (Board.tsx, ActionBar.tsx, Admin.tsx, etc.)
src/assets/        art loader (raw/ overrides builtin/, both via Vite glob imports)
src/sim/           headless runner — bot-vs-bot games for sim tests
server/            HTTP + WS server, room state, persistence, cleanup, admin
scripts/           Node CLI helpers (asset listing, stale-room pruning)
```

## Admin page

- Path: `/admin`. The SPA falls through any unmatched path to `index.html`, so `App.tsx` checks `window.location.pathname === '/admin'` *before* setting up the game state and renders `Admin.tsx`.
- Auth: the React side stores the password in `localStorage` (`root-admin-token`) and sends it as `Authorization: Bearer <password>`. The server compares constant-time against `process.env.ADMIN_PASSWORD`.
- Disabled-by-default: if `ADMIN_PASSWORD` is unset/empty, every admin route returns **503** (not 401). This is deliberate — a misconfigured server can't accept any token.
- Routes live in `server/admin.ts`. They're registered before the `/api/rooms` and SPA routes in `server/index.ts` so they win on path collisions.

## Things you'll probably forget

- **Faction action types live in their own files.** When you add `marquise.foo`, edit `src/engine/factions/marquise/actions.ts` (a union type) AND implement the case in `reducer.ts` AND surface it from `marquiseLegalActions`. The top-level `Action` type in `src/engine/types.ts` is a union of the per-faction unions — no edit needed there unless you're adding a *new* faction.
- **Map-driven actions are filtered out of the ActionBar.** `MAP_DRIVEN` in `src/ui/ActionBar.tsx` lists kinds like `marquise.march` / `vagabond.move`. If you add a new movement-style action, add its kind to that set so it doesn't double-render as a button. The Board's `getMovementActions()` mirrors the same set.
- **Persistence is debounced (500 ms).** A room mutation schedules a `writeFileSync`; rapid changes coalesce. Don't expect the JSON file to update synchronously after an action. `manager.flush()` forces a flush; called on SIGINT/SIGTERM.
- **Seats reset on hydration.** When a server restart loads a saved room, seats start unclaimed — humans reconnect and re-claim. Persistent identity is a deliberate non-feature for now.
- **The autumn map data is hand-coded** in `src/engine/map.ts` with `(x, y)` board-space coordinates (0..1000 × 0..800). The Trees component scatters tree icons in the non-clearing space deterministically (`mulberry(13371337)`).
- **`src/assets/raw/` is gitignored.** That's where users drop their own scans. The built-in originals live in `src/assets/builtin/`. The loader checks `raw/` first per file, then falls back. *Don't* put scanned third-party art in `builtin/` — that folder is shipped publicly.

## Running things

- `npm run dev` — local single-player only
- `npm run host` — Vite dev + WS server, two ports (for LAN/web dev)
- `npm run server` — server only (expects `./dist`)
- `npm test` — Vitest; 47 tests across engine + property + sim
- `npm run typecheck` — `tsc -b --noEmit`
- `docker compose up --build` — production deploy on port 8787
- `npm run prune-stale [-- --days N] [-- --dry-run]` — one-shot cleanup

## Conventions

- **Tests**: Vitest, co-located under `__tests__/` next to the code (e.g. `src/engine/__tests__/combat.test.ts`). Don't put tests in a top-level `tests/` folder.
- **Imports**: relative; no path aliases. Engine modules don't import from `ui/` or `bots/`.
- **Style**: minimal comments. Only the *why* — never narrate the *what*. Multi-line JSDoc is uncommon; one-line `//` is usually enough.
- **Commits**: present-tense imperative subject, then a body that explains the *why* and the user-visible effect. Include the `Co-Authored-By:` footer when committing on behalf of the user (the existing history follows this).
- **CSS**: hand-written, no Tailwind or styled-components. Variables live at `:root` in `src/styles.css`. Color tokens: `--bg`, `--paper`, `--ink`, `--accent`, `--rule`. Faction colors are hard-coded constants (Marquise `#d97a3c`, Eyrie `#7da3c9`, Alliance `#9bbd58`, Vagabond `#b8a37a`) — keep these in sync between SVG icons, CSS, and JS palettes.

## Gotchas

- **Immer freezes everything.** Test fixtures that try to mutate `state.factions.marquise.buildings.sawmill = 6` will throw at runtime. Wrap in `produce(state, draft => { ... })`.
- **`reduce()` returns the same reference when an action is rejected.** The sim runner and the bot loop both rely on identity comparison (`next === state`) to detect "this action did nothing" — don't change that contract.
- **WebSocket reconnect isn't implemented.** If the client connection drops, the page just shows `disconnected`. Users have to reload — and they'll lose their seat (a bot takes over). Fine for now, but if you wire reconnect later, also add rejoin tokens so a returning player keeps their seat.
- **Property tests use 100 inputs locally, not 1000.** If you push a change that breaks rarely, the local Vitest run might miss it. The plan calls for CI to bump to 1000.
- **Don't add new dependencies casually.** `ws`, `immer`, `zustand`, `react`, `tsx`, `concurrently` are it. The static handler, admin handler, and prune-stale script are dep-free on purpose so the Docker image stays small.
- **Auth checks are constant-time.** Use `crypto.timingSafeEqual` and equal-length buffers (`server/admin.ts` already does this). Don't compare admin tokens with `===`.

## When the user asks for something specific

- *"Where do I drop my scans?"* → `src/assets/raw/`, README has the full tree. Run `node scripts/list-asset-names.mjs` for exact filenames.
- *"Add a new faction action."* → faction's `actions.ts` (union) + `reducer.ts` (switch case + `legalActions`) + `ActionBar.tsx`'s `ACTION_META` (label, group, primary). UI buttons are derived from `getLegalActions`.
- *"Bot keeps doing X."* → tweak the `PRIORITY` table in `src/bots/bot.ts`. Higher number wins. The bot picks the first highest-priority legal action; ties are first-found.
- *"Multiplayer state isn't syncing."* → check that the action.kind prefix matches the player's claimed seat (`server/room.ts` `applyAction` rejects with `'not your seat'` otherwise).
- *"The board is too cramped."* → most sizing is in the per-clearing render block of `Board.tsx`; clearing radius, warrior/building icon sizes, and the slot strip layout are all there.

## What NOT to do

- Don't ship scanned game artwork in `src/assets/builtin/` or the Docker image. The built-in art must be original work.
- Don't make the engine impure. No `Date.now()`, no `Math.random()` (use `mulberry32(seed)` via the state's seed), no DOM access.
- Don't add a global event bus or singleton state outside of Zustand stores. The pattern is `useGame` (local) + `useNetGame` (network) and that's it.
- Don't introduce a backend database. Per-room JSON files are intentional — easy to back up, inspect, restore, prune.
- Don't write documentation files (`*.md`) unless asked. The user has explicitly asked for `README.md`, `PLAN.md`, and this `CLAUDE.md`; everything else should be inline comments in the code.
