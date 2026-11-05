// Ανάγνωση τιμολογίων με τη συνδρομή του χρήστη στο Claude (claude.ai), χωρίς κλειδί API:
// η εφαρμογή δίνει έτοιμες οδηγίες, ο χρήστης τις στέλνει στο Claude μαζί με τη φωτογραφία/PDF,
// και επικολλά πίσω την απάντηση (JSON). Εδώ γίνεται ο ανεκτικός έλεγχος και η κανονικοποίηση της απάντησης.

import { parseDecimal } from '../../shared/numbers.js';
import { LINE_FIELDS, HEADER_FIELDS } from './ai.js';

const MAX_MATERIALS_IN_PROMPT = 400;

export function buildClaudePrompt(materials = []) {
  const list = materials
    .filter((m) => !m.archived)
    .slice(0, MAX_MATERIALS_IN_PROMPT)
    .map((m) => `${m.id}: ${[m.name, m.brand, m.attributes].filter(Boolean).join(' · ')} [${{ kg: 'kg', l: 'lt', pc: 'τεμ.' }[m.cost_unit]}]`)
    .join('\n');
  return `Διάβασε το συνημμένο παραστατικό αγοράς (τιμολόγιο / δελτίο αποστολής / απόδειξη) ζαχαροπλαστείου και απάντησε ΜΟΝΟ με ένα μπλοκ JSON, χωρίς άλλο κείμενο.

Κανόνες:
- Μετάγραψε μόνο ό,τι αναγράφεται. ΜΗΝ επινοείς και ΜΗΝ υπολογίζεις τιμές που δεν αναγράφονται· βάλε null.
- Αν μια τιμή διαβάζεται δύσκολα, γράψε την καλύτερη ανάγνωση και πρόσθεσε το όνομα του πεδίου στο "uncertain_fields" της γραμμής (ή στο "header_uncertain_fields").
- Αριθμοί ως αριθμοί JSON με τελεία για δεκαδικά (το "1.234,50" του τιμολογίου γράφεται 1234.5).
- Μία γραμμή για κάθε γραμμή προϊόντος, από όλες τις σελίδες, με τη σειρά. Μεταφορικά, εγγυοδοσίες κ.λπ. με "is_material": false.
- Περιεχόμενο συσκευασίας (π.χ. "ΒΟΥΤΥΡΟ 2,5KG" ή "ΚΙΒ 4Χ2,5ΚΓ"): pack_count / pack_size / pack_unit. Αν η ποσότητα είναι ήδη σε κιλά/λίτρα, qty_unit "kg"/"l" και pack_* null.
- Κράτα ακριβώς την περιγραφή (ποσοστά λιπαρών/κακάο, μάρκες).
- Ημερομηνία ως YYYY-MM-DD. ΑΦΜ του εκδότη (προμηθευτή), όχι του πελάτη.
- "material_id": αν η γραμμή είναι ΣΙΓΟΥΡΑ ένα από τα υλικά της λίστας παρακάτω, γράψε τον αριθμό του· αλλιώς null. Διαφορετικό ποσοστό λιπαρών/κακάο ή διαφορετικό είδος = διαφορετικό υλικό.

Μορφή απάντησης:
\`\`\`json
{
  "readable": true,
  "document_type": "Τιμολόγιο",
  "supplier_name": "…", "supplier_vat": "123456789", "number": "Α-1021", "date": "2026-10-01",
  "net_total": 0, "vat_total": 0, "gross_total": 0, "invoice_discount": null,
  "header_uncertain_fields": [],
  "lines": [
    {
      "supplier_code": "BT250", "description": "ΒΟΥΤΥΡΟ ΑΓΕΛΑΔΟΣ 82% 2,5KG",
      "qty": 4, "unit_text": "ΤΕΜ", "qty_unit": "unit",
      "pack_count": 1, "pack_size": 2.5, "pack_unit": "kg", "pack_from_description": true,
      "unit_price": 22.5, "discount_pct": null, "discount_amount": null,
      "net_amount": 90, "vat_rate": 13, "vat_amount": 11.7,
      "is_material": true, "material_id": null, "uncertain_fields": [], "note": null
    }
  ],
  "warnings": []
}
\`\`\`
qty_unit: "unit" (τεμάχια/συσκευασίες/κιβώτια) ή "kg", "g", "l", "ml". pack_unit: "kg", "g", "l", "ml" ή "pc" (τεμάχια).
Ονόματα πεδίων για uncertain_fields: ${LINE_FIELDS.join(', ')}. Για header_uncertain_fields: ${HEADER_FIELDS.join(', ')}.
Οι παρατηρήσεις (warnings, note) στα ελληνικά.

Υλικά της επιχείρησης (αριθμός: όνομα [μονάδα]):
${list || '(δεν υπάρχουν ακόμη υλικά)'}
`;
}

