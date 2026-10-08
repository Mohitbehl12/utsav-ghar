/**
 * Server side of recommendations & ranking (shared/recommend.js + shared/ranking.js).
 * Loads the catalogue, purchase history and viewing sessions, then precomputes
 * item-to-item similarities, behaviour stats, Best Sellers Rank and Utsav's Choice.
 * Cached for a few minutes (like a marketplace's offline batch job, just smaller).
 */
import { db } from '../db.js';
import { PRODUCT_SELECT, serializeProduct, headlineOffer } from './catalog.js';
import { behaviour, itemToItem, bestSellerRanks, choicePicks, boughtLabel, vocabulary } from '../../../shared/ranking.js';

const TTL = 5 * 60 * 1000;
let cache = { at: 0 };

const parseJSON = (s, d) => { try { return s ? JSON.parse(s) : d; } catch { return d; } };

function loadRows() {
  return db.prepare(`${PRODUCT_SELECT} WHERE p.is_active = 1 AND c.is_active = 1`).all()
    .map((r) => ({
      ...r, specs: parseJSON(r.specs, {}), is_bestseller: !!r.is_bestseller, is_diwali: !!r.is_diwali, is_bundle: !!r.is_bundle, is_new: !!r.is_new, is_active: true,
      stock_status: r.stock <= 0 ? 'out_of_stock' : r.stock <= r.low_stock_threshold ? 'low_stock' : 'in_stock',
    }));
}

/**
 * Catalogue rows are read fresh every call (so price/stock edits show at once);
 * the heavier purchase-history maths is cached for a few minutes.
 */
// Catalogue snapshot is reused for ROWS_TTL ms so busy moments (festival sales) don't re-read
// and re-serialize the whole catalogue on every request. Checkout always re-reads price & stock.
const ROWS_TTL = 3000;
let rowsCache = { at: 0 };
function catalogue() {
  if (Date.now() - rowsCache.at < ROWS_TTL) return rowsCache;
  const rows = loadRows();
  rowsCache = { at: Date.now(), rows, byId: new Map(rows.map((r) => [r.id, r])) };
  return rowsCache;
}

/** Changes whenever the catalogue snapshot or ranking data is rebuilt. */
export const catalogueVersion = () => `${rowsCache.at}:${cache.at}`;

export function recData() {
  const { rows, byId } = catalogue();
  if (Date.now() - cache.at < TTL) return { ...cache, rows, byId };
  const group = (list, key) => {
    const m = new Map();
    for (const r of list) { if (!m.has(r[key])) m.set(r[key], new Set()); m.get(r[key]).add(r.product_id); }
    return [...m.values()].map((s) => [...s]);
  };
  const items = db.prepare(`SELECT i.order_id, i.product_id, i.qty, o.created_at AS at,
      COALESCE('u' || o.user_id, 'e' || lower(o.customer_email), 'p' || o.customer_phone, 'o' || o.id) AS customer
    FROM order_items i JOIN orders o ON o.id = i.order_id WHERE o.status != 'cancelled'`).all();
  const baskets = group(items, 'order_id').filter((g) => g.length > 1);
  const customers = group(items, 'customer');
  const since = new Date(Date.now() - 90 * 864e5).toISOString();
  const viewRows = db.prepare(`SELECT session_id, product_id, created_at AS at FROM events WHERE type = 'view_item' AND product_id IS NOT NULL AND created_at >= ?`).all(since);
  const sessions = group(viewRows, 'session_id').filter((g) => g.length > 1);
  const b = behaviour({ sales: items, views: viewRows });
  cache = {
    at: Date.now(), baskets, sessions, b,
    i2i: itemToItem(customers),
    ranks: bestSellerRanks(rows, b), choice: choicePicks(rows, b), vocab: vocabulary(rows),
  };
  return { ...cache, rows, byId };
}
export const clearRecCache = () => { cache = { at: 0 }; rowsCache = { at: 0 }; };
/** Price / stock may have changed (admin edit, order, payment, stock sync): drop the short catalogue snapshot. */
export const clearCatalogue = () => { rowsCache = { at: 0 }; };

/** Adds Best Sellers Rank, Utsav's Choice and "bought in past month" to serialized products. */
export function decorate(list) {
  const d = cache.at && Date.now() - cache.at < TTL ? cache : recData();
  return list.map((p) => {
    const rank = d.ranks.get(p.id);
    return {
      ...p,
      bsr: rank ? { rank, category: p.category_name } : null,
      is_choice: d.choice.has(p.id),
      bought_label: boughtLabel(d.b.get(p.id)?.units),
    };
  });
}

/** Serialize raw rows for the storefront (images, offer badge, bundle parts, ranks). */
export function out(rows) {
  const offer = headlineOffer();
  return decorate(rows.map((r) => serializeProduct({ ...r, specs: typeof r.specs === 'string' ? r.specs : JSON.stringify(r.specs || {}) }, { offer })));
}
