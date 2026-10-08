import { db, now } from '../db.js';
import { HttpError } from './http.js';
import { quote, getSettings, bundleItems } from './catalog.js';
import { newAccessToken, hashToken } from './auth.js';
import { DEALER_TIMELINE } from '../../../shared/dealers.js';
import { recordOrderShipping, orderEconomics } from './shipping.js';
import { deliveryForCustomer, adminDealerPanel } from './dealers.js';
import { cancelOrder, refundAction, afterSalesFor } from './returns.js';

export const TIMELINE = [
  { key: 'placed', label: 'Order Placed', icon: '🛒' },
  { key: 'payment_confirmed', label: 'Payment Confirmed', icon: '💳' },
  { key: 'processing', label: 'Processing', icon: '📦' },
  { key: 'shipped', label: 'Shipped', icon: '🚚' },
  { key: 'out_for_delivery', label: 'Out for Delivery', icon: '🏠' },
  { key: 'delivered', label: 'Delivered', icon: '✅' },
];

/** Has this phone number or email placed a (non-cancelled) order before? */
export function isFirstOrder({ phone, email }) {
  const digits = String(phone || '').replace(/\D/g, '').slice(-10);
  const hit = db.prepare(
    `SELECT 1 FROM orders WHERE status != 'cancelled' AND (substr(replace(replace(replace(customer_phone, ' ', ''), '-', ''), '+', ''), -10) = ? OR (? != '' AND lower(customer_email) = lower(?))) LIMIT 1`
  ).get(digits, email || '', email || '');
  return !hit;
}

/**
 * Create an order. Everything monetary is recomputed here from the database —
 * the request only carries product ids, quantities, an optional coupon and the
 * destination country (which picks the shipping zone).
 */
