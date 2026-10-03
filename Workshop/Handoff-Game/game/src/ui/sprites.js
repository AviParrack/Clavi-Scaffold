// ===== Pixel art shared by every UI module: element icons, small glyphs, 7-segment LCD digits =====
// All original, from design/codec-mockups/variant-c.js. '#' = ink. Sprites are cached per colour and blitted
// nearest-neighbour, so they stay blocky at any scale.

import { C, fill, snap } from './theme.js';

// =================== element icons (10×10), keyed by element id (config/layers.js) ===================

export const ICON = {
  probe:       ['##########', '#........#', '#.....#..#', '#....#.#.#', '#.#..#.#.#', '##.#.#..##', '#...#....#', '#........#', '##########', '..........'],
  monitor:     ['..........', '...####...', '.##....##.', '#...##...#', '#..####..#', '#..####..#', '#...##...#', '.##....##.', '...####...', '..........'],
  untrusted:   ['.........#', '...####.#.', '.##....#..', '#...##.#.#', '#..##.#..#', '#..#.##..#', '#..#.##..#', '.##.#..##.', '...####...', '.#........'],
  cot:         ['.########.', '#........#', '#.##.###.#', '#........#', '#.###.#..#', '#........#', '.###.####.', '...#.#....', '...##.....', '...#......'],
  classifier:  ['.########.', '#........#', '#..####..#', '#.#....#.#', '#.#.##.#.#', '#.#.##.#.#', '.#......#.', '..#....#..', '...#..#...', '....##....'],
  egress:      ['##########', '#........#', '.#......#.', '..#....#..', '...#..#...', '....##....', '....##....', '....##....', '....##....', '....##....'],
  auditor:     ['...###....', '..#####...', '..#####...', '...###....', '..........', '.#######..', '#########.', '#########.', '#########.', '..........'],
  defer:       ['..........', '...#......', '...##.....', '#######...', '########..', '#######...', '...##.....', '...#..####', '......#..#', '......####'],
  resampler:   ['##########', '#........#', '#.##..##.#', '#.##..##.#', '#........#', '#........#', '#.##..##.#', '#.##..##.#', '#........#', '##########'],
  killswitch:  ['....##....', '.##.##.##.', '#...##...#', '#...##...#', '#........#', '#........#', '#........#', '.#......#.', '..######..', '..........'],
  paraphraser: ['.......##.', '......#..#', '.....#..#.', '....#..#..', '...#..#...', '..#..#....', '.#.##.....', '.##.......', '##........', '.....#.#.#'],
  sandbox:     ['#.##..##.#', '..........', '#........#', '#...##...#', '....##....', '....##....', '#...##...#', '#........#', '..........', '#.##..##.#'],
  leastpriv:   ['..........', '..........', '.###......', '#...#.....', '#.#.######', '#...#..#.#', '.###...#.#', '..........', '..........', '..........'],
  ratelimit:   ['##########', '.#......#.', '..#....#..', '...#..#...', '....##....', '....##....', '...#..#...', '..#.##.#..', '.#.####.#.', '##########'],
  honeypot:    ['..........', '.########.', '#.#....#.#', '##########', '#........#', '#..####..#', '#........#', '#........#', '##########', '..........'],
  canary:      ['..........', '...###....', '..#.###...', '.####.#...', '...####...', '...#####..', '....#####.', '.....###..', '.....#.#..', '..........'],
  redteam:     ['....#.....', '..#####...', '.#..#..#..', '.#..#..#..', '#########.', '.#..#..#..', '.#..#..#..', '..#####...', '....#.....', '..........'],
  interp:      ['...####...', '....##....', '....##....', '....##....', '...#..#...', '..#....#..', '.#.####.#.', '#.######.#', '##########', '..........'],
};

// =================== small glyphs ===================
// map letters to colours when drawing: sprite(g, SPR.bang, x, y, { '#': C.r, r: C.r }, 2)

export const SPR = {
  bang:  ['.####.', '#rrrr#', '#rrrr#', '#rrrr#', '.#rr#.', '.#rr#.', '.#rr#.', '..##..', '......', '.####.', '#rrrr#', '.####.'],   // MGS alert pop
  bangS: ['##', '##', '##', '##', '##', '..', '##', '##'],                    // small ! beside a flagged line
  check: ['.....#', '....#.', '#..#..', '.##...', '.#....'],
  tri:   ['#..', '##.', '###', '##.', '#..'],                                 // ▸
  down:  ['#####', '.###.', '..#..'],
  downB: ['#######', '.#####.', '..###..', '...#...'],                        // "more text" arrow in the dialog
  xs:    ['#...#', '.#.#.', '..#..', '.#.#.', '#...#'],                       // × for ×N tags
  warn:  ['.....#.....', '....###....', '....#.#....', '...##.##...', '...#.#.#...', '..##.#.##..', '..#..#..#..', '.##.....##.', '.#...#...#.', '###########'],
  heart: ['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...'],
  ptr:   ['#......', '##.....', '#w#....', '#ww#...', '#www#..', '#wwww#.', '#wwwww#', '#ww##..', '#.#w#..', '...#w#.', '....##.'],   // mouse pointer
  coin:  ['..ooo..', '.ohhfo.', 'ohfdffo', 'ohfdffo', 'offdffo', '.offfo.', '..ooo..'],
  lock:  ['.###.', '#...#', '#####', '##.##', '#####'],
};

