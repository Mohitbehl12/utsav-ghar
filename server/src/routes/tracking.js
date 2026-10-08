/**
 * Admin → Delivery tracking dashboard: every order's journey through the dealer
 * (sent → accepted → packed → ready → out → delivered), courier / delivery-person
 * details, stage times, on-time %, courier & dealer performance, CSV export,
 * courier checkpoints (manual or via a courier webhook).
 */
import { Router } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { db, parseJSON } from '../db.js';
import { wrap, parse, HttpError } from '../lib/http.js';
import { requireAdmin } from '../lib/auth.js';
import { audit } from '../lib/audit.js';
import { secEvent } from '../lib/security.js';
import { courierUpdate, dealerSettings } from '../lib/dealers.js';
import { DEALER_STATUS, COURIER_UPDATES, minutesBetween, isOpen } from '../../../shared/dealers.js';

export const adminTracking = Router();
export const courierWebhook = Router();
adminTracking.use(requireAdmin());

const RANGES = { today: 0, '7d': 7, '30d': 30, '90d': 90 };
function since(range) {
  if (range === 'all' || !(range in RANGES)) return range === 'all' ? null : new Date(Date.now() - 30 * 864e5).toISOString();
  if (range === 'today') { const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString(); }
  return new Date(Date.now() - RANGES[range] * 864e5).toISOString();
}
const avg = (xs) => { const v = xs.filter((x) => x != null); return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null; };
const dayOf = (iso) => (iso ? new Date(Date.parse(iso) + 5.5 * 36e5).toISOString().slice(0, 10) : null); // IST calendar day

function shipmentRow(r, acceptMin) {
  const items = db.prepare('SELECT product_name name, qty FROM order_items WHERE order_id = ? ORDER BY id').all(r.order_id);
  const tracking = parseJSON(r.tracking, []);
  const last = tracking.at(-1) || null;
  const today = dayOf(new Date().toISOString());
  const delivered = r.status === 'delivered';
  const etaLate = r.estimated_delivery ? (delivered ? dayOf(r.delivered_at) > r.estimated_delivery : today > r.estimated_delivery && isOpen(r.status)) : false;
  return {
    id: r.id, order_id: r.order_id, order_number: r.order_number, status: r.status, label: DEALER_STATUS[r.status]?.label,
    dealer_id: r.dealer_id, dealer: r.business_name, dealer_city: r.dealer_city,
    customer: r.customer_name, phone: r.customer_phone, city: r.ship_city, pincode: r.ship_pincode, total: r.total,
    products: items.map((i) => `${i.name} × ${i.qty}`), units: items.reduce((s, i) => s + i.qty, 0),
    ordered_at: r.created_at, paid_at: r.paid_at, sent_at: r.sent_at, accepted_at: r.accepted_at, packed_at: r.packed_at, ready_at: r.ready_at,
    out_at: r.out_at, courier_out_at: r.courier_out_at, delivered_at: r.delivered_at, estimated_delivery: r.estimated_delivery,
    mode: r.delivery_mode, courier_name: r.courier_name, awb: r.awb, tracking_url: r.tracking_url, rider_name: r.rider_name, rider_phone: r.rider_phone, received_by: r.received_by,
    last_update: last ? { ...last, label: COURIER_UPDATES[last.status]?.label } : null,
    attempts: tracking.filter((x) => x.status === 'attempt_failed').length,
    late_accept: r.status === 'sent' && Date.now() - Date.parse(r.sent_at) > acceptMin * 6e4,
    late_eta: etaLate, on_time: delivered ? !etaLate : null,
    times: {
      to_dealer: minutesBetween(r.paid_at || r.created_at, r.sent_at),
      accept: minutesBetween(r.sent_at, r.accepted_at), pack: minutesBetween(r.accepted_at, r.packed_at), ready: minutesBetween(r.packed_at, r.ready_at),
      handover: minutesBetween(r.ready_at, r.out_at), deliver: minutesBetween(r.out_at, r.delivered_at), total: minutesBetween(r.created_at, r.delivered_at),
    },
    updated_at: r.updated_at,
  };
}

