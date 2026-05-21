// Decorative forest tree scatter. Deterministic positions so the map looks
// the same across renders. Trees fill the non-clearing space.

import { AUTUMN_MAP } from '../engine/map';

const BOARD_W = 1000;
const BOARD_H = 800;
const CLEARING_RADIUS = 95; // keep trees out of clearings + their inner buffer

// Tiny seeded RNG so the scatter is stable.
function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface TreeSpec { x: number; y: number; s: number; kind: 0 | 1 | 2; }

function generateTrees(): TreeSpec[] {
  const rng = mulberry(13371337);
  const out: TreeSpec[] = [];
  const cell = 56;
  for (let y = cell / 2; y < BOARD_H; y += cell) {
    for (let x = cell / 2; x < BOARD_W; x += cell) {
      const jx = x + (rng() - 0.5) * cell * 0.6;
      const jy = y + (rng() - 0.5) * cell * 0.6;
      // Skip if too close to any clearing center.
      let tooClose = false;
      for (const c of AUTUMN_MAP.clearings) {
        const dx = c.x - jx, dy = c.y - jy;
        if (dx * dx + dy * dy < CLEARING_RADIUS * CLEARING_RADIUS) { tooClose = true; break; }
      }
      if (tooClose) continue;
      const s = 0.7 + rng() * 0.7;
      const kind = Math.floor(rng() * 3) as 0 | 1 | 2;
      out.push({ x: jx, y: jy, s, kind });
    }
  }
  return out;
}

const TREES = generateTrees();

function ConiferTree({ x, y, s }: { x: number; y: number; s: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <ellipse cx={0} cy={14} rx={11} ry={3} fill="#1a1410" opacity="0.4" />
      <polygon points="-14,12 0,-18 14,12" fill="#3d5a2a" stroke="#1f3315" strokeWidth={1.2} />
      <polygon points="-11,2 0,-26 11,2" fill="#4a6b3a" stroke="#1f3315" strokeWidth={1.2} />
      <polygon points="-8,-8 0,-32 8,-8" fill="#5a7d44" stroke="#1f3315" strokeWidth={1.2} />
      <rect x={-2.5} y={12} width={5} height={5} fill="#5c3f1e" stroke="#1f3315" strokeWidth={1} />
    </g>
  );
}

function RoundTree({ x, y, s }: { x: number; y: number; s: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <ellipse cx={0} cy={14} rx={12} ry={3} fill="#1a1410" opacity="0.4" />
      <circle cx={0} cy={-2} r={14} fill="#4a6b3a" stroke="#1f3315" strokeWidth={1.2} />
      <circle cx={-6} cy={-8} r={9} fill="#5a7d44" stroke="#1f3315" strokeWidth={1.2} />
      <circle cx={6} cy={-4} r={8} fill="#3d5a2a" stroke="#1f3315" strokeWidth={1.2} />
      <rect x={-2.5} y={12} width={5} height={6} fill="#5c3f1e" stroke="#1f3315" strokeWidth={1} />
    </g>
  );
}

function BareTree({ x, y, s }: { x: number; y: number; s: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <ellipse cx={0} cy={14} rx={10} ry={2} fill="#1a1410" opacity="0.4" />
      <ellipse cx={0} cy={-4} rx={11} ry={14} fill="#6b7d2f" stroke="#1f3315" strokeWidth={1.2} />
      <circle cx={-7} cy={-6} r={6} fill="#7d8f3a" stroke="#1f3315" strokeWidth={1.2} />
      <circle cx={7} cy={-2} r={5} fill="#5a7d44" stroke="#1f3315" strokeWidth={1.2} />
      <rect x={-2} y={10} width={4} height={6} fill="#5c3f1e" stroke="#1f3315" strokeWidth={1} />
    </g>
  );
}

export function Trees() {
  return (
    <g aria-hidden>
      {TREES.map((t, i) => {
        if (t.kind === 0) return <ConiferTree key={i} {...t} />;
        if (t.kind === 1) return <RoundTree   key={i} {...t} />;
        return <BareTree   key={i} {...t} />;
      })}
    </g>
  );
}
