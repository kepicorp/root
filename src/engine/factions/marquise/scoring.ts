// Marquise VP tracks. VP gained when placing the Nth building.

export const SAWMILL_TRACK   = [0, 1, 2, 3, 4, 5] as const;
export const WORKSHOP_TRACK  = [0, 2, 2, 3, 4, 5] as const;
export const RECRUITER_TRACK = [0, 1, 2, 3, 4, 5] as const;

export function vpForBuilding(
  building: 'sawmill' | 'workshop' | 'recruiter',
  nthAfterPlace: number, // 1-based; this is the count after placing
): number {
  const idx = nthAfterPlace - 1;
  const track =
    building === 'sawmill'   ? SAWMILL_TRACK :
    building === 'workshop'  ? WORKSHOP_TRACK :
    RECRUITER_TRACK;
  return track[idx] ?? 0;
}

/** Build cost in wood for the Nth building of a kind. */
export function buildCost(currentCount: number): number {
  return currentCount + 1;
}
