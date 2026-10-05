// ===== Changes to the mounts themselves: one more mount, one more level =====
// Used by the player's actions (sim.js) and by events and research that hand out the same thing for free.

import { BALANCE as B } from '../config/balance.js';
import { LAYERS } from '../config/layers.js';
import { fx, say } from './log.js';
import { cpCount, nextCheckpoint, slotAt, capstone, laneIds, labLevel } from './rules.js';
import { newSlot } from './state.js';

// The new mount goes at the bottom and every mount shifts up a little. A chip keeps its next checkpoint (same
// mount, same index), so on the next step it catches up on any checkpoint that moved up past it, in order: no mount
// is skipped and pending reads finish at their exit. Only chips already past the old last mount are re-indexed.
export function addSlot(st, lane) {
  const L = st.lanes[lane];
  if (L.slots.length >= B.maxSlots) return false;
  const oldEnd = cpCount(L.slots.length);
  L.slots.push(newSlot());
  for (const t of L.tasks) if (t.cp >= oldEnd) t.cp = nextCheckpoint(L.slots.length, t.y);
  return true;
}

// One lab level up (L5 = the capstone), paid or free: every copy of the element on every lane goes up with it.
// The codec names the capstone either way. The Red Team's tallies of those mounts start over: a new level is a new
// thing to measure.
export function levelUp(st, lane, slotIdx, { free = false } = {}) {
  const slot = slotAt(st, lane, slotIdx), id = slot.layer;
  const level = st.levels[id] = labLevel(st, id) + 1;
  for (const l of laneIds(st)) st.lanes[l].slots.forEach((s, i) => {
    if (s.layer !== id) return;
    s.level = level;
    s.rt = null;
    fx(st, 'upgrade', { lane: l, slot: i, layer: id, level, free });
  });
  for (const s of st.global.slots) if (s.layer === id) { s.level = level; fx(st, 'upgrade', { lane: 'global', slot: 0, layer: id, level, free }); }
  const name = LAYERS[id].name;
  if (free) say(st, 'research', `${name} is now L${level} across the lab, on the house.`);
  const cap = capstone(id, level);
  if (cap.name) say(st, 'research', `${name} capstone: ${cap.name}. ${cap.text}`);
}
