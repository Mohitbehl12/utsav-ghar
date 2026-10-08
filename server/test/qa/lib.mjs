/**
 * QA harness: every check is a named test case with an ID, module, expected and actual
 * result, severity if it fails. A failing case does not stop the run. Results go to
 * test/qa/results-<suite>.json for the report.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import Database from 'better-sqlite3';

export const BASE = process.env.QA_BASE || 'http://localhost:4000';
// Production mode redirects plain HTTP to HTTPS (TLS ends at the host's proxy). Every test request to BASE says it
// already came over HTTPS, as the proxy would.
const _fetch = globalThis.fetch;
globalThis.fetch = (url, opts = {}) => (String(url).startsWith(BASE)
  ? _fetch(url, { ...opts, headers: { 'X-Forwarded-Proto': 'https', ...(opts.headers || {}) } })
  : _fetch(url, opts));
export const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '../..');
export const db = new Database(path.join(ROOT, 'data/utsav-ghar.db'));
db.pragma('busy_timeout = 5000');

let ipSeq = 10;
/** Cookie-jar client. Each client gets its own fake IP (X-Forwarded-For) so per-IP limits stay realistic. */
export function client(opts = {}) {
  const jar = {};
  const ip = opts.ip || `10.20.${Math.floor(ipSeq / 250)}.${(ipSeq++ % 250) + 1}`;
  const call = async (method, p, body, headers = {}) => {
    const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
    const t0 = performance.now();
    const r = await fetch(BASE + p, {
      method,
      headers: { ...(isForm || body == null ? {} : { 'Content-Type': 'application/json' }), 'X-CSRF-Token': jar.sa_csrf || '', 'X-Forwarded-For': ip, 'X-Forwarded-Proto': 'https',
        Cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; '), ...headers },
      body: body == null ? undefined : isForm ? body : typeof body === 'string' ? body : JSON.stringify(body),
    });
    const ms = performance.now() - t0;
    for (const c of r.headers.getSetCookie()) { const [kv] = c.split(';'); const i = kv.indexOf('='); const k = kv.slice(0, i); const v = kv.slice(i + 1); if (v) jar[k] = v; else delete jar[k]; }
    const type = r.headers.get('content-type') || '';
    let data;
    if (/pdf|image|octet|webp/.test(type)) data = Buffer.from(await r.arrayBuffer());
    else { const tx = await r.text(); try { data = JSON.parse(tx); } catch { data = tx; } }
    return { status: r.status, data, headers: r.headers, ms };
  };
  call.jar = jar; call.ip = ip;
  call.init = async () => { await call('GET', '/api/health'); return call; };
  return call;
}

export const RESULTS = [];
let current = { module: 'General', page: '' };
export const section = (module, page = '') => { current = { module, page }; console.log(`\n=== ${module}${page ? ` · ${page}` : ''}`); };

export class Check extends Error {}
/** expect(cond, actual) — throws with the actual text when false. */
export const expect = (cond, actual = 'condition false') => { if (!cond) throw new Check(typeof actual === 'string' ? actual : JSON.stringify(actual).slice(0, 300)); };
export const brief = (r) => `${r.status} ${typeof r.data === 'object' && r.data && !Buffer.isBuffer(r.data) ? (r.data.error || JSON.stringify(r.data).slice(0, 140)) : Buffer.isBuffer(r.data) ? `${r.data.length} bytes` : String(r.data).slice(0, 140)}`;

/**
 * tc('CUS-REG-001', 'Valid registration', 'Account created (201)', async () => 'actual text', 'High')
 */
export async function tc(id, name, expected, fn, severity = 'High') {
  const row = { id, module: current.module, page: current.page, name, expected, actual: '', status: 'PASS', severity: '-' };
  try {
    const a = await fn();
    row.actual = a == null ? expected : String(a);
  } catch (e) {
    row.status = e instanceof Check ? 'FAIL' : 'ERROR';
    row.actual = String(e.message || e).slice(0, 400);
    row.severity = severity;
    if (!(e instanceof Check)) row.status = 'FAIL';
  }
  RESULTS.push(row);
  console.log(`${row.status === 'PASS' ? '✔' : '✘'} ${id} ${name}${row.status === 'PASS' ? '' : `\n    expected: ${expected}\n    actual:   ${row.actual}`}`);
  return row.status === 'PASS';
}
export const blocked = (id, name, expected, reason) => { RESULTS.push({ id, module: current.module, page: current.page, name, expected, actual: reason, status: 'BLOCKED', severity: '-' }); console.log(`… ${id} ${name} — BLOCKED: ${reason}`); };

export function save(suite) {
  const file = path.join(ROOT, 'test/qa', `results-${suite}.json`);
  fs.writeFileSync(file, JSON.stringify(RESULTS, null, 1));
  const c = (s) => RESULTS.filter((r) => r.status === s).length;
  console.log(`\n${suite}: ${RESULTS.length} cases · ${c('PASS')} pass · ${c('FAIL')} fail · ${c('BLOCKED')} blocked → ${file}`);
}

// ---- fixtures
export const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
export const PDF = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF');
export const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200)]);
export const blob = (buf, name, type) => new File([buf], name, { type });
export const SIG = `data:image/png;base64,${Buffer.concat([PNG, Buffer.alloc(300)]).toString('base64')}`;
export const uniq = () => crypto.randomBytes(3).toString('hex');
let phoneSeq = 0;
export const phone = (p = '98') => `${p}${String(Date.now()).slice(-6)}${String(phoneSeq++ % 100).padStart(2, '0')}`.slice(0, 10);
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const CONSENTS = { understood: true, terms: true, privacy: true, policies: true };
export const ADMIN = { email: 'admin@utsavghar.in', password: 'ChangeMe@2026', next: 'Toran&Kalash-2026' };

