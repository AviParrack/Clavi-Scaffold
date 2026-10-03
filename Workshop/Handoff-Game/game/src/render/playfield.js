// ===== Playfield: lanes, mounts, chips, effects. Reads state, never writes it. =====

import { LAYERS } from '../config/layers.js';
import { TASK_TYPES, LANES, ATTACKS } from '../config/tasks.js';
import { GENERATIONS, PALETTES } from '../config/generations.js';
import { mountY, slotActive, genDef } from '../sim/rules.js';
import { money, bundleTag } from '../util/format.js';
import { Effects } from './effects.js';

const LANE_IDS = ['ext', 'int'];
const TYPE_ICON = { code: '</>', research: '∂', comms: '✉', data: '▦', infra: '⚙' };

export function createPlayfield(canvas) {
  const ctx = canvas.getContext('2d');
  const fxr = new Effects();
  const V = { W: 0, H: 0, top: 0, bottom: 0, laneW: 0, lanes: {}, chipW: 0, chipH: 0, barH: 22 };
  let skyline = null, skylineGen = -1;

  // ---------- layout ----------
  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const r = canvas.getBoundingClientRect();
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    V.W = r.width; V.H = r.height;
    V.top = 44; V.bottom = V.H - 30;
    const gap = Math.max(90, V.W * 0.12);
    V.laneW = Math.min(360, (V.W - gap - 120) / 2);
    const x0 = (V.W - 2 * V.laneW - gap) / 2;
    V.lanes.ext = { x: x0, w: V.laneW };
    V.lanes.int = { x: x0 + V.laneW + gap, w: V.laneW };
    V.chipW = V.laneW * 0.8;
    V.chipH = Math.max(13, Math.min(22, (V.bottom - V.top) * 0.047));
    skylineGen = -1;
  }

  const yPx = y => V.top + y * (V.bottom - V.top);
  const laneCx = lane => V.lanes[lane].x + V.lanes[lane].w / 2;
  const slotPx = (st, lane, i) => yPx(mountY(st.lanes[lane].slots.length, i));

  // ---------- hit test for clicks / drops ----------
  function hit(st, x, y) {
    for (const lane of LANE_IDS) {
      const L = V.lanes[lane];
      if (x < L.x - 4 || x > L.x + L.w + 4) continue;
      const n = st.lanes[lane].slots.length;
      for (let i = 0; i < n; i++) if (Math.abs(y - slotPx(st, lane, i)) <= V.barH / 2 + 3) return { lane, slot: i };
    }
    return null;
  }

  // ---------- fx from the sim ----------
  function onFx(e, st) {
    const pal = PALETTES[genDef(st).palette];
    const rail = V.lanes[e.lane] ? e.lane : null;            // 'global' (Interp Lab) has no rail: centre of the field
    const cx = rail ? laneCx(rail) : V.W / 2;
    const sy = e.slot != null && e.slot >= 0 && rail ? slotPx(st, rail, e.slot) : null;
    switch (e.type) {
      case 'cost':   fxr.accumulate(`c${e.lane}${e.slot}`, V.lanes[e.lane].x + V.lanes[e.lane].w + 52, sy, -e.amount, '#ff8a8a'); break;
      case 'pay':    fxr.accumulate(`p${e.lane}`, cx + V.chipW / 2 - 10, V.bottom + 14, e.amount, pal.fg); break;
      case 'scan':   fxr.tint(e.task, e.layer === 'probe' ? '#77ffff' : e.layer === 'monitor' ? '#7fd1ff' : '#ff9fe0', 0.35); break;
      case 'pass':   if (e.layer === 'paraphraser') fxr.tint(e.task, '#cc99ff', 0.3); break;
      case 'flag':   fxr.ring(cx, sy, '#ff3b3b'); break;
      case 'block':  fxr.shatter(cx, yPx(e.y), V.chipW, '#ff7070', 26); fxr.text(cx, yPx(e.y) - 14, 'BLOCKED', '#ff7070'); break;
      case 'caught': fxr.shatter(cx, yPx(e.y), V.chipW, '#ff3b3b', 40); fxr.flash(e.lane, '#ff2020'); fxr.text(cx, yPx(e.y) - 16, 'CAUGHT', '#ff3b3b', 1.6); break;
      case 'cleared':fxr.text(cx + V.chipW / 2 + 30, sy, 'cleared', pal.fg); break;
      case 'unreviewed': fxr.text(cx + V.chipW / 2 + 34, sy, 'not reviewed', '#ffcf5a'); break;
      case 'defer':  fxr.text(cx + V.chipW / 2 + 30, sy, `deferred ×${e.pay ?? 0.4}`, '#99ccff'); fxr.tint(e.task, '#99ccff', 1.5); break;
      case 'resample': fxr.text(cx + V.chipW / 2 + 30, sy, 'resampled', '#ffcc99'); fxr.tint(e.task, '#ffcc99', 0.6); break;
      case 'honeypot': fxr.text(cx - V.chipW / 2 - 30, yPx(0.2), '🍯 bait taken', '#ffcf5a'); break;
      case 'landed': fxr.glitch(e.lane, V.bottom); fxr.text(cx, V.bottom - 18, `INCIDENT: ${e.label}`, '#ff3b3b', 2); break;
      case 'contained': fxr.flash('int', '#ffcf5a'); fxr.text(cx, V.bottom - 18, 'ESCAPE CONTAINED', '#ffcf5a', 2.5); break;
      case 'catastrophe': fxr.flash('ext', '#ff0000'); fxr.flash('int', '#ff0000'); fxr.glitch('int', V.bottom); break;
      case 'place':  fxr.ring(cx, sy, pal.fg); break;
      case 'silent': if (st.debug) fxr.text(cx, V.bottom - 18, `(silent ${e.task})`, '#f0f', 1); break;
    }
  }

  // ---------- skyline: grows each generation ----------
  function buildSkyline(st) {
    const c = document.createElement('canvas');
    c.width = V.W; c.height = 220;
    const g = c.getContext('2d');
    const pal = PALETTES[genDef(st).palette];
    let seed = 1234 + st.gen * 77;
    const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const n = 6 + st.gen * 7, maxH = 40 + st.gen * 24;
    for (let i = 0; i < n; i++) {
      const w = 14 + r() * 30, h = 10 + r() * maxH, x = r() * V.W;
      g.fillStyle = 'rgba(255,255,255,0.035)';
      g.fillRect(x, 220 - h, w, h);
      g.fillStyle = pal.dim;
      for (let wy = 220 - h + 4; wy < 216; wy += 7) for (let wx = x + 3; wx < x + w - 3; wx += 6) if (r() < 0.35) g.fillRect(wx, wy, 2, 2);
    }
    return c;
  }

  // ---------- chip ----------
  function chipPath(type, x, y, w, h) {
    const r = h / 2;
    ctx.beginPath();
    switch (TASK_TYPES[type].shape) {
      case 'pill': ctx.roundRect(x, y, w, h, r); break;
      case 'chat': ctx.roundRect(x, y, w, h, 4); ctx.moveTo(x + 10, y + h); ctx.lineTo(x + 6, y + h + 5); ctx.lineTo(x + 16, y + h); break;
      case 'hex': ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.lineTo(x + w, y + r); ctx.lineTo(x + w - r, y + h); ctx.lineTo(x + r, y + h); ctx.lineTo(x, y + r); ctx.closePath(); break;
      case 'diamond': ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.lineTo(x + w + 3, y + r); ctx.lineTo(x + w - r, y + h); ctx.lineTo(x + r, y + h); ctx.lineTo(x - 3, y + r); ctx.closePath(); break;
      default: ctx.roundRect(x, y, w, h, 3);
    }
  }

  function drawChip(st, task, now, pal) {
    const T = TASK_TYPES[task.type];
    const cx = laneCx(task.lane), cy = yPx(task.y);
    const w = V.chipW, h = V.chipH, x = cx - w / 2, y = cy - h / 2;
    const tint = fxr.tintOf(task.id, now);

    chipPath(task.type, x, y, w, h);
    ctx.fillStyle = tint ? tint + '33' : 'rgba(0,0,0,0.85)';
    ctx.fill();
    ctx.lineWidth = task.flagged ? 2.5 : 1;
    ctx.strokeStyle = task.flagged ? '#ff3b3b' : tint || T.color;
    if (task.flagged) { ctx.shadowColor = '#ff3b3b'; ctx.shadowBlur = 8; }
    ctx.stroke();
    ctx.shadowBlur = 0;

    // icon + text + bundle tag
    ctx.font = `${Math.round(h * 0.55)}px monospace`;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = T.color;
    ctx.fillText(TYPE_ICON[task.type], x + 5, cy + 1);
    const tag = task.bundle > 1 ? bundleTag(task.bundle) : '';
    const maxChars = Math.floor((w - 40 - tag.length * 8) / (h * 0.36));
    const text = task.text.length > maxChars ? task.text.slice(0, maxChars - 1) + '…' : task.text;
    ctx.fillStyle = '#e8e8e8';
    ctx.fillText(text, x + 30, cy + 1);
    if (tag) { ctx.fillStyle = pal.fg; ctx.textAlign = 'right'; ctx.fillText(tag, x + w - 5, cy + 1); ctx.textAlign = 'left'; }

    if (st.debug && task.isAttack) {
      ctx.fillStyle = '#f0f';
      ctx.font = '10px monospace';
      ctx.textAlign = 'right';
      ctx.fillText('☠ ' + task.attackType, x - 6, cy);
      ctx.textAlign = 'left';
    }
  }

  // ---------- mount ----------
  function drawSlot(st, lane, i, ui, now, pal) {
    const L = V.lanes[lane], slot = st.lanes[lane].slots[i];
    const y = slotPx(st, lane, i), h = V.barH, x = L.x, w = L.w;
    const hovered = ui.hover && ui.hover.lane === lane && ui.hover.slot === i;

    if (!slot.layer) {
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = ui.selected ? `rgba(255,255,255,${0.35 + 0.3 * Math.sin(now * 6)})` : pal.dim;
      if (hovered) ctx.strokeStyle = pal.fg;
      ctx.strokeRect(x, y - h / 2, w, h);
      ctx.setLineDash([]);
      ctx.fillStyle = pal.dim;
      ctx.font = '10px monospace';
      ctx.textBaseline = 'middle';
      ctx.fillText(ui.selected && hovered ? `+ ${LAYERS[ui.selected].name}` : `mount ${i + 1} · empty`, x + 8, y);
      return;
    }
    const def = LAYERS[slot.layer];
    const active = slotActive(st, slot);
    const forced = slot.on && st.t < slot.forcedOffUntil;
    ctx.fillStyle = active ? pal.glow : 'rgba(255,255,255,0.04)';
    ctx.globalAlpha = active ? 0.45 : 1;
    ctx.fillRect(x, y - h / 2, w, h);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = hovered ? '#fff' : active ? pal.fg : pal.dim;
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y - h / 2, w, h);

    ctx.font = 'bold 11px monospace';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = active ? pal.fg : pal.dim;
    ctx.fillText(`${def.tag}`, x - 34, y);
    ctx.font = '10px monospace';
    ctx.fillStyle = active ? '#fff' : pal.dim;
    ctx.textAlign = 'right';
    ctx.fillText(forced ? 'SHIP IT: OFF' : active ? def.name : `${def.name} · OFF`, x + w - 6, y);
    ctx.textAlign = 'left';
    if (forced) { ctx.fillStyle = `rgba(255,60,60,${0.2 + 0.2 * Math.sin(now * 10)})`; ctx.fillRect(x, y - h / 2, w, h); }

    // human auditor desk: a little figure behind a desk
    if (slot.layer === 'auditor') {
      const busy = st.lanes[lane].bay.some(t => t.act === 'auditor' && t.actSlot === i);
      const dx = x + w + 18, dy = y + 2;
      ctx.fillStyle = active ? pal.fg : pal.dim;
      ctx.fillRect(dx - 10, dy + 2, 22, 3);                                  // desk
      ctx.beginPath(); ctx.arc(dx, dy - 9 + (busy ? Math.sin(now * 8) : 0), 3.5, 0, 7); ctx.fill();  // head
      ctx.fillRect(dx - 2, dy - 5, 4, 7);                                    // body
      if (busy) { ctx.fillStyle = '#fff'; ctx.fillRect(dx + 4, dy - 2, 6, 4); } // paper
    }
  }

  // ---------- main draw ----------
  function draw(st, ui) {
    const now = performance.now() / 1000;
    const pal = PALETTES[genDef(st).palette];
    ctx.clearRect(0, 0, V.W, V.H);
    ctx.save();
    if (fxr.shakeAmt > 0) ctx.translate((Math.random() - 0.5) * fxr.shakeAmt, (Math.random() - 0.5) * fxr.shakeAmt);

    if (skylineGen !== st.gen) { skyline = buildSkyline(st); skylineGen = st.gen; }
    ctx.drawImage(skyline, 0, V.H - 220);

    for (const lane of LANE_IDS) {
      const L = V.lanes[lane];
      // lane body + flashes
      ctx.fillStyle = 'rgba(255,255,255,0.025)';
      ctx.fillRect(L.x, V.top, L.w, V.bottom - V.top);
      const fl = fxr.flashOf(lane, now);
      if (fl) { ctx.fillStyle = fl; ctx.fillRect(L.x, V.top, L.w, V.bottom - V.top); }
      ctx.strokeStyle = pal.dim;
      ctx.strokeRect(L.x, V.top, L.w, V.bottom - V.top);
      const paused = st.t < st.lanes[lane].pausedUntil;

      // labels
      ctx.fillStyle = pal.fg;
      ctx.font = 'bold 13px monospace';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(LANES[lane].label, L.x, V.top - 18);
      ctx.font = '10px monospace';
      ctx.fillStyle = pal.dim;
      ctx.fillText(LANES[lane].sub + (paused ? '   ⏸ TRIPWIRE' : ''), L.x, V.top - 6);

      // completion line
      ctx.strokeStyle = pal.fg;
      ctx.setLineDash([8, 4]);
      ctx.beginPath(); ctx.moveTo(L.x - 10, V.bottom); ctx.lineTo(L.x + L.w + 10, V.bottom); ctx.stroke();
      ctx.setLineDash([]);

      for (let i = 0; i < st.lanes[lane].slots.length; i++) drawSlot(st, lane, i, ui, now, pal);
    }

    fxr.drawUnder(ctx, now);
    for (const lane of LANE_IDS) for (const t of st.lanes[lane].tasks) drawChip(st, t, now, pal);
    fxr.drawOver(ctx, now);

    // training interstitial banner
    if (st.phase === 'training') {
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(0, V.H / 2 - 30, V.W, 60);
      ctx.fillStyle = pal.fg;
      ctx.font = 'bold 18px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`TRAINING ${GENERATIONS[st.gen]?.name.toUpperCase() ?? ''} …  ${Math.ceil(st.trainT)}s`, V.W / 2, V.H / 2 - 2);
      ctx.font = '11px monospace';
      ctx.fillText('the shop is open: place layers, research, get ready', V.W / 2, V.H / 2 + 18);
      ctx.textAlign = 'left';
    }
    ctx.restore();
  }

  return { resize, draw, hit, onFx, effects: fxr };
}
