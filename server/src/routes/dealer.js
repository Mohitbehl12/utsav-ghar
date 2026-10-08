/**
 * Dealer app API (/api/dealer/...) and admin dealer management (/api/admin/dealers...).
 * Dealers sign in with their mobile number + password (separate cookie & secret
 * from customers and admins) and only ever see orders the store sent them.
 */
import { Router } from 'express';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { db, now } from '../db.js';
import { config } from '../config.js';
import { wrap, parse, HttpError } from '../lib/http.js';
import { hashPassword, checkPassword, DUMMY_HASH, requireAdmin } from '../lib/auth.js';
import { assertNotLocked, loginFailed, loginSucceeded, secEvent, rejectBots } from '../lib/security.js';
import { audit } from '../lib/audit.js';
import { getOrderRow, orderDetail } from '../lib/orders.js';
import { setSettings } from '../lib/catalog.js';
import {
  dealerFromRow, allDealers, dealerOrderView, dealerStep, assignOrder, dealerSettings, currentAssignment, courierUpdate,
} from '../lib/dealers.js';
import { parsePins, DEALER_STATUS, REJECT_REASONS } from '../../../shared/dealers.js';
import { passwordProblem } from '../../../shared/security.js';
import { dealerDashboardData, markNotificationsSeen, dealerProfile } from '../lib/dealerDashboard.js';
import { GRACE_DAYS } from '../lib/legal.js';
import { sendOtp, verifyOtp } from '../lib/otp.js';
import { dealerPayments } from '../lib/settlements.js';
import { assertDealerSafe } from '../../../shared/dealerDashboard.js';
import { notifyContact } from '../lib/notify.js';

export const dealerApi = Router();
export const adminDealers = Router();

const SECRET = crypto.createHmac('sha256', config.adminJwtSecret).update('dealer-sessions-v1').digest('hex');
const COOKIE = { httpOnly: true, sameSite: 'strict', secure: config.isProd, path: '/' };
const phone10 = (p) => String(p || '').replace(/\D/g, '').slice(-10);
const tempPassword = () => `UG-${crypto.randomBytes(6).toString('base64url').replace(/[-_]/g, 'x')}-${crypto.randomInt(10, 99)}`;

export function setDealerSession(res, d) {
  const v = db.prepare('SELECT token_version FROM dealers WHERE id = ?').get(d.id)?.token_version || 0;
  res.cookie('sa_dealer', jwt.sign({ sub: d.id, kind: 'dealer', v }, SECRET, { expiresIn: '30d' }), { ...COOKIE, maxAge: 30 * 864e5 });
}
function requireDealer(req, _res, next) {
  const t = req.cookies?.sa_dealer;
  if (!t) return next(new HttpError(401, 'Please sign in to the dealer app.'));
  try {
    const p = jwt.verify(t, SECRET);
    if (p.kind !== 'dealer') throw new Error('kind');
    const r = db.prepare('SELECT * FROM dealers WHERE id = ? AND is_active = 1').get(p.sub);
    if (!r || (p.v || 0) !== r.token_version) throw new Error('revoked');
    req.dealer = dealerFromRow(r);
    return next();
  } catch {
    return next(new HttpError(401, 'Your session ended. Please sign in again.'));
  }
}
export const requireDealerSession = (...a) => requireDealer(...a);
export const mustSetPassword = (...a) => mustHaveNewPassword(...a);
const mustHaveNewPassword = (req, _res, next) => (req.dealer.must_change_password ? next(new HttpError(403, 'Please set your own password first.', { code: 'MUST_CHANGE_PASSWORD' })) : next());

