// Ανάγνωση παραστατικών και προτάσεις αντιστοίχισης μέσω Claude API.
// Η AI ΜΟΝΟ διαβάζει και προτείνει. Όλοι οι αριθμητικοί υπολογισμοί γίνονται στον κώδικα (shared/invoice.js).

import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import * as z from 'zod';

const N = z.number().nullable();
export const LINE_FIELDS = ['supplier_code', 'description', 'qty', 'qty_unit', 'pack_count', 'pack_size', 'pack_unit', 'unit_price', 'discount_pct', 'discount_amount', 'net_amount', 'vat_rate', 'vat_amount'];
export const HEADER_FIELDS = ['supplier_name', 'supplier_vat', 'number', 'doc_date', 'net_total', 'vat_total', 'gross_total'];
// Σημείωση: τα πεδία με περιορισμένες τιμές δηλώνονται ως string (με τις επιτρεπτές τιμές στην περιγραφή)
// και κανονικοποιούνται στον κώδικα. Έτσι μια απρόβλεπτη τιμή σημειώνεται για έλεγχο αντί να αποτύχει όλη η ανάγνωση.
const choice = (values, desc) => z.string().nullable().describe(`${desc} Επιτρεπτές τιμές: ${values.join(', ')} ή null.`);
const fieldList = (values) => z.array(z.string()).describe(`Ονόματα πεδίων με αβέβαιη ανάγνωση. Επιτρεπτά: ${values.join(', ')}.`);

export const InvoiceExtraction = z.object({
  readable: z.boolean().describe('false αν το έγγραφο δεν είναι παραστατικό αγοράς ή δεν διαβάζεται καθόλου'),
  document_type: z.string().nullable().describe('π.χ. Τιμολόγιο, Τιμολόγιο-Δελτίο Αποστολής, Απόδειξη, Πιστωτικό'),
  supplier_name: z.string().nullable(),
  supplier_vat: z.string().nullable().describe('ΑΦΜ προμηθευτή (εκδότη), μόνο ψηφία'),
  number: z.string().nullable().describe('Αριθμός παραστατικού όπως αναγράφεται (με σειρά αν υπάρχει)'),
  date: z.string().nullable().describe('Ημερομηνία έκδοσης σε μορφή YYYY-MM-DD'),
  net_total: N,
  vat_total: N,
  gross_total: N,
  invoice_discount: N.describe('Γενική έκπτωση επί του συνόλου σε €, μόνο αν αναγράφεται χωριστά από τις γραμμές'),
  header_uncertain_fields: fieldList(HEADER_FIELDS),
  lines: z.array(
    z.object({
      supplier_code: z.string().nullable(),
      description: z.string(),
      qty: N.describe('Ποσότητα όπως αναγράφεται στη στήλη ποσότητας'),
      unit_text: z.string().nullable().describe('Μονάδα όπως αναγράφεται: ΤΕΜ, ΚΙΒ, ΣΥΣΚ, KG, ΛΙΤ κ.λπ.'),
      qty_unit: choice(['unit', 'kg', 'g', 'l', 'ml'], "'unit' όταν η ποσότητα μετρά τεμάχια/συσκευασίες/κιβώτια· kg/g/l/ml όταν μετρά απευθείας βάρος/όγκο."),
      pack_count: N.describe('Πόσα τεμάχια περιέχει κάθε μονάδα (π.χ. κιβώτιο 4×2,5kg → 4). null αν δεν αναγράφεται'),
      pack_size: N.describe('Περιεχόμενο κάθε τεμαχίου (π.χ. 2.5). null αν δεν αναγράφεται'),
      pack_unit: choice(['kg', 'g', 'l', 'ml', 'pc'], 'Μονάδα του περιεχομένου κάθε τεμαχίου (pc = τεμάχια).'),
      pack_from_description: z.boolean().describe('true αν το περιεχόμενο συσκευασίας διαβάστηκε από το κείμενο της περιγραφής'),
      unit_price: N,
      discount_pct: N,
      discount_amount: N,
      net_amount: N.describe('Καθαρή αξία γραμμής χωρίς ΦΠΑ όπως αναγράφεται'),
      vat_rate: N.describe('Συντελεστής ΦΠΑ % (π.χ. 13, 24, 6)'),
      vat_amount: N,
      is_material: z.boolean().describe('false για μεταφορικά, εγγυοδοσίες, επιστροφές, ανακυκλώσιμα τέλη, εκπτώσεις ως γραμμές κ.λπ.'),
      uncertain_fields: fieldList(LINE_FIELDS),
      note: z.string().nullable().describe('Σύντομη παρατήρηση στα ελληνικά, μόνο αν χρειάζεται'),
    }),
  ),
  warnings: z.array(z.string()).describe('Παρατηρήσεις στα ελληνικά (π.χ. θολή σελίδα, κομμένο σύνολο)'),
});

