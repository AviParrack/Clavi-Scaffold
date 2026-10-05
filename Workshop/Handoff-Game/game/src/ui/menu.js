// ===== Defense menu: 18 keys in role groups, role tabs, and the context panel above them =====
// Look: design/codec-mockups/variant-c.js (buildHover, buildMenu, drawMenu). Plan: design/UI-PLAN.md §4, §6, §9.
// Context panel, first match wins: a research card waiting for its mount · hovered key · role tab · placed mount (not
// the selected one) → its card; placing → the picked card; view.selected → the upgrade panel (upgrade.js); else the
// lab actions. Never draws hidden truth: rated TPR, measured precision (upgrade.js sheet). ?debug=1 + T: a truth tick.
// Registers: menu-item {id} · menu-tab {role} · ctx-btn {action: research | cancel | retrain | rsp}   (upgrade.js: upg-btn)

import { LAYERS, ROLES } from '../config/layers.js';
import { BALANCE as B } from '../config/balance.js';
import { CARDS, TECH, V2_TECH } from '../config/cards.js';
import { RESEARCH_UI, STAMPS } from '../config/content/v3-text.js';
import * as R from '../sim/rules.js';
import { money, big, tpl } from '../util/format.js';
import { C, F, k as K, epoch, fill, box, dashBox, corners, text, tw, fit, wrap, blit, clamp, mod } from './theme.js';
import { icon, sprite, SPR, MICRO } from './sprites.js';
import { CONTEXT, MENU, menuKey, MENU_FOOT } from './layout.js';
import { unlockedInMenuOrder, openResearch } from './input.js';
import { laneTab } from './derive.js';
import * as upgrade from './upgrade.js';
import { sheet, pc, nextLine, fitLine, goodList, GLYPH, attackInk, well, pips, bar, chip } from './upgrade.js';

// =================== words: roles, one-line jobs, research branches ===================

const ORDER = Object.keys(LAYERS);
const ROLE = {
  detector:  { tab: 'DETECT', name: 'DETECTORS', icon: 'monitor',
    what: 'Detectors read the lines that pass their mount and flag the suspicious ones. A flag stops nothing by itself.',
    tip: 'stack different kinds: an attack must beat all' },
  responder: { tab: 'RESPOND', name: 'RESPONDERS', icon: 'auditor',
    what: 'Responders act on flags: they pull a flagged line into a side bay to audit, redo or re-roll it, or kill it.',
    tip: 'mount them BELOW detectors, a Kill Switch last' },
  modifier:  { tab: 'MODIFY', name: 'MODIFIERS', icon: 'paraphraser',
    what: 'Modifiers change every line that passes: rewrite it, box it in, cut its permissions or cap the flow.',
    tip: 'they act on lines below them: mount them high' },
  special:   { tab: 'SPECIAL', name: 'SPECIALS', icon: 'redteam',
    what: 'Specials work on the whole lane or the whole lab: bait, canaries, red-team measurement, interpretability.',
    tip: 'a Red Team on top shows what really gets caught' },
};
const JOB = {                    // one line on the card: about 32 characters at most
  probe: 'reads activations: cheap, instant', monitor: 'a weak trusted model reads lines',
  untrusted: 'a copy of the model checks itself', cot: 'reads its chain of thought',
  classifier: 'input filter: jailbreaks only', egress: 'counts outbound bytes: exfil',
  auditor: 'humans audit flagged lines', defer: 'a trusted model redoes flags',
  resampler: 're-rolls flagged lines', killswitch: 'kills what no one below handles',
  paraphraser: 'rewrites outputs, breaks codes', sandbox: 'boxes in every line below it',
  leastpriv: 'lines below get only needed keys', ratelimit: 'turns away surges and retry spam',
  honeypot: 'plants fake openings as bait', canary: 'fake secrets that trace leaks',
  redteam: 'fake attacks measure catch rates', interp: 'researchers reading activations',
};
// a locked key's caption: the research stream that unlocks it (MON, CTL, LAB), or the generation that clears it
const branchOf = id => {
  const h = LAYERS[id].unlockHint || '';
  return h.includes('Monitoring') ? 'MON' : h.includes('Control') ? 'CTL' : h.includes('Lab') ? 'LAB' : (h.match(/G\d/) || [''])[0];
};
const TECH_TITLE = { ...V2_TECH, ...Object.fromEntries(CARDS.filter(c => c.type === 'lab').map(c => [c.id, c.title])) };
const NEW_FOR = 120;     // s of play an unhovered unlock keeps its NEW glow (DESIGN-v3 §3g: until hovered)
const roleKeys = role => ORDER.filter(id => LAYERS[id].role === role);

// =================== cached art: repainted only when its signature changes ===================

