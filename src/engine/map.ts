// Static autumn map data.
//
// Standard 12-clearing autumn map. Suit distribution is 4 fox / 4 mouse / 4 rabbit.
// Corner clearings (1, 3, 10, 12) are the board corners for setup and dominance.
// Ruins sit on the four middle-band clearings.
//
// Coordinates are in a 1000 x 800 board-space and get scaled by the renderer.
// Adjacency mirrors the autumn board's clearing network.

import type { Clearing, Path, RootMap, ClearingId, Forest, ForestId } from './types';

const clearings: readonly Clearing[] = [
  {
    id: 1,
    suit: "fox",
    buildingSlots: 1,
    hasRuin: false,
    x: 108.58832281813702,
    y: 65.47747007886379
  },
  {
    id: 2,
    suit: "rabbit",
    buildingSlots: 2,
    hasRuin: false,
    x: 552.2132994495394,
    y: 40.367541353987235
  },
  {
    id: 3,
    suit: "mouse",
    buildingSlots: 2,
    hasRuin: false,
    x: 889.5662843837258,
    y: 150.80977282883057
  },
  {
    id: 4,
    suit: "rabbit",
    buildingSlots: 2,
    hasRuin: true,
    ruinItem: "crossbow",
    x: 424.5659462227418,
    y: 208.31632468206905
  },
  {
    id: 5,
    suit: "mouse",
    buildingSlots: 2,
    hasRuin: false,
    x: 99.93140162896977,
    y: 314.0541780896366
  },
  {
    id: 6,
    suit: "fox",
    buildingSlots: 2,
    hasRuin: true,
    ruinItem: "hammer",
    x: 318.209485898687,
    y: 444.526032294296
  },
  {
    id: 7,
    suit: "mouse",
    buildingSlots: 3,
    hasRuin: true,
    ruinItem: "boots",
    x: 632.9504062762678,
    y: 386.4011304211302
  },
  {
    id: 8,
    suit: "fox",
    buildingSlots: 2,
    hasRuin: true,
    ruinItem: "sword",
    hasRiver: true,
    x: 905.6434237350363,
    y: 421.0287315370588
  },
  {
    id: 9,
    suit: "mouse",
    buildingSlots: 2,
    hasRuin: false,
    x: 580.3905276277524,
    y: 647.9631888503761
  },
  {
    id: 10,
    suit: "rabbit",
    buildingSlots: 1,
    hasRuin: false,
    x: 110.44337735867286,
    y: 686.9192401057958
  },
  {
    id: 11,
    suit: "fox",
    buildingSlots: 2,
    hasRuin: false,
    x: 370.15101303369045,
    y: 758.0294923974348
  },
  {
    id: 12,
    suit: "rabbit",
    buildingSlots: 1,
    hasRuin: false,
    hasRiver: true,
    x: 817.83750881634,
    y: 734.5321916401975
  }
];

const paths: readonly Path[] = [
  [
    1,
    2
  ],
  [
    1,
    4
  ],
  [
    1,
    5
  ],
  [
    2,
    3
  ],
  [
    3,
    4
  ],
  [
    3,
    8
  ],
  [
    4,
    6
  ],
  [
    5,
    6
  ],
  [
    5,
    10
  ],
  [
    6,
    7
  ],
  [
    6,
    9
  ],
  [
    6,
    10
  ],
  [
    7,
    8
  ],
  [
    7,
    12
  ],
  [
    8,
    12
  ],
  [
    9,
    11
  ],
  [
    9,
    12
  ],
  [
    10,
    11
  ]
];

