/**
 * Delivery by PIN code: zone → delivery charge for the customer, and courier cost for us
 * (Shiprocket live rate when SHIPROCKET_EMAIL / SHIPROCKET_PASSWORD are set, else your rate card).
 * Rules live in shared/shipping.js.
 */
import { db, now, parseJSON } from '../db.js';
import { getSettings, zoneFor as countryZone } from './catalog.js';
import {
  ZONES, unitEconomics, zoneFor, chargeableKg, parseWeight, parseDims, rateCardCost, customerFee, validPin,
  DEFAULT_RATE_CARD, DEFAULT_ZONE_FEES, ZONE_KEYS,
} from '../../../shared/shipping.js';
import { pickDealer } from '../../../shared/dealers.js';
import { PRICING_DEFAULTS } from '../../../shared/dealerPricing.js';
import { canReceiveOrders } from './legal.js';

db.exec(`CREATE TABLE IF NOT EXISTS courier_rate_cache (
  key TEXT PRIMARY KEY, cost INTEGER NOT NULL, courier TEXT, etd TEXT, fetched_at TEXT NOT NULL
)`);
const cols = (t) => db.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name);
const addColumn = (t, c, d) => { if (!cols(t).includes(c)) db.exec(`ALTER TABLE ${t} ADD COLUMN ${c} ${d}`); };
addColumn('products', 'ship_weight_g', 'INTEGER');      // packed product weight, overrides specs.Weight
addColumn('products', 'ship_dims', 'TEXT');             // "L×W×H" cm, overrides specs.Dimensions
addColumn('orders', 'ship_zone', 'TEXT');
addColumn('orders', 'ship_origin_pin', 'TEXT');
addColumn('orders', 'ship_kg', 'REAL');
addColumn('orders', 'ship_cost_est', 'INTEGER');        // courier cost estimate when ordered (paise)
addColumn('orders', 'ship_cost_source', 'TEXT');        // shiprocket | rate_card
addColumn('orders', 'ship_cost_actual', 'INTEGER');     // from the courier bill (entered by admin)

const obj = (v, d) => (v && typeof v === 'object' ? v : parseJSON(v, d) || d);

export function shippingSettings() {
  const s = getSettings();
  const fees = obj(s.zone_fees, null);
  // until the owner sets zone charges, "Rest of India" keeps the store's old flat delivery fee
  const india = countryZone('IN');
  const nationalDefault = india && (india.countries || []).includes('IN')
    ? { fee: Number(india.fee), free_above: Number(india.free_above) }
    : { fee: Number(s.delivery_fee ?? DEFAULT_ZONE_FEES.national.fee), free_above: Number(s.free_delivery_above ?? DEFAULT_ZONE_FEES.national.free_above) };
  const zone_fees = fees || { ...DEFAULT_ZONE_FEES, national: nationalDefault };
  const costs = { ...PRICING_DEFAULTS, ...obj(s.dealer_pricing_defaults, {}) };
  return {
    zone_delivery: s.zone_delivery !== 'false' && s.zone_delivery !== false,
    pickup_pincode: s.pickup_pincode || '',
    rate_card: { ...DEFAULT_RATE_CARD, ...obj(s.shipping_rate_card, {}) },
    zone_fees,
    costs: { packaging: costs.packaging, other: costs.other, platform_pct: costs.platform_pct, gst_pct: costs.gst_pct },
    live: liveEnabled(),
  };
}

export const liveEnabled = () => !!(process.env.SHIPROCKET_EMAIL && process.env.SHIPROCKET_PASSWORD);

/** Product weight (g) and box size (cm): admin's shipping fields first, else read from the product details. */
export function productParcel(p) {
  const specs = obj(p.specs, {});
  const weight_g = p.ship_weight_g || parseWeight(specs.Weight) || null;
  const dims = (p.ship_dims && parseDims(p.ship_dims)) || parseDims(specs.Dimensions) || null;
  return { weight_g, dims, kg: chargeableKg({ weight_g, dims }), guessed: !p.ship_weight_g && !specs.Weight };
}

/** Where the parcel would start for these items + PIN: the dealer who would get the order, else your pickup PIN. */
export function originFor(items, pin) {
  try {
    const rows = items.map((i) => db.prepare('SELECT id product_id, category_id FROM products WHERE id = ?').get(Number(i.productId ?? i.product_id))).filter(Boolean);
    const dealers = db.prepare('SELECT * FROM dealers WHERE is_active = 1').all().filter(canReceiveOrders).map((d) => ({
      id: d.id, is_active: true, pincode: d.pincode, all_india: !!d.all_india, pincodes: parseJSON(d.pincodes, []),
      category_ids: parseJSON(d.category_ids, []), product_ids: parseJSON(d.product_ids, []), priority: d.priority, open_orders: 0,
    }));
    const d = rows.length && validPin(pin) ? pickDealer({ dealers, items: rows, pincode: pin }).dealer : null;
    if (d?.pincode && validPin(d.pincode)) return { pin: d.pincode, from: 'dealer', dealer_id: d.id };
  } catch { /* fall back */ }
  const s = shippingSettings();
  return { pin: s.pickup_pincode, from: 'warehouse' };
}

/** Delivery charge the customer pays (used by the cart quote). */
export function deliveryForCustomer({ items, pincode, orderValue }) {
  const s = shippingSettings();
  if (!s.zone_delivery) return null;
  const origin = originFor(items || [], pincode);
  const zone = validPin(pincode) ? zoneFor(origin.pin, pincode) : 'national';
  const f = s.zone_fees[zone] || s.zone_fees.national;
  return { zone, fee: f.fee, free_above: f.free_above, charge: customerFee(s.zone_fees, zone, orderValue), known: validPin(pincode) };
}

