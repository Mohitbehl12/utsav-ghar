/**
 * Dealer order management — shared rules (server + browser preview).
 *
 * Flow:  Order Received → Sent to Dealer → Order Accepted → Packed → Ready for Delivery
 *        → Out for Delivery → Delivered
 * A whole order goes to ONE dealer: the dealer must sell every product in it and
 * deliver to the customer's PIN code. The dealer never deals with the customer
 * directly; everything flows through the store.
 */

// dealer_orders.status values, in order
export const DEALER_FLOW = ['sent', 'accepted', 'packed', 'ready', 'out_for_delivery', 'delivered'];
export const DEALER_STATUS = {
  sent: { label: 'Sent to Dealer', short: 'New', icon: '📨', tone: 'info' },
  accepted: { label: 'Order Accepted', short: 'Accepted', icon: '👍', tone: 'info' },
  packed: { label: 'Packed', short: 'Packed', icon: '📦', tone: 'info' },
  ready: { label: 'Ready for Delivery', short: 'Ready', icon: '🏷️', tone: 'warn' },
  out_for_delivery: { label: 'Out for Delivery', short: 'Out', icon: '🛵', tone: 'warn' },
  delivered: { label: 'Delivered', short: 'Delivered', icon: '✅', tone: 'ok' },
  rejected: { label: 'Rejected by dealer', short: 'Rejected', icon: '✋', tone: 'bad' },
  reassigned: { label: 'Moved to another dealer', short: 'Moved', icon: '↪️', tone: 'muted' },
  cancelled: { label: 'Cancelled', short: 'Cancelled', icon: '✖️', tone: 'muted' },
};
/** The next allowed step for the dealer from each status. */
export const NEXT_STEP = { sent: 'accepted', accepted: 'packed', packed: 'ready', ready: 'out_for_delivery', out_for_delivery: 'delivered' };
export const isOpen = (s) => ['sent', 'accepted', 'packed', 'ready', 'out_for_delivery'].includes(s);

/** Customer-facing timeline for an order handled by a dealer (event keys in order_events). */
export const DEALER_TIMELINE = [
  { key: 'placed', label: 'Order Received', icon: '🛒' },
  { key: 'payment_confirmed', label: 'Payment Confirmed', icon: '💳' },
  { key: 'sent_to_dealer', label: 'Sent to Dealer', icon: '📨' },
  { key: 'dealer_accepted', label: 'Order Accepted', icon: '👍' },
  { key: 'packed', label: 'Packed', icon: '📦' },
  { key: 'ready_for_delivery', label: 'Ready for Delivery', icon: '🏷️' },
  { key: 'out_for_delivery', label: 'Out for Delivery', icon: '🛵' },
  { key: 'delivered', label: 'Delivered', icon: '✅' },
];
// dealer status → order_events key and the customer-facing order.status it moves the order to
export const EVENT_FOR = { sent: 'sent_to_dealer', accepted: 'dealer_accepted', packed: 'packed', ready: 'ready_for_delivery', out_for_delivery: 'out_for_delivery', delivered: 'delivered' };
export const ORDER_STATUS_FOR = { accepted: 'processing', packed: 'processing', ready: 'processing', out_for_delivery: 'out_for_delivery', delivered: 'delivered' };

export const REJECT_REASONS = ['Item out of stock', 'Cannot deliver to this PIN code', 'Shop closed / on leave', 'Too many orders right now', 'Other'];

/**
 * PIN patterns a dealer serves: exact "110017", prefix "1100" or "110*", or ranges "110001-110099".
 * Returns a match strength (0 = no match, higher = more specific).
 */
export function pinScore(patterns, pin) {
  const p = String(pin || '').replace(/\D/g, '');
  if (p.length !== 6) return 0;
  let best = 0;
  for (const raw of patterns || []) {
    const s = String(raw).trim().replace(/\*$/, '');
    if (!s) continue;
    const range = s.match(/^(\d{6})\s*-\s*(\d{6})$/);
    if (range) { if (p >= range[1] && p <= range[2]) best = Math.max(best, 5); continue; }
    if (!/^\d{1,6}$/.test(s)) continue;
    if (p.startsWith(s)) best = Math.max(best, s.length);
  }
  return best;
}

