import { formatQty } from '@shared/numbers.js';

export { formatMoney, formatNumber, formatPercent, formatUnitPrice, formatQty, parseDecimal } from '@shared/numbers.js';

export const UNIT_LABEL = { g: 'g', kg: 'kg', ml: 'ml', l: 'lt', pc: 'τεμ.' };
export const COST_UNIT_LABEL = { kg: 'κιλό (kg)', l: 'λίτρο (lt)', pc: 'τεμάχιο' };
export const COST_UNIT_SHORT = { kg: 'kg', l: 'lt', pc: 'τεμ.' };
export const BASIS_LABEL = { net: 'χωρίς ΦΠΑ', gross: 'με ΦΠΑ' };

export function formatDate(iso) {
  if (!iso) return '—';
  const d = iso.length === 10 ? new Date(`${iso}T12:00:00`) : new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function formatDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function todayIso() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function formatBytes(n) {
  if (n == null) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** Ποσότητα σε βασική μονάδα (g/ml/pc) σε φιλική μορφή. */
export function baseQtyLabel(base, baseUnit) {
  if (base == null) return '—';
  return formatQty(base, baseUnit);
}

/** Μονάδες που επιτρέπονται σε γραμμή συνταγής, με βάση τη μονάδα κοστολόγησης του υλικού. */
export function unitsFor(costUnit, profile = {}) {
  const mass = ['g', 'kg'];
  const vol = ['ml', 'l'];
  const out = new Set();
  if (costUnit === 'kg') mass.forEach((u) => out.add(u));
  if (costUnit === 'l') vol.forEach((u) => out.add(u));
  if (costUnit === 'pc') out.add('pc');
  if (profile.density) {
    mass.forEach((u) => out.add(u));
    vol.forEach((u) => out.add(u));
  }
  if (profile.pieceWeight) {
    out.add('pc');
    mass.forEach((u) => out.add(u));
  }
  return ['g', 'kg', 'ml', 'l', 'pc'].filter((u) => out.has(u));
}

export function defaultUnitFor(costUnit) {
  return costUnit === 'kg' ? 'g' : costUnit === 'l' ? 'ml' : 'pc';
}
