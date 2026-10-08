/**
 * Admin → Pricing by PIN: per-zone / per-PIN unit economics for any product, the
 * delivery-charge table customers pay, the courier rate card, live Shiprocket checks,
 * and actual courier cost per order.
 */
import { Router } from 'express';
import { z } from 'zod';
import { db, now, parseJSON } from '../db.js';
import { wrap, parse, HttpError } from '../lib/http.js';
import { requireAdmin } from '../lib/auth.js';
import { audit } from '../lib/audit.js';
import { setSettings, PRODUCT_SELECT } from '../lib/catalog.js';
import { clearCatalogue } from '../lib/recommend.js';
import { shippingSettings, productParcel, courierCost, orderEconomics } from '../lib/shipping.js';
import {
  ZONES, ZONE_KEYS, zoneFor, chargeableKg, parseDims, rateCardCost, customerFee, unitEconomics, priceForTarget, validPin,
} from '../../../shared/shipping.js';

export const adminPricing = Router();
adminPricing.use(requireAdmin());
const managers = requireAdmin('owner', 'manager');
const paise = (v) => Math.round(Number(v) * 100);

/** Where a product ships from: its dealer's shop, else your pickup PIN. */
function productOrigin(productId) {
  const ds = db.prepare('SELECT d.pincode, d.business_name, d.product_ids, d.category_ids FROM dealers d WHERE d.is_active = 1').all();
  const p = db.prepare('SELECT category_id FROM products WHERE id = ?').get(productId);
  const d = ds.find((x) => parseJSON(x.product_ids, []).includes(productId)) || ds.find((x) => p && parseJSON(x.category_ids, []).includes(p.category_id));
  const s = shippingSettings();
  if (d?.pincode && validPin(d.pincode)) return { pin: d.pincode, label: d.business_name };
  return { pin: s.pickup_pincode || '', label: s.pickup_pincode ? 'Your pickup address' : 'Not set' };
}

function zoneRows({ price, cost, kg, costs, s, overrides = {} }) {
  return ZONE_KEYS.map((zone) => {
    const charged = customerFee(s.zone_fees, zone, price);
    const courier = overrides[zone] != null ? overrides[zone] : rateCardCost(s.rate_card, zone, kg);
    return { zone, label: ZONES[zone].label, source: overrides[zone] != null ? 'manual' : 'rate_card', ...unitEconomics({ price, cost, ...costs, courier, delivery_charged: charged }) };
  });
}

// ---------------------------------------------------------------- settings
adminPricing.get('/pricing/settings', (req, res) => res.json({ ...shippingSettings(), zones: ZONES }));
adminPricing.put('/pricing/settings', requireAdmin('owner'), wrap((req, res) => {
  const zf = z.object({ fee: z.coerce.number().min(0).max(5000), free_above: z.coerce.number().min(0).max(1000000) });
  const rc = z.object({ first: z.coerce.number().min(0).max(5000), extra: z.coerce.number().min(0).max(5000) });
  const b = parse(z.object({
    zone_delivery: z.boolean(),
    pickup_pincode: z.string().trim().regex(/^([1-9]\d{5})?$/, 'Enter a 6-digit PIN code'),
    zone_fees: z.object(Object.fromEntries(ZONE_KEYS.map((k) => [k, zf]))),
    rate_card: z.object({ ...Object.fromEntries(ZONE_KEYS.map((k) => [k, rc])), fuel_pct: z.coerce.number().min(0).max(50).default(0) }),
  }), req.body);
  const toP = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([a, x]) => [a, paise(x)])) : v]));
  setSettings({ zone_delivery: String(b.zone_delivery), pickup_pincode: b.pickup_pincode, zone_fees: JSON.stringify(toP(b.zone_fees)), shipping_rate_card: JSON.stringify(toP(b.rate_card)) });
  clearCatalogue();
  audit(req, 'update', 'settings', 'delivery_by_pin', b);
  res.json({ ...shippingSettings(), zones: ZONES });
}));

