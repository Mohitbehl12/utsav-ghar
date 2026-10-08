// Support requests & card-payment plumbing: node test/e2e-support.mjs [baseUrl]
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
const C = client(); await C('GET', '/api/health');

const topics = (await C('GET', '/api/support/topics')).data;
ok(topics.topics.length >= 10 && topics.solutions.payment.steps.length, `${topics.topics.length} help topics with instant solutions`);
const items = (await C('GET', '/api/products?inStock=1&limit=1')).data.items;
const placed = await C('POST', '/api/orders', { items: [{ productId: items[0].id, qty: 1 }], customer: { name: 'Neha Gupta', phone: '9811122233', email: 'neha@example.com' }, address: { line1: '22 Lake View, Sector 4', city: 'Noida', state: 'Uttar Pradesh', pincode: '201301' } });
const orderNumber = placed.data.order.order_number;

let r = await C('POST', '/api/support/tickets', { topic: 'damaged', name: 'Neha Gupta', phone: '9811122233', message: 'Diya arrived broken' });
ok(r.status === 400 && r.data.fields.orderNumber, 'damaged-item request needs an order number');
r = await C('POST', '/api/support/tickets', { topic: 'damaged', name: 'Stranger', phone: '9000000000', orderNumber, message: 'Diya arrived broken' });
ok(r.status === 400 && r.data.fields.orderNumber, "can't attach someone else's order (phone must match)");
r = await C('POST', '/api/support/tickets', { topic: 'damaged', name: 'Neha Gupta', phone: '98111 22233', orderNumber, message: 'The brass diya arrived with a dent on the side.' });
ok(r.status === 201 && /^HELP-\d+$/.test(r.data.ticket.number) && r.data.ticket.priority === 'high' && r.data.token, `request ${r.data.ticket.number} raised (high priority)`);
const { number } = r.data.ticket; const token = r.data.token;
ok((await C('POST', '/api/support/tickets', { topic: 'damaged', name: 'Neha Gupta', phone: '9811122233', orderNumber, message: 'again' })).status === 409, 'duplicate open request for the same order is refused');
ok((await C('GET', `/api/support/tickets/${number}`)).status === 404, 'request is private without its token');
const view = await C('GET', `/api/support/tickets/${number}`, null, { 'X-Ticket-Token': token });
ok(view.data.order.order_number === orderNumber && view.data.messages.length === 2 && view.data.solution.steps.length, 'customer sees request, linked order, auto-reply and solution');

const A = client(); await A('GET', '/api/health');
await A('POST', '/api/admin/login', { email: 'admin@utsavghar.in', password: 'ChangeMe@2026' });
await A('PUT', '/api/admin/me/password', { current: 'ChangeMe@2026', next: 'Toran&Kalash-2026' });
const list = (await A('GET', '/api/admin/support/tickets')).data;
ok(list.items[0].number === number && list.items[0].awaiting_us, 'admin inbox shows it first, awaiting reply');
const rep = await A('POST', `/api/admin/support/tickets/${number}/reply`, { message: "Sorry! We're sending a replacement today." });
ok(rep.data.status === 'waiting' && rep.data.messages.at(-1).author === 'admin', 'admin replied (status: waiting for customer)');
const cust = await C('POST', `/api/support/tickets/${number}/messages`, { message: 'Thank you!' }, { 'X-Ticket-Token': token });
ok(cust.data.status === 'open', 'customer reply reopens it for the team');
ok((await A('PATCH', `/api/admin/support/tickets/${number}`, { status: 'resolved' })).data.status === 'resolved', 'admin marks resolved');
ok((await C('POST', `/api/support/tickets/${number}/rate`, { rating: 5 }, { 'X-Ticket-Token': token })).data.rating === 5, 'customer rates the help 5★');
ok((await A('GET', '/api/admin/support/tickets?status=all')).data.satisfaction.avg === 5, 'satisfaction score shown to admin');
ok((await C('POST', '/api/support/tickets', { topic: 'other', name: 'Bot', phone: '9811122233', message: 'spam spam', website: 'x' })).status === 400, 'bot honeypot blocks spam requests');

// card payments go only through the gateway
const g = await C('POST', '/api/payments/gateway/create', { orderNumber, method: 'card' }, { 'X-Order-Token': placed.data.accessToken });
ok(g.status === 400 && /not enabled/i.test(g.data.error), 'card payment refused politely until the gateway keys are set (no card data handled by us)');
console.log('\nSupport & payment checks passed 🎉');
