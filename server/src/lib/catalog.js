import { db, parseJSON } from '../db.js';
import { computeQuote, isOfferLive, isProductEligible, offerLabel, offerMaxPercent, offerTag, offerHeadline } from '../../../shared/pricing.js';
import { deliveryForCustomer } from './shipping.js';
import { ZONES } from '../../../shared/shipping.js';
import { config } from '../config.js';

// ---- settings --------------------------------------------------------------
const NUMERIC = new Set(['delivery_fee', 'free_delivery_above', 'fx_markup_pct']);
const BOOL = new Set(['require_txn_ref', 'allow_screenshot', 'international_enabled', 'guest_checkout']);
const JSONKEYS = new Set(['fx_rates']);

export function getSettings() {
  const out = {};
  for (const { key, value } of db.prepare('SELECT key, value FROM settings').all()) {
    out[key] = NUMERIC.has(key) ? Number(value) : BOOL.has(key) ? value === 'true' : JSONKEYS.has(key) ? parseJSON(value, {}) : value;
  }
  return out;
}
export function setSettings(obj) {
  const stmt = db.prepare('INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  db.transaction(() => {
    for (const [k, v] of Object.entries(obj)) stmt.run(k, v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v));
  })();
}
/** Only non-secret settings are ever sent to the browser. */
export function publicSettings() {
  const s = getSettings();
  return {
    store_name: s.store_name,
    support_phone: s.support_phone,
    whatsapp_number: s.whatsapp_number || '',
    support_email: s.support_email,
    upi_id: s.upi_id,
    upi_payee_name: s.upi_payee_name,
    upi_qr_url: s.upi_qr_url,
    festival_name: s.festival_name,
    festival_date: s.festival_date,
    payment_mode: s.payment_mode,
    gateway_provider: s.gateway_provider,
    gateway_key_id: s.gateway_key_id, // publishable key only
    delivery_fee: s.delivery_fee,
    free_delivery_above: s.free_delivery_above,
    require_txn_ref: s.require_txn_ref,
    allow_screenshot: s.allow_screenshot,
    guest_checkout: !!s.guest_checkout,
    meta_pixel_id: s.meta_pixel_id || '',
    ga4_measurement_id: s.ga4_measurement_id || '',
    international_enabled: !!s.international_enabled,
    fx_rates: s.fx_rates || {},
    fx_markup_pct: s.fx_markup_pct || 0,
    shipping_zones: loadZones().map(publicZone),
    festival_emoji: s.festival_emoji || '🎉',
    festival_headline: s.festival_headline || '',
    festival_subtitle: s.festival_subtitle || '',
    app_store_url: s.app_store_url || '',
    play_store_url: s.play_store_url || '',
    signup_otp: config.signupOtp,
    test_mode: config.testMode,
  };
}

// ---- shipping zones ---------------------------------------------------------
export function loadZones({ includeInactive = false } = {}) {
  return db.prepare(`SELECT * FROM shipping_zones ${includeInactive ? '' : 'WHERE is_active = 1'} ORDER BY sort_order, id`).all()
    .map((z) => ({ ...z, countries: parseJSON(z.countries, []), is_active: !!z.is_active }));
}
const publicZone = (z) => ({ code: z.code, name: z.name, countries: z.countries, fee: z.fee, extra_item_fee: z.extra_item_fee, free_above: z.free_above, delivery_text: z.delivery_text, duties_note: z.duties_note });
export function zoneFor(country = 'IN') {
  const c = String(country || 'IN').toUpperCase();
  const zones = loadZones();
  return zones.find((z) => z.countries.includes(c)) || zones.find((z) => z.countries.includes('*')) || zones.find((z) => z.code === 'IN') || null;
}

