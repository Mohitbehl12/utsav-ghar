// Customer messages walkthrough against a running server: node test/e2e-crm.mjs [baseUrl]
const BASE = process.argv[2] || 'http://localhost:4000';
const jar = {};
async function call(method, path, body) {
  const cookie = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
  const r = await fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': jar.sa_csrf || '', Cookie: cookie }, body: body ? JSON.stringify(/\/api\/orders$/.test(String(path)) && body && typeof body === 'object' && !Array.isArray(body) ? { acceptTerms: true, ...body } : body) : undefined });
  for (const c of r.headers.getSetCookie()) { const [kv] = c.split(';'); const [k, v] = kv.split('='); if (v) jar[k] = v; else delete jar[k]; }
  const text = await r.text();
  let data = null; try { data = JSON.parse(text); } catch { data = text; }
  return { status: r.status, data };
}
const ok = (cond, msg) => { if (!cond) { console.error('✘', msg); process.exit(1); } console.log('✔', msg); };

await call('GET', '/api/health');
const products = (await call('GET', '/api/products?limit=6')).data.items;

let r = await call('POST', '/api/subscribe', { name: 'Meera', phone: '98765 43211', whatsapp_opt_in: true, frequency: 'daily' });
ok(r.status === 400, 'subscribe without ticking consent is refused');
r = await call('POST', '/api/subscribe', { name: 'Meera', consent: true });
ok(r.status === 400 && r.data.fields?.channels, 'must choose WhatsApp or email');
r = await call('POST', '/api/subscribe', { name: 'Meera Joshi', email: 'meera@example.com', phone: '98765 43211', email_opt_in: true, whatsapp_opt_in: true, frequency: 'daily', interests: ['pooja', 'dining'], consent: true, viewed: [products[0].id, products[1].id] });
ok(r.status === 201 && r.data.token && r.data.prefs.phone.includes('•'), `subscribed (daily, WhatsApp + email): "${r.data.message}"`);
const token = r.data.token;
r = await call('POST', '/api/newsletter', { email: 'MEERA@example.com' });
ok(r.status === 200 || r.status === 201, 'same person via footer newsletter (email in other case)');
ok((await call('POST', '/api/subscribe/signals', { token, viewed: [products[2].id], cart: [products[3].id] })).status === 204, 'browsing signals synced');

r = await call('POST', '/api/orders', {
  items: [{ productId: products[0].id, qty: 1 }], customer: { name: 'Ravi Kumar', phone: '+91 91234-56789', email: 'ravi@example.com' },
  address: { line1: '4 Lake Road, Sector 2', city: 'Pune', state: 'Maharashtra', pincode: '411001' }, marketingOptIn: true,
});
ok(r.status === 201, 'order with "+91 91234-56789" accepted and opted in to offers');

const adminLogin = await call('POST', '/api/admin/login', { email: 'admin@utsavghar.in', password: 'ChangeMe@2026' });
ok(adminLogin.status === 200, 'admin login');
if (adminLogin.data.admin.must_change_password) {
  ok((await call('GET', '/api/admin/stats')).status === 403, 'admin panel locked until the default password is changed');
  ok((await call('PUT', '/api/admin/me/password', { current: 'ChangeMe@2026', next: 'Rangoli#Lamp-2026' })).status === 200, 'default admin password changed');
}
let o = (await call('GET', '/api/admin/crm/overview')).data;
ok(o.subscribers.active === 2 && o.subscribers.whatsapp === 2 && o.subscribers.daily === 1 && o.subscribers.weekly === 1, `overview: ${o.subscribers.active} active, ${o.subscribers.whatsapp} on WhatsApp`);
ok(o.upcoming.length > 0 && o.upcoming[0].alerts, `festival calendar: next is ${o.upcoming[0].name} in ${o.upcoming[0].daysLeft} days`);
const subs = (await call('GET', '/api/admin/subscribers')).data;
ok(subs.total === 2 && subs.items.every((s) => !s.token), 'subscriber list (no tokens leaked)');
const ravi = subs.items.find((s) => s.name === 'Ravi Kumar');
ok(ravi.phone === '9123456789' && ravi.source === 'checkout', 'checkout opt-in saved with normalised phone');

let p = (await call('GET', `/api/admin/crm/preview?subscriber=${subs.items.find((s) => s.name === 'Meera Joshi').id}`)).data;
ok(p.items.length >= 3 && p.html.includes('Unsubscribe') && p.html.includes('/go/') && p.whatsapp.includes('Reply STOP'), `picks preview: ${p.items.slice(0, 3).join(', ')}`);
p = (await call('GET', '/api/admin/crm/preview?kind=festival&festival=christmas')).data;
ok(/Christmas/.test(p.subject) && p.items.length >= 2, `festival preview: "${p.subject}"`);

const run = (await call('POST', '/api/admin/crm/run', { only: 'picks' })).data;
ok(run.people === 2 && run.skipped >= 3, `run now: ${run.people} people, ${run.skipped} skipped (no email/WhatsApp provider configured yet)`);
const msgs = (await call('GET', '/api/admin/crm/messages')).data;
ok(msgs.length >= 3 && msgs.every((m) => m.status === 'skipped'), 'every message logged in the outbox');
const csv = await call('GET', '/api/admin/subscribers/export.csv');
ok(csv.status === 200 && String(csv.data).includes('meera@example.com'), 'CSV export');

// Click a message link, then order through it
const codes = msgs[0]?.code;
if (codes) {
  const go = (await call('GET', `/api/go/${codes}`)).data;
  ok(go.products.length > 0 && go.token, `message link opens ${go.products.length} products`);
  r = await call('POST', '/api/orders', { items: [{ productId: go.products[0].id, qty: 1 }], customer: { name: 'Meera Joshi', phone: '9876543211' },
    address: { line1: '9 Temple Street, Ward 3', city: 'Nashik', state: 'Maharashtra', pincode: '422001' }, attribution: { crm_code: codes } });
  ok(r.status === 201, 'order placed from the message link');
  o = (await call('GET', '/api/admin/crm/overview')).data;
  ok(o.last30.some((x) => x.clicked >= 1 && x.orders >= 1), 'click and order credited to the message');
} else console.log('• (sqlite3 CLI not installed — skipped link-click check)');

r = await call('POST', `/api/preferences/${token}/stop`, {});
ok(r.data.status === 'unsubscribed', 'one-tap unsubscribe');
const again = (await call('POST', '/api/admin/crm/run', { only: 'picks' })).data;
const after = (await call('GET', '/api/admin/crm/messages')).data;
ok(again.people === 0 && after.filter((m) => m.name === 'Meera Joshi').length === msgs.filter((m) => m.name === 'Meera Joshi').length, 'unsubscribed person is not messaged again');
ok((await call('GET', '/api/go/nonexistent1')).status === 404, 'unknown link → 404');
console.log('\nCustomer messages checks passed 🎉');
