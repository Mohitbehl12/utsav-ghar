// Attack-style security checks against a running server (fresh database):
//   node test/e2e-security.mjs [baseUrl]
import { totpNow } from '../../shared/security.js';

const BASE = process.argv[2] || 'http://localhost:4000';
function client() {
  const jar = {};
  return async function call(method, path, body, headers = {}) {
    const cookie = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
    const isForm = body instanceof FormData;
    const r = await fetch(BASE + path, {
      method, redirect: 'manual',
      headers: { ...(isForm || typeof body === 'string' ? {} : { 'Content-Type': 'application/json' }), 'X-CSRF-Token': jar.sa_csrf || '', Cookie: cookie, ...headers },
      body: body == null ? undefined : isForm || typeof body === 'string' ? body : JSON.stringify(body),
    });
    for (const c of r.headers.getSetCookie()) { const [kv] = c.split(';'); const [k, v] = kv.split('='); if (v) jar[k] = v; else delete jar[k]; }
    const text = await r.text();
    let data = text; try { data = JSON.parse(text); } catch { /* html */ }
    return { status: r.status, data, headers: r.headers, jar };
  };
}
const ok = (cond, msg) => { if (!cond) { console.error('✘', msg); process.exit(1); } console.log('✔', msg); };
const A = client();
await A('GET', '/api/health');

// 1. Security headers
const home = await A('GET', '/');
const h = (k) => home.headers.get(k) || '';
ok(/frame-ancestors 'none'/.test(h('content-security-policy')) && /object-src 'none'/.test(h('content-security-policy')), 'CSP blocks framing (clickjacking) and plugins');
ok(h('x-content-type-options') === 'nosniff' && /strict-origin/.test(h('referrer-policy')), 'nosniff + strict referrer policy');
ok(/max-age=31536000/.test(h('strict-transport-security')), 'HSTS for one year');
ok(/microphone=\(self\)/.test(h('permissions-policy')) && /camera=\(\)/.test(h('permissions-policy')), 'Permissions-Policy: mic only for our own pages, camera off');
ok(!h('x-powered-by'), 'server technology not advertised');
ok((await A('GET', '/.well-known/security.txt')).status === 200, 'security.txt published');

// 2. CSRF
const raw = await fetch(`${BASE}/api/cart/quote`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"items":[]}' });
ok(raw.status === 403, 'POST without CSRF token is rejected');

// 3. Injection attempts
for (const q of ["' OR 1=1 --", "diya'; DROP TABLE products;--", '%27%20UNION%20SELECT%20password_hash%20FROM%20users--']) {
  const r = await A('GET', `/api/products?q=${encodeURIComponent(q)}`);
  ok(r.status === 200 && Array.isArray(r.data.items) && !JSON.stringify(r.data).includes('password_hash'), `SQL injection in search is harmless: ${q.slice(0, 24)}`);
}
ok((await A('GET', '/api/products?sort=price;DROP')).status === 400, 'unknown sort value refused');
ok((await A('GET', '/api/products?category=x%27%20OR%201=1')).data.total === 0, 'injection in category filter matches nothing');
const xss = await A('GET', '/shop/%3Cscript%3Ealert(1)%3C%2Fscript%3E');
ok(!String(xss.data).includes('<script>alert(1)</script>'), 'script in URL is never echoed into the page');

