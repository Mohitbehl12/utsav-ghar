import { Router } from 'express';
import { z } from 'zod';
import path from 'node:path';
import fs from 'node:fs';
import { db, now, parseJSON } from '../db.js';
import { wrap, parse, HttpError } from '../lib/http.js';
import { checkPassword, hashPassword, setAdminSession, clearAdminSession, requireAdmin, DUMMY_HASH } from '../lib/auth.js';
import { PRODUCT_SELECT, serializeProduct, loadOffers, getSettings, setSettings, headlineOffer, loadZones } from '../lib/catalog.js';
import { SEGMENTS } from '../../../shared/festivals.js';
import { sendCartReminder } from '../lib/reminders.js';
import { config } from '../config.js';
import { orderDetail, applyAdminAction, getOrderRow } from '../lib/orders.js';
import { imageUpload, saveImage, PRIVATE_DIR } from '../lib/uploads.js';
import { notifyOrder } from '../lib/notify.js';
import { audit } from '../lib/audit.js';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { assertNotLocked, loginFailed, loginSucceeded, secEvent, adminIpAllowed } from '../lib/security.js';
import { verifyTotp, newTotpSecret, otpauthUrl, newBackupCodes, passwordProblem } from '../../../shared/security.js';
import { reportPurchase, conversionsStatus } from '../lib/conversions.js';
import { returnAction, refundAction, returnView, refundView } from '../lib/returns.js';
import { preview as settlementPreview, createSettlement, settlementAction, settlementView } from '../lib/settlements.js';
import { can, ADMIN_ROLES, ROLE_KEYS, PERMISSIONS, ACTIONS } from '../../../shared/roles.js';
import { isOfferLive, isProductEligible, offerMaxPercent } from '../../../shared/pricing.js';
import { afterPaymentConfirmed, syncFromAdmin } from '../lib/dealers.js';

const r = Router();
const slug = z.string().trim().toLowerCase().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and hyphens').max(80);
const rupees = z.coerce.number().min(0).max(10_000_000).transform((v) => Math.round(v * 100)); // accept ₹, store paise

// ---- auth -----------------------------------------------------------------------
const adminOut = (a) => ({ id: a.id, name: a.name, email: a.email, role: a.role, role_label: ADMIN_ROLES[a.role]?.label || a.role, must_change_password: !!a.must_change_password, totp_enabled: !!a.totp_enabled,
  perms: a.role === 'owner' ? 'all' : PERMISSIONS[a.role] || {}, actions: Object.keys(ACTIONS).filter((k) => can(a.role, k)) });
const sha = (s) => crypto.createHash('sha256').update(String(s).toUpperCase().replace(/[^A-Z0-9]/g, '')).digest('hex');

function finishLogin(req, res, a) {
  loginSucceeded(`admin:${a.email.toLowerCase()}`);
  db.prepare('UPDATE admin_users SET last_login_at = ? WHERE id = ?').run(now(), a.id);
  setAdminSession(res, a);
  req.admin = a;
  audit(req, 'login', 'admin', a.id, { two_factor: !!a.totp_enabled });
  secEvent('login_ok', `admin:${a.id}`, req);
  res.json({ admin: adminOut(a) });
}

r.post(
  '/login',
  wrap(async (req, res) => {
    if (!adminIpAllowed(req)) throw new HttpError(403, 'The admin panel is not available from this network.');
    const b = parse(z.object({ email: z.string().trim().email(), password: z.string().min(1).max(128) }), req.body);
    const key = `admin:${b.email.toLowerCase()}`;
    assertNotLocked(key);
    const a = db.prepare('SELECT * FROM admin_users WHERE email = ? AND is_active = 1').get(b.email);
    const ok = await checkPassword(b.password, a?.password_hash || DUMMY_HASH);
    if (!a || !ok) {
      const locked = loginFailed(key, req);
      throw new HttpError(locked ? 429 : 401, locked ? 'Too many wrong attempts. This account is locked for 15 minutes.' : 'Incorrect email or password.');
    }
    if (a.totp_enabled) {
      // Step 2: a short-lived ticket; the session cookie is only issued after the 6-digit code.
      const ticket = jwt.sign({ sub: a.id, kind: 'admin-2fa' }, config.adminJwtSecret, { expiresIn: '5m' });
      return res.json({ twoFactor: true, ticket });
    }
    finishLogin(req, res, a);
  })
);
r.post(
  '/login/2fa',
  wrap(async (req, res) => {
    const b = parse(z.object({ ticket: z.string().max(2000), code: z.string().trim().max(20) }), req.body);
    let p;
    try { p = jwt.verify(b.ticket, config.adminJwtSecret); } catch { throw new HttpError(401, 'Sign-in expired. Please enter your password again.'); }
    if (p.kind !== 'admin-2fa') throw new HttpError(401, 'Sign-in expired. Please enter your password again.');
    const a = db.prepare('SELECT * FROM admin_users WHERE id = ? AND is_active = 1').get(p.sub);
    if (!a) throw new HttpError(401, 'Sign-in expired.');
    const key = `admin:${a.email.toLowerCase()}`;
    assertNotLocked(key);
    const step = await verifyTotp(a.totp_secret, b.code, { lastStep: a.totp_last_step });
    if (step != null) {
      db.prepare('UPDATE admin_users SET totp_last_step = ? WHERE id = ?').run(step, a.id);
      return finishLogin(req, res, a);
    }
    // backup code (single use)
    const codes = parseJSON(a.backup_codes, []);
    const h = sha(b.code);
    if (b.code.length >= 8 && codes.includes(h)) {
      db.prepare('UPDATE admin_users SET backup_codes = ? WHERE id = ?').run(JSON.stringify(codes.filter((c) => c !== h)), a.id);
      secEvent('backup_code_used', `admin:${a.id}`, req, { left: codes.length - 1 });
      return finishLogin(req, res, a);
    }
    const locked = loginFailed(key, req);
    throw new HttpError(locked ? 429 : 401, locked ? 'Too many wrong codes. This account is locked for 15 minutes.' : 'That code is not correct. Check the time on your phone and try again.');
  })
);
r.post('/logout', (req, res) => {
  clearAdminSession(res);
  res.json({ ok: true });
});