const ART = new Map();
function art(name, sig, w, h, paint) {
  const id = sig + '|' + K + '|' + epoch;
  let a = ART.get(name);
  if (!a || a.id !== id) {
    const cv = a?.cv ?? document.createElement('canvas');
    cv.width = Math.ceil(w * K); cv.height = Math.ceil(h * K);
    const lg = cv.getContext('2d');
    lg.setTransform(K, 0, 0, K, 0, 0);
    lg.imageSmoothingEnabled = false;
    paint(lg);
    a = { id, cv, w, h };
    ART.set(name, a);
  }
  return a;
}

// =================== draw ===================

export function draw(c) {
  const v = c.view, h = v.hover;
  const hovId = h?.kind === 'menu-item' ? h.data.id : null, tab = h?.kind === 'menu-tab' ? h.data.role : null;
  keys(c, hovId, tab);
  tabs(c, tab);
  help(c);
  contextPanel(c, hovId, tab);
  if (v.placing) c.late(ghost);
}

// =================== the 18 keys ===================
// 32×44 each: hotkey digit, icon, tag, price. Locked: silhouette, padlock, '?', research branch.

function keys(c, hovId, tab) {
  const { g, st, view } = c, order = unlockedInMenuOrder(st), fresh = freshUnlocks(c, hovId);
  const look = ORDER.map(id => {
    const state = view.placing === id ? 'picked' : hovId === id ? 'hover' : 'idle';
    if (!st.unlocked.includes(id)) return { id, locked: true, state };
    const price = R.buyPrice(st, id), hk = order.indexOf(id) + 1;
    return { id, can: st.money >= price, price: keyPrice(price), hk: hk <= 9 ? hk : 0, state, fresh: fresh.has(id) };
  });
  const sig = look.map(k => `${k.id}${k.state}${k.locked ? 'L' : `${+k.can}${k.price}${k.hk}${k.fresh ? 'N' : ''}`}`).join('|') + (tab || '');
  blit(g, art('keys', sig, MENU.w, 96, lg => {
    look.forEach((k, i) => {
      const r = menuKey(i), x = r.x - MENU.x, y = r.y - MENU.y;
      paintKey(lg, x, y, k);
      if (tab && LAYERS[k.id].role !== tab) { lg.globalAlpha = 0.7; fill(lg, x, y, r.w, r.h, C.bg); lg.globalAlpha = 1; }
    });
    brackets(lg, tab);
  }), MENU.x, MENU.y);
  ORDER.forEach((id, i) => { const r = menuKey(i); c.hit.add(r.x, r.y, r.w, r.h, 'menu-item', { id }); });
  // a fresh unlock glows (and says NEW) until it is hovered or placed, or NEW_FOR s pass
  const a = 0.35 + 0.35 * Math.sin(c.t * 5);
  look.forEach((k, i) => {
    if (!k.fresh || k.state === 'picked') return;
    const r = menuKey(i);
    g.globalAlpha = a; box(g, r.x - 1, r.y - 1, r.w + 2, r.h + 2, C.rs); g.globalAlpha = 1;
  });

  // the card's notch points at the hovered key (row 2: from the gap above it), and bobs over the armed one
  const i = ORDER.indexOf(hovId || view.placing);
  if (i >= 0) {
    const r = menuKey(i), armed = !hovId, bob = armed && mod(c.t * 1.5, 1) < 0.5 ? 1 : 0;
    const ny = r.y === menuKey(0).y ? CONTEXT.y + CONTEXT.h : r.y - 4;
    for (let k = 0; k < 4; k++) fill(g, r.x + 13 + k, ny + k + (r.y === menuKey(0).y ? bob : 0), 7 - 2 * k, 1, armed ? C.gl : C.gd);
  }
}

// elements unlocked in the last NEW_FOR s of play (fx 'unlock'), not hovered or placed since
function freshUnlocks(c, hovId) {
  const { st, view } = c, A = view.anim.menu || (view.anim.menu = { unlocked: new Map() }), cur = view.cursors.menu || (view.cursors.menu = { fx: 0, codec: 0 });
  const n = Math.min(st.fx.length, st.fxId - cur.fx);
  for (const e of n > 0 ? st.fx.slice(st.fx.length - n) : []) {
    if (e.type === 'unlock' && LAYERS[e.id]) A.unlocked.set(e.id, e.t);
    if (e.type === 'place') A.unlocked.delete(e.layer);
  }
  cur.fx = st.fxId;
  if (hovId && st.phase === 'play' && A.unlocked.delete(hovId)) console.log(`[handoff] menu: ${hovId} seen (NEW off)`);
  for (const [id, t] of A.unlocked) if (st.t - t > NEW_FOR) A.unlocked.delete(id);
  return new Set(A.unlocked.keys());
}

// a key's price caption: no '$' and no '.0', so it sits inside the 32 px key ($1.6k → 1.6k, $60.0M → 60M)
const keyPrice = p => big(p).replace('.0', '');

