// ===== Layout: every region of the 1200×660 board, in logical px =====
// Measured off design/codec-mockups/variant-c.js. Modules draw inside their own regions only.

import { mountY } from '../sim/rules.js';

export const W = 1200, H = 660;
export const rect = (x, y, w, h) => ({ x, y, w, h });
export const inside = (r, x, y) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;

// =================== top bar (hud) ===================

export const HUD = {
  bar:      rect(0, 0, 1200, 32),
  cash:     rect(8, 4, 108, 25),       // odometer
  rep:      rect(128, 0, 56, 32),
  model:    rect(192, 0, 118, 32),
  rival:    rect(316, 0, 76, 32),
  misalign: rect(398, 0, 244, 32),     // value + gauge with error bar (gauge 476..637)
  tasks:    rect(649, 13, 41, 17),     // LCD: real tasks/s
  split:    rect(706, 0, 400, 32),     // 'COMPUTE' label + the three-way bar
  splitBar: rect(752, 13, 348, 10),    // Product | Capabilities | Safety; labels above, yields below, drag handles on the seams
  controls: rect(1108, 0, 92, 32),     // run clock LCD, pause / speed / mute state
};

// =================== the two tracks ===================
// Each track: header (tracks) · strip (hud: mode box + event LCD) · field: rail | scope body | bay column (tracks)
// · completion edge (tracks).

export const TRACK = {
  top: 84, bottom: 524, hood: 14,      // the scope field and its opaque hoods (intake at the top, out at the bottom)
  rowTop: 100, pitch: 42, rows: 10,    // ten mount rows on the rail, always drawn: rows past the lane's mounts are "+ SLOT"
  railW: 128, bodyW: 208, bayW: 64, gap: 4,
  textInset: 20,                       // task text starts this far into the body
  lineGap: 17,                         // least px between two full task lines
};

function track(x) {
  const T = TRACK, fh = T.bottom - T.top;
  return {
    x, w: 408,
    header: rect(x, 37, 408, 16),
    strip:  rect(x, 58, 408, 20),
    mode:   rect(x, 58, 128, 20),           // NOMINAL / ALERT / PAUSED / TRAINING
    events: rect(x + 132, 58, 276, 20),     // event LCD banners, tiled when several run
    field:  rect(x, T.top, 408, fh),
    rail:   rect(x, T.top, T.railW, fh),
    body:   rect(x + 132, T.top, T.bodyW, fh),
    bays:   rect(x + 344, T.top, T.bayW, fh),
    edge:   rect(x, 528, 408, 26),          // EXT: delivered + coin pops · INT: R&D toward the next model
  };
}
export const TRACKS = { ext: track(8), int: track(424) };

export const rowCentre = i => TRACK.rowTop + i * TRACK.pitch + 21;
export const mountRect = (lane, i) => rect(TRACKS[lane].x + 1, TRACK.rowTop + i * TRACK.pitch + 1, 126, 41);

// A chip's sim position (0 = intake, 1 = completion line) → screen y. Piecewise linear through fixed knots:
// the intake hood (0), each mount's sim position → its rail row centre, the out hood (1). Monotone, and the rows
// never move: when a mount is bought the sim shifts the mounts up and this map follows.
export function trackY(n, y) {
  const top = TRACK.top + TRACK.hood - 6, bottom = TRACK.bottom - TRACK.hood + 6;
  let y0 = 0, p0 = top;
  for (let i = 0; i < n; i++) {
    const y1 = mountY(n, i), p1 = rowCentre(i);
    if (y <= y1) return p0 + (p1 - p0) * (y - y0) / (y1 - y0);
    y0 = y1; p0 = p1;
  }
  return p0 + (bottom - p0) * Math.min(1, (y - y0) / (1 - y0));
}

// =================== bottom left: dossier and ops log (hud) ===================

export const DOSSIER  = rect(8, 558, 408, 94);
export const LAB_SITE = rect(318, 561, 94, 14);     // the one global mount (Interp Lab), in the dossier header
export const OPSLOG   = rect(424, 558, 408, 94);

// =================== right column: codec, context panel, defense menu ===================

export const CODEC = {
  box:        rect(840, 36, 352, 336),
  incident:   rect(848, 42, 336, 20),     // EXTERNAL INCIDENT / INTERNAL ANOMALY / the call bar
  portraitL:  rect(848, 65, 98, 122),     // frame; the face is 88×112 at +5,+5. Left: whoever is calling
  portraitR:  rect(1086, 65, 98, 122),    // right: YOU (the head of safety)
  handset:    rect(965, 63, 102, 153),
  nameY:      202,                        // names on the outer edges, vitals on the inner edges
  dialog:     rect(847, 206, 338, 100),   // the MSX-blue box
  dialogTall: rect(847, 206, 338, 164),   // the box grown over lamps and trace while a choice is open
  signal:     rect(848, 308, 135, 10),
  lampExt:    rect(1022, 308, 78, 11),
  lampInt:    rect(1106, 308, 78, 11),
  trace:      rect(848, 326, 336, 44),    // post-mortem of the last incident
};

export const CONTEXT = rect(840, 378, 352, 138);    // hover card / upgrade panel / lab actions (menu module)
export const MENU = rect(840, 522, 352, 138);
export const menuKey = i => rect(840 + (i % 9) * 40, 522 + Math.floor(i / 9) * 48, 32, 44);   // 18 keys, 2 rows of 9
export const MENU_FOOT = { labelY: 630, helpY: 646 };

// =================== every region, for the layout outline (debug key L) ===================

export const REGIONS = [
  ['hud', HUD.bar], ['tracks', TRACKS.ext.header], ['tracks', TRACKS.int.header],
  ['hud', TRACKS.ext.strip], ['hud', TRACKS.int.strip],
  ['tracks', TRACKS.ext.field], ['tracks', TRACKS.int.field], ['tracks', TRACKS.ext.edge], ['tracks', TRACKS.int.edge],
  ['hud', DOSSIER], ['hud', OPSLOG], ['codec', CODEC.box], ['menu', CONTEXT], ['menu', MENU],
];
