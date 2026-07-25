/**
 * 20+ FFT-inspired homage battle maps (original layouts, not SE assets).
 * Each map: RAW grid string array + spawns + theme metadata.
 */

const CODE = {
  wall: 'W',
  floor: '.',
  water: '~',
  deep: 'd',
  bridge: 'B',
  ramp: 'R',
  tower: 'T',
};

/**
 * Parse RAW into GridMap tiles (shared with castle parser logic).
 * @param {string[]} RAW
 * @param {string} name
 * @param {string} id
 * @param {string} theme
 */
export function parseRawMap(RAW, name, id, theme) {
  const height = RAW.length;
  const width = RAW[0].length;
  const tiles = [];
  for (let y = 0; y < height; y++) {
    const row = [];
    for (let x = 0; x < width; x++) {
      const c = RAW[y][x];
      let h = 0;
      let walkable = true;
      let terrain = 'floor';
      let depth = 0;
      if (c === 'W') {
        walkable = false;
        h = 3;
        terrain = 'wall';
      } else if (c === '~') {
        walkable = true;
        terrain = 'water';
        depth = 1;
      } else if (c === 'd') {
        walkable = true;
        terrain = 'water';
        depth = 2;
      } else if (c === 'B') {
        walkable = true;
        h = 1;
        terrain = 'bridge';
      } else if (c === 'T') {
        walkable = true;
        h = 5;
        terrain = 'tower';
      } else if (c === 'R') {
        walkable = true;
        h = 1;
        terrain = 'ramp';
      } else if (c === '.') {
        walkable = true;
        h = 0;
        terrain = 'floor';
      } else if (c >= '1' && c <= '9') {
        walkable = true;
        h = Number(c);
        terrain = 'elevated';
      } else {
        walkable = false;
        terrain = 'void';
      }
      row.push({ x, y, height: h, walkable, terrain, depth });
    }
    tiles.push(row);
  }
  return { width, height, tiles, name, id, theme };
}

/** @type {{ id: string, name: string, theme: string, raw: string[], spawns: { player: any[], enemy: any[] } }[]} */
const MAP_DEFS = [];

function add(id, name, theme, raw, player, enemy) {
  MAP_DEFS.push({
    id,
    name,
    theme,
    raw,
    spawns: {
      player: player.map(([x, y, f = 'N']) => ({ x, y, facing: f })),
      enemy: enemy.map(([x, y, f = 'S']) => ({ x, y, facing: f })),
    },
  });
}

// Helper: bordered empty field
const empty18 = (inner) => {
  const W = 'WWWWWWWWWWWWWWWWWW';
  return [W, ...inner, W];
};

// 1 Castle River (classic)
add(
  'castle_river',
  'Castle Courtyard Bridges',
  'castle',
  [
    'WWWWWWWWWWWWWWWWWW',
    'W1111....~~~~..5TW',
    'W1111....~BB~..55W',
    'W11R1....~BB~...5W',
    'W.RR.....~dd~....W',
    'W........~dd~....W',
    'W....2222~dd~333.W',
    'W....2222~BB~333.W',
    'W....22RR~BB~R33.W',
    'W......RR~dd~R...W',
    'W........~dd~....W',
    'W4444....~~~~..11W',
    'W4444....~BB~..11W',
    'W44R4....~BB~..R1W',
    'W..RR....~~~~..RRW',
    'WWWWWWWWWWWWWWWWWW',
  ],
  [
    [3, 13],
    [4, 14],
    [5, 13],
    [6, 14],
  ],
  [
    [15, 2],
    [16, 2],
    [15, 1],
    [14, 2],
  ]
);

// 2 Fort Gate
add(
  'fort_gate',
  'Fort Gate',
  'fort',
  empty18([
    'W2222....3333...W',
    'W2222....3333...W',
    'W22RR....RR33...W',
    'W................W',
    'W....WWWWWW......W',
    'W....W....W......W',
    'W....W.BB.W......W',
    'W....W~~~~W......W',
    'W....W~~~~W......W',
    'W....WWWWWW......W',
    'W................W',
    'W1111........4444W',
    'W11R1........4R44W',
    'W..RR........RR..W',
  ]),
  [
    [2, 12],
    [3, 13],
    [4, 12],
    [5, 13],
  ],
  [
    [12, 2],
    [13, 3],
    [14, 2],
    [15, 3],
  ]
);

