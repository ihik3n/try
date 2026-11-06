import path from 'node:path';
import fs from 'node:fs';

export function loadConfig(overrides = {}) {
  const dataDir = path.resolve(overrides.dataDir || process.env.DATA_DIR || './data');
  const cfg = {
    port: Number(process.env.PORT || 3000),
    host: process.env.HOST || '0.0.0.0',
    dataDir,
    dbPath: path.join(dataDir, 'app.db'),
    uploadsDir: path.join(dataDir, 'uploads'),
    photosDir: path.join(dataDir, 'photos'),
    backupsDir: path.join(dataDir, 'backups'),
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
    aiModel: process.env.AI_MODEL || 'claude-opus-5-5',
    aiEffort: process.env.AI_EFFORT || 'high',
    backupKeep: Number(process.env.BACKUP_KEEP || 14),
    backupIntervalHours: Number(process.env.BACKUP_INTERVAL_HOURS || 24),
    cookieSecure: process.env.COOKIE_SECURE === '1' ? true : process.env.COOKIE_SECURE === '0' ? false : 'auto',
    trustProxy: process.env.TRUST_PROXY ?? 'loopback, linklocal, uniquelocal',
    maxUploadMb: Number(process.env.MAX_UPLOAD_MB || 20),
    seedSample: process.env.SEED_SAMPLE !== '0',
    ...overrides,
  };
  for (const d of [cfg.dataDir, cfg.uploadsDir, cfg.photosDir, cfg.backupsDir]) fs.mkdirSync(d, { recursive: true });
  return cfg;
}
