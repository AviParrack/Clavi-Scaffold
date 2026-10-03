// ===== Changes to the mounts themselves: one more mount, one more level =====
// Used by the player's actions (sim.js) and by events and research that hand out the same thing for free.

import { BALANCE as B } from '../config/balance.js';
import { LAYERS } from '../config/layers.js';
import { fx, say } from './log.js';
import { cpCount, nextCheckpoint, slotAt, capstone } from './rules.js';
import { newSlot } from './state.js';

const LANE_NAME = { ext: 'EXTERNAL', int: 'INTERNAL', global: 'the global site' };

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

// One level up (L5 = the capstone), paid or free. The codec names the capstone either way.
// The Red Team's tally of this mount starts over: a new level is a new thing to measure.
export function levelUp(st, lane, slotIdx, { free = false } = {}) {
  const slot = slotAt(st, lane, slotIdx);
  slot.level++;
  slot.rt = null;
  fx(st, 'upgrade', { lane, slot: slotIdx, layer: slot.layer, level: slot.level, free });
  const name = LAYERS[slot.layer].name;
  if (free) say(st, 'research', `${name} on ${LANE_NAME[lane]} is now L${slot.level}, on the house.`);
  const cap = capstone(slot.layer, slot.level);
  if (cap.name) say(st, 'research', `${name} capstone: ${cap.name}. ${cap.text}`);
}
