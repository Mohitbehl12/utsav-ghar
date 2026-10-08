/**
 * Delivery zones, courier cost and per-PIN unit economics (server, admin and preview).
 *
 * Customer price of a product is the SAME everywhere. What changes by PIN code:
 *   - the delivery charge the customer pays (set by you per zone, free above an amount)
 *   - what the courier charges you (Shiprocket live rate, or your rate card)
 * so profit per order differs by zone, and this module shows exactly how.
 * All money in paise.
 */
import { stateForPin } from './pincode.js';

export const ZONES = {
  local: { label: 'Local', hint: 'Same city as the dealer / warehouse', order: 1 },
  regional: { label: 'Regional', hint: 'Same state', order: 2 },
  metro: { label: 'Metro to metro', hint: 'Between big cities (Delhi, Mumbai, Kolkata, Chennai, Bengaluru, Hyderabad, Pune, Ahmedabad)', order: 3 },
  national: { label: 'Rest of India', hint: 'Everywhere else', order: 4 },
  special: { label: 'Special areas', hint: 'North-East, J&K, Ladakh, Andaman & Lakshadweep', order: 5 },
};
export const ZONE_KEYS = Object.keys(ZONES);

const METRO = ['110', '400', '700', '600', '560', '500', '411', '380'];
const SPECIAL = [/^1[89]/, /^7[89]/, /^737/, /^744/, /^6825[3-5]/];
const clean = (p) => String(p || '').replace(/\D/g, '');
export const validPin = (p) => /^[1-9]\d{5}$/.test(clean(p));

/** Zone between where the parcel starts (dealer / warehouse PIN) and the customer's PIN. */
export function zoneFor(originPin, destPin) {
  const o = clean(originPin); const d = clean(destPin);
  if (!validPin(d)) return 'national';
  if (SPECIAL.some((re) => re.test(d))) return 'special';
  if (!validPin(o)) return 'national';
  if (o.slice(0, 3) === d.slice(0, 3)) return 'local';
  if (METRO.includes(o.slice(0, 3)) && METRO.includes(d.slice(0, 3))) return 'metro';
  const so = stateForPin(o); const sd = stateForPin(d);
  if (so && so === sd) return 'regional';
  return 'national';
}

/** "450 g", "1.3 kg", "1,200 gm" → grams (null if unknown) */
export function parseWeight(s) {
  const m = String(s || '').replace(/,/g, '').match(/(\d+(?:\.\d+)?)\s*(kg|kilo|g|gm|gram)/i);
  if (!m) return null;
  return Math.round(Number(m[1]) * (/^k/i.test(m[2]) ? 1000 : 1));
}
/** "12 × 8 × 15 cm", "30 cm diameter", "150 cm long" → [L, W, H] in cm (null if unknown) */
export function parseDims(s) {
  const t = String(s || '').replace(/,/g, '');
  const n = [...t.matchAll(/(\d+(?:\.\d+)?)/g)].map((m) => Number(m[1]));
  if (!n.length) return null;
  const k = /mm/i.test(t) ? 0.1 : /inch|"|in\b/i.test(t) ? 2.54 : 1;
  if (n.length >= 3) return n.slice(0, 3).map((x) => x * k);
  if (/diam|wide|round/i.test(t) && n.length === 1) return [n[0] * k, n[0] * k, Math.max(5, n[0] * k * 0.3)];
  if (n.length === 2) return [n[0] * k, n[1] * k, 5];
  return [n[0] * k, Math.min(20, n[0] * k), 5];
}

/**
 * Courier companies bill the higher of actual weight and volumetric weight (L×W×H ÷ 5000), in 0.5 kg slabs.
 * Packed parcel adds ~2 cm each side and ~10 % weight.
 */
export function chargeableKg({ weight_g, dims } = {}) {
  const actual = weight_g ? (weight_g * 1.1) / 1000 : 0.5;
  const vol = dims ? ((dims[0] + 4) * (dims[1] + 4) * (dims[2] + 4)) / 5000 : 0;
  return Math.max(0.5, Math.ceil(Math.max(actual, vol) * 2) / 2);
}

