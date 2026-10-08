/**
 * One-time codes (sign-up verification, password reset, email change).
 * 6 digits · valid 10 minutes · 5 wrong tries · resend after 30 s · max 5 codes per hour per target.
 * Codes are stored only as salted hashes. In development the code is returned as `dev_otp`
 * so tests and the preview can complete the flow; in production it is only sent.
 */
import crypto from 'node:crypto';
import { db, now } from '../db.js';
import { config } from '../config.js';
import { HttpError } from './http.js';
import { notifyContact } from './notify.js';

db.exec(`CREATE TABLE IF NOT EXISTS otp_codes (
  id         INTEGER PRIMARY KEY,
  purpose    TEXT NOT NULL,                 -- signup | reset_user | reset_dealer | email_change
  target     TEXT NOT NULL,                 -- normalised phone / email / user id
  code_hash  TEXT NOT NULL,
  ref        TEXT NOT NULL,
  data       TEXT,                          -- JSON bound to the code (e.g. the email it was sent to)
  tries      INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL,
  sent_at    TEXT NOT NULL,
  window_start TEXT NOT NULL,
  window_sends INTEGER NOT NULL DEFAULT 1,
  UNIQUE(purpose, target)
)`);

export const OTP_RULES = { digits: 6, ttlMin: 10, maxTries: 5, resendSec: 30, perHour: 5 };
const hash = (purpose, target, code) => crypto.createHmac('sha256', config.jwtSecret).update(`${purpose}|${target}|${code}`).digest('hex');
const mask = (s) => (String(s).includes('@') ? String(s).replace(/^(.{2}).*(@.*)$/, '$1•••$2') : `******${String(s).slice(-4)}`);

/** Create (or replace) a code and send it. Returns { ref, sent_to, resend_in, dev_otp? }. */
export async function sendOtp({ purpose, target, email, phone, subject, text, data = null, silent = false }) {
  const t = Date.now();
  const row = db.prepare('SELECT * FROM otp_codes WHERE purpose = ? AND target = ?').get(purpose, target);
  if (row) {
    const wait = OTP_RULES.resendSec * 1000 - (t - Date.parse(row.sent_at));
    if (wait > 0) throw new HttpError(429, `Please wait ${Math.ceil(wait / 1000)} seconds before asking for a new code.`, { retry_after: Math.ceil(wait / 1000) });
    const inWindow = t - Date.parse(row.window_start) < 3600e3;
    if (inWindow && row.window_sends >= OTP_RULES.perHour) throw new HttpError(429, 'Too many codes requested. Please try again in an hour or contact support.');
  }
  const code = String(crypto.randomInt(0, 10 ** OTP_RULES.digits)).padStart(OTP_RULES.digits, '0');
  const ref = `OTP-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  const inWindow = row && t - Date.parse(row.window_start) < 3600e3;
  db.prepare(`INSERT INTO otp_codes(purpose, target, code_hash, ref, data, tries, expires_at, sent_at, window_start, window_sends) VALUES(?,?,?,?,?,0,?,?,?,1)
    ON CONFLICT(purpose, target) DO UPDATE SET code_hash = excluded.code_hash, ref = excluded.ref, data = excluded.data, tries = 0, expires_at = excluded.expires_at, sent_at = excluded.sent_at,
      window_start = ?, window_sends = ?`)
    .run(purpose, target, hash(purpose, target, code), ref, data ? JSON.stringify(data) : null, new Date(t + OTP_RULES.ttlMin * 6e4).toISOString(), new Date(t).toISOString(), new Date(t).toISOString(),
      inWindow ? row.window_start : new Date(t).toISOString(), inWindow ? row.window_sends + 1 : 1);
  if (!silent) await notifyContact({ email: email || null, phone: phone || null, template: `otp_${purpose}`, subject, text: text.replace('{{code}}', code), storeText: text.replace('{{code}}', '••••••') }).catch(() => {});
  return { ref, sent_to: [phone && mask(phone), email && mask(email)].filter(Boolean).join(' and '), resend_in: OTP_RULES.resendSec, expires_in_min: OTP_RULES.ttlMin, ...(config.showTestCodes ? { dev_otp: code } : {}) };
}

/** Check a code. Throws a field error ('otp') when wrong/expired. Consumes the code on success and returns its data. */
export function verifyOtp({ purpose, target, code, field = 'otp', check = null }) {
  const fail = (msg, status = 400) => new HttpError(status, msg, { fields: { [field]: msg } });
  if (!/^\d{6}$/.test(String(code || ''))) throw fail('Enter the 6-digit code.');
  const row = db.prepare('SELECT * FROM otp_codes WHERE purpose = ? AND target = ?').get(purpose, target);
  if (!row) throw fail('Ask for a code first.');
  if (Date.parse(row.expires_at) < Date.now()) throw fail('This code has expired. Ask for a new one.');
  if (row.tries >= OTP_RULES.maxTries) throw fail('Too many wrong codes. Ask for a new one.', 429);
  const ok = crypto.timingSafeEqual(Buffer.from(row.code_hash), Buffer.from(hash(purpose, target, String(code))));
  if (!ok) {
    db.prepare('UPDATE otp_codes SET tries = tries + 1 WHERE id = ?').run(row.id);
    const left = OTP_RULES.maxTries - row.tries - 1;
    throw fail(left > 0 ? `Wrong code. ${left} ${left === 1 ? 'try' : 'tries'} left.` : 'Too many wrong codes. Ask for a new one.', left > 0 ? 400 : 429);
  }
  const data = row.data ? JSON.parse(row.data) : null;
  if (check) { const msg = check(data); if (msg) throw fail(msg); } // e.g. code was sent for another email — keep the code
  db.prepare('DELETE FROM otp_codes WHERE id = ?').run(row.id);
  return { ref: row.ref, data, verified_at: now() };
}

