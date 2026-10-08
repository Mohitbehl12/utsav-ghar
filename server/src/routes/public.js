import { Router } from 'express';
import { z } from 'zod';
import { db, parseJSON } from '../db.js';
import { wrap, parse, HttpError } from '../lib/http.js';
import {
  PRODUCT_SELECT, serializeProduct, loadOffers, headlineOffer, publicOffer, publicSettings, quote,
} from '../lib/catalog.js';
import { isOfferLive, isProductEligible, offerLabel } from '../../../shared/pricing.js';
import { boughtTogether, alsoViewed, alsoBought, similar, forYou, forCart, dealOfTheDay } from '../../../shared/recommend.js';
import { search, tokens, relevance, completions, POPULAR_SEARCHES } from '../../../shared/ranking.js';
import { facetsFor, materialsOf } from '../../../shared/facets.js';
import { catalogueVersion, recData, out, decorate } from '../lib/recommend.js';
import { upsertSubscriber } from '../lib/crm.js';
import { rejectBots } from '../lib/security.js';

const r = Router();

r.get('/settings/public', (req, res) => res.json(publicSettings()));

r.get('/categories', (req, res) => {
  const rows = db
    .prepare(
      `SELECT c.*, (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id AND p.is_active = 1) AS product_count
       FROM categories c WHERE c.is_active = 1 ORDER BY c.sort_order, c.name`
    )
    .all();
  res.json(rows.map((c) => ({ ...c, art: parseJSON(c.art, null), is_active: !!c.is_active })));
});

r.get('/offers/active', (req, res) => {
  const offers = loadOffers().filter((o) => isOfferLive(o));
  const head = headlineOffer(offers);
  res.json({
    headline: head ? publicOffer(head) : null,
    offers: offers.filter((o) => !o.coupon_code).map(publicOffer),
  });
});

