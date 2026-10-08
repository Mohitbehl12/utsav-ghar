/**
 * Built-in AI / ML endpoints (no external AI service, no cost):
 *  Public: chat assistant brain, review highlights.
 *  Admin:  demand forecast & stock alerts, customer groups, order risk, copywriter.
 */
import { Router } from 'express';
import { z } from 'zod';
import { db, parseJSON } from '../db.js';
import { wrap, parse, HttpError } from '../lib/http.js';
import { requireAdmin } from '../lib/auth.js';
import { recData, out } from '../lib/recommend.js';
import { getSettings } from '../lib/catalog.js';
import { crmSettings } from '../lib/crm.js';
import { assist } from '../../../shared/ml/assistant.js';
import { summarizeReviews } from '../../../shared/ml/text.js';
import { forecastDemand, segmentCustomers, orderRisk } from '../../../shared/ml/insights.js';
import { writeProduct } from '../../../shared/ml/writer.js';

export const publicAi = Router();
export const adminAi = Router();

publicAi.post('/assistant', wrap((req, res) => {
  const { q } = parse(z.object({ q: z.string().trim().min(1).max(300) }), req.body);
  const d = recData();
  const r = assist(q, d.rows);
  if (!r) return res.json({ type: null });
  const items = r.items ? out(r.items) : null;
  const product = r.product ? out([r.product])[0] : null;
  const others = r.others ? out(r.others) : null;
  res.json({ ...r, items, product, others });
}));

const summaryCache = new Map();
publicAi.get('/products/:slug/review-summary', wrap((req, res) => {
  const p = db.prepare('SELECT id, updated_at FROM products WHERE slug = ? AND is_active = 1').get(req.params.slug);
  if (!p) throw new HttpError(404, 'Not found');
  const reviews = db.prepare("SELECT rating, body FROM reviews WHERE product_id = ? AND status = 'approved' ORDER BY id DESC LIMIT 200").all(p.id);
  const key = `${p.id}:${reviews.length}`;
  if (!summaryCache.has(key)) summaryCache.set(key, summarizeReviews(reviews));
  res.json({ summary: summaryCache.get(key) });
}));

// ---------------------------------------------------------------- admin
adminAi.use(requireAdmin());
adminAi.use((req, res, next) => (req.admin.must_change_password ? next(new HttpError(403, 'Please change the default password first.', { code: 'MUST_CHANGE_PASSWORD' })) : next()));

adminAi.get('/ai/forecast', wrap((req, res) => {
  const lead = Math.min(60, Math.max(1, Number(req.query.lead) || 10));
  const products = db.prepare(`SELECT p.id, p.name, p.price, p.cost_price, p.is_diwali, p.is_bundle, c.slug category_slug, c.name category_name, c.segment, COALESCE(i.stock, 0) stock
    FROM products p JOIN categories c ON c.id = p.category_id LEFT JOIN inventory i ON i.product_id = p.id WHERE p.is_active = 1 AND p.is_bundle = 0`).all().map((p) => ({ ...p, is_diwali: !!p.is_diwali }));
  const since = new Date(Date.now() - 90 * 864e5).toISOString();
  const sales = db.prepare(`SELECT i.product_id, i.qty, o.created_at at FROM order_items i JOIN orders o ON o.id = i.order_id
    WHERE o.status != 'cancelled' AND o.created_at >= ?`).all(since);
  // combos use up their parts' stock
  for (const b of db.prepare(`SELECT bi.product_id, bi.qty, o.created_at at, i.qty n FROM order_items i JOIN orders o ON o.id = i.order_id JOIN bundle_items bi ON bi.bundle_id = i.product_id
    WHERE o.status != 'cancelled' AND o.created_at >= ?`).all(since)) sales.push({ product_id: b.product_id, qty: b.qty * b.n, at: b.at });
  const rows = forecastDemand({ products, sales, calendar: crmSettings().calendar, leadTime: lead });
  const orders = db.prepare("SELECT COUNT(*) n FROM orders WHERE status != 'cancelled' AND created_at >= ?").get(since).n;
  res.json({ lead, orders_90d: orders, rows, summary: {
    reorder_now: rows.filter((r) => r.status === 'reorder_now' || r.status === 'out').length,
    reorder_soon: rows.filter((r) => r.status === 'reorder_soon').length,
    overstock: rows.filter((r) => r.status === 'overstock').length,
    overstock_value: rows.filter((r) => r.status === 'overstock').reduce((s, r) => s + r.stock_value, 0),
  } });
}));

