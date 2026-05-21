// Marquise setup: keep in corner clearing 1, warriors in every clearing except
// Eyrie's corner (12), and 1 sawmill + 1 workshop + 1 recruiter in clearings
// adjacent to or equal to the home corner.

import { produce } from 'immer';
import type { GameState } from '../../types';
import { AUTUMN_MAP, getAdjacent } from '../../map';

export const MARQUISE_CORNER = 1;
export const EYRIE_CORNER = 12;

export function setupMarquise(state: GameState): GameState {
  return produce(state, draft => {
    const m = draft.factions.marquise;
    if (!m) return;

    // Place keep token in clearing 1.
    m.keep = { clearing: MARQUISE_CORNER };
    draft.map.clearings[MARQUISE_CORNER]!.tokens.push({ faction: 'marquise', kind: 'keep' });

    // Place 1 warrior in every clearing except the Eyrie corner.
    let placedWarriors = 0;
    for (const c of AUTUMN_MAP.clearings) {
      if (c.id === EYRIE_CORNER) continue;
      const cl = draft.map.clearings[c.id]!;
      cl.warriors.marquise = (cl.warriors.marquise ?? 0) + 1;
      placedWarriors += 1;
    }
    m.warriorSupply -= placedWarriors;

    // Place initial buildings in corner-or-adjacent clearings.
    const targets = [MARQUISE_CORNER, ...getAdjacent(AUTUMN_MAP, MARQUISE_CORNER)];
    const slots = AUTUMN_MAP.clearings
      .filter(c => targets.includes(c.id))
      .filter(c => draft.map.clearings[c.id]!.buildings.length < c.buildingSlots);

    const placeBuilding = (kind: 'sawmill' | 'workshop' | 'recruiter') => {
      const t = slots.shift();
      if (!t) return;
      draft.map.clearings[t.id]!.buildings.push({ faction: 'marquise', kind });
      m.buildings[kind] += 1;
    };
    placeBuilding('sawmill');
    placeBuilding('workshop');
    placeBuilding('recruiter');

    draft.log.push({
      turn: draft.turn,
      faction: 'marquise',
      message: `Setup: keep in clearing ${MARQUISE_CORNER}, ${placedWarriors} warriors placed, initial buildings deployed.`,
    });
  });
}
