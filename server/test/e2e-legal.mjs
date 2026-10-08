// Customer agreement + dealer onboarding/KYC/e-signature + admin verification & versions: node test/e2e-legal.mjs [baseUrl]
const BASE = process.argv[2] || 'http://localhost:4000';
function client() {
  const jar = {};
  return async (method, p, body, headers = {}) => {
    const isForm = body instanceof FormData;
    const r = await fetch(BASE + p, { method, headers: { ...(isForm ? {} : { 'Content-Type': 'application/json' }), 'X-CSRF-Token': jar.sa_csrf || '', Cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; '), ...headers }, body: body ? (isForm ? body : JSON.stringify(body)) : undefined });
    for (const c of r.headers.getSetCookie()) { const [kv] = c.split(';'); const [k, v] = kv.split('='); if (v) jar[k] = v; else delete jar[k]; }
    const type = r.headers.get('content-type') || '';
    if (type.includes('pdf') || type.includes('image')) return { status: r.status, data: Buffer.from(await r.arrayBuffer()), type };
    const t = await r.text(); let data = t; try { data = JSON.parse(t); } catch { /* */ }
    return { status: r.status, data };
  };
}
const ok = (c, m) => { if (!c) { console.error('✘', m); process.exit(1); } console.log('✔', m); };
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF');
const file = (buf, name, type) => new Blob([buf], { type });
// a real-looking signature PNG (> 200 bytes)
const SIG = `data:image/png;base64,${Buffer.concat([PNG, Buffer.alloc(300)]).toString('base64')}`;

const A = client(); await A('GET', '/api/health');
await A('POST', '/api/admin/login', { email: 'admin@utsavghar.in', password: 'ChangeMe@2026' });
await A('PUT', '/api/admin/me/password', { current: 'ChangeMe@2026', next: 'Toran&Kalash-2026' });

// ---------------- customer
const C = client(); await C('GET', '/api/health');
const legal = (await C('GET', '/api/legal/customer')).data;
ok(legal.docs.length === 3 && legal.consents.length === 4 && legal.docs[0].title === 'Customer Terms & Agreement' && legal.docs[0].body.includes('What this means'), 'sign-up page gets the Customer Agreement, Privacy and Refund policies (simple + full) and 4 boxes');
const pre = await C('GET', '/api/legal/customer/pdf');
ok(pre.status === 200 && pre.data.slice(0, 5).toString() === '%PDF-', 'customer can download the agreement PDF before signing up');
ok((await C('GET', '/api/legal/doc/privacy/pdf')).data.slice(0, 5).toString() === '%PDF-', 'every customer document has a PDF');
const reg = { name: 'Kavita Rao', email: 'kavita@example.com', phone: '98111 22334', password: 'Rangoli#Diya2026', confirm_password: 'Rangoli#Diya2026', address: '12 MG Road, Camp', city: 'Pune', state: 'Maharashtra', pincode: '411001', country: 'India' };
let r = await C('POST', '/api/auth/register', { ...reg, consents: { terms: true, privacy: true, policies: true } });
ok(r.status === 400 && r.data.fields['consents.understood'], 'registration refused until every mandatory box is ticked');
r = await C('POST', '/api/auth/register', { ...reg, confirm_password: 'x', consents: { understood: true, terms: true, privacy: true, policies: true } });
ok(r.status === 400 && r.data.fields.confirm_password, 'passwords must match');
const otp = (await C('POST', '/api/auth/register/otp', { email: reg.email, phone: reg.phone })).data.dev_otp;
r = await C('POST', '/api/auth/register', { ...reg, otp, consents: { understood: true, terms: true, privacy: true, policies: true } });
ok(r.status === 201 && r.data.user.phone === '9811122334', 'customer account created with full address + all consents');
let mine = (await C('GET', '/api/account/legal')).data;
ok(mine.items.length === 3 && mine.items.every((x) => /sign-up/.test(x.verification)) && mine.pending.length === 0 && mine.items.every((x) => x.version === '1.0' && x.ref_no.startsWith('UGC-') && x.hash.length === 64), 'acceptance record per document: version, reference, fingerprint');
const pdf1 = await C('GET', `/api/account/legal/${mine.items[0].id}/pdf`);
ok(pdf1.status === 200 && pdf1.data.slice(0, 5).toString() === '%PDF-', 'customer downloads a PDF copy');
ok((await client()('GET', `/api/account/legal/${mine.items[0].id}/pdf`)).status === 401, 'not visible without signing in');
const addr = (await C('GET', '/api/account/addresses')).data;
ok(JSON.stringify(addr).includes('411001'), 'sign-up address saved as default delivery address');

const G = client(); await G('GET', '/api/health');
const prod = (await G('GET', '/api/products?category=diyas-candles&inStock=1&limit=1')).data.items[0];
const orderBody = { items: [{ productId: prod.id, qty: 1 }], customer: { name: 'Kavita Rao', phone: '9811122334', email: 'kavita@example.com' }, address: { line1: '12 MG Road, Camp', city: 'Pune', state: 'Maharashtra', pincode: '411001' } };
r = await G('POST', '/api/orders', orderBody);
ok(r.status === 401 && r.data.code === 'LOGIN_REQUIRED', 'guest checkout is off: must sign in to order');
ok((await C('POST', '/api/orders', orderBody)).status === 201, 'signed-in customer with accepted terms can order');

// ---------------- versions: a material privacy change forces re-acceptance
const docs = (await A('GET', '/api/admin/legal/docs')).data;
const privacy = docs.kinds.find((k) => k.kind === 'privacy');
ok((await A('PUT', `/api/admin/legal/docs/${privacy.versions[0].id}`, { title: 'x', body: 'y'.repeat(60), version: '1.0' })).status === 409, 'a published version cannot be edited');
ok((await A('DELETE', `/api/admin/legal/docs/${privacy.versions[0].id}`)).status === 409, 'a published version cannot be deleted');
let draft = (await A('POST', '/api/admin/legal/docs', { kind: 'privacy' })).data;
ok(draft.version === '1.1' && draft.status === 'draft', 'new draft version 1.1 copied from 1.0');
r = await A('PUT', `/api/admin/legal/docs/${draft.id}`, { title: 'Privacy Policy', body: `${draft.body}\n\n## 9. New\nWe now also use delivery photos as proof.`, version: '2.0', change_note: 'Delivery photos', material: true });
ok(r.data.version === '2.0', 'draft edited and renumbered 2.0');
ok((await A('POST', `/api/admin/legal/docs/${draft.id}/publish`, { material: true })).status === 409, 'a draft cannot be published without legal approval');
ok((await A('POST', `/api/admin/legal/docs/${draft.id}/submit`)).data.status === 'internal_review', 'draft sent for internal review');
ok((await A('POST', `/api/admin/legal/docs/${draft.id}/approve`, { reviewer: 'Adv. X', confirm: true })).status === 409, 'legal approval only after internal review');
ok((await A('POST', `/api/admin/legal/docs/${draft.id}/internal-approve`, {})).data.status === 'legal_review', 'internal review passed → legal review');
ok((await A('PUT', `/api/admin/legal/docs/${draft.id}`, { title: 'x', body: 'y'.repeat(60), version: '2.0' })).status === 409, 'cannot edit while in legal review');
ok((await A('POST', `/api/admin/legal/docs/${draft.id}/approve`, { reviewer: '' })).status === 400, 'approval needs the reviewer and a confirmation');
r = await A('POST', `/api/admin/legal/docs/${draft.id}/approve`, { reviewer: 'Adv. Meera Iyer, Iyer & Associates', confirm: true });
ok(r.data.status === 'approved' && r.data.legal_reviewer.startsWith('Adv.'), 'approved by legal review (reviewer recorded)');
mine = (await C('GET', '/api/account/legal')).data;
ok(mine.pending.length === 0, 'an approved (not yet published) version is not shown to customers');
r = await A('POST', `/api/admin/legal/docs/${draft.id}/publish`, { material: true });
ok(r.data.status === 'published' && r.data.legal_approved, 'version 2.0 published (material change)');
mine = (await C('GET', '/api/account/legal')).data;
ok(mine.pending.length === 1 && mine.pending[0].version === '2.0', 'customer must accept the new privacy version');
r = await C('POST', '/api/orders', orderBody);
ok(r.status === 409 && r.data.code === 'TERMS_PENDING', 'order blocked until the new version is accepted');
ok((await C('POST', '/api/account/legal/accept', { consents: {} })).status === 400, 'accepting needs the box ticked');
r = await C('POST', '/api/account/legal/accept', { consents: { privacy: true } });
ok(r.data.accepted.length === 1 && (await C('POST', '/api/orders', orderBody)).status === 201, 'accepted 2.0 → ordering works again');
mine = (await C('GET', '/api/account/legal')).data;
ok(mine.items.filter((x) => x.kind === 'privacy').map((x) => x.version).join(',') === '2.0,1.0', 'history keeps both privacy versions');

// ---------------- dealer self-registration & onboarding
const D = client(); await D('GET', '/api/health');
r = await D('POST', '/api/dealer/register', { business_name: 'Laxmi Brass House', name: 'Raj Mehta', phone: '9822001122', email: 'raj@laxmibrass.example', password: 'Pital#Diya-2026', confirm_password: 'Pital#Diya-2026' });
ok(r.status === 201 && r.data.dealer.onboarding_status === 'draft' && !r.data.dealer.can_receive_orders, 'dealer registers → Draft, cannot receive orders');
let ob = (await D('GET', '/api/dealer/onboarding')).data;
ok(ob.progress.current === 'business' && ob.steps.length === 7, 'onboarding starts at step 1 of 7');
ok((await D('POST', '/api/dealer/products', new FormData())).status === 403, 'cannot add products before approval');
r = await D('PUT', '/api/dealer/onboarding/business', { business_name: 'Laxmi Brass House', legal_name: '', business_type: 'x', name: 'Raj', email: 'bad', registered_address: '', address: '', city: '', state: '', pincode: '12' });
ok(r.status === 400 && r.data.fields.legal_name && r.data.fields.business_type && r.data.fields.pincode, 'business details validated');
const biz = { business_name: 'Laxmi Brass House', legal_name: 'Laxmi Brass House Private Limited', business_type: 'private_limited', name: 'Raj Mehta', email: 'raj@laxmibrass.example', registered_address: '21 Ravivar Peth', address: '21 Ravivar Peth', city: 'Pune', state: 'Maharashtra', pincode: '411002', country: 'India', website: '' };
ob = (await D('PUT', '/api/dealer/onboarding/business', biz)).data;
ok(ob.progress.done.business && ob.required.includes('registration_certificate') && ob.required.includes('authorization_letter'), 'company → certificate + authorisation letter required');
r = await D('PUT', '/api/dealer/onboarding/kyc', { pan: 'ABCDE1234F', gstin: '27ABCDE9999F1Z5', bank_name: 'HDFC Bank', bank_holder: 'Laxmi Brass House Pvt Ltd', bank_account: '50100012345678', bank_account_confirm: '50100012345678', ifsc: 'HDFC0001234' });
ok(r.status === 400 && r.data.fields.gstin && r.data.fields.cin, 'GSTIN must carry the same PAN; CIN required for a company');
ob = (await D('PUT', '/api/dealer/onboarding/kyc', { pan: 'abcde1234f', gstin: '27ABCDE1234F1Z5', cin: 'U52100MH2020PTC123456', bank_name: 'HDFC Bank', bank_holder: 'Laxmi Brass House Pvt Ltd', bank_account: '50100012345678', bank_account_confirm: '50100012345678', ifsc: 'hdfc0001234' })).data;
ok(ob.progress.done.kyc && ob.kyc.bank_account_masked === 'XXXX XXXX 5678' && !JSON.stringify(ob).includes('50100012345678'), 'KYC saved; bank account stored encrypted, shown masked');
ok(ob.required.includes('gst_certificate'), 'GSTIN given → GST certificate required');
r = await D('POST', '/api/dealer/onboarding/sign/otp');
ok(r.data.dev_otp, 'OTP can be requested');
ok((await D('POST', '/api/dealer/onboarding/sign', { typed_name: 'Raj Mehta', capacity: 'Director', authorised: true, signature_png: SIG, otp: r.data.dev_otp, checks: { read: true, agree: true, accurate: true, verify: true, esign: true } })).status === 409, 'cannot sign before the required documents are uploaded');
const fakeExe = new FormData(); fakeExe.append('doc_type', 'pan_card'); fakeExe.append('file', file(Buffer.from('MZ fake exe'), 'pan.pdf', 'application/pdf'));
ok((await D('POST', '/api/dealer/onboarding/documents', fakeExe)).status === 400, 'a file that is not really a PDF/JPG/PNG is refused');
for (const t of ob.required) {
  const f = new FormData(); f.append('doc_type', t); if (t === 'pan_card') f.append('doc_number', 'ABCDE1234F');
  f.append('file', t === 'address_proof' ? file(PNG, 'bill.png', 'image/png') : file(PDF, `${t}.pdf`, 'application/pdf'));
  r = await D('POST', '/api/dealer/onboarding/documents', f);
  if (r.status !== 201) { console.error(r.data); process.exit(1); }
}
ob = r.data;
ok(ob.progress.done.documents && ob.documents.every((x) => x.status === 'pending'), `all ${ob.required.length} required documents uploaded (pending check)`);
ok((await D('GET', `/api/dealer/onboarding/documents/${ob.documents[0].id}/file`)).status === 200, 'dealer can view its own uploaded file');
const ag = (await D('GET', '/api/dealer/onboarding/agreement')).data;
ok(ag.docs.length === 2 && ag.docs[0].body.includes('Laxmi Brass House Private Limited') && ag.docs[0].body.includes('Model: Supply') && ag.checks.length === 4 && ag.dealer_name === 'Raj Mehta' && ag.business_name.includes('Laxmi'), 'agreement filled with dealer details + supply commercial schedule');
ok(!/selling price is|margin of|profit of/i.test(ag.docs[0].body.replace(/customer selling price, the Platform's margin and its pricing calculations are confidential/, '')), 'agreement does not reveal selling price or margin');
const prev = await D('GET', '/api/dealer/onboarding/agreement/pdf');
ok(prev.status === 200 && prev.data.slice(0, 5).toString() === '%PDF-', 'agreement preview PDF for download/print');
const getOtp = async () => { for (;;) { const x = await D('POST', '/api/dealer/onboarding/sign/otp'); if (x.status === 200) return x.data; await new Promise((res) => setTimeout(res, 3000)); } };
const otp2 = await getOtp();
ok(/^\d{6}$/.test(otp2.dev_otp) && otp2.sent_to.endsWith('1122'), 'OTP sent to the registered mobile (30 s between requests)');
const signBody = { typed_name: 'Raj Mehta', capacity: 'Director', authorised: true, signature_png: SIG, otp: otp2.dev_otp === '000000' ? '111111' : '000000', checks: { read: true, agree: true, accurate: true, verify: true, esign: true } };
r = await D('POST', '/api/dealer/onboarding/sign', signBody);
ok(r.status === 400 && r.data.fields.otp, 'wrong OTP refused');
r = await D('POST', '/api/dealer/onboarding/sign', { ...signBody, otp: otp2.dev_otp, checks: { read: true } });
ok(r.status === 400, 'all five boxes must be ticked');
r = await D('POST', '/api/dealer/onboarding/sign', { ...signBody, otp: otp2.dev_otp });
ok(r.status === 200 && r.data.refs.length === 2 && r.data.status === 'under_review', 'signed with name + drawn signature + OTP → Under review');
const myAg = (await D('GET', '/api/dealer/legal')).data;
const dl = (await D('GET', '/api/dealer/legal/docs')).data;
ok(dl.docs.map((x) => x.kind).join(',') === 'dealer_agreement,marketplace_policy,commercial,privacy,refund_cancellation', 'dealer Legal & Agreements lists agreement, T&C, commercial terms, privacy and refund policy');
ok((await D('GET', '/api/dealer/legal/doc/marketplace_policy/pdf')).data.slice(0, 5).toString() === '%PDF-', 'dealer can download any of them as PDF');
ok(myAg.items.length === 2 && myAg.items.every((x) => x.current && x.signature.typed_name === 'Raj Mehta'), 'Legal & Compliance → My Agreements lists the signed versions');
const spdf = await D('GET', `/api/dealer/legal/${myAg.items[0].id}/pdf`);
ok(spdf.status === 200 && spdf.data.slice(0, 5).toString() === '%PDF-' && spdf.data.length > 3000, 'signed agreement PDF stored and downloadable');
ok((await D('PUT', '/api/dealer/onboarding/business', biz)).status === 409, 'details locked while under review');
ok((await D('POST', '/api/dealer/onboarding/sign', { ...signBody, otp: '123456' })).status === 409, 'cannot sign twice');

// ---------------- admin verification
const list = (await A('GET', '/api/admin/dealer-verification')).data;
const row = list.items.find((x) => x.business_name === 'Laxmi Brass House');
ok(row && row.status === 'under_review' && row.agreement === 'Signed' && row.documents === 'To check' && row.kyc === 'Complete', 'admin queue: under review, KYC complete, agreement signed, docs to check');
let det = (await A('GET', `/api/admin/dealer-verification/${row.id}`)).data;
ok(det.documents.length === ob.required.length && det.acceptances.length === 2 && det.audit.some((x) => x.action === 'dealer_signed'), 'detail: documents, signed agreements, audit history');
ok(!JSON.stringify(det).includes('50100012345678'), 'bank account masked for admins by default');
r = await A('POST', `/api/admin/dealer-verification/${row.id}/bank/reveal`);
ok(r.data.bank_account === '50100012345678', 'owner can reveal the account (logged)');
ok((await A('GET', `/api/admin/dealer-verification/${row.id}/documents/${det.documents[0].id}/file`)).status === 200, 'admin opens a document');
ok((await A('POST', `/api/admin/dealer-verification/${row.id}/action`, { action: 'approve' })).status === 409, 'cannot approve before documents are verified');
const pan = det.documents.find((x) => x.doc_type === 'pan_card');
ok((await A('POST', `/api/admin/dealer-verification/${row.id}/documents/${pan.id}`, { action: 'reject' })).status === 400, 'a rejection needs a reason');
await A('POST', `/api/admin/dealer-verification/${row.id}/documents/${pan.id}`, { action: 'reject', reason: 'Photo is blurred' });
ob = (await D('GET', '/api/dealer/onboarding')).data;
ok(ob.status === 'documents_rejected' && ob.documents.find((x) => x.id === pan.id).reject_reason === 'Photo is blurred', 'dealer sees: Documents rejected — Photo is blurred');
const f2 = new FormData(); f2.append('doc_type', 'pan_card'); f2.append('doc_number', 'ABCDE1234F'); f2.append('file', file(PDF, 'pan2.pdf', 'application/pdf'));
ob = (await D('POST', '/api/dealer/onboarding/documents', f2)).data;
ok(ob.status === 'under_review' && ob.progress.rejected.length === 0, 're-uploaded → back to Under review');
det = (await A('GET', `/api/admin/dealer-verification/${row.id}`)).data;
for (const x of det.documents.filter((y) => y.latest && y.status === 'pending')) await A('POST', `/api/admin/dealer-verification/${row.id}/documents/${x.id}`, { action: 'verify' });
r = await A('POST', `/api/admin/dealer-verification/${row.id}/action`, { action: 'approve' });
ok(r.status === 409 && /PIN codes/.test(r.data.error), 'approval needs the delivery area set first');
const cats = (await A('GET', '/api/categories')).data;
await A('PUT', `/api/admin/dealers/${row.id}`, { name: 'Raj Mehta', business_name: 'Laxmi Brass House', phone: '9822001122', email: 'raj@laxmibrass.example', address: '21 Ravivar Peth', city: 'Pune', state: 'Maharashtra', pincode: '411002', pincodes: '4110', category_ids: cats.map((c) => c.id) });
r = await A('POST', `/api/admin/dealer-verification/${row.id}/action`, { action: 'approve' });
ok(r.status === 200 && r.data.status === 'approved' && r.data.can_receive_orders, 'admin approves → Approved, can receive orders');
ok((await D('GET', '/api/dealer/me')).data.dealer.can_receive_orders, 'dealer app now shows the account as active');
r = await A('PUT', `/api/admin/dealer-verification/${row.id}/commercial`, { model: 'commission', commission_pct: 12, platform_fee: 20, settlement_days: 10 });
ok(r.data.resign, 'changing signed commercial terms asks the dealer to sign again');
ob = (await D('GET', '/api/dealer/onboarding')).data;
ok(ob.status === 'agreement_pending' && !ob.can_receive_orders, 'dealer: Agreement pending, orders paused');
const ag2 = (await D('GET', '/api/dealer/onboarding/agreement')).data;
ok(ag2.docs[0].body.includes('Marketplace commission: 12%'), 'new agreement shows the commission schedule');
const o3 = await getOtp();
r = await D('POST', '/api/dealer/onboarding/sign', { ...signBody, otp: o3.dev_otp || '' });
ok(r.status === 200 && (await D('GET', '/api/dealer/legal')).data.items.length === 4, 'dealer re-signs → 4 signed records (old ones kept)');
await A('POST', `/api/admin/dealer-verification/${row.id}/action`, { action: 'approve' });
r = await A('POST', `/api/admin/dealer-verification/${row.id}/action`, { action: 'suspend', reason: 'Repeated late dispatch' });
ok(r.data.status === 'suspended' && !r.data.can_receive_orders, 'suspend → no new orders');
ok((await A('POST', `/api/admin/dealer-verification/${row.id}/action`, { action: 'reinstate' })).data.status === 'approved', 'reinstate');

// ---------------- audit + stats
const audit = (await A('GET', `/api/admin/legal/audit?subject_type=dealer&subject_id=${row.id}`)).data.items.map((x) => x.action);
ok(['dealer_registered', 'dealer_doc_uploaded', 'dealer_otp_sent', 'dealer_otp_failed', 'dealer_signed', 'doc_rejected', 'doc_verified', 'bank_viewed', 'dealer_approved', 'commercial_updated', 'dealer_suspended'].every((a) => audit.includes(a)), 'audit trail records every step');
const stats = (await A('GET', '/api/admin/legal/stats')).data;
ok(stats.by_doc.some((x) => x.kind === 'privacy' && x.version === '2.0' && x.n === 1) && stats.dealers.approved >= 1, 'acceptance statistics per version');
ok((await C('GET', '/api/admin/legal/docs')).status === 401 && (await D('GET', '/api/admin/dealer-verification')).status === 401, 'customers and dealers cannot open admin legal screens');
const E = client(); await E('GET', '/api/health');
ok((await E('GET', `/api/dealer/legal/${myAg.items[0].id}/pdf`)).status === 401, "another session cannot download a dealer's agreement");
// ---------------- Legal & Compliance Center
let center = (await A('GET', '/api/admin/legal/center')).data;
ok(center.cards.length >= 31 && ['customer', 'dealer', 'company'].every((c) => center.cards.some((x) => x.category === c)), 'policy library: customer, dealer and company policies');
ok(center.cards.find((x) => x.kind === 'payment_policy').state === 'draft' && center.kpis.active >= 5, 'new policies start as drafts; core documents are live');
ok(center.checklist.length === 3 && center.checklist[1].items.some((i) => i.label === 'Account Health'), 'launch checklist covers customer, dealer and company areas');
ok(center.kpis.acceptance_rate !== null && center.cards.find((x) => x.kind === 'dealer_agreement').acceptance.required >= 1, 'acceptance rate across customers and dealers');
const pay = center.cards.find((x) => x.kind === 'payment_policy');
r = await A('POST', '/api/admin/legal/docs', { kind: 'payment_policy' });
ok(r.status === 409 && r.data.id === pay.working.id, 'a policy with a version in progress opens that version instead of a new one');
r = await A('PUT', `/api/admin/legal/docs/${pay.working.id}`, { title: 'Payment Policy', body: (await A('GET', `/api/admin/legal/docs/${pay.working.id}`)).data.body, version: '1.0', simple: 'How you pay and when a payment is confirmed.', owner_name: 'Finance team', next_review_at: '2027-04-01' });
ok(r.data.simple === 'How you pay and when a payment is confirmed.' && r.data.owner_name === 'Finance team', 'simple explanation + owner + review date saved');
for (const [step, body] of [['submit', {}], ['internal-approve', {}], ['approve', { reviewer: 'Adv. Meera Iyer', confirm: true }]]) await A('POST', `/api/admin/legal/docs/${pay.working.id}/${step}`, body);
const future = new Date(Date.now() + 10 * 864e5).toISOString().slice(0, 10);
r = await A('POST', `/api/admin/legal/docs/${pay.working.id}/publish`, { effective_at: future });
ok(r.data.status === 'published', 'payment policy published with a future date');
center = (await A('GET', '/api/admin/legal/center')).data;
ok(center.cards.find((x) => x.kind === 'payment_policy').state === 'scheduled', 'future publication shows as Scheduled');
ok(!(await G('GET', '/api/legal/policies')).data.items.some((x) => x.kind === 'payment_policy'), 'scheduled policy is not public yet');
const wiz = await A('POST', '/api/admin/legal/docs', { title: 'Festival Gift Card Policy', category: 'customer', description: 'Rules for festival gift cards', owner_name: 'Mohit', simple: 'How gift cards work and when they expire.', start: 'blank', submit: true });
ok(wiz.status === 201 && wiz.data.kind.startsWith('custom_') && wiz.data.status === 'internal_review' && wiz.data.created_by_name, 'wizard creates a custom policy and sends it for internal review');
r = await A('POST', `/api/admin/legal/docs/${wiz.data.id}/return`, { note: 'Add the expiry period' });
ok(r.data.status === 'changes_requested' && (await A('PUT', `/api/admin/legal/docs/${wiz.data.id}`, { title: 'Festival Gift Card Policy', body: `${wiz.data.body}\nGift cards expire after one year.`.padEnd(80, ' '), version: '1.0' })).status === 200, 'changes requested → editable again');
const hist = (await A('GET', `/api/admin/legal/kinds/${wiz.data.kind}`)).data;
ok(hist.versions.length === 1 && hist.audit.some((a) => a.action === 'version_returned' && a.actor_name), 'version history with who did what');
const notices = (await A('GET', '/api/admin/legal/notices')).data.items;
ok(notices.some((n) => /ready for publication/.test(n.title)) && notices.some((n) => n.audience === 'customer'), 'notifications: ready for publication + customer notice on publish');
// account health, violations, documents, calendar
const prof = (await A('GET', '/api/admin/legal/dealers')).data;
const mineRow = prof.items.find((x) => x.id === row.id);
ok(mineRow && mineRow.agreement_status === 'signed_current' && mineRow.health.status && mineRow.kyc === 'complete', 'dealer legal profile: agreement, KYC, health');
r = await A('POST', '/api/admin/legal/violations', { dealer_id: row.id, type: 'fraud', severity: 'critical', description: 'Same customer paid with several cards that failed' });
ok(r.status === 201 && r.data.status === 'open', 'violation opened');
const vid = r.data.id;
ok((await A('GET', `/api/admin/legal/dealers/${row.id}/health`)).data.health.status === 'restricted', 'open fraud flag → account health Restricted');
ok((await D('GET', '/api/dealer/legal')).data.violations.length === 1 && (await D('GET', '/api/dealer/dashboard')).data.notifications.some((n) => /Policy issue/.test(n.text)), 'dealer sees the violation and a notification');
ok((await A('POST', `/api/admin/legal/violations/${vid}/action`, { action: 'request_correction' })).status === 400, 'actions need a message');
r = await A('POST', `/api/admin/legal/violations/${vid}/action`, { action: 'request_correction', note: 'Explain the failed payments within 7 days' });
ok(r.data.status === 'correction_requested' && r.data.history.length === 2, 'correction requested and logged');
r = await A('POST', `/api/admin/legal/violations/${vid}/action`, { action: 'close', note: 'Bank confirmed customer error' });
ok(r.data.status === 'closed' && (await A('GET', `/api/admin/legal/dealers/${row.id}/health`)).data.health.status !== 'restricted', 'closing the violation clears the fraud flag');
r = await A('PUT', '/api/admin/legal/health-rules', { window_days: 60, min_orders: 3, ship_hours: 24, thresholds: { cancellation_rate: [2, 4, 8] } });
ok(r.data.rules.window_days === 60 && r.data.rules.thresholds.cancellation_rate[2] === 8 && r.data.rules.thresholds.fraud[2] === 1, 'health rules saved (others keep defaults)');
const dc = (await A('GET', '/api/admin/legal/documents')).data;
ok(dc.items.length > 0 && 'expiring' in dc.summary, 'KYC & document compliance list');
ok((await A('POST', `/api/admin/legal/documents/${dc.items[0].id}/remind`)).data.ok, 'reminder sent to dealer');
const cal = (await A('GET', '/api/admin/legal/calendar')).data.items;
ok(cal.some((e) => e.type === 'publish') && cal.some((e) => e.type === 'renewal'), 'legal calendar: scheduled publication + agreement review');
const rep = (await A('GET', '/api/admin/legal/acceptance/report')).data.rows;
ok(rep.length > 3 && rep[0][0] === 'Agreement no.', 'acceptance report for export');
const ppl = (await A('GET', '/api/admin/legal/acceptance/privacy/people?status=accepted')).data;
ok(ppl.items.some((p) => p.email === 'kavita@example.com'), 'who accepted a document');
const pubs = (await G('GET', '/api/legal/policies')).data.items;
ok(pubs.length >= 3 && !pubs.some((x) => x.category === 'dealer'), 'public policy list: only published customer & company policies');
ok((await G('GET', '/api/legal/policy/dealer_agreement')).status === 404, 'dealer documents are not public');

// ---------------- admin user manual (kept behind admin sign-in)
ok((await G('GET', '/api/admin/manual/Admin_User_Manual.pdf')).status === 401, 'admin manual PDF is not public');
const man = await A('GET', '/api/admin/manual/Admin_User_Manual.pdf');
ok(man.status === 200 && man.data.slice(0, 5).toString() === '%PDF-', 'signed-in admin can open the Admin User Manual PDF');
ok((await A('GET', '/api/admin/manual/img/a_dashboard.webp')).status === 200, 'admin manual screenshots load for admins');
ok((await A('GET', '/api/admin/manual/..%2F..%2Fpackage.json')).status === 404, 'manual route only serves manual files');

console.log('\nLegal onboarding checks passed 🎉');
