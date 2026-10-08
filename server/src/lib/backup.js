/**
 * Database backups: a consistent copy of the live SQLite database (online backup
 * API — safe while the shop is running), once a day, keeping the last 14.
 * Copy the backups folder off the server too (e.g. rclone to Google Drive / S3).
 *   npm run backup            # make one now
 *   Restore: stop the server, copy a backup over DB_PATH, start the server.
 */
import fs from 'node:fs';
import path from 'node:path';
import { db } from '../db.js';
import { config } from '../config.js';

export const BACKUP_DIR = path.resolve(config.root, process.env.BACKUP_DIR || 'backups');
const KEEP = Number(process.env.BACKUP_KEEP || 14);

export async function backupNow() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true, mode: 0o700 });
  const file = path.join(BACKUP_DIR, `utsav-ghar-${new Date().toISOString().replace(/[:.]/g, '-')}.db`);
  await db.backup(file);
  fs.chmodSync(file, 0o600); // readable by the server user only
  const all = fs.readdirSync(BACKUP_DIR).filter((f) => /^utsav-ghar-.*\.db$/.test(f)).sort();
  for (const old of all.slice(0, Math.max(0, all.length - KEEP))) fs.rmSync(path.join(BACKUP_DIR, old));
  db.prepare("INSERT INTO settings(key, value) VALUES('last_backup_at', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(new Date().toISOString());
  return file;
}

export function startBackupJob() {
  const tick = () => {
    const last = db.prepare("SELECT value FROM settings WHERE key = 'last_backup_at'").get()?.value;
    if (!last || Date.now() - Date.parse(last) > 23 * 36e5) backupNow().catch((e) => console.error('backup failed', e));
  };
  setTimeout(tick, 60e3).unref?.();
  setInterval(tick, 60 * 6e4).unref?.();
}
