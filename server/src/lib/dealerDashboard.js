/**
 * Data for the dealer business dashboard. Reads ONLY the dealer's own rows and only
 * dealer-side money (order_items.unit_cost = dealer price snapshot, or the dealer's approved price).
 * The calculation itself lives in shared/dealerDashboard.js.
 */
import { db, now } from '../db.js';
import { dealerSettings } from './dealers.js';
import { buildDealerDashboard, assertDealerSafe } from '../../../shared/dealerDashboard.js';
import { dealerNotices } from './compliance.js';

db.exec(`CREATE TABLE IF NOT EXISTS dealer_stock_moves (
  id INTEGER PRIMARY KEY,
  dealer_id INTEGER NOT NULL REFERENCES dealers(id),
  dealer_product_id INTEGER REFERENCES dealer_products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  delta INTEGER NOT NULL,
  reason TEXT NOT NULL,            -- added | restock | adjust
  at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_dmoves_dealer ON dealer_stock_moves(dealer_id, at);`);
if (!db.prepare('PRAGMA table_info(dealers)').all().some((c) => c.name === 'notif_seen_at')) db.exec('ALTER TABLE dealers ADD COLUMN notif_seen_at TEXT');

/** Record stock the dealer added or changed (old → new). */
export function logStockMove(dealerId, dp, oldQty, newQty, reason) {
  const delta = Number(newQty) - Number(oldQty || 0);
  if (!delta) return;
  db.prepare('INSERT INTO dealer_stock_moves(dealer_id, dealer_product_id, product_name, delta, reason, at) VALUES(?,?,?,?,?,?)')
    .run(dealerId, dp.id, dp.name, delta, reason || (delta > 0 ? 'restock' : 'adjust'), now());
}

/** Stock the dealer sees right now for one listing: the store's live count once published. */
export function effectiveStock(dp) {
  if (!dp.product_id) return dp.quantity;
  const s = db.prepare('SELECT stock FROM inventory WHERE product_id = ?').get(dp.product_id)?.stock;
  return s ?? dp.quantity;
}

export function dealerDashboardData(dealerId, range) {
  const dps = db.prepare('SELECT d.*, p.is_active FROM dealer_products d LEFT JOIN products p ON p.id = d.product_id WHERE d.dealer_id = ?').all(dealerId);
  const priceByProduct = new Map(dps.filter((d) => d.product_id).map((d) => [d.product_id, d.approved_dealer_price || d.dealer_price]));
  const products = dps.map((d) => ({
    id: d.id, product_id: d.product_id, name: d.name, status: d.status, live: !!(d.product_id && d.is_active),
    stock: d.product_id ? effectiveStock(d) : d.quantity, dealer_price: d.approved_dealer_price || d.dealer_price,
    reviewed_at: d.reviewed_at, updated_at: d.updated_at, note: d.admin_note || null,
  }));
  // the dealer's latest row per order (an order can come back after being moved)
  const rows = db.prepare(`SELECT d.*, o.order_number, o.ship_city, o.ship_pincode, o.status order_status FROM dealer_orders d JOIN orders o ON o.id = d.order_id
    WHERE d.dealer_id = ? AND d.id = (SELECT MAX(id) FROM dealer_orders x WHERE x.order_id = d.order_id AND x.dealer_id = d.dealer_id)
    AND d.sent_at >= ? ORDER BY d.sent_at DESC LIMIT 5000`).all(dealerId, new Date(Date.now() - 2 * 400 * 864e5).toISOString());
  const lineQ = db.prepare('SELECT product_id, product_name, qty, unit_cost FROM order_items WHERE order_id = ? ORDER BY id');
  const orders = rows.map((r) => ({
    order_number: r.order_number, status: r.status, sent_at: r.sent_at, accepted_at: r.accepted_at, out_at: r.out_at, delivered_at: r.delivered_at,
    city: r.ship_city, pincode: r.ship_pincode, cancelled: r.order_status === 'cancelled',
    lines: lineQ.all(r.order_id).map((l) => {
      const unit = l.unit_cost > 0 ? l.unit_cost : priceByProduct.get(l.product_id) || null;
      return { product_id: l.product_id, name: l.product_name, qty: l.qty, value: unit ? unit * l.qty : null };
    }),
  }));
  const moves = db.prepare('SELECT at, delta, product_name FROM dealer_stock_moves WHERE dealer_id = ? AND at >= ?').all(dealerId, new Date(Date.now() - 400 * 864e5).toISOString());
  const seenAt = db.prepare('SELECT notif_seen_at FROM dealers WHERE id = ?').get(dealerId)?.notif_seen_at || null;
  const joined = db.prepare('SELECT created_at FROM dealers WHERE id = ?').get(dealerId)?.created_at;
  const notices = dealerNotices(dealerId, joined).map((n) => ({ at: n.created_at, kind: n.kind === 'violation' || n.kind === 'doc_expiry' ? 'urgent' : 'warn', icon: n.kind === 'violation' ? '⚠️' : n.kind === 'doc_expiry' ? '🪪' : '📜', text: n.body ? `${n.title} — ${n.body}` : n.title, link: n.link || '/dealer/legal' }));
  const out = buildDealerDashboard({ products, orders, moves, range, now: Date.now(), seenAt, acceptMinutes: dealerSettings().accept_minutes, notices });
  return assertDealerSafe(out);
}

export function markNotificationsSeen(dealerId) {
  db.prepare('UPDATE dealers SET notif_seen_at = ? WHERE id = ?').run(now(), dealerId);
}

export const dealerProfile = (d) => {
  const r = db.prepare('SELECT created_at, last_login_at FROM dealers WHERE id = ?').get(d.id) || {};
  return {
    name: d.name, business_name: d.business_name, phone: d.phone, email: d.email, address: d.address, city: d.city, state: d.state, pincode: d.pincode, gstin: d.gstin,
    serves: d.all_india ? 'All India' : (d.pincodes || []).slice(0, 20), serves_count: d.all_india ? null : (d.pincodes || []).length,
    member_since: r.created_at, last_login_at: r.last_login_at, categories: (d.category_ids || []).map((id) => db.prepare('SELECT name FROM categories WHERE id = ?').get(id)?.name).filter(Boolean),
  };
};
