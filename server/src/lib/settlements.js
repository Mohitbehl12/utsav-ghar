/**
 * Dealer payments & settlement batches.
 * Finance previews what is due to a dealer (delivered orders not yet settled, returns not
 * yet deducted), creates a batch (status Processing — its orders are locked so they can
 * never be paid twice), then marks it Paid with the bank UTR. Cancelling a batch releases
 * its orders for the next one.
 */
import { db, now, parseJSON } from '../db.js';
import { HttpError } from './http.js';
import { notifyContact } from './notify.js';
import { formatRupees } from '../../../shared/pricing.js';
import { computeSettlement } from '../../../shared/settlement.js';
import { DEFAULT_COMMERCIAL } from '../../../shared/legal.js';

db.exec(`CREATE TABLE IF NOT EXISTS dealer_settlements (
  id          INTEGER PRIMARY KEY,
  number      TEXT NOT NULL UNIQUE,
  dealer_id   INTEGER NOT NULL REFERENCES dealers(id),
  model       TEXT NOT NULL,
  orders      INTEGER NOT NULL DEFAULT 0,
  gross       INTEGER NOT NULL DEFAULT 0,
  returns     INTEGER NOT NULL DEFAULT 0,
  fees        INTEGER NOT NULL DEFAULT 0,
  breakdown   TEXT NOT NULL DEFAULT '{}',
  adjustments TEXT NOT NULL DEFAULT '[]',
  net         INTEGER NOT NULL CHECK (net > 0),
  status      TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing','paid','cancelled')),
  utr         TEXT, paid_on TEXT, note TEXT,
  created_by  INTEGER, paid_by INTEGER,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS dealer_settlement_items (
  id             INTEGER PRIMARY KEY,
  settlement_id  INTEGER NOT NULL REFERENCES dealer_settlements(id) ON DELETE CASCADE,
  kind           TEXT NOT NULL CHECK (kind IN ('sale','return')),
  ref_id         INTEGER NOT NULL,           -- dealer_orders.id or return_requests.id
  label          TEXT NOT NULL,
  amount         INTEGER NOT NULL,
  active         INTEGER NOT NULL DEFAULT 1  -- 0 once the batch is cancelled
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_settle_once ON dealer_settlement_items(kind, ref_id) WHERE active = 1;
CREATE INDEX IF NOT EXISTS idx_settle_dealer ON dealer_settlements(dealer_id, created_at);`);

const commercialOf = (d) => ({ ...DEFAULT_COMMERCIAL, ...parseJSON(d.commercial, {}) });

/** Dealer value of some order lines: dealer price snapshot (unit_cost) or the listing's dealer price. */
function lineValue(dealerId, orderId, model, only = null) {
  const lines = db.prepare('SELECT id, product_id, product_name, qty, unit_cost, line_total, discount_share FROM order_items WHERE order_id = ?').all(orderId);
  const price = (pid) => db.prepare('SELECT COALESCE(approved_dealer_price, dealer_price) p FROM dealer_products WHERE dealer_id = ? AND product_id = ? ORDER BY id DESC LIMIT 1').get(dealerId, pid)?.p || 0;
  let total = 0; let missing = 0;
  for (const l of lines) {
    const qty = only ? only.get(l.id) || 0 : l.qty;
    if (!qty) continue;
    if (model === 'commission') total += Math.round(((l.line_total - l.discount_share) * qty) / l.qty);
    else {
      const unit = l.unit_cost > 0 ? l.unit_cost : price(l.product_id);
      if (!unit) missing += 1;
      total += unit * qty;
    }
  }
  return { value: total, missing };
}

