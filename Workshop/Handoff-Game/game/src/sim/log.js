// ===== Append-only logs the renderer reads: visual fx and codec messages =====
// Renderer tracks the last id it has seen; the sim never waits on it.

const FX_KEEP = 400, CODEC_KEEP = 60;

export function fx(st, type, data = {}) {
  st.fx.push({ id: ++st.fxId, t: st.t, type, ...data });
  if (st.fx.length > FX_KEEP) st.fx.splice(0, st.fx.length - FX_KEEP);
}

export function say(st, speaker, text, choices = null) {
  const msg = { id: ++st.codecId, t: st.t, speaker, text, choices };
  st.codec.push(msg);
  if (st.codec.length > CODEC_KEEP) st.codec.splice(0, st.codec.length - CODEC_KEEP);
  return msg;
}

// --- per-lane counters, mirrored into the current generation's stats ---
export function count(st, lane, key, n = 1) {
  st.stats.lanes[lane][key] = (st.stats.lanes[lane][key] || 0) + n;
  st.genStats.lanes[lane][key] = (st.genStats.lanes[lane][key] || 0) + n;
}

// --- per-layer confusion matrix (for tests and debug overlay) ---
export function countLayer(st, id, isAttack, flagged, expectedP) {
  const c = st.stats.layers[id] || (st.stats.layers[id] = { attackSeen: 0, attackFlagged: 0, benignSeen: 0, benignFlagged: 0, expTPRsum: 0 });
  if (isAttack) { c.attackSeen++; c.attackFlagged += flagged ? 1 : 0; c.expTPRsum += expectedP; }
  else          { c.benignSeen++; c.benignFlagged += flagged ? 1 : 0; }
}

// --- money ledger: every change to st.money goes through these two ---
export function earn(st, amount, cat = 'tasks') {
  st.money += amount;
  st.ledger.income += amount;
  st.ledger.byCat[cat] = (st.ledger.byCat[cat] || 0) + amount;
  st.genStats.income += amount;
}

export function spend(st, amount, cat = 'safety') {
  st.money -= amount;
  st.ledger.spend += amount;
  st.ledger.byCat[cat] = (st.ledger.byCat[cat] || 0) - amount;
  st.genStats.spend += amount;
}