// ---- offers ----------------------------------------------------------------
export function loadOffers({ includeInactive = false } = {}) {
  const rows = db.prepare(`SELECT * FROM offers ${includeInactive ? '' : 'WHERE is_active = 1'} ORDER BY id`).all();
  const prods = db.prepare('SELECT product_id FROM offer_products WHERE offer_id = ?');
  const cats = db.prepare('SELECT category_id FROM offer_categories WHERE offer_id = ?');
  return rows.map((o) => ({
    ...o,
    is_active: !!o.is_active,
    first_order_only: !!o.first_order_only,
    tiers: parseJSON(o.tiers, null),
    product_ids: prods.all(o.id).map((r) => r.product_id),
    category_ids: cats.all(o.id).map((r) => r.category_id),
  }));
}

/** The best automatic (no-coupon) live offer — shown in banners & product badges. */
export function headlineOffer(offers = loadOffers()) {
  const live = offers.filter((o) => isOfferLive(o) && !o.coupon_code);
  return live.sort((a, b) => offerMaxPercent(b) - offerMaxPercent(a))[0] || null;
}

export function publicOffer(o) {
  return {
    id: o.id,
    name: o.name,
    description: o.description,
    label: offerLabel(o),
    tag: offerTag(o),
    headline: offerHeadline(o),
    discount_type: o.discount_type,
    discount_value: o.discount_value,
    tiers: o.tiers,
    min_qty: o.min_qty,
    max_discount: o.max_discount,
    starts_at: o.starts_at,
    ends_at: o.ends_at,
    coupon_code: o.coupon_code,
    first_order_only: !!o.first_order_only,
    product_ids: o.product_ids,
    category_ids: o.category_ids,
  };
}

// ---- products --------------------------------------------------------------
export const PRODUCT_SELECT = `
  SELECT p.*, COALESCE(i.stock, 0) AS stock, COALESCE(i.low_stock_threshold, 10) AS low_stock_threshold,
         c.slug AS category_slug, c.name AS category_name, c.segment AS segment
  FROM products p
  JOIN categories c ON c.id = p.category_id
  LEFT JOIN inventory i ON i.product_id = p.id`;

const imgStmt = () => db.prepare('SELECT id, url, alt FROM product_images WHERE product_id = ? ORDER BY sort_order, id');

/** Contents of a combo, with each part's price, cost and stock. */
export function bundleItems(bundleId) {
  return db.prepare(
    `SELECT b.product_id, b.qty, p.name, p.slug, p.price, p.mrp, p.cost_price, p.is_active, p.ships_international, c.slug AS category_slug, COALESCE(i.stock, 0) AS stock
     FROM bundle_items b JOIN products p ON p.id = b.product_id JOIN categories c ON c.id = p.category_id LEFT JOIN inventory i ON i.product_id = p.id
     WHERE b.bundle_id = ? ORDER BY p.price DESC`
  ).all(bundleId);
}
/** A combo can only be sold while every part is in stock. */
function effectiveStock(p, parts) {
  if (!p.is_bundle || !parts?.length) return p.stock;
  return Math.max(0, Math.min(p.stock, ...parts.map((x) => (x.is_active ? Math.floor(x.stock / x.qty) : 0))));
}

