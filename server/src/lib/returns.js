/**
 * Cancellations, returns and refunds.
 *
 * Customer cancels free of charge until the order is packed (policy §1).
 * Return within the return window (default 7 days from delivery; damaged / wrong /
 * missing must be reported within 48 hours) → Requested → Approved → Received → Refunded.
 * Every rupee refunded is one row in `refunds`; one refund per return and one per
 * cancellation, and the total can never exceed what the customer paid.
 */
import { db, now, parseJSON } from '../db.js';
import { HttpError } from './http.js';
import { bundleItems } from './catalog.js';
import { notifyContact } from './notify.js';
import { notifyDealer, dealerFromRow } from './dealers.js';
import { formatRupees } from '../../../shared/pricing.js';
import { RETURN_REASONS, returnRefundAmount } from '../../../shared/returns.js';

db.exec(`CREATE TABLE IF NOT EXISTS return_requests (
  id            INTEGER PRIMARY KEY,
  number        TEXT NOT NULL UNIQUE,
  order_id      INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  user_id       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  items         TEXT NOT NULL,              -- [{order_item_id, product_id, name, qty, unit_paid}]
  reason        TEXT NOT NULL,
  details       TEXT,
  photo_path    TEXT,
  status        TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','approved','rejected','received','refunded','cancelled')),
  refund_amount INTEGER NOT NULL DEFAULT 0,
  includes_delivery INTEGER NOT NULL DEFAULT 0,
  restocked     INTEGER NOT NULL DEFAULT 0,
  admin_note    TEXT,
  decided_by    INTEGER, decided_at TEXT, received_at TEXT, refunded_at TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_returns_order ON return_requests(order_id);
CREATE INDEX IF NOT EXISTS idx_returns_status ON return_requests(status, created_at);
CREATE TABLE IF NOT EXISTS refunds (
  id            INTEGER PRIMARY KEY,
  order_id      INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  return_id     INTEGER UNIQUE REFERENCES return_requests(id) ON DELETE SET NULL,
  kind          TEXT NOT NULL CHECK (kind IN ('cancellation','return')),
  amount        INTEGER NOT NULL CHECK (amount > 0),
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processed','failed')),
  method        TEXT,
  reference     TEXT,
  failure_reason TEXT,
  attempts      INTEGER NOT NULL DEFAULT 0,
  processed_by  INTEGER, processed_at TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_refund_cancel_once ON refunds(order_id) WHERE kind = 'cancellation';
CREATE INDEX IF NOT EXISTS idx_refunds_status ON refunds(status, created_at);`);

const event = (orderId, status, note) => db.prepare('INSERT INTO order_events(order_id, status, note) VALUES(?,?,?)').run(orderId, status, note || null);
const refundedOrPending = (orderId) => db.prepare("SELECT COALESCE(SUM(amount), 0) n FROM refunds WHERE order_id = ? AND status IN ('pending','processed','failed')").get(orderId).n;
export const refundedTotal = (orderId) => db.prepare("SELECT COALESCE(SUM(amount), 0) n FROM refunds WHERE order_id = ? AND status = 'processed'").get(orderId).n;

/** Where the order is in packing: store path = status; dealer path = latest dealer_orders row. */
function packingStage(o) {
  const d = db.prepare("SELECT status FROM dealer_orders WHERE order_id = ? AND status NOT IN ('rejected','reassigned') ORDER BY id DESC LIMIT 1").get(o.id);
  return d?.status || null;
}
/** Can the CUSTOMER still cancel? { ok, reason } */
export function cancelCheck(o) {
  if (o.status === 'cancelled') return { ok: false, reason: 'This order is already cancelled.' };
  if (!['placed', 'payment_confirmed'].includes(o.status)) return { ok: false, reason: 'This order is already being packed or on its way, so it cannot be cancelled here. You can refuse the delivery or request a return.' };
  const stage = packingStage(o);
  if (stage && !['sent', 'accepted'].includes(stage)) return { ok: false, reason: 'Your order has been packed, so it cannot be cancelled here. You can refuse the delivery or request a return.' };
  return { ok: true };
}

/** Restore stock for every item (combos give back their parts). */
function restock(orderId, only = null) {
  const add = db.prepare('UPDATE inventory SET stock = stock + ?, updated_at = ? WHERE product_id = ?');
  const rows = db.prepare('SELECT id, product_id, qty FROM order_items WHERE order_id = ?').all(orderId);
  for (const i of rows) {
    const qty = only ? only.get(i.id) || 0 : i.qty;
    if (!i.product_id || !qty) continue;
    add.run(qty, now(), i.product_id);
    for (const part of bundleItems(i.product_id)) add.run(part.qty * qty, now(), part.product_id);
  }
}

