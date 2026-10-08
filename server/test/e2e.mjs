// End-to-end API walkthrough against a running server: node test/e2e.mjs [baseUrl]
const BASE = process.argv[2] || 'http://localhost:4000';
const jar = {};
async function call(method, path, body, headers = {}) {
  const cookie = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
  const isForm = body instanceof FormData;
  const r = await fetch(BASE + path, {
    method,
    headers: { ...(isForm ? {} : { 'Content-Type': 'application/json' }), 'X-CSRF-Token': jar.sa_csrf || '', Cookie: cookie, ...headers },
    body: body ? (isForm ? body : JSON.stringify(/\/api\/orders$/.test(String(path)) && body && typeof body === 'object' && !Array.isArray(body) ? { acceptTerms: true, ...body } : body)) : undefined,
  });
  for (const c of r.headers.getSetCookie()) { const [kv] = c.split(';'); const [k, v] = kv.split('='); if (v) jar[k] = v; else delete jar[k]; }
  const data = await r.json().catch(() => null);
  return { status: r.status, data };
}
const ok = (cond, msg) => { if (!cond) { console.error('✘', msg); process.exit(1); } console.log('✔', msg); };

await call('GET', '/api/health');
const noCsrf = await fetch(BASE + '/api/cart/quote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"items":[]}' });
ok(noCsrf.status === 403, 'POST without CSRF token is rejected');

const { data: list } = await call('GET', '/api/products?category=diyas-candles&sort=price_asc');
ok(list.items.length > 0 && list.items[0].price <= list.items.at(-1).price, 'product filter + sort');
const eligible = (await call('GET', '/api/products?offer=1&inStock=1')).data.items;
const [a, b, c] = eligible;

let q = (await call('POST', '/api/cart/quote', { items: [{ productId: a.id, qty: 1 }] })).data;
ok(q.nudge?.needed === 1 && q.discount === 0, `1 item → "${q.nudge.message}"`);
q = (await call('POST', '/api/cart/quote', { items: [{ productId: a.id, qty: 1 }, { productId: b.id, qty: 1 }] })).data;
ok(q.discount === Math.round((a.price + b.price) * 0.1), `2 items → 10% off, upsell: "${q.upsell?.message}"`);
q = (await call('POST', '/api/cart/quote', { items: [a, b, c].map((p) => ({ productId: p.id, qty: 1, price: 1 })) })).data;
ok(q.discount === Math.round((a.price + b.price + c.price) * 0.2), `3 items → 20% off (${q.discount / 100} off ${q.subtotal / 100})`);

const tampered = await call('POST', '/api/orders', {
  items: [{ productId: a.id, qty: 1 }], customer: { name: 'Test User', phone: '9876543210' },
  address: { line1: '1 Test Street, Sector 5', city: 'Pune', state: 'Maharashtra', pincode: '411001' }, expectedTotal: 1,
});
ok(tampered.status === 409, 'order with a mismatched (tampered) total is refused');

const placed = await call('POST', '/api/orders', {
  items: [a, b, c].map((p) => ({ productId: p.id, qty: 1 })), customer: { name: 'Asha Verma', phone: '9876543210', email: 'asha@example.com' },
  address: { line1: '1 Test Street, Sector 5', city: 'Pune', state: 'Maharashtra', pincode: '411001' }, expectedTotal: q.total,
});
ok(placed.status === 201 && placed.data.order.totals.total === q.total, `order ${placed.data.order.order_number} created with server total ₹${q.total / 100}`);
const { order_number } = placed.data.order;
const tok = { 'X-Order-Token': placed.data.accessToken };

ok((await call('GET', `/api/orders/${order_number}`)).status === 404, 'order hidden without access token');
ok((await call('GET', `/api/orders/${order_number}`, null, tok)).data.payment_status === 'awaiting_payment', 'guest can view own order with token');