// one key, 32×44: { id, locked, state } or { id, can, price, hk, state: idle | hover | picked }
// icon y+2..y+21, tag caps y+25..y+34, price caps y+37..y+41: at least 3 px between each
function paintKey(g, x, y, k) {
  const picked = k.state === 'picked', hov = k.state === 'hover';
  fill(g, x, y, 32, 44, picked ? C.gm : hov ? C.e0 : C.pan2);
  if (k.locked) {
    box(g, x, y, 32, 44, hov ? C.gd : C.e0);
    icon(g, k.id, x + 6, y + 2, 2, hov ? C.e2 : C.e1);
    sprite(g, SPR.lock, x + 25, y + 2, { '#': hov ? C.gm : C.gd });
    text(g, '?', x + 16, y + 35, F.v16, hov ? C.gm : C.gd, 'center');
    text(g, branchOf(k.id), x + 16, y + 42, F.k8, C.gd, 'center');
    return;
  }
  box(g, x, y, 32, 44, picked ? C.gl : hov ? C.g : k.can ? C.e1 : C.e0);
  icon(g, k.id, x + 6, y + 2, 2, picked ? C.bg : hov ? C.gl : k.can ? C.gm : C.gd);
  if (k.hk) sprite(g, MICRO[k.hk], x + 2, y + 2, { '#': picked ? C.bg : C.gd });
  if (k.fresh && !picked) { fill(g, x + 13, y + 1, 18, 7, C.rs); text(g, STAMPS.fresh, x + 22, y + 7, F.k8, C.black, 'center'); }
  text(g, LAYERS[k.id].tag, x + 16, y + 35, F.v16, picked ? C.bg : hov ? C.g : C.gd, 'center');
  text(g, fit(k.price, F.k8, 28), x + 16, y + 42, F.k8, picked ? C.pan2 : hov ? C.g : k.can ? C.gm : C.gd, 'center');
}

// role brackets under each group of keys (a group can wrap onto the second row)
function brackets(g, tab) {
  for (const role of ROLES) {
    const ids = roleKeys(role), rows = new Map();
    for (const id of ids) { const i = ORDER.indexOf(id), row = Math.floor(i / 9); if (!rows.has(row)) rows.set(row, []); rows.get(row).push(i); }
    for (const is of rows.values()) {
      const a = menuKey(Math.min(...is)), b = menuKey(Math.max(...is)), x0 = a.x - MENU.x, x1 = b.x + b.w - MENU.x, y = a.y + a.h + 1 - MENU.y;
      const col = tab === role ? C.gm : C.e1;
      fill(g, x0, y + 1, x1 - x0, 1, col); fill(g, x0, y, 1, 2, col); fill(g, x1 - 1, y, 1, 2, col);
    }
  }
}

// =================== role tabs and the help line ===================

const TAB_Y = 619, TAB_H = 13, TAB_W = 85;
function tabs(c, tab) {
  const { g, st } = c;
  ROLES.forEach((role, i) => {
    const x = MENU.x + i * (TAB_W + 4), ids = roleKeys(role), n = ids.filter(id => st.unlocked.includes(id)).length, on = tab === role;
    fill(g, x, TAB_Y, TAB_W, TAB_H, on ? C.e0 : C.pan);
    box(g, x, TAB_Y, TAB_W, TAB_H, on ? C.gm : C.e0);
    text(g, ROLE[role].tab, x + 5, TAB_Y + 9, F.k8, on ? C.g : C.gm);
    text(g, `${n}/${ids.length}`, x + TAB_W - 5, TAB_Y + 9, F.k8, on ? C.g : C.gd, 'right');
    c.hit.add(x, TAB_Y, TAB_W, TAB_H, 'menu-tab', { role }, 'help');
  });
}

function help(c) {
  const { g, view } = c, y = MENU_FOOT.helpY;
  const s = view.research ? '[click] a lit mount   [esc] bank the card' : view.placing ? '[click] lit mount  [shift] keep  [esc] cancel' : '[1-9] place   [shift] upgrade   [rmb] sell';
  let x = MENU.x;
  for (const part of s.split(/(\[[^\]]+\])/)) if (part) x += text(g, part, x, y, F.v16, part[0] === '[' ? C.gm : C.gd);
  text(g, 'DEFENSE MENU', MENU.x + MENU.w, y, F.k8, C.gm, 'right');
}

// =================== the context panel ===================

