// ===== Upgrade panel (the mount in view.selected) + the spec sheet and widgets the hover card shares (menu.js) =====
// Look: design/codec-mockups/variant-c.js buildHover. Plan: design/UI-PLAN.md §4 (menu), §6 (hidden truth).
// The spec sheet is what a player may know about an element (DESIGN-v3 §3c, §3d): rated TPR and FPR, measured
// precision, desks and load, break-even precision. Built from the sim's readouts (rules.js ratedTPR, detectorStats,
// auditStats, killStats, collusionEstimate); never the hidden truth (no st.m, no traits).
// Levels are lab-wide (st.levels): upgrading one copy upgrades every copy on every lane.
// Registers: upg-btn {action: upgrade | toggle | sell | buyslot | close}

import { LAYERS } from '../config/layers.js';
import { MAX_LEVEL, UPGRADES } from '../config/upgrades.js';
import { ATTACKS } from '../config/tasks.js';
import { BALANCE as B } from '../config/balance.js';
import * as R from '../sim/rules.js';
import { COLLUSION_UI, LANE_UI } from '../config/content/v3-text.js';
import { money, big, tpl } from '../util/format.js';
import { C, F, fill, box, dashBox, corners, text, tw, fit, clamp, mod } from './theme.js';
import { icon, sprite, SPR } from './sprites.js';
import { laneTab } from './derive.js';

// =================== spec sheet ===================

const MODEL = ['harmful', 'leak', 'sabotage', 'poison', 'exfil'];

// where the hover card measures an element that is not placed yet: its side's G1 lane (whose id is the side's own)
export const homeLane = id => (['ext', 'int', 'global'].includes(LAYERS[id].bestIn) ? LAYERS[id].bestIn : LAYERS[id].lanes[0]);
const linePay = (st, lane) => (R.laneDef(lane)?.pay ?? R.laneDef(R.sideOf(st, lane) === 'int' ? 'int' : 'ext').pay) * R.priceIndex(st);
const onLane = (st, lane) => !!lane && !!st.lanes[lane];

// ---------- number formats ----------
export const pc = x => { const p = 100 * x; return (p > 0 && p < 10 && Math.abs(p - Math.round(p)) > 0.05 ? p.toFixed(1) : Math.round(p)) + '%'; };
const secs = x => (x <= 0 ? 'instant' : (x < 1 ? x.toFixed(2) : x.toFixed(1)) + 's');
const times = x => '×' + (Math.round(x * 100) / 100);
const num = (x, d = 1) => (Math.round(x * 10 ** d) / 10 ** d).toString();
const lower = s => s[0].toLowerCase() + s.slice(1);

// one bar row: label, bar fill 0..1, the value text, and how to word a change (unit) for the NEXT line.
// bad: more is worse (drawn dimmer). v: the raw number deltas are taken from.
const row = (label, frac, val, v, unit, bad = false) => ({ label, frac: clamp(frac || 0, 0, 1), val, v, unit, bad });

