// Χρωματιστό εικονίδιο/αρχικό γράμμα για λίστες (υλικά, προμηθευτές).
import { Icon } from '../icons.jsx';

const TONES = ['tone-caramel', 'tone-rose', 'tone-mint', 'tone-sky', 'tone-choc'];

export function toneFor(text = '') {
  let h = 0;
  for (const ch of String(text)) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return TONES[h % TONES.length];
}

export function Avatar({ text, icon, tone }) {
  const letter = String(text || '?')
    .replace(/^ΠΑΡΑΔΕΙΓΜΑ\s+/, '')
    .trim()
    .charAt(0)
    .toUpperCase();
  return <span className={`avatar-sm ${tone || toneFor(text)}`}>{icon ? <Icon name={icon} /> : letter}</span>;
}