function contextPanel(c, hovId, tab) {
  const { st, view } = c, h = view.hover;
  const onSite = h && ((h.kind === 'mount' || h.kind === 'bay') ? h.data : h.kind === 'lab-site' ? { lane: 'global', slot: 0 } : null);
  const placed = onSite && R.slotAt(st, onSite.lane, onSite.slot)?.layer, sel = view.selected;
  const isSel = placed && sel && sel.lane === onSite.lane && sel.slot === onSite.slot;     // the clicked mount shows its panel at once
  if (view.research) return researchPlacing(c);
  if (hovId) return card(c, { id: hovId });
  if (tab) return roleCard(c, tab);
  if (placed && !isSel) return card(c, { id: placed, lane: onSite.lane, slot: onSite.slot });
  if (view.placing) return card(c, { id: view.placing, placing: true });
  if (sel && R.slotAt(st, sel.lane, sel.slot)?.layer) return upgrade.draw(c, CONTEXT, sel);
  labActions(c);
}

// ---------- the hover card: Bloons-style spec sheet for a key, a placed mount, or the element being placed ----------

function card(c, opt) {
  const m = cardModel(c, opt);
  blit(c.g, art('card', JSON.stringify(m), CONTEXT.w, CONTEXT.h, lg => paintCard(lg, m)), CONTEXT.x, CONTEXT.y);
}

function cardModel(c, { id, lane = null, slot = null, placing = false }) {
  const { st, view } = c, L = LAYERS[id], placed = slot != null, locked = !st.unlocked.includes(id);
  const lvl = placed ? R.slotAt(st, lane, slot).level : 1;
  const sh = sheet(st, id, { lane, level: lvl, slot: placed && lane !== 'global' ? slot : null });
  const price = R.buyPrice(st, id), can = st.money >= price;
  const col = (placed && R.sideOf(st, lane)) || 'ext';                // a side: the colour
  const m = {
    id, name: L.name, role: L.role, job: JOB[id], locked, placed, col, lvl, active: placed ? R.slotActive(st, R.slotAt(st, lane, slot)) : true,
    head: placed ? null : locked ? 'LOCKED' : money(price), can,
    lanes: placed ? [{ s: lane === 'global' ? 'LAB SITE' : `${laneTab(lane)} #${slot + 1}`, lane: col, best: true }]
      : L.lanes.map(side => ({ s: side === 'global' ? 'LAB SITE' : side.toUpperCase(), lane: side === 'int' ? 'int' : 'ext', best: L.bestIn === 'both' || L.bestIn === side })),
    rows: sh.rows.map(r => ({ label: r.label, frac: +r.frac.toFixed(3), val: r.val, bad: r.bad })),
    good: goodList(sh.good), note: sh.note, facts: placed ? sh.facts : sh.facts.slice(-1), measured: null, alarm: false,
    desc: L.desc, truth: null, blink: false,
  };
  // a Red Team above it: the measured recall (with its error bar) against the rated TPR
  const ms = sh.s.laneMeasured || sh.s.measured, tpr = sh.rows[0]?.label === 'TPR' ? sh.rows[0].v : null;
  if (ms) {
    const r2 = x => Math.round(x * 100) / 100, err = Math.round(100 * ms.err);
    m.measured = sh.s.laneMeasured
      ? { txt: `stack below catches ${pc(ms.rate)} ±${err} (n ${ms.n})` }
      : { lo: r2(ms.lo), hi: r2(ms.hi), rate: r2(ms.rate), txt: `recall ${pc(ms.rate)} ±${err} · rated ${pc(tpr ?? 0)} · n ${ms.n}` };
    m.alarm = !sh.s.laneMeasured && tpr != null && ms.hi < tpr - 0.005;
  }
  if (c.debug && view.truth && tpr != null) m.truth = +(sh.s.tpr ?? 0).toFixed(3);

  const where = L.lanes.includes('global') ? 'the lab site' : L.lanes.length > 1 ? 'a mount, EXT or INT' : `a mount, ${L.lanes[0].toUpperCase()} only`;
  if (placing) {
    m.blink = mod(c.t * 2, 1) < 0.6;
    m.bottom = { tag: 'PLACING', txt: `now click ${where === 'the lab site' ? 'the lab site' : 'a lit mount'} · [esc] cancels`, on: true };
  } else if (locked) m.bottom = { tag: 'LOCKED', txt: `${L.unlockHint}: a research card unlocks it`, on: false };
  else if (placed) {
    const n = nextLine(st, id, lvl, lane), room = CONTEXT.w - 18 - (Math.ceil(tw(n.tag, F.k8)) + 7);
    m.bottom = { tag: n.tag, txt: fitLine(n, room), on: n.tag !== 'MAX' };
  }
  else {
    const n = unlockedInMenuOrder(st).indexOf(id) + 1;
    m.bottom = can ? { tag: 'BUY', txt: `click it, then ${where}${n > 0 && n <= 9 ? ` · key [${n}]` : ''}`, on: true }
      : { tag: 'BUY', txt: `need ${money(price - st.money)} more · goes on ${where}`, on: false };
  }
  return m;
}

const CARD = { rows: 47, barX: 74, barW: 160, good: 117, bottom: 122 };   // y of the bar rows, the GOOD VS line, the bottom line