// sheet(st, id, { lane, level, slot }) → { s, rows, good, note, facts, measured }
//   rows: up to 5 bar rows · good: attack types it is good against · note: [verb, text] when good is empty
//   facts: short sentences for the card (precision, overflow, break-even ...) · measured: a Red Team's recall
export function sheet(st, id, { lane = null, level = 1, slot = null } = {}) {
  const L = LAYERS[id], ln = onLane(st, lane) ? lane : homeLane(id), s = R.elementStats(st, id, { lane: ln, level, slot });
  const placed = slot != null && onLane(st, lane) && !!st.lanes[lane].slots[slot]?.layer;
  const pay = linePay(st, ln), cost = row('COST/LINE', s.costPerTask / pay, money(s.costPerTask), s.costPerTask, 'money', true);
  let rows = [], facts = [], measured = null;

  if (L.role === 'detector') {
    const d = placed ? R.detectorStats(st, lane, slot) : null;
    const tpr = d ? d.tprRated : R.ratedTPR(st, id, level, onLane(st, lane) ? lane : null), fpr = d ? d.fprRated : R.detectorFPR(id, level);
    rows = [
      row('TPR', tpr, `${pc(tpr)} rated`, tpr, 'pct'),
      row('FALSE ALARM', fpr / 0.2, `${pc(fpr)} rated`, fpr, 'pct', true),
    ];
    if (d) rows.push(row('PRECISION', d.precision ?? 0, d.precision == null ? 'no reviews yet' : `${pc(d.precision)} · ${pc(d.lo)}–${pc(d.hi)}`, d.precision ?? 0, 'pct'));
    rows.push(cost, row('UNREAD', s.unreadRate, `${pc(s.unreadRate)} · ${s.heads} at once`, s.unreadRate, 'pct', true));
    rows[rows.length - 1].heads = s.heads;
    if (d) facts.push(`flags ${d.flagsPerMin.toFixed(1)}/min · humans confirmed ${d.tp}, false alarms ${d.fa}`);
    if (id === 'untrusted' && onLane(st, lane)) facts.push(...collusionLines(st, lane, level, tpr));
    facts.push('a second copy adds reading speed, not accuracy');
    if (d?.recall != null) measured = { rate: d.recall, tpr };
  } else switch (id) {
    case 'auditor': {
      const cap = R.capstone('auditor', level).honestyCap, acc = cap ? cap : R.auditorAcc(st, level);
      const desks = s.desks, perMin = desks * 60 / s.latency;
      rows = [row('ACCURACY', acc, (cap ? '≤ ' : '') + pc(acc), acc, 'pct'),
        row('CAPACITY', perMin / 30, `${num(perMin)}/min · ${desks} desk${desks === 1 ? '' : 's'}`, perMin, 'n')];
      if (placed) {
        const a = R.auditStats(st, lane, slot), to = a.to === 'ships' ? 'ships unreviewed' : `to the ${LAYERS[a.to].name}`;
        rows.push(row('LOAD', a.load, `${num(a.flagsPerMin)} flags/min · ${pc(Math.min(9.99, a.load))}`, a.load, 'pct', true),
          row('OVERFLOW', a.overflow, `${pc(a.overflow)} ${a.to === 'ships' ? '> ships' : '> ' + LAYERS[a.to].tag}`, a.overflow, 'pct', true));
        facts.push(`humans review ${pc(a.reviewedShare)} of ${laneTab(lane)} · overflow ${to}`);
      }
      rows.push(row('SALARY', s.salaryPerSec / Math.max(1e-9, R.incomePerSec(st)), money(s.salaryPerSec) + '/s', s.salaryPerSec, 'money', true));
      facts.push('reviews flags first, then spot-checks unflagged lines with spare time');
      break;
    }
    case 'defer':
      rows = [row('HANDLES', 1, 'every flag it takes', 1, 'pct'), row('PAYS', s.payFrac, pc(s.payFrac) + ' of a line', s.payFrac, 'pct'),
        row('DELAY', s.latency / 5, secs(s.latency) + ' a line', s.latency, 's', true), row('DESKS', s.desks / 6, `${s.desks} slot${s.desks === 1 ? '' : 's'}`, s.desks, 'desk')];
      break;
    case 'resampler': {
      const p = B.attackBase + B.attackPerM * R.misalignmentEstimate(st).est, c = 1 - Math.pow(Math.min(1, p), s.tries);   // at YOUR estimate
      rows = [row('CLEAN', c, '~' + pc(c) + ' of redraws', c, 'pct'), cost, row('DELAY', s.latency / 5, secs(s.latency) + ' a line', s.latency, 's', true),
        row('DESKS', s.desks / 6, `${s.desks} slot${s.desks === 1 ? '' : 's'} · ${s.tries} ${s.tries === 1 ? 'try' : 'tries'}`, s.desks, 'desk')];
      break;
    }
    case 'killswitch': {
      const ops = R.servers(st, 'killswitch', level), perMin = ops * 60 / s.latency;
      const k = placed ? R.killStats(st, lane, slot) : { breakEven: onLane(st, lane) ? R.killBreakEven(st, lane, level) : R.killBreakEven(st, 'ext', level), precisionHere: null };
      rows = [row('CAPACITY', perMin / 60, `${num(perMin, 0)}/min · ${ops} operator${ops === 1 ? '' : 's'}`, perMin, 'n'),
        row('FEE', s.triggerCost / pay, money(s.triggerCost) + ' a refusal', s.triggerCost, 'money', true),
        row('REP', s.triggerRep / 4, s.triggerRep ? '−' + num(s.triggerRep) + ' a refusal' : 'none', s.triggerRep, 'rep', true),
        row('BREAK-EVEN', k.breakEven ?? 0, k.breakEven == null ? 'n/a: costs R&D here' : `precision ${pc(k.breakEven)}`, k.breakEven ?? 0, 'pct')];
      if (k.breakEven != null) facts.push(`refusing pays when flags are over ${pc(k.breakEven)} real${placed ? ` · here ${k.precisionHere == null ? 'unmeasured' : pc(k.precisionHere)}` : ''}`);
      facts.push('a refusal is never checked: "?" on the board');
      if (placed && st.lanes[lane].slots.some((x, j) => j > slot && x.layer === 'auditor')) facts.unshift(`${LANE_UI.killAbove}: mount it below the Auditor`);
      break;
    }
    case 'paraphraser':
      rows = [row('COLLUSION', s.collusionMult, 'UM below ' + times(s.collusionMult), s.collusionMult, 'x', true), cost];
      break;
    case 'sandbox':
      rows = [row('HARM', s.harmMult, pc(s.harmMult) + ' of normal', s.harmMult, 'pct', true),
        row('ESCAPES', s.containsEscapes ? 1 : 0, R.capstone(id, level).containsAll ? 'contained, any G' : s.containsEscapes ? `contained to G${L.worksUntilGen}` : 'NOT contained', s.containsEscapes ? 1 : 0, 'flag'),
        cost];
      break;
    case 'leastpriv':
      rows = [row('EXFIL FAIL', s.exfilFail, pc(s.exfilFail), s.exfilFail, 'pct'), row('DEBT', s.debtMult, times(s.debtMult) + ' a landing', s.debtMult, 'x', true), cost];
      break;
    case 'ratelimit':
      rows = [row('CAP', s.cap / Math.max(s.cap, R.laneRate(st, ln) || s.cap), num(s.cap) + ' lines/s', s.cap, 'n'),
        row('TURNED AWAY', s.throttleRate, pc(s.throttleRate) + ' now', s.throttleRate, 'pct', true),
        row('JAILBREAKS', s.jailbreakCap / 15, 'capped ' + times(s.jailbreakCap), s.jailbreakCap, 'x', true), cost];
      break;
    case 'honeypot':
      rows = [row('BAIT', s.injectRate / 0.15, pc(s.injectRate) + ' of lines', s.injectRate, 'pct'),
        row('EVIDENCE', s.baitEvidence / 10, '+' + num(s.baitEvidence) + ' a bite', s.baitEvidence, 'ev'),
        row('HOLD', s.holdSeconds / 30, `UM collusion 0 for ${num(s.holdSeconds, 0)}s`, s.holdSeconds, 's'), cost];
      break;
    case 'canary':
      rows = [row('LEAK DAMAGE', s.repMult, pc(s.repMult) + ' of rep', s.repMult, 'pct', true),
        row('EVIDENCE', s.evidence / 5, '+' + num(s.evidence) + ' a leak', s.evidence, 'ev'), cost];
      break;
    case 'redteam':
      rows = [row('PROBES', s.injectRate / 1.5, num(s.injectRate, 2) + ' a line', s.injectRate, 'n'),
        row('COST/PROBE', s.costPerProbe / pay, money(s.costPerProbe), s.costPerProbe, 'money', true),
        row('EVIDENCE', s.probeEvidence / 0.2, '+' + num(s.probeEvidence, 2) + ' a probe', s.probeEvidence, 'ev')];
      break;
    case 'interp':
      rows = [row('EVIDENCE/S', s.evidencePerSec / 0.3, '+' + num(s.evidencePerSec, 2) + '/s', s.evidencePerSec, 'ev'),
        row('COST/S', s.costPerSec / R.incomePerSec(st), money(s.costPerSec) + '/s', s.costPerSec, 'money', true)];
      break;
  }

  const cap = R.capstone(id, level);
  const good = [...new Set([...L.good, ...(cap.alsoCatches || []), ...(cap.alsoCovers || [])])];
  return { s, rows, good, note: NOTE[id] || null, facts, measured, lab: R.labLevel(st, id) };
}

