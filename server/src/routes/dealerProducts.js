/**
 * Dealer product submissions.
 *
 *   Dealer (product + their price) → email to our team → admin review & pricing
 *   → admin publishes with the customer price → customers see only that price.
 *
 * Strict separation: every dealer response is built from the WHITELIST in dealerView();
 * it never reads products.price / mrp or the internal pricing calculation.
 */
import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { z } from 'zod';
import { db, now, parseJSON } from '../db.js';
import { config } from '../config.js';
import { wrap, parse, HttpError } from '../lib/http.js';
import { requireAdmin } from '../lib/auth.js';
import { audit } from '../lib/audit.js';
import { secEvent } from '../lib/security.js';
import { imageUpload, saveImage, PRIVATE_DIR, PUBLIC_DIR } from '../lib/uploads.js';
import { notifyContact } from '../lib/notify.js';
import { getSettings, setSettings } from '../lib/catalog.js';
import { clearCatalogue } from '../lib/recommend.js';
import { requireDealerSession, mustSetPassword } from './dealer.js';
import { calcSellingPrice, PRICING_DEFAULTS, INTERNAL_KEYS } from '../../../shared/dealerPricing.js';
import { formatRupees } from '../../../shared/pricing.js';
import { logStockMove, effectiveStock } from '../lib/dealerDashboard.js';
import { canReceiveOrders } from '../lib/legal.js';

export const dealerProductApi = Router();
export const adminDealerProducts = Router();

export const DP_STATUS = {
  pending: { label: 'Under review', tone: 'warn' },
  changes_requested: { label: 'Changes needed', tone: 'bad' },
  approved: { label: 'Approved', tone: 'ok' },
  rejected: { label: 'Not accepted', tone: 'muted' },
};
const SPEC_KEYS = ['Material', 'Dimensions', 'Weight', "What's included", 'Colour', 'Care', 'Country of origin'];
const paise = (v) => Math.round(Number(v) * 100);

// ---------------------------------------------------------------- shared helpers
function liveInfo(r) {
  if (!r.product_id) return { live: false, stock: null, reserved: 0, sold: 0 };
  const p = db.prepare('SELECT p.is_active, i.stock FROM products p LEFT JOIN inventory i ON i.product_id = p.id WHERE p.id = ?').get(r.product_id);
  // reserved = in orders placed but not yet sent out; sold = delivered (stock is taken off when the order is placed)
  const q = (statuses) => db.prepare(`SELECT COALESCE(SUM(i.qty), 0) n FROM order_items i JOIN orders o ON o.id = i.order_id WHERE i.product_id = ? AND o.status IN (${statuses.map(() => '?').join(',')})`).get(r.product_id, ...statuses).n;
  return { live: !!p?.is_active, stock: p?.stock ?? null, reserved: q(['placed', 'payment_confirmed', 'processing']), sold: q(['delivered']) };
}
const catName = (id) => db.prepare('SELECT name FROM categories WHERE id = ?').get(id)?.name || null;

/** The ONLY shape a dealer ever receives. Whitelisted fields — no customer price, no pricing, no internal note. */
function dealerView(r) {
  const li = liveInfo(r);
  const out = {
    id: r.id, status: r.status, status_label: DP_STATUS[r.status]?.label,
    name: r.name, category_id: r.category_id, category: catName(r.category_id),
    short_description: r.short_description || '', description: r.description || '', specs: parseJSON(r.specs, {}),
    dealer_price: r.dealer_price, approved_dealer_price: r.approved_dealer_price, quantity: r.quantity,
    images: parseJSON(r.images, []).map((n) => ({ name: n, url: `/api/dealer/products/${r.id}/images/${n}` })),
    dealer_sku: r.dealer_sku || '', hsn: r.hsn || '', note_from_team: r.admin_note || null,
    live: li.live, store_stock: li.stock, reserved_stock: li.reserved, sold_stock: li.sold, revision: r.revision,
    submitted_at: r.submitted_at, reviewed_at: r.reviewed_at, published_at: r.published_at, updated_at: r.updated_at,
  };
  for (const k of INTERNAL_KEYS) delete out[k]; // belt & braces
  return out;
}