// 3 Mountain Pass
add(
  'mountain_pass',
  'Mountain Pass',
  'mountain',
  empty18([
    'W5555....~~~~..11W',
    'W55R5....~BB~..11W',
    'W5RR.....~BB~..R1W',
    'W........~~~~..RRW',
    'W4444............W',
    'W44R4....2222....W',
    'W4RR.....22R2....W',
    'W........2RR.....W',
    'W....3333........W',
    'W....33R3....5555W',
    'W....3RR.....5R55W',
    'W............RR5.W',
    'W1111............W',
    'W11R1............W',
  ]),
  [
    [2, 13],
    [3, 12],
    [4, 13],
    [5, 12],
  ],
  [
    [14, 2],
    [15, 1],
    [13, 2],
    [14, 3],
  ]
);

// 4 Swamp
add(
  'swamp_mire',
  'Swamp Mire',
  'swamp',
  empty18([
    'W....~~~~....~~~~W',
    'W....~dd~....~dd~W',
    'W....~BB~....~BB~W',
    'W....~~~~....~~~~W',
    'W..11............W',
    'W..11....2222....W',
    'W........22R2....W',
    'W....~~~~2RR.....W',
    'W....~dd~........W',
    'W....~BB~....3333W',
    'W....~~~~....33R3W',
    'W............3RR.W',
    'W4444............W',
    'W44R4............W',
  ]),
  [
    [2, 12],
    [3, 13],
    [4, 12],
    [5, 13],
  ],
  [
    [13, 2],
    [14, 3],
    [15, 2],
    [12, 3],
  ]
);

// 5 Town Streets
add(
  'town_streets',
  'Town Streets',
  'town',
  empty18([
    'W..WW..WW..WW..W.W',
    'W................W',
    'W..WW..WW..WW....W',
    'W................W',
    'W......2222......W',
    'W......22R2......W',
    'W......2RR.......W',
    'W..WW......WW....W',
    'W................W',
    'W..WW......WW....W',
    'W......1111......W',
    'W......11R1......W',
    'W......1RR.......W',
    'W................W',
  ]),
  [
    [3, 12],
    [4, 11],
    [5, 12],
    [6, 11],
  ],
  [
    [12, 2],
    [13, 3],
    [11, 2],
    [14, 3],
  ]
);

// 6 Ruins
add(
  'ancient_ruins',
  'Ancient Ruins',
  'ruins',
  empty18([
    'W3W3W....W3W3W...W',
    'W.R.R....R.R.R...W',
    'W................W',
    'W....2222~~~~333.W',
    'W....22R2~BB~3R3.W',
    'W....2RR.~BB~.RR.W',
    'W........~~~~....W',
    'W..WW........WW..W',
    'W................W',
    'W1111........4444W',
    'W11R1........4R44W',
    'W1RR..........RR4W',
    'W................W',
    'W..W.W.W.W.W.W...W',
  ]),
  [
    [2, 10],
    [3, 11],
    [4, 10],
    [5, 11],
  ],
  [
    [13, 3],
    [14, 4],
    [12, 3],
    [15, 4],
  ]
);

// 7 Church Grounds
add(
  'church_grounds',
  'Church Grounds',
  'church',
  empty18([
    'W......3333......W',
    'W......33T3......W',
    'W......3RR3......W',
    'W.......RR.......W',
    'W....WW....WW....W',
    'W................W',
    'W..11........22..W',
    'W..11........22..W',
    'W................W',
    'W....WW....WW....W',
    'W................W',
    'W......1111......W',
    'W......11R1......W',
    'W......1RR.......W',
  ]),
  [
    [6, 12],
    [7, 11],
    [8, 12],
    [9, 11],
  ],
  [
    [6, 2],
    [7, 3],
    [8, 2],
    [9, 3],
  ]
);

// 8 Cliffside
add(
  'cliffside',
  'Cliffside Path',
  'cliff',
  empty18([
    'W555544443332211.W',
    'W555R444R333R21..W',
    'W55RR44RR33RRR...W',
    'W5RR..RR..RR.....W',
    'W................W',
    'W....~~~~........W',
    'W....~BB~........W',
    'W....~BB~........W',
    'W....~~~~........W',
    'W................W',
    'W1111222233344455W',
    'W11R122R233R344R5W',
    'W1RR.2RR.3RR.4RR5W',
    'W................W',
  ]),
  [
    [2, 11],
    [3, 12],
    [4, 11],
    [5, 12],
  ],
  [
    [14, 1],
    [13, 2],
    [15, 1],
    [12, 2],
  ]
);

