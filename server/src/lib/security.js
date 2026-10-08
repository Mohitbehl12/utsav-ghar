/**
 * Account protection: per-account lockout after repeated wrong passwords,
 * security event log, admin IP allow-list.
 */
import { db, now } from '../db.js';
import { HttpError } from './http.js';

const STEPS = [[5, 15], [10, 60], [20, 24 * 60]]; // after N failures → lock for M minutes

export function assertNotLocked(key) {
  const r = db.prepare('SELECT * FROM login_attempts WHERE key = ?').get(key);
  if (r?.locked_until && Date.parse(r.locked_until) > Date.now()) {
    const mins = Math.ceil((Date.parse(r.locked_until) - Date.now()) / 60000);
    throw new HttpError(429, `Too many wrong attempts. For your safety this account is locked for ${mins} more minute${mins === 1 ? '' : 's'}.`);
  }
}
/** Count a failure; returns true if the account is now locked. */
export function loginFailed(key, req) {
  const r = db.prepare('SELECT fails FROM login_attempts WHERE key = ?').get(key);
  const fails = (r?.fails || 0) + 1;
  const step = [...STEPS].reverse().find(([n]) => fails >= n);
  const until = step && fails === step[0] ? new Date(Date.now() + step[1] * 60000).toISOString() : null;
  db.prepare(`INSERT INTO login_attempts(key, fails, locked_until, last_at) VALUES(?,?,?,?)
    ON CONFLICT(key) DO UPDATE SET fails = excluded.fails, locked_until = COALESCE(excluded.locked_until, login_attempts.locked_until), last_at = excluded.last_at`)
    .run(key, fails, until, now());
  secEvent(until ? 'locked' : 'login_failed', key, req, until ? { until } : null);
  return !!until;
}
export const loginSucceeded = (key) => db.prepare('DELETE FROM login_attempts WHERE key = ?').run(key);

export function secEvent(kind, actor, req, detail) {
  try {
    db.prepare('INSERT INTO security_events(kind, actor, ip, user_agent, detail) VALUES(?,?,?,?,?)')
      .run(kind, String(actor).slice(0, 120), req?.ip || null, String(req?.get?.('user-agent') || '').slice(0, 200), detail ? JSON.stringify(detail).slice(0, 1000) : null);
  } catch { /* never block a request on logging */ }
}

/** Optional: only allow the admin panel from these IPs (ADMIN_ALLOWED_IPS="1.2.3.4,5.6.7.8"). */
const allowed = (process.env.ADMIN_ALLOWED_IPS || '').split(',').map((x) => x.trim()).filter(Boolean);
export function adminIpAllowed(req) {
  if (!allowed.length) return true;
  const ip = String(req.ip || '').replace(/^::ffff:/, '');
  return allowed.includes(ip);
}

/** Hidden "website" field on public forms: people never fill it, simple bots do. */
export function rejectBots(req) {
  if (req.body && typeof req.body === 'object' && req.body.website) {
    secEvent('bot_blocked', `ip:${req.ip}`, req, { path: req.path });
    throw new HttpError(400, 'Request blocked. Please try again.');
  }
}