const BASE = `SELECT d.*, o.order_number, o.customer_name, o.customer_phone, o.ship_city, o.ship_pincode, o.total, o.created_at, o.estimated_delivery,
    (SELECT MIN(created_at) FROM order_events e WHERE e.order_id = o.id AND e.status = 'payment_confirmed') paid_at,
    x.business_name, x.city dealer_city
  FROM dealer_orders d JOIN orders o ON o.id = d.order_id JOIN dealers x ON x.id = d.dealer_id`;

function load(q) {
  const where = ["d.status NOT IN ('rejected','reassigned')"]; const args = [];
  const from = since(q.range || '30d');
  if (from) { where.push('d.sent_at >= ?'); args.push(from); }
  if (q.dealer) { where.push('d.dealer_id = ?'); args.push(Number(q.dealer)); }
  if (q.mode === 'self' || q.mode === 'courier') { where.push('d.delivery_mode = ?'); args.push(q.mode); }
  if (q.mode === 'none') where.push('d.delivery_mode IS NULL');
  if (q.courier) { where.push('d.courier_name = ?'); args.push(String(q.courier)); }
  if (q.q) {
    const s = `%${String(q.q).trim().slice(0, 40)}%`;
    where.push('(o.order_number LIKE ? OR d.awb LIKE ? OR o.customer_phone LIKE ? OR o.customer_name LIKE ? OR o.ship_pincode LIKE ?)'); args.push(s, s, s, s, s);
  }
  return db.prepare(`${BASE} WHERE ${where.join(' AND ')} ORDER BY d.updated_at DESC LIMIT 1000`).all(...args);
}

adminTracking.get('/tracking', wrap((req, res) => {
  const q = parse(z.object({ range: z.enum(['today', '7d', '30d', '90d', 'all']).optional().default('30d'), dealer: z.coerce.number().int().optional(), mode: z.enum(['self', 'courier', 'none', '']).optional(),
    courier: z.string().max(60).optional(), status: z.string().max(30).optional(), q: z.string().max(60).optional(), flag: z.enum(['late_accept', 'late_eta', 'attempts', '']).optional() }), req.query);
  const acceptMin = dealerSettings().accept_minutes;
  const all = load(q).map((r) => shipmentRow(r, acceptMin));
  // KPIs & pipeline use every shipment in range; the table also applies the status / flag filter
  const by = (s) => all.filter((x) => x.status === s);
  const delivered = by('delivered');
  const kpis = {
    total: all.length,
    in_pipeline: all.filter((x) => isOpen(x.status)).length,
    waiting_accept: by('sent').length,
    late_accept: all.filter((x) => x.late_accept).length,
    out_for_delivery: by('out_for_delivery').length,
    delivered: delivered.length,
    on_time_pct: delivered.length ? Math.round((100 * delivered.filter((x) => x.on_time).length) / delivered.length) : null,
    overdue: all.filter((x) => isOpen(x.status) && x.late_eta).length,
    avg_total_min: avg(delivered.map((x) => x.times.total)),
    failed_attempts: all.reduce((s, x) => s + x.attempts, 0),
    cancelled: by('cancelled').length,
  };
  const pipeline = ['sent', 'accepted', 'packed', 'ready', 'out_for_delivery', 'delivered'].map((s) => ({ status: s, label: DEALER_STATUS[s].label, count: by(s).length }));
  const stage_times = [
    ['to_dealer', 'Payment → sent to dealer'], ['accept', 'Sent → accepted'], ['pack', 'Accepted → packed'], ['ready', 'Packed → ready'], ['handover', 'Ready → out for delivery'], ['deliver', 'Out → delivered'],
  ].map(([k, label]) => ({ key: k, label, avg_min: avg(all.map((x) => x.times[k])) }));

  const groupBy = (list, key) => { const m = new Map(); for (const x of list) { const k = key(x); if (k == null) continue; if (!m.has(k)) m.set(k, []); m.get(k).push(x); } return m; };
  const perf = (xs) => {
    const d = xs.filter((x) => x.status === 'delivered');
    return { shipments: xs.length, open: xs.filter((x) => isOpen(x.status)).length, delivered: d.length, in_transit: xs.filter((x) => x.status === 'out_for_delivery').length,
      on_time_pct: d.length ? Math.round((100 * d.filter((x) => x.on_time).length) / d.length) : null, avg_deliver_min: avg(d.map((x) => x.times.deliver)),
      attempts: xs.reduce((s, x) => s + x.attempts, 0), overdue: xs.filter((x) => isOpen(x.status) && x.late_eta).length };
  };
  const couriers = [...groupBy(all.filter((x) => x.mode), (x) => (x.mode === 'self' ? '🛵 Own delivery (dealers)' : x.courier_name || 'Courier'))]
    .map(([name, xs]) => ({ name, mode: xs[0].mode, ...perf(xs) })).sort((a, b) => b.shipments - a.shipments);
  const from = since(q.range || '30d');
  const declined = new Map(db.prepare(`SELECT dealer_id, COUNT(*) n FROM dealer_orders WHERE status IN ('rejected','reassigned') ${from ? 'AND sent_at >= ?' : ''} GROUP BY dealer_id`).all(...(from ? [from] : [])).map((r) => [r.dealer_id, r.n]));
  const dealers = [...groupBy(all, (x) => x.dealer_id)].map(([id, xs]) => ({ id, name: xs[0].dealer, city: xs[0].dealer_city, ...perf(xs),
    avg_accept_min: avg(xs.map((x) => x.times.accept)), avg_ready_min: avg(xs.map((x) => minutesBetween(x.sent_at, x.ready_at))), declined: declined.get(id) || 0,
    waiting: xs.filter((x) => x.status === 'sent').length })).sort((a, b) => b.shipments - a.shipments);

  let items = all;
  if (q.status) items = items.filter((x) => (q.status === 'open' ? isOpen(x.status) : x.status === q.status));
  if (q.flag === 'late_accept') items = items.filter((x) => x.late_accept);
  if (q.flag === 'late_eta') items = items.filter((x) => isOpen(x.status) && x.late_eta);
  if (q.flag === 'attempts') items = items.filter((x) => x.attempts > 0);
  res.set('Cache-Control', 'no-store').json({
    range: q.range, kpis, pipeline, stage_times, couriers, dealers, items: items.slice(0, 300), total_items: items.length, accept_minutes: acceptMin,
    options: {
      dealers: db.prepare('SELECT id, business_name name FROM dealers ORDER BY business_name').all(),
      couriers: db.prepare("SELECT DISTINCT courier_name c FROM dealer_orders WHERE courier_name IS NOT NULL ORDER BY 1").all().map((x) => x.c),
    },
  });
}));

