// Ανάγνωση και μορφοποίηση αριθμών (ελληνική μορφή: κόμμα για δεκαδικά).
// Οι υπολογισμοί γίνονται σε πλήρη ακρίβεια· στρογγυλοποίηση ΜΟΝΟ κατά την εμφάνιση.

/**
 * Διαβάζει αριθμό από κείμενο χρήστη. Δέχεται "2,5", "2.5", "1.234,56", "1,234.56", "1 234,5".
 * Επιστρέφει null για κενό, NaN για μη έγκυρο.
 */
export function parseDecimal(input) {
  if (input == null) return null;
  if (typeof input === 'number') return Number.isFinite(input) ? input : NaN;
  let s = String(input).trim().replace(/\s| /g, '').replace(/€/g, '');
  if (s === '') return null;
  s = s.replace(/^\+/, '');
  const hasComma = s.includes(',');
  const hasDot = s.includes('.');
  if (hasComma && hasDot) {
    // Το τελευταίο διαχωριστικό είναι τα δεκαδικά
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (hasComma) {
    const parts = s.split(',');
    if (parts.length > 2) s = parts.join(''); // 1,234,567
    else s = s.replace(',', '.');
  } else if (hasDot) {
    const parts = s.split('.');
    if (parts.length > 2) s = parts.join(''); // 1.234.567 (χιλιάδες)
  }
  if (!/^-?\d*\.?\d+$|^-?\d+\.$/.test(s)) return NaN;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

const nfCache = new Map();
function nf(min, max) {
  const key = `${min}:${max}`;
  if (!nfCache.has(key)) {
    nfCache.set(key, new Intl.NumberFormat('el-GR', { minimumFractionDigits: min, maximumFractionDigits: max }));
  }
  return nfCache.get(key);
}

export function formatNumber(n, maxDecimals = 2, minDecimals = 0) {
  if (n == null || !Number.isFinite(n)) return '—';
  return nf(minDecimals, maxDecimals).format(n);
}

// Ποσό σε ευρώ. Για πολύ μικρά ποσά δείχνει περισσότερα δεκαδικά ώστε να μη φαίνονται ως 0,00.
export function formatMoney(n, opts = {}) {
  if (n == null || !Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  let max = opts.decimals ?? 2;
  let min = opts.decimals ?? 2;
  if (opts.decimals == null && abs > 0 && abs < 0.1) {
    max = 4;
    min = 2;
  }
  return `${nf(min, max).format(n)} €`;
}

export function formatPercent(n, decimals = 1) {
  if (n == null || !Number.isFinite(n)) return '—';
  const sign = n > 0 ? '+' : '';
  return `${sign}${nf(0, decimals).format(n)}%`;
}

// Τιμή μονάδας (€/kg, €/lt, €/τεμ.) με 2–4 δεκαδικά.
export function formatUnitPrice(n, unit) {
  if (n == null || !Number.isFinite(n)) return '—';
  const label = unit === 'kg' ? 'kg' : unit === 'l' ? 'lt' : unit === 'pc' ? 'τεμ.' : unit || '';
  const abs = Math.abs(n);
  const max = abs < 1 ? 4 : abs < 10 ? 3 : 2;
  return `${nf(2, max).format(n)} €/${label}`;
}

// Ποσότητα με μονάδα· g ≥ 1000 → kg, ml ≥ 1000 → lt.
export function formatQty(value, unit, opts = {}) {
  if (value == null || !Number.isFinite(value)) return '—';
  const v = value;
  if (!opts.keepUnit) {
    if (unit === 'g' && Math.abs(v) >= 1000) return `${nf(0, 3).format(v / 1000)} kg`;
    if (unit === 'ml' && Math.abs(v) >= 1000) return `${nf(0, 3).format(v / 1000)} lt`;
    if (unit === 'kg' && Math.abs(v) < 1 && v !== 0) return `${nf(0, 1).format(v * 1000)} g`;
    if (unit === 'l' && Math.abs(v) < 1 && v !== 0) return `${nf(0, 1).format(v * 1000)} ml`;
  }
  const label = { g: 'g', kg: 'kg', ml: 'ml', l: 'lt', pc: 'τεμ.' }[unit] ?? unit ?? '';
  let max = 3;
  if (unit === 'g' || unit === 'ml') max = Math.abs(v) < 10 ? 2 : 1;
  if (unit === 'pc') max = 2;
  return `${nf(0, max).format(v)} ${label}`.trim();
}

export function round(n, decimals = 2) {
  if (!Number.isFinite(n)) return n;
  const f = 10 ** decimals;
  return Math.round((n + Number.EPSILON) * f) / f;
}

export function almostEqual(a, b, eps = 0.011) {
  return Math.abs(a - b) <= eps;
}