const bad = await call('POST', `/api/orders/${order_number}/payment`, { txnRef: '12' }, tok);
ok(bad.status === 400, 'invalid UTR rejected');
const fd = new FormData();
fd.set('txnRef', `5${Date.now()}`.slice(0, 12));
const paid = await call('POST', `/api/orders/${order_number}/payment`, fd, tok);
ok(paid.data.payment_status === 'verification_pending', '"I have paid" → Payment Verification Pending (not auto-confirmed)');

const tr = await call('POST', '/api/orders/track', { orderNumber: order_number, phone: '+91 98765 43210' });
ok(tr.status === 200 && !tr.data.customer.phone, 'public tracking works and hides PII');

ok((await call('GET', '/api/admin/stats')).status === 401, 'admin API requires login');
const adminLogin = await call('POST', '/api/admin/login', { email: 'admin@utsavghar.in', password: 'ChangeMe@2026' });
ok(adminLogin.status === 200, 'admin login');
if (adminLogin.data.admin.must_change_password) {
  ok((await call('GET', '/api/admin/stats')).status === 403, 'admin panel locked until the default password is changed');
  ok((await call('PUT', '/api/admin/me/password', { current: 'ChangeMe@2026', next: 'Rangoli#Lamp-2026' })).status === 200, 'default admin password changed');
}
const orders = (await call('GET', `/api/admin/orders?q=${order_number}`)).data;
const id = orders[0].id;
ok((await call('POST', `/api/admin/orders/${id}/action`, { action: 'ship' })).status === 409, 'cannot ship before payment is confirmed');
for (const action of ['confirm_payment', 'process', 'ship', 'out_for_delivery', 'deliver']) {
  const r = await call('POST', `/api/admin/orders/${id}/action`, { action, carrier: 'Delhivery', trackingNumber: 'DL123' });
  ok(r.status === 200, `admin: ${action} → ${r.data.status}`);
}
const fin = (await call('GET', `/api/admin/orders/${id}`)).data;
ok(fin.timeline.every((s) => s.done), 'timeline complete');

// Admin changes the promotion without touching code: Buy 2 → 25% OFF
const offers = (await call('GET', '/api/admin/offers')).data;
const mega = offers.find((o) => !o.coupon_code);
const upd = await call('PUT', `/api/admin/offers/${mega.id}`, { ...mega, tiers: [{ min_qty: 2, percent: 25 }], max_discount: '', coupon_code: '' });
ok(upd.status === 200, 'admin updates offer to Buy 2 → 25%');
q = (await call('POST', '/api/cart/quote', { items: [{ productId: a.id, qty: 1 }, { productId: b.id, qty: 1 }] })).data;
ok(q.discount === Math.round((a.price + b.price) * 0.25), 'new rule applied immediately by the server');
await call('PUT', `/api/admin/offers/${mega.id}`, { ...mega, max_discount: '', coupon_code: '' });

// ---- combos, international, first-order coupon, tracking -----------------------
const combo = (await call('GET', '/api/products/diwali-decor-combo')).data.product;
ok(combo.is_bundle && combo.bundle_items.length === 4 && combo.bundle_worth > combo.price, `combo: ₹${combo.price / 100} for items worth ₹${combo.bundle_worth / 100}`);
const qi = (await call('POST', '/api/cart/quote', { items: [{ productId: combo.id, qty: 1 }], country: 'AE' })).data;
ok(qi.errors.some((e) => e.code === 'DOMESTIC_ONLY'), 'combo with rangoli powder is blocked for UAE delivery');
const lamp = (await call('GET', '/api/products/moroccan-metal-lantern')).data.product;
const qa = (await call('POST', '/api/cart/quote', { items: [{ productId: lamp.id, qty: 2 }], country: 'AE' })).data;
ok(qa.delivery === 149900 + 19900 && qa.zone.code === 'GCC', `UAE shipping for 2 items: ₹${qa.delivery / 100} (${qa.zone.delivery_text})`);
const intlOrder = await call('POST', '/api/orders', { items: [{ productId: lamp.id, qty: 2 }], country: 'AE', currency: 'AED', customer: { name: 'Riya Shah', phone: '+971 50 123 4567', email: 'riya@example.com' },
  address: { line1: 'Villa 12, Al Wasl Road', city: 'Dubai', state: 'Dubai', pincode: '00000' }, expectedTotal: qa.total, attribution: { utm_source: 'instagram', utm_medium: 'paid', utm_campaign: 'uae-test' } });
