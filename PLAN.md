# Root — Single-player vs AI

A web app to play the board game *Root* (Leder Games) solo against AI opponents.

## Scope (v1)

- **Factions**: Base 4 — Marquise de Cat, Eyrie Dynasties, Woodland Alliance, Vagabond.
- **Map**: Autumn map only (the standard).
- **Players**: 1 human vs 3 AI. No hotseat, no networking, no accounts.
- **Persistence**: Save/load to `localStorage`. No server, no cloud sync.
- **Distribution**: Private/local use only. Scanned Leder Games artwork is used directly, which is not redistributable — this project is **not** to be deployed publicly or open-sourced as-is.

Explicitly **out of scope** for v1: Riverfolk/Lizard/Underground/Corvid factions, Winter/Lake/Mountain maps, hirelings, landmarks, advanced setup, tournament rules, hotseat, online multiplayer, mobile-native app.

## Recommended stack

- **Language**: TypeScript end-to-end. The rules are intricate; a strong type system catches faction-action mismatches at compile time.
- **Frontend**: React + Vite. Mature, fast hot-reload, good for the card/board UI density Root needs.
- **State**: Zustand for UI state. The *game engine* itself does **not** use React state — it is a pure module that produces a new `GameState` per action.
- **Rendering**: HTML + CSS + SVG for the board. Canvas/PixiJS is overkill at this scale and harder to make accessible. Framer Motion for animations (card draws, warrior moves, score ticks).
- **AI**: Per-faction scripted bots modelled on Leder's own *Clockwork* expansion (each faction has a deterministic decision table). This is the realistic, shipping approach for asymmetric AI. General MCTS is a stretch goal, not v1.
- **Testing**: Vitest for unit tests on the engine; Playwright for one happy-path E2E.
- **No backend**. Everything runs in the browser.

## Architecture

Four hard-separated layers. The arrows are the only allowed dependencies.

```
                ┌──────────────┐
                │     UI       │  React components, animations, input
                └──────┬───────┘
                       │ dispatches Action, reads GameState
                ┌──────▼───────┐
                │   Engine     │  Pure TS. (state, action) => state
                └──▲────────▲──┘
                   │        │ asks for legal actions, applies them
              ┌────┘        └────┐
        ┌─────┴─────┐      ┌─────┴─────┐
        │   Bots    │      │  Assets   │  art, fonts, sounds
        └───────────┘      └───────────┘
```

### Engine (`src/engine`)

The engine is the heart of the project. It must be:

- **Pure**: `reducer(state, action) → state`. No I/O, no randomness baked in — RNG is injected (seeded `mulberry32`) so AI bots and tests are deterministic.
- **Validated**: `getLegalActions(state) → Action[]` is the *only* source of truth for what's playable. UI buttons and bots both call it.
- **Immutable**: Uses Immer under the hood for ergonomic immutable updates without leaking mutation.

Core types:

```ts
type GameState = {
  seed: number;
  phase: 'setup' | 'birdsong' | 'daylight' | 'evening' | 'gameOver';
  turn: { faction: Faction; subphase: string; pendingPrompts: Prompt[] };
  map: Map;                   // clearings, paths, ruins, slots
  shared: { deck: Card[]; discard: Card[]; dominance: Card[]; itemSupply: Item[] };
  factions: {
    marquise?: MarquiseState;
    eyrie?: EyrieState;
    alliance?: AllianceState;
    vagabond?: VagabondState;
  };
  scores: Record<Faction, number>;
  winner?: { faction: Faction; via: 'points' | 'dominance' | 'coalition' };
  log: LogEntry[];            // append-only, drives the in-game log panel
};

type Action =
  | { kind: 'marquise.build'; clearing: ClearingId; building: 'sawmill'|'workshop'|'recruiter' }
  | { kind: 'marquise.recruit' }
  | { kind: 'eyrie.addToDecree'; slot: 'recruit'|'move'|'battle'|'build'; card: CardId }
  | { kind: 'alliance.placeSympathy'; clearing: ClearingId }
  | { kind: 'vagabond.moveTo'; clearing: ClearingId }
  | { kind: 'combat.rollDice' }
  | ...
```