// ---------------------------------------------------------------- courier cost
let token = null; let tokenAt = 0;
async function shiprocketToken() {
  if (token && Date.now() - tokenAt < 8 * 864e5) return token;
  const r = await fetch('https://apiv2.shiprocket.in/v1/external/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: process.env.SHIPROCKET_EMAIL, password: process.env.SHIPROCKET_PASSWORD }),
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error(`Shiprocket login failed (${r.status})`);
  token = (await r.json()).token; tokenAt = Date.now();
  return token;
}

/**
 * What the courier will charge us for one parcel. Live from Shiprocket (cached 24 h per route & slab)
 * when configured, otherwise from the rate card. Never throws.
 */
export async function courierCost({ origin, dest, kg }) {
  const s = shippingSettings();
  const zone = zoneFor(origin, dest);
  const card = { cost: rateCardCost(s.rate_card, zone, kg), source: 'rate_card', courier: null, etd: null, zone };
  if (!s.live || !validPin(origin) || !validPin(dest)) return card;
  const key = `${origin}:${dest}:${kg}`;
  const hit = db.prepare('SELECT * FROM courier_rate_cache WHERE key = ?').get(key);
  if (hit && Date.now() - Date.parse(hit.fetched_at) < 864e5) return { cost: hit.cost, source: 'shiprocket', courier: hit.courier, etd: hit.etd, zone };
  try {
    const t = await shiprocketToken();
    const u = `https://apiv2.shiprocket.in/v1/external/courier/serviceability/?pickup_postcode=${origin}&delivery_postcode=${dest}&weight=${kg}&cod=0`;
    const r = await fetch(u, { headers: { Authorization: `Bearer ${t}` }, signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json();
    const list = j?.data?.available_courier_companies || [];
    if (!list.length) return { ...card, note: 'Shiprocket: no courier serves this PIN, showing rate card' };
    const rec = list.find((c) => c.courier_company_id === j.data.recommended_courier_company_id) || list.reduce((a, b) => (Number(b.rate) < Number(a.rate) ? b : a));
    const cost = Math.round(Number(rec.rate) * 100);
    db.prepare('INSERT INTO courier_rate_cache(key, cost, courier, etd, fetched_at) VALUES(?,?,?,?,?) ON CONFLICT(key) DO UPDATE SET cost = excluded.cost, courier = excluded.courier, etd = excluded.etd, fetched_at = excluded.fetched_at')
      .run(key, cost, rec.courier_name || null, rec.etd || null, now());
    return { cost, source: 'shiprocket', courier: rec.courier_name || null, etd: rec.etd || null, zone };
  } catch (e) {
    return { ...card, note: `Shiprocket unavailable (${String(e.message).slice(0, 60)}), showing rate card` };
  }
}

/** Record the zone and expected courier cost on a new order (quick rate-card estimate, then live in the background). */
export function recordOrderShipping(orderId) {
  try {
    const o = db.prepare('SELECT id, ship_pincode, ship_country FROM orders WHERE id = ?').get(orderId);
    if (!o || (o.ship_country || 'IN') !== 'IN') return;
    const items = db.prepare('SELECT i.product_id, i.qty, p.specs, p.ship_weight_g, p.ship_dims FROM order_items i LEFT JOIN products p ON p.id = i.product_id WHERE i.order_id = ?').all(orderId);
    const grams = items.reduce((g, i) => g + (productParcel(i).weight_g || 500) * i.qty, 0);
    const kg = chargeableKg({ weight_g: grams, dims: items.length === 1 && items[0].qty === 1 ? productParcel(items[0]).dims : null });
    const origin = originFor(items, o.ship_pincode);
    const zone = zoneFor(origin.pin, o.ship_pincode);
    const s = shippingSettings();
    db.prepare('UPDATE orders SET ship_zone = ?, ship_origin_pin = ?, ship_kg = ?, ship_cost_est = ?, ship_cost_source = ? WHERE id = ?')
      .run(zone, origin.pin || null, kg, rateCardCost(s.rate_card, zone, kg), 'rate_card', orderId);
    if (s.live && validPin(origin.pin)) {
      courierCost({ origin: origin.pin, dest: o.ship_pincode, kg }).then((c) => {
        if (c.source === 'shiprocket') db.prepare('UPDATE orders SET ship_cost_est = ?, ship_cost_source = ? WHERE id = ?').run(c.cost, 'shiprocket', orderId);
      }).catch(() => {});
    }
  } catch { /* never block an order */ }
}

/** Profit of one order: what the customer paid minus GST, product cost, packaging, fees and courier. */
export function orderEconomics(orderId) {
  const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (!o) return null;
  const s = shippingSettings();
  const items = db.prepare('SELECT qty, unit_cost FROM order_items WHERE order_id = ?').all(orderId);
  const units = items.reduce((a, i) => a + i.qty, 0);
  const cost = items.reduce((a, i) => a + (i.unit_cost || 0) * i.qty, 0);
  const courier = o.ship_cost_actual ?? o.ship_cost_est ?? 0;
  const e = unitEconomics({ price: o.subtotal - o.discount, cost, packaging: s.costs.packaging, other: s.costs.other * units, platform_pct: s.costs.platform_pct, gst_pct: s.costs.gst_pct, courier, delivery_charged: o.delivery_fee });
  return { ...e, zone: o.ship_zone, zone_label: ZONES[o.ship_zone]?.label || null, origin_pin: o.ship_origin_pin, kg: o.ship_kg,
    courier_est: o.ship_cost_est, courier_actual: o.ship_cost_actual, courier_source: o.ship_cost_actual != null ? 'actual' : o.ship_cost_source || 'rate_card', international: (o.ship_country || 'IN') !== 'IN' };
}

export { ZONE_KEYS };