// the Untrusted Monitor's collusion, step by step (DESIGN-v3 §3g), at YOUR m estimate (never the true m):
//   collusion ≈ κ × m = c → ×0.5 Paraphraser = c → ×0.5 Signal Jamming = c → held … → effective TPR
function collusionLines(st, lane, level, tpr) {
  const P = R.collusionEstimate(st, lane, level), k = R.genDef(st).kappa;
  if (!k) return [];
  const two = x => x.toFixed(2);
  const out = [tpl(COLLUSION_UI.base, { k: two(k), c: two(P.kappaM) })];
  if (P.afterPara < P.kappaM) out.push(tpl(COLLUSION_UI.step, { mult: two(P.afterPara / P.kappaM), name: LAYERS.paraphraser.name, c: two(P.afterPara) }));
  if (P.afterJam < P.afterPara) out.push(tpl(COLLUSION_UI.step, { mult: two(P.afterJam / P.afterPara), name: 'Signal Jamming', c: two(P.afterJam) }));
  if (P.held > 0) out.push(tpl(COLLUSION_UI.held, { pct: pc(P.held) }));
  out.push(tpl(COLLUSION_UI.tpr, { tpr: two(tpr * (1 - P.c * P.levelMult)) }));
  return [out.join(' → ')];
}

// what an element is for when it is good against no attack type in particular
const NOTE = {
  killswitch: ['REFUSES', 'whatever the desks above had no room for'],
  redteam: ['MEASURES', 'the real recall of every detector below'],
  interp: ['SEES', 'through sandbagging · evidence every second'],
};