function teamEmail() {
  const s = getSettings();
  return (s.dealer_review_email || s.support_email || process.env.TEAM_EMAIL || '').trim() || null;
}
async function emailTeam(r, dealer, kind) {
  const specs = Object.entries(parseJSON(r.specs, {})).map(([k, v]) => `  ${k}: ${v}`).join('\n');
  const text = `${kind === 'new' ? 'New product submitted' : 'Product updated'} by ${dealer.business_name} (${dealer.name}, ${dealer.phone}).

Product: ${r.name}
Category: ${catName(r.category_id) || '-'}
Dealer price (cost to us): ${formatRupees(r.dealer_price)} per piece${r.approved_dealer_price && r.approved_dealer_price !== r.dealer_price ? ` (was ${formatRupees(r.approved_dealer_price)})` : ''}
Quantity available: ${r.quantity}
Dealer SKU: ${r.dealer_sku || '-'}   HSN: ${r.hsn || '-'}
Images: ${parseJSON(r.images, []).length}

Short description: ${r.short_description || '-'}
Description:
${r.description || '-'}

Details:
${specs || '  -'}

Review, set the selling price and publish:
${config.publicUrl}/admin/dealer-products/${r.id}

(Internal — do not forward to the dealer.)`;
  await notifyContact({ email: teamEmail(), phone: null, template: `dealer_product_${kind}`, subject: `[Review] ${kind === 'new' ? 'New' : 'Updated'} dealer product: ${r.name} — ${dealer.business_name}`, text }).catch(() => {});
}
async function tellDealer(dealerId, subject, text) {
  const d = db.prepare('SELECT name, email, phone FROM dealers WHERE id = ?').get(dealerId);
  if (d) await notifyContact({ email: d.email || null, phone: d.phone, template: 'dealer_product_review', subject, text: `Namaste ${d.name},\n\n${text}\n\nOpen the dealer app: ${config.publicUrl}/dealer\n\nUtsav Ghar` }).catch(() => {});
}

function sendPrivateImage(res, name) {
  if (!/^[a-z0-9]+-[a-f0-9]{16}\.(jpg|png|webp|avif)$/.test(name)) throw new HttpError(404, 'Not found');
  const file = path.join(PRIVATE_DIR, name);
  if (!fs.existsSync(file)) throw new HttpError(404, 'Not found');
  res.set('Cache-Control', 'private, max-age=3600').sendFile(file);
}

// ---------------------------------------------------------------- dealer
const dealerFields = z.object({
  name: z.string().trim().min(3, 'Enter the product name').max(120),
  category_id: z.coerce.number().int().positive('Choose a category'),
  short_description: z.string().trim().max(200).optional().default(''),
  description: z.string().trim().min(20, 'Describe the product in at least 20 characters').max(5000),
  dealer_price: z.coerce.number().positive('Enter your price').max(10_00_000),
  quantity: z.coerce.number().int().min(0).max(1_000_000),
  dealer_sku: z.string().trim().max(40).optional().default(''),
  hsn: z.string().trim().regex(/^(\d{4,8})?$/, 'HSN is 4–8 digits').optional().default(''),
  specs: z.string().max(4000).optional(),            // JSON string in multipart
  keep_images: z.string().max(2000).optional(),      // JSON array of names to keep (edit)
  website: z.string().max(0).optional(),             // honeypot
});
function readSpecs(raw) {
  const o = parseJSON(raw, {}) || {};
  const out = {};
  for (const k of SPEC_KEYS) if (o[k] && String(o[k]).trim()) out[k] = String(o[k]).trim().slice(0, 300);
  return out;
}

