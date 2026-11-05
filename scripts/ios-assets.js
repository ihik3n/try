// Δημιουργεί εικονίδια και οθόνες εκκίνησης (splash) για iPhone/iPad από το client/public/icon.svg.
// Χρήση: node scripts/ios-assets.js   (απαιτεί Playwright με Chromium)
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const pub = path.resolve('client/public');
const svg = fs.readFileSync(path.join(pub, 'icon.svg'), 'utf8');
const BRAND = '#6b3e26';

// Συσκευές: πλάτος/ύψος σε CSS px (portrait) και πυκνότητα οθόνης.
export const DEVICES = [
  ['iphone-16-pro-max', 440, 956, 3],
  ['iphone-16-pro', 402, 874, 3],
  ['iphone-15-pro-max', 430, 932, 3],
  ['iphone-15-pro', 393, 852, 3],
  ['iphone-14', 390, 844, 3],
  ['iphone-14-plus', 428, 926, 3],
  ['iphone-13-mini', 375, 812, 3],
  ['iphone-11', 414, 896, 2],
  ['iphone-11-pro-max', 414, 896, 3],
  ['iphone-se', 375, 667, 2],
  ['iphone-8-plus', 414, 736, 3],
  ['ipad-mini', 744, 1133, 2],
  ['ipad', 820, 1180, 2],
  ['ipad-pro-11', 834, 1194, 2],
  ['ipad-pro-13', 1024, 1366, 2],
];

// Εικονίδιο χωρίς διάφανες γωνίες (το iOS στρογγυλεύει μόνο του· οι διάφανες γωνίες γίνονται μαύρες).
const fullBleed = svg.replace('<rect width="64" height="64" rx="14" fill="#6b3e26"/>', '<rect width="64" height="64" fill="#6b3e26"/>');

const browser = await chromium.launch();
async function render(html, w, h, file, scale = 1) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: scale });
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;height:100%}</style></head><body>${html}</body></html>`);
  await page.screenshot({ path: file, type: 'png' });
  await page.close();
}

await render(fullBleed.replace('<svg ', '<svg width="180" height="180" '), 180, 180, path.join(pub, 'apple-touch-icon.png'));
// Εικονίδιο «maskable» για Android/άλλες πλατφόρμες: περιθώριο ασφαλείας γύρω από το σχέδιο.
await render(`<div style="width:512px;height:512px;background:${BRAND};display:flex;align-items:center;justify-content:center">${fullBleed.replace('<svg ', '<svg width="360" height="360" ')}</div>`, 512, 512, path.join(pub, 'icon-maskable-512.png'));

fs.mkdirSync(path.join(pub, 'splash'), { recursive: true });
const splash = (w) => {
  const icon = Math.round(Math.min(w, 600) * 0.28);
  return `<div style="height:100%;background:${BRAND};display:flex;flex-direction:column;align-items:center;justify-content:center;gap:${Math.round(icon * 0.18)}px;font-family:-apple-system,'Segoe UI',Roboto,'Noto Sans',Arial,sans-serif">
    <div style="width:${icon}px;height:${icon}px;border-radius:${Math.round(icon * 0.22)}px;overflow:hidden;box-shadow:0 6px 24px rgba(0,0,0,.25)">${fullBleed.replace('<svg ', `<svg width="${icon}" height="${icon}" `)}</div>
    <div style="color:#f6e7d4;font-size:${Math.round(icon * 0.2)}px;font-weight:700;letter-spacing:.01em">Κοστολόγηση</div>
  </div>`;
};
const links = [];
for (const [name, w, h, r] of DEVICES) {
  for (const orient of ['portrait', 'landscape']) {
    if (orient === 'landscape' && !name.startsWith('ipad')) continue;
    const [cw, ch] = orient === 'portrait' ? [w, h] : [h, w];
    const file = `splash/${name}-${orient}.png`;
    await render(splash(cw), cw, ch, path.join(pub, file), r);
    links.push(
      `<link rel="apple-touch-startup-image" media="(device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${r}) and (orientation: ${orient})" href="/${file}" />`,
    );
  }
}
await browser.close();

// Ενημέρωση του index.html ανάμεσα στους δείκτες
const indexPath = path.resolve('client/index.html');
const html = fs.readFileSync(indexPath, 'utf8');
const start = '<!-- ios-splash:start -->';
const end = '<!-- ios-splash:end -->';
const block = `${start}\n    ${links.join('\n    ')}\n    ${end}`;
const next = html.includes(start) ? html.replace(new RegExp(`${start}[\\s\\S]*?${end}`), block) : html.replace('  </head>', `    ${block}\n  </head>`);
fs.writeFileSync(indexPath, next);
console.log(`OK: apple-touch-icon, maskable icon, ${links.length} splash screens`);
