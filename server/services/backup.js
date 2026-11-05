// Πλήρη αντίγραφα ασφαλείας: όλα τα δεδομένα (JSON) + τα αρχικά παραστατικά, σε ένα αρχείο .zip.
// Χρησιμοποιείται για αυτόματα αντίγραφα, χειροκίνητη λήψη, μεταφορά και επαναφορά.

import fs from 'node:fs';
import path from 'node:path';
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import { TABLES, SCHEMA_VERSION, nowIso } from '../db.js';

export const BACKUP_FORMAT = 'zacharoplasteio-backup';

export function buildBackup(db, config) {
  const tables = {};
  for (const t of TABLES) tables[t] = db.prepare(`SELECT * FROM ${t}`).all();
  const meta = { format: BACKUP_FORMAT, version: 1, schema: SCHEMA_VERSION, created_at: nowIso(), counts: Object.fromEntries(Object.entries(tables).map(([k, v]) => [k, v.length])) };
  const entries = {
    'data.json': [strToU8(JSON.stringify({ meta, tables })), { level: 6 }],
    'README.txt': [strToU8('Πλήρες αντίγραφο ασφαλείας εφαρμογής κοστολόγησης.\nΠεριέχει data.json (όλα τα δεδομένα) και files/ (αρχικά παραστατικά).\nΕπαναφορά: Ρυθμίσεις → Αντίγραφα ασφαλείας → Επαναφορά από αρχείο.\n'), { level: 6 }],
  };
  for (const f of tables.invoice_files) {
    const p = path.join(config.uploadsDir, f.stored_name);
    if (fs.existsSync(p)) entries[`files/${f.stored_name}`] = [new Uint8Array(fs.readFileSync(p)), { level: 0 }];
  }
  return Buffer.from(zipSync(entries));
}

export function backupFileName(prefix = 'antigrafo') {
  return `${prefix}-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.zip`;
}

export function writeBackup(db, config, prefix = 'auto') {
  const buf = buildBackup(db, config);
  const name = backupFileName(prefix);
  fs.writeFileSync(path.join(config.backupsDir, name), buf);
  pruneBackups(config);
  return { name, size: buf.length };
}

export function listBackups(config) {
  if (!fs.existsSync(config.backupsDir)) return [];
  return fs
    .readdirSync(config.backupsDir)
    .filter((f) => f.endsWith('.zip'))
    .map((f) => {
      const st = fs.statSync(path.join(config.backupsDir, f));
      return { name: f, size: st.size, created_at: st.mtime.toISOString(), kind: f.startsWith('auto') ? 'auto' : f.startsWith('pre-restore') ? 'pre-restore' : 'manual' };
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function pruneBackups(config) {
  const all = listBackups(config);
  for (const kind of ['auto', 'pre-restore', 'manual']) {
    const keep = kind === 'auto' ? config.backupKeep : Math.max(5, Math.ceil(config.backupKeep / 2));
    all
      .filter((b) => b.kind === kind)
      .slice(keep)
      .forEach((b) => fs.unlinkSync(path.join(config.backupsDir, b.name)));
  }
}

export function safeBackupPath(config, name) {
  if (!/^[\w.-]+\.zip$/.test(name)) return null;
  const p = path.join(config.backupsDir, name);
  return fs.existsSync(p) ? p : null;
}

export function parseBackup(buf) {
  let files;
  try {
    files = unzipSync(new Uint8Array(buf));
  } catch {
    throw new Error('Το αρχείο δεν είναι έγκυρο αντίγραφο (.zip).');
  }
  if (!files['data.json']) throw new Error('Λείπει το data.json από το αντίγραφο.');
  const data = JSON.parse(strFromU8(files['data.json']));
  if (data?.meta?.format !== BACKUP_FORMAT || !data.tables) throw new Error('Μη αναγνωρίσιμη μορφή αντιγράφου.');
  if (data.meta.schema > SCHEMA_VERSION) throw new Error('Το αντίγραφο προέρχεται από νεότερη έκδοση της εφαρμογής.');
  return { data, files };
}

/** Αντικαθιστά όλα τα δεδομένα με τα δεδομένα του αντιγράφου. Πριν, κρατά αντίγραφο της τρέχουσας κατάστασης. */
export function restoreBackup(db, config, buf, { keepSessions = true } = {}) {
  const { data, files } = parseBackup(buf);
  const pre = writeBackup(db, config, 'pre-restore');
  const columnsOf = (t) => db.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name);
  db.pragma('foreign_keys = OFF');
  try {
    db.transaction(() => {
      for (const t of [...TABLES].reverse()) db.prepare(`DELETE FROM ${t}`).run();
      if (!keepSessions) db.prepare('DELETE FROM sessions').run();
      for (const t of TABLES) {
        const rows = data.tables[t] || [];
        if (!rows.length) continue;
        const cols = columnsOf(t);
        const stmt = db.prepare(`INSERT INTO ${t} (${cols.join(',')}) VALUES (${cols.map((c) => '@' + c).join(',')})`);
        for (const r of rows) {
          const row = {};
          for (const c of cols) row[c] = r[c] === undefined ? null : r[c];
          stmt.run(row);
        }
      }
      // Αν ο χρήστης δεν υπάρχει πλέον στο αντίγραφο, οι συνεδρίες του διαγράφονται.
      db.prepare('DELETE FROM sessions WHERE user_id NOT IN (SELECT id FROM users)').run();
      const fk = db.pragma('foreign_key_check');
      if (fk.length) throw new Error('Το αντίγραφο έχει ασυνεπείς συνδέσεις δεδομένων.');
    })();
  } finally {
    db.pragma('foreign_keys = ON');
  }
  // Αρχεία παραστατικών
  const wanted = new Set((data.tables.invoice_files || []).map((f) => f.stored_name));
  for (const [name, content] of Object.entries(files)) {
    if (!name.startsWith('files/')) continue;
    const base = path.basename(name);
    if (!wanted.has(base) || !/^[\w.-]+$/.test(base)) continue;
    fs.writeFileSync(path.join(config.uploadsDir, base), content);
  }
  for (const f of fs.readdirSync(config.uploadsDir)) {
    if (!wanted.has(f)) fs.unlinkSync(path.join(config.uploadsDir, f));
  }
  return { preRestoreBackup: pre.name, counts: data.meta.counts };
}

/** Αυτόματα αντίγραφα: κατά την εκκίνηση (αν το τελευταίο είναι παλιό) και περιοδικά. */
export function startAutoBackups(db, config, log = console) {
  const intervalMs = config.backupIntervalHours * 3600000;
  const tick = () => {
    try {
      const last = listBackups(config).find((b) => b.kind === 'auto');
      if (!last || Date.now() - Date.parse(last.created_at) >= intervalMs - 60000) {
        const r = writeBackup(db, config, 'auto');
        log.info?.(`Αυτόματο αντίγραφο ασφαλείας: ${r.name}`);
      }
    } catch (err) {
      log.error?.('Αποτυχία αυτόματου αντιγράφου:', err);
    }
  };
  tick();
  const timer = setInterval(tick, Math.min(intervalMs, 3600000));
  timer.unref?.();
  return () => clearInterval(timer);
}
