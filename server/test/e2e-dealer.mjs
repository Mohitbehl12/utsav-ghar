// Dealer order management end to end: node test/e2e-dealer.mjs [baseUrl]
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
const cats = (await A('GET', '/api/categories')).data;
const catIds = cats.map((c) => c.id);
const diyaCat = cats.find((c) => c.slug === 'diyas-candles').id;

// two dealers for Delhi NCR: one sells everything, one only diyas; one far away in Mumbai
let r = await A('POST', '/api/admin/dealers', { name: 'Ramesh Gupta', business_name: 'Gupta Diya House', phone: '98100 11111', pincodes: '1100, 2013', category_ids: [diyaCat], pincode: '110006', city: 'Delhi' });
ok(r.status === 201 && r.data.temp_password, 'admin adds dealer (diyas only, Delhi/Noida) — gets a one-time password');
const d1 = { id: r.data.dealer.id, pw: r.data.temp_password };
r = await A('POST', '/api/admin/dealers', { name: 'Sunil Verma', business_name: 'Verma Home Store', phone: '9810022222', pincodes: '110001-110099\n201301', category_ids: catIds, pincode: '110017', city: 'Delhi', priority: 2 });
const d2 = { id: r.data.dealer.id, pw: r.data.temp_password };
r = await A('POST', '/api/admin/dealers', { name: 'Asha Patil', business_name: 'Patil Traders', phone: '9820033333', pincodes: '4000', category_ids: catIds, pincode: '400001', city: 'Mumbai' });
ok(r.status === 201, 'third dealer (Mumbai) added');
ok((await A('POST', '/api/admin/dealers', { name: 'Xyz', business_name: 'Dup', phone: '9810011111', category_ids: catIds })).status === 409, 'same mobile number cannot be added twice');

// customer orders a diya to Noida 201301
const C = client(); await C('GET', '/api/health');
const diya = (await C('GET', '/api/products?category=diyas-candles&inStock=1&limit=1')).data.items[0];
const placed = await C('POST', '/api/orders', { items: [{ productId: diya.id, qty: 2 }], customer: { name: 'Neha Gupta', phone: '9811122233', email: 'neha@example.com' }, address: { line1: '22 Lake View, Sector 4', city: 'Noida', state: 'Uttar Pradesh', pincode: '201301' } });
const { order_number: num, id: oid } = placed.data.order; const tok = placed.data.accessToken;
ok((await A('GET', `/api/admin/orders/${oid}`)).data.dealer.current === null, 'unpaid order is NOT sent to any dealer');
r = await A('POST', `/api/admin/orders/${oid}/action`, { action: 'confirm_payment' });
ok(r.data.dealer.current && r.data.dealer.current.status === 'sent', `payment confirmed → auto-sent to ${r.data.dealer.current.business_name}`);
const first = r.data.dealer.current.dealer_id;
ok([d1.id, d2.id].includes(first) && r.data.dealer.candidates.find((c) => c.business_name === 'Patil Traders').ok === false, 'Mumbai dealer skipped (does not deliver to 201301)');
let cv = (await C('GET', `/api/orders/${num}`, null, { 'X-Order-Token': tok })).data;
ok(cv.timeline.map((t) => t.label).join('|').startsWith('Order Received|Payment Confirmed|Sent to Dealer|Order Accepted|Packed|Ready for Delivery|Out for Delivery|Delivered') && cv.timeline[2].done, 'customer sees the 8-step dealer timeline: Sent to Dealer ✓');
ok(!JSON.stringify(cv).includes('Gupta Diya') && !JSON.stringify(cv).includes('Verma Home'), "customer never sees the dealer's name");