/** Signed-in owner (changes the seed password once). */
export async function ownerClient() {
  const A = await client().init();
  let r = await A('POST', '/api/admin/login', { email: ADMIN.email, password: ADMIN.next });
  if (r.status !== 200) {
    r = await A('POST', '/api/admin/login', { email: ADMIN.email, password: ADMIN.password });
    await A('PUT', '/api/admin/me/password', { current: ADMIN.password, next: ADMIN.next });
  }
  return A;
}

/** Register + sign in a customer through the real OTP flow. */
export async function newCustomer(over = {}) {
  const C = await client().init();
  const ph = over.phone || phone('97');
  const email = over.email || `qa.${uniq()}@example.com`;
  const otp = (await C('POST', '/api/auth/register/otp', { email, phone: ph })).data.dev_otp;
  const r = await C('POST', '/api/auth/register', { name: over.name || 'QA Customer', email, phone: ph, password: 'Saffron-Lamp-2026', confirm_password: 'Saffron-Lamp-2026',
    address: '14 Shanti Nagar, MG Road', city: 'Pune', state: 'Maharashtra', pincode: over.pincode || '411001', country: 'India', consents: CONSENTS, otp });
  if (r.status !== 201) throw new Error(`register failed: ${brief(r)}`);
  C.user = r.data.user; C.email = email; C.phone = ph; C.password = 'Saffron-Lamp-2026';
  return C;
}

export async function inStockProduct(C, min = 5) {
  const list = (await C('GET', '/api/products?inStock=1&limit=60')).data.items;
  const ids = list.filter((p) => !p.is_bundle).map((p) => p.id);
  for (const id of ids) { const s = db.prepare('SELECT stock FROM inventory WHERE product_id = ?').get(id)?.stock; if (s >= min) return list.find((p) => p.id === id); }
  throw new Error('no product with stock');
}

/** Place an order for a signed-in customer and return { number, id, token, total }. */
export async function placeOrder(C, items, addr = {}) {
  const q = (await C('POST', '/api/cart/quote', { items, pincode: addr.pincode || '411001' })).data;
  const r = await C('POST', '/api/orders', { items, customer: { name: C.user?.name || 'QA Customer', phone: C.phone || '9876543210', email: C.email || 'qa@example.com' },
    address: { line1: '14 Shanti Nagar, MG Road', city: addr.city || 'Pune', state: addr.state || 'Maharashtra', pincode: addr.pincode || '411001' }, expectedTotal: q?.total });
  if (r.status !== 201) throw new Error(`order failed: ${brief(r)}`);
  return { number: r.data.order.order_number, id: r.data.order.id, token: r.data.accessToken, total: r.data.order.totals.total, order: r.data.order };
}
