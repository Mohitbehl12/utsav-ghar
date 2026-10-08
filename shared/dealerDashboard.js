/**
 * Dealer business dashboard — one pure function used by the server and the preview.
 *
 * Money shown to a dealer is ALWAYS the dealer's own value: dealer price × quantity
 * ("your earnings"). The input never contains the customer selling price, MRP, the
 * store's margin or the pricing formula, and the output is checked against
 * FORBIDDEN_KEYS before it leaves the server.
 * All money in paise. Days are bucketed in India time (UTC+5:30).
 */

export const DASH_RANGES = {
  '7d': { label: '7 days', days: 7, bucket: 'day' },
  '30d': { label: '30 days', days: 30, bucket: 'day' },
  '90d': { label: '3 months', days: 91, bucket: 'week' },
  '12m': { label: '1 year', days: 365, bucket: 'month' },
};
export const LOW_STOCK_AT = 5;
// keys a dealer response must never carry (checked by tests and by the server before sending)
export const FORBIDDEN_KEYS = ['price', 'mrp', 'unit_price', 'line_total', 'selling_price', 'customer_price', 'profit', 'margin', 'margin_pct', 'pricing', 'internal_note', 'cost_price', 'platform', 'gst'];

const IST = 330 * 6e4;
const dayKey = (t) => new Date(t + IST).toISOString().slice(0, 10);
const monthKey = (t) => new Date(t + IST).toISOString().slice(0, 7);
const ms = (s) => (s ? Date.parse(s) : NaN);
const LIVE = ['sent', 'accepted', 'packed', 'ready', 'out_for_delivery'];
const CLOSED_BAD = ['rejected', 'reassigned', 'cancelled'];

/** Buckets covering [from, to] with their labels. */
export function buckets(rangeKey, nowMs) {
  const r = DASH_RANGES[rangeKey] || DASH_RANGES['30d'];
  const out = [];
  const startDay = Date.parse(`${dayKey(nowMs - (r.days - 1) * 864e5)}T00:00:00+05:30`);
  if (r.bucket === 'month') {
    const d = new Date(nowMs + IST);
    for (let i = 11; i >= 0; i -= 1) {
      const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1));
      const key = m.toISOString().slice(0, 7);
      out.push({ key, label: m.toLocaleString('en-IN', { month: 'short', timeZone: 'UTC' }) + (m.getUTCMonth() === 0 || i === 11 ? ` ${String(m.getUTCFullYear()).slice(2)}` : '') });
    }
    return { from: Date.parse(`${out[0].key}-01T00:00:00+05:30`), list: out, keyOf: monthKey };
  }
  const step = r.bucket === 'week' ? 7 : 1;
  for (let t = startDay; t <= nowMs; t += step * 864e5) {
    const k = dayKey(t);
    const d = new Date(`${k}T00:00:00Z`);
    out.push({ key: k, label: `${d.getUTCDate()} ${d.toLocaleString('en-IN', { month: 'short', timeZone: 'UTC' })}` });
  }
  const keyOf = step === 1 ? dayKey : (t) => {
    const i = Math.floor((t - startDay) / (7 * 864e5));
    return out[Math.max(0, Math.min(out.length - 1, i))].key;
  };
  return { from: startDay, list: out, keyOf };
}

const pct = (a, b) => (b > 0 ? Math.round(((a - b) / b) * 1000) / 10 : a > 0 ? null : 0);

/**
 * @param {object} p
 * @param {Array} p.products  dealer's own listings: {id, name, status, status_label, stock, live, dealer_price, reviewed_at, updated_at, note}
 * @param {Array} p.orders    dealer's orders: {order_number, status, sent_at, accepted_at, out_at, delivered_at, city, pincode, cancelled,
 *                            lines:[{product_id, name, qty, value}]}   value = dealer price × qty (null when unknown)
 * @param {Array} p.moves     stock added/changed by the dealer: {at, delta, product_name}
 * @param {string} p.range    '7d' | '30d' | '90d' | '12m'
 * @param {number} p.now      ms
 * @param {string|null} p.seenAt  when the dealer last opened notifications
 * @param {number} p.acceptMinutes
 */