export function createOrder({ items, couponCode, customer, address, userId, expectedTotal, country = 'IN', currency = 'INR', fxRate = null, attribution = {}, clientIp = null, userAgent = null, checkoutToken = null }) {
  const token = newAccessToken();
  const cc = String(country || 'IN').toUpperCase();
  const run = db.transaction(() => {
    const firstOrder = isFirstOrder(customer);
    const q = quote(items, couponCode, { country: cc, firstOrder, pincode: address?.pincode });
    if (!q.lines.length) throw new HttpError(400, 'Your cart is empty or items are unavailable.');
    if (q.errors.length) {
      throw new HttpError(409, q.errors[0].code === 'NO_INTERNATIONAL' ? q.errors[0].message : 'Some items changed since you added them. Please review your cart.', { quote: q });
    }
    // If the customer saw a different total (price/offer/coupon/shipping changed), make them re-confirm.
    if (expectedTotal != null && Number(expectedTotal) !== q.total) {
      const msg = couponCode && q.couponError ? `${q.couponError} Please review the updated total.` : 'Prices, offers or delivery charges have changed. Please review the updated total.';
      throw new HttpError(409, msg, { quote: q });
    }

    // Reserve stock atomically (combos also draw down every item inside them).
    const dec = db.prepare('UPDATE inventory SET stock = stock - ?, updated_at = ? WHERE product_id = ? AND stock >= ?');
    const take = (pid, qty, name) => {
      if (dec.run(qty, now(), pid, qty).changes !== 1) throw new HttpError(409, `${name} just went out of stock. Please review your cart.`);
    };
    for (const l of q.lines) {
      take(l.productId, l.qty, l.name);
      if (l.is_bundle) for (const part of bundleItems(l.productId)) take(part.product_id, part.qty * l.qty, `${part.name} (in ${l.name})`);
    }

    const nextNo = db.prepare('SELECT COALESCE(MAX(id), 0) + 10245 AS n FROM orders').get().n;
    const days = cc === 'IN' ? 6 : Number(String(q.zone?.delivery_text || '').match(/(\d+)\D*business/)?.[1]) || 15;
    const eta = new Date(Date.now() + days * 864e5).toISOString().slice(0, 10);
    const A = attribution || {};
    const cut = (v, n = 200) => (v == null || v === '' ? null : String(v).slice(0, n));
    const o = db
      .prepare(
        `INSERT INTO orders(order_number, user_id, access_token_hash, customer_name, customer_phone, customer_email,
          ship_line1, ship_line2, ship_city, ship_state, ship_pincode, ship_country, currency, fx_rate,
          mrp_total, subtotal, discount, delivery_fee, total, offer_id, offer_name, coupon_code,
          payment_method, estimated_delivery,
          utm_source, utm_medium, utm_campaign, utm_content, utm_term, fbclid, fbp, fbc, ga_client_id, landing_page, referrer, client_ip, user_agent)
         VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      )
      .run(
        `DIWALI${nextNo}`, userId ?? null, hashToken(token), customer.name, customer.phone, customer.email || null,
        address.line1, address.line2 || null, address.city, address.state, address.pincode, cc, currency || 'INR', fxRate,
        q.mrpTotal, q.subtotal, q.discount, q.delivery, q.total, q.offer?.id ?? null, q.offer?.name ?? null,
        q.offer?.couponCode ?? null, cc === 'IN' ? 'upi' : 'intl', eta,
        cut(A.utm_source, 80), cut(A.utm_medium, 80), cut(A.utm_campaign, 120), cut(A.utm_content, 120), cut(A.utm_term, 120),
        cut(A.fbclid, 500), cut(A.fbp, 120), cut(A.fbc, 600), cut(A.ga_client_id, 80), cut(A.landing_page, 500), cut(A.referrer, 500), cut(clientIp, 64), cut(userAgent, 400)
      );
    const orderId = o.lastInsertRowid;
    const ins = db.prepare(
      'INSERT INTO order_items(order_id, product_id, product_name, product_slug, unit_price, mrp, qty, line_total, unit_cost, discount_share, offer_eligible) VALUES(?,?,?,?,?,?,?,?,?,?,?)'
    );
    const costOf = db.prepare('SELECT cost_price FROM products WHERE id = ?');
    const shares = q.lines.some((l) => l.discountShare) ? q.lines.map((l) => l.discountShare || 0) : allocateDiscount(q.lines, q.discount);
    q.lines.forEach((l, i) => ins.run(orderId, l.productId, l.name, l.slug, l.unitPrice, l.mrp, l.qty, l.lineTotal, costOf.get(l.productId)?.cost_price || 0, shares[i], l.offerEligible ? 1 : 0));
    db.prepare('INSERT INTO payments(order_id, method, amount, status) VALUES(?,?,?,?)').run(orderId, cc === 'IN' ? 'upi_manual' : 'payment_link', q.total, 'pending');
    db.prepare('INSERT INTO order_events(order_id, status, note) VALUES(?,?,?)').run(orderId, 'placed', 'Order placed');
    if (checkoutToken) db.prepare('UPDATE checkout_sessions SET order_id = ?, updated_at = ? WHERE token = ?').run(orderId, now(), String(checkoutToken).slice(0, 64));

    if (userId) {
      const cart = db.prepare('SELECT id FROM cart WHERE user_id = ?').get(userId);
      if (cart) db.prepare('DELETE FROM cart_items WHERE cart_id = ?').run(cart.id);
    }
    return orderId;
  });
  const id = run();
  recordOrderShipping(id);
  return { order: getOrderRow(id), accessToken: token };
}

/** Split an order-level discount across the discounted lines, proportional to their value (for per-product profit). */
export function allocateDiscount(lines, discount) {
  const idx = lines.map((l, i) => (l.offerEligible ? i : -1)).filter((i) => i >= 0);
  const pool = idx.length ? idx : lines.map((_, i) => i);
  const base = pool.reduce((s, i) => s + lines[i].lineTotal, 0);
  const out = lines.map(() => 0);
  let given = 0;
  pool.forEach((i, k) => {
    const share = k === pool.length - 1 ? discount - given : Math.round((discount * lines[i].lineTotal) / (base || 1));
    out[i] = share;
    given += share;
  });
  return out;
}

export const getOrderRow = (id) => db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
export const getOrderByNumber = (n) => db.prepare('SELECT * FROM orders WHERE order_number = ?').get(String(n).replace(/^#/, '').toUpperCase());

export function orderDetail(o, { admin = false } = {}) {
  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ? ORDER BY id').all(o.id);
  const events = db.prepare('SELECT status, note, created_at FROM order_events WHERE order_id = ? ORDER BY id').all(o.id)
    .filter((e) => admin || e.status !== 'conversion_reported');
  const payment = db.prepare('SELECT * FROM payments WHERE order_id = ?').get(o.id);
  const reached = new Set(events.map((e) => e.status));
  const viaDealer = reached.has('sent_to_dealer');
  const timeline = (viaDealer ? DEALER_TIMELINE : TIMELINE).map((s) => ({
    ...s,
    done: reached.has(s.key),
    at: events.find((e) => e.status === s.key)?.created_at || null,
  }));
  const out = {
    id: o.id,
    order_number: o.order_number,
    created_at: o.created_at,
    status: o.status,
    payment_status: o.payment_status,
    customer: { name: o.customer_name, phone: o.customer_phone, email: o.customer_email },
    address: { line1: o.ship_line1, line2: o.ship_line2, city: o.ship_city, state: o.ship_state, pincode: o.ship_pincode, country: o.ship_country || 'IN' },
    currency: o.currency || 'INR',
    fx_rate: o.fx_rate,
    payment_method: o.payment_method,
    items: items.map((i) => ({
      product_id: i.product_id, name: i.product_name, slug: i.product_slug, qty: i.qty,
      unit_price: i.unit_price, mrp: i.mrp, line_total: i.line_total, offer_eligible: !!i.offer_eligible,
    })),
    totals: { mrp_total: o.mrp_total, subtotal: o.subtotal, discount: o.discount, delivery: o.delivery_fee, total: o.total },
    offer_name: o.offer_name,
    coupon_code: o.coupon_code,
    estimated_delivery: o.estimated_delivery,
    tracking: o.tracking_number ? { carrier: o.tracking_carrier, number: o.tracking_number } : null,
    timeline,
    events,
    payment: payment && {
      method: payment.method,
      instrument: payment.instrument || null,
      amount: payment.amount,
      status: payment.status,
      customer_ref: payment.customer_ref,
      has_screenshot: !!payment.screenshot_path,
      verified_at: payment.verified_at,
    },
    delivery: viaDealer ? deliveryForCustomer(o.id) : null,
    after_sales: afterSalesFor(o),
  };
  if (admin) {
    out.user_id = o.user_id;
    out.attribution = { utm_source: o.utm_source, utm_medium: o.utm_medium, utm_campaign: o.utm_campaign, utm_content: o.utm_content, landing_page: o.landing_page, referrer: o.referrer, has_fbclid: !!o.fbclid };
    out.conversion_sent = !!o.conversion_sent;
    out.admin_note = o.admin_note;
    out.dealer = adminDealerPanel(o);
    out.economics = orderEconomics(o.id);
    if (out.delivery) delete out.delivery.otp; // the code is for the customer only
    out.payment_id = payment?.id;
    out.transactions = payment
      ? db.prepare('SELECT type, amount, reference, created_at FROM payment_transactions WHERE payment_id = ? ORDER BY id').all(payment.id)
      : [];
  }
  return out;
}

/** Admin state machine. Returns the notification template to send (if any). */
export function applyAdminAction(order, action, { adminId, note, carrier, trackingNumber }) {
  const payment = db.prepare('SELECT * FROM payments WHERE order_id = ?').get(order.id);
  const t = now();
  const setOrder = (fields) => {
    const keys = Object.keys(fields);
    db.prepare(`UPDATE orders SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ?`).run(...keys.map((k) => fields[k]), t, order.id);
  };
  const event = (status, n) => db.prepare('INSERT INTO order_events(order_id, status, note) VALUES(?,?,?)').run(order.id, status, n || note || null);
  const ptx = (type) => db.prepare('INSERT INTO payment_transactions(payment_id, type, amount, reference, raw) VALUES(?,?,?,?,?)').run(payment.id, type, payment.amount, payment.customer_ref, JSON.stringify({ adminId, note }));
  const need = (cond, msg) => { if (!cond) throw new HttpError(409, msg); };

  return db.transaction(() => {
    switch (action) {
      case 'confirm_payment':
        need(order.status !== 'cancelled', 'Order is cancelled.');
        need(order.payment_status !== 'confirmed', 'Payment is already confirmed.');
        db.prepare('UPDATE payments SET status = ?, verified_by = ?, verified_at = ?, updated_at = ? WHERE id = ?').run('confirmed', adminId, t, t, payment.id);
        ptx('admin_confirmed');
        setOrder({ payment_status: 'confirmed', status: order.status === 'placed' ? 'payment_confirmed' : order.status });
        event('payment_confirmed', note || 'Payment verified');
        return 'payment_confirmed';
      case 'reject_payment':
        need(['awaiting_payment', 'verification_pending'].includes(order.payment_status), 'Only pending payments can be rejected.');
        db.prepare('UPDATE payments SET status = ?, verified_by = ?, verified_at = ?, updated_at = ? WHERE id = ?').run('rejected', adminId, t, t, payment.id);
        ptx('admin_rejected');
        setOrder({ payment_status: 'rejected' });
        event('payment_rejected', note || 'Payment could not be verified');
        return 'payment_rejected';
      case 'process':
        need(order.payment_status === 'confirmed', 'Confirm payment before processing.');
        need(order.status === 'payment_confirmed', 'Order is not ready for processing.');
        setOrder({ status: 'processing' });
        event('processing');
        return null;
      case 'ship':
        need(order.status === 'processing', 'Only processing orders can be shipped.');
        setOrder({ status: 'shipped', tracking_carrier: carrier || null, tracking_number: trackingNumber || null });
        event('shipped', trackingNumber ? `${carrier || 'Courier'} · ${trackingNumber}` : null);
        return 'shipped';
      case 'out_for_delivery':
        need(order.status === 'shipped', 'Only shipped orders can go out for delivery.');
        setOrder({ status: 'out_for_delivery' });
        event('out_for_delivery');
        return null;
      case 'deliver':
        need(['shipped', 'out_for_delivery'].includes(order.status), 'Order has not shipped yet.');
        setOrder({ status: 'delivered' });
        if (!db.prepare("SELECT 1 FROM order_events WHERE order_id = ? AND status = 'out_for_delivery'").get(order.id)) event('out_for_delivery', 'Auto-recorded');
        event('delivered');
        return 'delivered';
      case 'cancel': {
        need(!['delivered', 'cancelled'].includes(order.status), 'This order can no longer be cancelled.');
        cancelOrder(order, { by: 'admin', note });
        return 'cancelled';
      }
      case 'mark_refunded': {
        // kept for the older button: marks the cancellation refund as paid
        need(order.status === 'cancelled', 'Only cancelled orders can be refunded here. Use Returns & refunds for returns.');
        const f = db.prepare("SELECT * FROM refunds WHERE order_id = ? AND kind = 'cancellation'").get(order.id);
        need(f, 'There is no refund due on this order.');
        need(f.status !== 'processed', 'This refund is already marked as paid.');
        refundAction(f, 'process', { adminId, reference: (note && note.length >= 4 ? note : `MANUAL-${order.order_number}`).slice(0, 60), method: 'original' });
        return null;
      }
      default:
        throw new HttpError(400, 'Unknown action.');
    }
  })();
}

export { getSettings };