// ---------------------------------------------------------------- dealer: auth
dealerApi.post('/dealer/login', wrap(async (req, res) => {
  rejectBots(req);
  const b = parse(z.object({ phone: z.string().trim().min(10).max(16), password: z.string().min(1).max(128) }), req.body);
  const phone = phone10(b.phone);
  const key = `dealer:${phone}`;
  assertNotLocked(key);
  const r = db.prepare('SELECT * FROM dealers WHERE phone = ?').get(phone);
  const ok = await checkPassword(b.password, r?.password_hash || DUMMY_HASH);
  if (!r || !ok || !r.is_active) {
    loginFailed(key, req);
    throw new HttpError(401, r && ok && !r.is_active ? 'This dealer account is switched off. Please contact the store.' : 'Wrong mobile number or password.');
  }
  loginSucceeded(key);
  db.prepare('UPDATE dealers SET last_login_at = ? WHERE id = ?').run(now(), r.id);
  secEvent('login_ok', `dealer:${r.id}`, req);
  setDealerSession(res, r);
  res.json({ dealer: dealerFromRow(r) });
}));
// Forgot password: code to the registered mobile (and email). Same answer for unknown numbers.
dealerApi.post('/dealer/password/forgot', wrap(async (req, res) => {
  rejectBots(req);
  const b = parse(z.object({ phone: z.string().trim().min(10, 'Enter your 10-digit mobile number').max(16) }), req.body);
  const r = db.prepare('SELECT id, name, phone, email FROM dealers WHERE phone = ? AND is_active = 1').get(phone10(b.phone));
  let out = {};
  if (r) {
    out = await sendOtp({ purpose: 'reset_dealer', target: `dealer:${r.id}`, phone: r.phone, email: r.email || null,
      subject: 'Reset your Utsav Ghar dealer password', text: '{{code}} is your code to reset your Utsav Ghar dealer app password. It is valid for 10 minutes. Do not share it.' });
    secEvent('password_reset_requested', `dealer:${r.id}`, req);
  }
  res.json({ ok: true, message: 'If this number is registered, we have sent a 6-digit code to it.', resend_in: 30, ...(out.dev_otp ? { dev_otp: out.dev_otp } : {}) });
}));
dealerApi.post('/dealer/password/reset', wrap(async (req, res) => {
  const b = parse(z.object({ phone: z.string().trim().min(10).max(16), otp: z.string().trim().max(10), password: z.string().max(128), confirm_password: z.string().max(128) }), req.body);
  const r = db.prepare('SELECT * FROM dealers WHERE phone = ? AND is_active = 1').get(phone10(b.phone));
  if (!r) throw new HttpError(400, 'This code is not valid. Ask for a new one.', { fields: { otp: 'Ask for a new code' } });
  if (b.password !== b.confirm_password) throw new HttpError(400, 'Passwords do not match.', { fields: { confirm_password: 'Passwords do not match' } });
  const weak = passwordProblem(b.password, { min: 8, email: r.email || '', name: r.name });
  if (weak) throw new HttpError(400, weak, { fields: { password: weak } });
  verifyOtp({ purpose: 'reset_dealer', target: `dealer:${r.id}`, code: b.otp });
  db.prepare('UPDATE dealers SET password_hash = ?, must_change_password = 0, token_version = token_version + 1, updated_at = ? WHERE id = ?').run(await hashPassword(b.password), now(), r.id);
  loginSucceeded(`dealer:${r.phone}`);
  secEvent('password_reset', `dealer:${r.id}`, req);
  notifyContact({ email: r.email || null, phone: r.phone, template: 'dealer_password_reset', subject: 'Your Utsav Ghar dealer password was reset', text: 'Your dealer app password was reset and you were signed out on other devices. If this was not you, call the Utsav Ghar team.' }).catch(() => {});
  res.json({ ok: true });
}));
dealerApi.post('/dealer/logout', (req, res) => { res.clearCookie('sa_dealer', COOKIE); res.json({ ok: true }); });
// ?soft=1: the app's first check answers 200 { dealer: null } when signed out (no error in the browser console)
dealerApi.get('/dealer/me', (req, res, next) => (req.query.soft && !req.cookies?.sa_dealer ? res.json({ dealer: null, reasons: REJECT_REASONS }) : requireDealer(req, res, next)), (req, res) => res.json({ dealer: req.dealer, reasons: REJECT_REASONS }));
dealerApi.put('/dealer/me/password', requireDealer, wrap(async (req, res) => {
  const b = parse(z.object({ current: z.string().min(1).max(128), next: z.string().max(128) }), req.body);
  const r = db.prepare('SELECT * FROM dealers WHERE id = ?').get(req.dealer.id);
  if (!(await checkPassword(b.current, r.password_hash))) throw new HttpError(400, 'Current password is wrong.', { fields: { current: 'Wrong password' } });
  const weak = passwordProblem(b.next, { min: 8, email: r.email || '', name: r.name });
  if (weak) throw new HttpError(400, weak, { fields: { next: weak } });
  if (b.next === b.current) throw new HttpError(400, 'Choose a new password.', { fields: { next: 'Same as before' } });
  db.prepare('UPDATE dealers SET password_hash = ?, must_change_password = 0, token_version = token_version + 1, updated_at = ? WHERE id = ?').run(await hashPassword(b.next), now(), r.id);
  secEvent('password_changed', `dealer:${r.id}`, req);
  setDealerSession(res, r);
  res.json({ ok: true });
}));

