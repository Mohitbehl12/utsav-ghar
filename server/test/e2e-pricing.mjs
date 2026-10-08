// Delivery by PIN zone + per-zone profit: node test/e2e-pricing.mjs [baseUrl]
const BASE = process.argv[2] || 'http://localhost:4000';
function client() {
  const jar = {};
  return async (method, p, body, headers = {}) => {
    const r = await fetch(BASE + p, { method, headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': jar.sa_csrf || '', Cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; '), ...headers }, body: body ? JSON.stringify(/\/api\/orders$/.test(String(p)) && body && typeof body === 'object' && !Array.isArray(body) ? { acceptTerms: true, ...body } : body) : undefined });
    for (const c of r.headers.getSetCookie()) { const [kv] = c.split(';'); const [k, v] = kv.split('='); if (v) jar[k] = v; else delete jar[k]; }
    const t = await r.text(); let data = t; try { data = JSON.parse(t); } catch { /* */ }
    return { status: r.status, data };
  };
}
const ok = (c, m) => { if (!c) { console.error('✘', m); process.exit(1); } console.log('✔', m); };
const A = client(); await A('GET', '/api/health');
await A('POST', '/api/admin/login', { email: 'admin@utsavghar.in', password: 'ChangeMe@2026' });
await A('PUT', '/api/admin/me/password', { current: 'ChangeMe@2026', next: 'Toran&Kalash-2026' });

let s = (await A('GET', '/api/admin/pricing/settings')).data;
ok(s.zone_delivery && s.zone_fees.local && s.rate_card.national && s.live === false, 'delivery-by-PIN settings load (5 zones, rate card; Shiprocket not connected → rate card)');
const fees = { local: { fee: 39, free_above: 499 }, regional: { fee: 49, free_above: 499 }, metro: { fee: 59, free_above: 799 }, national: { fee: 69, free_above: 999 }, special: { fee: 129, free_above: 1499 } };
const card = { local: { first: 35, extra: 30 }, regional: { first: 42, extra: 35 }, metro: { first: 48, extra: 42 }, national: { first: 58, extra: 50 }, special: { first: 78, extra: 70 }, fuel_pct: 0 };
ok((await A('PUT', '/api/admin/pricing/settings', { zone_delivery: true, pickup_pincode: '411002', zone_fees: fees, rate_card: card })).status === 200, 'admin sets pickup PIN (Pune), customer delivery charges and courier rate card');

const C = client(); await C('GET', '/api/health');
const prod = (await C('GET', '/api/products?q=terracotta%20diya&limit=1')).data.items[0];
const q = async (pincode) => (await C('POST', '/api/cart/quote', { items: [{ productId: prod.id, qty: 1 }], pincode })).data;
const local = await q('411038'); const far = await q('781001'); const metro = await q('400028'); const none = await q();
ok(local.delivery_zone.key === 'local' && local.delivery === 3900, `Pune → Pune: Local, delivery ₹39 (product ${prod.price / 100})`);
ok(metro.delivery_zone.key === 'metro' && metro.delivery === 5900, 'Pune → Mumbai: Metro, ₹59');
ok(far.delivery_zone.key === 'special' && far.delivery === 12900, 'Pune → Guwahati: Special area, ₹129');
ok(none.delivery_zone.known === false && none.delivery === 6900, 'no PIN yet → shows Rest of India charge');
ok(local.subtotal === far.subtotal, 'product price is the same everywhere');
const big = (await C('POST', '/api/cart/quote', { items: [{ productId: prod.id, qty: 3 }], pincode: '411038' })).data;
ok(big.subtotal - big.discount >= 49900 ? big.delivery === 0 : big.delivery === 3900, 'free delivery above the local threshold');

