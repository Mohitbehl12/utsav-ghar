import { Router } from 'express';
import { z } from 'zod';
import crypto from 'node:crypto';
import { db, now, parseJSON } from '../db.js';
import { wrap, parse, HttpError } from '../lib/http.js';
import { tokenMatches } from '../lib/auth.js';
import { createOrder, getOrderByNumber, orderDetail } from '../lib/orders.js';
import { pendingFor, CUSTOMER_KINDS } from '../lib/legal.js';
import { getSettings, quote } from '../lib/catalog.js';
import { imageUpload, saveImage } from '../lib/uploads.js';
import { notifyOrder } from '../lib/notify.js';
import { createGatewayOrder, gatewayEnabled, verifyCheckoutSignature, verifyWebhook, fetchPaymentInstrument, describeInstrument } from '../lib/razorpay.js';
import { config } from '../config.js';
import { reportPurchase } from '../lib/conversions.js';
import { cancelOrder, createReturn, returnView, paymentAfterCancel } from '../lib/returns.js';

const r = Router();

const attributionSchema = z.object({
  utm_source: z.string().max(80).optional(), utm_medium: z.string().max(80).optional(), utm_campaign: z.string().max(120).optional(),
  utm_content: z.string().max(120).optional(), utm_term: z.string().max(120).optional(), fbclid: z.string().max(500).optional(),
  fbp: z.string().max(120).optional(), fbc: z.string().max(600).optional(), ga_client_id: z.string().max(80).optional(),
  landing_page: z.string().max(500).optional(), referrer: z.string().max(500).optional(),
  crm_code: z.string().regex(/^[a-z0-9]{6,20}$/).optional(),
}).partial().optional().default({});

import { normalizeIndianPhone } from '../../../shared/phone.js';
import { upsertSubscriber, attributeOrder } from '../lib/crm.js';
import { afterPaymentConfirmed } from '../lib/dealers.js';
const IN_PHONE = /^[6-9]\d{9}$/;
const INTL_PHONE = /^\+?[0-9][0-9\s()-]{6,19}$/;
const orderBody = z.object({
  items: z.array(z.object({ productId: z.coerce.number().int().positive(), qty: z.coerce.number().int().min(1).max(99) })).min(1).max(100),
  couponCode: z.string().trim().max(30).optional().default(''),
  country: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/).optional().default('IN'),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).optional().default('INR'),
  customer: z.object({
    name: z.string().trim().min(2, 'Enter your full name').max(80),
    phone: z.string().trim().max(24),
    email: z.string().trim().email('Enter a valid email').max(200).optional().or(z.literal('')),
  }),
  address: z.object({
    line1: z.string().trim().min(5, 'Enter house no., street').max(200),
    line2: z.string().trim().max(200).optional().or(z.literal('')),
    city: z.string().trim().min(2, 'Enter your city').max(60),
    state: z.string().trim().max(60).optional().or(z.literal('')),
    pincode: z.string().trim().max(12),
  }),
  saveAddress: z.boolean().optional(),
  consent: z.boolean().optional(),
  marketingOptIn: z.boolean().optional(), // separate, unticked box: offers & festival alerts
  checkoutToken: z.string().max(64).optional(),
  attribution: attributionSchema,
  expectedTotal: z.number().int().nonnegative().optional(), // what the customer saw — re-checked server-side
  acceptTerms: z.boolean().optional(), // guests only (when guest checkout is on)
}).superRefine((o, ctx) => {
  const add = (path, message) => ctx.addIssue({ code: 'custom', path, message });
  if (o.country === 'IN') {
    if (o.customer?.phone && (!o.country || o.country === 'IN')) o.customer.phone = normalizeIndianPhone(o.customer.phone);
    if (!IN_PHONE.test(o.customer.phone)) add(['customer', 'phone'], 'Enter a valid 10-digit Indian mobile number');
    if (!/^[1-9]\d{5}$/.test(o.address.pincode)) add(['address', 'pincode'], 'Enter a valid 6-digit PIN code');
    if (!o.address.state || o.address.state.length < 2) add(['address', 'state'], 'Choose your state');
  } else {
    if (!INTL_PHONE.test(o.customer.phone)) add(['customer', 'phone'], 'Enter your phone number with country code, e.g. +971 50 123 4567');
    if (!/^[A-Za-z0-9][A-Za-z0-9 -]{1,11}$/.test(o.address.pincode)) add(['address', 'pincode'], 'Enter your postal / ZIP code');
    if (!o.customer.email) add(['customer', 'email'], 'We need your email to send the secure payment link');
  }
});

