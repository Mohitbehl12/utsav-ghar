/**
 * Dealer order management: routing paid orders to the right dealer, the dealer's
 * step-by-step status updates, delivery OTP, reminders and auto-reassignment.
 * Shared rules (flow, labels, dealer matching) live in shared/dealers.js.
 */
import crypto from 'node:crypto';
import { db, now, parseJSON } from '../db.js';
import { config } from '../config.js';
import { HttpError } from './http.js';
import { notifyContact, notifyOrder } from './notify.js';
import { getSettings } from './catalog.js';
import { clearCatalogue } from './recommend.js';
import { canReceiveOrders } from './legal.js';
import { pickDealer, DEALER_STATUS, NEXT_STEP, EVENT_FOR, isOpen, maskForDealer, COURIER_UPDATES } from '../../../shared/dealers.js';

export function dealerSettings() {
  const s = getSettings();
  return {
    auto_assign: s.dealer_auto_assign !== 'false' && s.dealer_auto_assign !== false,
    auto_reassign: s.dealer_auto_reassign !== 'false' && s.dealer_auto_reassign !== false,
    accept_minutes: Math.min(24 * 60, Math.max(10, Number(s.dealer_accept_minutes) || 120)),
  };
}

export const dealerFromRow = (r) => r && ({
  id: r.id, name: r.name, business_name: r.business_name, phone: r.phone, email: r.email,
  address: r.address, city: r.city, state: r.state, pincode: r.pincode, gstin: r.gstin,
  pincodes: parseJSON(r.pincodes, []), all_india: !!r.all_india,
  category_ids: parseJSON(r.category_ids, []), product_ids: parseJSON(r.product_ids, []),
  priority: r.priority, is_active: !!r.is_active, must_change_password: !!r.must_change_password,
  last_login_at: r.last_login_at, created_at: r.created_at,
  onboarding_status: r.onboarding_status || 'draft', onboarding_deadline: r.onboarding_deadline || null, self_registered: !!r.self_registered,
  can_receive_orders: canReceiveOrders(r),
});
/** Dealers the router may pick: switched on AND approved (or an existing dealer inside its grace period). */
const routable = (list) => list.map((d) => ({ ...d, is_active: d.is_active && d.can_receive_orders }));

export function allDealers() {
  const open = new Map(db.prepare(`SELECT dealer_id, COUNT(*) n FROM dealer_orders WHERE status IN ('sent','accepted','packed','ready','out_for_delivery') GROUP BY dealer_id`).all().map((x) => [x.dealer_id, x.n]));
  return db.prepare('SELECT * FROM dealers ORDER BY is_active DESC, business_name').all().map((r) => ({ ...dealerFromRow(r), open_orders: open.get(r.id) || 0 }));
}

/** The assignment that currently owns the order (not rejected / moved). */
export const currentAssignment = (orderId) =>
  db.prepare("SELECT * FROM dealer_orders WHERE order_id = ? AND status NOT IN ('rejected','reassigned') ORDER BY id DESC LIMIT 1").get(orderId);

function orderItemsForMatch(orderId) {
  return db.prepare('SELECT i.product_id, p.category_id FROM order_items i LEFT JOIN products p ON p.id = i.product_id WHERE i.order_id = ?').all(orderId);
}

export function candidatesFor(order) {
  const tried = db.prepare("SELECT dealer_id FROM dealer_orders WHERE order_id = ? AND status IN ('rejected','reassigned')").all(order.id).map((x) => x.dealer_id);
  const r = pickDealer({ dealers: routable(allDealers()), items: orderItemsForMatch(order.id), pincode: order.ship_pincode });
  return r.candidates.map((c) => ({ id: c.dealer.id, business_name: c.dealer.business_name, city: c.dealer.city, ok: c.ok, reasons: c.reasons, open_orders: c.dealer.open_orders, tried: tried.includes(c.dealer.id), is_active: c.dealer.is_active }));
}

const event = (orderId, status, note) => db.prepare('INSERT INTO order_events(order_id, status, note) VALUES(?,?,?)').run(orderId, status, note || null);

