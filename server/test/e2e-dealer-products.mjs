// Dealer product submissions & role separation: node test/e2e-dealer-products.mjs [baseUrl]
const BASE = process.argv[2] || 'http://localhost:4000';
function client() {
  const jar = {};
  return async (method, p, body, headers = {}) => {
    const isForm = body instanceof FormData;
    const r = await fetch(BASE + p, { method, headers: { ...(isForm ? {} : { 'Content-Type': 'application/json' }), 'X-CSRF-Token': jar.sa_csrf || '', Cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; '), ...headers }, body: body ? (isForm ? body : JSON.stringify(/\/api\/orders$/.test(String(p)) && body && typeof body === 'object' && !Array.isArray(body) ? { acceptTerms: true, ...body } : body)) : undefined });
    for (const c of r.headers.getSetCookie()) { const [kv] = c.split(';'); const [k, v] = kv.split('='); if (v) jar[k] = v; else delete jar[k]; }
    const t = await r.text(); let data = t; try { data = JSON.parse(t); } catch { /* */ }
    return { status: r.status, data, type: r.headers.get('content-type') };
  };
}
const ok = (c, m) => { if (!c) { console.error('✘', m); process.exit(1); } console.log('✔', m); };
// 1×1 PNG
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082', 'hex');
const form = (fields, images = 1) => { const f = new FormData(); for (const [k, v] of Object.entries(fields)) f.append(k, typeof v === 'object' ? JSON.stringify(v) : String(v)); for (let i = 0; i < images; i++) f.append('images', new Blob([PNG], { type: 'image/png' }), `p${i}.png`); return f; };
const noInternal = (obj, sellingPaise) => {
  const s = JSON.stringify(obj);
  return !/"(price|mrp|pricing|selling|margin_pct|markup_pct|net_profit|profit|internal_note)"/.test(s) && (sellingPaise == null || !s.includes(String(sellingPaise)));
};

const A = client(); await A('GET', '/api/health');
await A('POST', '/api/admin/login', { email: 'admin@utsavghar.in', password: 'ChangeMe@2026' });
await A('PUT', '/api/admin/me/password', { current: 'ChangeMe@2026', next: 'Toran&Kalash-2026' });
const cats = (await A('GET', '/api/categories')).data; const catId = cats.find((c) => c.slug === 'diyas-candles').id;
let r = await A('POST', '/api/admin/dealers', { name: 'Ramesh Gupta', business_name: 'Gupta Diya House', phone: '9810011111', pincodes: '1100', category_ids: [catId] });
const pw = r.data.temp_password; const dealerId = r.data.dealer.id;
r = await A('POST', '/api/admin/dealers', { name: 'Other Dealer', business_name: 'Other Shop', phone: '9810055555', pincodes: '1100', category_ids: [catId] });
const pw2 = r.data.temp_password;
await A('PUT', '/api/admin/dealers-settings', { auto_assign: true, auto_reassign: true, accept_minutes: 120 });
r = await A('PUT', '/api/admin/dealer-products-defaults', { shipping: 60, packaging: 20, other: 20, platform_pct: 0, gst_pct: 0, profit_mode: 'amount', profit_value: 300, rounding: 'rupee', review_email: 'team@utsavghar.in' });
ok(r.data.review_email === 'team@utsavghar.in' && r.data.defaults.shipping === 6000, 'admin sets review email + default expenses (₹100 total) & profit (₹300)');

const D = client(); await D('GET', '/api/health');
await D('POST', '/api/dealer/login', { phone: '9810011111', password: pw });
ok((await D('GET', '/api/dealer/products')).status === 403, 'dealer must set own password first');
await D('PUT', '/api/dealer/me/password', { current: pw, next: 'Diya-Ghar#2026' });

const base = { name: 'Handmade Peacock Brass Diya', category_id: catId, short_description: 'Solid brass peacock diya', description: 'Hand-cast solid brass diya with a peacock back, polished finish. Burns 2 hours on one fill.', dealer_price: 400, quantity: 25,
  specs: { Material: 'Solid brass', Dimensions: '12 × 8 × 15 cm', Weight: '450 g', Secret: 'ignored' }, dealer_sku: 'GDH-PC-01', hsn: '7418' };
ok((await D('POST', '/api/dealer/products', form(base, 0))).status === 400, 'a product needs at least one photo');
ok((await D('POST', '/api/dealer/products', form({ ...base, description: 'short' }))).status === 400, 'description must be meaningful');
const bad = new FormData(); Object.entries(base).forEach(([k, v]) => bad.append(k, typeof v === 'object' ? JSON.stringify(v) : String(v))); bad.append('images', new Blob([Buffer.from('<script>alert(1)</script>')], { type: 'image/png' }), 'x.png');
ok((await D('POST', '/api/dealer/products', bad)).status === 400, 'fake image (not really a PNG) is refused');
r = await D('POST', '/api/dealer/products', form(base, 2));
ok(r.status === 201 && r.data.status === 'pending' && r.data.status_label === 'Under review' && r.data.dealer_price === 40000 && r.data.images.length === 2, 'dealer submits product with ₹400 dealer price + 2 photos → Under review');
ok(!('Secret' in r.data.specs) && r.data.specs.Material === 'Solid brass', 'only known detail fields are kept');
const pid = r.data.id;
ok((await D('GET', r.data.images[0].url)).type?.startsWith('image/png'), 'dealer can see own photos (private, not public)');
ok((await fetch(`${BASE}/api/admin/dealer-products/${pid}/images/${r.data.images[0].name}`)).status === 401, 'photos are not public before approval');

// team email
const outbox = (await A('GET', '/api/admin/notifications')).data;
const mail = outbox.find((n) => n.template === 'dealer_product_new' && n.channel === 'email');
ok(mail && mail.recipient === 'team@utsavghar.in', 'internal team gets a review email with full product details');

// other dealer cannot see it
const O = client(); await O('GET', '/api/health');
await O('POST', '/api/dealer/login', { phone: '9810055555', password: pw2 }); await O('PUT', '/api/dealer/me/password', { current: pw2, next: 'Lantern&Rangoli-77' });
ok((await O('GET', `/api/dealer/products/${pid}`)).status === 404 && (await O('GET', '/api/dealer/products')).data.items.length === 0, "another dealer can't see this product");
ok((await D('GET', '/api/admin/dealer-products')).status === 401 && (await D('POST', '/api/admin/dealer-products-calc', { cost: 400 })).status === 401, 'dealer has no access to admin review or the price calculator');

// admin review
let list = (await A('GET', '/api/admin/dealer-products?status=pending')).data;
ok(list.items[0].id === pid && list.counts.pending === 1, 'admin review queue shows it');
const det = (await A('GET', `/api/admin/dealer-products/${pid}`)).data;
ok(det.images.length === 2 && det.dealer_price === 40000 && det.defaults.profit_value === 30000, 'admin sees details, photos, dealer price and default costs');
const calc = (await A('POST', '/api/admin/dealer-products-calc', { cost: 400, shipping: 60, packaging: 20, other: 20, profit_mode: 'amount', profit_value: 300 })).data;
ok(calc.selling === 80000 && calc.net_profit === 30000 && calc.expenses === 10000, 'calculator: ₹400 + ₹100 expenses + ₹300 profit = ₹800');
r = await A('POST', `/api/admin/dealer-products/${pid}/request-changes`, { note: 'Please add a photo with the diya lit' });
ok(r.data.status === 'changes_requested', 'admin asks for changes');
let dv = (await D('GET', `/api/dealer/products/${pid}`)).data;
ok(dv.status_label === 'Changes needed' && dv.note_from_team.includes('lit'), 'dealer sees "Changes needed" + the note');
const keep = JSON.stringify([dv.images[0].name]);
r = await D('PUT', `/api/dealer/products/${pid}`, form({ ...base, dealer_price: 420, keep_images: keep }, 1));
ok(r.data.status === 'pending' && r.data.images.length === 2 && r.data.revision === 2 && r.data.dealer_price === 42000, 'dealer re-submits (new photo, price ₹420) → Under review again');
ok((await A('POST', `/api/admin/dealer-products/${pid}/publish`, { name: base.name, category_id: catId, pricing: { shipping: 60, packaging: 20, other: 20, profit_value: 300 }, price: 300 })).status === 400, 'cannot publish below dealer cost by mistake');
r = await A('POST', `/api/admin/dealer-products/${pid}/publish`, { name: 'Peacock Brass Diya (Handmade)', category_id: catId, short_description: base.short_description, description: base.description,
  specs: { Material: 'Solid brass', Dimensions: '12 × 8 × 15 cm' }, pricing: { shipping: 60, packaging: 20, other: 20, profit_value: 300, rounding: 'nine' }, price: 829, mrp: 1199, is_active: true, note_to_dealer: 'Looks great!', internal_note: 'Margin ok for Diwali' });
ok(r.data.status === 'approved' && r.data.live.price === 82900 && r.data.live.is_active && r.data.pricing.net_profit > 0, 'admin publishes at ₹829 (calculator ₹829, MRP ₹1,199)');
const slugUrl = r.data.live.url;

// customer side
const C = client(); await C('GET', '/api/health');
const pub = (await C('GET', `/api/products/${slugUrl.split('/').pop()}`)).data;
ok(pub.product.price === 82900 && pub.product.images.length === 2 && !('cost_price' in pub.product) && !JSON.stringify(pub).includes('42000'), 'customer sees only ₹829 + photos (no dealer price)');

// dealer side after approval — never sees the selling price or calculation
dv = (await D('GET', `/api/dealer/products/${pid}`)).data;
ok(dv.status === 'approved' && dv.live && dv.dealer_price === 42000 && dv.note_from_team === 'Looks great!', 'dealer sees Approved + Live + their own ₹420');
ok(noInternal(dv, 82900) && noInternal((await D('GET', '/api/dealer/products')).data, 82900), 'dealer responses contain NO selling price, MRP, margin, profit or internal note');
ok(!JSON.stringify(dv).includes('Margin ok'), 'internal note never reaches the dealer');

// stock updates go live immediately; orders route to this dealer
r = await D('PATCH', `/api/dealer/products/${pid}/stock`, { quantity: 7 });
ok(r.data.quantity === 7 && r.data.store_stock === 7, 'dealer updates availability → store stock = 7 at once');
const prodId = det.id && (await A('GET', `/api/admin/dealer-products/${pid}`)).data.live.id;
const placed = await C('POST', '/api/orders', { items: [{ productId: prodId, qty: 1 }], customer: { name: 'Neha Gupta', phone: '9811122233' }, address: { line1: '22 Lake View, Sector 4', city: 'Delhi', state: 'Delhi', pincode: '110017' } });
r = await A('POST', `/api/admin/orders/${placed.data.order.id}/action`, { action: 'confirm_payment' });
ok(r.data.dealer.current?.dealer_id === dealerId, "customer's order for this product goes to the dealer who supplied it");
const ov = (await D('GET', `/api/dealer/orders/${placed.data.order.order_number}`)).data;
ok(noInternal(ov, 82900), 'dealer order screen shows no prices either');
ok((await D('DELETE', `/api/dealer/products/${pid}`)).status === 409, 'a live product cannot be deleted by the dealer (set quantity 0 instead)');
r = await D('POST', '/api/dealer/products', form({ ...base, name: 'Plain Clay Diya Set', dealer_sku: 'GDH-CL-02' }, 1));
ok((await D('POST', '/api/dealer/products', form({ ...base, name: 'Copy With Same SKU' }, 1))).status === 409, 'the same SKU cannot be used twice by one dealer');
r = await A('POST', `/api/admin/dealer-products/${r.data.id}/reject`, { note: 'We already stock this item' });
ok(r.data.status === 'rejected', 'admin can reject with a reason');

// business dashboard: deliver the order, then check the dealer's numbers (dealer price only)
const onum = placed.data.order.order_number;
const items = (await D('GET', `/api/dealer/orders/${onum}`)).data.items;
await D('POST', `/api/dealer/orders/${onum}/accept`);
await D('POST', `/api/dealer/orders/${onum}/pack`, { checked: items.map((i) => i.id) });
await D('POST', `/api/dealer/orders/${onum}/ready`);
await D('POST', `/api/dealer/orders/${onum}/dispatch`, { mode: 'self', rider_name: 'Raju Kumar', rider_phone: '9876543210' });
const otp = (await C('GET', `/api/orders/${onum}`, null, { 'X-Order-Token': placed.data.accessToken })).data.delivery.otp;
ok((await D('POST', `/api/dealer/orders/${onum}/deliver`, { otp })).data.status === 'delivered', 'dealer delivers the order');
let dash = (await D('GET', '/api/dealer/dashboard?range=7d')).data;
ok(dash.kpis.units_sold === 1 && dash.kpis.orders_delivered === 1 && dash.kpis.sales_value === 42000, 'dashboard: 1 sold, sales value ₹420 (dealer price × qty, not ₹829)');
ok(dash.kpis.total_stock === 6 && dash.kpis.products_live === 1 && dash.kpis.stock_out === 1 && dash.kpis.stock_in >= 5, 'dashboard: stock 6 left, stock in/out counted');
ok(dash.series.length === 7 && dash.series.reduce((a, x) => a + x.units, 0) === 1, 'dashboard: daily series for the graph');
ok(dash.top_products[0].name.startsWith('Peacock') && dash.recent_orders[0].order_number === onum && dash.recent_orders[0].value === 42000, 'dashboard: top product + recent orders at dealer value');
ok(dash.notifications.some((n) => n.text.includes('approved')) && dash.unread >= 1, 'dashboard: notifications (product approved)');
ok(noInternal(dash, 82900) && !JSON.stringify(dash).includes('unit_price') && !JSON.stringify(dash).includes('line_total'), 'dashboard has NO selling price, MRP, margin or profit');
await D('PATCH', `/api/dealer/products/${pid}/stock`, { quantity: 3 });
dash = (await D('GET', '/api/dealer/dashboard?range=12m')).data;
ok(dash.series.length === 12 && dash.kpis.low_stock === 1 && dash.stock_alerts[0].stock === 3 && dash.notifications.some((n) => n.text.includes('Only 3 left')), 'low stock alert (3 left) + 12-month view');
await D('POST', '/api/dealer/notifications/seen');
ok((await D('GET', '/api/dealer/dashboard')).data.unread === 0, 'notifications marked as read');
const prof = (await D('GET', '/api/dealer/profile')).data;
ok(prof.business_name === 'Gupta Diya House' && prof.phone === '9810011111', 'dealer profile & business info');
ok((await D('PUT', '/api/dealer/profile', { email: 'gupta@example.com' })).data.email === 'gupta@example.com', 'dealer updates own email');
ok((await C('GET', '/api/dealer/dashboard')).status === 401 && (await A('GET', '/api/dealer/dashboard')).status === 401, 'customer / admin cookies cannot open the dealer dashboard (role check on server)');
console.log('\nDealer product checks passed 🎉');
