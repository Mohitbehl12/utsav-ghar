/**
 * Product recommendations — pure functions used by the server and the demo.
 *
 * Signals (strongest first):
 *   1. Baskets   – products bought in the same order ("frequently bought together").
 *   2. Sessions  – products viewed in the same browsing session ("also viewed").
 *   3. Catalogue – same category / section, festival collection, price band, rating.
 * The catalogue signal means a brand-new store still gets sensible suggestions;
 * real orders and views take over automatically as they come in.
 *
 * Products need: id, category_id, segment, price, rating, rating_count,
 * is_bestseller, is_diwali, is_bundle, stock_status (or stock), is_active.
 */

const available = (p) => p && p.is_active !== false && p.stock_status !== 'out_of_stock' && !(typeof p.stock === 'number' && p.stock <= 0);
const quality = (p) => (p.rating || 0) * 0.6 + Math.log10((p.rating_count || 0) + 1) * 0.8 + (p.is_bestseller ? 1 : 0);

/** How often each other product appears in the same group (basket or session) as any of `ids`. */
export function coCounts(groups, ids) {
  const want = new Set([].concat(ids).map(Number));
  const out = new Map();
  for (const g of groups || []) {
    const set = new Set(g.map(Number));
    let hits = 0;
    for (const id of want) if (set.has(id)) hits++;
    if (!hits) continue;
    for (const id of set) if (!want.has(id)) out.set(id, (out.get(id) || 0) + hits);
  }
  return out;
}

// Sections that go well together in one order.
const PAIRS = {
  'festive-decor': ['pooja', 'gifts', 'home-decor'],
  pooja: ['festive-decor', 'gifts', 'dining'],
  'home-decor': ['festive-decor', 'dining'],
  dining: ['kitchen', 'home-decor', 'gifts'],
  kitchen: ['dining', 'pooja'],
  gifts: ['festive-decor', 'pooja', 'dining'],
};

// Festival-specific categories: don't suggest Holi colours with a Diwali diya, or Christmas baubles with a rakhi.
const OCCASION = { 'holi-colours': 'holi', 'christmas-decor': 'christmas', rakhi: 'rakhi', 'party-decor': 'party' };
const occasionOf = (p) => OCCASION[p.category_slug] || (p.is_diwali ? 'diwali' : null);
/** −1 when both items belong to different festivals, +1 when the same, 0 otherwise. */
export function occasionFit(a, b) {
  const x = occasionOf(a); const y = occasionOf(b);
  if (!x || !y) return 0;
  return x === y ? 1 : -1;
}

/** Sum of item-to-item scores from `fromIds` to `id` (see ranking.js itemToItem). */
function i2iScore(i2i, fromIds, id) {
  if (!i2i) return 0;
  let s = 0;
  for (const f of fromIds) { const hit = i2i.get(Number(f))?.find((x) => x.id === id); if (hit) s += hit.score; }
  return s;
}

/** "Customers who bought this item also bought" — only from real purchase history. */
export function alsoBought({ product, products, i2i, limit = 12, exclude = [] }) {
  const skip = new Set([product.id, ...exclude.map(Number)]);
  const byId = new Map(products.map((p) => [p.id, p]));
  return (i2i?.get(product.id) || []).map((x) => byId.get(x.id)).filter((p) => p && !skip.has(p.id) && available(p)).slice(0, limit);
}

function rank(list, scoreOf, limit) {
  return list.map((p) => ({ p, s: scoreOf(p) })).filter((x) => x.s > -Infinity).sort((a, b) => b.s - a.s || b.p.rating_count - a.p.rating_count).slice(0, limit).map((x) => x.p);
}

/** Two or three products to buy with `product` (never the same category twice, never its own combo parts). */
export function boughtTogether({ product, products, baskets = [], i2i, limit = 2 }) {
  const counts = coCounts(baskets, product.id);
  const parts = new Set((product.bundle_items || []).map((b) => Number(b.product_id)));
  const pick = [];
  const usedCats = new Set([product.category_id]);
  const ranked = rank(products, (p) => {
    if (p.id === product.id || !available(p) || parts.has(p.id) || p.is_bundle) return -Infinity;
    let s = (counts.get(p.id) || 0) * 12 + i2iScore(i2i, [product.id], p.id) * 3 + occasionFit(product, p) * 4;
    if (p.segment === product.segment && p.category_id !== product.category_id) s += 3;
    if ((PAIRS[product.segment] || []).includes(p.segment)) s += 2;
    if (p.is_diwali && product.is_diwali) s += 1.5;
    if (p.price <= product.price * 1.2) s += 1.5; // an easy add-on, not a bigger purchase
    return s + quality(p) * 0.5;
  }, 40);
  for (const p of ranked) {
    if (pick.length >= limit) break;
    if (usedCats.has(p.category_id) && !(counts.get(p.id) > 1)) continue;
    usedCats.add(p.category_id);
    pick.push(p);
  }
  return pick;
}