/** Everything currently due to one dealer (not yet in an active batch). */
export function dueFor(dealerId) {
  const d = db.prepare('SELECT * FROM dealers WHERE id = ?').get(dealerId);
  if (!d) throw new HttpError(404, 'Dealer not found.');
  const c = commercialOf(d);
  const sales = db.prepare(`SELECT x.id, x.order_id, x.delivered_at, o.order_number FROM dealer_orders x JOIN orders o ON o.id = x.order_id
    WHERE x.dealer_id = ? AND x.status = 'delivered' AND o.status != 'cancelled'
      AND NOT EXISTS (SELECT 1 FROM dealer_settlement_items i WHERE i.kind = 'sale' AND i.ref_id = x.id AND i.active = 1)
    ORDER BY x.delivered_at`).all(dealerId).map((x) => {
    const v = lineValue(dealerId, x.order_id, c.model);
    return { ref: x.id, order_number: x.order_number, delivered_at: x.delivered_at, value: v.value, missing_price: v.missing > 0 };
  });
  const returns = db.prepare(`SELECT r.id, r.number, r.order_id, r.items, o.order_number FROM return_requests r JOIN orders o ON o.id = r.order_id
    WHERE r.status IN ('received','refunded')
      AND EXISTS (SELECT 1 FROM dealer_orders x WHERE x.order_id = r.order_id AND x.dealer_id = ? AND x.status = 'delivered')
      AND NOT EXISTS (SELECT 1 FROM dealer_settlement_items i WHERE i.kind = 'return' AND i.ref_id = r.id AND i.active = 1)
    ORDER BY r.id`).all(dealerId).map((r) => {
    const only = new Map(parseJSON(r.items, []).map((i) => [i.order_item_id, i.qty]));
    return { ref: r.id, number: r.number, order_number: r.order_number, value: lineValue(dealerId, r.order_id, c.model, only).value };
  });
  return { dealer: d, commercial: c, sales, returns };
}

export function preview(dealerId, adjustments = []) {
  const { dealer, commercial, sales, returns } = dueFor(dealerId);
  const totals = computeSettlement({ model: commercial.model, sales, returns, adjustments, terms: commercial });
  return { dealer_id: dealer.id, business_name: dealer.business_name, bank: dealer.bank_last4 ? `${dealer.bank_name || 'Bank'} ••••${dealer.bank_last4}` : null,
    model: commercial.model, settlement_days: commercial.settlement_days, sales, returns, adjustments, totals,
    warnings: [...(sales.some((s) => s.missing_price) ? ['Some delivered items have no dealer price — check them before paying.'] : []), ...(!dealer.bank_last4 ? ['No bank account on file for this dealer.'] : [])] };
}

const nextNumber = () => `STL-${String((db.prepare('SELECT MAX(id) n FROM dealer_settlements').get().n || 0) + 1001)}`;