function paintCard(g, m) {
  const W = CONTEXT.w, H = CONTEXT.h, ln = C.lane[m.col], dim = m.locked;
  const ink = { label: C.gd, bar: dim ? C.e1 : C.gm, barBad: dim ? C.e1 : C.gd, val: dim ? C.gd : C.g };

  // ---------- frame and header ----------
  fill(g, 0, 0, W, H, C.pan2); box(g, 0, 0, W, H, C.gd); corners(g, 0, 0, W, H, m.placed ? ln.mid : C.gm, 6);
  if (m.blink) dashBox(g, 2, 2, W - 4, H - 4, C.gm, 3, 3);
  well(g, 6, 6, m.id, dim ? C.e1 : m.placed ? (m.active ? ln.acc : ln.dim) : C.g, dim ? C.e0 : m.placed ? ln.dim : C.gd);
  if (dim) sprite(g, SPR.lock, 22, 3, { '#': C.gd });
  let right = W - 8;                                   // the name stops where the top-right corner starts
  if (m.placed) { pips(g, W - 8, 11, m.lvl, C.gm, C.gdd); right -= 54; }
  else if (m.locked) right -= text(g, 'LOCKED', W - 8, 21, F.k8, C.gd, 'right') + 4;
  else right -= text(g, m.head, W - 8, 24, F.v24, m.can ? C.g : C.gd, 'right') + 6;
  text(g, fit(m.name, F.v24, right - 42), 36, 24, F.v24, dim ? C.gd : C.g);

  // ---------- line 2: role · job · where it goes ----------
  let lx = W - 6;
  for (const l of [...m.lanes].reverse()) {
    const w = Math.ceil(tw(l.s, F.k8)) + 7, lc = C.lane[l.lane];
    lx -= w;
    if (l.best) chip(g, lx, 31, l.s, C.bg, dim ? lc.dim : lc.mid); else { box(g, lx, 31, w, 11, lc.dim); text(g, l.s, lx + 4, 39, F.k8, lc.mid); }
    lx -= 3;
  }
  const rx = 6 + chip(g, 6, 31, m.role.toUpperCase(), dim ? C.gd : C.g, C.e1) + 5;
  text(g, fit(m.job, F.v16, lx - 4 - rx), rx, 41, F.v16, C.gd);

  // ---------- stat bars ----------
  const pitch = m.rows.length > 4 ? 12 : 14, px = f => CARD.barX + Math.round(f * CARD.barW);
  m.rows.forEach((r, i) => {
    const y = CARD.rows + i * pitch;
    text(g, r.label, 6, y + 7, F.k8, ink.label);
    bar(g, CARD.barX, y, CARD.barW / 8, 8, 8, r.frac, r.bad ? ink.barBad : ink.bar, C.e0);
    text(g, fit(r.val, F.v16, W - 14 - CARD.barX - CARD.barW), W - 8, y + 9, F.v16, ink.val, 'right');
  });
  // the Red Team's error bar just under the TPR bar (red when even its top is under the rated TPR), and the debug truth tick
  const y0 = CARD.rows, onCatch = m.rows[0]?.label === 'TPR';
  if (onCatch && m.measured?.rate != null) {
    const x0 = px(m.measured.lo), x1 = px(m.measured.hi), mc = m.alarm ? C.r : C.gl, by = y0 + 10;
    fill(g, x0, by, x1 - x0 + 1, 1, mc); fill(g, x0, by - 2, 1, 3, mc); fill(g, x1, by - 2, 1, 3, mc);
    fill(g, px(m.measured.rate), by - 2, 1, 4, mc);
  }
  if (onCatch && m.truth != null) fill(g, px(m.truth), y0 - 2, 2, 12, C.debug);

  // the room left under the bars: the facts (precision, overflow, break-even ...), then the element's own description
  const freeY = CARD.rows + m.rows.length * pitch + 9;
  let lines = Math.floor((CARD.good - 4 - freeY) / 13), fy = freeY + 4;
  for (const f of m.facts) {
    if (lines <= 0) break;
    const ls = wrapFit(f, W - 12, Math.min(lines, 2));
    ls.forEach((s, i) => text(g, s, 6, fy + i * 13, F.v16, dim ? C.gd : C.gm));
    fy += 13 * ls.length; lines -= ls.length;
  }
  if (lines > 0) wrapFit(m.desc, W - 12, lines).forEach((s, i) => text(g, s, 6, fy + i * 13, F.v16, C.gd));

  // ---------- good against, or the red team's measurement ----------
  const gy = CARD.good;
  if (m.measured) {
    const w = chip(g, 6, gy - 9, 'RED TEAM', C.bg, m.alarm ? C.r : C.gm);
    text(g, fit(m.measured.txt + (m.alarm ? ' · BELOW SPEC' : ''), F.v16, W - 18 - w), 12 + w, gy, F.v16, m.alarm ? C.r : C.g);
  } else if (m.note && !m.good.length) {
    const w = text(g, m.note[0], 6, gy - 1, F.k8, ink.label);
    text(g, fit(m.note[1], F.v16, W - 18 - w), 12 + w, gy, F.v16, dim ? C.gd : C.gm);
  } else if (m.good.length) {
    let x = 6 + text(g, 'GOOD VS', 6, gy - 1, F.k8, ink.label) + 7;
    for (const a of m.good) {
      const w = (a.type ? 10 : 0) + tw(a.word, F.v16);
      if (x + w > W - 6) break;
      const ac = dim ? C.gd : a.type ? attackInk(a.type) : C.gm;
      if (a.type) sprite(g, GLYPH[a.type], x, gy - 8, { '#': ac });
      x += text(g, a.word, x + (a.type ? 10 : 0), gy, F.v16, ac) + (a.type ? 10 : 0) + 9;
    }
  }

  // ---------- bottom line: NEXT / BUY / LOCKED / PLACING ----------
  const b = m.bottom, by = CARD.bottom;
  const tagBg = b.tag === 'LOCKED' ? C.e1 : b.on ? (b.tag === 'L5' ? C.gl : C.gm) : C.gdd;
  const w = chip(g, 6, by, b.tag, b.tag === 'LOCKED' ? C.gm : C.bg, b.tag === 'PLACING' && !m.blink ? C.gd : tagBg);
  text(g, fit(b.txt, F.v16, W - 18 - w), 12 + w, by + 10, F.v16, b.on ? C.g : C.gd);
}

