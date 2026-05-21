import { produce } from 'immer';
import type { GameState } from '../../types';
import { getCard } from '../../cards';

export const EYRIE_CORNER = 12;

export function setupEyrie(state: GameState): GameState {
  return produce(state, draft => {
    const e = draft.factions.eyrie;
    if (!e) return;
    const cl = draft.map.clearings[EYRIE_CORNER]!;
    // Remove any Marquise warrior in the corner.
    const removed = cl.warriors.marquise ?? 0;
    if (removed > 0) {
      cl.warriors.marquise = 0;
      if (draft.factions.marquise) draft.factions.marquise.warriorSupply += removed;
    }
    // Place roost + 6 warriors.
    cl.buildings.push({ faction: 'eyrie', kind: 'roost' });
    e.roosts.push(EYRIE_CORNER);
    cl.warriors.eyrie = (cl.warriors.eyrie ?? 0) + 6;
    e.warriorSupply -= 6;

    // Take 2 bird-suit cards from the deck (if available) as viziers.
    const birdIdx = draft.deck.map((id, i) => ({ id, i, suit: getCard(id).suit }))
      .filter(x => x.suit === 'bird')
      .slice(0, 2);
    for (const x of birdIdx.reverse()) {
      e.viziers.push(x.id);
      draft.deck.splice(x.i, 1);
    }
    // Place viziers in default slots (despot: move + battle).
    if (e.viziers[0]) e.decree.move.push(e.viziers[0]);
    if (e.viziers[1]) e.decree.battle.push(e.viziers[1]);

    draft.log.push({
      turn: draft.turn,
      faction: 'eyrie',
      message: `Setup: roost + 6 warriors in clearing ${EYRIE_CORNER}; leader = ${e.leader}.`,
    });
  });
}