ok(intlOrder.status === 201 && intlOrder.data.order.payment_method === 'intl' && intlOrder.data.order.currency === 'AED', 'international order placed (pay by link), currency remembered');
const nl = (await call('POST', '/api/newsletter', { email: `new${Date.now()}@example.com` })).data;
ok(nl.coupon?.code === 'WELCOME10', `newsletter sign-up returns ${nl.coupon?.code}`);
const repeat = await call('POST', '/api/orders', { items: [{ productId: lamp.id, qty: 1 }], couponCode: 'WELCOME10', customer: { name: 'Asha Verma', phone: '9876543210' },
  address: { line1: '1 Test Street, Sector 5', city: 'Pune', state: 'Maharashtra', pincode: '411001' }, expectedTotal: 1 });
ok(repeat.status === 409 && /first orders only/.test(repeat.data.error), 'WELCOME10 refused for a returning phone number');
const sid = `test-session-${Date.now()}`;
for (const type of ['page_view', 'view_item', 'add_to_cart']) ok((await fetch(BASE + '/api/events', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': jar.sa_csrf, Cookie: `sa_csrf=${jar.sa_csrf}` }, body: JSON.stringify({ type, sessionId: sid, utm_source: 'instagram', utm_campaign: 'uae-test' }) })).status === 204, `event ${type} recorded`);
await call('POST', '/api/admin/ad-spend', { month: new Date().toISOString().slice(0, 7), source: 'instagram', campaign: 'uae-test', amount: 500 });
const mk = (await call('GET', '/api/admin/marketing?days=30')).data;
const row = mk.sources.find((x) => x.source === 'instagram' && x.campaign === 'uae-test');
ok(row && row.sessions >= 1 && row.orders >= 1 && row.spend === 50000, `marketing report: instagram/uae-test ${row.sessions} visit, ${row.orders} order, ₹${row.spend / 100} spend`);
const cs = await call('POST', '/api/checkout/session', { name: 'Kavya', email: 'kavya@example.com', phone: '9812300000', consent: true, items: [{ productId: lamp.id, qty: 1 }] });
ok(cs.status === 200 && cs.data.token, 'checkout session saved for reminders');
ok((await call('GET', `/api/checkout/session/${cs.data.token}`)).data.items.length === 1, 'cart can be restored from the reminder link');

const st = (await call('GET', '/api/admin/stats')).data;
ok(st.totalSales > 0 && st.salesByDay.length === 14, `dashboard: total sales ₹${st.totalSales / 100}, ${st.orders} orders`);
const pub = (await call('GET', '/api/settings/public')).data;
ok(!('settlement_note' in pub) && pub.upi_id, 'public settings expose UPI ID but not merchant internals');


// ---- profit reporting --------------------------------------------------------
const prof = (await call('GET', '/api/admin/profit')).data;
const prow = prof.products.find((p) => p.id === a.id);
ok(prow.cost > 0 && prow.unit_profit === prow.price - prow.cost, `profit per unit = selling − cost (${prow.name}: ₹${prow.unit_profit / 100})`);
ok(prof.totals.revenue - prof.totals.cogs === prof.totals.gross_profit, `realised gross profit ₹${prof.totals.gross_profit / 100} at ${prof.totals.margin_pct}% margin`);
const pr = await call('PATCH', `/api/admin/products/${a.id}/pricing`, { mrp: 10, price: 20, cost_price: 5 });
ok(pr.status === 400, 'pricing edit rejects MRP below selling price');
const pubP = (await call('GET', `/api/products/${a.slug}`)).data.product;
ok(!('cost_price' in pubP) && !('cost' in pubP), 'cost price is never exposed on the public API');
console.log('\nAll e2e checks passed 🎉');