// ---------------------------------------------------------------- dealer: orders
const TABS = {
  new: ['sent'],
  active: ['accepted', 'packed', 'ready', 'out_for_delivery'],
  done: ['delivered', 'cancelled'],
};
dealerApi.get('/dealer/summary', requireDealer, (req, res) => {
  const rows = db.prepare('SELECT status, COUNT(*) n FROM dealer_orders WHERE dealer_id = ? GROUP BY status').all(req.dealer.id);
  const c = Object.fromEntries(rows.map((r) => [r.status, r.n]));
  const today = new Date(); today.setHours(0, 0, 0, 0);
  res.set('Cache-Control', 'no-store').json({
    new: c.sent || 0, active: TABS.active.reduce((s, k) => s + (c[k] || 0), 0),
    delivered_today: db.prepare("SELECT COUNT(*) n FROM dealer_orders WHERE dealer_id = ? AND status = 'delivered' AND delivered_at >= ?").get(req.dealer.id, today.toISOString()).n,
    by_status: c, accept_minutes: dealerSettings().accept_minutes,
  });
});
// business dashboard — dealer's own stock, sales (at dealer price), orders and alerts only
dealerApi.get('/dealer/dashboard', requireDealer, mustHaveNewPassword, wrap((req, res) => {
  res.set('Cache-Control', 'no-store').json(dealerDashboardData(req.dealer.id, String(req.query.range || '30d')));
}));
dealerApi.get('/dealer/payments', requireDealer, mustHaveNewPassword, wrap((req, res) => {
  const out = dealerPayments(req.dealer.id);
  res.set('Cache-Control', 'no-store').json(out.model === 'supply' ? assertDealerSafe(out) : out);
}));
dealerApi.post('/dealer/notifications/seen', requireDealer, mustHaveNewPassword, (req, res) => { markNotificationsSeen(req.dealer.id); res.json({ ok: true }); });
dealerApi.get('/dealer/profile', requireDealer, mustHaveNewPassword, (req, res) => res.set('Cache-Control', 'no-store').json(dealerProfile(req.dealer)));
dealerApi.put('/dealer/profile', requireDealer, mustHaveNewPassword, wrap((req, res) => {
  const b = parse(z.object({ email: z.string().trim().email('Enter a valid email').max(160).or(z.literal('')) }), req.body);
  db.prepare('UPDATE dealers SET email = ?, updated_at = ? WHERE id = ?').run(b.email || null, now(), req.dealer.id);
  secEvent('dealer_profile_update', `dealer:${req.dealer.id}`, req, { email: !!b.email });
  res.json(dealerProfile({ ...req.dealer, email: b.email || null }));
}));
dealerApi.get('/dealer/orders', requireDealer, mustHaveNewPassword, (req, res) => {
  const tab = TABS[req.query.tab] ? req.query.tab : 'new';
  const st = TABS[tab];
  // only the dealer's latest row per order (an order may come back after being moved)
  const rows = db.prepare(`SELECT * FROM dealer_orders d WHERE dealer_id = ? AND status IN (${st.map(() => '?').join(',')})
    AND id = (SELECT MAX(id) FROM dealer_orders x WHERE x.order_id = d.order_id AND x.dealer_id = d.dealer_id)
    ORDER BY ${tab === 'done' ? 'COALESCE(delivered_at, closed_at, updated_at) DESC' : 'sent_at ASC'} LIMIT 100`).all(req.dealer.id, ...st);
  res.set('Cache-Control', 'no-store').json({ tab, items: rows.map((r) => dealerOrderView(r, { full: false })) });
});
function myRow(req) {
  const o = db.prepare('SELECT id FROM orders WHERE order_number = ?').get(String(req.params.number).toUpperCase());
  const row = o && db.prepare('SELECT * FROM dealer_orders WHERE order_id = ? AND dealer_id = ? ORDER BY id DESC LIMIT 1').get(o.id, req.dealer.id);
  if (!row) throw new HttpError(404, 'Order not found');
  return row;
}
dealerApi.get('/dealer/orders/:number', requireDealer, mustHaveNewPassword, wrap((req, res) => {
  res.set('Cache-Control', 'no-store').json(dealerOrderView(myRow(req)));
}));
const STEP_BODY = {
  accept: z.object({}).passthrough(),
  reject: z.object({ reason: z.string().trim().min(2).max(200) }),
  pack: z.object({ checked: z.array(z.coerce.number().int()).max(200) }),
  ready: z.object({}).passthrough(),
  dispatch: z.object({ mode: z.enum(['self', 'courier']), rider_name: z.string().max(60).optional(), rider_phone: z.string().max(16).optional(), courier_name: z.string().max(60).optional(), awb: z.string().max(40).optional(), tracking_url: z.string().max(300).optional() }),
  deliver: z.object({ otp: z.string().max(8).optional(), received_by: z.string().trim().max(60).optional() }),
  track: z.object({ status: z.enum(['picked_up', 'in_transit', 'out_for_delivery', 'attempt_failed', 'delivered']), location: z.string().trim().max(80).optional(), note: z.string().trim().max(200).optional(), received_by: z.string().trim().max(60).optional() }),
};
dealerApi.post('/dealer/orders/:number/:action', requireDealer, mustHaveNewPassword, wrap((req, res) => {
  const schema = STEP_BODY[req.params.action];
  if (!schema) throw new HttpError(404, 'Not found');
  const b = parse(schema, req.body || {});
  let row;
  if (req.params.action === 'track') {
    const mine = myRow(req);
    if (mine.status === 'cancelled') throw new HttpError(409, 'This order was cancelled.');
    row = courierUpdate(mine, b, `dealer:${req.dealer.id}`);
  } else row = dealerStep(req.dealer, req.params.number, req.params.action, b);
  secEvent(`dealer_${req.params.action}`, `dealer:${req.dealer.id}`, req, { order: req.params.number });
  res.json(dealerOrderView(row));
}));

