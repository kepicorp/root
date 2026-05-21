// Headless game runner — drives the engine without UI.
//
// Used by:
//   - `npm run sim` to play many AI-vs-AI games and report aggregate stats.
//   - The regression corpus to replay recorded action logs.
//
// Phase 6 wires in real bots. For Phase 1, the "bot" just advances phases
// until a victory or the turn cap is reached.

import type { GameState, Action } from '../engine/types';
import { newGame, reduce } from '../engine/state';
import { startGame, checkVictory } from '../engine/loop';
import { performSetup } from '../engine/setup';

export interface SimResult {
  seed: number;
  turns: number;
  winner: string | null;
  via: string | null;
  finalScores: Record<string, number>;
  steps: number;
  ended: 'victory' | 'turnCap' | 'crashed' | 'stuck';
  error?: string;
}

export interface SimOptions {
  seed: number;
  /** Maximum global turns before declaring the game stuck. Default 200. */
  turnCap?: number;
  /** Maximum reducer calls before bailing out. Default 100,000. */
  stepCap?: number;
  /** Decision policy per faction. Defaults to "advance phase". */
  policy?: (state: GameState) => Action;
}

const defaultPolicy = (_state: GameState): Action => ({ kind: 'system.advancePhase' });

export function runOne(opts: SimOptions): SimResult {
  const policy = opts.policy ?? defaultPolicy;
  const turnCap = opts.turnCap ?? 200;
  const stepCap = opts.stepCap ?? 100_000;
  let state = startGame(performSetup(newGame({ seed: opts.seed })));
  let steps = 0;
  try {
    while (!state.winner && state.turn <= turnCap && steps < stepCap) {
      const action = policy(state);
      const next = reduce(state, action);
      // Stuck detection: action had no effect at all.
      if (next === state || JSON.stringify(next.scores) === JSON.stringify(state.scores) && next.turn === state.turn && next.phase === state.phase && next.activeIndex === state.activeIndex) {
        // Fall back to phase advance to make progress.
        state = reduce(state, { kind: 'system.advancePhase' });
      } else {
        state = next;
      }
      state = checkVictory(state);
      steps += 1;
    }
    const ended: SimResult['ended'] =
      state.winner ? 'victory' :
      state.turn > turnCap ? 'turnCap' :
      'stuck';
    return {
      seed: opts.seed,
      turns: state.turn,
      winner: state.winner?.faction ?? null,
      via: state.winner?.via ?? null,
      finalScores: state.scores,
      steps,
      ended,
    };
  } catch (e) {
    return {
      seed: opts.seed,
      turns: state.turn,
      winner: null,
      via: null,
      finalScores: state.scores,
      steps,
      ended: 'crashed',
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export interface AggregateReport {
  games: number;
  crashes: number;
  stuck: number;
  victories: number;
  avgTurns: number;
  avgSteps: number;
  wins: Record<string, number>;
}

export function runMany(opts: { count: number; seedStart?: number } & Omit<SimOptions, 'seed'>): AggregateReport {
  const seedStart = opts.seedStart ?? 1;
  const results: SimResult[] = [];
  for (let i = 0; i < opts.count; i++) {
    results.push(runOne({ ...opts, seed: seedStart + i }));
  }
  const report: AggregateReport = {
    games: results.length,
    crashes: results.filter(r => r.ended === 'crashed').length,
    stuck: results.filter(r => r.ended === 'stuck' || r.ended === 'turnCap').length,
    victories: results.filter(r => r.ended === 'victory').length,
    avgTurns: results.reduce((a, r) => a + r.turns, 0) / results.length,
    avgSteps: results.reduce((a, r) => a + r.steps, 0) / results.length,
    wins: {},
  };
  for (const r of results) {
    if (r.winner) report.wins[r.winner] = (report.wins[r.winner] ?? 0) + 1;
  }
  return report;
}
