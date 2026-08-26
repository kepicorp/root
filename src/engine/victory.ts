import type { Draft } from 'immer';
import type { Faction, GameState } from './types';

export function awardVictoryPoints(state: Draft<GameState>, faction: Faction, amount: number, reason: string): void {
  if (amount <= 0) return;
  state.scores[faction] = (state.scores[faction] ?? 0) + amount;
  state.log.push({
    turn: state.turn,
    faction,
    message: `Gained ${amount} victory point${amount === 1 ? '' : 's'}: ${reason}.`,
  });
}