export function buildDealerDashboard({ products = [], orders = [], moves = [], range = '30d', now = Date.now(), seenAt = null, acceptMinutes = 120, notices = [] }) {
  const rk = DASH_RANGES[range] ? range : '30d';
  const B = buckets(rk, now);
  const from = B.from;
  const span = now - from;
  const prevFrom = from - span;
  const series = Object.fromEntries(B.list.map((b) => [b.key, { key: b.key, label: b.label, orders: 0, units: 0, value: 0, stock_in: 0, stock_out: 0 }]));
  const good = orders.filter((o) => !CLOSED_BAD.includes(o.status) && !o.cancelled);
  const units = (o) => o.lines.reduce((s, l) => s + l.qty, 0);
  const value = (o) => o.lines.reduce((s, l) => s + (l.value || 0), 0);
  let missingValue = 0;

  // ---- sales (counted when delivered) and stock out (counted when dispatched)
  const cur = { orders: 0, units: 0, value: 0 }; const prev = { orders: 0, units: 0, value: 0 };
  const byProduct = new Map();
  for (const o of good) {
    const d = ms(o.delivered_at);
    if (o.status === 'delivered' && d >= prevFrom && d <= now) {
      const tgt = d >= from ? cur : prev;
      tgt.orders += 1; tgt.units += units(o); tgt.value += value(o);
      if (d >= from) {
        const s = series[B.keyOf(d)];
        if (s) { s.orders += 1; s.units += units(o); s.value += value(o); }
        for (const l of o.lines) {
          if (l.value == null) missingValue += 1;
          const k = l.product_id || l.name;
          const x = byProduct.get(k) || { name: l.name, units: 0, value: 0, orders: 0 };
          x.units += l.qty; x.value += l.value || 0; x.orders += 1; byProduct.set(k, x);
        }
      }
    }
    const out = ms(o.out_at) || (o.status === 'delivered' ? ms(o.delivered_at) : NaN);
    if (out >= from && out <= now) { const s = series[B.keyOf(out)]; if (s) s.stock_out += units(o); }
  }
  let stockIn = 0;
  for (const m of moves) {
    const t = ms(m.at);
    if (m.delta > 0 && t >= from && t <= now) { stockIn += m.delta; const s = series[B.keyOf(t)]; if (s) s.stock_in += m.delta; }
  }
  const stockOut = Object.values(series).reduce((a, s) => a + s.stock_out, 0);

  // ---- pipeline (accepted but not delivered yet)
  const open = good.filter((o) => LIVE.includes(o.status));
  const pipelineValue = open.filter((o) => o.status !== 'sent').reduce((a, o) => a + value(o), 0);

  // ---- service quality in the range
  const decided = orders.filter((o) => ms(o.sent_at) >= from && (o.accepted_at || o.status === 'rejected'));
  const acceptedN = decided.filter((o) => o.accepted_at).length;
  const acceptMins = good.filter((o) => ms(o.sent_at) >= from && o.accepted_at).map((o) => (ms(o.accepted_at) - ms(o.sent_at)) / 6e4);
  const dispatchHrs = good.filter((o) => ms(o.sent_at) >= from && o.out_at && o.accepted_at).map((o) => (ms(o.out_at) - ms(o.accepted_at)) / 36e5);
  const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);

  // ---- stock
  const listed = products.filter((p) => p.status === 'approved' || p.live);
  const totalStock = listed.reduce((a, p) => a + Math.max(0, p.stock || 0), 0);
  const low = listed.filter((p) => (p.stock || 0) > 0 && p.stock <= LOW_STOCK_AT).sort((a, b) => a.stock - b.stock);
  const outOf = listed.filter((p) => (p.stock || 0) <= 0);
  const stockValue = listed.reduce((a, p) => a + Math.max(0, p.stock || 0) * (p.dealer_price || 0), 0);
  const soldIn = (name, pid) => byProduct.get(pid)?.units || [...byProduct.values()].find((x) => x.name === name)?.units || 0;

  // ---- notifications (newest first)
  const notes = [];
  const waiting = orders.filter((o) => o.status === 'sent' && !o.cancelled);
  for (const o of waiting) {
    const late = now - ms(o.sent_at) > acceptMinutes * 6e4;
    notes.push({ at: o.sent_at, kind: late ? 'urgent' : 'order', icon: late ? '⏰' : '🛒', text: late ? `Order #${o.order_number} is waiting too long — accept or reject now` : `New order #${o.order_number} from ${o.city || 'a customer'}`, link: `/dealer/orders/${o.order_number}` });
  }
  for (const o of orders.filter((x) => x.cancelled && LIVE.includes(x.status))) notes.push({ at: o.sent_at, kind: 'urgent', icon: '✖️', text: `Order #${o.order_number} was cancelled — do not ship`, link: `/dealer/orders/${o.order_number}` });
  for (const p of products) {
    const t = p.reviewed_at || p.updated_at;
    if (now - ms(t) > 30 * 864e5) continue;
    if (p.status === 'approved' && p.reviewed_at) notes.push({ at: p.reviewed_at, kind: 'good', icon: '✅', text: `“${p.name}” is approved and live on the store`, link: `/dealer/products/${p.id}` });
    if (p.status === 'changes_requested') notes.push({ at: t, kind: 'warn', icon: '✏️', text: `Our team asked for changes to “${p.name}”${p.note ? `: ${p.note}` : ''}`, link: `/dealer/products/${p.id}` });
    if (p.status === 'rejected') notes.push({ at: t, kind: 'muted', icon: 'ℹ️', text: `“${p.name}” was not accepted${p.note ? `: ${p.note}` : ''}`, link: `/dealer/products/${p.id}` });
  }
  for (const p of outOf) notes.push({ at: p.updated_at, kind: 'urgent', icon: '🚫', text: `“${p.name}” is out of stock — customers cannot order it`, link: '/dealer/products' });
  for (const p of low) notes.push({ at: p.updated_at, kind: 'warn', icon: '⚠️', text: `Only ${p.stock} left of “${p.name}”`, link: '/dealer/products' });
  for (const n of notices) if (now - ms(n.at) < 60 * 864e5) notes.push(n);
  notes.sort((a, b) => ms(b.at) - ms(a.at));
  const seen = ms(seenAt);
  for (const n of notes) n.unread = !(seen >= ms(n.at));

  const firstSeen = Math.min(...orders.map((o) => ms(o.sent_at)).filter(Number.isFinite), ...moves.map((m) => ms(m.at)).filter(Number.isFinite), now);
  const fullPrev = firstSeen <= prevFrom;
  const top = [...byProduct.values()].sort((a, b) => b.units - a.units || b.value - a.value);
  return {
    range: rk, range_label: DASH_RANGES[rk].label, bucket: DASH_RANGES[rk].bucket, from: new Date(from).toISOString(), to: new Date(now).toISOString(),
    kpis: {
      total_stock: totalStock, stock_value: stockValue,
      products_live: listed.filter((p) => p.live).length, products_total: products.length,
      products_review: products.filter((p) => p.status === 'pending').length,
      products_changes: products.filter((p) => p.status === 'changes_requested').length,
      orders_delivered: cur.orders, units_sold: cur.units, sales_value: cur.value,
      // compare only when the previous period is fully covered by history (else the % is meaningless)
      orders_change_pct: fullPrev ? pct(cur.orders, prev.orders) : null, units_change_pct: fullPrev ? pct(cur.units, prev.units) : null, sales_change_pct: fullPrev ? pct(cur.value, prev.value) : null,
      open_orders: open.length, new_orders: waiting.length, pipeline_value: pipelineValue,
      low_stock: low.length, out_of_stock: outOf.length,
      stock_in: stockIn, stock_out: stockOut,
      accept_rate: decided.length ? Math.round((100 * acceptedN) / decided.length) : null,
      avg_accept_minutes: acceptMins.length ? Math.round(avg(acceptMins)) : null,
      avg_dispatch_hours: dispatchHrs.length ? Math.round(avg(dispatchHrs) * 10) / 10 : null,
      value_missing_lines: missingValue,
    },
    series: Object.values(series),
    top_products: top.slice(0, 5),
    by_product: top.slice(0, 8),
    stock_alerts: [...outOf.map((p) => ({ id: p.id, name: p.name, stock: 0, level: 'out' })), ...low.map((p) => ({ id: p.id, name: p.name, stock: p.stock, level: 'low' }))].slice(0, 10),
    stock_table: listed.map((p) => ({ id: p.id, name: p.name, stock: Math.max(0, p.stock || 0), live: !!p.live, sold: soldIn(p.name, p.product_id), dealer_price: p.dealer_price || 0 }))
      .sort((a, b) => a.stock - b.stock).slice(0, 50),
    recent_orders: [...orders].sort((a, b) => ms(b.sent_at) - ms(a.sent_at)).slice(0, 6).map((o) => ({
      order_number: o.order_number, status: o.status, sent_at: o.sent_at, delivered_at: o.delivered_at, city: o.city, pincode: o.pincode,
      items: units(o), first_item: o.lines[0]?.name || '', lines: o.lines.length, value: CLOSED_BAD.includes(o.status) ? null : value(o), cancelled: !!o.cancelled,
    })),
    notifications: notes.slice(0, 30),
    unread: notes.filter((n) => n.unread).length,
  };
}

/** Throws if any forbidden key appears anywhere in the object (defence in depth). */
export function assertDealerSafe(obj, path = '') {
  if (Array.isArray(obj)) { obj.forEach((v, i) => assertDealerSafe(v, `${path}[${i}]`)); return obj; }
  if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) {
      if (FORBIDDEN_KEYS.includes(k)) throw new Error(`dealer response leaks "${path}.${k}"`);
      assertDealerSafe(v, `${path}.${k}`);
    }
  }
  return obj;
}
