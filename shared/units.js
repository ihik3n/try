// Μονάδες μέτρησης και μετατροπές.
// Όλες οι μετατροπές γίνονται μέσω βασικών μονάδων: γραμμάρια (μάζα), ml (όγκος), τεμάχια (πλήθος).
// Μετατροπή μάζας ↔ όγκου γίνεται ΜΟΝΟ με καταχωρισμένη πυκνότητα (g/ml) του συγκεκριμένου υλικού.
// Μετατροπή τεμαχίων ↔ μάζας γίνεται ΜΟΝΟ με καταχωρισμένο βάρος τεμαχίου (g).

export const UNITS = {
  g: { dim: 'mass', factor: 1, label: 'g' },
  kg: { dim: 'mass', factor: 1000, label: 'kg' },
  ml: { dim: 'volume', factor: 1, label: 'ml' },
  l: { dim: 'volume', factor: 1000, label: 'lt' },
  pc: { dim: 'count', factor: 1, label: 'τεμ.' },
};

export const UNIT_KEYS = Object.keys(UNITS);
export const COST_UNITS = ['kg', 'l', 'pc'];
export const DIM_BASE = { mass: 'g', volume: 'ml', count: 'pc' };
export const DIM_COST_UNIT = { mass: 'kg', volume: 'l', count: 'pc' };
export const DIM_LABEL = { mass: 'βάρος', volume: 'όγκος', count: 'τεμάχια' };

export function isUnit(u) {
  return Object.prototype.hasOwnProperty.call(UNITS, u);
}

export function unitDim(u) {
  return isUnit(u) ? UNITS[u].dim : null;
}

export function unitLabel(u) {
  return isUnit(u) ? UNITS[u].label : u || '';
}

export function isPositive(n) {
  return typeof n === 'number' && Number.isFinite(n) && n > 0;
}

export function isFiniteNumber(n) {
  return typeof n === 'number' && Number.isFinite(n);
}

/**
 * Μετατρέπει ποσότητα από μία μονάδα σε άλλη.
 * profile: { density: g/ml | null, pieceWeight: g | null } του συγκεκριμένου υλικού/συνταγής.
 * Επιστρέφει { ok: true, value } ή { ok: false, reason } με reason:
 *  'invalid_qty' | 'unknown_unit' | 'needs_density' | 'needs_piece_weight'
 */
export function convert(qty, from, to, profile = {}) {
  if (!isFiniteNumber(qty) || qty < 0) return { ok: false, reason: 'invalid_qty' };
  if (!isUnit(from) || !isUnit(to)) return { ok: false, reason: 'unknown_unit' };
  const a = UNITS[from];
  const b = UNITS[to];
  const base = qty * a.factor; // σε βασική μονάδα της διάστασης "from"
  if (a.dim === b.dim) return { ok: true, value: base / b.factor };

  const density = isPositive(profile.density) ? profile.density : null; // g/ml
  const pw = isPositive(profile.pieceWeight) ? profile.pieceWeight : null; // g/τεμ.

  // Πρώτα σε γραμμάρια
  let grams;
  if (a.dim === 'mass') grams = base;
  else if (a.dim === 'volume') {
    if (!density) return { ok: false, reason: 'needs_density' };
    grams = base * density;
  } else {
    if (!pw) return { ok: false, reason: 'needs_piece_weight' };
    grams = base * pw;
  }
  // Μετά στη διάσταση προορισμού
  let target;
  if (b.dim === 'mass') target = grams;
  else if (b.dim === 'volume') {
    if (!density) return { ok: false, reason: 'needs_density' };
    target = grams / density;
  } else {
    if (!pw) return { ok: false, reason: 'needs_piece_weight' };
    target = grams / pw;
  }
  return { ok: true, value: target / b.factor };
}

export const CONVERSION_REASON_TEXT = {
  invalid_qty: 'μη έγκυρη ποσότητα',
  unknown_unit: 'άγνωστη μονάδα',
  needs_density: 'χρειάζεται πυκνότητα (g/ml) για μετατροπή βάρους ↔ όγκου',
  needs_piece_weight: 'χρειάζεται βάρος τεμαχίου για μετατροπή τεμαχίων ↔ βάρους',
};