const EXTRACT_SYSTEM = `You read Greek supplier purchase documents (τιμολόγια, δελτία αποστολής, αποδείξεις) for a pastry shop / bakery / gelato workshop and transcribe them into structured data.

Rules:
- Transcribe only what is printed. Never invent, estimate, or compute a value that is not printed. If a value is not printed, return null.
- If a printed value is hard to read (blurry, cut off, overwritten, ambiguous digit), still give your best reading but list the field in uncertain_fields (or header_uncertain_fields). If it is completely illegible, return null and list it as uncertain.
- Greek number format: comma is the decimal separator and dot the thousands separator ("1.234,50" = 1234.50). Return plain JSON numbers.
- One output line per printed product line, across all pages, in document order. Do not merge or split lines. Include non-product lines (transport, deposits) with is_material=false.
- Package content: if the description or a column states the content per unit (e.g. "ΒΟΥΤΥΡΟ 2,5KG", "ΚΡΕΜΑ 35% 1LT", "ΚΙΒ 4Χ2,5ΚΓ", "ΠΟΤΗΡΙ 50ΤΜΧ"), fill pack_count/pack_size/pack_unit and set pack_from_description accordingly. If the quantity column itself is in kg/lt (e.g. "ΚΙΛΑ 25"), set qty_unit to kg/l and leave pack fields null.
- Keep the exact description text, including percentages (fat %, cocoa %) and brand names; they distinguish different products.
- Dates as YYYY-MM-DD. VAT number (ΑΦΜ) of the issuer/supplier, not of the customer.
- warnings and note must be written in Greek.`;

const MatchResult = z.object({
  matches: z.array(
    z.object({
      line_index: z.number(),
      material_id: z.number().nullable(),
      confidence: z.number().describe('0 έως 1'),
      reason: z.string().describe('Σύντομη αιτιολόγηση στα ελληνικά'),
    }),
  ),
});

const MATCH_SYSTEM = `You match lines from Greek supplier invoices to an existing catalog of raw materials and packaging of a pastry shop.

Rules:
- Propose a material only if it is the same product. Different fat %, cocoa %, flavour, type, or size class are DIFFERENT products (e.g. cream 35% ≠ cream 48%, dark couverture 70% ≠ milk couverture). When in doubt, return material_id null.
- Brand differences matter if the catalog item names a brand.
- Use only material ids from the catalog. confidence between 0 and 1. reason in Greek, short.`;

function toContent(files) {
  const content = [];
  files.forEach((f, i) => {
    const data = f.buffer.toString('base64');
    if (f.mime === 'application/pdf') {
      content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data }, title: f.name || `Σελίδα ${i + 1}` });
    } else {
      const media = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(f.mime) ? f.mime : 'image/jpeg';
      content.push({ type: 'image', source: { type: 'base64', media_type: media, data } });
    }
  });
  return content;
}

export class AiError extends Error {}

export function createAi(config) {
  const hasCreds = !!(config.anthropicApiKey || process.env.ANTHROPIC_AUTH_TOKEN);
  if (!hasCreds) return { enabled: false, model: null };
  const client = new Anthropic(config.anthropicApiKey ? { apiKey: config.anthropicApiKey } : {});
  const model = config.aiModel;
  const effort = config.aiEffort;

  async function run(params) {
    try {
      const stream = client.beta.messages.stream({
        model,
        max_tokens: 64000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        ...params,
      });
      const msg = await stream.finalMessage();
      if (msg.stop_reason === 'refusal') throw new AiError('Η υπηρεσία AI αρνήθηκε την επεξεργασία του εγγράφου.');
      if (msg.stop_reason === 'max_tokens') throw new AiError('Το έγγραφο είναι πολύ μεγάλο για μία ανάγνωση. Χωρίστε το σε μικρότερα αρχεία.');
      if (!msg.parsed_output) throw new AiError('Η απάντηση της AI δεν είχε την αναμενόμενη μορφή.');
      return { output: msg.parsed_output, model: msg.model };
    } catch (err) {
      if (err instanceof AiError) throw err;
      if (err instanceof Anthropic.AuthenticationError) throw new AiError('Μη έγκυρο κλειδί API (ANTHROPIC_API_KEY).');
      if (err instanceof Anthropic.RateLimitError) throw new AiError('Υπέρβαση ορίου χρήσης της AI. Δοκιμάστε ξανά σε λίγο.');
      if (err instanceof Anthropic.BadRequestError) throw new AiError(`Η AI δεν δέχτηκε το αρχείο: ${err.message}`);
      if (err instanceof Anthropic.APIError) throw new AiError(`Σφάλμα υπηρεσίας AI (${err.status ?? 'δίκτυο'}). Δοκιμάστε ξανά.`);
      throw err;
    }
  }

  return {
    enabled: true,
    model,
    async extractInvoice(files) {
      const content = toContent(files);
      content.push({
        type: 'text',
        text: `Μεταγράψτε το παραπάνω παραστατικό (${files.length} αρχείο/α, όλες οι σελίδες). Ακολουθήστε αυστηρά τους κανόνες: καμία επινόηση τιμών, σημείωση αβέβαιων πεδίων.`,
      });
      return run({
        system: EXTRACT_SYSTEM,
        output_config: { effort, format: betaZodOutputFormat(InvoiceExtraction) },
        messages: [{ role: 'user', content }],
      });
    },
    async suggestMatches(lines, materials) {
      if (!lines.length || !materials.length) return { output: { matches: [] }, model };
      const catalog = materials.map((m) => ({ id: m.id, name: m.name, brand: m.brand || undefined, attributes: m.attributes || undefined, category: m.category || undefined, unit: m.cost_unit, kind: m.kind }));
      const text = `Κατάλογος υλικών (JSON):\n${JSON.stringify(catalog)}\n\nΓραμμές τιμολογίου (JSON):\n${JSON.stringify(lines.map((l) => ({ line_index: l.index, code: l.supplier_code, description: l.description, unit: l.unit_raw })))}\n\nΓια κάθε γραμμή προτείνετε το ίδιο υλικό από τον κατάλογο ή null.`;
      return run({
        system: MATCH_SYSTEM,
        output_config: { effort: 'low', format: betaZodOutputFormat(MatchResult) },
        messages: [{ role: 'user', content: text }],
      });
    },
  };
}