const listQuery = z.object({
  q: z.string().trim().max(80).optional(),
  category: z.string().max(200).optional(),
  min: z.coerce.number().min(0).optional(),
  max: z.coerce.number().min(0).optional(),
  rating: z.coerce.number().min(0).max(5).optional(),
  discount: z.coerce.number().min(0).max(100).optional(),
  inStock: z.enum(['1', 'true']).optional(),
  flag: z.enum(['bestseller', 'new', 'featured', 'diwali']).optional(),
  segment: z.string().regex(/^[a-z0-9-]{2,40}$/).optional(),
  material: z.string().regex(/^[a-z,]{2,120}$/).optional(),
  intl: z.enum(['1', 'true']).optional(),
  offer: z.enum(['1', 'true']).optional(),
  sort: z.enum(['featured', 'popular', 'bestsellers', 'price_asc', 'price_desc', 'rating', 'discount', 'newest']).default('featured'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(60).default(24),
});


// Tiny response cache for the busiest read endpoints: same URL + same catalogue snapshot → same answer.
const respCache = new Map();
function cached(req, res, build) {
  const key = `${catalogueVersion()}|${req.originalUrl}`;
  let body = respCache.get(key);
  if (!body) {
    body = JSON.stringify(build());
    if (respCache.size > 1000) respCache.clear();
    respCache.set(key, body);
  }
  res.type('application/json').send(body);
}

// Search & browse. Text relevance first, then shopper behaviour (shared/ranking.js).
r.get(
  '/products',
  wrap((req, res) => cached(req, res, () => {
    const f = parse(listQuery, req.query);
    const d = recData();
    const cats = f.category ? new Set(f.category.split(',').filter(Boolean).slice(0, 12)) : null;
    let rows = d.rows.filter((p) => (!cats || cats.has(p.category_slug))
      && (f.min == null || p.price >= Math.round(f.min * 100)) && (f.max == null || p.price <= Math.round(f.max * 100))
      && (!f.rating || p.rating >= f.rating)
      && (!f.discount || (p.mrp > 0 && (100 * (p.mrp - p.price)) / p.mrp >= f.discount))
      && (!f.inStock || p.stock > 0) && (!f.flag || p[`is_${f.flag}`]) && (!f.segment || p.segment === f.segment));
    const offer = headlineOffer();
    if (f.offer && offer) rows = rows.filter((p) => isProductEligible(offer, p));
    if (f.intl) rows = rows.filter((p) => p.ships_international);
    const found = search({ products: rows, q: f.q || '', b: d.b, vocab: d.vocab });
    const facets = facetsFor(found.items); // counts before the material filter, so options don't vanish
    rows = found.items;
    if (f.material) { const want = new Set(f.material.split(',')); rows = rows.filter((p) => materialsOf(p).some((m) => want.has(m))); }
    const disc = (p) => (p.mrp > 0 ? (p.mrp - p.price) / p.mrp : 0);
    const sorters = {
      price_asc: (a, b) => a.price - b.price,
      price_desc: (a, b) => b.price - a.price,
      rating: (a, b) => b.rating - a.rating || b.rating_count - a.rating_count,
      discount: (a, b) => disc(b) - disc(a),
      newest: (a, b) => b.is_new - a.is_new || String(b.created_at).localeCompare(String(a.created_at)) || b.id - a.id,
      bestsellers: (a, b) => (d.b.get(b.id)?.velocity || 0) - (d.b.get(a.id)?.velocity || 0) || (d.ranks.get(a.id) || 99) - (d.ranks.get(b.id) || 99),
    };
    if (sorters[f.sort]) rows = [...rows].sort(sorters[f.sort]);
    const total = rows.length;
    const pageRows = rows.slice((f.page - 1) * f.limit, f.page * f.limit);
    return {
      total,
      page: f.page,
      pages: Math.max(1, Math.ceil(total / f.limit)),
      corrected: found.corrected,
      relaxed: found.relaxed,
      facets,
      items: out(pageRows),
    };
  }))
);

// Lightweight typeahead
// Live stock for product pages (polled every ~20 s): only status and "left" counts, never exact stock.
r.get('/stock', wrap((req, res) => {
  const ids = String(req.query.ids || '').split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 40);
  const items = {};
  if (ids.length) {
    const rows = db.prepare(`${PRODUCT_SELECT} WHERE p.id IN (${ids.map(() => '?').join(',')})`).all(...ids);
    for (const p of rows) {
      const s = serializeProduct(p, { withImages: false });
      items[p.id] = { stock_status: p.is_active ? s.stock_status : 'out_of_stock', stock_left: s.stock_left ?? null, price: p.price };
    }
  }
  res.set('Cache-Control', 'no-store').json({ items, at: new Date().toISOString() });
}));

// Typeahead: same ranking as search, plus matching departments.
r.get(
  '/products/suggest',
  wrap((req, res) => cached(req, res, () => {
    const q = String(req.query.q || '').trim().slice(0, 60);
    if (q.length < 1) return { products: [], categories: [], completions: [], popular: POPULAR_SEARCHES };
    const d = recData();
    const found = search({ products: d.rows, q, b: d.b, vocab: d.vocab, prefixLast: true });
    const words = tokens(found.corrected || q);
    const categories = db.prepare('SELECT slug, name, icon FROM categories WHERE is_active = 1').all()
      .filter((c) => relevance({ name: c.name }, words, undefined, { prefixLast: true }) > 0).slice(0, 3);
    return { products: out(found.items.slice(0, 6)), categories, corrected: found.corrected, completions: completions(q, d.rows), total: found.items.length };
  }))
);