export function createSettlement(dealerId, { adjustments = [], note = '', adminId, expectNet = null }) {
  return db.transaction(() => {
    const p = preview(dealerId, adjustments);
    if (!p.sales.length && !p.returns.length && !adjustments.length) throw new HttpError(409, 'Nothing is due to this dealer right now.');
    if (p.totals.net <= 0) throw new HttpError(409, `The net amount is ${formatRupees(p.totals.net)}. Nothing can be paid now — returns or adjustments are carried to the next settlement.`);
    if (expectNet != null && expectNet !== p.totals.net) throw new HttpError(409, 'The amount due changed while you were looking. Please check the new amount.', { preview: p });
    const id = db.prepare('INSERT INTO dealer_settlements(number, dealer_id, model, orders, gross, returns, fees, breakdown, adjustments, net, note, created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(nextNumber(), dealerId, p.model, p.totals.orders, p.totals.gross, p.totals.returns, p.totals.fees, JSON.stringify(p.totals), JSON.stringify(adjustments), p.totals.net, note || null, adminId).lastInsertRowid;
    const ins = db.prepare('INSERT INTO dealer_settlement_items(settlement_id, kind, ref_id, label, amount) VALUES(?,?,?,?,?)');
    for (const s of p.sales) ins.run(id, 'sale', s.ref, s.order_number, s.value);
    for (const r of p.returns) ins.run(id, 'return', r.ref, `${r.number} (${r.order_number})`, -r.value);
    return db.prepare('SELECT * FROM dealer_settlements WHERE id = ?').get(id);
  })();
}

export function settlementAction(s, action, { adminId, utr, paidOn, note }) {
  const t = now();
  if (action === 'pay') {
    if (s.status !== 'processing') throw new HttpError(409, s.status === 'paid' ? 'This settlement is already paid.' : 'Cancelled settlements cannot be paid.');
    if (!utr || !/^[A-Za-z0-9-]{6,30}$/.test(utr)) throw new HttpError(400, 'Enter the bank UTR / reference.', { fields: { utr: 'Required' } });
    if (db.prepare("SELECT 1 FROM dealer_settlements WHERE utr = ? AND id != ? AND status = 'paid'").get(utr, s.id)) throw new HttpError(409, 'This UTR is already used for another settlement.', { fields: { utr: 'Already used' } });
    db.prepare("UPDATE dealer_settlements SET status = 'paid', utr = ?, paid_on = ?, paid_by = ?, note = COALESCE(?, note), updated_at = ? WHERE id = ?").run(utr, paidOn || t.slice(0, 10), adminId, note || null, t, s.id);
    const d = db.prepare('SELECT * FROM dealers WHERE id = ?').get(s.dealer_id);
    notifyContact({ email: d.email || null, phone: d.phone, template: 'dealer_settlement_paid', subject: `Payment ${s.number} sent — ${formatRupees(s.net)}`, text: `Namaste ${d.name},\n\nWe have sent ${formatRupees(s.net)} for settlement ${s.number} (UTR ${utr}). See Payments in the dealer app for the details.\n\nUtsav Ghar` }).catch(() => {});
  } else if (action === 'cancel') {
    if (s.status !== 'processing') throw new HttpError(409, 'Only processing settlements can be cancelled.');
    db.transaction(() => {
      db.prepare("UPDATE dealer_settlements SET status = 'cancelled', note = COALESCE(?, note), updated_at = ? WHERE id = ?").run(note || null, t, s.id);
      db.prepare('UPDATE dealer_settlement_items SET active = 0 WHERE settlement_id = ?').run(s.id);
    })();
  } else throw new HttpError(400, 'Unknown action.');
  return db.prepare('SELECT * FROM dealer_settlements WHERE id = ?').get(s.id);
}

/** For the dealer (and admin detail). Dealer sees only its own batches. */
export function settlementView(s, { withItems = true } = {}) {
  const b = parseJSON(s.breakdown, {});
  return {
    id: s.id, number: s.number, status: s.status, model: s.model, created_at: s.created_at, paid_on: s.paid_on, utr: s.status === 'paid' ? s.utr : null,
    orders: s.orders, gross: s.gross, returns: s.returns, fees: s.fees, commission: b.commission || 0, platform_fees: b.platform_fees || 0, payment_fees: b.payment_fees || 0,
    adjustments: parseJSON(s.adjustments, []), adjustments_total: b.adjustments || 0, net: s.net, note: s.note,
    ...(withItems ? { items: db.prepare('SELECT kind, label, amount FROM dealer_settlement_items WHERE settlement_id = ? ORDER BY kind DESC, id').all(s.id) } : {}),
  };
}

/** Dealer "Payments & settlement" page. */
export function dealerPayments(dealerId) {
  const p = preview(dealerId);
  const rows = db.prepare('SELECT * FROM dealer_settlements WHERE dealer_id = ? ORDER BY id DESC LIMIT 100').all(dealerId);
  const paid = rows.filter((x) => x.status === 'paid');
  const d = db.prepare('SELECT bank_name, bank_last4 FROM dealers WHERE id = ?').get(dealerId) || {};
  return {
    model: p.model, settlement_days: p.settlement_days, bank: d.bank_last4 ? `${d.bank_name || 'Bank'} ••••${d.bank_last4}` : null,
    due: { orders: p.totals.orders, gross: p.totals.gross, returns: p.totals.returns, fees: p.totals.fees, net: p.totals.net,
      items: [...p.sales.map((x) => ({ kind: 'sale', label: x.order_number, amount: x.value, at: x.delivered_at })), ...p.returns.map((x) => ({ kind: 'return', label: `${x.number} (${x.order_number})`, amount: -x.value }))] },
    totals: { paid: paid.reduce((s, x) => s + x.net, 0), processing: rows.filter((x) => x.status === 'processing').reduce((s, x) => s + x.net, 0),
      gross: paid.reduce((s, x) => s + x.gross, 0), returns: paid.reduce((s, x) => s + x.returns, 0), fees: paid.reduce((s, x) => s + x.fees, 0),
      adjustments: paid.reduce((s, x) => s + (parseJSON(x.breakdown, {}).adjustments || 0), 0) },
    settlements: rows.map((x) => settlementView(x)),
  };
}