Sub-modules:

- `engine/map.ts` — clearings, paths, suits, adjacency. Static data.
- `engine/cards.ts` — deck definition, suits, ambushes, dominance, persistent effects.
- `engine/combat.ts` — shared combat resolver (used by every faction). Handles defender ambush, max-roll-attacker-when-defenseless, hits, building/token removal order.
- `engine/factions/marquise.ts` — birdsong (place wood), daylight (3 actions: build/recruit/march/battle/overwork/discard-for-card/move/craft), evening (draw+discard).
- `engine/factions/eyrie.ts` — decree resolution, turmoil, leader selection, viziers.
- `engine/factions/alliance.ts` — supporters deck, sympathy spread, revolt → base, officers, organize, mobilize.
- `engine/factions/vagabond.ts` — character abilities, item track, ruins, quests, relationships, hostility, aid, slip, special items.
- `engine/loop.ts` — turn order (Marquise → Eyrie → Alliance → Vagabond), birdsong/daylight/evening rotation, victory check.
- `engine/setup.ts` — 4-player setup: initial buildings, sympathy, clearings, starting hand, item supply.

### Bots (`src/bots`)

One file per faction. Each exports `decide(state) → Action`. The bot calls `getLegalActions` and chooses based on a faction-specific heuristic table.

Reference: the *Clockwork* expansion already encodes these as flowcharts. Translate those tables directly — they're battle-tested by Leder.

- `bots/marquise.ts` — prioritize building in highest-warrior friendly clearing; battle when warrior advantage ≥2; overwork sawmill clearings.
- `bots/eyrie.ts` — fill decree by faction-card-suit preference; resolve recruit→move→battle→build in clearing-priority order; accept turmoil when decree is unfulfillable.
- `bots/alliance.ts` — place sympathy where it scores; revolt when supporters ≥ cost and target is unguarded; mobilize/train per officer count.
- `bots/vagabond.ts` — character-dependent. Thief steals; Ranger hides+strikes; Tinker crafts. Quest when possible; aid when allied; never hostile until late-game lead.

Each bot must also handle **reaction prompts** (e.g., choosing ambush, choosing which building to remove). Reactions go through the same `decide` entry point with the prompt in `state.turn.pendingPrompts`.

### UI (`src/ui`)

- `ui/Board.tsx` — SVG map with clearings as `<g>` elements. Buildings/warriors/tokens render as absolutely positioned components inside each clearing slot.
- `ui/FactionPanel/` — one component per faction showing its board: Marquise's workshop track, Eyrie's decree columns, Alliance's officers/supporters/sympathy tokens, Vagabond's item tracks + character card + relationships.
- `ui/Hand.tsx` — the human's hand of cards.
- `ui/ActionBar.tsx` — context-sensitive: shows legal actions for the current subphase. Highlights clearings/cards that are valid targets when an action is selected.
- `ui/Log.tsx` — running log of every action, sourced from `state.log`.
- `ui/SetupWizard.tsx` — choose Vagabond character, confirm setup, start game.

