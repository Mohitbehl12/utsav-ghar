/**
 * Store insights with built-in ML (free, runs on the server and in the demo):
 *  - forecastDemand : Holt's linear trend smoothing on weekly sales + a festival
 *                     uplift learned from past festivals (or a sensible prior),
 *                     → next-30-day demand, days of stock left, reorder quantity.
 *  - segmentCustomers : RFM (recency, frequency, money) scoring → groups such as
 *                     Champions, Loyal, At risk, with the best next action.
 *  - orderRisk      : weighted risk score (logistic) for payments / fraud checks.
 */
import { stateForPin } from '../pincode.js';

const DAY = 864e5;
const day = (iso) => Math.floor(Date.parse(iso) / DAY);

// ---------- demand forecast ----------
/** Holt's linear exponential smoothing. Returns { level, trend }. */
export function holt(series, alpha = 0.4, beta = 0.15) {
  if (!series.length) return { level: 0, trend: 0 };
  let level = series[0]; let trend = series.length > 1 ? series[1] - series[0] : 0;
  for (let i = 1; i < series.length; i++) {
    const prev = level;
    level = alpha * series[i] + (1 - alpha) * (level + trend);
    trend = beta * (level - prev) + (1 - beta) * trend;
  }
  return { level: Math.max(0, level), trend };
}

// How much each store section sells extra in the 3 weeks before each festival (prior, × normal).
const PRIOR_UPLIFT = {
  diwali: { 'festive-decor': 3.5, pooja: 2.5, gifts: 3, 'home-decor': 1.8, dining: 1.6, kitchen: 1.4 },
  default: { 'festive-decor': 1.6, pooja: 1.5, gifts: 1.6, 'home-decor': 1.2, dining: 1.2, kitchen: 1.1 },
};
const FEST_CATS = { holi: ['holi-colours'], christmas: ['christmas-decor', 'party-decor'], 'new-year': ['party-decor', 'diwali-lights'], 'raksha-bandhan': ['rakhi'] };

/**
 * products: [{id, name, category_slug, segment, stock, is_diwali, price, cost_price}]
 * sales: [{product_id, qty, at}]   calendar: [{slug, name, date, categories?, collection?}]
 */
export function forecastDemand({ products, sales, calendar = [], now = Date.now(), horizon = 30, leadTime = 10, service = 1.65 }) {
  const today = Math.floor(now / DAY);
  const weeks = 12;
  const byProd = new Map();
  for (const s of sales) {
    const w = Math.floor((today - day(s.at)) / 7);
    if (w < 0 || w >= weeks) continue;
    if (!byProd.has(s.product_id)) byProd.set(s.product_id, Array(weeks).fill(0));
    byProd.get(s.product_id)[weeks - 1 - w] += s.qty;
  }
  const upcoming = calendar.filter((f) => f.enabled !== false).map((f) => ({ ...f, d: day(`${f.date}T00:00:00Z`) - today })).filter((f) => f.d >= 0 && f.d <= horizon + 21);
  const totalUnits = [...byProd.values()].reduce((s, a) => s + a.reduce((x, y) => x + y, 0), 0);
  const out = products.map((p) => {
    const series = byProd.get(p.id) || Array(weeks).fill(0);
    const units = series.reduce((a, b) => a + b, 0);
    const { level, trend } = holt(series);
    let weekly = Math.max(0, level + trend * 2); // two weeks ahead, smoothed
    let confidence = units >= 12 ? 'high' : units >= 4 ? 'medium' : 'low';
    if (units === 0 && totalUnits > 0) weekly = 0.15; // never sold: tiny baseline
    let perDay = weekly / 7;
    // festival uplift for days in the 3 weeks before each upcoming festival
    let extra = 0; const why = [];
    for (const f of upcoming) {
      const relevant = f.collection ? p.is_diwali : (f.categories || FEST_CATS[f.slug] || []).includes(p.category_slug);
      if (!relevant) continue;
      const mult = (f.slug.startsWith('diwali') ? PRIOR_UPLIFT.diwali : PRIOR_UPLIFT.default)[p.segment] || 1.3;
      const start = Math.max(0, f.d - 21); const end = Math.min(horizon, f.d);
      const days = Math.max(0, end - start);
      if (days > 0) { extra += perDay * (mult - 1) * days + (perDay === 0 ? 0 : 0); why.push(`${f.name} in ${f.d} days (×${mult})`); }
    }
    const demand = perDay * horizon + extra;
    const sd = Math.sqrt(series.reduce((s, x) => s + (x - units / weeks) ** 2, 0) / weeks) / Math.sqrt(7);
    const leadDemand = (demand / horizon) * leadTime;
    const safety = service * sd * Math.sqrt(leadTime);
    const stock = Number(p.stock) || 0;
    const avgDaily = demand / horizon;
    const cover = avgDaily > 0 ? stock / avgDaily : Infinity;
    const reorder = Math.max(0, Math.ceil(demand + safety - stock));
    let status = 'ok';
    if (stock <= 0) status = units > 0 ? 'out' : 'out_no_sales';
    else if (cover <= leadTime) status = 'reorder_now';
    else if (cover <= leadTime + 14) status = 'reorder_soon';
    else if (units === 0) status = 'no_sales';
    else if (cover > 120 && stock > 20) status = 'overstock';
    if (units === 0 && status !== 'out_no_sales') confidence = 'low';
    return {
      id: p.id, name: p.name, category: p.category_name, stock, sold_12w: units, weekly_now: Math.round(weekly * 10) / 10,
      forecast: Math.round(demand), cover_days: Number.isFinite(cover) ? Math.round(cover) : null, reorder_qty: status === 'overstock' ? 0 : reorder,
      status, confidence, festival: why.slice(0, 2), trend: trend > 0.15 ? 'up' : trend < -0.15 ? 'down' : 'flat', history: series,
      stock_value: stock * (p.cost_price || 0),
    };
  });
  const order = { out: 0, reorder_now: 1, reorder_soon: 2, overstock: 3, ok: 4, no_sales: 5, out_no_sales: 6 };
  return out.sort((a, b) => order[a.status] - order[b.status] || b.forecast - a.forecast);
}