r.use(requireAdmin());
// Until the first-login password is changed, nothing else in the admin panel works.
r.use((req, res, next) => {
  if (req.admin.must_change_password && !['/me', '/me/password'].includes(req.path)) {
    return next(new HttpError(403, 'Please change the default password first.', { code: 'MUST_CHANGE_PASSWORD' }));
  }
  next();
});
r.get('/me', (req, res) => res.json({ admin: adminOut(req.admin) }));
// Admin user manual (PDFs + screenshots). Kept out of the public folder: only signed-in admins can open it.
const MANUAL_DIR = path.resolve(new URL('.', import.meta.url).pathname, '../../../manuals/web-admin');
r.get(['/manual/:file', '/manual/img/:file'], (req, res, next) => {
  const f = String(req.params.file);
  if (!/^[A-Za-z0-9_-]+\.(pdf|webp)$/.test(f)) return next(new HttpError(404, 'Not found'));
  const file = path.join(MANUAL_DIR, f.endsWith('.webp') ? 'img' : '', f);
  if (!fs.existsSync(file)) return next(new HttpError(404, 'Manual file not found. Run: python3 manuals/build_pdf.py'));
  res.set('Cache-Control', 'private, max-age=3600');
  if (f.endsWith('.pdf') && req.query.download) res.attachment(f);
  res.sendFile(file);
});
r.put(
  '/me/password',
  wrap(async (req, res) => {
    const b = parse(z.object({ current: z.string().max(128), next: z.string().max(128) }), req.body);
    const a = db.prepare('SELECT * FROM admin_users WHERE id = ?').get(req.admin.id);
    if (!(await checkPassword(b.current, a.password_hash))) throw new HttpError(400, 'Current password is incorrect.', { fields: { current: 'Current password is incorrect' } });
    const problem = passwordProblem(b.next, { min: 10, email: a.email, name: a.name, admin: true });
    if (problem) throw new HttpError(400, problem, { fields: { next: problem } });
    if (await checkPassword(b.next, a.password_hash)) throw new HttpError(400, 'Choose a password different from the current one.', { fields: { next: 'Must be different from the current password' } });
    // New version → every other device is signed out; this one gets a fresh cookie.
    db.prepare('UPDATE admin_users SET password_hash = ?, must_change_password = 0, password_changed_at = ?, token_version = token_version + 1 WHERE id = ?')
      .run(await hashPassword(b.next), now(), a.id);
    setAdminSession(res, a);
    audit(req, 'change_password', 'admin', a.id);
    secEvent('password_changed', `admin:${a.id}`, req);
    res.json({ ok: true });
  })
);
r.post('/me/logout-all', (req, res) => {
  db.prepare('UPDATE admin_users SET token_version = token_version + 1 WHERE id = ?').run(req.admin.id);
  audit(req, 'logout_all', 'admin', req.admin.id);
  secEvent('logout_all', `admin:${req.admin.id}`, req);
  clearAdminSession(res);
  res.json({ ok: true });
});
// Two-step login (authenticator app)
r.post('/me/2fa/setup', wrap(async (req, res) => {
  const secret = newTotpSecret();
  db.prepare('UPDATE admin_users SET totp_secret = ?, totp_enabled = 0 WHERE id = ?').run(secret, req.admin.id);
  res.json({ secret, otpauth: otpauthUrl({ secret, account: req.admin.email }) });
}));
r.post('/me/2fa/enable', wrap(async (req, res) => {
  const { code } = parse(z.object({ code: z.string().trim().max(10) }), req.body);
  const a = db.prepare('SELECT * FROM admin_users WHERE id = ?').get(req.admin.id);
  const step = await verifyTotp(a.totp_secret, code);
  if (step == null) throw new HttpError(400, 'That code is not correct. Enter the 6-digit code shown in your authenticator app.', { fields: { code: 'Wrong code' } });
  const backup = newBackupCodes(10);
  db.prepare('UPDATE admin_users SET totp_enabled = 1, totp_last_step = ?, backup_codes = ? WHERE id = ?').run(step, JSON.stringify(backup.map(sha)), a.id);
  audit(req, '2fa_enabled', 'admin', a.id);
  secEvent('2fa_enabled', `admin:${a.id}`, req);
  res.json({ ok: true, backupCodes: backup });
}));
r.post('/me/2fa/disable', wrap(async (req, res) => {
  const b = parse(z.object({ password: z.string().max(128), code: z.string().trim().max(20) }), req.body);
  const a = db.prepare('SELECT * FROM admin_users WHERE id = ?').get(req.admin.id);
  if (!(await checkPassword(b.password, a.password_hash))) throw new HttpError(400, 'Password is incorrect.');
  if ((await verifyTotp(a.totp_secret, b.code, { lastStep: a.totp_last_step })) == null) throw new HttpError(400, 'Authenticator code is not correct.');
  db.prepare("UPDATE admin_users SET totp_enabled = 0, totp_secret = NULL, backup_codes = '[]' WHERE id = ?").run(a.id);
  audit(req, '2fa_disabled', 'admin', a.id);
  secEvent('2fa_disabled', `admin:${a.id}`, req);
  res.json({ ok: true });
}));

// Security overview for the owner
r.get('/security', requireAdmin('owner', 'manager'), wrap(async (req, res) => {
  const since = new Date(Date.now() - 30 * 864e5).toISOString();
  const admins = db.prepare('SELECT id, name, email, role, is_active, totp_enabled, must_change_password, last_login_at, password_changed_at FROM admin_users ORDER BY id').all();
  const ev = (kinds, limit = 30) => db.prepare(`SELECT kind, actor, ip, user_agent, detail, created_at FROM security_events WHERE kind IN (${kinds.map(() => '?').join(',')}) AND created_at >= ? ORDER BY id DESC LIMIT ?`).all(...kinds, since, limit);
  const locked = db.prepare('SELECT key, fails, locked_until FROM login_attempts WHERE locked_until > ? ORDER BY locked_until DESC').all(now());
  const defaultPw = await checkPassword(config.seedAdmin.password, db.prepare('SELECT password_hash FROM admin_users WHERE id = ?').get(req.admin.id).password_hash);
  const lastBackup = db.prepare("SELECT value FROM settings WHERE key = 'last_backup_at'").get()?.value || null;
  res.json({
    checks: [
      { ok: config.isProd, label: 'Running in production mode (HTTPS redirect, secure cookies, HSTS)', fix: 'Set NODE_ENV=production on your server.' },
      { ok: !config.testMode, label: 'TEST MODE is off (codes are not shown on screen)', fix: 'Remove TEST_MODE before real customers use the site.' },
      { ok: !defaultPw, label: 'Default admin password changed', fix: 'Admin → Security → Change password.' },
      { ok: admins.filter((a) => a.is_active && a.role === 'owner').every((a) => a.totp_enabled), label: 'Two-step login (authenticator app) on owner accounts', fix: 'Admin → Security → Turn on two-step login.' },
      { ok: !!config.razorpay.webhookSecret || !config.razorpay.keyId, label: 'Payment webhook signature secret set (if using Razorpay)', fix: 'Set RAZORPAY_WEBHOOK_SECRET in .env.' },
      { ok: !!lastBackup && Date.now() - Date.parse(lastBackup) < 2 * 864e5, label: 'Database backed up in the last 2 days', fix: 'Backups run daily automatically; or run npm run backup.' },
      { ok: !!process.env.ADMIN_ALLOWED_IPS, label: 'Admin panel limited to your IP addresses (optional)', fix: 'Set ADMIN_ALLOWED_IPS in .env.', optional: true },
    ],
    admins, locked, lastBackup,
    logins: ev(['login_ok']), failures: ev(['login_failed', 'locked', 'backup_code_used'], 50),
    changes: ev(['password_changed', 'logout_all', '2fa_enabled', '2fa_disabled', 'account_deleted', 'data_exported'], 30),
  });
}));
// ---- admin users & roles (owner only — area 'admins') -------------------------------------
const tempPassword = () => `Ug-${crypto.randomBytes(4).toString('hex')}-${crypto.randomBytes(3).toString('hex').toUpperCase()}!`;
const adminRow = (id) => db.prepare('SELECT id, name, email, role, is_active, totp_enabled, must_change_password, last_login_at, created_at FROM admin_users WHERE id = ?').get(id);
const activeOwners = () => db.prepare("SELECT COUNT(*) n FROM admin_users WHERE role = 'owner' AND is_active = 1").get().n;
r.get('/admins', (req, res) => {
  res.json({ roles: ADMIN_ROLES, permissions: PERMISSIONS, actions: ACTIONS,
    items: db.prepare('SELECT id, name, email, role, is_active, totp_enabled, must_change_password, last_login_at, created_at FROM admin_users ORDER BY is_active DESC, id').all() });
});
r.post('/admins', wrap(async (req, res) => {
  const b = parse(z.object({ name: z.string().trim().min(2, 'Enter the full name').max(80), email: z.string().trim().email('Enter a valid email').max(200), role: z.enum(ROLE_KEYS) }), req.body);
  if (db.prepare('SELECT 1 FROM admin_users WHERE email = ?').get(b.email)) throw new HttpError(409, 'An admin with this email already exists.', { fields: { email: 'Already an admin' } });
  const pw = tempPassword();
  const id = db.prepare('INSERT INTO admin_users(name, email, password_hash, role, must_change_password, created_by) VALUES(?,?,?,?,1,?)').run(b.name, b.email, await hashPassword(pw), b.role, req.admin.id).lastInsertRowid;
  audit(req, 'admin_created', 'admin', id, { email: b.email, role: b.role });
  secEvent('admin_created', `admin:${req.admin.id}`, req, { id, role: b.role });
  res.status(201).json({ admin: adminRow(id), temporary_password: pw });
}));
r.put('/admins/:id', wrap((req, res) => {
  const b = parse(z.object({ name: z.string().trim().min(2).max(80).optional(), role: z.enum(ROLE_KEYS).optional(), is_active: z.boolean().optional() }), req.body);
  const a = adminRow(Number(req.params.id));
  if (!a) throw new HttpError(404, 'Admin not found.');
  if (a.id === req.admin.id && ((b.role && b.role !== a.role) || b.is_active === false)) throw new HttpError(400, 'You cannot change your own role or disable yourself. Ask another owner.');
  const losingOwner = a.role === 'owner' && a.is_active && ((b.role && b.role !== 'owner') || b.is_active === false);
  if (losingOwner && activeOwners() <= 1) throw new HttpError(400, 'Keep at least one active owner.');
  const role = b.role ?? a.role;
  const active = b.is_active == null ? !!a.is_active : b.is_active;
  const signOut = role !== a.role || active !== !!a.is_active; // role or access changed → old sessions end
  db.prepare('UPDATE admin_users SET name = ?, role = ?, is_active = ?, disabled_at = ?, token_version = token_version + ? WHERE id = ?')
    .run(b.name ?? a.name, role, active ? 1 : 0, active ? null : now(), signOut ? 1 : 0, a.id);
  audit(req, 'admin_updated', 'admin', a.id, { before: { role: a.role, is_active: !!a.is_active }, after: b });
  res.json({ admin: adminRow(a.id) });
}));
r.post('/admins/:id/reset-password', wrap(async (req, res) => {
  const a = adminRow(Number(req.params.id));
  if (!a) throw new HttpError(404, 'Admin not found.');
  if (a.id === req.admin.id) throw new HttpError(400, 'Use Security → Change password for your own account.');
  const pw = tempPassword();
  db.prepare('UPDATE admin_users SET password_hash = ?, must_change_password = 1, token_version = token_version + 1 WHERE id = ?').run(await hashPassword(pw), a.id);
  db.prepare('DELETE FROM login_attempts WHERE key = ?').run(`admin:${String(a.email).toLowerCase()}`);
  audit(req, 'admin_password_reset', 'admin', a.id);
  res.json({ ok: true, temporary_password: pw });
}));