/** "Customers who viewed this also viewed". */
export function alsoViewed({ product, products, sessions = [], limit = 12, exclude = [] }) {
  const counts = coCounts(sessions, product.id);
  const skip = new Set([product.id, ...exclude.map(Number)]);
  return rank(products, (p) => {
    if (skip.has(p.id) || !available(p)) return -Infinity;
    let s = (counts.get(p.id) || 0) * 8 + occasionFit(product, p) * 2;
    if (p.category_id === product.category_id) s += 4;
    else if (p.segment === product.segment) s += 2;
    if (p.is_diwali && product.is_diwali) s += 0.5;
    return s + quality(p) * 0.4;
  }, limit);
}

/** Close alternatives in the same category (for the comparison table). */
export function similar({ product, products, limit = 3 }) {
  return rank(products, (p) => {
    if (p.id === product.id || !available(p) || p.category_id !== product.category_id) return -Infinity;
    const priceGap = Math.abs(Math.log((p.price || 1) / (product.price || 1)));
    return 5 - priceGap * 3 + quality(p) * 0.3;
  }, limit);
}

/**
 * Personal picks from what this visitor did: recently viewed (newest first),
 * cart, wishlist and past purchases. Falls back to best sellers.
 */
export function forYou({ products, viewed = [], cart = [], wish = [], bought = [], sessions = [], i2i, limit = 16 }) {
  const byId = new Map(products.map((p) => [p.id, p]));
  const catW = new Map();
  const segW = new Map();
  const add = (id, w) => {
    const p = byId.get(Number(id));
    if (!p) return;
    catW.set(p.category_id, (catW.get(p.category_id) || 0) + w);
    segW.set(p.segment, (segW.get(p.segment) || 0) + w * 0.5);
  };
  viewed.slice(0, 20).forEach((id, i) => add(id, 2 / (1 + i * 0.3))); // recent views count more
  cart.forEach((id) => add(id, 3));
  wish.forEach((id) => add(id, 2.5));
  bought.forEach((id) => add(id, 1));
  const co = coCounts(sessions, viewed.slice(0, 8));
  const seen = new Set([...viewed, ...cart, ...bought].map(Number));
  const personal = catW.size > 0;
  return rank(products, (p) => {
    if (seen.has(p.id) || !available(p)) return -Infinity;
    const s = (catW.get(p.category_id) || 0) * 3 + (segW.get(p.segment) || 0) + (co.get(p.id) || 0) * 4
      + i2iScore(i2i, [...cart, ...wish, ...bought, ...viewed.slice(0, 5)], p.id) * 2;
    return (personal ? s : 0) + quality(p) * (personal ? 0.4 : 1);
  }, limit);
}

/** Suggestions for the cart page: things bought with the cart's items, then good add-ons. */
export function forCart({ products, cartIds = [], baskets = [], i2i, limit = 12 }) {
  const byId = new Map(products.map((p) => [p.id, p]));
  const inCart = cartIds.map((id) => byId.get(Number(id))).filter(Boolean);
  const counts = coCounts(baskets, cartIds);
  const skip = new Set(cartIds.map(Number));
  const segs = new Set(inCart.map((p) => p.segment));
  const cats = new Set(inCart.map((p) => p.category_id));
  return rank(products, (p) => {
    if (skip.has(p.id) || !available(p)) return -Infinity;
    let s = (counts.get(p.id) || 0) * 10 + i2iScore(i2i, cartIds, p.id) * 3 + inCart.reduce((a, c) => a + occasionFit(c, p), 0) * 2;
    for (const g of segs) if ((PAIRS[g] || []).includes(p.segment)) s += 1;
    if (segs.has(p.segment) && !cats.has(p.category_id)) s += 2;
    return s + quality(p) * 0.5;
  }, limit);
}

/** Today's deal: the biggest discount among good products, changing every day (IST). */
export function dealOfTheDay({ products, now = new Date() }) {
  const day = Math.floor((now.getTime() + 5.5 * 36e5) / 864e5);
  const pool = products.filter((p) => available(p) && p.mrp > p.price && (p.rating || 0) >= 4.3)
    .sort((a, b) => (b.mrp - b.price) / b.mrp - (a.mrp - a.price) / a.mrp).slice(0, 7);
  return pool.length ? pool[day % pool.length] : null;
}