dealerProductApi.use('/dealer/products', requireDealerSession, mustSetPassword);
// new products only from dealers who may trade (approved, or an existing dealer in its grace period)
dealerProductApi.use('/dealer/products', (req, _res, next) => {
  if (req.method !== 'POST') return next();
  const d = db.prepare('SELECT * FROM dealers WHERE id = ?').get(req.dealer.id);
  return canReceiveOrders(d) ? next() : next(new HttpError(403, 'Complete your KYC and sign the dealer agreement first. Our team will then approve your account.', { code: 'ONBOARDING_REQUIRED' }));
});
dealerProductApi.get('/dealer/products', (req, res) => {
  const rows = db.prepare('SELECT * FROM dealer_products WHERE dealer_id = ? ORDER BY updated_at DESC').all(req.dealer.id);
  res.set('Cache-Control', 'no-store').json({ items: rows.map(dealerView), spec_keys: SPEC_KEYS });
});
const mine = (req) => {
  const r = db.prepare('SELECT * FROM dealer_products WHERE id = ? AND dealer_id = ?').get(Number(req.params.id), req.dealer.id);
  if (!r) throw new HttpError(404, 'Not found');
  return r;
};
dealerProductApi.get('/dealer/products/:id', wrap((req, res) => res.set('Cache-Control', 'no-store').json(dealerView(mine(req)))));
dealerProductApi.get('/dealer/products/:id/images/:name', wrap((req, res) => {
  const r = mine(req);
  if (!parseJSON(r.images, []).includes(req.params.name)) throw new HttpError(404, 'Not found');
  sendPrivateImage(res, req.params.name);
}));

