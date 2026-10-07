// ===== Derived words a player may see: the model's card and chat, lane names and tips =====
// Seeded picks (st.seed, g) so a run always shows the same name and chat. The readouts themselves (precision, desks,
// yields, debt) come from the sim's §7.3 readers (sim/rules.js), never from here: the UI never re-derives sim physics.

import { MODEL_NAMES, ALT_NAMES, ROUND_CHATS, ALT_ROUND_CHATS, TELL_BAND, TRAIT_TELLS, ALT_TRAIT_TELLS } from '../config/content/models.js';
import { LANE_TEXT } from '../config/content/v3-text.js';
import { LANE_DEFS } from '../config/tasks.js';
import { hash } from './theme.js';
import { tpl } from '../util/format.js';

// a 0..1 draw from (seed, g, salt): the same every time for a run
const pick01 = (st, g, salt) => hash(((st.seed >>> 0) % 1000003) * 31 + g * 977 + salt * 7919);
const pickOf = (list, u) => list[Math.min(list.length - 1, Math.floor(u * list.length))];

// =================== the model card: name, tier, tagline, two blurbs ===================

export function modelCard(st, g = st.gen) {
  const base = MODEL_NAMES[g - 1] || MODEL_NAMES[0];
  const alts = ALT_NAMES[g] || [];
  const u = pick01(st, g, 1);
  const alt = u < 0.5 || !alts.length ? null : pickOf(alts, (u - 0.5) * 2);   // half the runs keep the launch name
  return { gen: g, tier: base.tier, name: alt?.name ?? base.name, tagline: alt?.tagline ?? base.tagline, cardBlurb: alt?.cardBlurb ?? base.cardBlurb };
}

// =================== the card scene's chat: ROUND_CHATS[g] (or its alternative) plus one trait tell ===================
// → [[speaker, text]] with speaker 'model' or 'safety' (the Head of Safety: you)

export function cardChat(st, g = st.gen) {
  const alt = ALT_ROUND_CHATS[g];
  const base = alt && pick01(st, g, 2) < 0.5 ? alt : ROUND_CHATS[g] || [];
  const lines = base.map(l => [l.who === 'you' ? 'safety' : 'model', l.text]);
  const tell = traitTell(st, g);
  if (tell) lines.push(['model', tell]);
  return lines;
}

// one line that hints at one of the model's hidden traits (it also reads as some other trait: content's job)
function traitTell(st, g) {
  const traits = st.traits.filter(id => TRAIT_TELLS[id]);
  if (!traits.length) return null;
  const id = pickOf(traits, pick01(st, g, 3)), band = TELL_BAND[g] || 'mid';
  const altLine = ALT_TRAIT_TELLS[id]?.[band];
  let s = altLine && pick01(st, g, 4) < 0.5 ? altLine : TRAIT_TELLS[id][band];
  if (!s) return null;
  if (g === 1) s = s.toLowerCase();
  return s;
}

// =================== lanes: tab label and hover tip ===================

export const laneTab = id => LANE_TEXT[id]?.tab ?? LANE_DEFS[id]?.label ?? id.toUpperCase();

export function laneTip(id) {
  const D = LANE_DEFS[id] || {};
  return tpl(LANE_TEXT[id]?.tip ?? '', { harm: D.harm ?? 1, quota: `${Math.round(100 * (D.quota || 0))}%`, exfil: D.exfilMult ?? 1 });
}

// a short code for the ops log's lane column: CON, R&D, ENT, GOV, CYB
export const laneCode = id => ({ ext: 'CON', int: 'R&D', ext2: 'ENT', ext3: 'GOV', int2: 'CYB' })[id] ?? laneTab(id).slice(0, 3);
