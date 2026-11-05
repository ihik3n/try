import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig } from '../server/config.js';
import { openDb } from '../server/db.js';
import { createApp } from '../server/app.js';
import { seedSampleData } from '../server/services/sample.js';

const silent = { info() {}, error() {} };

export async function startServer({ seed = false, ai = { enabled: false, model: null } } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kostol-'));
  const config = loadConfig({ dataDir: dir, seedSample: false, cookieSecure: false });
  const db = openDb(config.dbPath);
  if (seed) seedSampleData(db);
  const app = createApp({ db, config, ai: typeof ai === 'function' ? ai(db, config) : ai, log: silent });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie = '';
  async function call(method, url, body, opts = {}) {
    const headers = { 'x-requested-with': 'app', ...(cookie ? { cookie } : {}) };
    let payload;
    if (body instanceof FormData) payload = body;
    else if (body !== undefined) {
      headers['content-type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    const res = await fetch(base + url, { method, headers, body: payload });
    const sc = res.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0];
    const type = res.headers.get('content-type') || '';
    const data = type.includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer());
    if (!opts.raw && res.status >= 400) {
      const err = new Error(`${method} ${url} → ${res.status}: ${data?.error || ''}`);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return opts.raw ? { status: res.status, data, headers: res.headers } : data;
  }
  const api = {
    get: (u, o) => call('GET', u, undefined, o),
    post: (u, b, o) => call('POST', u, b ?? {}, o),
    put: (u, b, o) => call('PUT', u, b, o),
    del: (u, o) => call('DELETE', u, undefined, o),
    clearCookie: () => (cookie = ''),
  };
  async function close() {
    await new Promise((r) => server.close(r));
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
  return { api, db, config, close, base };
}

export async function loggedIn(opts) {
  const s = await startServer(opts);
  await s.api.post('/api/auth/setup', { username: 'admin', password: 'kodikos123', display_name: 'Διαχειριστής' });
  return s;
}