r.post('/security/unlock', requireAdmin('owner'), wrap((req, res) => {
  const { key } = parse(z.object({ key: z.string().max(220) }), req.body);
  db.prepare('DELETE FROM login_attempts WHERE key = ?').run(key);
  audit(req, 'unlock', 'login', key);
  res.json({ ok: true });
}));

// ---- dashboard ----------------------------------------------------------------------
r.get('/stats', (req, res) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const paid = "payment_status = 'confirmed' AND status != 'cancelled'";
  const one = (sql, ...a) => db.prepare(sql).get(...a);
  const days = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 864e5);
    const e = new Date(d.getTime() + 864e5);
    const row = one(`SELECT COALESCE(SUM(total),0) s, COUNT(*) n FROM orders WHERE ${paid} AND created_at >= ? AND created_at < ?`, d.toISOString(), e.toISOString());
    days.push({ date: d.toISOString().slice(0, 10), sales: row.s, orders: row.n });
  }
  const gp = one(`SELECT COALESCE(SUM(oi.line_total - oi.discount_share - oi.unit_cost * oi.qty), 0) v FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE o.payment_status = 'confirmed' AND o.status != 'cancelled'`).v;
  res.json({
    grossProfit: gp,
    totalSales: one(`SELECT COALESCE(SUM(total),0) v FROM orders WHERE ${paid}`).v,
    todaySales: one(`SELECT COALESCE(SUM(total),0) v FROM orders WHERE ${paid} AND created_at >= ?`, today.toISOString()).v,
    orders: one('SELECT COUNT(*) v FROM orders').v,
    todayOrders: one('SELECT COUNT(*) v FROM orders WHERE created_at >= ?', today.toISOString()).v,
    pendingPayments: one("SELECT COUNT(*) v FROM orders WHERE payment_status IN ('verification_pending') AND status != 'cancelled'").v,
    awaitingPayment: one("SELECT COUNT(*) v FROM orders WHERE payment_status = 'awaiting_payment' AND status != 'cancelled'").v,
    toShip: one("SELECT COUNT(*) v FROM orders WHERE status IN ('payment_confirmed','processing')").v,
    products: one('SELECT COUNT(*) v FROM products WHERE is_active = 1').v,
    customers: one('SELECT COUNT(*) v FROM users').v,
    lowStock: db.prepare(`SELECT p.id, p.name, i.stock, i.low_stock_threshold FROM products p JOIN inventory i ON i.product_id = p.id WHERE p.is_active = 1 AND i.stock <= i.low_stock_threshold ORDER BY i.stock LIMIT 10`).all(),
    activeOffers: loadOffers().filter((o) => isOfferLive(o)).length,
    pendingReviews: one("SELECT COUNT(*) v FROM reviews WHERE status = 'pending'").v,
    salesByDay: days,
    recentOrders: db.prepare('SELECT order_number, customer_name, total, payment_status, status, created_at FROM orders ORDER BY id DESC LIMIT 8').all(),
    topProducts: db.prepare(`SELECT i.product_name name, SUM(i.qty) qty, SUM(i.line_total) revenue FROM order_items i JOIN orders o ON o.id = i.order_id WHERE o.payment_status = 'confirmed' AND o.status != 'cancelled' GROUP BY i.product_name ORDER BY qty DESC LIMIT 5`).all(),
  });
});

// ---- products ----------------------------------------------------------------------
const productSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug,
  category_id: z.coerce.number().int().positive(),
  short_description: z.string().trim().max(200).optional().default(''),
  description: z.string().trim().max(5000).optional().default(''),
  specs: z.record(z.string().max(60), z.string().max(300)).optional().default({}),
  price: rupees,
  mrp: rupees,
  cost_price: rupees.default(0),
  stock: z.coerce.number().int().min(0).max(1_000_000),
  low_stock_threshold: z.coerce.number().int().min(0).max(10000).default(10),
  art: z.object({ type: z.string().max(20), tone: z.string().max(20) }).optional(),
  is_active: z.boolean().default(true),
  is_featured: z.boolean().default(false),
  is_bestseller: z.boolean().default(false),
  is_new: z.boolean().default(false),
  is_diwali: z.boolean().default(false),
  ships_international: z.boolean().default(true),
  is_bundle: z.boolean().default(false),
  bundle_items: z.array(z.object({ product_id: z.coerce.number().int().positive(), qty: z.coerce.number().int().min(1).max(20) })).max(12).default([]),
  sort_order: z.coerce.number().int().default(0),
  seo_title: z.string().trim().max(70).optional().or(z.literal('')),
  seo_description: z.string().trim().max(170).optional().or(z.literal('')),
}).refine((p) => p.mrp >= p.price, { message: 'MRP must be greater than or equal to the selling price', path: ['mrp'] });

r.get('/products', (req, res) => {
  const q = String(req.query.q || '').toLowerCase();
  const rows = db.prepare(`${PRODUCT_SELECT} ORDER BY p.sort_order, p.id DESC`).all();
  const offer = headlineOffer();
  res.json(rows.filter((p) => !q || p.name.toLowerCase().includes(q) || p.slug.includes(q)).map((p) => serializeProduct(p, { admin: true, offer })));
});
r.get('/products/:id', wrap((req, res) => {
  const p = db.prepare(`${PRODUCT_SELECT} WHERE p.id = ?`).get(Number(req.params.id));
  if (!p) throw new HttpError(404, 'Not found');
  res.json({ ...serializeProduct(p, { admin: true }), seo_title: p.seo_title || '', seo_description: p.seo_description || '' });
}));

function writeProduct(id, b) {
  const cols = ['name', 'slug', 'category_id', 'short_description', 'description', 'specs', 'price', 'mrp', 'cost_price', 'art', 'is_active', 'is_featured', 'is_bestseller', 'is_new', 'is_diwali', 'ships_international', 'is_bundle', 'sort_order', 'seo_title', 'seo_description'];
  const vals = {
    ...b,
    specs: JSON.stringify(b.specs || {}),
    art: b.art ? JSON.stringify(b.art) : null,
    is_active: b.is_active ? 1 : 0,
    is_featured: b.is_featured ? 1 : 0,
    is_bestseller: b.is_bestseller ? 1 : 0,
    is_new: b.is_new ? 1 : 0,
    is_diwali: b.is_diwali ? 1 : 0,
    ships_international: b.ships_international ? 1 : 0,
    is_bundle: b.is_bundle && b.bundle_items.length ? 1 : 0,
    seo_title: b.seo_title || null,
    seo_description: b.seo_description || null,
  };
  return db.transaction(() => {
    if (id) {
      db.prepare(`UPDATE products SET ${cols.map((c) => `${c} = ?`).join(', ')}, updated_at = ? WHERE id = ?`).run(...cols.map((c) => vals[c]), now(), id);
    } else {
      id = db.prepare(`INSERT INTO products(${cols.join(',')}) VALUES(${cols.map(() => '?').join(',')})`).run(...cols.map((c) => vals[c])).lastInsertRowid;
    }
    db.prepare('INSERT INTO inventory(product_id, stock, low_stock_threshold, updated_at) VALUES(?,?,?,?) ON CONFLICT(product_id) DO UPDATE SET stock = excluded.stock, low_stock_threshold = excluded.low_stock_threshold, updated_at = excluded.updated_at')
      .run(id, b.stock, b.low_stock_threshold, now());
    db.prepare('DELETE FROM bundle_items WHERE bundle_id = ?').run(id);
    if (vals.is_bundle) {
      const ins = db.prepare('INSERT INTO bundle_items(bundle_id, product_id, qty) SELECT ?, id, ? FROM products WHERE id = ? AND is_bundle = 0 AND id != ?');
      for (const x of b.bundle_items) ins.run(id, x.qty, x.product_id, id);
    }
    return id;
  })();
}