function dealerLink(orderNumber) { return `${config.publicUrl}/dealer/orders/${orderNumber}`; }

export async function notifyDealer(dealer, order, kind) {
  const items = db.prepare('SELECT product_name, qty FROM order_items WHERE order_id = ?').all(order.id);
  const list = items.map((i) => `• ${i.product_name} × ${i.qty}`).join('\n');
  const msg = {
    new: { subject: `New order ${order.order_number} — please accept`, text: `Namaste ${dealer.name},\n\nNew order ${order.order_number} for ${order.ship_city} ${order.ship_pincode}:\n${list}\n\nPlease accept and pack: ${dealerLink(order.order_number)}\n\nUtsav Ghar` },
    reminder: { subject: `Reminder: order ${order.order_number} is waiting`, text: `Namaste ${dealer.name},\n\nOrder ${order.order_number} is still waiting for you to accept. Please accept or reject it now: ${dealerLink(order.order_number)}\n\nUtsav Ghar` },
    cancelled: { subject: `Order ${order.order_number} cancelled — do not ship`, text: `Namaste ${dealer.name},\n\nOrder ${order.order_number} has been cancelled. Please do NOT pack or send it. If it is already packed, keep it aside; our team will contact you.\n\nUtsav Ghar` },
    moved: { subject: `Order ${order.order_number} moved`, text: `Namaste ${dealer.name},\n\nOrder ${order.order_number} has been given to another dealer. No action needed.\n\nUtsav Ghar` },
  }[kind];
  if (!msg) return;
  await notifyContact({ email: dealer.email || null, phone: dealer.phone, template: `dealer_${kind}`, subject: msg.subject, text: msg.text }).catch(() => {});
}

/**
 * Send the order to a dealer. Without dealerId the best dealer is picked automatically
 * (skipping dealers who already rejected it). Returns the new assignment row or null.
 */
export function assignOrder(orderId, { dealerId = null, by = 'auto', note } = {}) {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (!order) throw new HttpError(404, 'Order not found');
  if (order.status === 'cancelled') throw new HttpError(409, 'This order is cancelled.');
  if (order.payment_status !== 'confirmed') throw new HttpError(409, 'Confirm the payment before sending the order to a dealer.');
  if (['out_for_delivery', 'delivered'].includes(order.status) && !dealerId) return null;
  const cur = currentAssignment(orderId);
  let dealer;
  if (dealerId) {
    dealer = dealerFromRow(db.prepare('SELECT * FROM dealers WHERE id = ?').get(dealerId));
    if (!dealer) throw new HttpError(404, 'Dealer not found');
    if (!dealer.is_active) throw new HttpError(409, 'This dealer is switched off.');
    if (!dealer.can_receive_orders) throw new HttpError(409, 'This dealer has not completed KYC and the dealer agreement, or is not approved yet.');
    if (cur && cur.dealer_id === dealer.id && isOpen(cur.status)) throw new HttpError(409, 'The order is already with this dealer.');
  } else {
    const tried = db.prepare('SELECT dealer_id FROM dealer_orders WHERE order_id = ?').all(orderId).map((x) => x.dealer_id);
    dealer = pickDealer({ dealers: routable(allDealers()), items: orderItemsForMatch(orderId), pincode: order.ship_pincode, exclude: tried }).dealer;
    if (!dealer) return null;
  }
  const t = now();
  const prev = cur && isOpen(cur.status) ? db.prepare('SELECT * FROM dealers WHERE id = ?').get(cur.dealer_id) : null;
  const id = db.transaction(() => {
    if (prev) db.prepare("UPDATE dealer_orders SET status = 'reassigned', reject_reason = COALESCE(reject_reason, ?), closed_at = ?, updated_at = ? WHERE id = ?").run(note || 'Moved by the store', t, t, cur.id);
    const r = db.prepare('INSERT INTO dealer_orders(order_id, dealer_id, assigned_by, sent_at, updated_at) VALUES(?,?,?,?,?)').run(orderId, dealer.id, by, t, t);
    // back to "payment confirmed" stage if a previous dealer had started
    if (order.status === 'processing') db.prepare("UPDATE orders SET status = 'payment_confirmed', updated_at = ? WHERE id = ?").run(t, orderId);
    event(orderId, 'sent_to_dealer', prev ? 'Moved to another partner store' : 'Sent to our partner store for packing');
    return r.lastInsertRowid;
  })();
  notifyDealer(dealer, order, 'new');
  if (prev) notifyDealer(dealerFromRow(prev), order, 'moved');
  return db.prepare('SELECT * FROM dealer_orders WHERE id = ?').get(id);
}

