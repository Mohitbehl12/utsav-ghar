// Compliance features: product declarations, country-of-origin filter, GST tax invoices, ads-measurement consent,
// no false urgency. Run against a fresh server seeded with --demo --guest-checkout:
//   node test/e2e-compliance.mjs [baseUrl]
const BASE = process.argv[2] || 'http://localhost:4000';
function client() {
  const jar = {};
  return async (method, p, body, headers = {}) => {
    const isForm = body instanceof FormData;
    const r = await fetch(BASE + p, { method, headers: { ...(isForm ? {} : { 'Content-Type': 'application/json' }), 'X-CSRF-Token': jar.sa_csrf || '', Cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; '), ...headers }, body: body ? (isForm ? body : JSON.stringify(body)) : undefined });
    for (const c of r.headers.getSetCookie()) { const [kv] = c.split(';'); const [k, v] = kv.split('='); if (v) jar[k] = v; else delete jar[k]; }
    const t = await r.text(); let data = t; try { data = JSON.parse(t); } catch { /* html */ }
    return { status: r.status, data, type: r.headers.get('content-type') || '' };
  };
}
let passed = 0;
const ok = (c, m, extra) => { if (!c) { console.error('✘', m, extra !== undefined ? JSON.stringify(extra).slice(0, 400) : ''); process.exit(1); } passed++; console.log('✔', m); };

const A = client(); await A('GET', '/api/health');
await A('POST', '/api/admin/login', { email: 'admin@utsavghar.in', password: 'ChangeMe@2026' });
await A('PUT', '/api/admin/me/password', { current: 'ChangeMe@2026', next: 'Toran&Kalash-2026' });

// ---------- product declarations
const list = (await A('GET', '/api/products?limit=3&sort=price_asc')).data.items;
const [p1, p2] = list;
const full = (await A('GET', `/api/admin/products/${p1.id}`)).data;
const asBody = (p, extra) => ({ ...p, price: p.price / 100, mrp: p.mrp / 100, cost_price: (p.cost_price || 0) / 100, stock: p.stock, category_id: p.category_id, bundle_items: [], ...extra });
let r = await A('PUT', `/api/admin/products/${p1.id}`, asBody(full, { hsn: '12', gst_rate: 18 }));
ok(r.status === 400, 'an invalid HSN code is refused', r.data);
r = await A('PUT', `/api/admin/products/${p1.id}`, asBody(full, { origin_country: 'India', maker_type: 'manufacturer', maker_name: 'Shree Diya Works', maker_address: 'Plot 4, Kumhar Gali, Jaipur 302001', net_quantity: 'Set of 6', hsn: '6913', gst_rate: 12 }));
ok(r.status === 200, 'admin saves country of origin, maker, net quantity, HSN and GST rate', r.data);
const pub = (await client()('GET', `/api/products/${p1.slug}`)).data;
const decl = pub.declarations || pub.product?.declarations;
ok(decl?.origin_country === 'India' && decl.maker_name === 'Shree Diya Works' && decl.net_quantity === 'Set of 6', 'the product page shows the declarations before purchase', decl);
ok(!('hsn' in (pub.product || pub)) && !('cost_price' in (pub.product || pub)), 'customers never see cost price or internal tax fields');
const full2 = (await A('GET', `/api/admin/products/${p2.id}`)).data;
r = await A('PUT', `/api/admin/products/${p2.id}`, asBody(full2, { origin_country: 'China', maker_type: 'importer', maker_name: 'Lumina Imports Pvt Ltd', maker_address: 'Unit 9, Okhla Phase II, New Delhi 110020', net_quantity: '1 N', hsn: '9405', gst_rate: 18 }));
ok(r.status === 200, 'an imported product is declared with its importer');

// ---------- country-of-origin filter (Legal Metrology rule 6(10A))
let s = (await client()('GET', '/api/products?limit=60')).data;
ok(s.facets.origins.some((o) => o.value === 'china' && o.count >= 1) && s.facets.origins.some((o) => o.value === 'not-stated'), 'shop offers a country-of-origin filter (with "Not stated" for undeclared products)', s.facets.origins);
s = (await client()('GET', '/api/products?origin=china&limit=60')).data;
ok(s.items.length >= 1 && s.items.every((p) => p.declarations.origin_country === 'China'), 'filtering by country of origin works');
s = (await client()('GET', '/api/products?sort=origin&limit=60')).data;
ok(s.items.length > 1, 'products can be sorted by country of origin');
ok((await client()('GET', '/api/products?origin=<script>')).status === 400, 'origin filter rejects junk input');

// ---------- readiness checks
let sec = (await A('GET', '/api/admin/security')).data;
ok(sec.checks.some((c) => /country of origin/.test(c.label) && !c.ok) && sec.checks.some((c) => /tax invoices/.test(c.label) && !c.ok), 'Admin → Security lists undeclared products and missing GST details');

// ---------- GST tax invoices
const C = client(); await C('GET', '/api/health');
const q = (await C('POST', '/api/cart/quote', { items: [{ productId: p1.id, qty: 2 }, { productId: p2.id, qty: 1 }] })).data;
const placed = await C('POST', '/api/orders', {
  items: [{ productId: p1.id, qty: 2 }, { productId: p2.id, qty: 1 }], customer: { name: 'Meera Iyer', phone: '9876501234', email: 'meera@example.com' },
  address: { line1: '22 Lake Road, Block B', city: 'Pune', state: 'Maharashtra', pincode: '411001' }, expectedTotal: q.total, acceptTerms: true,
  attribution: { utm_source: 'instagram', ads_consent: false },
});
ok(placed.status === 201, 'order placed (guest checkout fixture)', placed.data);
const num = placed.data.order.order_number, tok = { 'X-Order-Token': placed.data.accessToken };
r = await C('GET', `/api/orders/${num}/invoice?format=json`, null, tok);
ok(r.status === 409 && r.data.code === 'INVOICE_NOT_READY' && r.data.missing.some((m) => /GSTIN/.test(m)) && r.data.missing.some((m) => /Payment not confirmed/.test(m)), 'no invoice before payment and GST details — and it says what is missing', r.data);
ok((await A('PUT', '/api/admin/legal/company', { company_gstin: '12345' })).status === 400, 'an invalid GSTIN is refused');
const company = { company_name: 'Utsav Ghar', company_legal_name: 'Utsav Ghar Retail Private Limited', company_address: '14 Chandni Chowk, Delhi 110006', support_email: 'support@utsavghar.in', support_phone: '+91 98100 00000',
  grievance_officer: 'R. Sharma, Grievance Officer', grievance_email: 'grievance@utsavghar.in', jurisdiction_city: 'Delhi', website: 'www.utsavghar.in', company_gstin: '07AAACU1234F1Z5', company_state: 'Delhi' };
r = await A('PUT', '/api/admin/legal/company', company);
ok(r.status === 200 && r.data.company_gstin === '07AAACU1234F1Z5', 'owner saves the company GSTIN and state', r.data);
const oid = (await A('GET', `/api/admin/orders?q=${num}`)).data[0].id;
ok((await A('POST', `/api/admin/orders/${oid}/action`, { action: 'confirm_payment' })).status === 200, 'payment confirmed by admin');
r = await C('GET', `/api/orders/${num}/invoice?format=json`, null, tok);
const inv = r.data;
ok(r.status === 200 && /^INV\/\d{4}-\d{2}\/000001$/.test(inv.invoice_no), `first invoice of the financial year: ${inv.invoice_no}`, inv);
ok(inv.seller.gstin === '07AAACU1234F1Z5' && inv.seller.name === 'Utsav Ghar Retail Private Limited' && inv.place_of_supply === 'Maharashtra', 'invoice names the seller, GSTIN and place of supply');
ok(inv.totals.igst > 0 && inv.totals.cgst === 0 && /Inter-state/.test(inv.supply_type), 'Delhi → Maharashtra is inter-state: IGST');
ok(inv.totals.total === placed.data.order.totals.total, `invoice total equals the amount paid (₹${inv.totals.total / 100})`, [inv.totals, placed.data.order.totals]);
ok(inv.totals.taxable + inv.totals.tax === inv.totals.total, 'taxable value + GST = total');
ok(inv.lines.every((l) => /^\d{4,8}$/.test(l.hsn) && l.rate >= 0), 'every line carries HSN and rate');
const again = await C('GET', `/api/orders/${num}/invoice?format=json`, null, tok);
ok(again.data.invoice_no === inv.invoice_no && again.data.issued_at === inv.issued_at, 'the invoice is issued once and never renumbered');
const html = await C('GET', `/api/orders/${num}/invoice`, null, tok);
ok(html.status === 200 && /text\/html/.test(html.type) && html.data.includes('Tax Invoice') && html.data.includes('07AAACU1234F1Z5'), 'printable invoice page');
ok((await client()('GET', `/api/orders/${num}/invoice?format=json`)).status === 404, 'nobody else can open the invoice');
ok((await A('GET', `/api/admin/orders/${oid}/invoice?format=json`)).data.invoice_no === inv.invoice_no, 'admin sees the same invoice');

// intra-state order → CGST + SGST, next number
const q2 = (await C('POST', '/api/cart/quote', { items: [{ productId: p1.id, qty: 1 }] })).data;
const placed2 = await C('POST', '/api/orders', { items: [{ productId: p1.id, qty: 1 }], customer: { name: 'Ravi Kumar', phone: '9876505678' },
  address: { line1: '5 Ring Road, Lajpat Nagar', city: 'New Delhi', state: 'Delhi', pincode: '110024' }, expectedTotal: q2.total, acceptTerms: true, attribution: { ads_consent: true } });
const oid2 = (await A('GET', `/api/admin/orders?q=${placed2.data.order.order_number}`)).data[0].id;
await A('POST', `/api/admin/orders/${oid2}/action`, { action: 'confirm_payment' });
const inv2 = (await A('GET', `/api/admin/orders/${oid2}/invoice?format=json`)).data;
ok(inv2.invoice_no.endsWith('000002') && inv2.totals.cgst > 0 && inv2.totals.sgst > 0 && inv2.totals.igst === 0, 'Delhi → Delhi is intra-state: CGST + SGST; numbers run on', inv2.totals);
ok(Math.abs(inv2.totals.cgst - inv2.totals.sgst) <= 1, 'CGST and SGST are equal halves');

// ---------- ads-measurement consent
const ev = async (id) => { const o = (await A('GET', `/api/admin/orders/${id}`)).data; return JSON.stringify(o.events || o.timeline || o); };
ok((await ev(oid)).includes('did not allow ads measurement'), 'a purchase without ads consent is not reported to Meta/Google');
ok(!(await ev(oid2)).includes('did not allow ads measurement'), 'a purchase with consent goes through the normal reporting path');

console.log(`\nCompliance checks passed 🎉 (${passed})`);