r.post('/products', wrap((req, res) => {
  const b = parse(productSchema, req.body);
  const id = writeProduct(null, b);
  audit(req, 'create', 'product', id, { name: b.name, price: b.price });
  res.status(201).json({ id });
}));
r.put('/products/:id', wrap((req, res) => {
  const id = Number(req.params.id);
  if (!db.prepare('SELECT 1 FROM products WHERE id = ?').get(id)) throw new HttpError(404, 'Not found');
  const b = parse(productSchema, req.body);
  const before = db.prepare(`${PRODUCT_SELECT} WHERE p.id = ?`).get(id);
  writeProduct(id, b);
  audit(req, 'update', 'product', id, { price: [before.price, b.price], cost: [before.cost_price, b.cost_price], stock: [before.stock, b.stock], is_active: [!!before.is_active, b.is_active] });
  res.json({ id });
}));
r.delete('/products/:id', wrap((req, res) => {
  const id = Number(req.params.id);
  const used = db.prepare('SELECT 1 FROM order_items WHERE product_id = ? LIMIT 1').get(id);
  if (used) {
    // keep order history intact — archive instead of hard delete
    db.prepare('UPDATE products SET is_active = 0, updated_at = ? WHERE id = ?').run(now(), id);
    audit(req, 'archive', 'product', id);
    return res.json({ archived: true, message: 'Product has orders, so it was disabled instead of deleted.' });
  }
  db.prepare('DELETE FROM products WHERE id = ?').run(id);
  audit(req, 'delete', 'product', id);
  res.json({ deleted: true });
}));
r.post('/products/:id/images', imageUpload.array('images', 6), wrap((req, res) => {
  const id = Number(req.params.id);
  const p = db.prepare('SELECT name FROM products WHERE id = ?').get(id);
  if (!p) throw new HttpError(404, 'Not found');
  const max = db.prepare('SELECT COALESCE(MAX(sort_order), -1) m FROM product_images WHERE product_id = ?').get(id).m;
  (req.files || []).forEach((f, i) => {
    const url = saveImage(f);
    db.prepare('INSERT INTO product_images(product_id, url, alt, sort_order) VALUES(?,?,?,?)').run(id, url, p.name, max + 1 + i);
  });
  audit(req, 'upload_images', 'product', id, { count: req.files?.length || 0 });
  res.json(db.prepare('SELECT id, url, alt FROM product_images WHERE product_id = ? ORDER BY sort_order').all(id));
}));
r.delete('/images/:id', (req, res) => {
  db.prepare('DELETE FROM product_images WHERE id = ?').run(Number(req.params.id));
  audit(req, 'delete', 'product_image', req.params.id);
  res.json({ ok: true });
});

// Quick price / cost / stock edit (used by the Profit page's editable table).
r.patch('/products/:id/pricing', wrap((req, res) => {
  const id = Number(req.params.id);
  const before = db.prepare(`${PRODUCT_SELECT} WHERE p.id = ?`).get(id);
  if (!before) throw new HttpError(404, 'Not found');
  const b = parse(z.object({ price: rupees, mrp: rupees, cost_price: rupees, stock: z.coerce.number().int().min(0).max(1_000_000).optional() })
    .refine((p) => p.mrp >= p.price, { message: 'MRP must be greater than or equal to the selling price', path: ['mrp'] }), req.body);
  db.transaction(() => {
    db.prepare('UPDATE products SET price = ?, mrp = ?, cost_price = ?, updated_at = ? WHERE id = ?').run(b.price, b.mrp, b.cost_price, now(), id);
    if (b.stock != null) db.prepare('UPDATE inventory SET stock = ?, updated_at = ? WHERE product_id = ?').run(b.stock, now(), id);
  })();
  audit(req, 'update_pricing', 'product', id, { price: [before.price, b.price], mrp: [before.mrp, b.mrp], cost: [before.cost_price, b.cost_price] });
  res.json({ ok: true });
}));

// ---- profit report --------------------------------------------------------------
// Per product: MRP, selling price, cost, profit per unit, margin, profit at the
// headline offer price, and REALISED numbers from paid (non-cancelled) orders.
// Realised revenue is net of each line's share of the order discount.
r.get('/profit', (req, res) => {
  const offer = headlineOffer();
  const sold = new Map(db.prepare(
    `SELECT oi.product_id, SUM(oi.qty) units, SUM(oi.line_total - oi.discount_share) revenue, SUM(oi.unit_cost * oi.qty) cogs
     FROM order_items oi JOIN orders o ON o.id = oi.order_id
     WHERE o.payment_status = 'confirmed' AND o.status != 'cancelled' GROUP BY oi.product_id`
  ).all().map((r) => [r.product_id, r]));
  const products = db.prepare(`${PRODUCT_SELECT} ORDER BY p.sort_order, p.id`).all().map((p) => {
    const s = sold.get(p.id) || { units: 0, revenue: 0, cogs: 0 };
    const eligible = offer && isProductEligible(offer, p);
    const offerPrice = eligible && ['percent', 'tiered'].includes(offer.discount_type) ? Math.round(p.price * (1 - offerMaxPercent(offer) / 100)) : null;
    return {
      id: p.id, name: p.name, slug: p.slug, category_slug: p.category_slug, category_name: p.category_name, is_active: !!p.is_active,
      art: parseJSON(p.art, null), image: db.prepare('SELECT url FROM product_images WHERE product_id = ? ORDER BY sort_order LIMIT 1').get(p.id)?.url || null,
      mrp: p.mrp, price: p.price, cost: p.cost_price, stock: p.stock,
      unit_profit: p.price - p.cost_price,
      margin_pct: p.price ? Math.round(((p.price - p.cost_price) / p.price) * 1000) / 10 : 0,
      offer_price: offerPrice,
      offer_unit_profit: offerPrice == null ? null : offerPrice - p.cost_price,
      units_sold: s.units, revenue: s.revenue, cogs: s.cogs, gross_profit: s.revenue - s.cogs,
      stock_value_at_cost: p.stock * p.cost_price,
    };
  });
  const paid = db.prepare("SELECT COUNT(*) n, COALESCE(SUM(delivery_fee),0) delivery FROM orders WHERE payment_status = 'confirmed' AND status != 'cancelled'").get();
  const sum = (k) => products.reduce((a, p) => a + (p[k] || 0), 0);
  const revenue = sum('revenue');
  const cogs = sum('cogs');
  res.json({
    offer: offer ? { name: offer.name, discount_type: offer.discount_type, discount_value: offer.discount_value, min_qty: offer.min_qty } : null,
    totals: {
      orders: paid.n, revenue, cogs, gross_profit: revenue - cogs, margin_pct: revenue ? Math.round(((revenue - cogs) / revenue) * 1000) / 10 : 0,
      delivery_collected: paid.delivery, units_sold: sum('units_sold'),
      stock_value_at_cost: sum('stock_value_at_cost'),
      missing_cost: products.filter((p) => !p.cost).length,
      loss_at_offer: products.filter((p) => p.offer_unit_profit != null && p.offer_unit_profit < 0).length,
    },
    products,
  });
});

// ---- categories ------------------------------------------------------------------------
const categorySchema = z.object({
  name: z.string().trim().min(2).max(60),
  slug,
  description: z.string().trim().max(200).optional().default(''),
  icon: z.string().trim().max(8).optional().default(''),
  art: z.object({ type: z.string().max(20), tone: z.string().max(20) }).optional(),
  sort_order: z.coerce.number().int().default(0),
  is_active: z.boolean().default(true),
  segment: z.enum(SEGMENTS.map((x) => x.slug)).default('festive-decor'),
});
r.get('/categories', (req, res) => {
  res.json(db.prepare('SELECT c.*, (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id) product_count FROM categories c ORDER BY sort_order, name').all()
    .map((c) => ({ ...c, art: parseJSON(c.art, null), is_active: !!c.is_active })));
});
r.post('/categories', wrap((req, res) => {
  const b = parse(categorySchema, req.body);
  const id = db.prepare('INSERT INTO categories(name, slug, description, icon, art, sort_order, is_active, segment) VALUES(?,?,?,?,?,?,?,?)')
    .run(b.name, b.slug, b.description, b.icon, b.art ? JSON.stringify(b.art) : null, b.sort_order, b.is_active ? 1 : 0, b.segment).lastInsertRowid;
  audit(req, 'create', 'category', id, b);
  res.status(201).json({ id });
}));
r.put('/categories/:id', wrap((req, res) => {
  const b = parse(categorySchema, req.body);
  db.prepare('UPDATE categories SET name=?, slug=?, description=?, icon=?, art=COALESCE(?, art), sort_order=?, is_active=?, segment=? WHERE id=?')
    .run(b.name, b.slug, b.description, b.icon, b.art ? JSON.stringify(b.art) : null, b.sort_order, b.is_active ? 1 : 0, b.segment, Number(req.params.id));
  audit(req, 'update', 'category', req.params.id, b);
  res.json({ ok: true });
}));
r.delete('/categories/:id', wrap((req, res) => {
  const n = db.prepare('SELECT COUNT(*) n FROM products WHERE category_id = ?').get(Number(req.params.id)).n;
  if (n) throw new HttpError(409, `Move or delete the ${n} product(s) in this category first.`);
  db.prepare('DELETE FROM categories WHERE id = ?').run(Number(req.params.id));
  audit(req, 'delete', 'category', req.params.id);
  res.json({ ok: true });
}));