/**
 * Cancel an order (customer or admin). Restocks, closes the dealer job and — when the
 * customer has paid — opens a full refund (pending) for the finance team.
 */
export function cancelOrder(o, { by = 'admin', reason = '', note = '' } = {}) {
  const openJobs = db.prepare("SELECT dealer_id FROM dealer_orders WHERE order_id = ? AND status NOT IN ('delivered','cancelled','rejected','reassigned')").all(o.id);
  const out = db.transaction(() => {
    const fresh = db.prepare('SELECT * FROM orders WHERE id = ?').get(o.id);
    if (fresh.status === 'cancelled') throw new HttpError(409, 'This order is already cancelled.');
    if (by === 'customer') { const c = cancelCheck(fresh); if (!c.ok) throw new HttpError(409, c.reason); }
    else if (fresh.status === 'delivered') throw new HttpError(409, 'This order can no longer be cancelled.');
    restock(fresh.id);
    db.prepare("UPDATE orders SET status = 'cancelled', updated_at = ? WHERE id = ?").run(now(), fresh.id);
    const t = now();
    db.prepare("UPDATE dealer_orders SET status = 'cancelled', closed_at = ?, updated_at = ? WHERE order_id = ? AND status NOT IN ('delivered','cancelled','rejected','reassigned')").run(t, t, fresh.id);
    const paid = fresh.payment_status === 'confirmed';
    let refund = null;
    if (paid) refund = openRefund(fresh, { kind: 'cancellation', amount: fresh.total - refundedOrPending(fresh.id) });
    event(fresh.id, 'cancelled', [by === 'customer' ? 'Cancelled by customer' : 'Cancelled by the store', reason, note, paid ? 'refund due' : ''].filter(Boolean).join(' — '));
    return { order: db.prepare('SELECT * FROM orders WHERE id = ?').get(fresh.id), refund };
  })();
  for (const j of openJobs) notifyDealer(dealerFromRow(db.prepare('SELECT * FROM dealers WHERE id = ?').get(j.dealer_id)), out.order, 'cancelled')?.catch?.(() => {});
  return out;
}

function openRefund(o, { kind, amount, returnId = null }) {
  if (!(amount > 0)) return null;
  const left = o.total - refundedOrPending(o.id);
  if (left <= 0) throw new HttpError(409, 'Everything paid for this order has already been refunded.');
  amount = Math.min(amount, left); // never more than what was paid (rounding across several returns)
  const id = db.prepare('INSERT INTO refunds(order_id, return_id, kind, amount) VALUES(?,?,?,?)').run(o.id, returnId, kind, amount).lastInsertRowid;
  event(o.id, 'refund_pending', `Refund of ${formatRupees(amount)} opened (${kind})`);
  return db.prepare('SELECT * FROM refunds WHERE id = ?').get(id);
}

/** Paid by gateway after the order was already cancelled → refund automatically opens. */
export function paymentAfterCancel(o) {
  if (o.status !== 'cancelled' || o.payment_status !== 'confirmed') return null;
  if (db.prepare("SELECT 1 FROM refunds WHERE order_id = ? AND kind = 'cancellation'").get(o.id)) return null;
  return openRefund(o, { kind: 'cancellation', amount: o.total - refundedOrPending(o.id) });
}

// ------------------------------------------------------------------------- returns
const RETURN_WINDOW_DAYS = 7;
const DAMAGE_HOURS = 48;
const deliveredAt = (o) => db.prepare("SELECT created_at FROM order_events WHERE order_id = ? AND status = 'delivered' ORDER BY id DESC LIMIT 1").get(o.id)?.created_at || null;

/** What the customer can still return from this order. */
export function returnable(o) {
  const at = deliveredAt(o);
  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ? ORDER BY id').all(o.id);
  const open = db.prepare("SELECT items FROM return_requests WHERE order_id = ? AND status NOT IN ('rejected','cancelled')").all(o.id).flatMap((r) => parseJSON(r.items, []));
  const used = new Map();
  for (const x of open) used.set(x.order_item_id, (used.get(x.order_item_id) || 0) + x.qty);
  const age = at ? (Date.now() - Date.parse(at)) : null;
  const windowOk = o.status === 'delivered' && age != null && age <= RETURN_WINDOW_DAYS * 864e5;
  const damageOk = o.status === 'delivered' && age != null && age <= DAMAGE_HOURS * 36e5;
  return {
    delivered_at: at, window_days: RETURN_WINDOW_DAYS, damage_hours: DAMAGE_HOURS,
    window_ends: at ? new Date(Date.parse(at) + RETURN_WINDOW_DAYS * 864e5).toISOString() : null,
    can_return: windowOk, can_report_damage: damageOk,
    items: items.map((i) => ({ order_item_id: i.id, product_id: i.product_id, name: i.product_name, qty: i.qty, left: Math.max(0, i.qty - (used.get(i.id) || 0)) })),
  };
}