/** Εντοπίζει το JSON μέσα στην απάντηση (μπλοκ ```json``` ή το πρώτο ισορροπημένο {...}). */
export function extractJson(text) {
  const s = String(text || '');
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(s);
  const candidates = [];
  if (fence) candidates.push(fence[1]);
  const start = s.indexOf('{');
  if (start >= 0) {
    let depth = 0;
    let inStr = false;
    let esc = false;
    for (let i = start; i < s.length; i++) {
      const ch = s[i];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === '\\') esc = true;
        else if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') inStr = true;
      else if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) {
          candidates.push(s.slice(start, i + 1));
          break;
        }
      }
    }
  }
  for (const c of candidates) {
    try {
      const v = JSON.parse(c.trim());
      if (v && typeof v === 'object') return v;
    } catch {
      /* επόμενη υποψήφια */
    }
  }
  throw new Error('Δεν βρέθηκαν δεδομένα στην απάντηση. Αντιγράψτε ολόκληρη την απάντηση του Claude (το μπλοκ που ξεκινά με «{»).');
}

const num = (v) => {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const n = parseDecimal(String(v).replace(/%/g, ''));
  return Number.isFinite(n) ? n : null;
};
const str = (v) => (v == null ? null : String(v).trim() || null);
const arr = (v) => (Array.isArray(v) ? v.map(String) : []);
const bool = (v, d) => (typeof v === 'boolean' ? v : v == null ? d : !['false', '0', 'no', 'όχι'].includes(String(v).toLowerCase()));

/** Μετατρέπει ελεύθερη απάντηση στη μορφή της αυτόματης ανάγνωσης (ίδια επεξεργασία με το API). */
export function coerceExtraction(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const lines = Array.isArray(r.lines) ? r.lines : Array.isArray(r.items) ? r.items : [];
  return {
    readable: bool(r.readable, true),
    document_type: str(r.document_type),
    supplier_name: str(r.supplier_name ?? r.supplier),
    supplier_vat: str(r.supplier_vat ?? r.vat_number ?? r.afm),
    number: str(r.number ?? r.invoice_number),
    date: str(r.date ?? r.doc_date),
    net_total: num(r.net_total),
    vat_total: num(r.vat_total),
    gross_total: num(r.gross_total ?? r.total),
    invoice_discount: num(r.invoice_discount),
    header_uncertain_fields: arr(r.header_uncertain_fields),
    lines: lines.map((l) => ({
      supplier_code: str(l.supplier_code ?? l.code),
      description: str(l.description) || '',
      qty: num(l.qty ?? l.quantity),
      unit_text: str(l.unit_text ?? l.unit),
      qty_unit: str(l.qty_unit),
      pack_count: num(l.pack_count),
      pack_size: num(l.pack_size),
      pack_unit: str(l.pack_unit),
      pack_from_description: bool(l.pack_from_description, false),
      unit_price: num(l.unit_price),
      discount_pct: num(l.discount_pct),
      discount_amount: num(l.discount_amount),
      net_amount: num(l.net_amount),
      vat_rate: num(l.vat_rate),
      vat_amount: num(l.vat_amount),
      is_material: bool(l.is_material, true),
      uncertain_fields: arr(l.uncertain_fields),
      note: str(l.note),
      material_id: Number.isInteger(Number(l.material_id)) && l.material_id !== null && l.material_id !== '' ? Number(l.material_id) : null,
    })),
    warnings: arr(r.warnings),
  };
}

export function parseClaudeResponse(text) {
  const out = coerceExtraction(extractJson(text));
  if (!out.lines.length && !out.supplier_name && !out.number) {
    throw new Error('Η απάντηση δεν περιέχει στοιχεία τιμολογίου. Βεβαιωθείτε ότι στείλατε στο Claude τη φωτογραφία/PDF μαζί με τις οδηγίες.');
  }
  return out;
}