export function serializeProduct(p, { offer, withImages = true, admin = false } = {}) {
  const images = withImages ? imgStmt().all(p.id) : [];
  const parts = p.is_bundle ? bundleItems(p.id) : null;
  const stock = effectiveStock(p, parts);
  const out = {
    id: p.id,
    slug: p.slug,
    name: p.name,
    category_id: p.category_id,
    category_slug: p.category_slug,
    category_name: p.category_name,
    segment: p.segment,
    short_description: p.short_description,
    description: p.description,
    specs: parseJSON(p.specs, {}),
    price: p.price,
    mrp: p.mrp,
    discount_pct: p.mrp > p.price ? Math.round(((p.mrp - p.price) / p.mrp) * 100) : 0,
    rating: p.rating,
    rating_count: p.rating_count,
    art: parseJSON(p.art, { type: 'diya', tone: 'gold' }),
    images,
    stock_status: stock <= 0 ? 'out_of_stock' : stock <= p.low_stock_threshold ? 'low_stock' : 'in_stock',
    stock_left: stock <= p.low_stock_threshold ? stock : undefined,
    is_bestseller: !!p.is_bestseller,
    is_featured: !!p.is_featured,
    is_new: !!p.is_new,
    is_diwali: !!p.is_diwali,
    is_bundle: !!p.is_bundle,
    ships_international: !!p.ships_international,
    offer_eligible: offer ? isProductEligible(offer, p) : false,
    seo_title: p.seo_title || `${p.name} | Utsav Ghar`,
    seo_description: p.seo_description || p.short_description,
    url: `/shop/${p.category_slug}/${p.slug}`,
  };
  if (parts) {
    out.bundle_items = parts.map((x) => ({ product_id: x.product_id, name: x.name, slug: x.slug, qty: x.qty, price: x.price, url: `/shop/${x.category_slug}/${x.slug}` }));
    out.bundle_worth = parts.reduce((s, x) => s + x.price * x.qty, 0);
  }
  if (admin) {
    out.stock = p.stock;
    out.cost_price = p.cost_price;
    out.low_stock_threshold = p.low_stock_threshold;
    out.is_active = !!p.is_active;
    out.sort_order = p.sort_order;
    if (parts) out.bundle_cost = parts.reduce((s, x) => s + x.cost_price * x.qty, 0);
  }
  return out;
}

export function productMapForPricing(ids) {
  if (!ids.length) return new Map();
  const rows = db
    .prepare(`${PRODUCT_SELECT} WHERE p.id IN (${ids.map(() => '?').join(',')})`)
    .all(...ids);
  return new Map(rows.map((r) => [r.id, { ...r, is_active: !!r.is_active, stock: effectiveStock(r, r.is_bundle ? bundleItems(r.id) : null) }]));
}

/** SERVER-SIDE authoritative quote. `country` picks the shipping zone; `firstOrder` gates first-order coupons. */
export function quote(items, couponCode, { country = 'IN', firstOrder, pincode } = {}) {
  const ids = [...new Set((items || []).map((i) => Number(i.productId)).filter(Number.isInteger))].slice(0, 100);
  const products = productMapForPricing(ids);
  const s = getSettings();
  const zone = zoneFor(country);
  const international = String(country || 'IN').toUpperCase() !== 'IN';
  // India: delivery charge depends on the customer's PIN zone (Local / Regional / Metro / Rest of India / Special)
  const dz = !international ? deliveryForCustomer({ items: (items || []).map((i) => ({ productId: i.productId })), pincode }) : null;
  const shipping = dz ? { delivery_fee: dz.fee, free_delivery_above: dz.free_above, international }
    : zone ? { delivery_fee: zone.fee, free_delivery_above: zone.free_above, extra_item_fee: zone.extra_item_fee, international }
      : { delivery_fee: s.delivery_fee, free_delivery_above: s.free_delivery_above, international };
  const result = computeQuote({ items, products, offers: loadOffers(), couponCode, settings: shipping, customer: { firstOrder } });
  result.country = String(country || 'IN').toUpperCase();
  result.zone = zone ? publicZone(zone) : null;
  result.delivery_zone = dz ? { key: dz.zone, label: ZONES[dz.zone].label, known: dz.known, fee: dz.fee, free_above: dz.free_above } : null;
  if (international && !s.international_enabled) result.errors.push({ code: 'NO_INTERNATIONAL', message: 'We are not shipping outside India yet.' });
  // decorate lines with display data (images/art) for the cart UI
  for (const l of result.lines) {
    const p = products.get(l.productId);
    l.art = parseJSON(p.art, null);
    l.image = imgStmt().get(p.id)?.url || null;
    l.category_slug = p.category_slug;
    l.url = `/shop/${p.category_slug}/${p.slug}`;
    l.is_bundle = !!p.is_bundle;
  }
  return result;
}