db.exec(`CREATE TABLE IF NOT EXISTS order_idempotency (
  key TEXT PRIMARY KEY, scope TEXT NOT NULL, order_id INTEGER NOT NULL, access_token TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')))`);
r.post(
  '/orders',
  wrap(async (req, res) => {
    // Idempotency-Key: a double click or a retry after a dropped connection gets the SAME order back
    const idem = /^[A-Za-z0-9-]{8,64}$/.test(req.get('idempotency-key') || '') ? req.get('idempotency-key') : null;
    const scope = req.user ? `user:${req.user.id}` : `ip:${req.ip}`;
    if (idem) {
      db.prepare("DELETE FROM order_idempotency WHERE created_at < ?").run(new Date(Date.now() - 864e5).toISOString());
      const seen = db.prepare('SELECT * FROM order_idempotency WHERE key = ? AND scope = ?').get(idem, scope);
      if (seen) { const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(seen.order_id); if (o) return res.status(200).json({ order: orderDetail(o), accessToken: seen.access_token, replayed: true }); }
    }
    const b = parse(orderBody, req.body);
    const s = getSettings();
    // accounts only (unless the owner switches guest checkout on), and the current terms must be accepted
    if (!req.user && !s.guest_checkout) throw new HttpError(401, 'Please sign in or create an account to place your order.', { code: 'LOGIN_REQUIRED' });
    if (req.user) {
      const pending = pendingFor('customer', req.user.id, CUSTOMER_KINDS);
      if (pending.length) throw new HttpError(409, 'Please review and accept our updated terms to place your order.', { code: 'TERMS_PENDING', kinds: pending.map((d) => d.kind) });
    } else if (b.acceptTerms !== true) throw new HttpError(400, 'Please accept the Terms & Conditions and Privacy Policy.', { fields: { acceptTerms: 'Required' } });
    const fxRate = b.currency !== 'INR' ? Number(s.fx_rates?.[b.currency]) || null : null;
    const { order, accessToken } = createOrder({ ...b, currency: fxRate ? b.currency : 'INR', fxRate, userId: req.user?.id, clientIp: req.ip, userAgent: req.get('user-agent') });
    if (idem) db.prepare('INSERT OR IGNORE INTO order_idempotency(key, scope, order_id, access_token) VALUES(?,?,?,?)').run(idem, scope, order.id, accessToken);
    if (req.user && b.saveAddress && b.country === 'IN') {
      const exists = db.prepare('SELECT 1 FROM addresses WHERE user_id = ? AND line1 = ? AND pincode = ?').get(req.user.id, b.address.line1, b.address.pincode);
      if (!exists) {
        db.prepare('INSERT INTO addresses(user_id, name, phone, line1, line2, city, state, pincode, is_default) VALUES(?,?,?,?,?,?,?,?, (SELECT COUNT(*) = 0 FROM addresses WHERE user_id = ?))')
          .run(req.user.id, b.customer.name, b.customer.phone, b.address.line1, b.address.line2 || null, b.address.city, b.address.state, b.address.pincode, req.user.id);
      }
    }
    attributeOrder(b.attribution?.crm_code, order.id);
    if (b.marketingOptIn) {
      upsertSubscriber({ name: b.customer.name, email: b.customer.email || null, phone: b.customer.phone, country: b.country,
        emailOptIn: !!b.customer.email, whatsappOptIn: true, frequency: 'weekly', source: 'checkout', userId: req.user?.id });
    }
    notifyOrder(order, 'order_placed').catch(() => {});
    res.status(201).json({ order: orderDetail(order), accessToken });
  })
);