// ---------------------------------------------------------------- admin: dealers
adminDealers.use(requireAdmin());
const managers = requireAdmin('owner', 'manager');
const dealerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  business_name: z.string().trim().min(2).max(120),
  phone: z.string().trim().transform(phone10).refine((p) => /^[6-9]\d{9}$/.test(p), 'Enter a valid 10-digit mobile number'),
  email: z.string().trim().email('Enter a valid email').max(160).optional().or(z.literal('')),
  address: z.string().trim().max(300).optional().default(''),
  city: z.string().trim().max(80).optional().default(''),
  state: z.string().trim().max(80).optional().default(''),
  pincode: z.string().trim().regex(/^(\d{6})?$/, 'PIN code is 6 digits').optional().default(''),
  gstin: z.string().trim().toUpperCase().regex(/^([0-9A-Z]{15})?$/, 'GSTIN is 15 letters/digits').optional().default(''),
  pincodes: z.string().max(5000).optional().default(''),
  all_india: z.boolean().optional().default(false),
  category_ids: z.array(z.coerce.number().int()).max(200).optional().default([]),
  product_ids: z.array(z.coerce.number().int()).max(2000).optional().default([]),
  priority: z.coerce.number().int().min(0).max(10).optional().default(0),
  is_active: z.boolean().optional().default(true),
});