/** Called whenever a payment becomes confirmed (gateway, webhook or admin). */
export function afterPaymentConfirmed(orderId) {
  try {
    const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
    if (!o || o.payment_status !== 'confirmed' || o.status === 'cancelled') return null;
    if (!dealerSettings().auto_assign || currentAssignment(orderId)) return null;
    if ((o.ship_country || 'IN') !== 'IN') return null; // international orders ship from the store
    return assignOrder(orderId);
  } catch { return null; }
}

/** Keep the dealer side in step when the admin changes the order directly. */
export function syncFromAdmin(orderId, action) {
  const cur = currentAssignment(orderId);
  if (!cur || !isOpen(cur.status)) return;
  const t = now();
  if (action === 'cancel') {
    db.prepare("UPDATE dealer_orders SET status = 'cancelled', closed_at = ?, updated_at = ? WHERE id = ?").run(t, t, cur.id);
    const d = dealerFromRow(db.prepare('SELECT * FROM dealers WHERE id = ?').get(cur.dealer_id));
    notifyDealer(d, db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId), 'cancelled');
  }
  if (action === 'deliver') db.prepare("UPDATE dealer_orders SET status = 'delivered', delivered_at = ?, closed_at = ?, updated_at = ? WHERE id = ?").run(t, t, t, cur.id);
}

// ---------------------------------------------------------------- dealer views
const STEP_TIME = { accepted: 'accepted_at', packed: 'packed_at', ready: 'ready_at', out_for_delivery: 'out_at', delivered: 'delivered_at' };

export function dealerOrderView(row, { full = true } = {}) {
  const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(row.order_id);
  const items = db.prepare(`SELECT i.id, i.product_id, i.product_name name, i.qty, p.specs, c.name category
    FROM order_items i LEFT JOIN products p ON p.id = i.product_id LEFT JOIN categories c ON c.id = p.category_id WHERE i.order_id = ? ORDER BY i.id`).all(o.id);
  const who = maskForDealer({ ...o, delivered_at: row.delivered_at }, row.status);
  const base = {
    order_number: o.order_number, status: row.status, status_label: DEALER_STATUS[row.status]?.label,
    sent_at: row.sent_at, accepted_at: row.accepted_at, packed_at: row.packed_at, ready_at: row.ready_at, out_at: row.out_at, delivered_at: row.delivered_at,
    city: o.ship_city, pincode: o.ship_pincode, items_count: items.reduce((s, i) => s + i.qty, 0), lines: items.length,
    deliver_by: o.estimated_delivery, paid: o.payment_status === 'confirmed', order_cancelled: o.status === 'cancelled',
    first_item: items[0]?.name || '',
  };
  if (!full) return base;
  return {
    ...base,
    customer: who,
    items: items.map((i) => {
      const specs = parseJSON(i.specs, {});
      return { id: i.id, name: i.name, qty: i.qty, category: i.category, size: specs.Dimensions || specs.Size || null, material: specs.Material || null };
    }),
    packed_items: parseJSON(row.packed_items, []),
    delivery: row.delivery_mode ? { mode: row.delivery_mode, rider_name: row.rider_name, rider_phone: row.rider_phone, courier_name: row.courier_name, awb: row.awb, tracking_url: row.tracking_url,
      tracking: parseJSON(row.tracking, []).map((x) => ({ ...x, label: COURIER_UPDATES[x.status]?.label })), received_by: row.received_by } : null,
    note: o.status === 'cancelled' ? 'Order cancelled by the store — do not ship.' : null,
    gift_note: null,
    next: NEXT_STEP[row.status] || null,
    otp_needed: row.status === 'out_for_delivery' && row.delivery_mode === 'self',
    reject_reason: row.reject_reason,
    // returns of this order (no money shown to the dealer)
    returns: row.status === 'delivered' ? db.prepare("SELECT number, status, reason, items FROM return_requests WHERE order_id = ? AND status NOT IN ('rejected','cancelled') ORDER BY id").all(o.id)
      .map((x) => ({ number: x.number, status: x.status, reason: x.reason, items: parseJSON(x.items, []).map((i) => ({ name: i.name, qty: i.qty })) })) : [],
  };
}