let seq = null;
const nextNumber = () => {
  seq = (db.prepare('SELECT MAX(id) n FROM return_requests').get().n || 0) + 1;
  return `RET-${String(1000 + seq)}`;
};

export function createReturn(o, { items, reason, details, photo, userId }) {
  if (!RETURN_REASONS[reason]) throw new HttpError(400, 'Choose a reason.', { fields: { reason: 'Choose a reason' } });
  if (o.status !== 'delivered') throw new HttpError(409, 'You can request a return after the order is delivered.');
  if (o.payment_status !== 'confirmed') throw new HttpError(409, 'This order has no confirmed payment to refund. Please contact support.');
  const R = returnable(o);
  const quick = RETURN_REASONS[reason].damage;
  if (quick ? !R.can_report_damage && !R.can_return : !R.can_return) {
    throw new HttpError(409, quick ? `Damaged, wrong or missing items must be reported within ${DAMAGE_HOURS} hours of delivery. Please contact support.` : `The return window (${RETURN_WINDOW_DAYS} days from delivery) has ended.`);
  }
  if (quick && !R.can_report_damage) { /* inside 7 days but after 48 h: allowed as a normal return */ }
  const byId = new Map(R.items.map((i) => [i.order_item_id, i]));
  const rows = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(o.id);
  const chosen = [];
  for (const it of items || []) {
    const r = byId.get(Number(it.order_item_id));
    const qty = Number(it.qty);
    if (!r) throw new HttpError(400, 'One of the items is not in this order.');
    if (!Number.isInteger(qty) || qty < 1) throw new HttpError(400, 'Choose how many pieces to return.');
    if (qty > r.left) throw new HttpError(409, `You can return at most ${r.left} of “${r.name}”.`);
    const row = rows.find((x) => x.id === r.order_item_id);
    chosen.push({ order_item_id: row.id, product_id: row.product_id, name: row.product_name, qty, paid: Math.round(((row.line_total - row.discount_share) * qty) / row.qty) });
  }
  if (!chosen.length) throw new HttpError(400, 'Choose at least one item to return.', { fields: { items: 'Choose an item' } });
  if (RETURN_REASONS[reason].photo && !photo) throw new HttpError(400, 'Please add a photo of the item and the box.', { fields: { photo: 'Photo needed' } });
  const dup = db.prepare("SELECT number FROM return_requests WHERE order_id = ? AND status = 'requested'").get(o.id);
  if (dup) throw new HttpError(409, `You already have an open return request (${dup.number}) for this order. We will reply soon.`);
  const deliveryAlready = db.prepare('SELECT 1 FROM return_requests WHERE order_id = ? AND includes_delivery = 1 AND status NOT IN (\'rejected\',\'cancelled\')').get(o.id);
  const amt = returnRefundAmount({ items: chosen, reason, deliveryFee: o.delivery_fee, deliveryAlreadyRefunded: !!deliveryAlready });
  const id = db.prepare('INSERT INTO return_requests(number, order_id, user_id, items, reason, details, photo_path, refund_amount, includes_delivery) VALUES(?,?,?,?,?,?,?,?,?)')
    .run(nextNumber(), o.id, userId || null, JSON.stringify(chosen), reason, details || null, photo || null, amt.total, amt.delivery > 0 ? 1 : 0).lastInsertRowid;
  const rr = db.prepare('SELECT * FROM return_requests WHERE id = ?').get(id);
  event(o.id, 'return_requested', `${rr.number}: ${RETURN_REASONS[reason].label}`);
  notifyContact({ email: o.customer_email, template: 'return_requested', subject: `Return request ${rr.number} received`, text: `Namaste ${o.customer_name},\n\nWe have received your return request ${rr.number} for order ${o.order_number}. We will reply within 1 working day.\n\nTeam Utsav Ghar` }).catch(() => {});
  return rr;
}

