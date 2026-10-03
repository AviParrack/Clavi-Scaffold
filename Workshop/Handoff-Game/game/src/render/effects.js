// ===== Cosmetic particles, floats, beams, flashes. Render-side only (uses Math.random). =====

import { money } from '../util/format.js';

export class Effects {
  constructor() {
    this.parts = []; this.floats = []; this.beams = []; this.rings = [];
    this.flashes = {}; this.glitches = []; this.tints = new Map(); this.acc = {};
    this.shakeAmt = 0;
  }
  now() { return performance.now() / 1000; }

  // --- spawners ---
  text(x, y, text, color, life = 1.1) { this.floats.push({ x, y, text, color, t0: this.now(), life }); }
  beam(x, w, y, color) { this.beams.push({ x, w, y, color, t0: this.now() }); }
  ring(x, y, color) { this.rings.push({ x, y, color, t0: this.now() }); }
  flash(lane, color) { this.flashes[lane] = { color, t0: this.now() }; }
  tint(taskId, color, dur) { this.tints.set(taskId, { color, until: this.now() + dur }); }
  glitch(lane, y) { this.glitches.push({ lane, y, t0: this.now() }); this.shake(10); }
  shake(a) { this.shakeAmt = Math.max(this.shakeAmt, a); }
  shatter(x, y, w, color, n) {
    for (let i = 0; i < n; i++) this.parts.push({
      x: x + (Math.random() - 0.5) * w, y, vx: (Math.random() - 0.5) * 160, vy: -Math.random() * 140,
      t0: this.now(), life: 0.6 + Math.random() * 0.5, color, s: 2 + Math.random() * 3,
    });
  }

  // cost / payout floats: merge many small amounts into one float per spot every 0.4 s
  accumulate(key, x, y, amount, color) {
    const a = this.acc[key] || (this.acc[key] = { amt: 0, t0: this.now(), x, y, color });
    a.amt += amount; a.x = x; a.y = y;
  }
  flushAcc(now) {
    for (const [k, a] of Object.entries(this.acc)) {
      if (now - a.t0 < 0.4) continue;
      if (Math.abs(a.amt) > 0) this.text(a.x, a.y, (a.amt > 0 ? '+' : '') + money(a.amt), a.color, 0.9);
      delete this.acc[k];
    }
  }

  // --- queries for the playfield ---
  tintOf(id, now) { const t = this.tints.get(id); if (!t) return null; if (now > t.until) { this.tints.delete(id); return null; } return t.color; }
  flashOf(lane, now) {
    const f = this.flashes[lane]; if (!f) return null;
    const a = 1 - (now - f.t0) / 0.5; if (a <= 0) return null;
    return f.color + Math.round(a * 90).toString(16).padStart(2, '0');
  }

  // --- drawing ---
  drawUnder(ctx, now) {
    this.flushAcc(now);
    this.beams = this.beams.filter(b => now - b.t0 < 0.25);
    for (const b of this.beams) {
      const p = (now - b.t0) / 0.25;
      ctx.strokeStyle = b.color; ctx.globalAlpha = 1 - p; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x + b.w * Math.min(1, p * 2), b.y); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  drawOver(ctx, now) {
    this.shakeAmt *= 0.88; if (this.shakeAmt < 0.3) this.shakeAmt = 0;

    this.rings = this.rings.filter(r => now - r.t0 < 0.4);
    for (const r of this.rings) {
      const p = (now - r.t0) / 0.4;
      ctx.strokeStyle = r.color; ctx.globalAlpha = 1 - p; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(r.x, r.y, 6 + p * 40, 0, 7); ctx.stroke();
    }
    this.parts = this.parts.filter(q => now - q.t0 < q.life);
    for (const q of this.parts) {
      const dt = now - q.t0;
      ctx.globalAlpha = 1 - dt / q.life; ctx.fillStyle = q.color;
      ctx.fillRect(q.x + q.vx * dt, q.y + q.vy * dt + 220 * dt * dt, q.s, q.s);
    }
    this.glitches = this.glitches.filter(g => now - g.t0 < 0.8);
    for (const g of this.glitches) {
      ctx.globalAlpha = 1 - (now - g.t0) / 0.8;
      for (let i = 0; i < 6; i++) {
        ctx.fillStyle = Math.random() < 0.5 ? '#ff2020' : '#ff00aa';
        ctx.fillRect(Math.random() * ctx.canvas.width, g.y - 30 + Math.random() * 40, 30 + Math.random() * 120, 3 + Math.random() * 5);
      }
    }
    this.floats = this.floats.filter(f => now - f.t0 < f.life);
    ctx.font = 'bold 11px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const f of this.floats) {
      const p = (now - f.t0) / f.life;
      ctx.globalAlpha = 1 - p * p; ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y - p * 22);
    }
    ctx.textAlign = 'left'; ctx.globalAlpha = 1;
  }
}