const cleanPhone = (p) => String(p || '').replace(/\D/g, '').slice(-10);

/** One dealer step. body depends on the action. Returns the fresh row. */
export function dealerStep(dealer, orderNumber, action, body = {}) {
  const o = db.prepare('SELECT * FROM orders WHERE order_number = ?').get(String(orderNumber).toUpperCase());
  if (!o) throw new HttpError(404, 'Order not found');
  const row = db.prepare('SELECT * FROM dealer_orders WHERE order_id = ? AND dealer_id = ? ORDER BY id DESC LIMIT 1').get(o.id, dealer.id);
  if (!row) throw new HttpError(404, 'Order not found');
  if (o.status === 'cancelled' || row.status === 'cancelled') throw new HttpError(409, 'This order was cancelled. Please do not ship it.');
  if (['rejected', 'reassigned'].includes(row.status)) throw new HttpError(409, 'This order is no longer assigned to you.');
  const t = now();
  const set = (fields) => {
    const keys = Object.keys(fields);
    db.prepare(`UPDATE dealer_orders SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ?`).run(...keys.map((k) => fields[k]), t, row.id);
  };
  const setOrder = (status, extra = {}) => {
    const f = { status, ...extra }; const keys = Object.keys(f);
    db.prepare(`UPDATE orders SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ?`).run(...keys.map((k) => f[k]), t, o.id);
  };
  const need = (cond, msg) => { if (!cond) throw new HttpError(409, msg); };
  const check = (cond, field, msg) => { if (!cond) throw new HttpError(400, msg, { fields: { [field]: msg } }); };
  let customerTemplate = null;

  db.transaction(() => {
    switch (action) {
      case 'accept':
        need(row.status === 'sent', 'Already accepted.');
        set({ status: 'accepted', accepted_at: t });
        setOrder('processing');
        event(o.id, 'dealer_accepted', 'Your order is being prepared');
        break;
      case 'reject':
        need(row.status === 'sent' || row.status === 'accepted', 'You can only reject before packing.');
        set({ status: 'rejected', reject_reason: String(body.reason || 'Not available').slice(0, 200), closed_at: t });
        if (o.status === 'processing') setOrder('payment_confirmed');
        break;
      case 'pack': {
        need(row.status === 'accepted', row.status === 'sent' ? 'Accept the order first.' : 'Already packed.');
        const ids = db.prepare('SELECT id FROM order_items WHERE order_id = ?').all(o.id).map((x) => x.id);
        const ticked = (body.checked || []).map(Number).filter((x) => ids.includes(x));
        check(ticked.length === ids.length, 'checked', 'Tick every item as you pack it.');
        set({ status: 'packed', packed_at: t, packed_items: JSON.stringify(ticked) });
        event(o.id, 'packed', 'Packed and sealed');
        break;
      }
      case 'ready':
        need(row.status === 'packed', 'Pack the order first.');
        set({ status: 'ready', ready_at: t });
        event(o.id, 'ready_for_delivery', 'Ready to be handed over for delivery');
        break;
      case 'dispatch': {
        need(row.status === 'ready', 'Mark the order ready first.');
        if (body.mode === 'self') {
          const rp = cleanPhone(body.rider_phone);
          check(String(body.rider_name || '').trim().length >= 2, 'rider_name', 'Enter the delivery person\'s name.');
          check(/^[6-9]\d{9}$/.test(rp), 'rider_phone', 'Enter a valid 10-digit mobile number for the delivery person.');
          const otp = String(crypto.randomInt(1000, 10000));
          set({ status: 'out_for_delivery', out_at: t, delivery_mode: 'self', rider_name: String(body.rider_name).trim().slice(0, 60), rider_phone: rp, otp, otp_tries: 0 });
          setOrder('out_for_delivery');
          if (!db.prepare("SELECT 1 FROM order_events WHERE order_id = ? AND status = 'shipped'").get(o.id)) event(o.id, 'shipped', 'Handed to delivery');
          event(o.id, 'out_for_delivery', `With ${String(body.rider_name).trim().split(' ')[0]} — share your delivery code only when you receive the parcel`);
          customerTemplate = 'out_for_delivery';
        } else if (body.mode === 'courier') {
          check(String(body.courier_name || '').trim().length >= 2, 'courier_name', 'Enter the courier company.');
          check(/^[A-Za-z0-9-]{5,30}$/.test(String(body.awb || '').trim()), 'awb', 'Enter the AWB / tracking number (5–30 letters or digits).');
          const url = String(body.tracking_url || '').trim();
          check(!url || /^https:\/\/[^\s]{4,300}$/.test(url), 'tracking_url', 'Tracking link must start with https://');
          set({ status: 'out_for_delivery', out_at: t, delivery_mode: 'courier', courier_name: String(body.courier_name).trim().slice(0, 60), awb: String(body.awb).trim(), tracking_url: url || null });
          setOrder('shipped', { tracking_carrier: String(body.courier_name).trim().slice(0, 60), tracking_number: String(body.awb).trim() });
          db.prepare('UPDATE dealer_orders SET tracking = ? WHERE id = ?').run(JSON.stringify([{ at: t, status: 'picked_up', location: dealer.city || null, note: `Handed to ${String(body.courier_name).trim()} by the dealer`, by: 'dealer' }]), row.id);
          event(o.id, 'shipped', `Handed to ${String(body.courier_name).trim()} · AWB ${String(body.awb).trim()}`);
          customerTemplate = 'shipped';
        } else throw new HttpError(400, 'Choose how the order will be delivered.');
        break;
      }
      case 'deliver':
        need(row.status === 'out_for_delivery', 'The order is not out for delivery yet.');
        if (row.delivery_mode === 'self') {
          need(row.otp_tries < 5, 'Too many wrong codes. Please ask the store to confirm delivery.');
          const ok = row.otp && String(body.otp || '').trim() === row.otp;
          if (!ok) {
            db.prepare('UPDATE dealer_orders SET otp_tries = otp_tries + 1 WHERE id = ?').run(row.id);
            throw new HttpError(400, 'Wrong delivery code. Ask the customer for the 4-digit code on their order page / message.', { fields: { otp: 'Wrong code' } });
          }
        }
        set({ status: 'delivered', delivered_at: t, closed_at: t, received_by: body.received_by ? String(body.received_by).slice(0, 60) : null });
        if (row.delivery_mode === 'courier') db.prepare('UPDATE dealer_orders SET tracking = ? WHERE id = ?').run(JSON.stringify([...parseJSON(row.tracking, []), { at: t, status: 'delivered', location: o.ship_city, note: 'Marked delivered by the dealer', by: 'dealer' }]), row.id);
        setOrder('delivered');
        if (!db.prepare("SELECT 1 FROM order_events WHERE order_id = ? AND status = 'out_for_delivery'").get(o.id)) event(o.id, 'out_for_delivery', 'Auto-recorded');
        event(o.id, 'delivered', row.delivery_mode === 'self' ? 'Delivered — confirmed with your code' : 'Delivered');
        customerTemplate = 'delivered';
        break;
      default:
        throw new HttpError(400, 'Unknown action');
    }
  })();
  clearCatalogue();
  const fresh = db.prepare('SELECT * FROM orders WHERE id = ?').get(o.id);
  if (customerTemplate) notifyOrder(fresh, customerTemplate).catch(() => {});
  if (action === 'reject') {
    const settings = dealerSettings();
    if (settings.auto_reassign) assignOrderSafe(o.id);
  }
  return db.prepare('SELECT * FROM dealer_orders WHERE id = ?').get(row.id);
}

