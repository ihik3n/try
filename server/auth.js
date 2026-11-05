// Προστασία πρόσβασης: χρήστες με κωδικό (scrypt), συνεδρίες με HttpOnly cookie.

import crypto from 'node:crypto';
import { nowIso } from './db.js';

const SESSION_DAYS = 30;
const COOKIE = 'sid';

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export function verifyPassword(password, stored) {
  try {
    const [algo, n, saltB64, hashB64] = String(stored).split('$');
    if (algo !== 'scrypt') return false;
    const expected = Buffer.from(hashB64, 'base64');
    const hash = crypto.scryptSync(password, Buffer.from(saltB64, 'base64'), expected.length, { N: Number(n), r: 8, p: 1 });
    return crypto.timingSafeEqual(hash, expected);
  } catch {
    return false;
  }
}

const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');

export function parseCookies(header) {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function createSession(db, userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + SESSION_DAYS * 86400000).toISOString();
  db.prepare('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run(sha(token), userId, nowIso(), expires);
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(nowIso());
  return { token, expires };
}

export function setSessionCookie(req, res, config, token, expires) {
  const secure = config.cookieSecure === 'auto' ? req.secure : config.cookieSecure;
  const parts = [`${COOKIE}=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Expires=${new Date(expires).toUTCString()}`];
  if (secure) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

export function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Expires=Thu, 01 Jan 1970 00:00:00 GMT`);
}

export function destroySession(db, req) {
  const token = parseCookies(req.headers.cookie)[COOKIE];
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(sha(token));
}

export function sessionMiddleware(db) {
  const find = db.prepare(
    'SELECT s.token, s.expires_at, u.id, u.username, u.display_name FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?',
  );
  const extend = db.prepare('UPDATE sessions SET expires_at = ? WHERE token = ?');
  return (req, _res, next) => {
    const token = parseCookies(req.headers.cookie)[COOKIE];
    if (token) {
      const row = find.get(sha(token));
      if (row && row.expires_at > nowIso()) {
        req.user = { id: row.id, username: row.username, display_name: row.display_name };
        // Ανανέωση όταν απομένουν λιγότερες από 15 ημέρες
        if (Date.parse(row.expires_at) - Date.now() < 15 * 86400000) {
          extend.run(new Date(Date.now() + SESSION_DAYS * 86400000).toISOString(), row.token);
        }
      }
    }
    next();
  };
}

// Απλός περιορισμός αποτυχημένων συνδέσεων ανά IP.
const failures = new Map();
export function loginAllowed(ip) {
  const f = failures.get(ip);
  if (!f) return true;
  if (Date.now() - f.first > 15 * 60000) {
    failures.delete(ip);
    return true;
  }
  return f.count < 10;
}
export function loginFailed(ip) {
  const f = failures.get(ip);
  if (!f || Date.now() - f.first > 15 * 60000) failures.set(ip, { count: 1, first: Date.now() });
  else f.count++;
}
export function loginSucceeded(ip) {
  failures.delete(ip);
}