// Typical surface-courier aggregator rates (₹, GST included) for a 0.5 kg parcel and each extra 0.5 kg. Edit to your contract.
export const DEFAULT_RATE_CARD = {
  local: { first: 3500, extra: 3000 },
  regional: { first: 4200, extra: 3500 },
  metro: { first: 4800, extra: 4200 },
  national: { first: 5800, extra: 5000 },
  special: { first: 7800, extra: 7000 },
  fuel_pct: 0,              // fuel surcharge, % on top
};
// What the CUSTOMER pays for delivery in each zone (₹), free when the order is at least free_above.
export const DEFAULT_ZONE_FEES = {
  local: { fee: 3900, free_above: 49900 },
  regional: { fee: 4900, free_above: 49900 },
  metro: { fee: 5900, free_above: 79900 },
  national: { fee: 6900, free_above: 99900 },
  special: { fee: 12900, free_above: 149900 },
};

export function rateCardCost(card, zone, kg) {
  const c = { ...DEFAULT_RATE_CARD, ...(card || {}) };
  const z = c[zone] || c.national;
  const extra = Math.max(0, Math.ceil((kg - 0.5) / 0.5));
  return Math.round((z.first + extra * z.extra) * (1 + (Number(c.fuel_pct) || 0) / 100));
}
export function customerFee(fees, zone, orderValue) {
  const f = { ...DEFAULT_ZONE_FEES, ...(fees || {}) }[zone] || DEFAULT_ZONE_FEES.national;
  return f.free_above > 0 && orderValue >= f.free_above ? 0 : f.fee;
}

/**
 * Profit for ONE piece sent to ONE customer.
 * customer pays: price + delivery charge (both include GST if gst_pct > 0)
 * we pay: dealer cost, packaging, other, platform/payment fee (% of what the customer pays), courier
 */
export function unitEconomics({ price, cost, packaging = 0, other = 0, platform_pct = 0, gst_pct = 0, courier = 0, delivery_charged = 0 }) {
  const paid = price + delivery_charged;
  const gst = gst_pct ? Math.round((paid * gst_pct) / (100 + gst_pct)) : 0;
  const platform = Math.round((paid * platform_pct) / 100);
  const expenses = packaging + other + platform + courier;
  const profit = paid - gst - cost - expenses;
  return {
    price, delivery_charged, paid, gst, cost, packaging, other, platform, courier, expenses, profit,
    margin_pct: paid - gst ? Math.round((1000 * profit) / (paid - gst)) / 10 : 0,
    delivery_gap: delivery_charged - courier, // + you earn on delivery, − you pay part of the courier
  };
}

/**
 * Suggested price so that the order to `zone` makes `target` profit (₹ amount, paise),
 * after delivery charge, courier, fees and GST. Rounded up to the next ₹…9.
 */
export function priceForTarget({ target, cost, packaging = 0, other = 0, platform_pct = 0, gst_pct = 0, courier = 0, fees, zone = 'national', rounding = 'nine' }) {
  const solve = (deliv) => {
    // profit = (P + d)·(1 − g/(100+g) − f/100) − cost − packaging − other − courier
    const keep = 1 - gst_pct / (100 + gst_pct) - platform_pct / 100;
    return (target + cost + packaging + other + courier) / keep - deliv;
  };
  const f = { ...DEFAULT_ZONE_FEES, ...(fees || {}) }[zone] || DEFAULT_ZONE_FEES.national;
  let p = solve(f.fee);
  // at or above the free-delivery amount the customer pays no delivery, so the price must cover it alone
  if (f.free_above > 0 && p >= f.free_above) p = Math.max(solve(0), f.free_above);
  const r = Math.ceil(p / 100);
  const nice = rounding === 'nine' ? r + ((9 - (r % 10) + 10) % 10) : r;
  return Math.max(0, nice * 100);
}