// ---------- customer groups (RFM) ----------
export const SEGMENT_INFO = {
  champions: { label: 'Champions', icon: '🏆', action: 'Thank them: early access to new collections, ask for reviews. No discount needed.' },
  loyal: { label: 'Loyal', icon: '💛', action: 'Recommend matching products; invite to refer friends.' },
  potential: { label: 'Potential loyalists', icon: '🌱', action: 'Second-purchase nudge: a combo or "complete the set" offer.' },
  new: { label: 'New customers', icon: '✨', action: 'Welcome message, care tips, and picks for the next festival.' },
  promising: { label: 'Promising', icon: '🔆', action: 'Send weekly picks based on what they bought.' },
  attention: { label: 'Need attention', icon: '👀', action: 'Personal picks + limited-time offer before the next festival.' },
  at_risk: { label: 'At risk', icon: '⚠️', action: 'They used to buy often — send a "we miss you" offer (e.g. 10%).' },
  cant_lose: { label: "Can't lose them", icon: '🚨', action: 'Your big spenders gone quiet — personal WhatsApp from you + best offer.' },
  hibernating: { label: 'Hibernating', icon: '😴', action: 'Festival alerts only; avoid frequent messages.' },
  lost: { label: 'Lost', icon: '🍂', action: 'One win-back message before a big festival, then stop.' },
};
const quint = (vals, v, higherBetter = true) => {
  const sorted = [...vals].sort((a, b) => a - b);
  const rank = sorted.filter((x) => (higherBetter ? x <= v : x >= v)).length / sorted.length;
  return Math.min(5, Math.max(1, Math.ceil(rank * 5)));
};
/** orders: [{customer, name, phone, email, total, at}] (paid only) */
export function segmentCustomers(orders, now = Date.now()) {
  const m = new Map();
  for (const o of orders) {
    const c = m.get(o.customer) || { key: o.customer, name: o.name, phone: o.phone, email: o.email, orders: 0, spent: 0, first: o.at, last: o.at };
    c.orders++; c.spent += o.total; if (o.at > c.last) { c.last = o.at; c.name = o.name || c.name; } if (o.at < c.first) c.first = o.at;
    m.set(o.customer, c);
  }
  const list = [...m.values()].map((c) => ({ ...c, recency: Math.floor((now - Date.parse(c.last)) / DAY) }));
  const R = list.map((c) => c.recency); const F = list.map((c) => c.orders); const M = list.map((c) => c.spent);
  for (const c of list) {
    // small stores: fixed thresholds work better than quintiles until there are ~50 customers
    if (list.length < 50) {
      c.r = c.recency <= 30 ? 5 : c.recency <= 60 ? 4 : c.recency <= 120 ? 3 : c.recency <= 240 ? 2 : 1;
      c.f = c.orders >= 5 ? 5 : c.orders >= 3 ? 4 : c.orders === 2 ? 3 : 1;
      c.m = quint(M, c.spent);
    } else { c.r = quint(R, c.recency, false); c.f = quint(F, c.orders); c.m = quint(M, c.spent); }
    const { r, f, m: mm } = c;
    c.segment = r >= 4 && f >= 4 ? 'champions' : f >= 4 && r >= 3 ? 'loyal' : r <= 2 && f >= 4 && mm >= 4 ? 'cant_lose' : r <= 2 && f >= 3 ? 'at_risk'
      : r >= 4 && f >= 2 ? 'potential' : r >= 4 ? 'new' : r === 3 && f <= 1 ? 'promising' : r === 3 ? 'attention' : r === 2 ? 'hibernating' : 'lost';
    // simple "will they buy again in 60 days" estimate from frequency and recency
    const rate = c.orders / Math.max(30, (Date.parse(c.last) - Date.parse(c.first)) / DAY + 30);
    c.p_return = Math.round(Math.min(0.95, (1 - Math.exp(-rate * 60)) * Math.exp(-c.recency / 180)) * 100);
  }
  const groups = Object.keys(SEGMENT_INFO).map((k) => {
    const cs = list.filter((c) => c.segment === k);
    return { key: k, ...SEGMENT_INFO[k], count: cs.length, revenue: cs.reduce((s, c) => s + c.spent, 0), customers: cs.sort((a, b) => b.spent - a.spent) };
  }).filter((g) => g.count);
  return { total: list.length, groups };
}