Interaction model: **click-to-select-then-click-to-target**, with a persistent ActionBar showing what the player is currently doing. No drag-and-drop in v1 (it's a lot of work for marginal benefit on a complex board).

### Assets (`src/assets`)

- `board/autumn.png` — full board scan, used as backdrop for the SVG layer (which provides interactive hitboxes).
- `factions/{marquise,eyrie,alliance,vagabond}/` — warriors, buildings, tokens, faction board.
- `cards/` — one image per card in the shared deck + dominance + quests + 4 faction decks.
- `items/` — the 16 item tokens.
- `vagabond/characters/` — Thief, Tinker, Ranger character cards.

All asset usage is private/local. The repo `.gitignore` will exclude `src/assets/raw/` (originals) and the build will inline only the cropped pieces actually used. Re-publishing this repo would require swapping all art.

## Implementation phases

Each phase ends with a **playable milestone** — something you can click and see working. No phase is "complete" without a demo.

### Phase 0 — Skeleton (≈1 day)

- Vite + React + TS project. Vitest. ESLint + Prettier. `.gitignore` raw assets.
- Engine types: `GameState`, `Action`, `Faction`, `ClearingId`, etc. No logic yet.
- Static map data (`engine/map.ts`): the 12 clearings of the autumn map with suits, adjacency, ruin slots.
- UI shell: render the board PNG with SVG clearing hitboxes. Hover highlights a clearing. No game logic.
- **Milestone**: see the board, hover clearings, click logs to console.

### Phase 1 — Foundations: cards + combat + loop (≈3 days)

- Card data: the shared deck (54 cards), dominance, item-bearing cards. Card images.
- `engine/combat.ts`: full combat resolver with tests. Tests cover defenseless, ambush, max-roll-attacker, building/token removal priority.
- `engine/loop.ts`: phase rotation, but with empty faction turns ("press Next").
- UI: hand panel + ActionBar shell + log panel.
- **Milestone**: empty game where you can step through phases and trigger a manual combat between two fake stacks.

### Phase 2 — Marquise de Cat (≈4 days)

The simplest faction; good first vertical slice.

- All Marquise mechanics: setup, birdsong (place wood), daylight (3 actions: build/recruit/march/battle/overwork/craft/move/discard-suit-for-card), evening (draw 1 + extra per uncovered draw bonus, discard down to 5).
- Crafting subsystem (shared by all factions): use workshops to pay suit cost.
- Scoring: build a building scores per its track.
- UI: Marquise faction panel with three building tracks, wood supply, warrior supply.
- **Milestone**: human plays Marquise solo against three empty factions; can win by building 5 of one building.

### Phase 3 — Eyrie Dynasties (≈4 days)

- Decree slots (recruit/move/battle/build), 4 leaders, turmoil resolution.
- "Resolve decree in order" with the brittle failure → turmoil flow.
- Eyrie scoring: per turn based on roost count; turmoil score penalty.
- UI: Eyrie faction panel with decree columns and leader cards.
- **Milestone**: select Eyrie as the human-controlled faction, play a game vs. empty opponents.

### Phase 4 — Woodland Alliance (≈4 days)

- Supporters deck, sympathy tokens, bases (3 suits).
- Revolt, spread sympathy, organize, mobilize, train, recruit, move, battle.
- Outrage: when sympathetic clearing is attacked, attacker gives supporter card.
- UI: Alliance panel with supporters (hidden from AI players), officers, sympathy/base tracks.
- **Milestone**: Alliance fully playable.

### Phase 5 — Vagabond (≈5 days)

Biggest faction by mechanic count.

- Item track (boots/swords/bags/tea/coins/crossbow/hammer/torch). Damage/exhaust.
- Three characters (Thief, Tinker, Ranger) with starting items and abilities.
- Slip, move (boots), battle (swords), explore ruins, aid, quests, strike.
- Relationships ladder per faction. Hostility transition. Coalition victory.
- Special items from coalition/dominance/hostility.
- UI: Vagabond panel — character card, item tracks (face-up/face-down/damaged), quests, relationship tokens.
- **Milestone**: all four factions playable by a human.

### Phase 6 — AI bots (≈5 days)

- `bots/{faction}.ts` for each non-human faction. Implement the Clockwork-style decision tables.
- `bots/runner.ts` — runs the bot in a microtask so the UI can animate state changes between actions instead of jumping.
- Hook bots into `engine/loop.ts`: at the start of each AI faction's birdsong, ask the bot for actions until phase advances.
- Difficulty: v1 ships one difficulty (~"normal"). Difficulty knobs are a Phase 9 task.
- **Milestone**: a full 4-player game where the human picks one faction and AI plays the other three to a winner.

### Phase 7 — Setup wizard + win conditions + end game (≈2 days)

- Setup UI: pick your faction (and Vagabond character if applicable), confirm starting positions.
- Victory: 30 VP, dominance card activation + survive a turn with held suits, Vagabond coalition.
- End-game screen: final scores, winner banner, "new game" / "rematch with same factions".
- **Milestone**: complete game loop, start to win.

### Phase 8 — Polish (≈3 days)

- Animations: warriors sliding between clearings, cards flipping into discard, score counter ticking up.
- Sound: optional. Subtle "click", "battle dice", "score". Toggle off by default.
- Save/load to `localStorage` (the entire `GameState` is JSON-safe by construction).
- Accessibility: keyboard navigation for ActionBar, ARIA labels on clearings, color-blind-safe faction colors.
- Game log: filterable by faction, jump-to-state debug (developer-only flag).
- **Milestone**: shippable v1.

### Phase 9 — Stretch (not v1)

- Difficulty levels (bot heuristic strength).
- MCTS-based "strong" AI as an alternative engine.
- Riverfolk box factions.
- Replay/undo (would require storing the action log, not just state).

### Phase 10 — LAN multiplayer with bot fill (≈1 week, post-v1)

Goal: 2–4 humans on the **same local network** share a game; any unfilled seats are taken by the existing bots. No internet, no public hosting, no accounts. The single-player experience continues to work offline.

Since this is LAN-only (functionally equivalent to playing the physical board game on someone's coffee table), there are no new legal implications around the assets — same private-use model as v1.

#### Key design decisions

- **Host's machine is the server**. One player launches the app in "host a game" mode; their machine runs both the UI *and* a small local WebSocket server. Other players on the LAN connect to it from their browser via `http://<host-ip>:<port>`.
- **Server-authoritative**. Even on a LAN, the host's machine is the source of truth. Clients send `Action`s, the host runs the engine, broadcasts the resulting state. This isn't about anti-cheat — it's about *hidden information*: each player's hand, the Alliance's supporters deck, and Vagabond's face-down items must not be sent to other clients. State filtering on the host is the only correct design.
- **Same engine, same bots, host-side**. The engine module is already pure TS with injected RNG. The bots from Phase 6 run on the host machine on a tick after each human action.
- **No persistence layer**. Game state is in memory on the host. If the host's browser tab closes, the game ends. (Save/load to host's `localStorage` from Phase 8 still works for the host.)

#### Stack additions

- Bundle a small Node + TS server with the app. Two practical options:
  1. **Electron / Tauri wrapper**: ship the whole thing as a desktop app; the host gets a "Host LAN game" button that opens the server on a port. Cleanest UX, biggest dependency.
  2. **`npm start` host mode**: the host runs the app from a terminal with `npm run host`; it prints `Game running at http://192.168.x.x:5173`. Zero packaging work, but the host needs Node installed.

  **Recommendation**: start with option 2 during development; revisit Electron/Tauri only if non-technical players actually need to host.
- `ws` library for the WebSocket server. No external services, no cloud.
- mDNS discovery via `bonjour-service` is nice-to-have so clients can find `root.local` instead of typing an IP. Not a blocker.

#### Data flow

```
Host machine
┌────────────────────────────────────────────┐
│  Host's browser ───▶ Local WS server       │
│                       │                    │
│                       ├──engine.reducer    │
│                       ├──bots (for unfilled│
│                       │  seats)            │
│                       └──per-player view   │
│                          filtering         │
└─────────────────────────────┬──────────────┘
                              │ LAN WebSocket
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
        Client B          Client C        Client D
        (browser)         (browser)       (browser)
```

The host applies a **per-player view filter** before broadcasting: each client only sees its own hand, its own supporters deck, its own Vagabond face-down items. The full state never leaves the host.

#### Engine changes required

Small but real — these are additive and don't change single-player behavior:

- **`view(state, asFaction)` projection function**. Strips hidden info. Must be added in Phase 10, not retrofitted later.
- **Per-faction action authorization**. The engine already validates legality; it now must also validate *authority* — Marquise's seat cannot dispatch Eyrie actions. Add `Action.requestedBy: Faction` and reject mismatches.
- **Reaction prompts must be addressable**. When the engine pauses for an ambush decision, the host must know *which* player to ask. Prompts already live in `state.turn.pendingPrompts`; tag each prompt with the responsible faction.

#### Lobby and seat management

- Host launches the app and clicks "Host LAN game" → server starts, displays the LAN URL.
- Players on the same Wi-Fi open the URL in their browser. They see a lobby with 4 faction slots.
- Each joining player claims a faction slot (with display name). Vagabond players also pick a character.
- Host clicks "Start game"; unfilled slots auto-fill with bots.
- **Mid-game disconnect**: if a human's connection drops, their faction is taken over by the bot after a 60-second grace period. If they reconnect (same browser, same name), they reclaim the seat. Pause-on-disconnect was considered but is brutal for a 90-minute game and overkill on a LAN where reconnect is fast.

#### Milestones inside Phase 10

1. **Lobby infra**: host starts server, others join via URL, see names populate the seats. No game logic yet.
2. **Echo round**: host clicks "Start", host's engine runs, state broadcasts to all clients, clients render the board. No client actions accepted yet.
3. **Authoritative actions**: clients can send actions; host validates authority + legality + applies. One full Marquise turn across two browsers.
4. **View filtering**: hands are hidden from non-owners. Verified by inspecting the WebSocket traffic — no card IDs leak to the wrong client.
5. **Bot fill**: bots run on the host for unfilled seats. Three humans + one bot game completes.
6. **Reconnect + bot takeover**: kill a client mid-game, watch the bot take over after 60s, reconnect to reclaim.
7. **Polish**: connection status indicators, "waiting for X" overlay during others' turns, optional text chat.

#### Out of scope for Phase 10

- Cross-network / internet play (would reintroduce the legal issue and require hosting infrastructure).
- Spectators.

Players coordinate out-of-band (text, voice, in person) and simply join the host's URL — no matchmaking layer, no accounts. The whole experience targets the desktop browser; phones aren't a goal.

## Testing strategy

Synthetic tests run on every commit. The bar is: **if the test suite is green, every faction can complete a legal game**. Confidence in a 4-faction asymmetric rules engine comes from breadth, not depth — many small focused tests, plus a few high-leverage simulation tests.

### Layers

```
┌─────────────────────────────────────────┐
│  E2E (Playwright)        ~5 tests       │  happy path only
├─────────────────────────────────────────┤
│  Headless game runner    bot-vs-bot     │  the big-leverage test
├─────────────────────────────────────────┤
│  Property tests (fast-check)            │  invariants
├─────────────────────────────────────────┤
│  Engine unit tests (Vitest)             │  the bulk of the suite
└─────────────────────────────────────────┘
```

### 1. Engine unit tests — `src/engine/__tests__/`

Co-located with the engine modules. The reducer is pure, so tests are trivially fast and isolated.

- **Setup**: `setup.test.ts` — initial positions for each faction match the rulebook; starting hand sizes (3 each); item supply (16); ruin placement; dominance cards available.
- **Map**: `map.test.ts` — clearing adjacency is symmetric; suit distribution matches the autumn map (4/4/4 + 2 forests adjacencies); ruin slots in the correct clearings.
- **Combat**: `combat.test.ts` — exhaustive coverage of the combat matrix:
  - 2 attackers vs 0 defenders → max die to attacker, no rolls capped by defender warriors.
  - Defender has ambush card of matching suit → resolves before dice.
  - Both sides have ambush → cancel.
  - Building/token removal priority (attacker chooses if multiple eligible).
  - Outrage: Alliance receives a supporter when sympathetic clearing is attacked.
  - Cap on warriors removed = warriors present.
  - Vagabond exhausts swords for hits and torch for ambush.
- **Cards**: `cards.test.ts` — crafting cost validation; ambush playable only as defender; dominance activation requires 10+ VP and unlocks domination victory check; persistent effects (Cobbler, Tax Collector, etc.).
- **Per-faction reducers**: one test file per faction (`marquise.test.ts`, `eyrie.test.ts`, `alliance.test.ts`, `vagabond.test.ts`). For each action kind: a legal case, an illegal case (asserts `getLegalActions` excludes it), and at least one edge case from the *Law of Root*.
- **Turn loop**: `loop.test.ts` — phase transitions (birdsong→daylight→evening→next faction); victory triggers (30 VP, dominance hold-through-turn, Vagabond coalition); turmoil for unfulfilled decree.
- **Rules edge cases**: `rules-edge-cases.test.ts` — grows over time. Every bug found in playtesting gets a regression test here. Examples to seed it:
  - Hand size enforcement during reactions (you can be forced over 5 by Better Burrow Bank, then must discard).
  - Outrage when no cards in attacker's hand (Alliance picks from deck).
  - Vagabond moving into a hostile clearing exhausts boots even if no battle follows.
  - Eyrie decree resolution must continue after a slot fails *if* the failure is on a different slot.

### 2. Property-based tests — `src/engine/__tests__/properties.test.ts`

Using `fast-check`. Six load-bearing invariants:

1. **Warrior conservation**: total warriors per faction across the board + supply = starting total, always.
2. **Item conservation**: total items on map + in vagabond's possession + in supply + on cards = 16, always.
3. **Scores monotonic**: a faction's score never decreases (modulo turmoil, which is the *only* exception — assert turmoil is the only state transition that decrements).
4. **Hand size bounded at end of turn**: ≤5 after evening's discard step.
5. **Determinism**: `apply(seed, actions)` produces the same final state regardless of when or where it runs.
6. **Legal-action soundness**: every action returned by `getLegalActions(s)` succeeds when applied via the reducer. No "legal but rejected" actions.

Property tests run with 100 random inputs each by default, 1000 in CI.

### 3. Headless game runner — `src/sim/`

The single most valuable test for a complex asymmetric game. A CLI that plays bot-vs-bot games with no UI:

```
npm run sim -- --games 1000 --seed-start 1
```

For each game:
- Random faction assignment, fixed bot per faction.
- Seeded RNG.
- Run until a winner or hard cap (200 turns) is reached.
- Record: winner, faction, turn count, final scores, any errors.

Outputs an aggregate report:
- **Crash rate**: must be 0. Any uncaught exception fails CI.
- **Stuck-game rate**: games hitting the 200-turn cap. Must be <1%.
- **Faction win-rate distribution**: sanity check (no faction should be 0% or 100%; healthy range is ~15–40% each).
- **Average game length**: should land in 25–60 turns.
- **Action histogram**: counts of each action kind played. Surfaces dead actions (legal but never chosen by any bot) and runaway loops.

This catches what unit tests can't: emergent rule interactions across factions, infinite loops, AI dead-ends, balance regressions after a bot change. Runs nightly in CI on 10,000 games; on every PR on 200 games.

### 4. AI bot tests — `src/bots/__tests__/`

- `legality`: for 100 random states (generated by mid-game snapshots from the headless runner), `bot.decide(state)` returns an action that is in `getLegalActions(state)`. No exceptions.
- `reactions`: for each kind of reaction prompt (ambush, hit assignment, card discard choice), the bot returns a valid response.
- `determinism`: `bot.decide(state)` is a pure function — same input, same output.
- `progress`: in a 100-turn budget, the bot never returns the same `(state, action)` pair twice in a row (loop guard).

### 5. UI E2E — `tests/e2e/`

Playwright, kept small. The unit + sim suites do the heavy lifting; E2E exists to catch wiring bugs between engine and UI.

- `start-game.spec.ts`: load the app, complete setup wizard, see board rendered with all factions placed.
- `marquise-turn.spec.ts`: human plays a full Marquise turn (build, recruit, battle, end turn); next bot turn animates; state log shows expected entries.
- `victory.spec.ts`: force a near-win state via a test hook, play winning action, see victory screen.
- `save-load.spec.ts`: save mid-game, reload page, resume to identical state.
- `multiplayer-view-filter.spec.ts` (Phase 10): two browser contexts in one test; assert client B's WebSocket frames never contain client A's hand card IDs.

### 6. Regression corpus — `tests/fixtures/games/`

Recorded action logs from real games (especially weird ones). Each fixture is `{seed, actions[], expectedFinalScores}`. The test replays it and asserts the final state matches. When a bug is fixed, the failing game's log goes into this folder forever.

### Per-phase test gates

Each implementation phase's "milestone" is gated on tests passing, not just on a manual demo. Concretely:

| Phase | New tests required to pass milestone |
|------:|:--------------------------------------|
| 0 | Map adjacency tests; render snapshot of board SVG. |
| 1 | Combat resolver tests; card-deck integrity test. |
| 2 | Full Marquise reducer suite; one headless game where Marquise reaches 30 VP against empty opponents. |
| 3 | Full Eyrie reducer suite incl. turmoil; Eyrie vs. Marquise headless game completes. |
| 4 | Full Alliance reducer suite incl. outrage; Alliance vs. Marquise + Eyrie headless completes. |
| 5 | Full Vagabond reducer suite; Vagabond coalition win in a headless game. |
| 6 | Bot legality + determinism tests; **sim runner**: 1000 bot-vs-bot games, 0 crashes, win-rate in expected band. |
| 7 | Victory-condition tests for all 3 win types; setup wizard E2E. |
| 8 | Save/load E2E; property-test suite at full 1000-input strength in CI. |
| 10 | View-filter E2E (no hand leaks); bot-takeover-on-disconnect integration test. |

### CI

- **Per PR**: unit tests + property tests (100 inputs) + 200 sim games + Playwright E2E. Target: <3 minutes.
- **Nightly**: property tests (1000 inputs) + 10,000 sim games + regression corpus. Target: <15 minutes.
- Coverage target: 90% line coverage on `src/engine/`. UI coverage is not gated.

## Risks and unknowns

- **Rules edge cases**. Root has notorious corner cases (e.g., what counts as a building for outrage, hand size limits during reactions, item-exhaust ordering). Mitigation: a dedicated `engine/__tests__/rules-edge-cases.test.ts` file that grows as cases come up. Treat the *Law of Root* (the FAQ document) as the authoritative rules reference, not the rulebook.
- **AI quality**. Scripted bots play *functionally*, not *well*. They'll lose to a skilled human consistently. Acceptable for v1 — fun > optimal. Re-evaluate after playing 10 games.
- **Asset legality**. As stated, this project cannot be published. If the goal ever shifts to public release, Phase 0 needs to be re-done with a placeholder asset layer behind an `IAssets` interface so swapping is trivial.
- **Vagabond complexity**. The Vagabond's item-track interaction model is genuinely hard to UI. Budget extra time for Phase 5; consider building it as a separate prototype before integrating.

## Open questions for review

1. Is the **scripted-bot AI** approach acceptable, or do you specifically want MCTS / "learning" AI? (Big effort difference.)
2. Do you want **undo / take-back**? It's free if we keep the action log, but it inflates save size and complicates AI bots. Default: no undo in v1.
3. **Game length per session**: a real Root game is 60–90 minutes. Should we add a "fast game" mode (e.g., 20 VP target) for testing/dev?
4. **Animation budget**: nice-to-have or essential? Adding rich animations to Phase 8 doubles polish time.