// ---------------------------------------------------------------- all products overview
function productRows() {
  const s = shippingSettings();
  return db.prepare(`${PRODUCT_SELECT} WHERE p.is_bundle = 0 ORDER BY p.is_active DESC, p.sort_order, p.id`).all().map((p) => {
    const parcel = productParcel(p);
    const rows = zoneRows({ price: p.price, cost: p.cost_price || 0, kg: parcel.kg, costs: s.costs, s });
    const byZone = Object.fromEntries(rows.map((r) => [r.zone, { profit: r.profit, margin_pct: r.margin_pct, courier: r.courier, charged: r.delivery_charged }]));
    const profits = rows.map((r) => r.profit);
    return {
      id: p.id, name: p.name, category: p.category_name, is_active: !!p.is_active, price: p.price, cost: p.cost_price || 0,
      weight_g: parcel.weight_g, dims: parcel.dims, kg: parcel.kg, parcel_guessed: parcel.guessed, origin: productOrigin(p.id),
      zones: byZone, min_profit: Math.min(...profits), max_profit: Math.max(...profits), loss_zones: rows.filter((r) => r.profit < 0).map((r) => r.zone),
      no_cost: !p.cost_price,
    };
  });
}
adminPricing.get('/pricing/products', (req, res) => {
  const items = productRows();
  res.json({ items, settings: shippingSettings(), zones: ZONES, summary: { products: items.length, with_loss: items.filter((x) => x.loss_zones.length).length, no_cost: items.filter((x) => x.no_cost).length, guessed: items.filter((x) => x.parcel_guessed).length } });
});
adminPricing.get('/pricing/export.csv', (req, res) => {
  const items = productRows();
  const head = ['Product', 'Category', 'Price', 'Cost', 'Chargeable kg', ...ZONE_KEYS.flatMap((z2) => [`${ZONES[z2].label} delivery charged`, `${ZONES[z2].label} courier`, `${ZONES[z2].label} profit`])];
  const cell = (v) => { let c = v == null ? '' : String(v); if (/^[=+\-@]/.test(c)) c = `'${c}`; return /[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c; };
  const rs = (p) => (p / 100).toFixed(2);
  const csv = [head.join(','), ...items.map((x) => [x.name, x.category, rs(x.price), rs(x.cost), x.kg, ...ZONE_KEYS.flatMap((k) => [rs(x.zones[k].charged), rs(x.zones[k].courier), rs(x.zones[k].profit)])].map(cell).join(','))].join('\n');
  res.set('Content-Disposition', `attachment; filename="pricing-by-zone-${new Date().toISOString().slice(0, 10)}.csv"`).type('text/csv').send(`﻿${csv}`);
});

// ---------------------------------------------------------------- calculator
const calcBody = z.object({
  product_id: z.coerce.number().int().positive().optional(),
  price: z.coerce.number().min(0).max(10_00_000).optional(),
  cost: z.coerce.number().min(0).max(10_00_000).optional(),
  weight_g: z.coerce.number().int().min(1).max(100000).optional(),
  dims: z.string().max(60).optional(),
  packaging: z.coerce.number().min(0).max(100000).optional(),
  other: z.coerce.number().min(0).max(100000).optional(),
  platform_pct: z.coerce.number().min(0).max(50).optional(),
  gst_pct: z.coerce.number().min(0).max(40).optional(),
  origin_pin: z.string().trim().regex(/^([1-9]\d{5})?$/).optional(),
  pins: z.array(z.string().trim().regex(/^[1-9]\d{5}$/, 'PIN codes are 6 digits')).max(10).optional().default([]),
  courier_overrides: z.record(z.string(), z.coerce.number().min(0).max(100000)).optional().default({}),
  target_profit: z.coerce.number().min(0).max(10_00_000).optional(),
  qty: z.coerce.number().int().min(1).max(50).optional().default(1),
});
adminPricing.post('/pricing/calc', wrap(async (req, res) => {
  const b = parse(calcBody, req.body);
  const s = shippingSettings();
  const p = b.product_id ? db.prepare(`${PRODUCT_SELECT} WHERE p.id = ?`).get(b.product_id) : null;
  if (b.product_id && !p) throw new HttpError(404, 'Product not found');
  const parcel0 = p ? productParcel(p) : { weight_g: null, dims: null };
  const weight_g = (b.weight_g ?? parcel0.weight_g ?? 500) * b.qty;
  const dims = b.dims ? parseDims(b.dims) : parcel0.dims;
  const kg = chargeableKg({ weight_g, dims: b.qty === 1 ? dims : null });
  const price = (b.price != null ? paise(b.price) : p?.price || 0) * b.qty;
  const cost = (b.cost != null ? paise(b.cost) : p?.cost_price || 0) * b.qty;
  const costs = {
    packaging: b.packaging != null ? paise(b.packaging) : s.costs.packaging, other: b.other != null ? paise(b.other) : s.costs.other,
    platform_pct: b.platform_pct ?? s.costs.platform_pct, gst_pct: b.gst_pct ?? s.costs.gst_pct,
  };
  const origin = b.origin_pin || (p ? productOrigin(p.id).pin : s.pickup_pincode);
  const overrides = Object.fromEntries(Object.entries(b.courier_overrides).filter(([k]) => ZONES[k]).map(([k, v]) => [k, paise(v)]));
  const zones = zoneRows({ price, cost, kg, costs, s, overrides });
  // specific PIN codes: live courier rate when Shiprocket is connected
  const pins = await Promise.all(b.pins.map(async (pin) => {
    const zone = zoneFor(origin, pin);
    const c = overrides[`pin:${pin}`] != null ? { cost: overrides[`pin:${pin}`], source: 'manual' } : await courierCost({ origin, dest: pin, kg });
    const charged = customerFee(s.zone_fees, zone, price);
    return { pin, zone, label: ZONES[zone].label, source: c.source, courier_name: c.courier || null, etd: c.etd || null, note: c.note || null,
      ...unitEconomics({ price, cost, ...costs, courier: c.cost, delivery_charged: charged }) };
  }));
  const target = b.target_profit != null ? paise(b.target_profit) : null;
  const suggestions = target == null ? null : Object.fromEntries(ZONE_KEYS.map((zone) => [zone, priceForTarget({ target, cost, ...costs, courier: overrides[zone] ?? rateCardCost(s.rate_card, zone, kg), fees: s.zone_fees, zone })]));
  res.json({
    product: p ? { id: p.id, name: p.name, price: p.price, cost: p.cost_price, mrp: p.mrp } : null,
    inputs: { price, cost, weight_g, dims, kg, qty: b.qty, origin, ...costs },
    zones, pins, suggestions, live: s.live, settings: { zone_fees: s.zone_fees, rate_card: s.rate_card },
  });
}));

// parcel size used for courier cost
adminPricing.put('/pricing/products/:id/parcel', managers, wrap((req, res) => {
  const id = Number(req.params.id);
  const b = parse(z.object({ weight_g: z.coerce.number().int().min(1).max(100000).nullable(), dims: z.string().trim().max(60).nullable() }), req.body);
  if (!db.prepare('SELECT 1 FROM products WHERE id = ?').get(id)) throw new HttpError(404, 'Not found');
  db.prepare('UPDATE products SET ship_weight_g = ?, ship_dims = ?, updated_at = ? WHERE id = ?').run(b.weight_g, b.dims || null, now(), id);
  audit(req, 'update_parcel', 'product', id, b);
  res.json({ ok: true });
}));

// actual courier bill for an order (manual), so order profit is exact
adminPricing.put('/pricing/orders/:id/courier-cost', managers, wrap((req, res) => {
  const id = Number(req.params.id);
  const { amount } = parse(z.object({ amount: z.coerce.number().min(0).max(100000).nullable() }), req.body);
  if (!db.prepare('SELECT 1 FROM orders WHERE id = ?').get(id)) throw new HttpError(404, 'Not found');
  db.prepare('UPDATE orders SET ship_cost_actual = ?, updated_at = ? WHERE id = ?').run(amount == null ? null : paise(amount), now(), id);
  audit(req, 'courier_cost', 'order', id, { amount });
  res.json(orderEconomics(id));
}));

adminPricing.get('/pricing/orders/:id', wrap((req, res) => {
  const r = orderEconomics(Number(req.params.id));
  if (!r) throw new HttpError(404, 'Not found');
  res.json(r);
}));