// 9 River Delta
add(
  'river_delta',
  'River Delta',
  'river',
  empty18([
    'W~~..~~..~~..~~..W',
    'WdB..dB..dB..dB..W',
    'W~~..~~..~~..~~..W',
    'W................W',
    'W..2222....3333..W',
    'W..22R2....33R3..W',
    'W..2RR......RR3..W',
    'W................W',
    'W~~..~~..~~..~~..W',
    'WdB..dB..dB..dB..W',
    'W~~..~~..~~..~~..W',
    'W..1111....4444..W',
    'W..11R1....44R4..W',
    'W..1RR......RR4..W',
  ]),
  [
    [3, 12],
    [4, 11],
    [5, 12],
    [6, 11],
  ],
  [
    [11, 4],
    [12, 5],
    [13, 4],
    [10, 5],
  ]
);

// 10 Barracks Yard
add(
  'barracks_yard',
  'Barracks Yard',
  'barracks',
  empty18([
    'W2222WW....WW3333W',
    'W22R2WW....WW33R3W',
    'W2RR.WW....WW.RR3W',
    'W................W',
    'W....11111111....W',
    'W....11R11R11....W',
    'W....1RR..RR1....W',
    'W................W',
    'W....22222222....W',
    'W....22R22R22....W',
    'W....2RR..RR2....W',
    'W................W',
    'W1111........4444W',
    'W11R1........4R44W',
  ]),
  [
    [2, 12],
    [3, 13],
    [4, 12],
    [5, 13],
  ],
  [
    [13, 1],
    [14, 1],
    [15, 1],
    [13, 2],
  ]
);

// 11 Snow Field (elevated ice-like)
add(
  'snow_field',
  'Snow Field',
  'snow',
  empty18([
    'W................W',
    'W..2222....3333..W',
    'W..22R2....33R3..W',
    'W..2RR......RR3..W',
    'W................W',
    'W......1111......W',
    'W......11R1......W',
    'W......1RR.......W',
    'W................W',
    'W..4444....5555..W',
    'W..44R4....55R5..W',
    'W..4RR......RR5..W',
    'W................W',
    'W................W',
  ]),
  [
    [4, 12],
    [5, 13],
    [6, 12],
    [7, 13],
  ],
  [
    [11, 2],
    [12, 1],
    [13, 2],
    [10, 1],
  ]
);

// 12 Desert Mesa
add(
  'desert_mesa',
  'Desert Mesa',
  'desert',
  empty18([
    'W....33333333....W',
    'W....33R33R33....W',
    'W....3RR..RR3....W',
    'W................W',
    'W2222........4444W',
    'W22R2........4R44W',
    'W2RR..........RR4W',
    'W................W',
    'W....11111111....W',
    'W....11R11R11....W',
    'W....1RR..RR1....W',
    'W................W',
    'W5555........2222W',
    'W55R5........2R22W',
  ]),
  [
    [5, 9],
    [6, 10],
    [7, 9],
    [8, 10],
  ],
  [
    [5, 1],
    [6, 2],
    [7, 1],
    [8, 2],
  ]
);

// 13 Harbor Pier
add(
  'harbor_pier',
  'Harbor Pier',
  'harbor',
  empty18([
    'W~~~~~~~~~~~~~~..W',
    'W~dddddddddddd~..W',
    'W~BBBBBBBBBBBB~..W',
    'W~~~~~~~~~~~~~~..W',
    'W................W',
    'W..1111..........W',
    'W..11R1....2222..W',
    'W..1RR.....22R2..W',
    'W..........2RR...W',
    'W................W',
    'W....3333........W',
    'W....33R3....4444W',
    'W....3RR.....4R44W',
    'W............RR4.W',
  ]),
  [
    [3, 6],
    [4, 7],
    [5, 6],
    [6, 7],
  ],
  [
    [12, 11],
    [13, 12],
    [14, 11],
    [11, 12],
  ]
);

// 14 Forest Clearing
add(
  'forest_clearing',
  'Forest Clearing',
  'forest',
  empty18([
    'W.W.W.W....W.W.W.W',
    'W................W',
    'W.W....2222....W.W',
    'W......22R2......W',
    'W.W....2RR.....W.W',
    'W................W',
    'W.W............W.W',
    'W......1111......W',
    'W.W....11R1....W.W',
    'W......1RR.......W',
    'W.W............W.W',
    'W....3333....4444W',
    'W.W..33R3....4R4.W',
    'W....3RR......RR.W',
  ]),
  [
    [6, 8],
    [7, 7],
    [8, 8],
    [9, 7],
  ],
  [
    [6, 3],
    [7, 2],
    [8, 3],
    [5, 2],
  ]
);