/** Your own SKU must be unique among your listings (helps you and our team match stock). */
const skuTaken = (dealerId, sku, exceptId = 0) => !!sku && !!db.prepare("SELECT 1 FROM dealer_products WHERE dealer_id = ? AND id != ? AND lower(dealer_sku) = lower(?) AND status != 'rejected'").get(dealerId, exceptId, sku);
dealerProductApi.post('/dealer/products', imageUpload.array('images', 6), wrap(async (req, res) => {
  const b = parse(dealerFields, req.body);
  if (skuTaken(req.dealer.id, b.dealer_sku)) throw new HttpError(409, 'You already use this SKU for another product.', { fields: { dealer_sku: 'SKU already used' } });
  if (!db.prepare('SELECT 1 FROM categories WHERE id = ?').get(b.category_id)) throw new HttpError(400, 'Choose a category', { fields: { category_id: 'Choose a category' } });
  const files = req.files || [];
  if (!files.length) throw new HttpError(400, 'Add at least one clear photo of the product.', { fields: { images: 'Add a photo' } });
  if (db.prepare("SELECT COUNT(*) n FROM dealer_products WHERE dealer_id = ? AND status = 'pending'").get(req.dealer.id).n >= 50) throw new HttpError(429, 'You have 50 products waiting for review. Please wait for our team.');
  const images = files.map((f) => saveImage(f, { private: true }));
  const r = db.prepare(`INSERT INTO dealer_products(dealer_id, name, category_id, short_description, description, specs, dealer_price, quantity, images, dealer_sku, hsn)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(req.dealer.id, b.name, b.category_id, b.short_description, b.description, JSON.stringify(readSpecs(b.specs)), paise(b.dealer_price), b.quantity, JSON.stringify(images), b.dealer_sku || null, b.hsn || null);
  const row = db.prepare('SELECT * FROM dealer_products WHERE id = ?').get(r.lastInsertRowid);
  secEvent('dealer_product_submitted', `dealer:${req.dealer.id}`, req, { id: row.id });
  logStockMove(req.dealer.id, row, 0, row.quantity, 'added');
  emailTeam(row, req.dealer, 'new');
  res.status(201).json(dealerView(row));
}));

dealerProductApi.put('/dealer/products/:id', imageUpload.array('images', 6), wrap(async (req, res) => {
  const r = mine(req);
  const b = parse(dealerFields, req.body);
  if (skuTaken(req.dealer.id, b.dealer_sku, r.id)) throw new HttpError(409, 'You already use this SKU for another product.', { fields: { dealer_sku: 'SKU already used' } });
  if (!db.prepare('SELECT 1 FROM categories WHERE id = ?').get(b.category_id)) throw new HttpError(400, 'Choose a category', { fields: { category_id: 'Choose a category' } });
  const before = effectiveStock(r);
  const old = parseJSON(r.images, []);
  const keep = (parseJSON(b.keep_images, old) || []).filter((n) => old.includes(n));
  const images = [...keep, ...(req.files || []).map((f) => saveImage(f, { private: true }))].slice(0, 8);
  if (!images.length) throw new HttpError(400, 'Add at least one clear photo of the product.', { fields: { images: 'Add a photo' } });
  db.prepare(`UPDATE dealer_products SET name = ?, category_id = ?, short_description = ?, description = ?, specs = ?, dealer_price = ?, quantity = ?, images = ?, dealer_sku = ?, hsn = ?,
    status = 'pending', revision = revision + 1, submitted_at = ?, updated_at = ? WHERE id = ?`)
    .run(b.name, b.category_id, b.short_description, b.description, JSON.stringify(readSpecs(b.specs)), paise(b.dealer_price), b.quantity, JSON.stringify(images), b.dealer_sku || null, b.hsn || null, now(), now(), r.id);
  // availability is live straight away; everything else waits for review (the live listing stays as it is)
  if (r.product_id) { db.prepare('UPDATE inventory SET stock = ?, updated_at = ? WHERE product_id = ?').run(b.quantity, now(), r.product_id); clearCatalogue(); }
  logStockMove(req.dealer.id, r, before, b.quantity);
  const row = db.prepare('SELECT * FROM dealer_products WHERE id = ?').get(r.id);
  emailTeam(row, req.dealer, 'update');
  res.json(dealerView(row));
}));

dealerProductApi.patch('/dealer/products/:id/stock', wrap((req, res) => {
  const r = mine(req);
  const { quantity } = parse(z.object({ quantity: z.coerce.number().int().min(0).max(1_000_000) }), req.body);
  logStockMove(req.dealer.id, r, effectiveStock(r), quantity);
  db.prepare('UPDATE dealer_products SET quantity = ?, updated_at = ? WHERE id = ?').run(quantity, now(), r.id);
  if (r.product_id) { db.prepare('UPDATE inventory SET stock = ?, updated_at = ? WHERE product_id = ?').run(quantity, now(), r.product_id); clearCatalogue(); }
  secEvent('dealer_stock_update', `dealer:${req.dealer.id}`, req, { id: r.id, quantity });
  res.json(dealerView(db.prepare('SELECT * FROM dealer_products WHERE id = ?').get(r.id)));
}));

dealerProductApi.delete('/dealer/products/:id', wrap((req, res) => {
  const r = mine(req);
  if (r.product_id) throw new HttpError(409, 'This product is already on the store. Set its quantity to 0 to stop orders, or ask our team to remove it.');
  db.prepare('DELETE FROM dealer_products WHERE id = ?').run(r.id);
  res.json({ deleted: true });
}));

// ---------------------------------------------------------------- admin
adminDealerProducts.use(requireAdmin());
const managers = requireAdmin('owner', 'manager');

export function pricingDefaults() {
  const v = getSettings().dealer_pricing_defaults;
  return { ...PRICING_DEFAULTS, ...(typeof v === 'object' && v ? v : parseJSON(v, {}) || {}) };
}

function adminView(r, { full = false } = {}) {
  const d = db.prepare('SELECT id, business_name, name, phone, city FROM dealers WHERE id = ?').get(r.dealer_id);
  const live = r.product_id ? db.prepare('SELECT p.id, p.name, p.slug, p.price, p.mrp, p.cost_price, p.is_active, p.category_id, p.short_description, p.description, p.specs, c.slug category_slug, i.stock FROM products p JOIN categories c ON c.id = p.category_id LEFT JOIN inventory i ON i.product_id = p.id WHERE p.id = ?').get(r.product_id) : null;
  const out = {
    id: r.id, status: r.status, status_label: DP_STATUS[r.status]?.label, dealer: d, name: r.name, category_id: r.category_id, category: catName(r.category_id),
    dealer_price: r.dealer_price, approved_dealer_price: r.approved_dealer_price, quantity: r.quantity, revision: r.revision,
    image_count: parseJSON(r.images, []).length, thumb: parseJSON(r.images, [])[0] ? `/api/admin/dealer-products/${r.id}/images/${parseJSON(r.images, [])[0]}` : null,
    submitted_at: r.submitted_at, reviewed_at: r.reviewed_at, published_at: r.published_at,
    live: live ? { id: live.id, price: live.price, mrp: live.mrp, is_active: !!live.is_active, url: `/shop/${live.category_slug}/${live.slug}`, stock: live.stock } : null,
    price_changed: !!(r.approved_dealer_price && r.approved_dealer_price !== r.dealer_price),
  };
  if (!full) return out;
  return {
    ...out, short_description: r.short_description, description: r.description, specs: parseJSON(r.specs, {}), dealer_sku: r.dealer_sku, hsn: r.hsn,
    images: parseJSON(r.images, []).map((n) => ({ name: n, url: `/api/admin/dealer-products/${r.id}/images/${n}` })),
    admin_note: r.admin_note, internal_note: r.internal_note, pricing: parseJSON(r.pricing, null), defaults: pricingDefaults(),
    live_full: live ? { name: live.name, short_description: live.short_description, description: live.description, specs: parseJSON(live.specs, {}), category_id: live.category_id, cost_price: live.cost_price } : null,
  };
}

adminDealerProducts.get('/dealer-products', (req, res) => {
  const st = DP_STATUS[req.query.status] ? req.query.status : null;
  const rows = db.prepare(`SELECT * FROM dealer_products ${st ? 'WHERE status = ?' : ''} ORDER BY CASE status WHEN 'pending' THEN 0 WHEN 'changes_requested' THEN 1 ELSE 2 END, submitted_at DESC LIMIT 500`).all(...(st ? [st] : []));
  const counts = Object.fromEntries(db.prepare('SELECT status, COUNT(*) n FROM dealer_products GROUP BY status').all().map((x) => [x.status, x.n]));
  res.json({ items: rows.map((r) => adminView(r)), counts, defaults: pricingDefaults(), review_email: teamEmail() });
});
adminDealerProducts.get('/dealer-products/:id', wrap((req, res) => {
  const r = db.prepare('SELECT * FROM dealer_products WHERE id = ?').get(Number(req.params.id));
  if (!r) throw new HttpError(404, 'Not found');
  res.json(adminView(r, { full: true }));
}));
adminDealerProducts.get('/dealer-products/:id/images/:name', wrap((req, res) => {
  const r = db.prepare('SELECT images FROM dealer_products WHERE id = ?').get(Number(req.params.id));
  if (!r || !parseJSON(r.images, []).includes(req.params.name)) throw new HttpError(404, 'Not found');
  sendPrivateImage(res, req.params.name);
}));

const pricingInput = z.object({
  shipping: z.coerce.number().min(0).max(100000).default(0), packaging: z.coerce.number().min(0).max(100000).default(0), other: z.coerce.number().min(0).max(100000).default(0),
  platform_pct: z.coerce.number().min(0).max(50).default(0), gst_pct: z.coerce.number().min(0).max(40).default(0),
  profit_mode: z.enum(['amount', 'percent']).default('amount'), profit_value: z.coerce.number().min(0).max(1000000).default(0),
  rounding: z.enum(['rupee', 'nine', 'ninety_nine']).default('rupee'),
});
const toPaiseInputs = (p) => ({ ...p, shipping: paise(p.shipping), packaging: paise(p.packaging), other: paise(p.other), profit_value: p.profit_mode === 'amount' ? paise(p.profit_value) : p.profit_value });

adminDealerProducts.put('/dealer-products-defaults', managers, wrap((req, res) => {
  const b = parse(pricingInput.extend({ review_email: z.string().trim().email('Enter a valid email').max(160).optional().or(z.literal('')) }), req.body);
  const { review_email: email, ...p } = b;
  setSettings({ dealer_pricing_defaults: JSON.stringify(toPaiseInputs(p)), ...(email !== undefined ? { dealer_review_email: email } : {}) });
  audit(req, 'update', 'settings', 'dealer_pricing_defaults', b);
  res.json({ defaults: pricingDefaults(), review_email: teamEmail() });
}));

const slugify = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_-]+/g, '-').slice(0, 70) || `product-${Date.now().toString(36)}`;
function uniqueSlug(base, ownId) {
  let slug = base; let i = 2;
  while (db.prepare('SELECT 1 FROM products WHERE slug = ? AND id != ?').get(slug, ownId || 0)) slug = `${base}-${i++}`;
  return slug;
}

adminDealerProducts.post('/dealer-products/:id/publish', managers, wrap((req, res) => {
  const r = db.prepare('SELECT * FROM dealer_products WHERE id = ?').get(Number(req.params.id));
  if (!r) throw new HttpError(404, 'Not found');
  const b = parse(z.object({
    name: z.string().trim().min(2).max(120), category_id: z.coerce.number().int().positive(),
    short_description: z.string().trim().max(200).optional().default(''), description: z.string().trim().max(5000).optional().default(''),
    specs: z.record(z.string().max(60), z.string().max(300)).optional().default({}),
    pricing: pricingInput,
    price: z.coerce.number().positive().max(10_00_000),           // final customer price (₹) — may differ from the calculator if the admin overrides
    mrp: z.coerce.number().min(0).max(10_00_000).optional(),
    is_active: z.boolean().default(true), is_new: z.boolean().default(true), is_diwali: z.boolean().default(false),
    allow_below_cost: z.boolean().default(false),
    note_to_dealer: z.string().trim().max(500).optional().default(''),
    internal_note: z.string().trim().max(1000).optional().default(''),
  }), req.body);
  const price = paise(b.price);
  const mrp = Math.max(price, b.mrp ? paise(b.mrp) : price);
  if (price < r.dealer_price && !b.allow_below_cost) throw new HttpError(400, `The selling price is below the dealer price (${formatRupees(r.dealer_price)}). Tick "sell below cost" if you really mean it.`, { fields: { price: 'Below dealer cost' } });
  const calc = calcSellingPrice({ cost: r.dealer_price, ...toPaiseInputs(b.pricing) });
  const t = now();
  const productId = db.transaction(() => {
    let id = r.product_id && db.prepare('SELECT id FROM products WHERE id = ?').get(r.product_id)?.id;
    const specs = JSON.stringify(b.specs);
    if (id) {
      db.prepare(`UPDATE products SET name = ?, category_id = ?, short_description = ?, description = ?, specs = ?, price = ?, mrp = ?, cost_price = ?, is_active = ?, is_new = ?, is_diwali = ?, updated_at = ? WHERE id = ?`)
        .run(b.name, b.category_id, b.short_description, b.description, specs, price, mrp, r.dealer_price, b.is_active ? 1 : 0, b.is_new ? 1 : 0, b.is_diwali ? 1 : 0, t, id);
    } else {
      id = db.prepare(`INSERT INTO products(name, slug, category_id, short_description, description, specs, price, mrp, cost_price, is_active, is_new, is_diwali, art)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(b.name, uniqueSlug(slugify(b.name)), b.category_id, b.short_description, b.description, specs, price, mrp, r.dealer_price, b.is_active ? 1 : 0, b.is_new ? 1 : 0, b.is_diwali ? 1 : 0, JSON.stringify({ type: 'giftbox', tone: 'gold' })).lastInsertRowid;
    }
    db.prepare('INSERT INTO inventory(product_id, stock, low_stock_threshold, updated_at) VALUES(?,?,?,?) ON CONFLICT(product_id) DO UPDATE SET stock = excluded.stock, updated_at = excluded.updated_at').run(id, r.quantity, 5, t);
    // copy the dealer's photos into the public catalogue (once each)
    const done = parseJSON(r.published_images, {});
    const max = db.prepare('SELECT COALESCE(MAX(sort_order), -1) m FROM product_images WHERE product_id = ?').get(id).m;
    let k = 0;
    for (const n of parseJSON(r.images, [])) {
      if (done[n]) continue;
      const src = path.join(PRIVATE_DIR, n);
      if (!fs.existsSync(src)) continue;
      const pub = `${Date.now().toString(36)}-${crypto.randomBytes(8).toString('hex')}${path.extname(n)}`;
      fs.copyFileSync(src, path.join(PUBLIC_DIR, pub));
      done[n] = `/uploads/${pub}`;
      db.prepare('INSERT INTO product_images(product_id, url, alt, sort_order) VALUES(?,?,?,?)').run(id, done[n], b.name, max + 1 + k++);
    }
    db.prepare(`UPDATE dealer_products SET status = 'approved', product_id = ?, pricing = ?, approved_dealer_price = dealer_price, admin_note = ?, internal_note = ?, published_images = ?,
      reviewed_at = ?, reviewed_by = ?, published_at = COALESCE(published_at, ?), updated_at = ? WHERE id = ?`)
      .run(id, JSON.stringify({ ...calc, final_price: price, mrp, overridden: price !== calc.selling, by: req.admin.id, at: t }), b.note_to_dealer || null, b.internal_note || null, JSON.stringify(done), t, req.admin.id, b.is_active ? t : null, t, r.id);
    // orders for this product go to the dealer who supplies it
    const dl = db.prepare('SELECT product_ids FROM dealers WHERE id = ?').get(r.dealer_id);
    const ids = new Set(parseJSON(dl?.product_ids, [])); ids.add(Number(id));
    db.prepare('UPDATE dealers SET product_ids = ?, updated_at = ? WHERE id = ?').run(JSON.stringify([...ids]), t, r.dealer_id);
    return id;
  })();
  clearCatalogue();
  audit(req, b.is_active ? 'publish' : 'approve_hidden', 'dealer_product', r.id, { product_id: productId, price: b.price, dealer_price: r.dealer_price / 100, margin_pct: calc.margin_pct });
  tellDealer(r.dealer_id, `Approved: ${b.name}`, `Good news! Your product "${b.name}" has been approved${b.is_active ? ' and is now on the Utsav Ghar store' : ''}. Orders for it will come to you in the dealer app.${b.note_to_dealer ? `\n\nNote from our team: ${b.note_to_dealer}` : ''}`);
  res.json(adminView(db.prepare('SELECT * FROM dealer_products WHERE id = ?').get(r.id), { full: true }));
}));

