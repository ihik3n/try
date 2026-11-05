// Προτάσεις αντιστοίχισης γραμμών τιμολογίου με υλικά:
// 1) επιβεβαιωμένες αντιστοιχίσεις (ίδιος προμηθευτής + κωδικός / περιγραφή),
// 2) ίδια περιγραφή από άλλον προμηθευτή, 3) ομοιότητα κειμένου, 4) πρόταση AI.
// Δεν προτείνεται ποτέ υλικό με αντικρουόμενα ποσοστά (π.χ. 35% vs 48%).

import { normalizeDescription, similarity, percentConflict } from '../../shared/text.js';

function materialText(m) {
  return [m.name, m.brand, m.attributes].filter(Boolean).join(' ');
}

export function findAlias(db, supplierId, line) {
  const code = line.supplier_code ? String(line.supplier_code).trim() : '';
  const desc = normalizeDescription(line.description);
  if (supplierId && code) {
    const a = db
      .prepare('SELECT * FROM material_aliases WHERE supplier_id = ? AND supplier_code = ? ORDER BY last_used_at DESC LIMIT 1')
      .get(supplierId, code);
    if (a && (!desc || !a.description_norm || !percentConflict(desc, a.description_norm))) return { alias: a, source: 'alias', confidence: 1 };
  }
  if (desc) {
    if (supplierId) {
      const a = db.prepare('SELECT * FROM material_aliases WHERE supplier_id = ? AND description_norm = ? ORDER BY last_used_at DESC LIMIT 1').get(supplierId, desc);
      if (a) return { alias: a, source: 'alias', confidence: 1 };
    }
    const a = db.prepare('SELECT * FROM material_aliases WHERE description_norm = ? ORDER BY times_used DESC, last_used_at DESC LIMIT 1').get(desc);
    if (a) return { alias: a, source: 'alias_other', confidence: 0.9 };
  }
  return null;
}

export function fuzzyCandidates(line, materials, limit = 3) {
  const out = [];
  for (const m of materials) {
    if (m.archived) continue;
    const text = materialText(m);
    if (percentConflict(line.description, text)) continue;
    const s = similarity(line.description, text);
    if (s > 0) out.push({ material: m, score: s });
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, limit);
}

/**
 * Συμπληρώνει προτάσεις σε γραμμές χωρίς υλικό. Επιστρέφει τις γραμμές (νέα αντικείμενα)
 * και τη λίστα δεικτών που χρειάζονται ακόμη πρόταση (για AI).
 */
export function applyLocalMatches(db, supplierId, lines, materials) {
  const byId = new Map(materials.map((m) => [m.id, m]));
  const pending = [];
  const out = lines.map((l, index) => {
    if (l.material_id != null || l.excluded) return l;
    const found = findAlias(db, supplierId, l);
    if (found && byId.has(found.alias.material_id)) {
      const a = found.alias;
      const next = {
        ...l,
        material_id: a.material_id,
        match_source: found.source === 'alias' ? 'alias' : 'fuzzy',
        match_confidence: found.confidence,
        match_note: found.source === 'alias' ? 'Αποθηκευμένη αντιστοίχιση' : 'Ίδια περιγραφή από άλλον προμηθευτή — ελέγξτε',
      };
      // Συμπλήρωση περιεχομένου συσκευασίας από την αποθηκευμένη αντιστοίχιση μόνο αν λείπει από το παραστατικό.
      if (next.qty_unit == null && a.qty_unit) next.qty_unit = a.qty_unit;
      if (next.qty_unit === 'unit' && next.pack_size == null && a.pack_size != null) {
        next.pack_count = a.pack_count;
        next.pack_size = a.pack_size;
        next.pack_unit = a.pack_unit;
        next.match_note += ' · περιεχόμενο συσκευασίας από προηγούμενη αγορά';
      }
      return next;
    }
    const cands = fuzzyCandidates(l, materials, 1);
    if (cands.length && cands[0].score >= 0.5) {
      pending.push(index);
      return { ...l, material_id: cands[0].material.id, match_source: 'fuzzy', match_confidence: cands[0].score, match_note: 'Πρόταση βάσει ομοιότητας — ελέγξτε' };
    }
    pending.push(index);
    return l;
  });
  return { lines: out, pending };
}

/** Εφαρμόζει τις προτάσεις AI με έλεγχο εγκυρότητας και σύγκρουσης ποσοστών. */
export function applyAiMatches(lines, matches, materials) {
  const byId = new Map(materials.map((m) => [m.id, m]));
  const out = [...lines];
  for (const mt of matches || []) {
    const i = mt.line_index;
    const l = out[i];
    if (!l || l.excluded || l.match_source === 'alias' || l.match_source === 'manual') continue;
    if (mt.material_id == null) continue;
    const m = byId.get(mt.material_id);
    if (!m || m.archived) continue;
    if (percentConflict(l.description, materialText(m))) continue;
    const conf = Math.max(0, Math.min(1, Number(mt.confidence) || 0));
    if (conf < 0.4) continue;
    if (l.material_id != null && l.material_id !== m.id && (l.match_confidence || 0) > conf) continue;
    out[i] = { ...l, material_id: m.id, match_source: 'ai', match_confidence: conf, match_note: `Πρόταση AI: ${mt.reason || ''}`.trim() };
  }
  return out;
}