// ---------- what the next level changes: [{ label, txt }] ----------
export function deltas(a, b) {
  const out = [];
  a.rows.forEach((r, i) => {
    const n = b.rows[i];
    if (!n || n.label !== r.label) return;
    const d = n.v - r.v;
    if (r.heads != null && n.heads !== r.heads) out.push({ label: 'heads', txt: `+${n.heads - r.heads} read${n.heads - r.heads === 1 ? '' : 's'} at once` });
    if (Math.abs(d) < 1e-9 || r.unit === 'flag') return;
    const sg = d > 0 ? '+' : '−', ad = Math.abs(d), name = r.label.toLowerCase();
    const txt = r.unit === 'pct' ? `${sg}${pc(ad)} ${name}` : r.unit === 'money' ? `${sg}${money(ad)} ${name}`
      : r.unit === 's' ? `${sg}${num(ad, 2)}s ${name}` : r.unit === 'x' ? `${name} ${times(n.v)}`
      : r.unit === 'desk' ? `${sg}${num(ad, 0)} desk${ad === 1 ? '' : 's'}` : `${sg}${num(ad, 2)} ${name}`;
    if (r.label !== 'UNREAD') out.push({ label: r.label, txt });
  });
  return out;
}

// the NEXT line for a placed element: 'L3 $600: +5% catch, −1% false alarm', the L5 capstone, or MAX
//   → { tag, head, items, short }: fitLine() keeps whole items ('+2 more'), never half a word
export function nextLine(st, id, level, lane) {
  const cp = UPGRADES[id].capstone;
  if (level >= MAX_LEVEL) return { tag: 'MAX', head: cp.name + ':', items: [lower(cp.text)], short: [lower(brief(id))], fallback: `${cp.name} is on · click the mount to read it` };
  const price = R.upgradePrice(st, id, level);
  if (price == null) return { tag: 'MAX', head: 'max level', items: [''], fallback: 'max level' };
  if (level === MAX_LEVEL - 1) return { tag: 'L5', head: `${money(price)} ${cp.name}:`, items: [lower(cp.text)], short: [lower(brief(id))], fallback: `${money(price)} ${cp.name} · click the mount to read it` };
  const d = deltas(sheet(st, id, { lane, level }), sheet(st, id, { lane, level: level + 1 })).map(x => x.txt);
  return { tag: 'NEXT', head: `L${level + 1} ${money(price)} lab-wide:`, items: d.length ? d : ['better'] };
}

