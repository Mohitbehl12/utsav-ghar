/**
 * Security helpers shared by the server and the demo:
 *  - TOTP (RFC 6238) for admin two-step login — works with Google Authenticator,
 *    Microsoft Authenticator, Authy, 1Password … (30-second, 6-digit codes)
 *  - Password policy (length, common passwords, not your email/name)
 * Uses Web Crypto, available in modern browsers and Node 18+.
 */
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const subtle = () => globalThis.crypto.subtle;

export function base32Encode(bytes) {
  let bits = 0; let value = 0; let out = '';
  for (const b of bytes) {
    value = (value << 8) | b; bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}
export function base32Decode(str) {
  const s = String(str).toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0; let value = 0; const out = [];
  for (const c of s) {
    value = (value << 5) | B32.indexOf(c); bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return new Uint8Array(out);
}
export function newTotpSecret() {
  const b = new Uint8Array(20);
  globalThis.crypto.getRandomValues(b);
  return base32Encode(b);
}

async function hotp(secretB32, counter) {
  const key = await subtle().importKey('raw', base32Decode(secretB32), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const msg = new ArrayBuffer(8);
  const view = new DataView(msg);
  view.setUint32(0, Math.floor(counter / 2 ** 32));
  view.setUint32(4, counter >>> 0);
  const h = new Uint8Array(await subtle().sign('HMAC', key, msg));
  const o = h[h.length - 1] & 15;
  const bin = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(bin % 1e6).padStart(6, '0');
}
export const totpNow = (secret, t = Date.now()) => hotp(secret, Math.floor(t / 30000));

/** Accepts the current code and one step either side (clock drift). Returns the step used, or null. */
export async function verifyTotp(secret, code, { t = Date.now(), lastStep = -1 } = {}) {
  const c = String(code || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(c) || !secret) return null;
  const now = Math.floor(t / 30000);
  for (const step of [now, now - 1, now + 1]) {
    if (step <= lastStep) continue; // a code can't be reused
    if ((await hotp(secret, step)) === c) return step;
  }
  return null;
}
export const otpauthUrl = ({ secret, account, issuer = 'Utsav Ghar' }) =>
  `otpauth://totp/${encodeURIComponent(`${issuer}:${account}`)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;

/** Ten one-time backup codes like "7KQ2-M9XD". */
export function newBackupCodes(n = 10) {
  const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: n }, () => {
    const b = new Uint8Array(8); globalThis.crypto.getRandomValues(b);
    const s = [...b].map((x) => a[x % a.length]).join('');
    return `${s.slice(0, 4)}-${s.slice(4)}`;
  });
}

// ---------- passwords ----------
const COMMON = new Set(('123456 1234567 12345678 123456789 1234567890 password password1 password123 passw0rd qwerty qwerty123 abc123 111111 000000 iloveyou ' +
  'admin admin123 admin@123 welcome welcome1 welcome@123 letmein monkey dragon sunshine princess football india123 india@123 changeme changeme@2026 ' +
  'diwali diwali123 diwali@123 utsavghar utsav123 test123 test@123 pass@123 asdfgh zxcvbn 987654321 user123 qwertyuiop 1q2w3e4r baseball shadow master ' +
  'hello123 jaishreeram krishna ganesh om123 mohit123 shubh123').split(' '));

/**
 * Returns an error message, or '' when the password is acceptable.
 * Customers: 8+ characters; admins: 10+ with a number and a letter.
 */
export function passwordProblem(pw, { min = 8, email = '', name = '', admin = false } = {}) {
  const p = String(pw || '');
  if (p.length < min) return `Use at least ${min} characters`;
  if (p.length > 128) return 'Use at most 128 characters';
  const low = p.toLowerCase();
  if (COMMON.has(low) || COMMON.has(low.replace(/[^a-z0-9@]/g, ''))) return 'This password is too common — choose something harder to guess';
  if (/^(.)\1+$/.test(p) || /^(0123456789|1234567890|abcdefghij)/.test(low)) return 'Avoid repeated or sequential characters';
  const user = String(email).toLowerCase().split('@')[0];
  if (user && user.length >= 4 && low.includes(user)) return "Don't use your email in your password";
  const first = String(name).toLowerCase().split(/\s+/)[0];
  if (first && first.length >= 4 && low.includes(first)) return "Don't use your name in your password";
  if (admin && !(/[a-z]/i.test(p) && /\d/.test(p))) return 'Use letters and at least one number';
  return '';
}

/** 0–4 strength score for the meter shown under password fields. */
export function passwordScore(pw) {
  const p = String(pw || '');
  let s = 0;
  if (p.length >= 8) s++;
  if (p.length >= 12) s++;
  if (/[a-z]/.test(p) && /[A-Z]/.test(p)) s++;
  if (/\d/.test(p) && /[^a-z0-9]/i.test(p)) s++;
  if (COMMON.has(p.toLowerCase())) s = 0;
  return Math.min(4, s);
}