/**
 * Courier checkpoint (from the dealer, the admin, or a courier webhook).
 * body: { status: picked_up|in_transit|out_for_delivery|attempt_failed|delivered, location?, note?, received_by?, at? }
 */
export function courierUpdate(row, body, by = 'admin') {
  if (!row) throw new HttpError(404, 'Shipment not found');
  if (row.delivery_mode !== 'courier') throw new HttpError(409, 'Courier updates are only for orders sent by courier.');
  if (row.status !== 'out_for_delivery') throw new HttpError(409, row.status === 'delivered' ? 'This parcel is already delivered.' : 'The parcel has not been handed to the courier yet.');
  const st = String(body.status);
  if (!COURIER_UPDATES[st]) throw new HttpError(400, 'Unknown courier status.');
  const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(row.order_id);
  if (o.status === 'cancelled') throw new HttpError(409, 'This order was cancelled.');
  const t = now();
  const at = body.at && !Number.isNaN(Date.parse(body.at)) && Date.parse(body.at) <= Date.now() + 6e4 ? new Date(body.at).toISOString() : t;
  const cut = (v, n) => (v == null || v === '' ? null : String(v).trim().slice(0, n));
  const tracking = parseJSON(row.tracking, []);
  tracking.push({ at, status: st, location: cut(body.location, 80), note: cut(body.note, 200), by });
  let template = null;
  db.transaction(() => {
    db.prepare('UPDATE dealer_orders SET tracking = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(tracking), t, row.id);
    if (st === 'out_for_delivery' && !row.courier_out_at) {
      db.prepare('UPDATE dealer_orders SET courier_out_at = ? WHERE id = ?').run(at, row.id);
      db.prepare("UPDATE orders SET status = 'out_for_delivery', updated_at = ? WHERE id = ? AND status = 'shipped'").run(t, o.id);
      event(o.id, 'out_for_delivery', `${row.courier_name}${body.location ? ` · ${cut(body.location, 80)}` : ''}`);
      template = 'out_for_delivery';
    }
    if (st === 'attempt_failed') event(o.id, 'delivery_attempted', cut(body.note, 200) || 'Courier could not deliver — they will try again');
    if (st === 'delivered') {
      db.prepare("UPDATE dealer_orders SET status = 'delivered', delivered_at = ?, closed_at = ?, received_by = ? WHERE id = ?").run(at, t, cut(body.received_by, 60), row.id);
      db.prepare("UPDATE orders SET status = 'delivered', updated_at = ? WHERE id = ?").run(t, o.id);
      if (!db.prepare("SELECT 1 FROM order_events WHERE order_id = ? AND status = 'out_for_delivery'").get(o.id)) event(o.id, 'out_for_delivery', 'Auto-recorded');
      event(o.id, 'delivered', body.received_by ? `Received by ${cut(body.received_by, 60)}` : 'Delivered by courier');
      template = 'delivered';
    }
  })();
  if (template) notifyOrder(db.prepare('SELECT * FROM orders WHERE id = ?').get(o.id), template).catch(() => {});
  return db.prepare('SELECT * FROM dealer_orders WHERE id = ?').get(row.id);
}

function assignOrderSafe(orderId) { try { return assignOrder(orderId); } catch { return null; } }

/** Delivery details for the customer's order page (OTP only for the customer). */
export function deliveryForCustomer(orderId) {
  const row = currentAssignment(orderId);
  if (!row) return null;
  return {
    stage: row.status,
    mode: row.delivery_mode || null,
    rider_name: row.status === 'out_for_delivery' ? row.rider_name : null,
    rider_phone: row.status === 'out_for_delivery' ? row.rider_phone : null,
    courier_name: row.courier_name, awb: row.awb, tracking_url: row.tracking_url,
    otp: row.status === 'out_for_delivery' && row.delivery_mode === 'self' ? row.otp : null,
    tracking: row.delivery_mode === 'courier' ? parseJSON(row.tracking, []).map((x) => ({ at: x.at, status: x.status, label: COURIER_UPDATES[x.status]?.label, location: x.location })) : [],
    received_by: row.received_by || null,
    delivered_at: row.delivered_at,
  };
}

/** Admin panel view: current dealer, history, candidates. */
export function adminDealerPanel(order) {
  const history = db.prepare(`SELECT d.*, x.business_name, x.city dealer_city, x.phone dealer_phone FROM dealer_orders d JOIN dealers x ON x.id = d.dealer_id WHERE d.order_id = ? ORDER BY d.id DESC`).all(order.id)
    .map((r) => ({ id: r.id, dealer_id: r.dealer_id, business_name: r.business_name, city: r.dealer_city, phone: r.dealer_phone, status: r.status, label: DEALER_STATUS[r.status]?.label, assigned_by: r.assigned_by, reject_reason: r.reject_reason,
      sent_at: r.sent_at, accepted_at: r.accepted_at, packed_at: r.packed_at, ready_at: r.ready_at, out_at: r.out_at, delivered_at: r.delivered_at,
      delivery: r.delivery_mode ? { mode: r.delivery_mode, rider_name: r.rider_name, rider_phone: r.rider_phone, courier_name: r.courier_name, awb: r.awb, tracking_url: r.tracking_url } : null,
      late: r.status === 'sent' && Date.now() - Date.parse(r.sent_at) > dealerSettings().accept_minutes * 6e4 }));
  return { current: history.find((h) => !['rejected', 'reassigned'].includes(h.status)) || null, history, candidates: candidatesFor(order) };
}

// ---------------------------------------------------------------- sweep
/** Orders not accepted in time: remind once, then (optionally) move to the next dealer. */
export function runDealerSweep() {
  const st = dealerSettings();
  const cutoff = new Date(Date.now() - st.accept_minutes * 6e4).toISOString();
  const half = new Date(Date.now() - (st.accept_minutes / 2) * 6e4).toISOString();
  for (const r of db.prepare("SELECT * FROM dealer_orders WHERE status = 'sent' AND reminded_at IS NULL AND sent_at < ?").all(half)) {
    db.prepare('UPDATE dealer_orders SET reminded_at = ? WHERE id = ?').run(now(), r.id);
    const d = dealerFromRow(db.prepare('SELECT * FROM dealers WHERE id = ?').get(r.dealer_id));
    notifyDealer(d, db.prepare('SELECT * FROM orders WHERE id = ?').get(r.order_id), 'reminder');
  }
  // paid orders that never found a dealer (e.g. dealer added later)
  if (st.auto_assign) {
    for (const o of db.prepare(`SELECT o.id FROM orders o WHERE o.payment_status = 'confirmed' AND o.status = 'payment_confirmed' AND o.ship_country = 'IN'
      AND NOT EXISTS (SELECT 1 FROM dealer_orders d WHERE d.order_id = o.id) AND o.created_at > ?`).all(new Date(Date.now() - 7 * 864e5).toISOString())) assignOrderSafe(o.id);
  }
  if (!st.auto_reassign) return;
  for (const r of db.prepare("SELECT * FROM dealer_orders WHERE status = 'sent' AND sent_at < ?").all(cutoff)) {
    const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(r.order_id);
    const tried = db.prepare('SELECT dealer_id FROM dealer_orders WHERE order_id = ?').all(r.order_id).map((x) => x.dealer_id);
    const next = pickDealer({ dealers: allDealers(), items: orderItemsForMatch(r.order_id), pincode: o.ship_pincode, exclude: tried }).dealer;
    if (next) assignOrder(r.order_id, { dealerId: next.id, by: 'auto', note: `No response in ${st.accept_minutes} minutes` });
  }
}

export function startDealerSweep() {
  const t = setInterval(() => { try { runDealerSweep(); } catch { /* keep running */ } }, 5 * 6e4);
  t.unref?.();
}