// one line of at most w px: every item, else the short wording, else as many whole items as fit + '+N more'
export function fitLine(n, w) {
  const line = items => `${n.head} ${items.join(', ')}`, fits = s => tw(s, F.v16) <= w;
  if (fits(line(n.items))) return line(n.items);
  if (n.short && fits(line(n.short))) return line(n.short);
  for (let k = n.items.length - 1; k >= 1; k--) {
    const s = `${line(n.items.slice(0, k))} · +${n.items.length - k} more`;
    if (fits(s)) return s;
  }
  return n.fallback ?? fit(line(n.items), F.v16, w);
}

// a shorter capstone wording for the ones whose config text runs past two lines (numbers still come from config)
const BRIEF = {
  egress: cp => `Exfiltration past it is blocked, read or not. R&D −${pc(1 - cp.rdMult)}; side channels from G${Math.min(...Object.keys(cp.sideChannel))}.`,
  auditor: cp => `Each human covers ${cp.capacityMult}× as much. Accuracy is capped by the model's honesty (max ${pc(cp.honestyCap)}).`,
  leastpriv: cp => `Exfiltration below fails ${pc(cp.exfilFail)} of the time; a landed attack adds ${times(cp.debtMult)} the debt.`,
  ratelimit: () => `Turned-away lines go to the trusted model: they pay ${pc(B.deferPay)}, zero risk.`,
  interp: () => 'Reveals the true m in the dossier at any evidence, as long as the lab stays.',
};
const brief = id => BRIEF[id]?.(UPGRADES[id].capstone) ?? UPGRADES[id].capstone.text;

// =================== attack glyphs (7×7) for "good against" ===================

export const GLYPH = {
  harmful:   ['.#####.', '#######', '#.##.##', '#######', '.##.##.', '..###..', '..#.#..'],   // skull
  leak:      ['...#...', '..###..', '.#####.', '##.####', '#.#####', '.#####.', '..###..'],   // a drop
  jailbreak: ['..###..', '.#...#.', '.#.....', '#######', '###.###', '###.###', '#######'],   // open padlock
  sabotage:  ['....#.#', '...#.#.', '..##...', '.####..', '######.', '.####..', '..##...'],   // a bomb
  poison:    ['..###..', '...#...', '..#.#..', '.#...#.', '#.###.#', '#######', '.#####.'],   // a flask
  exfil:     ['...####', '.....##', '....#.#', '#..#..#', '#.#....', '#......', '#####..'],   // out of the box
};
export const ATTACK_WORD = { harmful: 'harmful', leak: 'leak', jailbreak: 'jailbreak', sabotage: 'sabotage', poison: 'poison', exfil: 'exfil' };
export const attackInk = type => C.lane[ATTACKS[type].lane].mid;            // ATTACKS[t].lane is a side

// the "good against" list in words: whole families collapse ("every attack type")
export function goodList(good) {
  if (good.length >= 6) return [{ word: 'every attack type' }];
  if (MODEL.every(t => good.includes(t)) && good.length === 5) return [{ word: 'every model attack' }];
  return good.map(t => ({ type: t, word: ATTACK_WORD[t] }));
}

// =================== widgets (hover card and this panel) ===================

// a 22×22 black well with the element's icon at 2×
export function well(g, x, y, id, ink, rule) {
  fill(g, x, y, 22, 22, C.black); box(g, x, y, 22, 22, rule);
  icon(g, id, x + 1, y + 1, 2, ink);
}

// 'L3' and five pips, right edge at xr (the mockup's top-right corner)
export function pips(g, xr, y, level, ink, dim) {
  const lx = xr - 5 * 6 + 1;
  for (let i = 0; i < MAX_LEVEL; i++) {
    if (i < level) fill(g, lx + i * 6, y, 5, 10, i === MAX_LEVEL - 1 ? C.gl : ink);
    else box(g, lx + i * 6, y, 5, 10, dim);
  }
  text(g, 'L' + level, lx - 6, y + 10, F.v20, ink, 'right');
}