export function returnView(r, { admin = false } = {}) {
  const o = db.prepare('SELECT order_number, customer_name, customer_phone, delivery_fee FROM orders WHERE id = ?').get(r.order_id) || {};
  const refund = db.prepare('SELECT id, amount, status, method, reference, failure_reason, processed_at FROM refunds WHERE return_id = ?').get(r.id) || null;
  return {
    id: r.id, number: r.number, order_number: o.order_number, status: r.status, reason: r.reason, reason_label: RETURN_REASONS[r.reason]?.label || r.reason,
    details: r.details, items: parseJSON(r.items, []), refund_amount: r.refund_amount, includes_delivery: !!r.includes_delivery, has_photo: !!r.photo_path,
    admin_note: r.admin_note, created_at: r.created_at, decided_at: r.decided_at, received_at: r.received_at, refunded_at: r.refunded_at, refund,
    ...(admin ? { order_id: r.order_id, customer: { name: o.customer_name, phone: o.customer_phone }, restocked: !!r.restocked } : {}),
  };
}

/** Admin actions on a return. */
export function returnAction(r, action, { adminId, note, restock: putBack = true, amount } = {}) {
  const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(r.order_id);
  const need = (c, m) => { if (!c) throw new HttpError(409, m); };
  const t = now();
  const set = (fields) => { const k = Object.keys(fields); db.prepare(`UPDATE return_requests SET ${k.map((x) => `${x} = ?`).join(', ')}, updated_at = ? WHERE id = ?`).run(...k.map((x) => fields[x]), t, r.id); };
  return db.transaction(() => {
    const cur = db.prepare('SELECT * FROM return_requests WHERE id = ?').get(r.id);
    switch (action) {
      case 'approve': {
        need(cur.status === 'requested', 'Only new requests can be approved.');
        let refundAmount = cur.refund_amount;
        if (amount != null) {
          need(Number.isInteger(amount) && amount > 0 && amount <= cur.refund_amount, 'The refund can be lowered but not raised above the calculated amount.');
          refundAmount = amount;
        }
        set({ status: 'approved', decided_by: adminId, decided_at: t, admin_note: note || cur.admin_note, refund_amount: refundAmount });
        event(o.id, 'return_approved', `${cur.number} approved${note ? ` — ${note}` : ''}`);
        // the dealer who delivered it takes resaleable goods back (Dealer Agreement → Returns)
        const job = db.prepare("SELECT dealer_id FROM dealer_orders WHERE order_id = ? AND status = 'delivered' ORDER BY id DESC LIMIT 1").get(o.id);
        const dl = job && db.prepare('SELECT * FROM dealers WHERE id = ?').get(job.dealer_id);
        if (dl) notifyContact({ email: dl.email || null, phone: dl.phone, template: 'dealer_return', subject: `Return ${cur.number} for order ${o.order_number}`, text: `Namaste ${dl.name},\n\nA return (${cur.number}) was approved for order ${o.order_number}: ${parseJSON(cur.items, []).map((i) => `${i.qty} × ${i.name}`).join(', ')}. Our team will contact you about the pickup.\n\nUtsav Ghar` }).catch(() => {});
        notifyContact({ email: o.customer_email, phone: o.customer_phone, template: 'return_approved', subject: `Return ${cur.number} approved`, text: `Your return ${cur.number} is approved. Please keep the item(s) packed — we will arrange the pickup. Refund of ${formatRupees(refundAmount)} after we receive them.` }).catch(() => {});
        break;
      }
      case 'reject':
        need(cur.status === 'requested', 'Only new requests can be rejected.');
        need(note && note.length >= 5, 'Write the reason the customer will see.');
        set({ status: 'rejected', decided_by: adminId, decided_at: t, admin_note: note });
        event(o.id, 'return_rejected', `${cur.number}: ${note}`);
        notifyContact({ email: o.customer_email, template: 'return_rejected', subject: `Return ${cur.number}`, text: `We could not accept return ${cur.number}: ${note}. Reply to this email if you have questions.` }).catch(() => {});
        break;
      case 'receive': {
        need(cur.status === 'approved', 'Approve the return before marking it received.');
        if (putBack) restock(o.id, new Map(parseJSON(cur.items, []).map((i) => [i.order_item_id, i.qty])));
        set({ status: 'received', received_at: t, restocked: putBack ? 1 : 0 });
        event(o.id, 'return_received', `${cur.number} received${putBack ? ' and put back in stock' : ' (not resaleable)'}`);
        // refund opens automatically for finance
        openRefund(o, { kind: 'return', amount: cur.refund_amount, returnId: cur.id });
        break;
      }
      case 'cancel':
        need(['requested', 'approved'].includes(cur.status), 'This return can no longer be cancelled.');
        set({ status: 'cancelled', admin_note: note || cur.admin_note });
        event(o.id, 'return_cancelled', cur.number);
        break;
      default: throw new HttpError(400, 'Unknown action.');
    }
    return db.prepare('SELECT * FROM return_requests WHERE id = ?').get(r.id);
  })();
}