// ---- Checkout sessions (abandoned-cart reminders) ---------------------------------
// Saved when the customer finishes step 1. A reminder is sent only if they ticked
// the consent box, only once, and only while no order has been placed.
r.post(
  '/checkout/session',
  wrap((req, res) => {
    const b = parse(z.object({
      token: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/).optional(),
      name: z.string().trim().max(80).optional(), email: z.string().trim().email().max(200).optional().or(z.literal('')),
      phone: z.string().trim().max(24).optional(), country: z.string().trim().toUpperCase().max(2).optional(),
      consent: z.boolean().optional().default(false),
      items: z.array(z.object({ productId: z.coerce.number().int().positive(), qty: z.coerce.number().int().min(1).max(99) })).min(1).max(100),
      couponCode: z.string().trim().max(30).optional().default(''),
      attribution: attributionSchema,
    }), req.body);
    const q = quote(b.items, b.couponCode, { country: b.country || 'IN' });
    const existing = b.token && db.prepare('SELECT id, order_id FROM checkout_sessions WHERE token = ?').get(b.token);
    const token = existing && !existing.order_id ? b.token : crypto.randomBytes(18).toString('base64url');
    db.prepare(`INSERT INTO checkout_sessions(token, name, email, phone, country, consent, items, value, utm_source, utm_campaign, updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(token) DO UPDATE SET name=excluded.name, email=excluded.email, phone=excluded.phone, country=excluded.country,
      consent=excluded.consent, items=excluded.items, value=excluded.value, updated_at=excluded.updated_at`)
      .run(token, b.name || null, b.email || null, b.phone || null, b.country || 'IN', b.consent ? 1 : 0, JSON.stringify(b.items), q.total, b.attribution?.utm_source || null, b.attribution?.utm_campaign || null, now());
    res.json({ token });
  })
);
// Restore a cart from a reminder link.
r.get(
  '/checkout/session/:token',
  wrap((req, res) => {
    const row = db.prepare('SELECT items, order_id FROM checkout_sessions WHERE token = ?').get(String(req.params.token).slice(0, 64));
    if (!row || row.order_id) throw new HttpError(404, 'This cart link has expired.');
    res.json({ items: parseJSON(row.items, []) });
  })
);

/** Resolve an order the caller is allowed to see: owner session OR guest token. */
function authorizedOrder(req) {
  const o = getOrderByNumber(req.params.number);
  const token = req.get('x-order-token') || req.body?.token || req.query.token;
  if (!o || !((req.user && o.user_id === req.user.id) || tokenMatches(token, o.access_token_hash))) {
    throw new HttpError(404, 'Order not found.');
  }
  return o;
}

r.get('/orders/:number', wrap((req, res) => res.json(orderDetail(authorizedOrder(req)))));

// Customer cancels (free until packed). Paid orders get a full refund opened automatically.
r.post('/orders/:number/cancel', wrap((req, res) => {
  const o = authorizedOrder(req);
  const b = parse(z.object({ reason: z.string().trim().min(3, 'Tell us why you are cancelling').max(300) }), req.body);
  const { order } = cancelOrder(o, { by: 'customer', reason: b.reason });
  notifyOrder(order, 'cancelled').catch(() => {});
  res.json(orderDetail(order));
}));
// Return request (after delivery) — optional photo.
r.post('/orders/:number/returns', imageUpload.single('photo'), wrap((req, res) => {
  const o = authorizedOrder(req);
  let items = req.body?.items;
  if (typeof items === 'string') { try { items = JSON.parse(items); } catch { items = null; } }
  const b = parse(z.object({
    reason: z.string().max(40),
    details: z.string().trim().max(1000).optional().or(z.literal('')),
    items: z.array(z.object({ order_item_id: z.coerce.number().int().positive(), qty: z.coerce.number().int().min(1).max(99) })).min(1, 'Choose at least one item').max(50),
  }), { ...req.body, items });
  const photo = req.file ? saveImage(req.file, { private: true }) : null;
  const rr = createReturn(o, { items: b.items, reason: b.reason, details: b.details, photo, userId: req.user?.id });
  res.status(201).json({ return: returnView(rr), order: orderDetail(getOrderByNumber(o.order_number)) });
}));