// word-wrap into at most n lines, the last one cut with …
function wrapFit(s, w, n) {
  const ls = wrap(s, F.v16, w);
  if (ls.length <= n) return ls;
  return [...ls.slice(0, n - 1), fit(ls.slice(n - 1).join(' '), F.v16, w)];
}

// ---------- a research card waiting for its mount (NEW: an empty mount · MOUNT: a lane) ----------

function researchPlacing(c) {
  const { g, st, view } = c, X = CONTEXT.x, Y = CONTEXT.y, W = CONTEXT.w, H = CONTEXT.h, r = view.research;
  const blink = mod(c.t * 2, 1) < 0.6;
  fill(g, X, Y, W, H, C.pan2); box(g, X, Y, W, H, C.rsm); corners(g, X, Y, W, H, C.rs, 6);
  if (blink) dashBox(g, X + 2, Y + 2, W - 4, H - 4, C.rsd, 3, 3);
  if (r.layer) well(g, X + 6, Y + 6, r.layer, C.rs, C.rsm);
  text(g, RESEARCH_UI.badge, X + 36, Y + 13, F.k8, C.rsm);
  text(g, fit(r.name, F.v24, W - 44), X + 36, Y + 30, F.v24, C.gl);
  const ask = r.type === 'new' ? tpl(RESEARCH_UI.place, { name: r.name }) : 'Choose a lane for the extra mount';
  const how = r.type === 'new' ? 'click a lit empty mount; the first copy is free' : `click a lane's tab or its + SLOT row (up to ${B.maxSlots} mounts)`;
  wrapFit(ask, W - 12, 2).forEach((s, i) => text(g, s, X + 6, Y + 56 + i * 16, F.v20, C.g));
  wrapFit(how, W - 12, 2).forEach((s, i) => text(g, s, X + 6, Y + 92 + i * 14, F.v16, C.gm));
  const y = Y + H - 22, w = W - 12, hot = view.hover?.kind === 'ctx-btn' && view.hover.data.action === 'cancel';
  fill(g, X + 6, y, w, 17, hot ? C.e0 : C.black); box(g, X + 6, y, w, 17, hot ? C.gl : C.e2);
  chip(g, X + 10, y + 3, 'ESC', C.bg, C.gm, 11);
  text(g, fit(RESEARCH_UI.cancel, F.v16, w - 40), X + 38, y + 13, F.v16, hot ? C.gl : C.gm);
  c.hit.add(X + 6, y, w, 17, 'ctx-btn', { action: 'cancel' });
}

// ---------- role card (hovered tab) ----------

