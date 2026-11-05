import { HttpError } from '../services/invoices.js';

export { HttpError };

export const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
export const posNum = (v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);
export const str = (v) => (v == null ? null : String(v).trim() || null);
export const int = (v) => {
  const n = Number(v);
  return Number.isInteger(n) ? n : null;
};

export function idParam(req) {
  const id = int(req.params.id);
  if (id == null) throw new HttpError(400, 'Μη έγκυρο αναγνωριστικό.');
  return id;
}

export function required(v, msg) {
  if (v == null || v === '') throw new HttpError(400, msg);
  return v;
}

export function oneOf(v, list, dflt) {
  return list.includes(v) ? v : dflt;
}