// Customer says "I have paid" (manual UPI mode). This does NOT confirm payment —
// it moves the order to "Payment Verification Pending" for an admin to check
// against the bank / UPI merchant statement.
r.post(
  '/orders/:number/payment',
  imageUpload.single('screenshot'),
  wrap((req, res) => {
    const o = authorizedOrder(req);
    const s = getSettings();
    const b = parse(
      z.object({
        txnRef: s.require_txn_ref
          ? z.string().trim().regex(/^[A-Za-z0-9]{8,30}$/, 'Enter the 12-digit UPI reference / UTR number')
          : z.string().trim().max(30).optional().or(z.literal('')),
      }),
      req.body
    );
    if (o.status === 'cancelled') throw new HttpError(409, 'This order was cancelled.');
    if (!['awaiting_payment', 'rejected'].includes(o.payment_status)) throw new HttpError(409, 'Payment for this order has already been submitted.');
    if (req.file && !s.allow_screenshot) throw new HttpError(400, 'Screenshots are not accepted.');
    const ref = b.txnRef ? b.txnRef.toUpperCase() : null;
    if (ref && db.prepare('SELECT 1 FROM payments WHERE customer_ref = ? AND order_id != ?').get(ref, o.id)) {
      throw new HttpError(409, 'This UPI reference has already been used for another order.');
    }
    const shot = req.file ? saveImage(req.file, { private: true }) : null;
    const p = db.prepare('SELECT * FROM payments WHERE order_id = ?').get(o.id);
    db.transaction(() => {
      db.prepare('UPDATE payments SET status = ?, customer_ref = ?, screenshot_path = COALESCE(?, screenshot_path), updated_at = ? WHERE id = ?').run('verification_pending', ref, shot, now(), p.id);
      db.prepare('INSERT INTO payment_transactions(payment_id, type, amount, reference) VALUES(?,?,?,?)').run(p.id, 'customer_submitted', p.amount, ref);
      db.prepare('UPDATE orders SET payment_status = ?, updated_at = ? WHERE id = ?').run('verification_pending', now(), o.id);
      db.prepare('INSERT INTO order_events(order_id, status, note) VALUES(?,?,?)').run(o.id, 'payment_submitted', 'Customer submitted UPI payment details');
    })();
    res.json(orderDetail(getOrderByNumber(o.order_number)));
  })
);

// Public tracking — needs order number AND the phone used at checkout.
r.post(
  '/orders/track',
  wrap((req, res) => {
    const b = parse(z.object({ orderNumber: z.string().trim().min(4).max(30), phone: z.string().trim().min(10).max(16) }), req.body);
    const o = getOrderByNumber(b.orderNumber);
    const digits = (s) => String(s).replace(/\D/g, '').slice(-10);
    if (!o || digits(o.customer_phone) !== digits(b.phone)) throw new HttpError(404, 'We could not find an order with those details.');
    const d = orderDetail(o);
    // minimise PII on the public tracking view
    d.customer = { name: d.customer.name.split(' ')[0] };
    d.address = { city: d.address.city, pincode: d.address.pincode };
    res.json(d);
  })
);