// ---------- order risk ----------
const DISPOSABLE = /@(mailinator|guerrillamail|10minutemail|tempmail|yopmail|trashmail|sharklasers|getnada|dispostable|fakeinbox|temp-mail)\./i;
/**
 * o: { total, items_qty, max_line_qty, customer:{name, phone, email}, address:{state, pincode, line1, country}, utr, utr_reused,
 *      first_order, same_phone_24h, same_ip_24h, unpaid_same_phone, avg_order, international }
 * → { score 0–100, level, reasons[] }
 */
export function orderRisk(o) {
  const F = [];
  const add = (w, why) => F.push([w, why]);
  if (o.utr_reused) add(4, 'UPI reference (UTR) already used on another order');
  if (o.utr && !/^\d{12}$/.test(o.utr) && !/^[A-Z0-9]{10,22}$/i.test(o.utr)) add(1.5, 'UTR format looks wrong (usually 12 digits)');
  if (o.first_order && o.avg_order && o.total > 4 * o.avg_order && o.total > 300000) add(1.4, 'First order and much bigger than usual');
  if (o.same_phone_24h >= 3) add(1.2, `${o.same_phone_24h} orders from this phone in 24 h`);
  if (o.same_ip_24h >= 4) add(1.2, `${o.same_ip_24h} orders from this internet connection in 24 h`);
  if (o.unpaid_same_phone >= 2) add(1, `${o.unpaid_same_phone} earlier unpaid orders from this phone`);
  if (o.customer?.email && DISPOSABLE.test(o.customer.email)) add(1.3, 'Throw-away email address');
  if (o.customer?.name && (/(.)\1{3,}/.test(o.customer.name) || /\d/.test(o.customer.name) || /^(test|asdf|abc|xyz|qwerty)/i.test(o.customer.name))) add(1, 'Name looks made up');
  if ((o.address?.country || 'IN') === 'IN' && o.address?.pincode && o.address?.state) {
    const st = stateForPin(o.address.pincode);
    if (st && st !== o.address.state) add(1.2, `PIN ${o.address.pincode} is in ${st}, not ${o.address.state}`);
  }
  if (o.address?.line1 && o.address.line1.replace(/\s/g, '').length < 10) add(0.6, 'Very short address');
  if (o.max_line_qty >= 10) add(0.8, `${o.max_line_qty} pieces of one item (reseller or mistake?)`);
  if (o.international && o.total > 1000000) add(0.8, 'High-value international order');
  const z = -3.2 + F.reduce((s, [w]) => s + w, 0);
  const score = Math.round(100 / (1 + Math.exp(-z)));
  return { score, level: score >= 60 ? 'high' : score >= 25 ? 'medium' : 'low', reasons: F.sort((a, b) => b[0] - a[0]).map(([, why]) => why) };
}