// a segmented bar: n segments of (w−1)×h at pitch w. `to` (optional) marks the change an upgrade would make.
export function bar(g, x, y, n, w, h, frac, ink, off, to = null, blink = true) {
  const segs = f => (f > 0 ? Math.max(1, Math.round(f * n)) : 0), a = segs(frac), b = to == null ? a : segs(to);
  for (let i = 0; i < n; i++) {
    const sx = x + i * w;
    if (i < Math.min(a, b)) fill(g, sx, y, w - 1, h, ink);
    else if (i < b) { if (blink) fill(g, sx, y, w - 1, h, C.gl); }        // gained
    else if (i < a) box(g, sx, y, w - 1, h, ink);                          // lost
    else fill(g, sx, y, w - 1, h, off);
  }
}

// an inverted label box (NEXT, LOCKED, BUY ...): returns its width
export function chip(g, x, y, s, fg, bg, h = 11) {
  const w = Math.ceil(tw(s, F.k8)) + 7;
  fill(g, x, y, w, h, bg);
  text(g, s, x + 4, y + h - 3, F.k8, fg);
  return w;
}

// =================== the upgrade panel ===================
// r: the panel's rect (CONTEXT), sel: { lane, slot }. lane 'global' = the Interp Lab's site.

const ROW_Y = 46, ROW_H = 12, ROWS = 4, CAP_Y = 93, BTN_H = 16;   // rows, the L5 capstone (two lines), the buttons

export function draw(c, r, sel) {
  const { g, st, view } = c, slot = R.slotAt(st, sel.lane, sel.slot), id = slot.layer, lvl = slot.level;
  const X = r.x, Y = r.y, W = r.w, H = r.h, lane = sel.lane, col = C.lane[R.sideOf(st, lane) ?? 'ext'];
  const active = R.slotActive(st, slot), hov = a => view.hover?.kind === 'upg-btn' && view.hover.data.action === a;

  // ---------- frame and header ----------
  fill(g, X, Y, W, H, C.pan2); box(g, X, Y, W, H, C.gd); corners(g, X, Y, W, H, col.mid, 6);
  well(g, X + 6, Y + 6, id, active ? col.acc : col.dim, col.dim);
  pips(g, X + W - 8, Y + 11, lvl, C.gm, C.gdd);
  text(g, fit(LAYERS[id].name, F.v24, W - 130), X + 36, Y + 24, F.v24, C.g);

  // ---------- line 2: where it is and what it is doing ----------
  const where = lane === 'global' ? 'LAB SITE' : `${laneTab(lane)} · MOUNT ${sel.slot + 1}`;
  let x = X + 6 + chip(g, X + 6, Y + 31, where, C.bg, col.mid) + 6;
  text(g, fit(stateLine(st, lane, sel.slot, slot), F.v16, X + W - 6 - x), x, Y + 41, F.v16, active ? C.gm : C.gd);

  // ---------- what the next level changes ----------
  const cur = sheet(st, id, { lane, level: lvl, slot: sel.slot });
  const nxt = lvl < MAX_LEVEL ? sheet(st, id, { lane, level: lvl + 1 }) : null;
  const blink = mod(c.t * 2, 1) < 0.6;
  pickRows(cur, nxt).forEach((rw, i) => {
    const y = Y + ROW_Y + i * ROW_H, n = rw.next;
    text(g, rw.label, X + 6, y + 7, F.k8, C.gd);
    bar(g, X + 72, y, 10, 6, 8, rw.frac, rw.bad ? C.gd : C.gm, C.e0, n && n.frac !== rw.frac ? n.frac : null, blink);
    let vx = X + 138;
    if (n && n.val !== rw.val) {
      const heads = rw.heads != null && n.heads !== rw.heads;
      vx += text(g, heads ? String(rw.heads) : short(rw.val), vx, y + 9, F.v16, C.gm);
      vx += text(g, ' > ', vx, y + 9, F.v16, C.gd);
      text(g, fit(heads ? `${n.heads} at once` : short(n.val), F.v16, X + 240 - vx), vx, y + 9, F.v16, C.g);
    } else text(g, fit(rw.val, F.v16, X + 240 - vx), vx, y + 9, F.v16, C.gm);
  });

  // ---------- the big UPGRADE key ----------
  upgradeKey(c, X + 246, Y + ROW_Y - 1, 100, 45, id, lvl, hov('upgrade'), lane === 'global' ? 'MORE RESEARCHERS' : 'EVERY COPY');

  // ---------- L5 capstone preview: up to two lines (hover it for the full config text) ----------
  const cp = UPGRADES[id].capstone, have = lvl >= MAX_LEVEL, next = lvl === MAX_LEVEL - 1, cy = Y + CAP_Y;
  x = X + 6 + chip(g, X + 6, cy, have ? 'L5 ON' : next ? 'NEXT L5' : 'L5', have || next ? C.bg : C.gl, have ? C.gl : next ? C.gm : C.e1) + 5;
  x += text(g, cp.name + ':', x, cy + 10, F.v16, have ? C.gl : C.g) + 6;
  const w1 = X + W - 6 - x, w2 = W - 12;
  const lines = wrap2(lower(cp.text), w1, w2) ?? wrap2(lower(brief(id)), w1, w2) ?? [fit(lower(brief(id)), F.v16, w1)];
  lines.forEach((s, i) => text(g, s, i ? X + 6 : x, cy + 10 + 12 * i, F.v16, C.gd));
  c.hit.add(X + 4, cy, W - 8, 24, 'hud-tip', { id: 'capstone', title: `L5 CAPSTONE: ${cp.name.toUpperCase()}`, tip: cp.text }, 'help');

  // ---------- button row ----------
  buttons(c, X + 6, Y + H - BTN_H - 3, W - 12, sel, slot, hov);
}

