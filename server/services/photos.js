// Φωτογραφίες συνταγών και προϊόντων: αποθήκευση στον φάκελο photos, ένα αρχείο ανά συνταγή/προϊόν.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const PHOTO_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
export const SAFE_NAME = /^[a-z]\d+-[a-f0-9]{12}\.(jpg|png|webp)$/;

export function photoPath(config, name) {
  if (!name || !SAFE_NAME.test(name)) return null;
  return path.join(config.photosDir, name);
}

export function savePhoto(config, prefix, id, buffer, mime) {
  const ext = PHOTO_TYPES[mime];
  if (!ext) return null;
  const name = `${prefix}${id}-${crypto.randomBytes(6).toString('hex')}.${ext}`;
  fs.writeFileSync(path.join(config.photosDir, name), buffer);
  return name;
}

export function removePhoto(config, name) {
  const p = photoPath(config, name);
  if (!p) return;
  try {
    fs.unlinkSync(p);
  } catch {
    /* ήδη διαγραμμένη */
  }
}

/** Αντίγραφο φωτογραφίας για νέα συνταγή/προϊόν (π.χ. «Αντιγραφή»). */
export function copyPhoto(config, name, prefix, newId) {
  const p = photoPath(config, name);
  if (!p || !fs.existsSync(p)) return null;
  const ext = path.extname(name).slice(1);
  const copy = `${prefix}${newId}-${crypto.randomBytes(6).toString('hex')}.${ext}`;
  fs.copyFileSync(p, path.join(config.photosDir, copy));
  return copy;
}

/** Διαγράφει αρχεία που δεν ανήκουν πλέον σε καμία συνταγή/προϊόν. */
export function cleanupOrphanPhotos(db, config) {
  const used = new Set(
    db
      .prepare('SELECT photo FROM recipes WHERE photo IS NOT NULL UNION SELECT photo FROM products WHERE photo IS NOT NULL')
      .all()
      .map((r) => r.photo),
  );
  for (const f of fs.readdirSync(config.photosDir)) if (!used.has(f)) removePhoto(config, f);
}