adminAi.get('/ai/segments', wrap((req, res) => {
  const orders = db.prepare(`SELECT COALESCE('u' || user_id, 'p' || customer_phone) customer, customer_name name, customer_phone phone, customer_email email, total, created_at at
    FROM orders WHERE payment_status = 'confirmed' AND status != 'cancelled'`).all();
  const r = segmentCustomers(orders);
  const subs = new Set(db.prepare("SELECT phone FROM subscribers WHERE status = 'active' AND phone IS NOT NULL").all().map((x) => x.phone));
  for (const g of r.groups) for (const c of g.customers) { c.subscribed = subs.has(c.phone); delete c.key; }
  res.json(r);
}));

export function riskForOrder(o) {
  const day = new Date(Date.parse(o.created_at) - 864e5).toISOString();
  const pay = db.prepare('SELECT customer_ref FROM payments WHERE order_id = ?').get(o.id);
  const lines = db.prepare('SELECT qty FROM order_items WHERE order_id = ?').all(o.id);
  const prevPaid = db.prepare("SELECT COUNT(*) n FROM orders WHERE customer_phone = ? AND id != ? AND payment_status = 'confirmed'").get(o.customer_phone, o.id).n;
  const avg = db.prepare("SELECT AVG(total) a FROM orders WHERE payment_status = 'confirmed'").get().a || 0;
  return orderRisk({
    total: o.total, max_line_qty: Math.max(0, ...lines.map((l) => l.qty)),
    customer: { name: o.customer_name, phone: o.customer_phone, email: o.customer_email },
    address: { state: o.ship_state, pincode: o.ship_pincode, line1: o.ship_line1, country: o.ship_country },
    utr: pay?.customer_ref || null, utr_reused: false, first_order: prevPaid === 0, avg_order: avg,
    same_phone_24h: db.prepare('SELECT COUNT(*) n FROM orders WHERE customer_phone = ? AND created_at BETWEEN ? AND ?').get(o.customer_phone, day, o.created_at).n,
    same_ip_24h: o.client_ip ? db.prepare('SELECT COUNT(*) n FROM orders WHERE client_ip = ? AND created_at BETWEEN ? AND ?').get(o.client_ip, day, o.created_at).n : 0,
    unpaid_same_phone: db.prepare("SELECT COUNT(*) n FROM orders WHERE customer_phone = ? AND id != ? AND payment_status IN ('awaiting_payment','rejected')").get(o.customer_phone, o.id).n,
    international: (o.ship_country || 'IN') !== 'IN',
  });
}

adminAi.get('/ai/risk', wrap((req, res) => {
  const since = new Date(Date.now() - 30 * 864e5).toISOString();
  const rows = db.prepare("SELECT * FROM orders WHERE created_at >= ? AND status != 'cancelled' ORDER BY id DESC LIMIT 300").all(since);
  const items = rows.map((o) => ({ id: o.id, order_number: o.order_number, name: o.customer_name, phone: o.customer_phone, total: o.total, payment_status: o.payment_status, created_at: o.created_at, ...riskForOrder(o) }))
    .sort((a, b) => b.score - a.score);
  res.json({ items, flagged: items.filter((x) => x.level !== 'low').length });
}));
adminAi.get('/ai/risk/:number', wrap((req, res) => {
  const o = db.prepare('SELECT * FROM orders WHERE order_number = ?').get(String(req.params.number).toUpperCase());
  if (!o) throw new HttpError(404, 'Not found');
  res.json(riskForOrder(o));
}));

adminAi.post('/ai/write', wrap((req, res) => {
  const b = parse(z.object({
    name: z.string().trim().min(2).max(120), category_id: z.coerce.number().int().optional(), specs: z.record(z.string().max(300)).optional().default({}),
    price: z.coerce.number().min(0).optional().default(0), mrp: z.coerce.number().min(0).optional().default(0), is_diwali: z.boolean().optional(),
    short_description: z.string().max(300).optional(), variant: z.coerce.number().int().min(0).max(50).optional().default(0),
  }), req.body);
  const cat = b.category_id ? db.prepare('SELECT name, segment FROM categories WHERE id = ?').get(b.category_id) : null;
  const s = getSettings();
  const r = writeProduct({ ...b, price: Math.round(b.price * 100), mrp: Math.round(b.mrp * 100), category_name: cat?.name, segment: cat?.segment }, { festival: s.festival_name || 'Diwali', variant: b.variant });
  res.json(r);
}));
export const _parseJSON = parseJSON;