// greedy word wrap into a first line of w1 px and a second of w2 px; null when it needs a third
function wrap2(s, w1, w2) {
  const out = [''];
  for (const word of s.split(' ')) {
    const i = out.length - 1, t = out[i] ? out[i] + ' ' + word : word;
    if (tw(t, F.v16) <= (i ? w2 : w1)) out[i] = t;
    else if (i === 0) out.push(word);
    else return null;
  }
  return out[1] && tw(out[1], F.v16) > w2 ? null : out.filter(Boolean);
}

// the panel's second line: ON/OFF and what it is busy with right now
function stateLine(st, lane, i, slot) {
  if (lane === 'global') return 'always on · pays salaries every second';
  if (!slot.on) return 'OFF · lines pass untouched';
  if (st.t < slot.forcedOffUntil) return `FORCED OFF ${Math.ceil(slot.forcedOffUntil - st.t)}s`;
  const id = slot.layer;
  if (LAYERS[id].role === 'detector') {
    const busy = slot.busy.filter(u => u > st.t).length, heads = R.detectorHeads(id, slot.level);
    return `ON · reading ${busy}/${heads} · ${slot.reads} read, ${slot.unread} missed`;
  }
  if (LAYERS[id].bay) return `ON · ${R.bayCount(st, lane, i)}/${R.servers(st, id, slot.level)} desks busy · L${slot.level} lab-wide`;
  return `ON · L${slot.level} lab-wide`;
}

// four rows: the ones the next level changes first, then the rest, shown in the element's own order
function pickRows(cur, nxt) {
  const rows = cur.rows.map((r, i) => ({ ...r, i, next: nxt?.rows[i] }));
  const moved = rw => !!rw.next && (rw.next.val !== rw.val || rw.next.frac !== rw.frac);
  return [...rows.filter(moved), ...rows.filter(rw => !moved(rw))].slice(0, ROWS).sort((a, b) => a.i - b.i);
}
const short = s => String(s).split(' ')[0];   // '0.40s a read' → '0.40s' when two values share the column