// calculator: ₹400 cost, ₹800 price example
const calc = (await A('POST', '/api/admin/pricing/calc', { price: 800, cost: 400, weight_g: 450, dims: '12 x 8 x 15 cm', packaging: 20, other: 20, platform_pct: 0, gst_pct: 0, origin_pin: '411002', pins: ['411038', '110024'], target_profit: 300 })).data;
const z = Object.fromEntries(calc.zones.map((r) => [r.zone, r]));
ok(calc.inputs.kg === 1 && z.local.courier === 3500 + 3000, 'chargeable weight 1 kg (box size) → local courier ₹65');
ok(z.local.paid === 80000 && z.local.delivery_charged === 0 && z.local.profit === 80000 - 40000 - 2000 - 2000 - 6500, '₹800 order is above ₹499 → free delivery; profit = 800 − 400 − 20 − 20 − 65');
ok(z.local.courier < z.national.courier && z.national.courier < z.special.courier && z.national.delivery_charged === 6900, 'courier cost rises with distance; Rest of India customer pays ₹69 delivery on a ₹800 order');
ok(calc.pins.length === 2 && calc.pins[0].zone === 'local' && calc.pins[1].zone === 'metro' && calc.pins[0].source === 'rate_card', 'specific PIN codes priced (rate card until Shiprocket keys are set)');
ok(calc.suggestions.national > 40000 && calc.suggestions.local === 80900 && String(calc.suggestions.national / 100).endsWith('9'), `price for ₹300 profit to Rest of India: ₹${calc.suggestions.national / 100}`);
const man = (await A('POST', '/api/admin/pricing/calc', { price: 800, cost: 400, weight_g: 450, origin_pin: '411002', courier_overrides: { national: 45 } })).data;
ok(man.zones.find((r) => r.zone === 'national').courier === 4500 && man.zones.find((r) => r.zone === 'national').source === 'manual', 'courier cost can be overridden by hand');
const gst = (await A('POST', '/api/admin/pricing/calc', { price: 800, cost: 400, gst_pct: 12, platform_pct: 2, origin_pin: '411002' })).data.zones[0];
ok(gst.gst === Math.round(80000 * 12 / 112) && gst.platform === 1600, 'GST (included in price) and 2% platform fee are taken out');

const list = (await A('GET', '/api/admin/pricing/products')).data;
ok(list.items.length > 10 && list.items[0].zones.special && list.summary.products === list.items.length, 'all-products table: profit per zone for every product');
ok((await A('PUT', `/api/admin/pricing/products/${prod.id}/parcel`, { weight_g: 2500, dims: '30 x 20 x 20 cm' })).status === 200, 'admin sets the packed weight & box size of a product');
const heavy = (await A('POST', '/api/admin/pricing/calc', { product_id: prod.id, origin_pin: '411002' })).data;
ok(heavy.inputs.kg >= 3, `heavier parcel → ${heavy.inputs.kg} kg chargeable`);
const csv = await A('GET', '/api/admin/pricing/export.csv');
ok(typeof csv.data === 'string' && csv.data.includes('Rest of India profit'), 'CSV export for Excel');

// order records zone + courier estimate; actual bill can be entered
const placed = await C('POST', '/api/orders', { items: [{ productId: prod.id, qty: 1 }], customer: { name: 'Meena Joshi', phone: '9876500012' }, address: { line1: 'Flat 9, Sai Residency', city: 'Guwahati', state: 'Assam', pincode: '781001' } });
ok(placed.status === 201 && placed.data.order.totals.delivery === 12900, 'order to Guwahati charged ₹129 delivery');
let od = (await A('GET', `/api/admin/orders/${placed.data.order.id}`)).data;
ok(od.economics.zone === 'special' && od.economics.courier_est > 0 && od.economics.courier_source === 'rate_card', 'order shows zone, courier estimate and profit');
const e2 = (await A('PUT', `/api/admin/pricing/orders/${placed.data.order.id}/courier-cost`, { amount: 95 })).data;
ok(e2.courier === 9500 && e2.courier_source === 'actual', 'actual courier bill (₹95) replaces the estimate in the order profit');
ok((await C('GET', '/api/admin/pricing/settings')).status === 401, 'customers cannot see costs or profit');
console.log('\nPricing by PIN checks passed 🎉');