adminTracking.get('/tracking/export.csv', wrap((req, res) => {
  const acceptMin = dealerSettings().accept_minutes;
  const rows = load(req.query).map((r) => shipmentRow(r, acceptMin));
  const cols = [['Order', 'order_number'], ['Status', 'label'], ['Dealer', 'dealer'], ['Customer', 'customer'], ['City', 'city'], ['PIN', 'pincode'], ['Products', (x) => x.products.join('; ')],
    ['Ordered', 'ordered_at'], ['Sent to dealer', 'sent_at'], ['Accepted', 'accepted_at'], ['Packed', 'packed_at'], ['Ready', 'ready_at'], ['Out for delivery', 'out_at'], ['Delivered', 'delivered_at'],
    ['Delivery by', (x) => (x.mode === 'self' ? 'Own delivery' : x.mode === 'courier' ? 'Courier' : '')], ['Courier', 'courier_name'], ['AWB', 'awb'], ['Delivery person', 'rider_name'], ['Received by', 'received_by'],
    ['Promised date', 'estimated_delivery'], ['On time', (x) => (x.on_time == null ? '' : x.on_time ? 'Yes' : 'No')], ['Hours to deliver', (x) => (x.times.total == null ? '' : (x.times.total / 60).toFixed(1))]];
  // neutralise spreadsheet formulas (=, +, -, @) in user-entered text
  const cell = (v) => { let s = v == null ? '' : String(v); if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const csv = [cols.map((c) => c[0]).join(','), ...rows.map((x) => cols.map(([, k]) => cell(typeof k === 'function' ? k(x) : x[k])).join(','))].join('\n');
  audit(req, 'export', 'tracking', null, { rows: rows.length });
  res.set('Content-Disposition', `attachment; filename="delivery-tracking-${new Date().toISOString().slice(0, 10)}.csv"`).type('text/csv').send(`﻿${csv}`);
}));

adminTracking.get('/tracking/:id', wrap((req, res) => {
  const r = db.prepare(`${BASE} WHERE d.id = ?`).get(Number(req.params.id));
  if (!r) throw new HttpError(404, 'Not found');
  const row = shipmentRow(r, dealerSettings().accept_minutes);
  const events = db.prepare('SELECT status, note, created_at FROM order_events WHERE order_id = ? ORDER BY id').all(r.order_id).filter((e) => e.status !== 'conversion_reported');
  const history = db.prepare('SELECT d.status, d.reject_reason, d.sent_at, d.closed_at, x.business_name FROM dealer_orders d JOIN dealers x ON x.id = d.dealer_id WHERE d.order_id = ? ORDER BY d.id').all(r.order_id);
  const items = db.prepare('SELECT product_name name, qty, line_total FROM order_items WHERE order_id = ? ORDER BY id').all(r.order_id);
  res.json({ ...row, items, events, history, tracking: parseJSON(r.tracking, []).map((x) => ({ ...x, label: COURIER_UPDATES[x.status]?.label })), address: { line1: r.ship_line1 } });
}));

const updateSchema = z.object({
  status: z.enum(Object.keys(COURIER_UPDATES)),
  location: z.string().trim().max(80).optional(),
  note: z.string().trim().max(200).optional(),
  received_by: z.string().trim().max(60).optional(),
  at: z.string().max(40).optional(),
});
adminTracking.post('/tracking/:id/update', requireAdmin('owner', 'manager', 'support'), wrap((req, res) => {
  const b = parse(updateSchema, req.body);
  const row = db.prepare('SELECT * FROM dealer_orders WHERE id = ?').get(Number(req.params.id));
  const fresh = courierUpdate(row, b, `admin:${req.admin.id}`);
  audit(req, 'courier_update', 'shipment', row.id, b);
  res.json({ ok: true, status: fresh.status });
}));

// ---------------------------------------------------------------- courier webhook
// POST /api/webhooks/courier with header "X-Courier-Token: <COURIER_WEBHOOK_SECRET>"
// body: { awb, status, location?, at?, received_by?, note? }  (or an array of these)
const STATUS_WORDS = [
  [/deliver(ed)?\b(?!.*(fail|attempt|un))|^dl$/i, 'delivered'],
  [/out.?for.?delivery|^ofd$/i, 'out_for_delivery'],
  [/undeliver|attempt|fail|not.?available|ndr/i, 'attempt_failed'],
  [/pick(ed)?.?up|manifest/i, 'picked_up'],
  [/transit|dispatch|hub|reached|bagged|shipped/i, 'in_transit'],
];
export const mapCourierStatus = (s) => (COURIER_UPDATES[s] ? s : STATUS_WORDS.find(([re]) => re.test(String(s || '')))?.[1] || null);

courierWebhook.post('/webhooks/courier', wrap((req, res) => {
  const secret = process.env.COURIER_WEBHOOK_SECRET || '';
  if (secret.length < 16) throw new HttpError(404, 'Not found');
  const got = Buffer.from(String(req.get('x-courier-token') || ''));
  const want = Buffer.from(secret);
  if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) { secEvent('webhook_rejected', `ip:${req.ip}`, req, { hook: 'courier' }); throw new HttpError(401, 'Bad token'); }
  const list = (Array.isArray(req.body) ? req.body : [req.body]).slice(0, 100);
  const results = list.map((u) => {
    const awb = String(u?.awb || u?.awb_code || u?.tracking_number || '').trim();
    const status = mapCourierStatus(u?.status || u?.current_status);
    const row = awb && db.prepare("SELECT * FROM dealer_orders WHERE awb = ? AND delivery_mode = 'courier' ORDER BY id DESC LIMIT 1").get(awb);
    if (!row) return { awb, ok: false, error: 'unknown AWB' };
    if (!status) return { awb, ok: false, error: 'unknown status' };
    try { courierUpdate(row, { status, location: u.location, note: u.note || u.status, received_by: u.received_by, at: u.at || u.timestamp }, 'courier'); return { awb, ok: true, status }; }
    catch (e) { return { awb, ok: false, error: e.message }; }
  });
  res.json({ results });
}));
