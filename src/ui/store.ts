import { create } from 'zustand';
import { produce } from 'immer';
import type { GameState, Action, Faction } from '../engine/types';
import { newGame, reduce } from '../engine/state';
import { startGame, checkVictory } from '../engine/loop';
import { performSetup } from '../engine/setup';
import { checkCoalitionVictory } from '../engine/factions/vagabond/reducer';
import type { VagabondCharacter } from '../engine/factions/vagabond/state';
import { STARTING_ITEMS } from '../engine/factions/vagabond/state';
import { pickAction } from '../bots/bot';

const SAVE_KEY = 'root-save-v1';
const BOT_TICK_MS = 350;

interface SavedGame {
  state: GameState;
  playerFaction: Faction | null;
  version: 1;
}

interface BeginOptions {
  vagabondCharacter?: VagabondCharacter;
}

interface Store {
  state: GameState;
  playerFaction: Faction | null;
  /** Index of the last log entry that should be highlighted as new (for animations). */
  lastLogLen: number;
  /** Logical "tick" counter for score animations (incremented when scores change). */
  scoreTick: Record<Faction, number>;
  dispatch: (action: Action) => void;
  reset: (seed?: number) => void;
  begin: (faction: Faction, opts?: BeginOptions) => void;
  loadSaved: () => boolean;
  hasSavedGame: () => boolean;
}

function postAction(prev: GameState, next: GameState, scoreTick: Record<Faction, number>): { state: GameState; scoreTick: Record<Faction, number> } {
  const s = checkCoalitionVictory(checkVictory(next));
  const tick = { ...scoreTick };
  for (const f of Object.keys(s.scores) as Faction[]) {
    if (s.scores[f] !== prev.scores[f]) tick[f] = (tick[f] ?? 0) + 1;
  }
  return { state: s, scoreTick: tick };
}

function saveToStorage(state: GameState, playerFaction: Faction | null): void {
  try {
    const payload: SavedGame = { state, playerFaction, version: 1 };
    localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
  } catch { /* quota or no localStorage in node */ }
}

function loadFromStorage(): SavedGame | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedGame;
    if (parsed.version !== 1) return null;
    return parsed;
  } catch { return null; }
}

function clearStorage(): void {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
}

const initial = newGame({ seed: 1 });
const ZERO_TICK: Record<Faction, number> = { marquise: 0, eyrie: 0, alliance: 0, vagabond: 0 };

export const useGame = create<Store>((set, get) => ({
  state: initial,
  playerFaction: null,
  lastLogLen: 0,
  scoreTick: ZERO_TICK,

  dispatch: (action) => {
    const before = get().state;
    const after = reduce(before, action);
    const post = postAction(before, after, get().scoreTick);
    set({ state: post.state, scoreTick: post.scoreTick });
    saveToStorage(post.state, get().playerFaction);
    scheduleAITurn();
  },

  reset: (seed) => {
    clearStorage();
    set({ state: newGame({ seed }), playerFaction: null, scoreTick: ZERO_TICK });
  },

  begin: (faction, opts) => {
    let base = get().state;
    if (opts?.vagabondCharacter) {
      base = produce(base, draft => {
        if (draft.factions.vagabond) {
          draft.factions.vagabond.character = opts.vagabondCharacter!;
          draft.factions.vagabond.items = [];
          for (const kind of STARTING_ITEMS[opts.vagabondCharacter!]) {
            draft.factions.vagabond.items.push({ kind, state: 'face-up', exhausted: false });
          }
        }
      });
    }
    const started = startGame(performSetup(base));
    set({ state: started, playerFaction: faction, scoreTick: ZERO_TICK });
    saveToStorage(started, faction);
    scheduleAITurn();
  },

  loadSaved: () => {
    const saved = loadFromStorage();
    if (!saved) return false;
    set({ state: saved.state, playerFaction: saved.playerFaction, scoreTick: ZERO_TICK });
    scheduleAITurn();
    return true;
  },

  hasSavedGame: () => loadFromStorage() !== null,
}));

let aiTimer: ReturnType<typeof setTimeout> | null = null;
let aiSequence = 0;

function scheduleAITurn(): void {
  if (aiTimer != null) return;
  aiTimer = setTimeout(runOneAIAction, BOT_TICK_MS);
}

function runOneAIAction(): void {
  aiTimer = null;
  const seq = ++aiSequence;
  const { state, playerFaction, scoreTick } = useGame.getState();
  if (state.winner) return;
  if (state.phase === 'setup' || state.phase === 'gameOver') return;
  // Pending prompts (e.g. defender ambush) freeze the active-faction
  // check — the respondent answers instead. Wait if it's the human.
  if (state.pendingPrompts.length > 0) {
    const respondent = state.pendingPrompts[0]!.faction;
    if (respondent === playerFaction) return;
  } else {
    const active = state.factionOrder[state.activeIndex];
    if (active === playerFaction) return;
  }
  const action = pickAction(state);
  if (!action) return;
  let next = reduce(state, action);
  if (next === state) {
    // Reducer rejected — force phase advance.
    next = reduce(state, { kind: 'system.advancePhase' });
    if (next === state) return;
  }
  const post = postAction(state, next, scoreTick);
  if (seq !== aiSequence) return; // superseded by a reset
  useGame.setState({ state: post.state, scoreTick: post.scoreTick });
  saveToStorage(post.state, playerFaction);
  scheduleAITurn();
}
