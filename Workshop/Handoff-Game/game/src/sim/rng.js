// ===== Seeded RNG (mulberry32). Its state lives in st.rng so the sim stays pure. =====

export function rand(st) {
  let t = (st.rng = (st.rng + 0x6D2B79F5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export const chance  = (st, p) => rand(st) < p;
export const uniform = (st, a, b) => a + (b - a) * rand(st);
export const pick    = (st, arr) => arr[Math.floor(rand(st) * arr.length)];

export function randn(st) {
  const u = Math.max(1e-12, rand(st)), v = rand(st);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function weighted(st, items, weightOf) {
  const total = items.reduce((s, it) => s + weightOf(it), 0);
  let r = rand(st) * total;
  for (const it of items) { r -= weightOf(it); if (r <= 0) return it; }
  return items[items.length - 1];
}