/** Finance: mark a refund paid (or failed, then retry). */
export function refundAction(f, action, { adminId, reference, method, reason }) {
  const t = now();
  return db.transaction(() => {
    const cur = db.prepare('SELECT * FROM refunds WHERE id = ?').get(f.id);
    const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(cur.order_id);
    if (action === 'process') {
      if (cur.status === 'processed') throw new HttpError(409, 'This refund is already marked as paid.');
      if (!reference || reference.length < 4) throw new HttpError(400, 'Enter the refund reference (UTR / gateway refund ID).', { fields: { reference: 'Required' } });
      if (db.prepare("SELECT 1 FROM refunds WHERE reference = ? AND id != ? AND status = 'processed'").get(reference, cur.id)) throw new HttpError(409, 'This reference is already used for another refund.', { fields: { reference: 'Already used' } });
      if (refundedTotal(o.id) + cur.amount > o.total) throw new HttpError(409, 'Refunds would exceed the amount paid.');
      db.prepare("UPDATE refunds SET status = 'processed', reference = ?, method = ?, processed_by = ?, processed_at = ?, attempts = attempts + 1, failure_reason = NULL, updated_at = ? WHERE id = ?")
        .run(reference, method || 'original', adminId, t, t, cur.id);
      const pay = db.prepare('SELECT id FROM payments WHERE order_id = ?').get(o.id);
      if (pay) db.prepare('INSERT INTO payment_transactions(payment_id, type, amount, reference, raw) VALUES(?,?,?,?,?)').run(pay.id, 'refunded', cur.amount, reference, JSON.stringify({ adminId, refund_id: cur.id, kind: cur.kind }));
      const total = refundedTotal(o.id);
      if (total >= o.total) {
        db.prepare("UPDATE orders SET payment_status = 'refunded', updated_at = ? WHERE id = ?").run(t, o.id);
        if (pay) db.prepare("UPDATE payments SET status = 'refunded', updated_at = ? WHERE id = ?").run(t, pay.id);
      }
      if (cur.return_id) db.prepare("UPDATE return_requests SET status = 'refunded', refunded_at = ?, updated_at = ? WHERE id = ?").run(t, t, cur.return_id);
      event(o.id, 'refunded', `${formatRupees(cur.amount)} refunded · ref ${reference}`);
      notifyContact({ email: o.customer_email, phone: o.customer_phone, template: 'refunded', subject: `Refund of ${formatRupees(cur.amount)} sent — ${o.order_number}`, text: `We have sent your refund of ${formatRupees(cur.amount)} for order ${o.order_number} (reference ${reference}). Banks usually show it within 5–7 working days.` }).catch(() => {});
    } else if (action === 'fail') {
      if (cur.status === 'processed') throw new HttpError(409, 'This refund is already paid.');
      if (!reason) throw new HttpError(400, 'Write why the refund failed.', { fields: { reason: 'Required' } });
      db.prepare("UPDATE refunds SET status = 'failed', failure_reason = ?, attempts = attempts + 1, updated_at = ? WHERE id = ?").run(reason, t, cur.id);
      event(o.id, 'refund_failed', reason);
    } else throw new HttpError(400, 'Unknown action.');
    return db.prepare('SELECT * FROM refunds WHERE id = ?').get(cur.id);
  })();
}

export const refundView = (f) => {
  const o = db.prepare('SELECT order_number, customer_name, customer_phone, total, payment_method FROM orders WHERE id = ?').get(f.order_id) || {};
  const rr = f.return_id ? db.prepare('SELECT number FROM return_requests WHERE id = ?').get(f.return_id) : null;
  return { ...f, order_number: o.order_number, customer_name: o.customer_name, order_total: o.total, return_number: rr?.number || null, refunded_total: refundedTotal(f.order_id) };
};

/** For the order page (customer): cancel option, returns and refunds. */
export function afterSalesFor(o) {
  const c = cancelCheck(o);
  return {
    can_cancel: c.ok, cancel_note: c.ok ? 'You can cancel free of charge until the order is packed.' : c.reason,
    returns: db.prepare('SELECT * FROM return_requests WHERE order_id = ? ORDER BY id DESC').all(o.id).map((r) => returnView(r)),
    refunds: db.prepare('SELECT id, kind, amount, status, reference, processed_at, created_at FROM refunds WHERE order_id = ? ORDER BY id').all(o.id).map((f) => ({ ...f, reference: f.status === 'processed' ? f.reference : null })),
    returnable: o.status === 'delivered' ? returnable(o) : null,
  };
}