// ---- offers -------------------------------------------------------------------------------
const offerSchema = z.object({
  name: z.string().trim().min(3).max(100),
  description: z.string().trim().max(300).optional().default(''),
  discount_type: z.enum(['percent', 'flat', 'tiered', 'cheapest']),
  discount_value: z.coerce.number().min(0),
  tiers: z.array(z.object({ min_qty: z.coerce.number().int().min(1).max(100), percent: z.coerce.number().min(1).max(90) })).max(6).optional().nullable(),
  first_order_only: z.boolean().optional().default(false),
  min_qty: z.coerce.number().int().min(1).max(100),
  max_discount: z.union([z.literal(''), z.null(), rupees]).optional(),
  starts_at: z.string().datetime({ offset: true }).optional().or(z.literal('')).nullable(),
  ends_at: z.string().datetime({ offset: true }).optional().or(z.literal('')).nullable(),
  coupon_code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{3,20}$/, '3–20 letters/numbers').optional().or(z.literal('')).nullable(),
  is_active: z.boolean(),
  product_ids: z.array(z.coerce.number().int()).max(500).default([]),
  category_ids: z.array(z.coerce.number().int()).max(100).default([]),
}).superRefine((o, ctx) => {
  if (['percent', 'cheapest'].includes(o.discount_type) && (o.discount_value <= 0 || o.discount_value > 90)) ctx.addIssue({ code: 'custom', path: ['discount_value'], message: 'Percentage must be between 1 and 90' });
  if (o.discount_type === 'tiered') {
    const t = (o.tiers || []).slice().sort((a, b) => a.min_qty - b.min_qty);
    if (t.length < 1) ctx.addIssue({ code: 'custom', path: ['tiers'], message: 'Add at least one tier' });
    if (new Set(t.map((x) => x.min_qty)).size !== t.length) ctx.addIssue({ code: 'custom', path: ['tiers'], message: 'Each tier needs a different quantity' });
    for (let i = 1; i < t.length; i++) if (t[i].percent <= t[i - 1].percent) ctx.addIssue({ code: 'custom', path: ['tiers'], message: 'Bigger quantities should give a bigger discount' });
  }
  if (o.starts_at && o.ends_at && new Date(o.ends_at) <= new Date(o.starts_at)) ctx.addIssue({ code: 'custom', path: ['ends_at'], message: 'End date must be after start date' });
});

r.get('/offers', (req, res) => res.json(loadOffers({ includeInactive: true }).map((o) => ({ ...o, live: isOfferLive(o) }))));

