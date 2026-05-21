// Seeded RNG. The engine is pure; randomness is injected via state.seed.
// We re-derive a generator from the seed each time we need it, so the
// reducer remains a true (state, action) => state pure function.

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Roll a Root combat die (values 0,0,1,1,2,3). */
export function rollDie(rng: () => number): number {
  const faces = [0, 0, 1, 1, 2, 3] as const;
  return faces[Math.floor(rng() * faces.length)]!;
}

/** Shuffle a copy of the array using Fisher-Yates with the given rng. */
export function shuffle<T>(arr: readonly T[], rng: () => number): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** Mix a sub-stream seed deterministically from the parent seed and a tag. */
export function mixSeed(seed: number, tag: number): number {
  let h = (seed ^ (tag * 2654435761)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}