function dealerStats() {
  const since = new Date(Date.now() - 30 * 864e5).toISOString();
  const rows = db.prepare(`SELECT dealer_id,
      SUM(status IN ('sent','accepted','packed','ready','out_for_delivery')) open,
      SUM(status = 'sent') waiting,
      SUM(status = 'delivered' AND delivered_at >= ?) delivered_30d,
      SUM(status IN ('rejected','reassigned') AND sent_at >= ?) declined_30d,
      AVG(CASE WHEN accepted_at IS NOT NULL AND sent_at >= ? THEN (julianday(accepted_at) - julianday(sent_at)) * 1440 END) avg_accept_min
    FROM dealer_orders GROUP BY dealer_id`).all(since, since, since);
  return new Map(rows.map((r) => [r.dealer_id, { open: r.open || 0, waiting: r.waiting || 0, delivered_30d: r.delivered_30d || 0, declined_30d: r.declined_30d || 0, avg_accept_min: r.avg_accept_min == null ? null : Math.round(r.avg_accept_min) }]));
}

adminDealers.get('/dealers', (req, res) => {
  const stats = dealerStats();
  res.json({
    dealers: allDealers().map((d) => ({ ...d, stats: stats.get(d.id) || { open: 0, waiting: 0, delivered_30d: 0, declined_30d: 0, avg_accept_min: null } })),
    settings: dealerSettings(),
    unassigned: db.prepare(`SELECT COUNT(*) n FROM orders o WHERE o.payment_status = 'confirmed' AND o.status = 'payment_confirmed'
      AND NOT EXISTS (SELECT 1 FROM dealer_orders d WHERE d.order_id = o.id AND d.status NOT IN ('rejected','reassigned'))`).get().n,
  });
});
const rowValues = (b) => [b.name, b.business_name, b.phone, b.email || null, b.address, b.city, b.state, b.pincode, b.gstin || null,
  JSON.stringify(parsePins(b.pincodes)), b.all_india ? 1 : 0, JSON.stringify([...new Set(b.category_ids)]), JSON.stringify([...new Set(b.product_ids)]), b.priority, b.is_active ? 1 : 0];