// dealer app
const firstPw = first === d1.id ? d1.pw : d2.pw; const firstPhone = first === d1.id ? '9810011111' : '9810022222';
const secondId = first === d1.id ? d2.id : d1.id; const secondPw = first === d1.id ? d2.pw : d1.pw; const secondPhone = first === d1.id ? '9810022222' : '9810011111';
const D = client(); await D('GET', '/api/health');
ok((await D('POST', '/api/dealer/login', { phone: firstPhone, password: 'wrong-one' })).status === 401, 'wrong dealer password refused');
r = await D('POST', '/api/dealer/login', { phone: firstPhone, password: firstPw });
ok(r.status === 200 && r.data.dealer.must_change_password, 'dealer signs in with mobile + one-time password');
ok((await D('GET', '/api/dealer/orders')).status === 403, 'must set own password before seeing orders');
ok((await D('PUT', '/api/dealer/me/password', { current: firstPw, next: 'short' })).status === 400, 'weak password refused');
ok((await D('PUT', '/api/dealer/me/password', { current: firstPw, next: 'Diya-Ghar#2026' })).status === 200, 'dealer sets a strong password');
ok((await D('GET', '/api/dealer/summary')).data.new === 1, 'dealer summary: 1 new order');
let list = (await D('GET', '/api/dealer/orders?tab=new')).data.items;
ok(list.length === 1 && list[0].order_number === num && list[0].items_count === 2, 'new order shows in the dealer list');
let v = (await D('GET', `/api/dealer/orders/${num}`)).data;
ok(v.customer.phone === null && v.customer.address.line1 === null && v.customer.address.pincode === '201301' && v.items[0].qty === 2, 'before accepting: products, qty & PIN visible — customer phone/address hidden');
ok(!('total' in v) && !JSON.stringify(v).includes('neha@example.com'), 'dealer never sees email or payment details');
ok((await D('POST', `/api/dealer/orders/${num}/pack`, { checked: [] })).status === 409, 'cannot pack before accepting');
r = await D('POST', `/api/dealer/orders/${num}/reject`, { reason: 'Item out of stock' });
ok(r.data.status === 'rejected', 'dealer 1 rejects (out of stock)');
let adm = (await A('GET', `/api/admin/orders/${oid}`)).data.dealer;
ok(adm.current?.dealer_id === secondId && adm.history.length === 2, 'order automatically moved to the next dealer');
ok((await D('GET', `/api/dealer/orders/${num}`)).data.status === 'rejected' && (await D('POST', `/api/dealer/orders/${num}/accept`)).status === 409, 'first dealer can no longer act on it');

// second dealer takes it to delivery
const E = client(); await E('GET', '/api/health');
await E('POST', '/api/dealer/login', { phone: secondPhone, password: secondPw });
await E('PUT', '/api/dealer/me/password', { current: secondPw, next: 'Verma-Store#2026' });
r = await E('POST', `/api/dealer/orders/${num}/accept`);
ok(r.data.status === 'accepted' && r.data.customer.phone === '9811122233' && r.data.customer.address.line1, 'dealer 2 accepts → full delivery details now visible');
ok((await C('GET', `/api/orders/${num}`, null, { 'X-Order-Token': tok })).data.status === 'processing', 'customer order status: Processing');
ok((await E('POST', `/api/dealer/orders/${num}/pack`, { checked: [] })).status === 400, 'packing needs every item ticked');
r = await E('POST', `/api/dealer/orders/${num}/pack`, { checked: v.items.map((i) => i.id) });
ok(r.data.status === 'packed', 'packed (all items ticked)');
ok((await E('POST', `/api/dealer/orders/${num}/ready`)).data.status === 'ready', 'ready for delivery');
ok((await E('POST', `/api/dealer/orders/${num}/dispatch`, { mode: 'self', rider_name: 'Raju', rider_phone: '123' })).status === 400, 'rider mobile must be valid');
r = await E('POST', `/api/dealer/orders/${num}/dispatch`, { mode: 'self', rider_name: 'Raju Kumar', rider_phone: '98765 43210' });
ok(r.data.status === 'out_for_delivery' && r.data.otp_needed, 'out for delivery with own delivery boy');
cv = (await C('GET', `/api/orders/${num}`, null, { 'X-Order-Token': tok })).data;
ok(/^\d{4}$/.test(cv.delivery.otp) && cv.delivery.rider_name === 'Raju Kumar', `customer sees rider + 4-digit delivery code`);
ok(!(await A('GET', `/api/admin/orders/${oid}`)).data.delivery?.otp && !JSON.stringify((await E('GET', `/api/dealer/orders/${num}`)).data).includes(cv.delivery.otp + '"'), 'code is hidden from admin & dealer');
const wrong = cv.delivery.otp === '1111' ? '2222' : '1111';
ok((await E('POST', `/api/dealer/orders/${num}/deliver`, { otp: wrong })).status === 400, 'wrong delivery code refused');
r = await E('POST', `/api/dealer/orders/${num}/deliver`, { otp: cv.delivery.otp });
ok(r.data.status === 'delivered', 'delivered — confirmed with the customer\'s code');
cv = (await C('GET', `/api/orders/${num}`, null, { 'X-Order-Token': tok })).data;
ok(cv.status === 'delivered' && cv.timeline.every((t) => t.done), 'customer timeline complete: all 8 steps ✓');