// 3×5 numerals and signs (handset keys, ×N micro tags)
export const MICRO = {
  0: ['###', '#.#', '#.#', '#.#', '###'], 1: ['.#.', '##.', '.#.', '.#.', '###'], 2: ['###', '..#', '###', '#..', '###'], 3: ['###', '..#', '.##', '..#', '###'],
  4: ['#.#', '#.#', '###', '..#', '..#'], 5: ['###', '#..', '###', '..#', '###'], 6: ['###', '#..', '###', '#.#', '###'], 7: ['###', '..#', '.#.', '.#.', '.#.'],
  8: ['###', '#.#', '###', '#.#', '###'], 9: ['###', '#.#', '###', '..#', '###'], '+': ['...', '.#.', '###', '.#.', '...'], '-': ['...', '...', '###', '...', '...'],
};

// =================== drawing sprites ===================

const CACHE = new Map();       // rows array → Map(colour key → canvas)
function bake(rows, map) {
  let byMap = CACHE.get(rows);
  if (!byMap) { byMap = new Map(); CACHE.set(rows, byMap); }
  let key = '';
  for (const ch in map) key += ch + map[ch] + ';';      // e.g. '##a6ffbd;': cheaper than JSON.stringify on every call
  let cv = byMap.get(key);
  if (!cv) {
    cv = document.createElement('canvas');
    cv.width = rows[0].length; cv.height = rows.length;
    const g = cv.getContext('2d');
    for (let j = 0; j < rows.length; j++) for (let i = 0; i < rows[j].length; i++) {
      const col = map[rows[j][i]];
      if (col) { g.fillStyle = col; g.fillRect(i, j, 1, 1); }
    }
    byMap.set(key, cv);
  }
  return cv;
}

// rows of letters, each letter looked up in map (missing = transparent), sc px per cell
export function sprite(g, rows, x, y, map, sc = 1) {
  const cv = bake(rows, map);
  g.drawImage(cv, snap(x), snap(y), cv.width * sc, cv.height * sc);
}
export const spriteW = (rows, sc = 1) => rows[0].length * sc;

// an element's 10×10 icon at sc px per cell (20×20 at sc 2)
export function icon(g, id, x, y, sc, col) {
  const rows = ICON[id];
  if (rows) sprite(g, rows, x, y, { '#': col }, sc);
}

// ×N in micro digits; returns the width
export function microN(g, n, x, y, col) {
  sprite(g, SPR.xs, x, y, { '#': col });
  let X = x + 7;
  for (const ch of String(n)) { if (MICRO[ch]) sprite(g, MICRO[ch], X, y, { '#': col }); X += 4; }
  return X - 1 - x;
}

// =================== 7-segment LCD digits ===================

const SEG = { 0: 'abcdef', 1: 'bc', 2: 'abdeg', 3: 'abcdg', 4: 'bcfg', 5: 'acdfg', 6: 'acdefg', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg', '-': 'g', ' ': '' };

// one digit, w×h, segment thickness th. off = colour of unlit segments (null: not drawn)
export function seg7(g, ch, x, y, w, h, th, on, off) {
  const m = (h - th) >> 1, lit = SEG[ch] || '';
  const r = h > 16
    ? { a: [x + th, y, w - 2 * th, th], b: [x + w - th, y + th, th, m - th], c: [x + w - th, y + m + th, th, h - m - 2 * th],
        d: [x + th, y + h - th, w - 2 * th, th], e: [x, y + m + th, th, h - m - 2 * th], f: [x, y + th, th, m - th], g: [x + th, y + m, w - 2 * th, th] }
    : { a: [x + th, y, w - 2 * th, th], b: [x + w - th, y, th, m + th], c: [x + w - th, y + m, th, h - m],
        d: [x + th, y + h - th, w - 2 * th, th], e: [x, y + m, th, h - m], f: [x, y, th, m + th], g: [x + th, y + m, w - 2 * th, th] };
  for (const s in r) {
    const isOn = lit.includes(s);
    if (isOn || off) fill(g, r[s][0], r[s][1], r[s][2], r[s][3], isOn ? on : off);
  }
}

// a string of digits with . , : — returns the x after the last character
export function segStr(g, s, x, y, w, h, th, gap, on, off) {
  let X = x;
  for (const ch of String(s)) {
    if (ch === '.') { fill(g, X, y + h - th, th, th, on); X += th + gap; continue; }
    if (ch === ',') { fill(g, X, y + h - th, th, th, on); fill(g, X + th - 1, y + h, 1, 2, on); X += th + gap; continue; }
    if (ch === ':') { fill(g, X, y + (h >> 2), th, th, on); fill(g, X, y + h - (h >> 2) - th + 1, th, th, on); X += th + gap; continue; }
    seg7(g, ch, X, y, w, h, th, on, off);
    X += w + gap;
  }
  return X - gap;
}
export const segW = (s, w, th, gap) => { let n = 0; for (const ch of String(s)) n += ('.,:'.includes(ch) ? th : w) + gap; return n - gap; };

// LCD glass: black bezel, dark edge, glowing green-grey face
export function lcdPanel(g, x, y, w, h) {
  fill(g, x - 2, y - 2, w + 4, h + 4, C.black);
  fill(g, x - 1, y - 1, w + 2, h + 2, C.lcdEdge);
  g.save(); g.shadowColor = C.lcd; g.shadowBlur = 6; fill(g, x, y, w, h, C.lcd); g.restore();
  fill(g, x, y, w, 1, C.lcdMid); fill(g, x, y, 1, h, C.lcdMid);
}