// 15 Bridge War
add(
  'bridge_war',
  'Bridge War',
  'bridge',
  empty18([
    'W1111~~~~dddd~~~~W',
    'W11R1~BBBBBBBB~55W',
    'W1RR.~BBBBBBBB~5RW',
    'W....~~~~dddd~~~~W',
    'W................W',
    'W2222........3333W',
    'W22R2........33R3W',
    'W2RR..........RR3W',
    'W................W',
    'W....~~~~dddd~~~~W',
    'W....~BBBBBBBB~..W',
    'W....~BBBBBBBB~..W',
    'W....~~~~dddd~~~~W',
    'W4444............W',
  ]),
  [
    [2, 13],
    [3, 12],
    [4, 13],
    [1, 12],
  ],
  [
    [15, 1],
    [14, 2],
    [13, 1],
    [16, 2],
  ]
);

// 16 Palace Steps
add(
  'palace_steps',
  'Palace Steps',
  'palace',
  empty18([
    'W......5555......W',
    'W......55T5......W',
    'W......5RR5......W',
    'W......4444......W',
    'W......44R4......W',
    'W......4RR.......W',
    'W......3333......W',
    'W......33R3......W',
    'W......3RR.......W',
    'W......2222......W',
    'W......22R2......W',
    'W......2RR.......W',
    'W......1111......W',
    'W......11R1......W',
  ]),
  [
    [7, 12],
    [8, 13],
    [9, 12],
    [6, 13],
  ],
  [
    [7, 2],
    [8, 1],
    [9, 2],
    [6, 1],
  ]
);

// 17 Graveyard
add(
  'graveyard',
  'Graveyard',
  'graveyard',
  empty18([
    'W.W.W.W.W.W.W.W..W',
    'W................W',
    'W.W.W....2222.W.WW',
    'W........22R2....W',
    'W.W.W....2RR..W.WW',
    'W................W',
    'W~~~~........~~~~W',
    'W~BB~........~BB~W',
    'W~~~~........~~~~W',
    'W................W',
    'W.W.W....1111.W.WW',
    'W........11R1....W',
    'W.W.W....1RR..W.WW',
    'W................W',
  ]),
  [
    [6, 11],
    [7, 12],
    [8, 11],
    [9, 12],
  ],
  [
    [6, 3],
    [7, 2],
    [8, 3],
    [9, 2],
  ]
);

// 18 Windmill Hill
add(
  'windmill_hill',
  'Windmill Hill',
  'hill',
  empty18([
    'W........T.......W',
    'W.......333......W',
    'W......33333.....W',
    'W.....33R3R33....W',
    'W......3RRR3.....W',
    'W.......RRR......W',
    'W......22222.....W',
    'W.....22R2R22....W',
    'W......2RRR2.....W',
    'W.......RRR......W',
    'W......11111.....W',
    'W.....11R1R11....W',
    'W......1RRR1.....W',
    'W.......RRR......W',
  ]),
  [
    [7, 11],
    [8, 12],
    [6, 12],
    [9, 11],
  ],
  [
    [7, 2],
    [8, 3],
    [6, 3],
    [9, 2],
  ]
);

// 19 Canal City
add(
  'canal_city',
  'Canal City',
  'canal',
  empty18([
    'W..~~..~~..~~..~~W',
    'W..BB..BB..BB..BBW',
    'W..~~..~~..~~..~~W',
    'W2222........3333W',
    'W22R2........33R3W',
    'W2RR..........RR3W',
    'W..~~..~~..~~..~~W',
    'W..BB..BB..BB..BBW',
    'W..~~..~~..~~..~~W',
    'W1111........4444W',
    'W11R1........4R44W',
    'W1RR..........RR4W',
    'W..~~..~~..~~..~~W',
    'W..BB..BB..BB..BBW',
  ]),
  [
    [2, 10],
    [3, 11],
    [4, 10],
    [1, 11],
  ],
  [
    [13, 3],
    [14, 4],
    [15, 3],
    [12, 4],
  ]
);

// 20 Volcano Rim
add(
  'volcano_rim',
  'Volcano Rim',
  'volcano',
  empty18([
    'W5555dddddddd5555W',
    'W55R5d~~~~~~d5R55W',
    'W5RR.d~BBBB~d.RR5W',
    'W....d~BBBB~d....W',
    'W....d~~~~~~d....W',
    'W....dddddddd....W',
    'W4444........3333W',
    'W44R4........33R3W',
    'W4RR..........RR3W',
    'W................W',
    'W2222........1111W',
    'W22R2........11R1W',
    'W2RR..........RR1W',
    'W................W',
  ]),
  [
    [12, 11],
    [13, 12],
    [14, 11],
    [11, 12],
  ],
  [
    [2, 7],
    [3, 8],
    [1, 7],
    [4, 8],
  ]
);