const UNIT_SYNONYMS = {
  kg: ['kg', 'kgr', 'kgs', 'κιλ', 'κιλα', 'κιλο', 'κγ', 'κγρ'],
  g: ['g', 'gr', 'grs', 'γρ', 'γραμ'],
  l: ['l', 'lt', 'ltr', 'lit', 'litre', 'liter', 'λιτ', 'λιτρα', 'λιτρο', 'λ'],
  ml: ['ml', 'μλ'],
  pc: ['pc', 'pcs', 'τεμ', 'τμχ', 'τεμαχια', 'τεμαχιο', 'piece', 'pieces'],
  unit: ['unit', 'κιβ', 'κιβωτιο', 'συσκ', 'συσκευασια', 'πακ', 'πακετο', 'σακ', 'σακι', 'box', 'pack', 'bag'],
};
function normUnit(v, allowed) {
  if (v == null || v === '') return { value: null, ok: true };
  const key = String(v)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-zα-ω]/g, '');
  for (const [unit, syn] of Object.entries(UNIT_SYNONYMS)) {
    if (syn.includes(key)) {
      if (allowed.includes(unit)) return { value: unit, ok: true };
      if (unit === 'pc' && allowed.includes('unit')) return { value: 'unit', ok: true };
      if (unit === 'unit' && allowed.includes('pc')) return { value: 'pc', ok: true };
    }
  }
  return { value: null, ok: false };
}
const FIELD_ALIASES = { quantity: 'qty', date: 'doc_date', vat_number: 'supplier_vat', code: 'supplier_code', discount: 'discount_pct', unit: 'qty_unit' };
function normFields(list, allowed) {
  return [...new Set((list || []).map((f) => FIELD_ALIASES[f] || f).filter((f) => allowed.includes(f)))];
}

/** Μετατροπή αποτελέσματος ανάγνωσης σε κεφαλίδα και γραμμές πρόχειρου τιμολογίου. */
export function extractionToDraft(out) {
  const header = {
    supplier_name: out.supplier_name,
    supplier_vat: out.supplier_vat ? String(out.supplier_vat).replace(/\D/g, '') || null : null,
    number: out.number,
    doc_date: out.date && /^\d{4}-\d{2}-\d{2}$/.test(out.date) ? out.date : null,
    doc_type: out.document_type,
    net_total: out.net_total,
    vat_total: out.vat_total,
    gross_total: out.gross_total,
    extra_discount: out.invoice_discount,
    flags: normFields(out.header_uncertain_fields, HEADER_FIELDS),
  };
  if (out.date && !header.doc_date && !header.flags.includes('doc_date')) header.flags.push('doc_date');
  const lines = (out.lines || []).map((l, i) => {
    const flags = new Set(normFields(l.uncertain_fields, LINE_FIELDS));
    const notes = [];
    const qu = normUnit(l.qty_unit, ['unit', 'kg', 'g', 'l', 'ml']);
    const pu = normUnit(l.pack_unit, ['kg', 'g', 'l', 'ml', 'pc']);
    if (!qu.ok) flags.add('qty_unit');
    if (!pu.ok) flags.add('pack_unit');
    if (l.note) notes.push(l.note);
    if (l.pack_from_description && l.pack_size != null) notes.push('Περιεχόμενο συσκευασίας από την περιγραφή.');
    return {
      position: i,
      supplier_code: l.supplier_code,
      description: l.description,
      qty: l.qty,
      qty_unit: qu.value,
      unit_raw: l.unit_text,
      pack_count: l.pack_count,
      pack_size: l.pack_size,
      pack_unit: pu.value,
      unit_price: l.unit_price,
      discount_pct: l.discount_pct,
      discount_amount: l.discount_amount,
      net_amount: l.net_amount,
      vat_rate: l.vat_rate,
      vat_amount: l.vat_amount,
      excluded: l.is_material ? 0 : 1,
      flags: [...flags],
      ai_note: notes.join(' ') || null,
    };
  });
  return { header, lines, warnings: out.warnings || [], readable: out.readable };
}
