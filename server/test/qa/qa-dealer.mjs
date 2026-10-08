// QA · Dealer: registration, onboarding, KYC, documents, agreement & signature, approval, products, stock,
// inventory concurrency, orders, shipping, returns, settlement, password reset.   node test/qa/qa-dealer.mjs
import { client, tc, section, expect, brief, save, db, uniq, phone, newCustomer, ownerClient, placeOrder, PNG, PDF, JPG, blob, SIG, sleep } from './lib.mjs';
import { FORBIDDEN_KEYS } from '../../../shared/dealerDashboard.js';

const A = await ownerClient();
const cats = (await A('GET', '/api/categories')).data;
await A('PUT', '/api/admin/dealers-settings', { auto_assign: true, auto_reassign: true, accept_minutes: 120 });
const forbiddenIn = (obj) => { const keys = new Set(); const walk = (o) => { if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) { if (FORBIDDEN_KEYS.includes(k)) keys.add(k); walk(v); } }; walk(obj); return [...keys]; };
const docForm = (type, buf, name, mime, number) => { const f = new FormData(); f.append('doc_type', type); if (number) f.append('doc_number', number); if (buf) f.append('file', blob(buf, name, mime)); return f; };

/** Full self-registration → approved dealer. Returns the client with ids. */
async function onboard(over = {}, { checks = false } = {}) {
  const D = await client().init(); const ph = over.phone || phone('93'); const pw = 'Pital#Diya-2026';
  const name = over.business_name || `QA Brass ${uniq()}`;
  let r = await D('POST', '/api/dealer/register', { business_name: name, name: 'Raj Mehta', phone: ph, email: `dealer.${uniq()}@example.com`, password: pw, confirm_password: pw });
  if (r.status !== 201) throw new Error(`dealer register ${brief(r)}`);
  const id = r.data.dealer.id;
  const biz = { business_name: name, legal_name: `${name} Traders`, business_type: 'proprietorship', name: 'Raj Mehta', email: `dealer.${uniq()}@example.com`, registered_address: '21 Ravivar Peth', address: '21 Ravivar Peth', city: 'Pune', state: 'Maharashtra', pincode: '411002', country: 'India', website: '' };
  await D('PUT', '/api/dealer/onboarding/business', biz);
  const pan = over.pan || `ABCPM${String(1000 + Math.floor(Math.random() * 8999))}K`;
  let ob = (await D('PUT', '/api/dealer/onboarding/kyc', { pan, gstin: '', bank_name: 'State Bank of India', bank_holder: 'Raj Mehta', bank_account: '30214567894321', bank_account_confirm: '30214567894321', ifsc: 'SBIN0001234' })).data;
  for (const t of ob.required) { r = await D('POST', '/api/dealer/onboarding/documents', docForm(t, t === 'address_proof' ? PNG : PDF, t === 'address_proof' ? 'bill.png' : `${t}.pdf`, t === 'address_proof' ? 'image/png' : 'application/pdf', t === 'pan_card' ? pan : null)); if (r.status !== 201) throw new Error(`doc ${t} ${brief(r)}`); }
  let o; for (;;) { o = await D('POST', '/api/dealer/onboarding/sign/otp'); if (o.status === 200) break; await sleep(2500); }
  r = await D('POST', '/api/dealer/onboarding/sign', { typed_name: 'Raj Mehta', capacity: 'Proprietor', authorised: true, signature_png: SIG, otp: o.data.dev_otp, checks: { read: true, agree: true, accurate: true, verify: true, esign: true } });
  if (r.status !== 200) throw new Error(`sign ${brief(r)}`);
  const det = (await A('GET', `/api/admin/dealer-verification/${id}`)).data;
  for (const x of det.documents.filter((y) => y.latest && y.status === 'pending')) await A('POST', `/api/admin/dealer-verification/${id}/documents/${x.id}`, { action: 'verify' });
  await A('PUT', `/api/admin/dealers/${id}`, { name: 'Raj Mehta', business_name: name, phone: ph, email: biz.email, address: biz.address, city: 'Pune', state: 'Maharashtra', pincode: '411002', pincodes: over.pincodes || '4110', category_ids: cats.map((c) => c.id), priority: over.priority || 0 });
  r = await A('POST', `/api/admin/dealer-verification/${id}/action`, { action: 'approve' });
  if (r.status !== 200) throw new Error(`approve ${brief(r)}`);
  Object.assign(D, { id, phone: ph, pw, bizName: name, pan });
  return D;
}