function roleCard(c, role) {
  const { st } = c, ids = roleKeys(role);
  const sig = role + '|' + ids.map(id => +st.unlocked.includes(id)).join('');
  blit(c.g, art('role', sig, CONTEXT.w, CONTEXT.h, g => {
    const W = CONTEXT.w, H = CONTEXT.h, R0 = ROLE[role];
    fill(g, 0, 0, W, H, C.pan2); box(g, 0, 0, W, H, C.gd); corners(g, 0, 0, W, H, C.gm, 6);
    well(g, 6, 6, R0.icon, C.g, C.gd);
    text(g, R0.name, 36, 24, F.v24, C.g);
    const n = ids.filter(id => st.unlocked.includes(id)).length;
    text(g, `${n}/${ids.length} UNLOCKED`, W - 8, 21, F.k8, C.gd, 'right');
    wrapFit(R0.what, W - 12, 2).forEach((s, i) => text(g, s, 6, 44 + i * 14, F.v16, C.gm));
    ids.forEach((id, i) => {
      const x = 6 + i * 56, on = st.unlocked.includes(id);
      well(g, x, 76, id, on ? C.gm : C.e1, on ? C.gd : C.e0);
      if (!on) sprite(g, SPR.lock, x + 16, 73, { '#': C.gd });
      text(g, on ? LAYERS[id].tag : '?', x + 26, 92, F.v16, on ? C.g : C.gd);
      text(g, on ? '' : branchOf(id), x + 26, 101, F.k8, C.gd);
    });
    const w = chip(g, 6, 122, 'TIP', C.bg, C.gm);
    text(g, fit(R0.tip, F.v16, W - 18 - w), 12 + w, 132, F.v16, C.g);
  }), CONTEXT.x, CONTEXT.y);
}

// ---------- lab actions: what the panel shows when nothing is hovered or selected ----------

function labActions(c) {
  const { g, st, view } = c, X = CONTEXT.x, Y = CONTEXT.y, W = CONTEXT.w, H = CONTEXT.h;
  fill(g, X, Y, W, H, C.pan); box(g, X, Y, W, H, C.e0); corners(g, X, Y, W, H, C.e2, 6);
  text(g, 'LAB OPERATIONS', X + 8, Y + 13, F.k8, C.gm);
  const ew = text(g, st.evidence.toFixed(1), X + W - 8, Y + 15, F.v20, C.g, 'right');
  text(g, 'EVIDENCE', X + W - 14 - ew, Y + 13, F.k8, C.gd, 'right');

  // ---------- buttons ----------
  const hov = a => view.hover?.kind === 'ctx-btn' && view.hover.data.action === a;
  const fresh = st.probe.trainedGen === st.gen && st.probe.shift === 0, lvl = R.labLevel(st, 'probe');
  const probeNow = R.probeBaseTPR(st, lvl), probeNew = LAYERS.probe.tpr[st.gen - 1] * R.lv('probe', lvl, 'tprMult');
  const Rs = st.research, n = Rs.banked.length, rate = R.rpRate(st), left = rate > 0 ? Math.max(0, B.research.offerRP - Rs.rp) / rate : Infinity;
  const rows = [
    { action: 'research', key: 'R', label: RESEARCH_UI.badge, cost: n ? `${n} READY` : '', can: n > 0 && st.phase === 'play',
      txt: n ? 'three cards, one per work stream: pick one' : isFinite(left) ? tpl(RESEARCH_UI.next, { secs: Math.ceil(left) }) : 'the lab is dark' },
    { action: 'retrain', label: 'RETRAIN PROBES', cost: `${B.retrainEvidence} EV`, can: !fresh && st.evidence >= B.retrainEvidence,
      txt: fresh ? `probes are fresh: TPR ${pc(probeNow)}` : `probe TPR ${pc(probeNow)} > ${pc(probeNew)}` },
  ];
  if (st.upgrades.rsp) rows.push({ action: 'rsp', label: 'INVOKE RSP', cost: '', can: st.rsp.ready,
    txt: st.rsp.ready ? `pause ${TECH.rspPause}s: m −${TECH.rspM}, rep +${TECH.rspRep}` : st.rsp.usedGen === st.gen ? 'used this generation' : `estimate must pass ${pc(TECH.rspThreshold)}` });
  rows.forEach((b, i) => {
    const y = Y + 21 + i * 22, x = X + 6, w = W - 12, h = 19, hot = hov(b.action);
    fill(g, x, y, w, h, hot && b.can ? C.e0 : C.black);
    box(g, x, y, w, h, b.can ? (hot ? C.gl : C.gm) : C.e1);
    if (b.can && b.action === 'rsp' && mod(c.t * 2, 1) < 0.5) corners(g, x, y, w, h, C.gl, 4, 1);
    if (b.key) chip(g, x + 4, y + 4, b.key, C.bg, b.can ? C.gm : C.gd, 11);
    text(g, b.label, x + 22, y + 12, F.k8, b.can ? C.g : C.gd);
    text(g, b.cost, x + 140, y + 14, F.v16, b.can ? C.g : C.gd, 'right');
    text(g, fit(b.txt, F.v16, w - 156), x + 150, y + 14, F.v16, b.can ? C.gm : C.gd);
    c.hit.add(x, y, w, h, 'ctx-btn', { action: b.action }, b.can ? 'pointer' : 'not-allowed');
  });

  // ---------- below: each stack on paper, the tech taken, a hint (as many as fit) ----------
  const taken = Object.keys(st.upgrades).filter(id => TECH_TITLE[id]).map(id => TECH_TITLE[id] + (st.upgrades[id] > 1 ? ` ×${st.upgrades[id]}` : ''));
  const lines = [
    { tag: laneTab(view.focus.ext), bg: C.lane.ext.mid, txt: stackLine(st, view.focus.ext), col: C.gm },
    { tag: laneTab(view.focus.int), bg: C.lane.int.mid, txt: stackLine(st, view.focus.int), col: C.gm },
    { tag: 'TECH', bg: taken.length ? C.gm : C.gdd, txt: taken.join(' · ') || 'none yet · research draws offer some', col: taken.length ? C.g : C.gd },
    { txt: 'hover anything for its card · click a mount to upgrade (lab-wide)', col: C.gd },
  ];
  let y = Y + 21 + rows.length * 22 + 13;
  for (const l of lines) {
    if (y > Y + H - 5) break;
    const w = l.tag ? chip(g, X + 6, y - 9, l.tag, C.bg, l.bg) + 6 : 2;
    text(g, fit(l.txt, F.v16, W - 14 - w), X + 6 + w, y + 1, F.v16, l.col);
    y += 14;
  }
}