adminDealers.post('/dealers', managers, wrap(async (req, res) => {
  const b = parse(dealerSchema, req.body);
  if (db.prepare('SELECT 1 FROM dealers WHERE phone = ?').get(b.phone)) throw new HttpError(409, 'A dealer with this mobile number already exists.', { fields: { phone: 'Already used' } });
  if (!b.category_ids.length && !b.product_ids.length) throw new HttpError(400, 'Choose at least one category or product this dealer sells.', { fields: { category_ids: 'Required' } });
  const pw = tempPassword();
  const r = db.prepare(`INSERT INTO dealers(name, business_name, phone, email, address, city, state, pincode, gstin, pincodes, all_india, category_ids, product_ids, priority, is_active, password_hash)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(...rowValues(b), await hashPassword(pw));
  // added by the store: may take orders for GRACE_DAYS while completing KYC + agreement
  db.prepare("UPDATE dealers SET onboarding_status = 'draft', onboarding_deadline = ? WHERE id = ?").run(new Date(Date.now() + GRACE_DAYS * 864e5).toISOString(), r.lastInsertRowid);
  audit(req, 'create', 'dealer', r.lastInsertRowid, { business_name: b.business_name, phone: b.phone });
  res.status(201).json({ dealer: dealerFromRow(db.prepare('SELECT * FROM dealers WHERE id = ?').get(r.lastInsertRowid)), temp_password: pw });
}));
adminDealers.put('/dealers/:id', managers, wrap((req, res) => {
  const id = Number(req.params.id);
  const b = parse(dealerSchema, req.body);
  if (!db.prepare('SELECT 1 FROM dealers WHERE id = ?').get(id)) throw new HttpError(404, 'Not found');
  if (db.prepare('SELECT 1 FROM dealers WHERE phone = ? AND id != ?').get(b.phone, id)) throw new HttpError(409, 'Another dealer uses this mobile number.', { fields: { phone: 'Already used' } });
  db.prepare(`UPDATE dealers SET name = ?, business_name = ?, phone = ?, email = ?, address = ?, city = ?, state = ?, pincode = ?, gstin = ?, pincodes = ?, all_india = ?,
    category_ids = ?, product_ids = ?, priority = ?, is_active = ?, token_version = token_version + CASE WHEN ? = 0 THEN 1 ELSE 0 END, updated_at = ? WHERE id = ?`)
    .run(...rowValues(b), b.is_active ? 1 : 0, now(), id);
  audit(req, 'update', 'dealer', id, { business_name: b.business_name, is_active: b.is_active });
  res.json({ dealer: dealerFromRow(db.prepare('SELECT * FROM dealers WHERE id = ?').get(id)) });
}));
adminDealers.post('/dealers/:id/password', managers, wrap(async (req, res) => {
  const id = Number(req.params.id);
  if (!db.prepare('SELECT 1 FROM dealers WHERE id = ?').get(id)) throw new HttpError(404, 'Not found');
  const pw = tempPassword();
  db.prepare('UPDATE dealers SET password_hash = ?, must_change_password = 1, token_version = token_version + 1, updated_at = ? WHERE id = ?').run(await hashPassword(pw), now(), id);
  loginSucceeded(`dealer:${db.prepare('SELECT phone FROM dealers WHERE id = ?').get(id).phone}`);
  audit(req, 'reset_password', 'dealer', id);
  res.json({ temp_password: pw });
}));
adminDealers.put('/dealers-settings', requireAdmin('owner', 'dealer_admin'), wrap((req, res) => {
  const b = parse(z.object({ auto_assign: z.boolean(), auto_reassign: z.boolean(), accept_minutes: z.coerce.number().int().min(10).max(1440) }), req.body);
  setSettings({ dealer_auto_assign: String(b.auto_assign), dealer_auto_reassign: String(b.auto_reassign), dealer_accept_minutes: String(b.accept_minutes) });
  audit(req, 'update', 'settings', 'dealers', b);
  res.json(dealerSettings());
}));

// All orders on the dealer side, for the admin board
adminDealers.get('/dealer-orders', (req, res) => {
  const st = String(req.query.status || 'open');
  const where = st === 'open' ? "d.status IN ('sent','accepted','packed','ready','out_for_delivery')" : st === 'late' ? "d.status = 'sent'" : 'd.status = ?';
  const args = ['open', 'late'].includes(st) ? [] : [st];
  const mins = dealerSettings().accept_minutes;
  let rows = db.prepare(`SELECT d.*, o.order_number, o.order_number, o.customer_name, o.ship_city, o.ship_pincode, o.total, x.business_name
    FROM dealer_orders d JOIN orders o ON o.id = d.order_id JOIN dealers x ON x.id = d.dealer_id WHERE ${where} ORDER BY d.sent_at DESC LIMIT 300`).all(...args)
    .map((r) => ({ id: r.id, order_id: r.order_id, order_number: r.order_number, customer: r.customer_name, city: r.ship_city, pincode: r.ship_pincode, total: r.total,
      dealer: r.business_name, dealer_id: r.dealer_id, status: r.status, label: DEALER_STATUS[r.status]?.label, sent_at: r.sent_at, updated_at: r.updated_at,
      late: r.status === 'sent' && Date.now() - Date.parse(r.sent_at) > mins * 6e4, reject_reason: r.reject_reason }));
  if (st === 'late') rows = rows.filter((r) => r.late);
  const unassigned = db.prepare(`SELECT o.id order_id, o.order_number, o.customer_name customer, o.ship_city city, o.ship_pincode pincode, o.total, o.created_at FROM orders o
    WHERE o.payment_status = 'confirmed' AND o.status = 'payment_confirmed' AND NOT EXISTS (SELECT 1 FROM dealer_orders d WHERE d.order_id = o.id AND d.status NOT IN ('rejected','reassigned')) ORDER BY o.id DESC LIMIT 100`).all();
  res.json({ items: rows, unassigned, accept_minutes: mins });
});

adminDealers.post('/orders/:id/dealer', managers, wrap((req, res) => {
  const b = parse(z.object({ dealer_id: z.coerce.number().int().positive().nullable().optional() }), req.body);
  const o = getOrderRow(Number(req.params.id));
  if (!o) throw new HttpError(404, 'Not found');
  const row = assignOrder(o.id, { dealerId: b.dealer_id || null, by: `admin:${req.admin.id}` });
  if (!row) throw new HttpError(409, 'No dealer sells all these products and delivers to this PIN code. Add a dealer or pick one by hand.');
  audit(req, 'assign_dealer', 'order', o.order_number, { dealer_id: row.dealer_id });
  res.json(orderDetail(getOrderRow(o.id), { admin: true }));
}));
export const _currentAssignment = currentAssignment;
