import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { config } from '../config.js';
import { db } from '../db.js';
import { HttpError } from './http.js';
import { adminIpAllowed } from './security.js';
import { areaFor, permission, ROLE_KEYS } from '../../../shared/roles.js';

const cookieBase = {
  httpOnly: true,
  sameSite: 'lax',
  secure: config.isProd,
  path: '/',
};

export const hashPassword = (pw) => bcrypt.hash(pw, 12);
export const checkPassword = (pw, hash) => bcrypt.compare(pw, hash);
// Used when an account doesn't exist so login timing doesn't reveal which emails are registered.
export const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 12);

// ---- customers ------------------------------------------------------------
export function setUserSession(res, user) {
  const v = db.prepare('SELECT token_version FROM users WHERE id = ?').get(user.id)?.token_version || 0;
  const token = jwt.sign({ sub: user.id, kind: 'user', v }, config.jwtSecret, { expiresIn: '30d' });
  res.cookie('sa_session', token, { ...cookieBase, maxAge: 30 * 864e5 });
}
export function clearUserSession(res) {
  res.clearCookie('sa_session', cookieBase);
}

/** Attaches req.user if a valid customer session exists (never throws). */
export function loadUser(req, _res, next) {
  const t = req.cookies?.sa_session;
  if (t) {
    try {
      const p = jwt.verify(t, config.jwtSecret);
      if (p.kind === 'user') {
        const u = db.prepare('SELECT id, name, email, phone, token_version FROM users WHERE id = ? AND is_active = 1').get(p.sub);
        // token_version changes on password change / "sign out everywhere" → old cookies stop working
        if (u && (p.v || 0) === u.token_version) { delete u.token_version; req.user = u; }
      }
    } catch {
      /* expired or tampered — treat as logged out */
    }
  }
  next();
}
export function requireUser(req, _res, next) {
  if (!req.user) return next(new HttpError(401, 'Please sign in to continue.'));
  next();
}

// ---- admins (separate cookie, separate secret, shorter lifetime) ---------
export function setAdminSession(res, admin) {
  const v = db.prepare('SELECT token_version FROM admin_users WHERE id = ?').get(admin.id)?.token_version || 0;
  const token = jwt.sign({ sub: admin.id, kind: 'admin', role: admin.role, v }, config.adminJwtSecret, { expiresIn: '12h' });
  res.cookie('sa_admin', token, { ...cookieBase, sameSite: 'strict', maxAge: 12 * 36e5 });
}
export function clearAdminSession(res) {
  res.clearCookie('sa_admin', { ...cookieBase, sameSite: 'strict' });
}
export function requireAdmin(...roles) {
  return (req, _res, next) => {
    const t = req.cookies?.sa_admin;
    if (!t) return next(new HttpError(401, 'Admin sign-in required.'));
    let a = null;
    try {
      const p = jwt.verify(t, config.adminJwtSecret);
      if (p.kind !== 'admin') throw new Error('wrong token');
      a = db.prepare('SELECT id, name, email, role, token_version, must_change_password, totp_enabled FROM admin_users WHERE id = ? AND is_active = 1').get(p.sub);
      if (!a || (p.v || 0) !== a.token_version) throw new Error('inactive');
    } catch {
      return next(new HttpError(401, 'Admin session expired. Please sign in again.'));
    }
    if (!adminIpAllowed(req)) return next(new HttpError(403, 'The admin panel is not available from this network.'));
    delete a.token_version;
    a.must_change_password = !!a.must_change_password;
    a.totp_enabled = !!a.totp_enabled;
    if (roles.length && !roles.includes(a.role)) {
      // Newer roles (legal, dealer_admin, finance, operations, readonly) pass "manager-level"
      // routes when the central permission map gives them that area (see adminGate).
      const read = ['GET', 'HEAD'].includes(req.method);
      const newer = !['owner', 'manager', 'support'].includes(a.role);
      const ok = newer && roles.includes('manager') && (req.adminPerm === 'edit' || (req.adminPerm === 'view' && read));
      if (!ok) return next(new HttpError(403, 'You do not have permission for this action.'));
    }
    req.admin = a;
    return next();
  };
}

/**
 * Central gate for every /api/admin request: signed in, password changed, and the
 * role's permission for the area (view = read only). Routers add finer checks.
 */
export function adminGate(req, res, next) {
  if (/^\/(login|login\/2fa|logout)$/.test(req.path)) return next();
  return requireAdmin()(req, res, (err) => {
    if (err) return next(err);
    let area = areaFor(req.path);
    // money decisions on an order are payment work (Finance), not order handling
    if (/^\/orders\/\d+\/action$/.test(req.path) && ['confirm_payment', 'reject_payment', 'mark_refunded'].includes(req.body?.action)) area = 'payments';
    if (req.admin.must_change_password && area !== 'self') return next(new HttpError(403, 'Please change the default password first.', { code: 'MUST_CHANGE_PASSWORD' }));
    if (!ROLE_KEYS.includes(req.admin.role)) return next(new HttpError(403, 'Your admin role is not recognised.'));
    let perm = permission(req.admin.role, area);
    if (area === 'other') perm = ['owner', 'manager'].includes(req.admin.role) ? 'edit' : null;
    if (!perm) return next(new HttpError(403, 'Your role does not have access to this page.', { code: 'NO_ACCESS' }));
    if (perm === 'view' && !['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next(new HttpError(403, 'Your role can view this page but cannot make changes.', { code: 'READ_ONLY' }));
    req.adminPerm = perm;
    req.adminArea = area;
    return next();
  });
}

// ---- CSRF: double-submit cookie ------------------------------------------
// Cookies are SameSite, and on top of that every state-changing request must
// echo the readable `sa_csrf` cookie in the X-CSRF-Token header.
export function csrf(req, res, next) {
  let token = req.cookies?.sa_csrf;
  if (!token) {
    token = crypto.randomBytes(24).toString('hex');
    res.cookie('sa_csrf', token, { sameSite: 'lax', secure: config.isProd, path: '/', httpOnly: false });
  }
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.path.startsWith('/api/payments/webhook')) return next(); // signed by gateway instead
  if (req.path === '/api/webhooks/courier') return next(); // shared-secret header instead
  const sent = req.get('x-csrf-token');
  if (!sent || !req.cookies?.sa_csrf || sent !== req.cookies.sa_csrf) {
    return next(new HttpError(403, 'Security check failed. Please refresh the page and try again.'));
  }
  next();
}

// Opaque per-order token so guests can view & pay for their own order only.
export const newAccessToken = () => crypto.randomBytes(24).toString('base64url');
export const hashToken = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');
export function tokenMatches(token, hash) {
  if (!token || !hash) return false;
  const a = Buffer.from(hashToken(token));
  const b = Buffer.from(hash);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
