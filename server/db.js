import Database from 'better-sqlite3';

// Σειρά πινάκων: γονικοί πριν από τα εξαρτώμενα (χρησιμοποιείται σε αντίγραφα/επαναφορά).
export const TABLES = [
  'settings',
  'users',
  'suppliers',
  'materials',
  'invoices',
  'invoice_files',
  'invoice_lines',
  'prices',
  'material_aliases',
  'recipes',
  'recipe_items',
  'products',
  'product_items',
  'price_events',
  'snapshots',
  'production_plans',
];

const MIGRATIONS = [
  `
  CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);

  CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    display_name TEXT,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );

  CREATE TABLE suppliers (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    vat_number TEXT,
    phone TEXT,
    notes TEXT,
    is_sample INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE materials (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'ingredient' CHECK (kind IN ('ingredient','packaging')),
    category TEXT,
    brand TEXT,
    attributes TEXT,
    cost_unit TEXT NOT NULL CHECK (cost_unit IN ('kg','l','pc')),
    density REAL,
    piece_weight REAL,
    price_mode TEXT NOT NULL DEFAULT 'latest' CHECK (price_mode IN ('latest','pinned')),
    pinned_price_id INTEGER,
    notes TEXT,
    archived INTEGER NOT NULL DEFAULT 0,
    is_sample INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE invoices (
    id INTEGER PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','confirmed')),
    supplier_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
    supplier_name TEXT,
    supplier_vat TEXT,
    number TEXT,
    doc_date TEXT,
    doc_type TEXT,
    net_total REAL,
    vat_total REAL,
    gross_total REAL,
    extra_discount REAL,
    flags TEXT,
    notes TEXT,
    ai_status TEXT,
    ai_model TEXT,
    ai_result TEXT,
    ai_warnings TEXT,
    ai_error TEXT,
    ai_started_at TEXT,
    dup_ack INTEGER NOT NULL DEFAULT 0,
    is_sample INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    confirmed_at TEXT,
    created_by INTEGER,
    confirmed_by INTEGER
  );

  CREATE TABLE invoice_files (
    id INTEGER PRIMARY KEY,
    invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    original_name TEXT,
    stored_name TEXT NOT NULL,
    mime TEXT,
    size INTEGER,
    sha256 TEXT,
    position INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE invoice_lines (
    id INTEGER PRIMARY KEY,
    invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    position INTEGER NOT NULL DEFAULT 0,
    supplier_code TEXT,
    description TEXT,
    qty REAL,
    qty_unit TEXT,
    unit_raw TEXT,
    pack_count REAL,
    pack_size REAL,
    pack_unit TEXT,
    unit_price REAL,
    discount_pct REAL,
    discount_amount REAL,
    net_amount REAL,
    vat_rate REAL,
    vat_amount REAL,
    material_id INTEGER REFERENCES materials(id) ON DELETE SET NULL,
    match_source TEXT,
    match_confidence REAL,
    match_note TEXT,
    excluded INTEGER NOT NULL DEFAULT 0,
    flags TEXT,
    ai_note TEXT
  );

  CREATE TABLE prices (
    id INTEGER PRIMARY KEY,
    material_id INTEGER NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
    doc_date TEXT NOT NULL,
    unit_net REAL NOT NULL,
    vat_rate REAL,
    quantity REAL,
    pack_content REAL,
    pack_label TEXT,
    supplier_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
    invoice_id INTEGER REFERENCES invoices(id) ON DELETE CASCADE,
    source TEXT NOT NULL CHECK (source IN ('invoice','manual')),
    note TEXT,
    is_sample INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    created_by INTEGER
  );
  CREATE INDEX prices_material ON prices(material_id, doc_date DESC, id DESC);

  CREATE TABLE material_aliases (
    id INTEGER PRIMARY KEY,
    material_id INTEGER NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
    supplier_id INTEGER REFERENCES suppliers(id) ON DELETE CASCADE,
    supplier_code TEXT,
    description TEXT,
    description_norm TEXT,
    qty_unit TEXT,
    pack_count REAL,
    pack_size REAL,
    pack_unit TEXT,
    times_used INTEGER NOT NULL DEFAULT 1,
    last_used_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX aliases_desc ON material_aliases(description_norm);

  CREATE TABLE recipes (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT,
    notes TEXT,
    yield_mode TEXT NOT NULL DEFAULT 'none' CHECK (yield_mode IN ('actual','loss','none')),
    yield_qty REAL,
    yield_unit TEXT,
    loss_pct REAL,
    measure TEXT NOT NULL DEFAULT 'mass' CHECK (measure IN ('mass','volume')),
    density REAL,
    piece_weight REAL,
    labor_minutes REAL,
    labor_rate REAL,
    overhead_fixed REAL,
    overhead_pct REAL,
    overhead_base TEXT NOT NULL DEFAULT 'materials',
    archived INTEGER NOT NULL DEFAULT 0,
    is_sample INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE recipe_items (
    id INTEGER PRIMARY KEY,
    recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    position INTEGER NOT NULL DEFAULT 0,
    material_id INTEGER REFERENCES materials(id),
    sub_recipe_id INTEGER REFERENCES recipes(id),
    qty REAL,
    unit TEXT,
    note TEXT
  );

  CREATE TABLE products (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT,
    notes TEXT,
    batch_size REAL NOT NULL DEFAULT 1,
    labor_minutes REAL,
    labor_rate REAL,
    overhead_fixed REAL,
    overhead_pct REAL,
    overhead_base TEXT NOT NULL DEFAULT 'materials',
    archived INTEGER NOT NULL DEFAULT 0,
    is_sample INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE product_items (
    id INTEGER PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    position INTEGER NOT NULL DEFAULT 0,
    material_id INTEGER REFERENCES materials(id),
    recipe_id INTEGER REFERENCES recipes(id),
    qty REAL,
    unit TEXT,
    note TEXT
  );

  CREATE TABLE price_events (
    id INTEGER PRIMARY KEY,
    created_at TEXT NOT NULL,
    reason TEXT NOT NULL,
    invoice_id INTEGER,
    user_id INTEGER,
    vat_basis TEXT,
    changes TEXT NOT NULL,
    impacts TEXT NOT NULL,
    is_sample INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE snapshots (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    note TEXT,
    created_at TEXT NOT NULL,
    user_id INTEGER,
    vat_basis TEXT,
    data TEXT NOT NULL,
    is_sample INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE production_plans (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    plan_date TEXT,
    notes TEXT,
    entries TEXT NOT NULL,
    is_sample INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  `,
];

export function openDb(file) {
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  migrate(db);
  return db;
}

export function migrate(db) {
  const current = db.pragma('user_version', { simple: true });
  for (let v = current; v < MIGRATIONS.length; v++) {
    db.transaction(() => {
      db.exec(MIGRATIONS[v]);
      db.pragma(`user_version = ${v + 1}`);
    })();
  }
}

export const SCHEMA_VERSION = MIGRATIONS.length;

export function nowIso() {
  return new Date().toISOString();
}

export function todayIso() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export const DEFAULT_SETTINGS = {
  business_name: 'Το ζαχαροπλαστείο μου',
  vat_basis: 'net',
  labor_rate: null,
  default_overhead_note: '',
};

export function getSettings(db) {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const s = { ...DEFAULT_SETTINGS };
  for (const r of rows) {
    try {
      s[r.key] = JSON.parse(r.value);
    } catch {
      s[r.key] = r.value;
    }
  }
  return s;
}

export function setSettings(db, patch) {
  const stmt = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  db.transaction(() => {
    for (const [k, v] of Object.entries(patch)) stmt.run(k, JSON.stringify(v));
  })();
}
