// Κείμενο: κανονικοποίηση για αναζήτηση με/χωρίς τόνους και σύγκριση περιγραφών.

export function normalize(s) {
  if (s == null) return '';
  return String(s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/ς/g, 'σ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Κανονικοποίηση για ταύτιση γραμμών τιμολογίου (αφαιρεί σημεία στίξης, ενοποιεί δεκαδικά).
export function normalizeDescription(s) {
  return normalize(s)
    .replace(/(\d),(\d)/g, '$1.$2')
    .replace(/[^\p{L}\p{N}.% ]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokens(s) {
  return normalizeDescription(s)
    .split(' ')
    .filter((t) => t.length > 1 || /\d/.test(t));
}

// Ταίριασμα αναζήτησης: όλοι οι όροι του query πρέπει να υπάρχουν στο κείμενο (με ή χωρίς τόνους).
export function matchesSearch(text, query) {
  const q = normalize(query);
  if (!q) return true;
  const t = normalize(text);
  return q.split(' ').every((part) => t.includes(part));
}

// Ποσοστά που εμφανίζονται στο κείμενο, π.χ. "Κρέμα 35%" → ["35"]
export function percentages(s) {
  const out = new Set();
  const re = /(\d+(?:[.,]\d+)?)\s*%/g;
  let m;
  const str = String(s || '');
  while ((m = re.exec(str))) out.add(String(Number(m[1].replace(',', '.'))));
  return [...out];
}

// Σύγκρουση χαρακτηριστικών: αν και τα δύο κείμενα αναφέρουν ποσοστά (π.χ. λιπαρά, κακάο) και δεν
// έχουν κανένα κοινό, θεωρούνται διαφορετικά προϊόντα (π.χ. κρέμα 35% ≠ κρέμα 48%).
export function percentConflict(a, b) {
  const pa = percentages(a);
  const pb = percentages(b);
  if (!pa.length || !pb.length) return false;
  return !pa.some((x) => pb.includes(x));
}

// Ομοιότητα περιγραφών (0..1) με βάση κοινά tokens και προθέματα.
export function similarity(a, b) {
  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.length || !tb.length) return 0;
  let score = 0;
  const used = new Set();
  for (const x of ta) {
    let best = 0;
    let bestIdx = -1;
    tb.forEach((y, i) => {
      if (used.has(i)) return;
      let s = 0;
      if (x === y) s = 1;
      else if (x.length >= 4 && y.length >= 4 && (x.startsWith(y.slice(0, 4)) || y.startsWith(x.slice(0, 4)))) s = 0.6;
      if (s > best) {
        best = s;
        bestIdx = i;
      }
    });
    if (bestIdx >= 0) used.add(bestIdx);
    score += best;
  }
  return (2 * score) / (ta.length + tb.length);
}