// ---- Payment gateway (optional, recommended for production) ------------------
r.post(
  '/payments/gateway/create',
  wrap(async (req, res) => {
    req.params.number = String(req.body?.orderNumber || '');
    const o = authorizedOrder(req);
    if (o.payment_status === 'confirmed') throw new HttpError(409, 'Already paid.');
    if (o.status === 'cancelled') throw new HttpError(409, 'This order was cancelled, so it cannot be paid.');
    if (!gatewayEnabled()) throw new HttpError(400, 'Online gateway is not enabled. Please pay using the UPI QR.');
    const g = await createGatewayOrder({ amount: o.total, receipt: o.order_number, notes: { order_id: String(o.id) } });
    const p = db.prepare('SELECT id FROM payments WHERE order_id = ?').get(o.id);
    db.prepare('UPDATE payments SET gateway_order_id = ?, method = ?, updated_at = ? WHERE id = ?').run(g.id, 'razorpay', now(), p.id);
    db.prepare('INSERT INTO payment_transactions(payment_id, type, amount, reference, raw) VALUES(?,?,?,?,?)').run(p.id, 'gateway_created', o.total, g.id, JSON.stringify(g));
    res.json({ key: config.razorpay.keyId, gatewayOrderId: g.id, amount: o.total, currency: 'INR', name: o.customer_name, email: o.customer_email, contact: o.customer_phone });
  })
);

function confirmGatewayPayment(payment, paymentId, raw, type) {
  const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(payment.order_id);
  if (o.payment_status === 'confirmed') return o;
  db.transaction(() => {
    db.prepare('UPDATE payments SET status = ?, gateway_payment_id = ?, verified_at = ?, updated_at = ? WHERE id = ?').run('confirmed', paymentId, now(), now(), payment.id);
    db.prepare('INSERT INTO payment_transactions(payment_id, type, amount, reference, raw) VALUES(?,?,?,?,?)').run(payment.id, type, payment.amount, paymentId, JSON.stringify(raw));
    db.prepare("UPDATE orders SET payment_status = 'confirmed', status = CASE WHEN status = 'placed' THEN 'payment_confirmed' ELSE status END, updated_at = ? WHERE id = ?").run(now(), o.id);
    db.prepare('INSERT INTO order_events(order_id, status, note) VALUES(?,?,?)').run(o.id, 'payment_confirmed', 'Verified by payment gateway');
  })();
  const fresh = db.prepare('SELECT * FROM orders WHERE id = ?').get(o.id);
  if (fresh.status === 'cancelled') { paymentAfterCancel(fresh); return fresh; } // paid after cancelling → refund opens, nothing ships
  afterPaymentConfirmed(o.id);
  notifyOrder(fresh, 'payment_confirmed').catch(() => {});
  reportPurchase(fresh.id).catch(() => {});
  return fresh;
}

r.post(
  '/payments/gateway/verify',
  wrap((req, res) => {
    const b = parse(z.object({ razorpay_order_id: z.string(), razorpay_payment_id: z.string(), razorpay_signature: z.string() }), req.body);
    if (!verifyCheckoutSignature(b)) throw new HttpError(400, 'Payment signature verification failed.');
    const p = db.prepare('SELECT * FROM payments WHERE gateway_order_id = ?').get(b.razorpay_order_id);
    if (!p) throw new HttpError(404, 'Payment not found.');
    const o = confirmGatewayPayment(p, b.razorpay_payment_id, b, 'gateway_captured');
    fetchPaymentInstrument(b.razorpay_payment_id).then((ins) => ins && db.prepare('UPDATE payments SET instrument = ? WHERE id = ?').run(ins, p.id)).catch(() => {});
    res.json({ ok: true, orderNumber: o.order_number });
  })
);

// Webhook: mounted with express.raw() in index.js so the signature covers the exact bytes.
export function razorpayWebhook(req, res) {
  if (!verifyWebhook(req.body, req.get('x-razorpay-signature'))) return res.status(400).json({ error: 'bad signature' });
  const evt = JSON.parse(req.body.toString('utf8'));
  if (evt.event === 'payment.captured' || evt.event === 'order.paid') {
    const ent = evt.payload?.payment?.entity;
    const p = ent && db.prepare('SELECT * FROM payments WHERE gateway_order_id = ?').get(ent.order_id);
    if (p && ent.amount === p.amount) {
      confirmGatewayPayment(p, ent.id, evt, 'webhook');
      const ins = describeInstrument(ent);
      if (ins) db.prepare('UPDATE payments SET instrument = COALESCE(instrument, ?) WHERE id = ?').run(ins, p.id);
    }
  }
  res.json({ ok: true });
}

export default r;