// Seven forest tiles sit between the clearings — each bordered
// by the four clearings that share its cell. The Vagabond is the only
// faction that can move into a forest; forests don't accept warriors,
// buildings, or tokens.
const forests: readonly Forest[] = [
  {
    id: "fA",
    clearings: [
      1,
      2,
      4,
      5
    ],
    borderPaths: [
      [
        1,
        4
      ],
      [
        1,
        5
      ],
      [
        4,
        6
      ],
      [
        5,
        6
      ]
    ],
    x: 248.33576487183697,
    y: 239.23382567843385
  },
  {
    id: "fB",
    clearings: [
      2,
      3,
      4,
      7
    ],
    borderPaths: [
      [
        1,
        2
      ],
      [
        1,
        4
      ],
      [
        2,
        3
      ],
      [
        3,
        4
      ]
    ],
    x: 452.39176433077944,
    y: 112.47207159333826
  },
  {
    id: "fC",
    clearings: [
      4,
      6,
      7,
      9
    ],
    borderPaths: [
      [
        3,
        4
      ],
      [
        3,
        8
      ],
      [
        4,
        6
      ],
      [
        6,
        7
      ],
      [
        7,
        8
      ]
    ],
    x: 613.1631578438855,
    y: 272.0063767345805
  },
  {
    id: "fD",
    clearings: [
      5,
      6,
      10,
      11
    ],
    borderPaths: [
      [
        5,
        10
      ],
      [
        5,
        6
      ],
      [
        6,
        10
      ]
    ],
    x: 170.4234741693317,
    y: 486.573833649352
  },
  {
    id: "fE",
    clearings: [
      6,
      7,
      9,
      11
    ],
    borderPaths: [
      [
        6,
        7
      ],
      [
        6,
        9
      ],
      [
        7,
        12
      ],
      [
        9,
        12
      ]
    ],
    x: 581.0088791412643,
    y: 521.2014347652806
  },
  {
    id: "fF",
    clearings: [
      7,
      8,
      9,
      12
    ],
    borderPaths: [
      [
        7,
        12
      ],
      [
        7,
        8
      ],
      [
        8,
        12
      ]
    ],
    x: 788.7749876812784,
    y: 518.1096846656441
  },
  {
    id: "fG",
    clearings: [
      4,
      6,
      9,
      11
    ],
    borderPaths: [
      [
        10,
        11
      ],
      [
        6,
        10
      ],
      [
        6,
        9
      ],
      [
        9,
        11
      ]
    ],
    x: 329.339813141902,
    y: 613.3355877344477
  }
];

export const AUTUMN_MAP: RootMap = { clearings, paths, forests };

// ─── Derived helpers ────────────────────────────────────────────────────────

export function getClearing(map: RootMap, id: ClearingId): Clearing {
  const c = map.clearings.find(c => c.id === id);
  if (!c) throw new Error('Unknown clearing: ' + id);
  return c;
}

export function getForest(map: RootMap, id: ForestId): Forest {
  const f = map.forests.find(f => f.id === id);
  if (!f) throw new Error('Unknown forest: ' + id);
  return f;
}

export function getAdjacent(map: RootMap, id: ClearingId): ClearingId[] {
  const result: ClearingId[] = [];
  for (const [a, b] of map.paths) {
    if (a === id) result.push(b);
    else if (b === id) result.push(a);
  }
  return result;
}

export function areAdjacent(map: RootMap, a: ClearingId, b: ClearingId): boolean {
  return map.paths.some(
    ([x, y]) => (x === a && y === b) || (x === b && y === a),
  );
}

/** Forests directly accessible from a clearing (the clearing is one of
 *  the forest's bordering clearings). */
export function forestsAtClearing(map: RootMap, c: ClearingId): ForestId[] {
  return map.forests.filter(f => f.clearings.includes(c)).map(f => f.id);
}

/** Adjacent forests share at least one border path. */
export function adjacentForests(map: RootMap, id: ForestId): ForestId[] {
  const f = getForest(map, id);
  return map.forests
    .filter(g => g.id !== id && g.borderPaths.some(p => f.borderPaths.some(q => (p[0] === q[0] && p[1] === q[1]) || (p[0] === q[1] && p[1] === q[0]))))
    .map(g => g.id);
}

export const CORNER_CLEARINGS: readonly ClearingId[] = [1, 3, 10, 12];