// courier + cancellation
const p2 = await C('POST', '/api/orders', { items: [{ productId: diya.id, qty: 1 }], customer: { name: 'Amit Shah', phone: '9811144455' }, address: { line1: '5 Park Street, Lajpat Nagar', city: 'Delhi', state: 'Delhi', pincode: '110024' } });
await A('POST', `/api/admin/orders/${p2.data.order.id}/action`, { action: 'confirm_payment' });
r = await A('POST', `/api/admin/orders/${p2.data.order.id}/dealer`, { dealer_id: secondId });
ok(r.status === 409 || r.data.dealer.current.dealer_id === secondId, 'admin can hand-pick a dealer');
const n2 = p2.data.order.order_number;
if (r.status === 409) await A('POST', `/api/admin/orders/${p2.data.order.id}/dealer`, { dealer_id: null });
const cur2 = (await A('GET', `/api/admin/orders/${p2.data.order.id}`)).data.dealer.current;
const W = cur2.dealer_id === secondId ? E : D;
await W('POST', `/api/dealer/orders/${n2}/accept`);
await W('POST', `/api/dealer/orders/${n2}/pack`, { checked: (await W('GET', `/api/dealer/orders/${n2}`)).data.items.map((i) => i.id) });
await W('POST', `/api/dealer/orders/${n2}/ready`);
r = await W('POST', `/api/dealer/orders/${n2}/dispatch`, { mode: 'courier', courier_name: 'Delhivery', awb: 'DLV123456789', tracking_url: 'https://www.delhivery.com/track/package/DLV123456789' });
ok(r.data.status === 'out_for_delivery' && r.data.delivery.awb === 'DLV123456789', 'handed to courier with AWB');
cv = (await C('GET', `/api/orders/${n2}`, null, { 'X-Order-Token': p2.data.accessToken })).data;
ok(cv.tracking?.number === 'DLV123456789' && cv.delivery.courier_name === 'Delhivery' && !cv.delivery.otp, 'customer sees courier + tracking number');
ok(cv.status === 'shipped' && !cv.timeline.find((t) => t.key === 'out_for_delivery').done, 'courier handover = Shipped (Out for Delivery waits for the courier)');
r = await W('POST', `/api/dealer/orders/${n2}/track`, { status: 'in_transit', location: 'Delhi hub' });
ok(r.data.delivery.tracking.length === 2 && r.data.delivery.tracking[1].status === 'in_transit', 'dealer adds courier checkpoint: In transit (Delhi hub)');
const trk = (await A('GET', '/api/admin/tracking?range=all')).data;
const ship = trk.items.find((x) => x.order_number === n2);
ok(trk.kpis.total >= 2 && trk.pipeline.length === 6 && ship.courier_name === 'Delhivery' && ship.last_update.status === 'in_transit', 'tracking dashboard lists the shipment with courier & latest checkpoint');
ok(trk.couriers.some((c) => c.name === 'Delhivery' && c.in_transit === 1) && trk.couriers.some((c) => c.mode === 'self' && c.delivered === 1), 'courier performance: Delhivery 1 in transit, own delivery 1 delivered');
ok(trk.dealers.length >= 1 && trk.stage_times.find((x) => x.key === 'accept').avg_min != null, 'dealer performance & average stage times computed');
r = await A('POST', `/api/admin/tracking/${ship.id}/update`, { status: 'out_for_delivery', location: 'Lajpat Nagar' });
cv = (await C('GET', `/api/orders/${n2}`, null, { 'X-Order-Token': p2.data.accessToken })).data;
ok(cv.status === 'out_for_delivery' && cv.timeline.find((t) => t.key === 'out_for_delivery').done && cv.delivery.tracking.length === 3, 'admin marks courier Out for delivery → customer timeline updates');
await A('POST', `/api/admin/tracking/${ship.id}/update`, { status: 'attempt_failed', note: 'Customer not at home' });
ok((await A('GET', '/api/admin/tracking?range=all&flag=attempts')).data.items.some((x) => x.order_number === n2), 'failed delivery attempt is flagged on the dashboard');
const hook = await fetch(`${BASE}/api/webhooks/courier`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Courier-Token': 'wrong-token-wrong-token' }, body: JSON.stringify({ awb: 'DLV123456789', status: 'Delivered' }) });
ok([401, 404].includes(hook.status), 'courier webhook refuses a wrong token');
if (process.env.COURIER_WEBHOOK_SECRET) {
  const h2 = await (await fetch(`${BASE}/api/webhooks/courier`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Courier-Token': process.env.COURIER_WEBHOOK_SECRET }, body: JSON.stringify({ awb: 'DLV123456789', status: 'DELIVERED', location: 'New Delhi', received_by: 'Amit (self)' }) })).json();
  ok(h2.results[0].ok && h2.results[0].status === 'delivered', 'courier webhook marks the parcel delivered');
} else {
  await A('POST', `/api/admin/tracking/${ship.id}/update`, { status: 'delivered', received_by: 'Amit (self)' });
}
cv = (await C('GET', `/api/orders/${n2}`, null, { 'X-Order-Token': p2.data.accessToken })).data;
ok(cv.status === 'delivered' && cv.delivery.received_by === 'Amit (self)' && cv.timeline.every((t) => t.done), 'customer: delivered, received by Amit — all steps ✓');
const det = (await A('GET', `/api/admin/tracking/${ship.id}`)).data;
ok(det.tracking.length >= 4 && det.events.length >= 6 && det.times.total != null, 'shipment detail: full journey with every checkpoint and time taken');
const csv = await A('GET', '/api/admin/tracking/export.csv?range=all');
ok(typeof csv.data === 'string' && csv.data.includes('DLV123456789') && csv.data.split('\n').length >= 3, 'CSV export for Excel');

const p3 = await C('POST', '/api/orders', { items: [{ productId: diya.id, qty: 1 }], customer: { name: 'Ritu Jain', phone: '9811177788' }, address: { line1: '9 MG Road, Sector 14', city: 'Noida', state: 'Uttar Pradesh', pincode: '201301' } });
await A('POST', `/api/admin/orders/${p3.data.order.id}/action`, { action: 'confirm_payment' });
const cur3 = (await A('GET', `/api/admin/orders/${p3.data.order.id}`)).data.dealer.current;
await A('POST', `/api/admin/orders/${p3.data.order.id}/action`, { action: 'cancel' });
const X = cur3.dealer_id === secondId ? E : D;
r = await X('GET', `/api/dealer/orders/${p3.data.order.order_number}`);
ok(r.data.status === 'cancelled' && (await X('POST', `/api/dealer/orders/${p3.data.order.order_number}/accept`)).status === 409, 'store cancels → dealer sees Cancelled and cannot ship');

const board = (await A('GET', '/api/admin/dealers')).data;
ok(board.dealers.length === 3 && board.dealers.some((d) => d.stats.delivered_30d >= 1), 'admin dealers page shows stats per dealer');
ok((await A('GET', '/api/admin/dealer-orders?status=delivered')).data.items.length >= 1, 'admin board lists dealer orders by status');
r = await A('POST', `/api/admin/dealers/${first}/password`);
ok(r.data.temp_password && (await D('GET', '/api/dealer/summary')).status === 401, 'password reset signs the dealer out everywhere');
console.log('\nDealer order management checks passed 🎉');