function writeOffer(id, b) {
  const tiers = b.discount_type === 'tiered' ? (b.tiers || []).slice().sort((x, y) => x.min_qty - y.min_qty) : null;
  const value = b.discount_type === 'flat' ? Math.round(b.discount_value * 100) : tiers ? Math.max(...tiers.map((t) => t.percent)) : Math.round(b.discount_value);
  const minQty = tiers ? tiers[0].min_qty : b.min_qty;
  const vals = [b.name, b.description, b.discount_type, value, tiers ? JSON.stringify(tiers) : null, b.first_order_only ? 1 : 0, minQty, b.max_discount === '' || b.max_discount == null ? null : b.max_discount,
    b.starts_at || null, b.ends_at || null, b.coupon_code || null, b.is_active ? 1 : 0];
  return db.transaction(() => {
    if (id) db.prepare('UPDATE offers SET name=?, description=?, discount_type=?, discount_value=?, tiers=?, first_order_only=?, min_qty=?, max_discount=?, starts_at=?, ends_at=?, coupon_code=?, is_active=?, updated_at=? WHERE id=?').run(...vals, now(), id);
    else id = db.prepare('INSERT INTO offers(name, description, discount_type, discount_value, tiers, first_order_only, min_qty, max_discount, starts_at, ends_at, coupon_code, is_active) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(...vals).lastInsertRowid;
    db.prepare('DELETE FROM offer_products WHERE offer_id = ?').run(id);
    db.prepare('DELETE FROM offer_categories WHERE offer_id = ?').run(id);
    const ip = db.prepare('INSERT OR IGNORE INTO offer_products(offer_id, product_id) SELECT ?, id FROM products WHERE id = ?');
    const ic = db.prepare('INSERT OR IGNORE INTO offer_categories(offer_id, category_id) SELECT ?, id FROM categories WHERE id = ?');
    b.product_ids.forEach((p) => ip.run(id, p));
    b.category_ids.forEach((c) => ic.run(id, c));
    return id;
  })();
}
r.post('/offers', wrap((req, res) => {
  const b = parse(offerSchema, req.body);
  const id = writeOffer(null, b);
  audit(req, 'create', 'offer', id, b);
  res.status(201).json({ id });
}));
r.put('/offers/:id', wrap((req, res) => {
  const b = parse(offerSchema, req.body);
  writeOffer(Number(req.params.id), b);
  audit(req, 'update', 'offer', req.params.id, b);
  res.json({ ok: true });
}));
r.delete('/offers/:id', (req, res) => {
  db.prepare('DELETE FROM offers WHERE id = ?').run(Number(req.params.id));
  audit(req, 'delete', 'offer', req.params.id);
  res.json({ ok: true });
});

// ---- orders ---------------------------------------------------------------------------------
r.get('/orders', (req, res) => {
  const where = [];
  const args = [];
  if (req.query.status) { where.push('status = ?'); args.push(String(req.query.status)); }
  if (req.query.payment) { where.push('payment_status = ?'); args.push(String(req.query.payment)); }
  if (req.query.q) {
    where.push('(order_number LIKE ? OR customer_name LIKE ? OR customer_phone LIKE ?)');
    const l = `%${String(req.query.q).slice(0, 50)}%`;
    args.push(l, l, l);
  }
  // paginated: ?limit (default 100, max 500) & ?page; total in X-Total-Count
  const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 100));
  const page = Math.max(1, Number(req.query.page) || 1);
  const W = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = db.prepare(`SELECT COUNT(*) n FROM orders ${W}`).get(...args).n;
  const rows = db.prepare(`SELECT * FROM orders ${W} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...args, limit, (page - 1) * limit);
  res.set({ 'X-Total-Count': String(total), 'Access-Control-Expose-Headers': 'X-Total-Count' });
  res.json(rows.map((o) => {
    const d = orderDetail(o, { admin: true });
    return d;
  }));
});
r.get('/orders/:id', wrap((req, res) => {
  const o = getOrderRow(Number(req.params.id));
  if (!o) throw new HttpError(404, 'Not found');
  res.json(orderDetail(o, { admin: true }));
}));
r.post('/orders/:id/action', wrap((req, res) => {
  const b = parse(z.object({
    action: z.enum(['confirm_payment', 'reject_payment', 'process', 'ship', 'out_for_delivery', 'deliver', 'cancel', 'mark_refunded']),
    note: z.string().trim().max(300).optional(),
    carrier: z.string().trim().max(60).optional(),
    trackingNumber: z.string().trim().max(60).optional(),
  }), req.body);
  // Money actions need a senior role: support staff can update delivery only.
  const NEED = { confirm_payment: 'confirm_payment', reject_payment: 'reject_payment', cancel: 'cancel_order', mark_refunded: 'refund' };
  if (NEED[b.action] && !can(req.admin.role, NEED[b.action])) throw new HttpError(403, 'Your role cannot do this. Ask the store owner.');
  const o = getOrderRow(Number(req.params.id));
  if (!o) throw new HttpError(404, 'Not found');
  const tpl = applyAdminAction(o, b.action, { adminId: req.admin.id, note: b.note, carrier: b.carrier, trackingNumber: b.trackingNumber });
  audit(req, b.action, 'order', o.order_number, b);
  if (tpl === 'payment_confirmed') afterPaymentConfirmed(o.id);
  syncFromAdmin(o.id, b.action);
  const fresh = getOrderRow(o.id);
  if (tpl) notifyOrder(fresh, tpl).catch(() => {});
  if (tpl === 'payment_confirmed') reportPurchase(o.id).catch(() => {});
  res.json(orderDetail(fresh, { admin: true }));
}));
r.put('/orders/:id/note', wrap((req, res) => {
  const { note } = parse(z.object({ note: z.string().max(1000) }), req.body);
  db.prepare('UPDATE orders SET admin_note = ?, updated_at = ? WHERE id = ?').run(note, now(), Number(req.params.id));
  res.json({ ok: true });
}));

// ---- returns & refunds ---------------------------------------------------------------
r.get('/returns', (req, res) => {
  const st = req.query.status ? String(req.query.status) : null;
  const rows = db.prepare(`SELECT * FROM return_requests ${st ? 'WHERE status = ?' : ''} ORDER BY (status = 'requested') DESC, id DESC LIMIT 500`).all(...(st ? [st] : []));
  const counts = Object.fromEntries(db.prepare('SELECT status, COUNT(*) n FROM return_requests GROUP BY status').all().map((x) => [x.status, x.n]));
  res.json({ items: rows.map((x) => returnView(x, { admin: true })), counts });
});
const findReturn = (id) => { const x = db.prepare('SELECT * FROM return_requests WHERE id = ?').get(Number(id)); if (!x) throw new HttpError(404, 'Return not found.'); return x; };
r.get('/returns/:id', wrap((req, res) => res.json(returnView(findReturn(req.params.id), { admin: true }))));
r.get('/returns/:id/photo', wrap((req, res) => {
  const x = findReturn(req.params.id);
  if (!x.photo_path) throw new HttpError(404, 'No photo');
  const file = path.join(PRIVATE_DIR, path.basename(x.photo_path));
  if (!fs.existsSync(file)) throw new HttpError(404, 'No photo');
  res.set('Cache-Control', 'private, no-store').sendFile(file);
}));
r.post('/returns/:id/action', wrap((req, res) => {
  const b = parse(z.object({ action: z.enum(['approve', 'reject', 'receive', 'cancel']), note: z.string().trim().max(500).optional(), restock: z.boolean().optional(), amount: z.coerce.number().positive().max(10_00_000).optional() }), req.body);
  if (!can(req.admin.role, 'approve_return')) throw new HttpError(403, 'Your role cannot decide returns.');
  const x = findReturn(req.params.id);
  const out = returnAction(x, b.action, { adminId: req.admin.id, note: b.note, restock: b.restock !== false, amount: b.amount != null ? Math.round(b.amount * 100) : undefined });
  audit(req, `return_${b.action}`, 'return', x.number, b);
  res.json(returnView(out, { admin: true }));
}));
r.get('/refunds', (req, res) => {
  const st = req.query.status ? String(req.query.status) : null;
  const rows = db.prepare(`SELECT * FROM refunds ${st ? 'WHERE status = ?' : ''} ORDER BY (status != 'processed') DESC, id DESC LIMIT 500`).all(...(st ? [st] : []));
  const sums = db.prepare('SELECT status, COUNT(*) n, COALESCE(SUM(amount),0) amount FROM refunds GROUP BY status').all();
  res.json({ items: rows.map(refundView), summary: Object.fromEntries(sums.map((x) => [x.status, { n: x.n, amount: x.amount }])) });
});
r.post('/refunds/:id/action', wrap((req, res) => {
  const b = parse(z.object({ action: z.enum(['process', 'fail']), reference: z.string().trim().max(60).optional(), method: z.enum(['original', 'upi', 'bank', 'gateway']).optional(), reason: z.string().trim().max(300).optional() }), req.body);
  if (!can(req.admin.role, 'refund')) throw new HttpError(403, 'Only the owner or Finance can mark refunds.');
  const f = db.prepare('SELECT * FROM refunds WHERE id = ?').get(Number(req.params.id));
  if (!f) throw new HttpError(404, 'Refund not found.');
  const out = refundAction(f, b.action, { adminId: req.admin.id, reference: b.reference, method: b.method, reason: b.reason });
  audit(req, `refund_${b.action}`, 'refund', f.id, { ...b, amount: f.amount / 100 });
  res.json(refundView(out));
}));

// ---- dealer settlements ----------------------------------------------------------------
r.get('/settlements', (req, res) => {
  const where = []; const args = [];
  if (req.query.dealer_id) { where.push('s.dealer_id = ?'); args.push(Number(req.query.dealer_id)); }
  if (req.query.status) { where.push('s.status = ?'); args.push(String(req.query.status)); }
  const rows = db.prepare(`SELECT s.*, d.business_name FROM dealer_settlements s JOIN dealers d ON d.id = s.dealer_id ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY s.id DESC LIMIT 500`).all(...args);
  const due = db.prepare('SELECT id, business_name FROM dealers WHERE is_active = 1 ORDER BY business_name').all().map((d) => {
    const p = settlementPreview(d.id);
    return { dealer_id: d.id, business_name: d.business_name, orders: p.totals.orders, returns: p.returns.length, net: p.totals.net, bank: p.bank };
  }).filter((x) => x.orders || x.returns);
  res.json({ items: rows.map((x) => ({ ...settlementView(x, { withItems: false }), dealer_id: x.dealer_id, business_name: x.business_name })), due });
});
r.get('/settlements/preview', wrap((req, res) => {
  const adj = req.query.adjustments ? JSON.parse(String(req.query.adjustments)) : [];
  res.json(settlementPreview(Number(req.query.dealer_id), Array.isArray(adj) ? adj : []));
}));
const adjSchema = z.array(z.object({ label: z.string().trim().min(3, 'Describe the adjustment').max(80), amount: z.coerce.number().refine((v) => v !== 0 && Math.abs(v) <= 10_00_000, 'Enter an amount') })).max(20).default([]);
r.post('/settlements', wrap((req, res) => {
  if (!can(req.admin.role, 'settle_pay')) throw new HttpError(403, 'Only the owner or Finance can create settlements.');
  const b = parse(z.object({ dealer_id: z.coerce.number().int().positive(), adjustments: adjSchema, note: z.string().trim().max(300).optional(), expect_net: z.coerce.number().optional() }), req.body);
  const adjustments = b.adjustments.map((a) => ({ label: a.label, amount: Math.round(a.amount * 100) }));
  const s = createSettlement(b.dealer_id, { adjustments, note: b.note, adminId: req.admin.id, expectNet: b.expect_net != null ? Math.round(b.expect_net * 100) : null });
  audit(req, 'settlement_created', 'settlement', s.number, { dealer_id: b.dealer_id, net: s.net / 100 });
  res.status(201).json(settlementView(s));
}));
r.get('/settlements/:id', wrap((req, res) => {
  const s = db.prepare('SELECT s.*, d.business_name FROM dealer_settlements s JOIN dealers d ON d.id = s.dealer_id WHERE s.id = ?').get(Number(req.params.id));
  if (!s) throw new HttpError(404, 'Settlement not found.');
  res.json({ ...settlementView(s), dealer_id: s.dealer_id, business_name: s.business_name });
}));
r.post('/settlements/:id/action', wrap((req, res) => {
  if (!can(req.admin.role, 'settle_pay')) throw new HttpError(403, 'Only the owner or Finance can do this.');
  const b = parse(z.object({ action: z.enum(['pay', 'cancel']), utr: z.string().trim().max(30).optional(), paid_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), note: z.string().trim().max(300).optional() }), req.body);
  const s = db.prepare('SELECT * FROM dealer_settlements WHERE id = ?').get(Number(req.params.id));
  if (!s) throw new HttpError(404, 'Settlement not found.');
  const out = settlementAction(s, b.action, { adminId: req.admin.id, utr: b.utr, paidOn: b.paid_on, note: b.note });
  audit(req, `settlement_${b.action}`, 'settlement', s.number, { utr: b.utr });
  res.json(settlementView(out));
}));

// ---- payments ----------------------------------------------------------------------------------
r.get('/payments', (req, res) => {
  const status = req.query.status ? String(req.query.status) : null;
  res.json(db.prepare(
    `SELECT pm.id, pm.method, pm.instrument, pm.amount, pm.status, pm.customer_ref, pm.gateway_payment_id, (pm.screenshot_path IS NOT NULL) has_screenshot,
            pm.created_at, pm.updated_at, pm.verified_at, o.id order_id, o.order_number, o.customer_name, o.customer_phone
     FROM payments pm JOIN orders o ON o.id = pm.order_id ${status ? 'WHERE pm.status = ?' : ''} ORDER BY pm.updated_at DESC LIMIT 500`
  ).all(...(status ? [status] : [])));
});
// Payment screenshots are private; streamed only to authenticated admins.
r.get('/payments/:id/screenshot', wrap((req, res) => {
  const p = db.prepare('SELECT screenshot_path FROM payments WHERE id = ?').get(Number(req.params.id));
  if (!p?.screenshot_path) throw new HttpError(404, 'No screenshot');
  const file = path.join(PRIVATE_DIR, path.basename(p.screenshot_path));
  if (!fs.existsSync(file)) throw new HttpError(404, 'No screenshot');
  res.set('Cache-Control', 'private, no-store');
  res.sendFile(file);
}));

// ---- reviews ------------------------------------------------------------------------------------
r.get('/reviews', (req, res) => {
  res.json(db.prepare('SELECT r.*, p.name product_name FROM reviews r JOIN products p ON p.id = r.product_id ORDER BY (r.status = \'pending\') DESC, r.created_at DESC LIMIT 500').all());
});
r.put('/reviews/:id', wrap((req, res) => {
  const { status } = parse(z.object({ status: z.enum(['approved', 'rejected', 'pending']) }), req.body);
  const rv = db.prepare('SELECT product_id, rating, status FROM reviews WHERE id = ?').get(Number(req.params.id));
  if (!rv) throw new HttpError(404, 'Not found');
  db.transaction(() => {
    db.prepare('UPDATE reviews SET status = ? WHERE id = ?').run(status, Number(req.params.id));
    // keep the product's aggregate rating in sync when a review is approved / un-approved
    if (status === 'approved' && rv.status !== 'approved') {
      db.prepare('UPDATE products SET rating = ROUND((rating * rating_count + ?) / (rating_count + 1), 1), rating_count = rating_count + 1 WHERE id = ?').run(rv.rating, rv.product_id);
    } else if (rv.status === 'approved' && status !== 'approved') {
      db.prepare('UPDATE products SET rating = CASE WHEN rating_count > 1 THEN ROUND((rating * rating_count - ?) / (rating_count - 1), 1) ELSE 0 END, rating_count = MAX(rating_count - 1, 0) WHERE id = ?').run(rv.rating, rv.product_id);
    }
  })();
  audit(req, `review_${status}`, 'review', req.params.id);
  res.json({ ok: true });
}));

// ---- marketing: funnel, sources/campaigns, ad spend, ROAS -------------------------
r.get('/marketing', (req, res) => {
  const days = Math.min(365, Math.max(1, Number(req.query.days) || 30));
  const since = new Date(Date.now() - days * 864e5).toISOString();
  const sinceMonth = since.slice(0, 7);
  const sessionsOf = (type) => db.prepare('SELECT COUNT(DISTINCT session_id) n FROM events WHERE type = ? AND created_at >= ?').get(type, since).n;
  const paidWhere = "o.payment_status = 'confirmed' AND o.status != 'cancelled'";
  const funnel = [
    { key: 'visits', label: 'Visited the store', count: sessionsOf('page_view') },
    { key: 'view_item', label: 'Viewed a product', count: sessionsOf('view_item') },
    { key: 'add_to_cart', label: 'Added to cart', count: sessionsOf('add_to_cart') },
    { key: 'begin_checkout', label: 'Started checkout', count: sessionsOf('begin_checkout') },
    { key: 'orders', label: 'Placed an order', count: db.prepare('SELECT COUNT(*) n FROM orders WHERE created_at >= ?').get(since).n },
    { key: 'paid', label: 'Paid', count: db.prepare(`SELECT COUNT(*) n FROM orders o WHERE o.created_at >= ? AND ${paidWhere}`).get(since).n },
  ];
  const key = (src, camp) => `${(src || 'direct').toLowerCase()}|${(camp || '').toLowerCase()}`;
  const rows = new Map();
  const row = (src, camp) => {
    const k = key(src, camp);
    if (!rows.has(k)) rows.set(k, { source: (src || 'direct').toLowerCase(), campaign: (camp || '').toLowerCase(), sessions: 0, orders: 0, paid: 0, revenue: 0, gross_profit: 0, spend: 0 });
    return rows.get(k);
  };
  for (const e of db.prepare("SELECT utm_source s, utm_campaign c, COUNT(DISTINCT session_id) n FROM events WHERE type = 'page_view' AND created_at >= ? GROUP BY 1, 2").all(since)) row(e.s, e.c).sessions += e.n;
  for (const o of db.prepare('SELECT utm_source s, utm_campaign c, COUNT(*) n FROM orders WHERE created_at >= ? GROUP BY 1, 2').all(since)) row(o.s, o.c).orders += o.n;
  for (const o of db.prepare(
    `SELECT o.utm_source s, o.utm_campaign c, COUNT(DISTINCT o.id) n, SUM(o.total) rev FROM orders o WHERE o.created_at >= ? AND ${paidWhere} GROUP BY 1, 2`
  ).all(since)) { const x = row(o.s, o.c); x.paid += o.n; x.revenue += o.rev; }
  for (const g of db.prepare(
    `SELECT o.utm_source s, o.utm_campaign c, SUM(i.line_total - i.discount_share - i.unit_cost * i.qty) gp FROM order_items i JOIN orders o ON o.id = i.order_id
     WHERE o.created_at >= ? AND ${paidWhere} GROUP BY 1, 2`
  ).all(since)) row(g.s, g.c).gross_profit += g.gp;
  for (const a of db.prepare('SELECT source s, campaign c, SUM(amount) amt FROM ad_spend WHERE month >= ? GROUP BY 1, 2').all(sinceMonth)) row(a.s, a.c).spend += a.amt;
  const list = [...rows.values()].map((x) => ({
    ...x,
    conversion_pct: x.sessions ? Math.round((x.paid / x.sessions) * 1000) / 10 : null,
    roas: x.spend ? Math.round((x.revenue / x.spend) * 100) / 100 : null,
    cpa: x.spend && x.paid ? Math.round(x.spend / x.paid) : null,
    profit_after_ads: x.gross_profit - x.spend,
  })).sort((a, b) => b.revenue - a.revenue || b.sessions - a.sessions);
  const sum = (k) => list.reduce((t, x) => t + (x[k] || 0), 0);
  const totals = { sessions: funnel[0].count, paid: sum('paid'), revenue: sum('revenue'), gross_profit: sum('gross_profit'), spend: sum('spend') };
  totals.roas = totals.spend ? Math.round((totals.revenue / totals.spend) * 100) / 100 : null;
  totals.cpa = totals.spend && totals.paid ? Math.round(totals.spend / totals.paid) : null;
  totals.profit_after_ads = totals.gross_profit - totals.spend;
  totals.aov = totals.paid ? Math.round(totals.revenue / totals.paid) : 0;
  const s = getSettings();
  res.json({
    days, since, funnel, sources: list, totals,
    tracking: { meta_pixel_id: s.meta_pixel_id || '', ga4_measurement_id: s.ga4_measurement_id || '', ...conversionsStatus() },
    abandoned: db.prepare("SELECT COUNT(*) n, COALESCE(SUM(value), 0) v FROM checkout_sessions WHERE order_id IS NULL AND updated_at >= ? AND updated_at < ?").get(since, new Date(Date.now() - 30 * 6e4).toISOString()),
  });
});

r.get('/ad-spend', (req, res) => res.json(db.prepare('SELECT * FROM ad_spend ORDER BY month DESC, id DESC LIMIT 500').all()));
r.post('/ad-spend', wrap((req, res) => {
  const b = parse(z.object({
    month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use YYYY-MM'),
    source: z.string().trim().toLowerCase().min(2).max(40),
    campaign: z.string().trim().toLowerCase().max(80).optional().default(''),
    amount: rupees,
    notes: z.string().trim().max(200).optional().default(''),
  }), req.body);
  const id = db.prepare('INSERT INTO ad_spend(month, source, campaign, amount, notes) VALUES(?,?,?,?,?)').run(b.month, b.source, b.campaign, b.amount, b.notes).lastInsertRowid;
  audit(req, 'create', 'ad_spend', id, b);
  res.status(201).json({ id });
}));
r.delete('/ad-spend/:id', (req, res) => {
  db.prepare('DELETE FROM ad_spend WHERE id = ?').run(Number(req.params.id));
  audit(req, 'delete', 'ad_spend', req.params.id);
  res.json({ ok: true });
});

// ---- abandoned carts --------------------------------------------------------------------
r.get('/abandoned', (req, res) => {
  const cutoff = new Date(Date.now() - 30 * 6e4).toISOString();
  res.json(db.prepare('SELECT id, token, name, email, phone, country, consent, items, value, utm_source, utm_campaign, reminded_at, reminded2_at, created_at, updated_at FROM checkout_sessions WHERE order_id IS NULL AND updated_at < ? ORDER BY updated_at DESC LIMIT 200').all(cutoff)
    .map((c) => ({ ...c, consent: !!c.consent, items: parseJSON(c.items, []), cart_url: `${config.publicUrl}/cart?restore=${c.token}` })));
});
r.post('/abandoned/:id/remind', wrap(async (req, res) => {
  const c = db.prepare('SELECT * FROM checkout_sessions WHERE id = ?').get(Number(req.params.id));
  if (!c || c.order_id) throw new HttpError(404, 'Not found');
  if (!c.consent) throw new HttpError(409, 'This customer did not agree to reminders. Contact them only about their order if they ask.');
  await sendCartReminder(c);
  audit(req, 'remind', 'checkout_session', c.id);
  res.json({ ok: true });
}));

// ---- shipping zones -----------------------------------------------------------------------
const zoneSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z_]{2,12}$/),
  name: z.string().trim().min(2).max(60),
  countries: z.array(z.string().trim().toUpperCase().regex(/^([A-Z]{2}|\*)$/)).min(1).max(250),
  fee: rupees, extra_item_fee: rupees, free_above: rupees,
  delivery_text: z.string().trim().max(60).optional().default(''),
  duties_note: z.string().trim().max(200).optional().default(''),
  is_active: z.boolean().default(true),
  sort_order: z.coerce.number().int().default(0),
});
r.get('/zones', (req, res) => res.json(loadZones({ includeInactive: true })));
r.post('/zones', wrap((req, res) => {
  const b = parse(zoneSchema, req.body);
  const id = db.prepare('INSERT INTO shipping_zones(code, name, countries, fee, extra_item_fee, free_above, delivery_text, duties_note, is_active, sort_order) VALUES(?,?,?,?,?,?,?,?,?,?)')
    .run(b.code, b.name, JSON.stringify(b.countries), b.fee, b.extra_item_fee, b.free_above, b.delivery_text, b.duties_note, b.is_active ? 1 : 0, b.sort_order).lastInsertRowid;
  audit(req, 'create', 'zone', id, b);
  res.status(201).json({ id });
}));
r.put('/zones/:id', wrap((req, res) => {
  const b = parse(zoneSchema, req.body);
  db.prepare('UPDATE shipping_zones SET code=?, name=?, countries=?, fee=?, extra_item_fee=?, free_above=?, delivery_text=?, duties_note=?, is_active=?, sort_order=? WHERE id=?')
    .run(b.code, b.name, JSON.stringify(b.countries), b.fee, b.extra_item_fee, b.free_above, b.delivery_text, b.duties_note, b.is_active ? 1 : 0, b.sort_order, Number(req.params.id));
  audit(req, 'update', 'zone', req.params.id, b);
  res.json({ ok: true });
}));
r.delete('/zones/:id', (req, res) => {
  db.prepare("DELETE FROM shipping_zones WHERE id = ? AND code != 'IN'").run(Number(req.params.id));
  audit(req, 'delete', 'zone', req.params.id);
  res.json({ ok: true });
});

// ---- customers ------------------------------------------------------------------------------------
r.get('/customers', (req, res) => {
  res.json(db.prepare(
    `SELECT u.id, u.name, u.email, u.phone, u.created_at,
            (SELECT COUNT(*) FROM orders o WHERE o.user_id = u.id) orders,
            (SELECT COALESCE(SUM(total),0) FROM orders o WHERE o.user_id = u.id AND o.payment_status = 'confirmed') spent
     FROM users u ORDER BY u.id DESC LIMIT 1000`
  ).all());
});

// ---- settings (payment & store) -------------------------------------------------------------------
const settingsSchema = z.object({
  store_name: z.string().trim().min(2).max(60),
  festival_name: z.string().trim().max(40).optional().default('Diwali'),
  festival_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').optional().or(z.literal('')),
  support_phone: z.string().trim().max(20),
  whatsapp_number: z.string().trim().max(20).regex(/^[+\d\s()-]*$/, 'Digits only, e.g. +91 98xxx xxxxx').optional().default(''),
  support_email: z.string().trim().email(),
  upi_id: z.string().trim().regex(/^[a-zA-Z0-9._-]{2,256}@[a-zA-Z]{2,64}$/, 'Enter a valid UPI ID like yourname@okhdfcbank'),
  upi_payee_name: z.string().trim().min(2).max(60),
  payment_mode: z.enum(['manual_upi', 'gateway']),
  gateway_provider: z.enum(['razorpay', 'cashfree', 'phonepe', 'payu']),
  gateway_key_id: z.string().trim().max(60).optional().default(''), // publishable key only; secrets stay in .env
  merchant_name: z.string().trim().max(100).optional().default(''),
  merchant_gstin: z.string().trim().max(15).optional().default(''),
  settlement_note: z.string().trim().max(300).optional().default(''),
  delivery_fee: rupees,
  free_delivery_above: rupees,
  require_txn_ref: z.boolean(),
  allow_screenshot: z.boolean(),
  // optional: when left out, the stored value is kept
  meta_pixel_id: z.string().trim().regex(/^\d{0,20}$/, 'The Pixel ID is a number of up to 20 digits').optional(),
  ga4_measurement_id: z.string().trim().toUpperCase().regex(/^(G-[A-Z0-9]{4,16})?$/, 'Looks like G-XXXXXXXXXX').optional(),
  international_enabled: z.boolean().optional(),
  fx_rates: z.record(z.string().regex(/^[A-Z]{3}$/), z.coerce.number().positive().max(100000)).optional(),
  fx_markup_pct: z.coerce.number().min(0).max(20).optional(),
  festival_emoji: z.string().trim().max(8).optional(),
  festival_headline: z.string().trim().max(80).optional(),
  festival_subtitle: z.string().trim().max(240).optional(),
});
r.get('/settings', (req, res) => res.json(getSettings()));
r.put('/settings', requireAdmin('owner'), wrap((req, res) => {
  const b = parse(settingsSchema, req.body);
  const before = getSettings();
  for (const k of Object.keys(b)) if (b[k] === undefined) delete b[k];
  setSettings(b);
  audit(req, 'update', 'settings', null, { upi_id: [before.upi_id, b.upi_id], payment_mode: [before.payment_mode, b.payment_mode] });
  res.json(getSettings());
}));
// Checkout rules: guest checkout off by default (accounts with accepted terms only).
r.put('/settings/checkout', requireAdmin('owner'), wrap((req, res) => {
  const b = parse(z.object({ guest_checkout: z.boolean() }), req.body);
  setSettings({ guest_checkout: b.guest_checkout });
  audit(req, 'update', 'settings', 'guest_checkout', b);
  res.json({ guest_checkout: getSettings().guest_checkout });
}));
// Tracking IDs only (Admin → Marketing). Access tokens stay in .env.
r.put('/settings/tracking', requireAdmin('owner'), wrap((req, res) => {
  const b = parse(z.object({
    meta_pixel_id: z.string().trim().regex(/^\d{0,20}$/, 'The Pixel ID is a number of up to 20 digits'),
    ga4_measurement_id: z.string().trim().toUpperCase().regex(/^(G-[A-Z0-9]{4,16})?$/, 'Looks like G-XXXXXXXXXX'),
  }), req.body);
  setSettings(b);
  audit(req, 'update', 'settings', 'tracking', b);
  res.json({ ok: true });
}));
r.post('/settings/qr', requireAdmin('owner'), imageUpload.single('qr'), wrap((req, res) => {
  if (!req.file) throw new HttpError(400, 'Choose a QR image to upload.');
  const url = saveImage(req.file);
  setSettings({ upi_qr_url: url });
  audit(req, 'update', 'settings', 'upi_qr_url', { url });
  res.json({ upi_qr_url: url });
}));

r.get('/notifications', (req, res) => res.json(db.prepare('SELECT id, channel, recipient, template, status, error, created_at FROM notifications ORDER BY id DESC LIMIT 200').all()));
r.get('/audit', (req, res) => res.json(db.prepare('SELECT a.*, u.name admin_name FROM audit_logs a LEFT JOIN admin_users u ON u.id = a.admin_id ORDER BY a.id DESC LIMIT 300').all()));

export default r;