r.get(
  '/products/:slug',
  wrap((req, res) => cached(req, res, () => {
    const p = db.prepare(`${PRODUCT_SELECT} WHERE p.slug = ? AND p.is_active = 1`).get(req.params.slug);
    if (!p) throw new HttpError(404, 'Product not found');
    const offer = headlineOffer();
    const reviews = db
      .prepare(`SELECT id, author, city, rating, body, image_url, is_verified_purchase, created_at FROM reviews WHERE product_id = ? AND status = 'approved' ORDER BY created_at DESC LIMIT 20`)
      .all(p.id);
    const related = db
      .prepare(`${PRODUCT_SELECT} WHERE p.category_id = ? AND p.id != ? AND p.is_active = 1 ORDER BY p.rating_count DESC LIMIT 4`)
      .all(p.category_id, p.id);
    return {
      product: decorate([serializeProduct(p, { offer })])[0],
      offer: offer ? publicOffer(offer) : null,
      reviews,
      related: decorate(related.map((x) => serializeProduct(x, { offer }))),
    };
  }))
);

r.get('/reviews/featured', (req, res) => {
  const rows = db
    .prepare(
      `SELECT r.id, r.author, r.city, r.rating, r.body, r.is_verified_purchase, p.name AS product_name, p.slug AS product_slug, c.slug AS category_slug
       FROM reviews r JOIN products p ON p.id = r.product_id JOIN categories c ON c.id = p.category_id
       WHERE r.status = 'approved' AND r.rating >= 4 ORDER BY r.created_at DESC LIMIT 6`
    )
    .all();
  res.json(rows);
});

// ---- cart quote: the ONLY place the browser learns prices/discounts --------
const quoteBody = z.object({
  items: z.array(z.object({ productId: z.coerce.number().int().positive(), qty: z.coerce.number().int().min(1).max(99) })).max(100),
  couponCode: z.string().trim().max(30).optional().default(''),
  country: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/).optional().default('IN'),
  pincode: z.string().trim().regex(/^(\d{6})?$/).optional(),
});
r.post(
  '/cart/quote',
  wrap((req, res) => {
    const b = parse(quoteBody, req.body);
    res.json(quote(b.items, b.couponCode, { country: b.country, pincode: b.pincode }));
  })
);

// ---- first-party analytics (anonymous: a random session id, no personal data) ----
const EVENT_TYPES = ['page_view', 'view_item', 'add_to_cart', 'begin_checkout', 'add_payment_info'];
// ---- Recommendations ------------------------------------------------------------
const idList = z.array(z.coerce.number().int().positive()).max(50).optional().default([]);

// Product page: frequently bought together, also viewed, similar items to compare.
r.get(
  '/products/:slug/recommendations',
  wrap((req, res) => cached(req, res, () => {
    const d = recData();
    const product = d.rows.find((x) => x.slug === req.params.slug);
    if (!product) throw new HttpError(404, 'Product not found');
    const full = serializeProduct(product, { withImages: false });
    const together = boughtTogether({ product: { ...product, bundle_items: full.bundle_items }, products: d.rows, baskets: d.baskets, i2i: d.i2i, limit: 2 });
    const bought = alsoBought({ product, products: d.rows, i2i: d.i2i, limit: 12, exclude: together.map((x) => x.id) });
    const sim = similar({ product, products: d.rows, limit: 3 });
    return {
      together: out(together),
      similar: out(sim),
      alsoBought: out(bought),
      alsoViewed: out(alsoViewed({ product, products: d.rows, sessions: d.sessions, limit: 12, exclude: [...together, ...bought].map((x) => x.id) })),
    };
  }))
);

// Home page: picks from this visitor's history, recently viewed, buy it again, deal of the day.
r.post(
  '/recommendations',
  wrap((req, res) => {
    const b = parse(z.object({ viewed: idList, cart: idList, wish: idList }), req.body || {});
    const d = recData();
    const bought = req.user
      ? db.prepare(`SELECT i.product_id, MAX(o.created_at) at FROM order_items i JOIN orders o ON o.id = i.order_id WHERE o.user_id = ? AND o.payment_status = 'confirmed' GROUP BY i.product_id ORDER BY at DESC LIMIT 20`).all(req.user.id).map((x) => x.product_id)
      : [];
    const deal = dealOfTheDay({ products: d.rows });
    res.json({
      forYou: out(forYou({ products: d.rows, viewed: b.viewed, cart: b.cart, wish: b.wish, bought, sessions: d.sessions, i2i: d.i2i, limit: 16 })),
      recent: out(b.viewed.map((id) => d.byId.get(id)).filter(Boolean).slice(0, 16)),
      buyAgain: out(bought.map((id) => d.byId.get(id)).filter(Boolean)),
      deal: deal ? out([deal])[0] : null,
      personal: b.viewed.length + b.cart.length + b.wish.length + bought.length > 0,
    });
  })
);