adminDealerProducts.post('/dealer-products/:id/:decision', managers, wrap((req, res) => {
  if (!['request-changes', 'reject'].includes(req.params.decision)) throw new HttpError(404, 'Not found');
  const r = db.prepare('SELECT * FROM dealer_products WHERE id = ?').get(Number(req.params.id));
  if (!r) throw new HttpError(404, 'Not found');
  const { note } = parse(z.object({ note: z.string().trim().min(5, 'Tell the dealer what to change (5+ characters)').max(500) }), req.body);
  const status = req.params.decision === 'reject' ? 'rejected' : 'changes_requested';
  db.prepare('UPDATE dealer_products SET status = ?, admin_note = ?, reviewed_at = ?, reviewed_by = ?, updated_at = ? WHERE id = ?').run(status, note, now(), req.admin.id, now(), r.id);
  audit(req, status, 'dealer_product', r.id, { note });
  tellDealer(r.dealer_id, status === 'rejected' ? `Not accepted: ${r.name}` : `Changes needed: ${r.name}`,
    status === 'rejected' ? `We are not able to list "${r.name}" right now.\n\nReason: ${note}` : `Please update "${r.name}" in the dealer app and send it again.\n\nWhat to change: ${note}`);
  res.json(adminView(db.prepare('SELECT * FROM dealer_products WHERE id = ?').get(r.id), { full: true }));
}));

adminDealerProducts.post('/dealer-products-calc', wrap((req, res) => {
  const b = parse(pricingInput.extend({ cost: z.coerce.number().min(0).max(10_00_000) }), req.body);
  res.json(calcSellingPrice({ ...toPaiseInputs(b), cost: paise(b.cost) }));
}));