// 4. Auth & sessions
ok((await A('GET', '/api/admin/orders')).status === 401, 'admin API needs admin sign-in');
const forged = await A('GET', '/api/admin/orders', null, { Cookie: 'sa_admin=eyJhbGciOiJub25lIn0.eyJzdWIiOjEsImtpbmQiOiJhZG1pbiIsInJvbGUiOiJvd25lciJ9.' });
ok(forged.status === 401, 'forged / unsigned admin token refused');
const REG = { address: '12 MG Road, Camp', city: 'Pune', state: 'Maharashtra', pincode: '411001', country: 'India', consents: { understood: true, terms: true, privacy: true, policies: true } };
const weak = await A('POST', '/api/auth/register', { ...REG, name: 'Test Shopper', email: 'shopper@example.com', phone: '9876501234', password: 'password123', confirm_password: 'password123' });
ok(weak.status === 400 && weak.data.fields?.password, `weak password refused: "${weak.data.fields?.password}"`);
const regOtp = (await A('POST', '/api/auth/register/otp', { email: 'shopper@example.com', phone: '9876501234' })).data.dev_otp;
const reg = await A('POST', '/api/auth/register', { ...REG, name: 'Test Shopper', email: 'shopper@example.com', phone: '9876501234', password: 'Marigold-Lamp-77', confirm_password: 'Marigold-Lamp-77', otp: regOtp });
ok(reg.status === 201, 'account created with a strong password');
ok((await A('GET', '/api/admin/orders')).status === 401, 'a customer session cannot open the admin API');

// second device
const B = client();
await B('GET', '/api/health');
ok((await B('POST', '/api/auth/login', { email: 'shopper@example.com', password: 'Marigold-Lamp-77' })).status === 200, 'signed in on a second device');
ok((await A('PUT', '/api/account/password', { current: 'wrong', next: 'Another-Lamp-88' })).status === 400, 'password change needs the current password');
ok((await A('PUT', '/api/account/password', { current: 'Marigold-Lamp-77', next: 'Another-Lamp-88' })).status === 200, 'password changed');
ok((await A('GET', '/api/auth/me')).data.user?.email === 'shopper@example.com', 'this device stays signed in');
ok((await B('GET', '/api/auth/me')).data.user === null, 'the other device is signed out automatically');

// 5. Brute force lockout
const C = client(); await C('GET', '/api/health');
let last;
for (let i = 0; i < 5; i++) last = await C('POST', '/api/auth/login', { email: 'shopper@example.com', password: `guess-${i}` });
ok(last.status === 429, '5 wrong passwords → account locked');
ok((await C('POST', '/api/auth/login', { email: 'shopper@example.com', password: 'Another-Lamp-88' })).status === 429, 'even the right password waits until the lock ends');

// 6. Orders: no peeking at other people's orders, no price tampering
const items = (await A('GET', '/api/products?inStock=1&limit=2')).data.items;
const placed = await A('POST', '/api/orders', { items: [{ productId: items[0].id, qty: 1, price: 1 }], customer: { name: 'Test Shopper', phone: '9876501234' },
  address: { line1: '5 Temple Road, Ward 2', city: 'Pune', state: 'Maharashtra', pincode: '411001' } });
ok(placed.status === 201 && placed.data.order.totals.subtotal === items[0].price, 'price sent by the browser is ignored; server price used');
const D = client(); await D('GET', '/api/health');
ok((await D('GET', `/api/orders/${placed.data.order.order_number}`)).status === 404, "a stranger can't open someone's order by its number");
ok((await D('GET', `/api/orders/${placed.data.order.order_number}`, null, { 'X-Order-Token': 'guess-token-123456' })).status === 404, 'a guessed order token is refused');

// 7. Payloads & paths
const big = await A('POST', '/api/contact', `{"name":"${'x'.repeat(300000)}"}`, { 'Content-Type': 'application/json' });
ok(big.status === 413, 'oversized request body refused (413)');
for (const p of ['/uploads/../.env', '/uploads/..%2f..%2f.env', '/uploads/%2e%2e/server/.env']) {
  const r = await A('GET', p);
  ok(r.status === 404 || r.status === 400 || r.status === 403 || (r.status === 200 && !String(r.data).includes('JWT_SECRET')), `path traversal blocked: ${p}`);
}
ok((await A('POST', '/api/subscribe', { website: 'http://spam.example', email: 'bot@example.com', email_opt_in: true, consent: true })).status === 400, 'bot honeypot field blocks automated sign-ups');

