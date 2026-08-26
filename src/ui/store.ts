import { create } from 'zustand';
import { produce } from 'immer';
import type { GameState, Action, Faction, DeckVariant } from '../engine/types';
import { newGame, reduce } from '../engine/state';
import { checkVictory } from '../engine/loop';
import { getLegalActions } from '../engine/legal';
import { checkCoalitionVictory } from '../engine/factions/vagabond/reducer';
import type { VagabondCharacter } from '../engine/factions/vagabond/state';
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
  deckVariant?: DeckVariant;
}

interface Store {
  state: GameState;
  playerFaction: Faction | null;
  history: GameState[];
  /** Index of the last log entry that should be highlighted as new (for animations). */
  lastLogLen: number;
  /** Logical "tick" counter for score animations (incremented when scores change). */
  scoreTick: Record<Faction, number>;
  dispatch: (action: Action) => void;
  undo: () => void;
  reset: (seed?: number) => void;
  begin: (faction: Faction, opts?: BeginOptions) => void;
  loadSaved: () => boolean;
  hasSavedGame: () => boolean;
  loadSnapshot: (state: GameState, playerFaction?: Faction | null) => void;
}

function postAction(prev: GameState, next: GameState, scoreTick: Record<Faction, number>): { state: GameState; scoreTick: Record<Faction, number> } {
  const s = checkCoalitionVictory(checkVictory(next));
  const tick = { ...scoreTick };
  for (const f of Object.keys(s.scores) as Faction[]) {
    if (s.scores[f] !== prev.scores[f]) tick[f] = (tick[f] ?? 0) + 1;
  }
  return { state: s, scoreTick: tick };
}

function autoAdvanceSystemSteps(
  state: GameState,
  scoreTick: Record<Faction, number>,
): { state: GameState; scoreTick: Record<Faction, number> } {
  let cur = state;
  let tick = { ...scoreTick };
  for (let i = 0; i < 48; i++) {
    if (cur.phase === 'setup' || cur.phase === 'gameOver' || cur.winner) return { state: cur, scoreTick: tick };
    if (cur.pendingPrompts.length > 0) return { state: cur, scoreTick: tick };
    const legal = getLegalActions(cur);
    if (legal.length === 0) return { state: cur, scoreTick: tick };
    const hasNonSystem = legal.some((a) => !a.kind.startsWith('system.'));
    if (hasNonSystem) return { state: cur, scoreTick: tick };

    let next = cur;
    if (legal.some((a) => a.kind === 'system.advancePhase')) {
      next = reduce(cur, { kind: 'system.advancePhase' });
    } else if (legal.some((a) => a.kind === 'system.endTurn')) {
      next = reduce(cur, { kind: 'system.endTurn' });
    }
    if (next === cur) return { state: cur, scoreTick: tick };
    const post = postAction(cur, next, tick);
    cur = post.state;
    tick = post.scoreTick;
  }
  return { state: cur, scoreTick: tick };
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

const initial = newGame();
const ZERO_TICK: Record<Faction, number> = { marquise: 0, eyrie: 0, alliance: 0, vagabond: 0 };

export const useGame = create<Store>((set, get) => ({
  state: initial,
  playerFaction: null,
  history: [],
  lastLogLen: 0,
  scoreTick: ZERO_TICK,

  dispatch: (action) => {
    const before = get().state;
    const after = reduce(before, action);
    const post = postAction(before, after, get().scoreTick);
    const advanced = autoAdvanceSystemSteps(post.state, post.scoreTick);
    const prevHistory = get().history;
    const newHistory = [...prevHistory, before].slice(-20);
    set({ state: advanced.state, scoreTick: advanced.scoreTick, history: newHistory });
    saveToStorage(advanced.state, get().playerFaction);
    scheduleAITurn();
  },

  undo: () => {
    const { history, playerFaction } = get();
    if (history.length === 0) return;
    const prev = history[history.length - 1]!;
    const newHistory = history.slice(0, -1);
    set({ state: prev, history: newHistory });
    saveToStorage(prev, playerFaction);
    scheduleAITurn();
  },

  reset: (seed) => {
    clearStorage();
    set({ state: newGame({ seed }), playerFaction: null, scoreTick: ZERO_TICK, history: [] });
  },

  begin: (faction, opts) => {
    // Recreate the game with the chosen deck variant so the deck is correct before setup.
    let base = newGame({ seed: get().state.seed, deckVariant: opts?.deckVariant ?? 'base' });
    if (opts?.vagabondCharacter) {
      base = produce(base, draft => {
        if (draft.factions.vagabond) {
          // Only set the character; setupVagabond() will add the correct starting items.
          draft.factions.vagabond.character = opts.vagabondCharacter!;
          draft.factions.vagabond.items = [];
        }
      });
    }
    const withPreference = produce(base, draft => {
      if (faction === 'vagabond' && opts?.vagabondCharacter && draft.setup) {
        draft.setup.vagabondCharacterChosen = true;
      }
    });
    set({ state: withPreference, playerFaction: faction, scoreTick: ZERO_TICK, history: [] });
    saveToStorage(withPreference, faction);
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

  loadSnapshot: (state, playerFaction) => {
    const resolvedPlayerFaction = playerFaction ?? get().playerFaction;
    set({ state, playerFaction: resolvedPlayerFaction, scoreTick: ZERO_TICK, history: [] });
    saveToStorage(state, resolvedPlayerFaction);
    scheduleAITurn();
  },
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
  const startAdvanced = autoAdvanceSystemSteps(state, scoreTick);
  if (startAdvanced.state !== state) {
    useGame.setState({ state: startAdvanced.state, scoreTick: startAdvanced.scoreTick });
    saveToStorage(startAdvanced.state, playerFaction);
  }
  const current = useGame.getState();
  const activeState = current.state;
  const activeScoreTick = current.scoreTick;
  if (state.winner) return;
  if (activeState.winner) return;
  if (activeState.phase === 'gameOver') return;
  // Pending prompts (e.g. defender ambush) freeze the active-faction
  // check — the respondent answers instead. Wait if it's the human.
  if (activeState.pendingPrompts.length > 0) {
    const respondent = activeState.pendingPrompts[0]!.faction;
    if (respondent === playerFaction) return;
  } else {
    const active = activeState.factionOrder[activeState.activeIndex];
    if (active === playerFaction) return;
  }
  const action = pickAction(activeState);
  if (!action) return;
  // Safety: never dispatch a faction-prefixed action for the human player's faction.
  if (playerFaction && action.kind.startsWith(`${playerFaction}.`)) return;
  let next = reduce(activeState, action);
  if (next === activeState) {
    // Reducer rejected — force phase advance.
    next = reduce(activeState, { kind: 'system.advancePhase' });
    if (next === activeState) return;
  }
  const post = postAction(activeState, next, activeScoreTick);
  const advanced = autoAdvanceSystemSteps(post.state, post.scoreTick);
  if (seq !== aiSequence) return; // superseded by a reset
  useGame.setState({ state: advanced.state, scoreTick: advanced.scoreTick });
  saveToStorage(advanced.state, playerFaction);
  scheduleAITurn();
}