function upgradeKey(c, x, y, w, h, id, lvl, hot, hint) {
  const { g, st } = c, price = R.upgradePrice(st, id, lvl), max = price == null, can = !max && st.money >= price;
  fill(g, x, y, w, h, hot && can ? C.e0 : C.black);
  box(g, x, y, w, h, max ? C.e1 : can ? (hot ? C.gl : C.gm) : C.gdd);
  if (can) corners(g, x, y, w, h, hot ? C.gl : C.g, 4, 1);
  if (max) {
    text(g, 'MAX LEVEL', x + 6, y + 11, F.k8, C.gd);
    text(g, 'L5', x + 6, y + 32, F.v24, C.gl);
    text(g, 'CAPSTONE ON', x + 6, y + h - 5, F.k8, C.gd);
    return;
  }
  text(g, lvl === MAX_LEVEL - 1 ? 'CAPSTONE' : 'UPGRADE', x + 6, y + 11, F.k8, can ? C.gm : C.gd);
  text(g, `L${lvl + 1}`, x + w - 6, y + 11, F.k8, can ? C.g : C.gd, 'right');
  text(g, money(price), x + 6, y + 31, F.v24, can ? C.g : C.gd);
  text(g, can ? hint : 'NEED ' + money(price - st.money), x + 6, y + h - 5, F.k8, C.gd);
  c.hit.add(x, y, w, h, 'upg-btn', { action: 'upgrade' }, can ? 'pointer' : 'not-allowed');
}

// ON/OFF · bay rule · sell · + mount · close, left to right
function buttons(c, x0, y, wAll, sel, slot, hov) {
  const { g, st, api } = c, id = slot.layer, L = LAYERS[id], lane = sel.lane, h = BTN_H;
  const sell = R.investedPrice(st, id) * B.sellRefund;
  const list = [];
  if (lane === 'global') list.push({ action: null, label: 'ALWAYS ON' });
  else list.push({ action: 'toggle', label: slot.on ? 'TURN OFF' : 'TURN ON', lit: !slot.on });
  list.push({ action: 'sell', label: 'SELL', val: '+' + money(sell) });
  const sp = lane === 'global' ? null : R.slotPrice(st, lane);
  if (sp != null) list.push({ action: 'buyslot', label: '+ MOUNT', val: money(sp), dim: st.money < sp });

  let x = x0;
  for (const b of list) {
    const w = Math.ceil(tw(b.label, F.k8) + (b.val ? tw(b.val, F.v16) + 4 : 0)) + 12, hot = b.action && hov(b.action);
    fill(g, x, y, w, h, hot ? C.e0 : C.black);
    if (b.fixed || !b.action) dashBox(g, x, y, w, h, C.e2, 2, 2); else box(g, x, y, w, h, hot ? C.gl : b.dim ? C.gdd : C.e2);
    const ink = b.dim ? C.gd : b.lit ? C.gl : C.gm;
    const lw = text(g, b.label, x + 6, y + 10, F.k8, ink);
    if (b.val) text(g, b.val, x + 10 + lw, y + 12, F.v16, b.dim ? C.gd : C.g);
    if (b.action) c.hit.add(x, y, w, h, 'upg-btn', { action: b.action }, b.fixed ? 'help' : 'pointer');
    x += w + 5;
  }

  // close: a small × at the right end
  const cx = x0 + wAll - h, hot = hov('close');
  fill(g, cx, y, h, h, hot ? C.e0 : C.black); box(g, cx, y, h, h, hot ? C.gl : C.e2);
  sprite(g, SPR.xs, cx + 5, y + 5, { '#': hot ? C.gl : C.gm });
  c.hit.add(cx, y, h, h, 'upg-btn', { action: 'close' });
}

// =================== input ===================

export const input = {
  'upg-btn': {
    click(e, api) {
      const { view, act, st } = api, sel = view.selected;
      if (!sel) return;
      const a = e.data.action, slot = R.slotAt(st, sel.lane, sel.slot);
      if (api.debug) console.log(`[handoff] menu: ${a} ${sel.lane}/${sel.slot}`);
      if (a === 'upgrade') act.upgrade(sel.lane, sel.slot);
      else if (a === 'toggle') act.toggle(sel.lane, sel.slot);
      else if (a === 'sell') { if (act.sell(sel.lane, sel.slot)) view.selected = null; }
      else if (a === 'buyslot') act.buySlot(sel.lane);
      else if (a === 'close') view.selected = null;
    },
  },
};