// 8. Admin: forced password change, 2FA, lockout
const ADM = client(); await ADM('GET', '/api/health');
const first = await ADM('POST', '/api/admin/login', { email: 'admin@utsavghar.in', password: 'ChangeMe@2026' });
ok(first.status === 200 && first.data.admin.must_change_password, 'first admin sign-in flags the default password');
ok((await ADM('GET', '/api/admin/orders')).status === 403, 'admin panel locked until the default password is changed');
ok((await ADM('PUT', '/api/admin/me/password', { current: 'ChangeMe@2026', next: 'admin12345' })).status === 400, 'weak admin password refused');
ok((await ADM('PUT', '/api/admin/me/password', { current: 'ChangeMe@2026', next: 'Toran&Kalash-2026' })).status === 200, 'strong admin password set');
ok((await ADM('GET', '/api/admin/orders')).status === 200, 'admin panel unlocked');
const setup = await ADM('POST', '/api/admin/me/2fa/setup', {});
ok(/^otpauth:\/\/totp\//.test(setup.data.otpauth), 'two-step login: authenticator secret issued');
ok((await ADM('POST', '/api/admin/me/2fa/enable', { code: '000000' })).status === 400, 'wrong authenticator code refused');
const en = await ADM('POST', '/api/admin/me/2fa/enable', { code: await totpNow(setup.data.secret) });
ok(en.status === 200 && en.data.backupCodes.length === 10, 'two-step login switched on (10 backup codes)');
const E = client(); await E('GET', '/api/health');
const step1 = await E('POST', '/api/admin/login', { email: 'admin@utsavghar.in', password: 'Toran&Kalash-2026' });
ok(step1.data.twoFactor && step1.data.ticket && !step1.jar.sa_admin, 'password alone is not enough — asks for the code');
ok((await E('GET', '/api/admin/orders')).status === 401, 'no admin access between the two steps');
ok((await E('POST', '/api/admin/login/2fa', { ticket: step1.data.ticket, code: '123456' })).status === 401, 'wrong 6-digit code refused');
const step2 = await E('POST', '/api/admin/login/2fa', { ticket: step1.data.ticket, code: await totpNow(setup.data.secret, Date.now() + 30000) });
ok(step2.status === 200 && (await E('GET', '/api/admin/orders')).status === 200, 'correct code → signed in');
const F = client(); await F('GET', '/api/health');
const s1 = await F('POST', '/api/admin/login', { email: 'admin@utsavghar.in', password: 'Toran&Kalash-2026' });
ok((await F('POST', '/api/admin/login/2fa', { ticket: s1.data.ticket, code: en.data.backupCodes[0] })).status === 200, 'backup code works once');
const G = client(); await G('GET', '/api/health');
const s2 = await G('POST', '/api/admin/login', { email: 'admin@utsavghar.in', password: 'Toran&Kalash-2026' });
ok((await G('POST', '/api/admin/login/2fa', { ticket: s2.data.ticket, code: en.data.backupCodes[0] })).status === 401, 'the same backup code cannot be used twice');
const sec = await E('GET', '/api/admin/security');
ok(sec.status === 200 && sec.data.checks.find((c) => /Default admin password/.test(c.label)).ok && sec.data.failures.length > 0, 'security overview shows checks and failed sign-ins');
ok((await ADM('POST', '/api/admin/me/logout-all', {})).status === 200, 'admin "sign out everywhere"');
ok((await E('GET', '/api/admin/orders')).status === 401, 'other admin sessions ended');

// 9. Your data: export & delete
const exp = await A('GET', '/api/account/export');
ok(exp.status === 200 && exp.data.profile.email === 'shopper@example.com' && Array.isArray(exp.data.orders), 'customer can download their data');
ok((await A('DELETE', '/api/account', { password: 'Another-Lamp-88', confirm: 'nope' })).status === 400, 'delete needs typing DELETE');
ok((await A('DELETE', '/api/account', { password: 'Another-Lamp-88', confirm: 'DELETE' })).status === 200, 'customer deleted their account');
const Z = client(); await Z('GET', '/api/health');
ok((await Z('POST', '/api/auth/login', { email: 'shopper@example.com', password: 'Another-Lamp-88' })).status >= 401, 'deleted account cannot sign in');

console.log('\nSecurity checks passed 🔒');