// one lane's stack on paper: the chance its detectors flag a model attack (rated TPR × heads free), what acts on it
function stackLine(st, lane) {
  if (!st.lanes[lane]) return 'no lane';
  let miss = 1, det = 0, resp = 0, kill = false;
  st.lanes[lane].slots.forEach(s => {
    if (!s.layer || !R.slotActive(st, s)) return;
    const L = LAYERS[s.layer];
    if (L.role === 'detector' && !L.catches) {
      det++;
      miss *= 1 - R.ratedTPR(st, s.layer, s.level, lane) * (1 - R.elementStats(st, s.layer, { lane, level: s.level }).unreadRate);
    }
    if (R.isResolver(s.layer)) resp++;
    if (s.layer === 'killswitch') kill = true;
  });
  const tail = `${resp} responder${resp === 1 ? '' : 's'} · ${kill ? 'kill switch' : 'no kill switch'}`;
  return det ? `flags ${pc(1 - miss)} on paper · ${tail}` : `no detectors · ${tail}`;
}

// ---------- the armed element follows the pointer (drawn last, over the board) ----------

function ghost(c) {
  const { g, view, st } = c, h = view.hover, id = view.placing, m = view.mouse;
  // hidden over the menu, and over anything that shows the placement itself (an empty mount, the lab site, a button)
  const free = !h || h.kind === 'bay' || (h.kind === 'mount' && !!R.slotAt(st, h.data.lane, h.data.slot)?.layer);
  if (!id || !m.inside || !free || (m.x >= CONTEXT.x && m.y >= CONTEXT.y)) return;
  const x = clamp(Math.round(m.x) + 12, 0, 1200 - 64), y = clamp(Math.round(m.y) + 12, 0, 660 - 26);
  g.globalAlpha = 0.9;
  fill(g, x, y, 64, 26, C.pan2); box(g, x, y, 64, 26, C.gm);
  well(g, x + 2, y + 2, id, C.gl, C.gm);
  text(g, LAYERS[id].tag, x + 28, y + 17, F.v20, C.gl);
  g.globalAlpha = 1;
}

// =================== input ===================

const DOUBLE = 350;      // ms: a second click this soon on the same key is a double-click, not a toggle-off
let armedAt = 0;

export const input = {
  'menu-item': {
    click(e, api) {
      const { view, st } = api, id = e.data.id;
      if (!st.unlocked.includes(id)) { view.toast(`${LAYERS[id].name}: ${LAYERS[id].unlockHint}`); return; }
      if (view.research) { view.toast('choose a mount for the research card first, or [esc]'); return; }
      const now = performance.now();
      if (view.placing === id && now - armedAt < DOUBLE) return;      // a double-click keeps it armed
      view.placing = view.placing === id ? null : id;
      armedAt = view.placing ? now : 0;
      view.selected = null;
      if (api.debug) console.log(`[handoff] menu: ${view.placing ? 'arm ' + id : 'disarm'}`);
    },
    context(e, api) { api.view.placing = null; },
  },
  'ctx-btn': {
    click(e, api) {
      const a = e.data.action, { act, st, view } = api;
      if (api.debug) console.log(`[handoff] menu: ${a}`);
      if (a === 'research') openResearch(api);
      else if (a === 'cancel') { if (view.research) act.bankCard(); view.research = null; view.placing = null; }
      else if (a === 'retrain') {
        if (st.probe.trainedGen === st.gen && st.probe.shift === 0) view.toast('probes are already fresh: save the evidence');
        else act.retrainProbes();
      } else if (a === 'rsp') act.invokeRSP();
    },
  },
  ...upgrade.input,
};