// 21 Training Yard
add(
  'training_yard',
  'Training Yard',
  'training',
  empty18([
    'W................W',
    'W..WWWW....WWWW..W',
    'W..W..W....W..W..W',
    'W..WWWW....WWWW..W',
    'W................W',
    'W....22222222....W',
    'W....22R22R22....W',
    'W....2RR..RR2....W',
    'W................W',
    'W....11111111....W',
    'W....11R11R11....W',
    'W....1RR..RR1....W',
    'W................W',
    'W..WW........WW..W',
  ]),
  [
    [5, 10],
    [6, 9],
    [7, 10],
    [8, 9],
  ],
  [
    [5, 5],
    [6, 6],
    [7, 5],
    [8, 6],
  ]
);

// 22 Marsh Bridge
add(
  'marsh_bridge',
  'Marsh Bridge',
  'marsh',
  empty18([
    'Wdddd~~dddd~~ddddW',
    'W~~~~BB~~~~BB~~~~W',
    'Wdddd~~dddd~~ddddW',
    'W................W',
    'W1111........2222W',
    'W11R1........22R2W',
    'W1RR..........RR2W',
    'W................W',
    'W3333........4444W',
    'W33R3........44R4W',
    'W3RR..........RR4W',
    'W................W',
    'W~~~~BB~~~~BB~~~~W',
    'Wdddd~~dddd~~ddddW',
  ]),
  [
    [2, 5],
    [3, 6],
    [4, 5],
    [1, 6],
  ],
  [
    [13, 4],
    [14, 5],
    [15, 4],
    [12, 5],
  ]
);

// 23 Keep Interior
add(
  'keep_interior',
  'Keep Interior',
  'keep',
  empty18([
    'WWWWWWWWWWWWWWWW.W',
    'W2....W....W....3W',
    'W2.WW.W.WW.W.WW.3W',
    'W2....W....W....3W',
    'WW.WWWW.WW.WWWW.WW',
    'W................W',
    'W..11........22..W',
    'W..11........22..W',
    'W................W',
    'WW.WWWW.WW.WWWW.WW',
    'W1....W....W....4W',
    'W1.WW.W.WW.W.WW.4W',
    'W1....W....W....4W',
    'WWWWWWWWWWWWWWWW.W',
  ]),
  [
    [2, 11],
    [2, 12],
    [1, 11],
    [2, 13],
  ],
  [
    [15, 2],
    [14, 2],
    [13, 2],
    [12, 2],
  ]
);

// 24 Crossroads
add(
  'crossroads',
  'Crossroads',
  'crossroads',
  empty18([
    'W......2222......W',
    'W......22R2......W',
    'W......2RR.......W',
    'W................W',
    'W1111........3333W',
    'W11R1...RR...33R3W',
    'W1RR....RR....RR3W',
    'W.......RR.......W',
    'W1111........3333W',
    'W11R1........33R3W',
    'W1RR..........RR3W',
    'W................W',
    'W......4444......W',
    'W......44R4......W',
  ]),
  [
    [7, 12],
    [8, 13],
    [6, 13],
    [9, 12],
  ],
  [
    [7, 1],
    [8, 2],
    [6, 2],
    [9, 1],
  ]
);

export function listMaps() {
  return MAP_DEFS.map((m) => ({ id: m.id, name: m.name, theme: m.theme }));
}

export function getMapDef(id) {
  return MAP_DEFS.find((m) => m.id === id) || null;
}

/**
 * @param {string} [id]
 * @param {number} [seed]
 */
export function createMapById(id) {
  const def = getMapDef(id) || MAP_DEFS[0];
  const map = parseRawMap(def.raw, def.name, def.id, def.theme);
  return { map, spawns: def.spawns, id: def.id, name: def.name, theme: def.theme };
}

/**
 * Deterministic pick from seed, or random.
 * @param {number} [seed]
 */
export function pickRandomMapId(seed = Date.now()) {
  const n = MAP_DEFS.length;
  const idx = Math.abs((seed * 1103515245 + 12345) >> 0) % n;
  return MAP_DEFS[idx].id;
}

export function createRandomMap(seed = Date.now()) {
  return createMapById(pickRandomMapId(seed));
}

export function mapPoolCount() {
  return MAP_DEFS.length;
}

export { MAP_DEFS };