// Cart page: customers also bought, and cheap eligible items that unlock the next offer level.
r.post(
  '/cart/recommendations',
  wrap((req, res) => {
    const b = parse(z.object({ items: z.array(z.object({ productId: z.coerce.number().int().positive(), qty: z.coerce.number().int().min(1).max(99) })).max(100) }), req.body || {});
    const d = recData();
    const ids = b.items.map((i) => i.productId);
    const q = quote(b.items, '', {});
    const offer = headlineOffer();
    let unlock = null;
    const step = q.nudge || q.upsell;
    if (offer && step) {
      const items = d.rows.filter((p) => !ids.includes(p.id) && !p.is_bundle && p.stock > 0 && isProductEligible(offer, p)).sort((x, y) => x.price - y.price).slice(0, 8);
      unlock = { message: step.message, needed: step.needed, items: out(items) };
    }
    res.json({ alsoBought: out(forCart({ products: d.rows, cartIds: ids, baskets: d.baskets, i2i: d.i2i, limit: 12 })), unlock });
  })
);

r.post(
  '/events',
  wrap((req, res) => {
    const b = parse(z.object({
      type: z.enum(EVENT_TYPES),
      sessionId: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/),
      productId: z.coerce.number().int().positive().optional(),
      value: z.coerce.number().int().nonnegative().max(1e9).optional(),
      country: z.string().regex(/^[A-Z]{2}$/).optional(),
      utm_source: z.string().max(80).optional(), utm_medium: z.string().max(80).optional(), utm_campaign: z.string().max(120).optional(),
    }), req.body);
    db.prepare('INSERT INTO events(session_id, type, product_id, value, utm_source, utm_medium, utm_campaign, country) VALUES(?,?,?,?,?,?,?,?)')
      .run(b.sessionId, b.type, b.productId ?? null, b.value ?? null, b.utm_source?.toLowerCase() || null, b.utm_medium?.toLowerCase() || null, b.utm_campaign?.toLowerCase() || null, b.country || null);
    res.status(204).end();
  })
);

r.post(
  '/newsletter',
  wrap((req, res) => {
    rejectBots(req);
    const { email } = parse(z.object({ email: z.string().trim().email().max(200) }), req.body);
    db.prepare('INSERT OR IGNORE INTO newsletter_subscribers(email) VALUES(?)').run(email);
    upsertSubscriber({ email, emailOptIn: true, frequency: 'weekly', source: 'footer' });
    // Hand out the live first-order coupon, if there is one.
    const welcome = loadOffers().find((o) => isOfferLive(o) && o.first_order_only && o.coupon_code);
    res.json({
      ok: true,
      coupon: welcome ? { code: welcome.coupon_code, label: offerLabel(welcome), max_discount: welcome.max_discount } : null,
      message: welcome ? `Welcome! Use ${welcome.coupon_code} for ${offerLabel(welcome)} your first order.` : 'Thank you! Festive offers are on their way to your inbox.',
    });
  })
);

r.post(
  '/contact',
  wrap((req, res) => {
    rejectBots(req);
    const b = parse(
      z.object({ name: z.string().trim().min(2).max(80), email: z.string().trim().email(), phone: z.string().trim().max(20).optional(), message: z.string().trim().min(5).max(2000) }),
      req.body
    );
    db.prepare("INSERT INTO notifications(channel, recipient, template, payload, status) VALUES('email', 'store', 'contact_form', ?, 'queued')").run(JSON.stringify(b));
    res.json({ ok: true, message: 'Thanks for reaching out — we reply within one business day.' });
  })
);

export default r;
