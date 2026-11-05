// Δοκιμή από άκρη σε άκρη στον browser (κινητό & υπολογιστής).
// Χρήση: npm run build && npm run e2e   (απαιτεί Playwright: npm i -D playwright && npx playwright install chromium)
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
let playwright;
try {
  playwright = require('playwright');
} catch {
  console.error('Δεν βρέθηκε το Playwright. Εγκατάσταση: npm i -D playwright && npx playwright install chromium');
  process.exit(1);
}
const { chromium, devices } = playwright;

const outDir = process.env.E2E_OUT || path.join(os.tmpdir(), 'e2e-shots');
fs.mkdirSync(outDir, { recursive: true });
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-data-'));
const port = 3900 + Math.floor(Math.random() * 90);
const base = `http://127.0.0.1:${port}`;

const server = spawn(process.execPath, ['server/index.js'], {
  env: { ...process.env, DATA_DIR: dataDir, PORT: String(port), HOST: '127.0.0.1', ANTHROPIC_API_KEY: '', ANTHROPIC_AUTH_TOKEN: '' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
server.stderr.on('data', (d) => process.stderr.write(`[server] ${d}`));

async function waitUp() {
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(`${base}/api/health`);
      if (r.ok) return;
    } catch {
      /* */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('server did not start');
}

const errors = [];
function watch(page, label) {
  page.on('pageerror', (e) => errors.push(`[${label}] pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/401|Failed to load resource/.test(m.text())) errors.push(`[${label}] console: ${m.text()}`);
  });
}
const step = (s) => console.log(`• ${s}`);
const shot = (page, name) => page.screenshot({ path: path.join(outDir, `${name}.png`), fullPage: true });

async function run() {
  await waitUp();
  const browser = await chromium.launch();

  // ---------- Κινητό ----------
  const mctx = await browser.newContext({ ...devices['iPhone 13'], locale: 'el-GR' });
  const m = await mctx.newPage();
  watch(m, 'mobile');
  await m.goto(base);
  step('Πρώτη ρύθμιση χρήστη');
  await m.getByText('Πρώτη ρύθμιση').waitFor();
  await shot(m, 'm00-setup');
  await m.locator('input').nth(0).fill('Μαρία');
  await m.locator('input').nth(1).fill('maria');
  await m.locator('input[type=password]').nth(0).fill('kodikos123');
  await m.locator('input[type=password]').nth(1).fill('kodikos123');
  await m.getByRole('button', { name: /Δημιουργία/ }).click();
  await m.getByText('Ελλιπή κοστολόγια').waitFor();
  await shot(m, 'm01-home');

  step('Υλικά: αναζήτηση χωρίς τόνους');
  await m.locator('.bottomnav').getByText('Υλικά').click();
  await m.getByPlaceholder(/Αναζήτηση/).fill('κρεμα 35');
  await m.locator('.list-item', { hasText: 'Κρέμα γάλακτος 35%' }).waitFor();
  if (await m.locator('.list-item', { hasText: 'Κρέμα γάλακτος 48%' }).count()) throw new Error('Η αναζήτηση έφερε και την 48%');
  await shot(m, 'm02-materials');
  await m.getByPlaceholder(/Αναζήτηση/).fill('βουτυρο');
  await m.locator('.list-item', { hasText: 'Βούτυρο' }).click();
  await m.getByText('Ιστορικό τιμών').waitFor();
  await m.getByText('9,50 €/kg').first().waitFor();
  await shot(m, 'm03-material-detail');

  step('Συνταγή: πραγματική απόδοση 2.000 g');
  await m.locator('.bottomnav').getByText('Συνταγές').click();
  await m.locator('.list-item', { hasText: 'Μους σοκολάτας' }).click();
  await m.getByText('Τελική απόδοση', { exact: true }).waitFor();
  const costText = await m.locator('.costbox .big').first().innerText();
  console.log('  Μους σοκολάτας:', costText, '/kg');
  await shot(m, 'm04-recipe');

  step('Προϊόν: ποτηράκι μους');
  await m.locator('.bottomnav').getByText('Προϊόντα').click();
  await m.locator('.list-item', { hasText: 'Ποτηράκι μους σοκολάτας' }).click();
  await m.getByText('Αναλυτικά ανά τεμάχιο').waitFor();
  await shot(m, 'm05-product');

  step('Παραγωγή: θέλω 60 ποτηράκια');
  await m.getByRole('button', { name: /Παραγωγή/ }).first().click();
  await m.getByText('Τι θέλω να παράγω').waitFor();
  await m.getByPlaceholder('π.χ. 60').fill('60');
  await m.getByText('Επιμέρους συνταγές').waitFor();
  await m.getByText('συνολικό κόστος παραγωγής').waitFor();
  await shot(m, 'm06-production');

  step('Χειροκίνητο τιμολόγιο: 4 × 2,5 kg βούτυρο, 90 € → 9 €/kg');
  await m.locator('.bottomnav').getByText('Τιμολόγια').click();
  await m.getByRole('button', { name: /Αρχεία/ }).click();
  await m.getByRole('button', { name: /Χειροκίνητη καταχώριση/ }).click();
  await m.getByText('Στοιχεία παραστατικού').waitFor();
  await m.locator('input[list=suppliers-dl]').fill('ΠΑΡΑΔΕΙΓΜΑ Γαλακτοκομικά Α.Ε.');
  await m.locator('.field', { hasText: 'Αριθμός' }).locator('input').fill('Α-2001');
  await m.locator('input[type=date]').fill('2026-11-01');
  await m.getByRole('button', { name: /Προσθήκη γραμμής/ }).click();
  const line = m.locator('.inv-line').first();
  await line.getByPlaceholder(/Περιγραφή/).fill('ΒΟΥΤΥΡΟ ΑΓΕΛΑΔΟΣ 82% 2,5KG');
  await line.getByRole('button', { name: /Επιλογή υλικού/ }).click();
  await m.getByPlaceholder(/Αναζήτηση \(με ή χωρίς/).fill('βουτ 82');
  await m.locator('.picker-item', { hasText: 'Βούτυρο αγελάδος 82%' }).click();
  await line.locator('.field', { hasText: 'Ποσότητα' }).first().locator('input').fill('4');
  await line.locator('.field', { hasText: 'Περιεχόμενο' }).locator('input').fill('2,5');
  await line.locator('.field', { hasText: 'Περιεχόμενο' }).locator('select').selectOption('kg');
  await line.locator('.field', { hasText: 'Καθαρή αξία' }).locator('input').fill('90');
  await line.locator('.field', { hasText: 'ΦΠΑ' }).first().locator('input').fill('13');
  await line.getByText('9,00 €/kg').waitFor();
  await line.getByText('10 kg').first().waitFor();
  await shot(m, 'm07-invoice-line');
  await m.getByRole('button', { name: /Επιβεβαίωση τιμών/ }).click();
  await m.getByText('Οι τιμές ενημερώθηκαν').waitFor();
  await m.getByText('Επηρεαζόμενα κοστολόγια').waitFor();
  await shot(m, 'm08-confirm-result');
  await m.getByRole('button', { name: 'Κλείσιμο' }).last().click();

  step('Ιστορικό μεταβολών');
  await m.locator('.bottomnav').getByText('Μενού').click();
  await m.locator('.modal').getByText('Ιστορικό').click();
  await m.getByText('Επιβεβαίωση παραστατικού').first().waitFor();
  await shot(m, 'm09-history');
  await mctx.close();

  // ---------- Υπολογιστής ----------
  const dctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: 'el-GR' });
  const d = await dctx.newPage();
  watch(d, 'desktop');
  await d.goto(base);
  await d.getByText('Σύνδεση').first().waitFor();
  await d.locator('input').nth(0).fill('maria');
  await d.locator('input[type=password]').fill('kodikos123');
  await d.getByRole('button', { name: 'Είσοδος' }).click();
  await d.getByText('Ελλιπή κοστολόγια').waitFor();
  await shot(d, 'd01-home');

  step('Υπολογιστής: κοινά δεδομένα — η νέα τιμή φαίνεται');
  await d.locator('.sidebar').getByText('Υλικά').click();
  await d.getByPlaceholder(/Αναζήτηση/).fill('Βούτυρο');
  await d.locator('.list-item', { hasText: '9,00 €/kg' }).waitFor();

  step('Υπολογιστής: συνταγή — αλλαγή ποσότητας ενημερώνει κόστος');
  await d.locator('.sidebar').getByText('Συνταγές').click();
  await d.locator('.list-item', { hasText: 'Crumble' }).click();
  await d.getByText('Τελική απόδοση', { exact: true }).waitFor();
  const before = await d.locator('.costbox .big').first().innerText();
  await d.locator('.item-row').first().locator('input').first().fill('500');
  await d.waitForTimeout(200);
  const after = await d.locator('.costbox .big').first().innerText();
  if (before === after) throw new Error('Το κόστος δεν άλλαξε μετά την αλλαγή ποσότητας');
  console.log(`  Crumble: ${before} → ${after}`);
  await shot(d, 'd02-recipe-edit');
  d.once('dialog', (dlg) => dlg.accept());
  await d.locator('.sidebar').getByText('Προϊόντα').click();
  await d.locator('.list-item', { hasText: 'Τούρτα' }).click();
  await d.getByText('Αναλυτικά ανά τεμάχιο').waitFor();
  await shot(d, 'd03-product');

  step('Υπολογιστής: τιμολόγιο σε δύο στήλες');
  await d.locator('.sidebar').getByText('Τιμολόγια').click();
  await d.locator('.list-item', { hasText: 'Α-1107' }).click();
  await d.getByText('Στοιχεία παραστατικού').waitFor();
  await shot(d, 'd04-invoice');

  step('Υπολογιστής: στιγμιότυπο & σύγκριση');
  await d.locator('.sidebar').getByText('Ιστορικό').click();
  await d.getByRole('tab', { name: /Στιγμιότυπα/ }).click();
  await d.locator('.list-item', { hasText: 'Κοστολόγιο Σεπτεμβρίου' }).click();
  await d.getByText('Τότε').first().waitFor();
  await shot(d, 'd05-snapshot');

  step('Υπολογιστής: παραγωγή από αποθηκευμένο πλάνο');
  await d.locator('.sidebar').getByText('Παραγωγή').click();
  const sel = d.locator('.field', { hasText: 'Αποθηκευμένα πλάνα' }).locator('select');
  await sel.selectOption({ index: 1 });
  await d.getByText('Πρώτες ύλες (συγκεντρωτικά)').waitFor();
  await shot(d, 'd06-production');
  const [dl] = await Promise.all([d.waitForEvent('download'), d.getByRole('button', { name: /Excel/ }).click()]);
  console.log('  Λήψη:', dl.suggestedFilename());

  step('Υπολογιστής: ρυθμίσεις');
  await d.locator('.sidebar').getByText('Ρυθμίσεις').click();
  await d.getByText('Αντίγραφα ασφαλείας').waitFor();
  await shot(d, 'd07-settings');
  await dctx.close();
  await browser.close();
}

let code = 0;
try {
  await run();
  if (errors.length) {
    console.error('Σφάλματα στη σελίδα:\n' + errors.join('\n'));
    code = 1;
  } else console.log(`OK — στιγμιότυπα οθόνης στο ${outDir}`);
} catch (e) {
  console.error('ΑΠΟΤΥΧΙΑ:', e.message);
  if (errors.length) console.error(errors.join('\n'));
  code = 1;
} finally {
  server.kill();
  fs.rmSync(dataDir, { recursive: true, force: true });
}
process.exit(code);
