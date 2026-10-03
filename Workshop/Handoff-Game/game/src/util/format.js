// ===== Big-number formatting (shared by sim text and UI) =====

const SUFFIX = ['', 'k', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];

export function big(x, digits = 1) {
  if (!isFinite(x)) return '∞';
  const sign = x < 0 ? '−' : '';
  x = Math.abs(x);
  if (x < 1000) return sign + (x < 10 && x % 1 ? x.toFixed(digits) : Math.round(x).toString());
  const tier = Math.min(SUFFIX.length - 1, Math.floor(Math.log10(x) / 3));
  const v = x / Math.pow(1000, tier);
  return sign + v.toFixed(v < 10 ? digits : v < 100 ? 1 : 0) + SUFFIX[tier];
}

export const money = x => (x < 0 ? '−$' : '$') + big(Math.abs(x));
export const pct = (x, d = 0) => (100 * x).toFixed(d) + '%';
export const bundleTag = b => '×' + big(b, 0);