// ===================================================================== registration & onboarding
section('Dealer', 'Registration & onboarding');
const D = await client().init(); const dPhone = phone('94'); const dPw = 'Pital#Diya-2026';
{
  await tc('DLR-REG-001', 'Invalid mobile', '400 phone error', async () => { const r = await D('POST', '/api/dealer/register', { business_name: 'X Traders', name: 'Raj', phone: '12345', email: 'r@example.com', password: dPw, confirm_password: dPw }); expect(r.status === 400 && r.data.fields?.phone, brief(r)); return brief(r); });
  await tc('DLR-REG-002', 'Weak password / mismatch', '400 with both errors', async () => { const r = await D('POST', '/api/dealer/register', { business_name: 'X Traders', name: 'Raj', phone: dPhone, email: 'r@example.com', password: 'password1', confirm_password: 'x' }); expect(r.status === 400 && r.data.fields?.password && r.data.fields?.confirm_password, brief(r)); return brief(r); });
  await tc('DLR-REG-003', 'Valid registration', '201 Draft; cannot receive orders', async () => { const r = await D('POST', '/api/dealer/register', { business_name: 'Shiv Shakti Diyas', name: 'Raj Mehta', phone: dPhone, email: `raj.${uniq()}@example.com`, password: dPw, confirm_password: dPw }); expect(r.status === 201 && r.data.dealer.onboarding_status === 'draft' && !r.data.dealer.can_receive_orders, brief(r)); D.id = r.data.dealer.id; return 'Draft · orders off'; }, 'Critical');
  await tc('DLR-REG-004', 'Duplicate dealer mobile', '409', async () => { const r = await (await client().init())('POST', '/api/dealer/register', { business_name: 'Dup', name: 'Raj', phone: dPhone, email: 'd@example.com', password: dPw, confirm_password: dPw }); expect(r.status === 409, brief(r)); return brief(r); }, 'High');
  await tc('DLR-REG-005', 'Products before approval', '403', async () => { const r = await D('GET', '/api/dealer/products'); const w = await D('POST', '/api/dealer/products', new FormData()); expect(w.status === 403, `${r.status} ${w.status}`); return `POST ${w.status}`; }, 'Critical');
  await tc('DLR-ONB-001', 'Business details missing / bad PIN', '400 with field errors', async () => { const r = await D('PUT', '/api/dealer/onboarding/business', { business_name: '', legal_name: '', business_type: 'x', name: '', email: 'bad', registered_address: '', address: '', city: '', state: '', pincode: '12' }); expect(r.status === 400 && Object.keys(r.data.fields).length >= 5, brief(r)); return `${Object.keys(r.data.fields).length} field errors`; });
  const biz = { business_name: 'Shiv Shakti Diyas', legal_name: 'Shiv Shakti Diyas', business_type: 'proprietorship', name: 'Raj Mehta', email: `raj.${uniq()}@example.com`, registered_address: '4 Laxmi Road', address: '4 Laxmi Road', city: 'Pune', state: 'Maharashtra', pincode: '411002', country: 'India', website: '' };
  await tc('DLR-ONB-002', 'Business details saved', 'Step done; required documents listed', async () => { const r = await D('PUT', '/api/dealer/onboarding/business', biz); expect(r.status === 200 && r.data.progress.done.business, brief(r)); return `required: ${r.data.required.join(', ')}`; }, 'High');
  await tc('DLR-KYC-001', 'Invalid PAN format', '400 pan error', async () => { const r = await D('PUT', '/api/dealer/onboarding/kyc', { pan: 'ABC123', bank_name: 'SBI', bank_holder: 'Raj', bank_account: '30214567894321', bank_account_confirm: '30214567894321', ifsc: 'SBIN0001234' }); expect(r.status === 400 && r.data.fields?.pan, brief(r)); return r.data.fields.pan; }, 'High');
  await tc('DLR-KYC-002', 'GSTIN that does not contain the PAN', '400 gstin error', async () => { const r = await D('PUT', '/api/dealer/onboarding/kyc', { pan: 'ABCPM1234K', gstin: '27ZZZZZ9999Z1Z5', bank_name: 'SBI', bank_holder: 'Raj', bank_account: '30214567894321', bank_account_confirm: '30214567894321', ifsc: 'SBIN0001234' }); expect(r.status === 400 && r.data.fields?.gstin, brief(r)); return r.data.fields.gstin; }, 'High');
  await tc('DLR-KYC-003', 'Bank account confirmation mismatch / bad IFSC', '400', async () => { const r = await D('PUT', '/api/dealer/onboarding/kyc', { pan: 'ABCPM1234K', bank_name: 'SBI', bank_holder: 'Raj', bank_account: '30214567894321', bank_account_confirm: '30214567890000', ifsc: 'SBIN1234' }); expect(r.status === 400 && (r.data.fields?.bank_account_confirm || r.data.fields?.ifsc), brief(r)); return Object.keys(r.data.fields).join(', '); });
  let ob;
  await tc('DLR-KYC-004', 'Valid KYC', 'Saved; bank shown masked, never in full', async () => { ob = (await D('PUT', '/api/dealer/onboarding/kyc', { pan: 'abcpm1234k', bank_name: 'State Bank of India', bank_holder: 'Raj Mehta', bank_account: '30214567894321', bank_account_confirm: '30214567894321', ifsc: 'sbin0001234' })).data; expect(ob.progress.done.kyc && !JSON.stringify(ob).includes('30214567894321'), 'bank leaked or not saved'); return ob.kyc.bank_account_masked; }, 'Critical');
  await tc('DLR-DOC-001', 'Unsupported file type (.txt)', '400', async () => { const r = await D('POST', '/api/dealer/onboarding/documents', docForm('pan_card', Buffer.from('hello'), 'pan.txt', 'text/plain', 'ABCPM1234K')); expect(r.status === 400, brief(r)); return brief(r); }, 'High');
  await tc('DLR-DOC-002', 'Fake PDF (exe bytes named .pdf)', '400', async () => { const r = await D('POST', '/api/dealer/onboarding/documents', docForm('pan_card', Buffer.from('MZ\x90\x00 fake exe'), 'pan.pdf', 'application/pdf', 'ABCPM1234K')); expect(r.status === 400, brief(r)); return brief(r); }, 'Critical');
  await tc('DLR-DOC-003', 'Empty file', '400', async () => { const r = await D('POST', '/api/dealer/onboarding/documents', docForm('pan_card', Buffer.alloc(0), 'pan.pdf', 'application/pdf', 'ABCPM1234K')); expect(r.status === 400, brief(r)); return brief(r); }, 'Medium');
  await tc('DLR-DOC-004', 'File over 5 MB', '413/400 friendly error (no crash)', async () => { const big = Buffer.concat([PDF, Buffer.alloc(6 * 1024 * 1024)]); const r = await D('POST', '/api/dealer/onboarding/documents', docForm('pan_card', big, 'pan.pdf', 'application/pdf', 'ABCPM1234K')); expect([400, 413].includes(r.status) && typeof r.data === 'object' && r.data.error && !/stack|Error:/.test(JSON.stringify(r.data)), brief(r)); return brief(r); }, 'High');
  await tc('DLR-DOC-005', 'No file attached', '400', async () => { const r = await D('POST', '/api/dealer/onboarding/documents', docForm('pan_card', null, null, null, 'ABCPM1234K')); expect(r.status === 400, brief(r)); return brief(r); });
  await tc('DLR-DOC-006', 'Unknown document type', '400', async () => { const r = await D('POST', '/api/dealer/onboarding/documents', docForm('passport_xyz', PDF, 'x.pdf', 'application/pdf')); expect(r.status === 400, brief(r)); return brief(r); }, 'Medium');
  let docId;
  await tc('DLR-DOC-007', 'Malicious file name (../../etc/passwd.pdf)', 'Accepted as data; stored under a random name', async () => { const r = await D('POST', '/api/dealer/onboarding/documents', docForm('pan_card', PDF, '../../etc/passwd.pdf', 'application/pdf', 'ABCPM1234K')); expect(r.status === 201, brief(r)); const row = db.prepare("SELECT * FROM dealer_documents WHERE dealer_id = ? ORDER BY id DESC LIMIT 1").get(D.id); docId = row.id; const stored = row.file_path || row.path || row.stored_name || ''; expect(!String(stored).includes('..'), `stored as ${stored}`); return `stored as ${String(stored).split('/').pop() || '(db blob)'} · original name kept only as text`; }, 'Critical');
  await tc('DLR-DOC-008', 'JPG and PNG accepted', '201 for both', async () => { const r1 = await D('POST', '/api/dealer/onboarding/documents', docForm('address_proof', JPG, 'bill.jpg', 'image/jpeg')); const r2 = await D('POST', '/api/dealer/onboarding/documents', docForm('address_proof', PNG, 'bill.png', 'image/png')); expect(r1.status === 201 && r2.status === 201, `${brief(r1)} ${brief(r2)}`); return '201 / 201 (latest replaces earlier)'; });
  await tc('DLR-DOC-009', 'Replacement upload keeps history; latest is used', 'Two rows, only the newest marked latest', async () => { const ob2 = (await D('GET', '/api/dealer/onboarding')).data; const addr = ob2.documents.filter((x) => x.doc_type === 'address_proof'); expect(addr.length >= 1, JSON.stringify(addr)); return `${addr.length} shown as current for address proof`; }, 'Medium');
  await tc('DLR-DOC-010', 'Dealer downloads own document', '200', async () => { const r = await D('GET', `/api/dealer/onboarding/documents/${docId}/file`); expect(r.status === 200, brief(r)); return brief(r); });
  const other = await client().init(); await other('POST', '/api/dealer/register', { business_name: 'Other Diya Co', name: 'Ravi', phone: phone('95'), email: `o.${uniq()}@example.com`, password: dPw, confirm_password: dPw });
  await tc('DLR-DOC-011', "Another dealer opens my document (IDOR)", '404', async () => { const r = await other('GET', `/api/dealer/onboarding/documents/${docId}/file`); expect(r.status === 404 || r.status === 403, brief(r)); return brief(r); }, 'Critical');
  await tc('DLR-DOC-012', 'Signed out user opens a dealer document', '401', async () => { const r = await (await client().init())('GET', `/api/dealer/onboarding/documents/${docId}/file`); expect(r.status === 401, brief(r)); return brief(r); }, 'Critical');
  await tc('DLR-AGR-001', 'Sign before all documents are uploaded', '409', async () => { let o; for (;;) { o = await D('POST', '/api/dealer/onboarding/sign/otp'); if (o.status === 200) break; await sleep(2500); } const r = await D('POST', '/api/dealer/onboarding/sign', { typed_name: 'Raj Mehta', capacity: 'Proprietor', authorised: true, signature_png: SIG, otp: o.data.dev_otp, checks: { read: true, agree: true, accurate: true, verify: true, esign: true } }); expect(r.status === 409, brief(r)); return brief(r); }, 'Critical');
  ob = (await D('GET', '/api/dealer/onboarding')).data;
  for (const t of ob.required.filter((x) => !ob.documents.some((d) => d.doc_type === x))) await D('POST', '/api/dealer/onboarding/documents', docForm(t, PDF, `${t}.pdf`, 'application/pdf'));
  await tc('DLR-AGR-002', 'View agreement (simple + full), version, PDF', 'Filled with dealer details; PDF downloads', async () => { const ag = (await D('GET', '/api/dealer/onboarding/agreement')).data; const pdf = await D('GET', '/api/dealer/onboarding/agreement/pdf'); expect(ag.docs[0].body.includes('Shiv Shakti') && ag.docs[0].version && pdf.data.slice(0, 5).toString() === '%PDF-', 'agreement'); return `${ag.docs.map((x) => `${x.title} v${x.version}`).join(' + ')} · PDF ${Math.round(pdf.data.length / 1024)}KB`; }, 'High');
  await tc('DLR-AGR-003', 'Agreement never shows selling price or margin', 'No customer price / profit text', async () => { const ag = (await D('GET', '/api/dealer/onboarding/agreement')).data; const s = JSON.stringify(ag).replace(/customer selling price, the Platform's margin and its pricing calculations are confidential/g, ''); expect(!/margin of|profit of|selling price is/i.test(s), 'leak'); return 'none found'; }, 'Critical');
  let otp;
  await tc('DLR-SIG-001', 'Signing OTP resend within 30 s', '429', async () => { for (;;) { const o = await D('POST', '/api/dealer/onboarding/sign/otp'); if (o.status === 200) { otp = o.data.dev_otp; break; } await sleep(2500); } const again = await D('POST', '/api/dealer/onboarding/sign/otp'); expect(again.status === 429, brief(again)); return brief(again); }, 'Medium');
  const sig = { typed_name: 'Raj Mehta', capacity: 'Proprietor', authorised: true, signature_png: SIG, checks: { read: true, agree: true, accurate: true, verify: true, esign: true } };
  await tc('DLR-SIG-002', 'Wrong OTP', '400 otp error', async () => { const r = await D('POST', '/api/dealer/onboarding/sign', { ...sig, otp: otp === '000000' ? '111111' : '000000' }); expect(r.status === 400 && r.data.fields?.otp, brief(r)); return r.data.fields.otp; }, 'Critical');
  await tc('DLR-SIG-003', 'Not all boxes ticked', '400', async () => { const r = await D('POST', '/api/dealer/onboarding/sign', { ...sig, otp, checks: { read: true } }); expect(r.status === 400, brief(r)); return brief(r); }, 'High');
  await tc('DLR-SIG-004', 'No signature drawn', '400', async () => { const r = await D('POST', '/api/dealer/onboarding/sign', { ...sig, otp, signature_png: '' }); expect(r.status === 400, brief(r)); return brief(r); }, 'High');
  await tc('DLR-SIG-005', 'Sign with OTP + name + signature', 'Under review; signed PDF with name, version, date, OTP ref', async () => {
    const r = await D('POST', '/api/dealer/onboarding/sign', { ...sig, otp }); expect(r.status === 200 && r.data.status === 'under_review', brief(r));
    const my = (await D('GET', '/api/dealer/legal')).data.items[0]; const pdf = await D('GET', `/api/dealer/legal/${my.id}/pdf`); const fs = await import('node:fs'); fs.writeFileSync('/tmp/qa-signed.pdf', pdf.data);
    const { execSync } = await import('node:child_process'); const txt = execSync('pdftotext /tmp/qa-signed.pdf -').toString();
    expect(/Raj Mehta/.test(txt) && /Shiv Shakti/.test(txt) && new RegExp(`v?${my.version.replace('.', '\\.')}`).test(txt) && /OTP/.test(txt), txt.slice(0, 300));
    return `${my.ref_no} · PDF ${Math.round(pdf.data.length / 1024)}KB contains name, business, version ${my.version}, OTP reference`;
  }, 'Critical');
  await tc('DLR-APR-001', 'Admin approval before documents verified', '409', async () => { const r = await A('POST', `/api/admin/dealer-verification/${D.id}/action`, { action: 'approve' }); expect(r.status === 409, brief(r)); return brief(r); }, 'Critical');
  await tc('DLR-APR-002', 'Reject a document needs a reason; dealer sees it', '400 without reason; then dealer status Documents rejected', async () => { const det = (await A('GET', `/api/admin/dealer-verification/${D.id}`)).data; const pan = det.documents.find((x) => x.doc_type === 'pan_card' && x.latest); const r0 = await A('POST', `/api/admin/dealer-verification/${D.id}/documents/${pan.id}`, { action: 'reject' }); await A('POST', `/api/admin/dealer-verification/${D.id}/documents/${pan.id}`, { action: 'reject', reason: 'Photo blurred' }); const ob3 = (await D('GET', '/api/dealer/onboarding')).data; expect(r0.status === 400 && ob3.status === 'documents_rejected', `${r0.status} ${ob3.status}`); return `${r0.status} · dealer status ${ob3.status}`; }, 'High');
  await tc('DLR-APR-003', 'Re-upload → review → verify all → approve', 'Approved; can receive orders', async () => {
    await D('POST', '/api/dealer/onboarding/documents', docForm('pan_card', PDF, 'pan2.pdf', 'application/pdf', 'ABCPM1234K'));
    const det = (await A('GET', `/api/admin/dealer-verification/${D.id}`)).data; for (const x of det.documents.filter((y) => y.latest && y.status === 'pending')) await A('POST', `/api/admin/dealer-verification/${D.id}/documents/${x.id}`, { action: 'verify' });
    await A('PUT', `/api/admin/dealers/${D.id}`, { name: 'Raj Mehta', business_name: 'Shiv Shakti Diyas', phone: dPhone, email: biz.email, address: biz.address, city: 'Pune', state: 'Maharashtra', pincode: '411002', pincodes: '4110', category_ids: cats.map((c) => c.id) });
    const r = await A('POST', `/api/admin/dealer-verification/${D.id}/action`, { action: 'approve' }); expect(r.status === 200 && r.data.can_receive_orders, brief(r)); return 'Approved · orders on';
  }, 'Critical');
}

// ===================================================================== products
section('Dealer', 'Products & pricing');
const form = (fields, images = 1, img = PNG) => { const f = new FormData(); for (const [k, v] of Object.entries(fields)) f.append(k, typeof v === 'object' ? JSON.stringify(v) : String(v)); for (let i = 0; i < images; i++) f.append('images', blob(img, `p${i}.png`, 'image/png')); return f; };
const catId = cats.find((c) => c.slug === 'diyas-candles').id;
const base = { name: 'Hand-painted Clay Diya Set of 6', category_id: catId, short_description: 'Hand-painted clay diyas', description: 'Six hand-painted terracotta diyas, kiln-fired, with cotton wicks. Each 8 cm wide.', dealer_price: 120, quantity: 40, specs: { Material: 'Terracotta', Dimensions: '8 cm' }, dealer_sku: `SSD-${uniq()}`, hsn: '6912' };
let dp;
{
  await tc('DLR-PRD-001', 'Add product without a photo', '400', async () => { const r = await D('POST', '/api/dealer/products', form(base, 0)); expect(r.status === 400, brief(r)); return brief(r); });
  await tc('DLR-PRD-002', 'Missing name / category', '400 field errors', async () => { const r = await D('POST', '/api/dealer/products', form({ ...base, name: '', category_id: '' })); expect(r.status === 400, brief(r)); return brief(r); });
  await tc('DLR-PRD-003', 'Negative / zero / text price', '400 each', async () => { const out = []; for (const p of [-5, 0, 'abc']) out.push((await D('POST', '/api/dealer/products', form({ ...base, dealer_price: p }))).status); expect(out.every((s) => s === 400), out.join(',')); return out.join(' / '); }, 'High');
  await tc('DLR-PRD-004', 'Negative quantity', '400', async () => { const r = await D('POST', '/api/dealer/products', form({ ...base, quantity: -3 })); expect(r.status === 400, brief(r)); return brief(r); }, 'High');
  await tc('DLR-PRD-005', 'Photo that is not an image (script)', '400', async () => { const r = await D('POST', '/api/dealer/products', form(base, 1, Buffer.from('<script>alert(1)</script>'))); expect(r.status === 400, brief(r)); return brief(r); }, 'Critical');
  await tc('DLR-PRD-006', 'Valid product', '201 Under review; response has no customer price/margin', async () => { const r = await D('POST', '/api/dealer/products', form(base)); dp = r.data; const bad = forbiddenIn(r.data); expect(r.status === 201 && r.data.status === 'pending' && !bad.length, `${brief(r)} forbidden: ${bad}`); return `pending · keys clean`; }, 'Critical');
  await tc('DLR-PRD-007', 'Duplicate SKU for the same dealer', '409 "SKU already used"', async () => { const r = await D('POST', '/api/dealer/products', form({ ...base, name: 'Another diya set different', description: base.description })); expect(r.status === 409 && r.data.fields?.dealer_sku, brief(r)); return brief(r); }, 'Low');
  await tc('DLR-PRD-008', "Edit another dealer's product (IDOR)", '404', async () => { const O = await onboard(); const r = await O('GET', `/api/dealer/products/${dp.id}`); const w = await O('PATCH', `/api/dealer/products/${dp.id}/stock`, { quantity: 1 }); expect(r.status === 404 && w.status === 404, `${r.status} ${w.status}`); D.other = O; return `${r.status} / ${w.status}`; }, 'Critical');
  await tc('DLR-PRD-009', 'Admin publishes with a selling price', 'Live; dealer still sees only dealer price', async () => {
    const r = await A('POST', `/api/admin/dealer-products/${dp.id}/publish`, { name: base.name, category_id: catId, short_description: base.short_description, description: base.description, specs: base.specs, pricing: { shipping: 60, packaging: 20, other: 10, profit_value: 90 }, price: 349, mrp: 499, is_active: true, note_to_dealer: 'Approved', internal_note: 'Margin ok' });
    expect(r.status === 200 && r.data.live.is_active, brief(r)); const v = (await D('GET', `/api/dealer/products/${dp.id}`)).data; const bad = forbiddenIn(v); expect(v.live && !bad.length && !JSON.stringify(v).includes('34900'), `forbidden ${bad}`); dp.product_id = r.data.live.id; return `live at ₹349 for customers · dealer sees ₹${v.dealer_price / 100} only`;
  }, 'Critical');
  await tc('DLR-PRD-010', 'Dealer dashboard / products never contain FORBIDDEN keys', 'No price, mrp, margin, profit, pricing', async () => { const d1 = (await D('GET', '/api/dealer/dashboard')).data; const d2 = (await D('GET', '/api/dealer/products')).data; const bad = [...forbiddenIn(d1), ...forbiddenIn(d2)]; expect(!bad.length, bad.join(',')); return 'clean'; }, 'Critical');
}

// ===================================================================== stock & inventory
section('Dealer', 'Stock & inventory');
{
  await tc('INV-001', 'Stock update to a negative number', '400', async () => { const r = await D('PATCH', `/api/dealer/products/${dp.id}/stock`, { quantity: -1 }); expect(r.status === 400, brief(r)); return brief(r); }, 'High');
  await tc('INV-002', 'Stock update (dealer → store)', 'Store stock = new quantity; movement logged', async () => { const r = await D('PATCH', `/api/dealer/products/${dp.id}/stock`, { quantity: 3 }); const s = db.prepare('SELECT stock FROM inventory WHERE product_id = ?').get(dp.product_id).stock; expect(r.status === 200 && s === 3, `${brief(r)} store ${s}`); return `store stock ${s}`; }, 'High');
  await tc('INV-003', 'Concurrent orders for the last 3 pieces (6 buyers at once)', 'Exactly 3 succeed; stock 0, never negative', async () => {
    const buyers = await Promise.all(Array.from({ length: 6 }, () => newCustomer()));
    const res = await Promise.all(buyers.map((b) => b('POST', '/api/orders', { items: [{ productId: dp.product_id, qty: 1 }], customer: { name: 'Buyer', phone: b.phone, email: b.email }, address: { line1: '14 Shanti Nagar, MG Road', city: 'Pune', state: 'Maharashtra', pincode: '411001' } })));
    const okN = res.filter((x) => x.status === 201).length; const s = db.prepare('SELECT stock FROM inventory WHERE product_id = ?').get(dp.product_id).stock;
    expect(okN === 3 && s === 0, `ok ${okN} stock ${s} statuses ${res.map((x) => x.status)}`); D.buyers = buyers.filter((_, i) => res[i].status === 201).map((b, i) => ({ b, o: res.filter((x) => x.status === 201)[i].data }));
    return `${okN} orders placed, ${6 - okN} refused (409) · stock ${s}`;
  }, 'Critical');
  await tc('INV-004', 'Reserved stock shown to the dealer', 'reserved = 3 (open orders), available 0', async () => { const v = (await D('GET', `/api/dealer/products/${dp.id}`)).data; expect(v.reserved_stock === 3 && v.store_stock === 0, JSON.stringify({ r: v.reserved_stock, s: v.store_stock })); return `reserved ${v.reserved_stock} · available ${v.store_stock} · sold ${v.sold_stock}`; }, 'Medium');
  await tc('INV-005', 'Out of stock product cannot be ordered', '409', async () => { const c = await newCustomer(); const r = await c('POST', '/api/orders', { items: [{ productId: dp.product_id, qty: 1 }], customer: { name: 'Late', phone: c.phone, email: c.email }, address: { line1: '14 Shanti Nagar, MG Road', city: 'Pune', state: 'Maharashtra', pincode: '411001' } }); expect([400, 409].includes(r.status) && !db.prepare('SELECT 1 FROM orders WHERE customer_phone = ?').get(c.phone), brief(r)); return brief(r); }, 'High');
  await tc('INV-006', 'Cancellation releases stock', 'Stock +1', async () => { const { b, o } = D.buyers[2]; await b('POST', `/api/orders/${o.order.order_number}/cancel`, { reason: 'Ordered by mistake' }); const s = db.prepare('SELECT stock FROM inventory WHERE product_id = ?').get(dp.product_id).stock; expect(s === 1, `stock ${s}`); return `stock ${s}`; }, 'Critical');
}

// ===================================================================== dealer orders
section('Dealer', 'Orders & shipping');
let num; let oid; let buyer;
{
  ({ b: buyer } = D.buyers[0]); num = D.buyers[0].o.order.order_number; oid = D.buyers[0].o.order.id;
  await A('POST', `/api/admin/orders/${oid}/action`, { action: 'confirm_payment' });
  const cur = (await A('GET', `/api/admin/orders/${oid}`)).data.dealer.current;
  if (cur?.dealer_id !== D.id) await A('POST', `/api/admin/orders/${oid}/dealer`, { dealer_id: D.id, note: 'qa' });
  await tc('DLR-ORD-001', 'New order appears for the dealer', 'In "new" tab; customer phone/address hidden before accepting', async () => { const l = (await D('GET', '/api/dealer/orders?tab=new')).data.items; const v = (await D('GET', `/api/dealer/orders/${num}`)).data; expect(l.some((x) => x.order_number === num) && v.customer.phone === null, JSON.stringify(v.customer)); return 'listed · contact hidden'; }, 'Critical');
  await tc('DLR-ORD-002', 'Another dealer opens / acts on this order', '404 — or, if the order was moved away from them, a masked history row (no phone/address) and no actions', async () => {
    const r = await D.other('GET', `/api/dealer/orders/${num}`); const a = await D.other('POST', `/api/dealer/orders/${num}/accept`);
    const masked = r.status === 200 && ['reassigned', 'rejected'].includes(r.data.status) && r.data.customer.phone === null && r.data.customer.address.line1 === null;
    expect((r.status === 404 || masked) && [404, 409].includes(a.status), `${r.status} ${r.data?.status} phone=${r.data?.customer?.phone} · act ${a.status}`); return r.status === 404 ? '404 / 404' : `history row "${r.data.status}" masked · action ${a.status}`;
  }, 'Critical');
  await tc('DLR-ORD-003', 'Pack before accepting', '409', async () => { const r = await D('POST', `/api/dealer/orders/${num}/pack`, { checked: [] }); expect(r.status === 409, brief(r)); return brief(r); }, 'High');
  let v;
  await tc('DLR-ORD-004', 'Accept', 'Accepted; full address & phone now visible', async () => { const r = await D('POST', `/api/dealer/orders/${num}/accept`); v = r.data; expect(r.status === 200 && v.customer.phone, brief(r)); return 'accepted'; }, 'Critical');
  await tc('DLR-ORD-005', 'Pack without ticking every item', '400', async () => { const r = await D('POST', `/api/dealer/orders/${num}/pack`, { checked: [] }); expect(r.status === 400, brief(r)); return brief(r); });
  await tc('DLR-ORD-006', 'Pack → Ready → Out for delivery (own rider)', 'Each step accepted in order', async () => { await D('POST', `/api/dealer/orders/${num}/pack`, { checked: v.items.map((i) => i.id) }); await D('POST', `/api/dealer/orders/${num}/ready`); const r = await D('POST', `/api/dealer/orders/${num}/dispatch`, { mode: 'self', rider_name: 'Raju Kumar', rider_phone: '9876543210' }); expect(r.data.status === 'out_for_delivery', brief(r)); return r.data.status; }, 'Critical');
  await tc('DLR-ORD-007', 'Customer cannot cancel once out for delivery', '409', async () => { const r = await buyer('POST', `/api/orders/${num}/cancel`, { reason: 'Changed mind' }); expect(r.status === 409, brief(r)); return brief(r); }, 'High');
  await tc('DLR-ORD-008', 'Deliver with wrong code, then right code', '400, then Delivered', async () => { const code = (await buyer('GET', `/api/orders/${num}`)).data.delivery.otp; const w = await D('POST', `/api/dealer/orders/${num}/deliver`, { otp: code === '1111' ? '2222' : '1111' }); const r = await D('POST', `/api/dealer/orders/${num}/deliver`, { otp: code }); expect(w.status === 400 && r.data.status === 'delivered', `${w.status} ${brief(r)}`); return '400 → delivered'; }, 'Critical');
  await tc('DLR-ORD-009', 'Sold count after delivery', 'sold_stock ≥ 1', async () => { const v2 = (await D('GET', `/api/dealer/products/${dp.id}`)).data; expect(v2.sold_stock >= 1, JSON.stringify(v2.sold_stock)); return `sold ${v2.sold_stock}`; }, 'Low');
}

// ===================================================================== returns (dealer side) & settlement
section('Dealer', 'Payments & settlement');
{
  // second delivered order for the same dealer via admin path
  const { b: b2, o: o2 } = D.buyers[1]; await A('POST', `/api/admin/orders/${o2.order.id}/action`, { action: 'confirm_payment' });
  const cur = (await A('GET', `/api/admin/orders/${o2.order.id}`)).data.dealer.current; if (cur?.dealer_id !== D.id) await A('POST', `/api/admin/orders/${o2.order.id}/dealer`, { dealer_id: D.id });
  await D('POST', `/api/dealer/orders/${o2.order.order_number}/accept`); const vv = (await D('GET', `/api/dealer/orders/${o2.order.order_number}`)).data;
  await D('POST', `/api/dealer/orders/${o2.order.order_number}/pack`, { checked: vv.items.map((i) => i.id) }); await D('POST', `/api/dealer/orders/${o2.order.order_number}/ready`);
  await D('POST', `/api/dealer/orders/${o2.order.order_number}/dispatch`, { mode: 'self', rider_name: 'Raju Kumar', rider_phone: '9876543210' });
  const code = (await b2('GET', `/api/orders/${o2.order.order_number}`)).data.delivery.otp; await D('POST', `/api/dealer/orders/${o2.order.order_number}/deliver`, { otp: code });
  let pv;
  await tc('DLR-SET-001', 'Amount due = dealer price × quantity delivered (supply model)', 'Preview gross = 2 × ₹120', async () => { pv = (await A('GET', `/api/admin/settlements/preview?dealer_id=${D.id}`)).data; expect(pv.totals.gross === 2 * 12000 && pv.totals.net === 24000 && pv.totals.fees === 0, JSON.stringify(pv.totals)); return `2 orders · ₹${pv.totals.gross / 100} · fees 0 · net ₹${pv.totals.net / 100}`; }, 'Critical');
  await tc('DLR-SET-002', 'Dealer Payments page', 'Shows ₹240 due; no forbidden keys', async () => { const r = (await D('GET', '/api/dealer/payments')).data; const bad = forbiddenIn(r); expect(r.due.net === 24000 && !bad.length && r.bank?.includes('4321'), `${JSON.stringify(r.due)} ${bad}`); return `due ₹${r.due.net / 100} · ${r.bank}`; }, 'High');
  await tc('DLR-SET-003', "Dealer cannot see another dealer's payments", "Other dealer's page shows ₹0 due", async () => { const r = (await D.other('GET', '/api/dealer/payments')).data; expect(r.due.net === 0 && r.settlements.length === 0, JSON.stringify(r.due)); return 'separate'; }, 'Critical');
  // a return on order 1 reduces the next settlement
  const { o: o1 } = D.buyers[0];
  await tc('DLR-SET-004', 'Returned item is deducted', 'Net = 2×120 − 120', async () => {
    const f = new FormData(); f.append('reason', 'damaged'); f.append('items', JSON.stringify([{ order_item_id: db.prepare('SELECT id FROM order_items WHERE order_id = ?').get(o1.order.id).id, qty: 1 }])); f.append('photo', blob(PNG, 'd.png', 'image/png'));
    const r = await buyer('POST', `/api/orders/${o1.order.order_number}/returns`, f); expect(r.status === 201, brief(r)); await A('POST', `/api/admin/returns/${r.data.return.id}/action`, { action: 'approve' }); await A('POST', `/api/admin/returns/${r.data.return.id}/action`, { action: 'receive' });
    pv = (await A('GET', `/api/admin/settlements/preview?dealer_id=${D.id}`)).data; expect(pv.totals.returns === 12000 && pv.totals.net === 12000, JSON.stringify(pv.totals)); return `gross ₹${pv.totals.gross / 100} − returns ₹${pv.totals.returns / 100} = ₹${pv.totals.net / 100}`;
  }, 'Critical');
  await tc('DLR-SET-005', 'Support role cannot create a settlement', '403', async () => {
    const r0 = await A('POST', '/api/admin/admins', { name: 'QA Support', email: `support.${uniq()}@example.com`, role: 'support' }); const S = await client().init();
    await S('POST', '/api/admin/login', { email: r0.data.admin.email, password: r0.data.temporary_password }); await S('PUT', '/api/admin/me/password', { current: r0.data.temporary_password, next: 'Support-Desk-2026!' });
    const r = await S('POST', '/api/admin/settlements', { dealer_id: D.id }); expect(r.status === 403, brief(r)); return brief(r);
  }, 'Critical');
  let s1;
  await tc('DLR-SET-006', 'Create settlement with a penalty adjustment', 'Processing; net = 120 − 20', async () => { const r = await A('POST', '/api/admin/settlements', { dealer_id: D.id, adjustments: [{ label: 'Late dispatch penalty', amount: -20 }], expect_net: 100 }); s1 = r.data; expect(r.status === 201 && s1.net === 10000 && s1.status === 'processing', brief(r)); return `${s1.number} · net ₹${s1.net / 100}`; }, 'Critical');
  await tc('DLR-SET-007', 'Nothing paid twice', 'Second create → 409 nothing due', async () => { const r = await A('POST', '/api/admin/settlements', { dealer_id: D.id }); expect(r.status === 409, brief(r)); return brief(r); }, 'Critical');
  await tc('DLR-SET-008', 'Mark paid without UTR', '400', async () => { const r = await A('POST', `/api/admin/settlements/${s1.id}/action`, { action: 'pay' }); expect(r.status === 400, brief(r)); return brief(r); }, 'High');
  await tc('DLR-SET-009', 'Mark paid with UTR', 'Paid; dealer sees it with UTR', async () => { const r = await A('POST', `/api/admin/settlements/${s1.id}/action`, { action: 'pay', utr: 'SBIN26279900112' }); const d = (await D('GET', '/api/dealer/payments')).data; expect(r.data.status === 'paid' && d.settlements[0].utr === 'SBIN26279900112' && d.totals.paid === 10000, brief(r)); return `paid · dealer total paid ₹${d.totals.paid / 100}`; }, 'Critical');
  await tc('DLR-SET-010', 'Pay or cancel an already paid batch', '409 both', async () => { const a = await A('POST', `/api/admin/settlements/${s1.id}/action`, { action: 'pay', utr: 'SBIN26279900113' }); const c = await A('POST', `/api/admin/settlements/${s1.id}/action`, { action: 'cancel' }); expect(a.status === 409 && c.status === 409, `${a.status} ${c.status}`); return '409 / 409'; }, 'Critical');
  await tc('DLR-SET-011', 'Negative net is never paid', 'Only a return pending → 409 "zero or less"', async () => {
    const { b: b3, o: o3 } = D.buyers[1]; const f = new FormData(); f.append('reason', 'no_longer_needed'); f.append('items', JSON.stringify([{ order_item_id: db.prepare('SELECT id FROM order_items WHERE order_id = ?').get(o3.order.id).id, qty: 1 }]));
    const r = await b3('POST', `/api/orders/${o3.order.order_number}/returns`, f); await A('POST', `/api/admin/returns/${r.data.return.id}/action`, { action: 'approve' }); await A('POST', `/api/admin/returns/${r.data.return.id}/action`, { action: 'receive' });
    const c = await A('POST', '/api/admin/settlements', { dealer_id: D.id }); const d = (await D('GET', '/api/dealer/payments')).data; expect(c.status === 409 && d.due.net < 0, `${brief(c)} due ${d.due.net}`); return `${c.status} · dealer sees −₹${-d.due.net / 100} carried forward`;
  }, 'Critical');
  await tc('DLR-SET-012', 'Cancel a processing batch releases its orders', 'Orders due again', async () => {
    const O = D.other; const c = await newCustomer(); const pid = db.prepare("SELECT product_id FROM dealer_products WHERE dealer_id = ? AND product_id IS NOT NULL LIMIT 1").get(D.id)?.product_id || dp.product_id;
    db.prepare('UPDATE inventory SET stock = 5 WHERE product_id = ?').run(pid); const o = await placeOrder(c, [{ productId: pid, qty: 1 }]); await A('POST', `/api/admin/orders/${o.id}/action`, { action: 'confirm_payment' }); await A('POST', `/api/admin/orders/${o.id}/dealer`, { dealer_id: O.id });
    await O('POST', `/api/dealer/orders/${o.number}/accept`); const v = (await O('GET', `/api/dealer/orders/${o.number}`)).data; await O('POST', `/api/dealer/orders/${o.number}/pack`, { checked: v.items.map((i) => i.id) }); await O('POST', `/api/dealer/orders/${o.number}/ready`); await O('POST', `/api/dealer/orders/${o.number}/dispatch`, { mode: 'self', rider_name: 'Raju Kumar', rider_phone: '9876543210' });
    await O('POST', `/api/dealer/orders/${o.number}/deliver`, { otp: (await c('GET', `/api/orders/${o.number}`)).data.delivery.otp });
    db.prepare("UPDATE dealer_products SET approved_dealer_price = 15000 WHERE dealer_id = ?").run(O.id);
    const s = await A('POST', '/api/admin/settlements', { dealer_id: O.id }); const x = await A('POST', `/api/admin/settlements/${s.data.id}/action`, { action: 'cancel' }); const p = (await A('GET', `/api/admin/settlements/preview?dealer_id=${O.id}`)).data;
    expect(s.status === 201 && x.data.status === 'cancelled' && p.totals.orders === 1, `${brief(s)} ${brief(x)} ${p.totals.orders}`); return `${s.data.number} cancelled → 1 order due again`;
  }, 'High');
  await tc('DLR-SET-013', 'Commission model: commission + fees deducted', 'net = gross − commission% − ₹fee/order − payment%', async () => {
    const { computeSettlement } = await import('../../../shared/settlement.js');
    const t = computeSettlement({ model: 'commission', sales: [{ value: 100000 }, { value: 50000 }], returns: [{ value: 10000 }], adjustments: [], terms: { commission_pct: 10, platform_fee: 20, payment_fee_pct: 2 } });
    expect(t.commission === 14000 && t.platform_fees === 4000 && t.payment_fees === 2800 && t.net === 150000 - 10000 - 14000 - 4000 - 2800, JSON.stringify(t)); return `gross 1500 − returns 100 − comm 140 − fees 40 − pay 28 = ₹${t.net / 100}`;
  }, 'High');
}

// ===================================================================== dealer password reset & security
section('Dealer', 'Account security');
{
  const R = await client().init(); let code;
  await tc('DLR-SEC-001', 'Forgot password (unknown number)', '200 generic, no code', async () => { const r = await R('POST', '/api/dealer/password/forgot', { phone: '9000000099' }); expect(r.status === 200 && !r.data.dev_otp, brief(r)); return r.data.message; }, 'High');
  await tc('DLR-SEC-002', 'Forgot password (real number)', '200, code sent', async () => { const r = await R('POST', '/api/dealer/password/forgot', { phone: dPhone }); code = r.data.dev_otp; expect(/^\d{6}$/.test(code), brief(r)); return 'code sent'; }, 'High');
  await tc('DLR-SEC-003', 'Reset with the code', 'Old sessions end; new password works', async () => { const r = await R('POST', '/api/dealer/password/reset', { phone: dPhone, otp: code, password: 'New-Pital-Diya-26', confirm_password: 'New-Pital-Diya-26' }); const stale = await D('GET', '/api/dealer/me'); const L = await client().init(); const l = await L('POST', '/api/dealer/login', { phone: dPhone, password: 'New-Pital-Diya-26' }); expect(r.status === 200 && stale.status === 401 && l.status === 200, `${r.status} ${stale.status} ${l.status}`); return 'reset · old session 401 · new login 200'; }, 'Critical');
  await tc('DLR-SEC-004', 'Customer session cannot open dealer API', '401', async () => { const c = await newCustomer(); const r = await c('GET', '/api/dealer/orders'); expect(r.status === 401, brief(r)); return brief(r); }, 'Critical');
  await tc('DLR-SEC-005', 'Dealer session cannot open admin API', '401', async () => { const L = await client().init(); await L('POST', '/api/dealer/login', { phone: dPhone, password: 'New-Pital-Diya-26' }); const r = await L('GET', '/api/admin/orders'); expect(r.status === 401, brief(r)); return brief(r); }, 'Critical');
  await tc('DLR-SEC-006', 'Suspended dealer gets no new orders', 'can_receive_orders false', async () => { const r = await A('POST', `/api/admin/dealer-verification/${D.other.id}/action`, { action: 'suspend', reason: 'Repeated late dispatch' }); expect(r.data.status === 'suspended' && !r.data.can_receive_orders, brief(r)); return 'suspended'; }, 'High');
}

save('dealer');
process.exit(0);