/** Parse the admin's free text ("110001, 1100*, 400001-400099") into a clean list. */
export function parsePins(text) {
  return [...new Set(String(text || '').split(/[\s,;]+/).map((x) => x.trim().replace(/\*$/, '')).filter((x) => /^\d{1,6}$/.test(x) || /^\d{6}-\d{6}$/.test(x)))].slice(0, 500);
}

/** Does the dealer sell this product (by product or by its category)? */
export const dealerSells = (d, item) => (d.product_ids || []).includes(item.product_id) || (d.category_ids || []).includes(item.category_id);

/**
 * Pick the best dealer for an order.
 * dealers: [{id, is_active, all_india, pincodes[], pincode, category_ids[], product_ids[], priority, open_orders}]
 * items:   [{product_id, category_id}]
 * Returns { dealer, candidates:[{dealer, score, reasons}] } — dealer is null if nobody fits.
 */
export function pickDealer({ dealers, items, pincode, exclude = [] }) {
  const pin = String(pincode || '').replace(/\D/g, '');
  const candidates = [];
  for (const d of dealers) {
    if (!d.is_active || exclude.includes(d.id)) continue;
    const missing = items.filter((i) => !dealerSells(d, i));
    const area = pinScore(d.pincodes, pin);
    const covers = area > 0 || d.all_india;
    const reasons = [];
    if (missing.length) reasons.push(`does not sell ${missing.length} item(s)`);
    if (!covers) reasons.push(`does not deliver to ${pin || 'this PIN'}`);
    // nearness: shared leading digits of the dealer's own PIN and the customer's PIN
    let near = 0; const own = String(d.pincode || '');
    while (near < 6 && own[near] && own[near] === pin[near]) near++;
    const score = (area ? 100 + area * 10 : 0) + near * 6 + (d.priority || 0) * 3 - (d.open_orders || 0) * 2;
    candidates.push({ dealer: d, ok: !missing.length && covers, score, reasons, near });
  }
  candidates.sort((a, b) => (b.ok - a.ok) || (b.score - a.score));
  return { dealer: candidates.find((c) => c.ok)?.dealer || null, candidates };
}

/** Before the dealer accepts, they see what to pack and the area — not who the customer is. */
export function maskForDealer(o, status) {
  const reveal = !['sent', 'rejected', 'reassigned', 'cancelled'].includes(status);
  const hidePhone = status === 'delivered' && Date.now() - Date.parse(o.delivered_at || o.updated_at || 0) > 7 * 864e5;
  return {
    name: reveal ? o.customer_name : `${String(o.customer_name || '').split(' ')[0]} (shown after you accept)`,
    phone: reveal && !hidePhone ? o.customer_phone : null,
    address: reveal
      ? { line1: o.ship_line1, line2: o.ship_line2, city: o.ship_city, state: o.ship_state, pincode: o.ship_pincode }
      : { line1: null, line2: null, city: o.ship_city, state: o.ship_state, pincode: o.ship_pincode },
    revealed: reveal,
  };
}

/** Courier checkpoints after the dealer hands the parcel to a courier. */
export const COURIER_UPDATES = {
  picked_up: { label: 'Picked up by courier', icon: '📮' },
  in_transit: { label: 'In transit', icon: '🚚' },
  out_for_delivery: { label: 'Out for delivery', icon: '🛵' },
  attempt_failed: { label: 'Delivery attempted — customer not available', icon: '⚠️' },
  delivered: { label: 'Delivered', icon: '✅' },
};
export const COURIERS = ['Delhivery', 'Blue Dart', 'DTDC', 'Ekart', 'Xpressbees', 'Shadowfax', 'Ecom Express', 'India Post', 'Shiprocket'];

/** Minutes between two ISO times (null if either is missing). */
export const minutesBetween = (a, b) => (a && b ? Math.max(0, Math.round((Date.parse(b) - Date.parse(a)) / 6e4)) : null);
/** "45 min", "3 h 10 min", "2 d 4 h" */
export function fmtDuration(min) {
  if (min == null) return '—';
  if (min < 60) return `${min} min`;
  if (min < 24 * 60) return `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ''}`;
  const d = Math.floor(min / 1440); const h = Math.round((min % 1440) / 60);
  return `${d} d${h ? ` ${h} h` : ''}`;
}

export const newOtp = () => String(Math.floor(1000 + Math.random() * 9000));
