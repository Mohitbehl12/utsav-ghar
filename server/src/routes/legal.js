/**
 * Dealer onboarding (register → business → KYC → documents → agreement → signature → verification → approval),
 * admin dealer verification, and admin legal-document management with version control and audit trail.
 */
import { Router } from 'express';
import crypto from 'node:crypto';
import multer from 'multer';
import { z } from 'zod';
import { db, now, parseJSON } from '../db.js';
import { config } from '../config.js';
import { wrap, parse, HttpError } from '../lib/http.js';
import { hashPassword, requireAdmin } from '../lib/auth.js';
import { rejectBots, secEvent } from '../lib/security.js';
import { notifyContact } from '../lib/notify.js';
import { dealerFromRow } from '../lib/dealers.js';
import {
  legalAudit, encrypt, decrypt, companyVars, setCompanyVars, currentDoc, publicDoc, docRow, pendingFor, acceptanceView, acceptancePdf,
  dealerVars, dealerCommercial, dealerDocs, dealerSigned, recordDealerSignature, saveKycFile, legalFile, canReceiveOrders, sha,
  blankPdf, companyRep, DOC_KINDS, CUSTOMER_KINDS, DEALER_KINDS,
} from '../lib/legal.js';
import { requireDealerSession, setDealerSession } from './dealer.js';
import {
  dealerProblems, normalizeIds, requiredDocs, optionalDocs, onboardingProgress, latestDocs, DOC_TYPES, BUSINESS_TYPES, ONBOARDING_STATUS, ONBOARDING_STEPS,
  DEALER_CHECKS, COMMERCIAL_MODELS, DEFAULT_COMMERCIAL, COMPANY_DEFAULTS, fillTemplate, maskAccount, AUDIT_ACTIONS, DOC_STATUS, commercialSchedule,
} from '../../../shared/legal.js';
import { passwordProblem } from '../../../shared/security.js';
import * as PDFLib from 'pdf-lib';
import { buildAgreementPdf } from '../../../shared/legalPdf.js';
import { WORKFLOW, EDITABLE_STATUSES, IN_PROGRESS_STATUSES, APPLIES_TO, POLICY_TYPES, parseLegalDoc } from '../../../shared/legal.js';
import { policyCatalog, policyState, setIntro, HEALTH_LEVELS, HEALTH_METRICS, DEFAULT_HEALTH_RULES, VIOLATION_TYPES, SEVERITY, VIOLATION_STATUS, VIOLATION_ACTIONS, DOC_EXPIRY } from '../../../shared/compliance.js';
import { STARTER_POLICIES } from '../../../shared/policyTemplates.js';
import { DEFAULT_LEGAL_DOCS } from '../../../shared/legalTemplates.js';
import { legalCenter, acceptanceData, dealerProfiles, dealerHealth, getHealthRules, setHealthRules, violationRows, dealerDocRows, calendarData, noticesList, addNotice, announcePublished } from '../lib/compliance.js';

export const dealerOnboardingApi = Router();
export const adminDealerVerification = Router();
export const adminLegal = Router();

const docUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 }, fileFilter: (_r, f, cb) => cb(null, /^(application\/pdf|image\/(jpeg|png))$/.test(f.mimetype)) });
const row = (id) => db.prepare('SELECT * FROM dealers WHERE id = ?').get(id);
const phone10 = (p) => String(p || '').replace(/\D/g, '').slice(-10);
const LOCKED = ['under_review', 'agreement_signed', 'approved', 'rejected', 'suspended', 'terminated'];
const fieldsError = (f) => new HttpError(400, 'Please check the highlighted fields.', { fields: f });

/** What the dealer sees about itself (bank account masked; never decrypted for the dealer). */
function onboardingView(d) {
  const docs = dealerDocs(d.id);
  const signed = dealerSigned(d.id);
  const prog = onboardingProgress({ dealer: d, docs, signed });
  const latest = latestDocs(docs);
  const c = dealerCommercial(d);
  return {
    status: d.onboarding_status, status_label: ONBOARDING_STATUS[d.onboarding_status]?.label, status_reason: d.status_reason || null,
    deadline: d.onboarding_deadline, can_receive_orders: canReceiveOrders(d), self_registered: !!d.self_registered,
    editable: !LOCKED.includes(d.onboarding_status) || d.onboarding_status === 'documents_rejected',
    business: { business_name: d.business_name, legal_name: d.legal_name || '', business_type: d.business_type || '', name: d.name, phone: d.phone, email: d.email || '',
      registered_address: d.registered_address || '', address: d.address || '', city: d.city || '', state: d.state || '', pincode: d.pincode || '', country: d.country || 'India', website: d.website || '' },
    kyc: { pan: d.pan || '', gstin: d.gstin || '', cin: d.cin || '', tan: d.tan || '', registration_no: d.registration_no || '', udyam: d.udyam || '', trade_license: d.trade_license || '',
      bank_name: d.bank_name || '', bank_holder: d.bank_holder || '', bank_account_masked: maskAccount(d.bank_last4), ifsc: d.ifsc || '', bank_branch: d.bank_branch || '' },
    documents: docs.map((x) => ({ id: x.id, doc_type: x.doc_type, label: DOC_TYPES[x.doc_type]?.label, doc_number: x.doc_number, original_name: x.original_name, mime: x.mime, size: x.size,
      uploaded_at: x.uploaded_at, status: x.status, reject_reason: x.reject_reason, expiry_date: x.expiry_date, latest: latest[x.doc_type]?.id === x.id })),
    required: requiredDocs(d), optional: optionalDocs(d), progress: prog, steps: ONBOARDING_STEPS, signed,
    pending_versions: pendingFor('dealer', d.id, DEALER_KINDS).map((x) => ({ kind: x.kind, title: x.title, version: x.version })),
    commercial: { model: c.model, model_label: COMMERCIAL_MODELS[c.model]?.label },
    doc_types: DOC_TYPES, business_types: BUSINESS_TYPES, checks: DEALER_CHECKS,
  };
}
const me = (req) => row(req.dealer.id);
function canEdit(d) {
  if (LOCKED.includes(d.onboarding_status) && d.onboarding_status !== 'approved') throw new HttpError(409, d.onboarding_status === 'under_review' ? 'Your details are with our team for review. Contact us to change them.' : 'This account cannot be edited now. Contact the Utsav Ghar team.');
}

// ---------------------------------------------------------------- dealer: self-registration
const regSchema = z.object({
  business_name: z.string().trim().min(2, 'Enter your business name').max(120),
  name: z.string().trim().min(2, 'Enter the contact person').max(80),
  phone: z.string().trim().max(16),
  email: z.string().trim().email('Enter a valid email').max(160),
  password: z.string().max(128), confirm_password: z.string().max(128),
  website: z.string().max(0).optional(), // honeypot
});
dealerOnboardingApi.post('/dealer/register', wrap(async (req, res) => {
  rejectBots(req);
  const b = parse(regSchema, req.body);
  const phone = phone10(b.phone); const f = {};
  if (!/^[6-9]\d{9}$/.test(phone)) f.phone = 'Enter a valid 10-digit mobile number';
  const weak = passwordProblem(b.password, { min: 8, email: b.email, name: b.name }); if (weak) f.password = weak;
  if (b.password !== b.confirm_password) f.confirm_password = 'Passwords do not match';
  if (Object.keys(f).length) throw fieldsError(f);
  if (db.prepare('SELECT 1 FROM dealers WHERE phone = ?').get(phone)) throw new HttpError(409, 'This mobile number is already registered. Please sign in.', { fields: { phone: 'Already registered' } });
  const id = db.prepare(`INSERT INTO dealers(name, business_name, phone, email, password_hash, is_active, must_change_password, self_registered, onboarding_status, pincodes, category_ids, product_ids, priority)
    VALUES(?,?,?,?,?,1,0,1,'draft','[]','[]','[]',0)`).run(b.name, b.business_name, phone, b.email, await hashPassword(b.password)).lastInsertRowid;
  legalAudit(req, { actor_type: 'dealer', actor_id: id, subject_type: 'dealer', subject_id: id, action: 'dealer_registered', detail: { business_name: b.business_name } });
  secEvent('dealer_registered', `dealer:${id}`, req);
  const r = row(id); setDealerSession(res, r);
  res.status(201).json({ dealer: dealerFromRow(r) });
}));

// ---------------------------------------------------------------- public: published policies (customer + company)
const publicKinds = () => policyCatalog(db.prepare('SELECT id, kind, title, category, icon, description FROM legal_documents').all()).filter((k) => k.category !== 'dealer');
dealerOnboardingApi.get('/legal/policies', (req, res) => {
  const v = companyVars();
  const items = publicKinds().map((k) => { const d = currentDoc(k.kind); return d && { kind: k.kind, title: d.title, icon: d.icon || k.icon, desc: d.description || k.desc, category: k.category, version: d.version, effective_at: d.effective_at, accept: k.accept || null }; }).filter(Boolean);
  res.set('Cache-Control', 'public, max-age=300').json({ items, company: { name: v.company_name, legal_name: v.company_legal_name } });
});
dealerOnboardingApi.get('/legal/policy/:kind', wrap((req, res) => {
  if (!publicKinds().some((k) => k.kind === req.params.kind)) throw new HttpError(404, 'Not found');
  const d = currentDoc(req.params.kind); if (!d) throw new HttpError(404, 'Not found');
  res.json(publicDoc(d));
}));
dealerOnboardingApi.get('/legal/policy/:kind/pdf', wrap(async (req, res) => {
  if (!publicKinds().some((k) => k.kind === req.params.kind)) throw new HttpError(404, 'Not found');
  const d = publicDoc(currentDoc(req.params.kind)); if (!d) throw new HttpError(404, 'Not found');
  res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${req.params.kind}-v${d.version}.pdf"` }).send(await blankPdf([d], { ref: `${req.params.kind.toUpperCase()}-v${d.version}` }));
}));

// ---------------------------------------------------------------- dealer: onboarding steps
dealerOnboardingApi.use(['/dealer/onboarding', '/dealer/legal'], requireDealerSession);
dealerOnboardingApi.get('/dealer/onboarding', (req, res) => res.set('Cache-Control', 'no-store').json(onboardingView(me(req))));

const businessSchema = z.object({
  business_name: z.string().trim().max(120), legal_name: z.string().trim().max(160), business_type: z.string().max(30),
  name: z.string().trim().max(80), email: z.string().trim().max(160), registered_address: z.string().trim().max(300), address: z.string().trim().max(300),
  city: z.string().trim().max(60), state: z.string().trim().max(60), pincode: z.string().trim().max(6), country: z.string().trim().max(60).default('India'), website: z.string().trim().max(200).optional().default(''),
});
dealerOnboardingApi.put('/dealer/onboarding/business', wrap((req, res) => {
  const d = me(req); canEdit(d);
  const b = parse(businessSchema, req.body);
  const f = dealerProblems({ ...b, phone: d.phone }, 'business');
  if (Object.keys(f).length) throw fieldsError(f);
  // after approval, routing fields (address/PIN/city) stay with the admin
  const routing = d.onboarding_status === 'approved' ? {} : { address: b.address, city: b.city, state: b.state, pincode: b.pincode };
  const set = { business_name: b.business_name, legal_name: b.legal_name, business_type: b.business_type, name: b.name, email: b.email, registered_address: b.registered_address, country: b.country, website: b.website || null, ...routing };
  db.prepare(`UPDATE dealers SET ${Object.keys(set).map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ?`).run(...Object.values(set), now(), d.id);
  legalAudit(req, { actor_type: 'dealer', actor_id: d.id, subject_type: 'dealer', subject_id: d.id, action: 'dealer_saved', detail: { step: 'business' } });
  res.json(onboardingView(row(d.id)));
}));

const kycSchema = z.object({
  pan: z.string().max(10), gstin: z.string().max(15).optional().default(''), cin: z.string().max(21).optional().default(''), tan: z.string().max(10).optional().default(''),
  registration_no: z.string().trim().max(60).optional().default(''), udyam: z.string().max(19).optional().default(''), trade_license: z.string().trim().max(60).optional().default(''),
  bank_name: z.string().trim().max(80), bank_holder: z.string().trim().max(120), bank_account: z.string().max(24).optional(), bank_account_confirm: z.string().max(24).optional(),
  ifsc: z.string().max(11), bank_branch: z.string().trim().max(120).optional().default(''),
});
dealerOnboardingApi.put('/dealer/onboarding/kyc', wrap((req, res) => {
  const d = me(req); canEdit(d);
  const b = normalizeIds(parse(kycSchema, req.body));
  const changingBank = !!(b.bank_account && b.bank_account.trim());
  const check = { ...b, business_type: d.business_type, bank_account: changingBank || !d.bank_last4 ? b.bank_account || '' : undefined, bank_account_confirm: changingBank ? b.bank_account_confirm || '' : undefined };
  const f = dealerProblems(check, 'kyc');
  if (Object.keys(f).length) throw fieldsError(f);
  const acct = changingBank ? b.bank_account.replace(/\s/g, '') : null;
  db.prepare(`UPDATE dealers SET pan = ?, gstin = ?, cin = ?, tan = ?, registration_no = ?, udyam = ?, trade_license = ?, bank_name = ?, bank_holder = ?, ifsc = ?, bank_branch = ?,
    bank_account_enc = COALESCE(?, bank_account_enc), bank_last4 = COALESCE(?, bank_last4), updated_at = ? WHERE id = ?`)
    .run(b.pan, b.gstin || null, b.cin || null, b.tan || null, b.registration_no || null, b.udyam || null, b.trade_license || null, b.bank_name, b.bank_holder, b.ifsc, b.bank_branch || null,
      acct ? encrypt(acct) : null, acct ? acct.slice(-4) : null, now(), d.id);
  legalAudit(req, { actor_type: 'dealer', actor_id: d.id, subject_type: 'dealer', subject_id: d.id, action: 'dealer_saved', detail: { step: 'kyc', bank_changed: !!acct } });
  res.json(onboardingView(row(d.id)));
}));

dealerOnboardingApi.post('/dealer/onboarding/documents', docUpload.single('file'), wrap((req, res) => {
  const d = me(req);
  if (['rejected', 'suspended', 'terminated'].includes(d.onboarding_status)) throw new HttpError(409, 'This account cannot upload documents now.');
  const b = parse(z.object({ doc_type: z.string().max(40), doc_number: z.string().trim().max(60).optional().default(''), expiry_date: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/).optional().default('') }), req.body);
  if (!DOC_TYPES[b.doc_type]) throw fieldsError({ doc_type: 'Choose the document type' });
  if (!req.file) throw fieldsError({ file: 'Choose a PDF, JPG or PNG file (max 5 MB)' });
  if (b.expiry_date && Date.parse(b.expiry_date) < Date.now()) throw fieldsError({ expiry_date: 'This document has expired' });
  const saved = saveKycFile(d.id, req.file);
  const id = db.prepare(`INSERT INTO dealer_documents(dealer_id, doc_type, doc_number, file, original_name, mime, size, sha256, expiry_date, uploaded_at) VALUES(?,?,?,?,?,?,?,?,?,?)`)
    .run(d.id, b.doc_type, b.doc_number || null, saved.file, String(req.file.originalname || '').replace(/[^\w.\- ]/g, '').slice(0, 120), saved.mime, saved.size, saved.sha256, b.expiry_date || null, now()).lastInsertRowid;
  if (d.onboarding_status === 'documents_rejected' || d.onboarding_status === 'documents_pending') db.prepare("UPDATE dealers SET onboarding_status = ? WHERE id = ?").run(dealerSigned(d.id) ? 'under_review' : 'draft', d.id);
  legalAudit(req, { actor_type: 'dealer', actor_id: d.id, subject_type: 'dealer', subject_id: d.id, action: 'dealer_doc_uploaded', detail: { id, doc_type: b.doc_type, sha256: saved.sha256 } });
  res.status(201).json(onboardingView(row(d.id)));
}));
dealerOnboardingApi.delete('/dealer/onboarding/documents/:id', wrap((req, res) => {
  const x = db.prepare('SELECT * FROM dealer_documents WHERE id = ? AND dealer_id = ?').get(Number(req.params.id), req.dealer.id);
  if (!x) throw new HttpError(404, 'Not found');
  if (x.status === 'verified') throw new HttpError(409, 'A verified document cannot be removed. Upload a newer one instead.');
  if (dealerSigned(req.dealer.id)) throw new HttpError(409, 'Documents submitted with a signed agreement are kept on record. Upload a newer one instead.');
  db.prepare('DELETE FROM dealer_documents WHERE id = ?').run(x.id);
  res.json(onboardingView(me(req)));
}));
dealerOnboardingApi.get('/dealer/onboarding/documents/:id/file', wrap((req, res) => {
  const x = db.prepare('SELECT * FROM dealer_documents WHERE id = ? AND dealer_id = ?').get(Number(req.params.id), req.dealer.id);
  if (!x) throw new HttpError(404, 'Not found');
  res.set({ 'Cache-Control': 'private, no-store', 'Content-Type': x.mime, 'Content-Disposition': `inline; filename="${x.doc_type}${x.mime === 'application/pdf' ? '.pdf' : x.mime === 'image/png' ? '.png' : '.jpg'}"`, 'X-Content-Type-Options': 'nosniff' }).sendFile(legalFile(x.file));
}));

/** The agreement as this dealer will sign it (current versions, filled with their details). */
function agreementFor(d) {
  const vars = dealerVars(d);
  return DEALER_KINDS.map((k) => { const doc = currentDoc(k); return doc && { kind: k, id: doc.id, title: doc.title, version: doc.version, effective_at: doc.effective_at, body: fillTemplate(doc.body, vars), hash: sha(fillTemplate(doc.body, vars)) }; }).filter(Boolean);
}
dealerOnboardingApi.get('/dealer/onboarding/agreement', (req, res) => {
  const d = me(req);
  res.set('Cache-Control', 'no-store').json({ docs: agreementFor(d), checks: DEALER_CHECKS, signer_default: d.name, company: companyVars().company_name,
    dealer_name: d.name, business_name: d.legal_name || d.business_name, agreement_date: new Date().toISOString() });
});
dealerOnboardingApi.get('/dealer/onboarding/agreement/pdf', wrap(async (req, res) => {
  const d = me(req); const docs = agreementFor(d);
  const pdf = await blankPdf(docs, { heading: 'DEALER AGREEMENT', ref: `D${d.id}-COPY`, who: [['Dealer name', d.name], ['Legal business name', d.legal_name || d.business_name], ['Dealer ID', `D-${d.id}`]] });
  res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="utsav-ghar-dealer-agreement.pdf"', 'Cache-Control': 'private, no-store' }).send(pdf);
}));

// OTP for signing: 6 digits, 10 minutes, 5 tries, sent to the registered mobile (and email)
dealerOnboardingApi.post('/dealer/onboarding/sign/otp', wrap(async (req, res) => {
  const d = me(req);
  const last = db.prepare('SELECT sent_at FROM dealer_sign_otps WHERE dealer_id = ?').get(d.id);
  if (last && Date.now() - Date.parse(last.sent_at) < 30e3) throw new HttpError(429, 'Please wait 30 seconds before asking for a new code.');
  const code = String(crypto.randomInt(0, 1e6)).padStart(6, '0');
  const ref = `OTP-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
  db.prepare('INSERT INTO dealer_sign_otps(dealer_id, code_hash, ref, tries, expires_at, sent_at) VALUES(?,?,?,0,?,?) ON CONFLICT(dealer_id) DO UPDATE SET code_hash = excluded.code_hash, ref = excluded.ref, tries = 0, expires_at = excluded.expires_at, sent_at = excluded.sent_at')
    .run(d.id, sha(`${d.id}:${code}`), ref, new Date(Date.now() + 10 * 6e4).toISOString(), now());
  await notifyContact({ email: d.email || null, phone: d.phone, template: 'dealer_sign_otp', subject: 'Your Utsav Ghar agreement signing code', text: `${code} is your code to sign the Utsav Ghar Dealer Agreement. It is valid for 10 minutes. Do not share it with anyone.`, storeText: '•••••• is your code to sign the Utsav Ghar Dealer Agreement. It is valid for 10 minutes. Do not share it with anyone.' }).catch(() => {});
  legalAudit(req, { actor_type: 'dealer', actor_id: d.id, subject_type: 'dealer', subject_id: d.id, action: 'dealer_otp_sent', detail: { ref, to: `******${d.phone.slice(-4)}` } });
  res.json({ ok: true, ref, sent_to: `******${d.phone.slice(-4)}`, ...(config.showTestCodes ? { dev_otp: code } : {}) });
}));

const signSchema = z.object({
  typed_name: z.string().trim().min(3, 'Type your full legal name').max(120),
  capacity: z.string().trim().min(2, 'Enter your role, e.g. Proprietor or Director').max(80),
  authorised: z.literal(true, { errorMap: () => ({ message: 'Confirm you are authorised to sign' }) }),
  signature_png: z.string().max(400_000),
  otp: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code'),
  checks: z.object(Object.fromEntries(DEALER_CHECKS.map((c) => [c.key, z.literal(true, { errorMap: () => ({ message: 'Please tick this box' }) })]))),
});
dealerOnboardingApi.post('/dealer/onboarding/sign', wrap(async (req, res) => {
  const d = me(req);
  const pendingNew = pendingFor('dealer', d.id, DEALER_KINDS).length > 0;
  if (['rejected', 'suspended', 'terminated'].includes(d.onboarding_status)) throw new HttpError(409, 'This account cannot sign now. Contact the Utsav Ghar team.');
  if (!pendingNew && d.onboarding_status !== 'agreement_pending') throw new HttpError(409, 'You have already signed the current agreement.');
  const b = parse(signSchema, req.body);
  // everything before the signature must be complete
  const prog = onboardingProgress({ dealer: d, docs: dealerDocs(d.id), signed: false });
  if (!prog.done.business || !prog.done.kyc) throw new HttpError(409, 'Complete your business and KYC details first.');
  if (!prog.done.documents) throw new HttpError(409, `Upload the required documents first: ${prog.missing.map((k) => DOC_TYPES[k]?.label).join(', ')}.`);
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(b.signature_png);
  const png = m ? Buffer.from(m[1], 'base64') : null;
  if (!png || png.length < 200 || !png.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) throw fieldsError({ signature_png: 'Draw your signature in the box' });
  const o = db.prepare('SELECT * FROM dealer_sign_otps WHERE dealer_id = ?').get(d.id);
  if (!o || Date.parse(o.expires_at) < Date.now()) throw fieldsError({ otp: 'The code has expired. Ask for a new one.' });
  if (o.tries >= 5) throw new HttpError(429, 'Too many wrong codes. Ask for a new one.');
  const ok = crypto.timingSafeEqual(Buffer.from(o.code_hash), Buffer.from(sha(`${d.id}:${b.otp}`)));
  if (!ok) {
    db.prepare('UPDATE dealer_sign_otps SET tries = tries + 1 WHERE dealer_id = ?').run(d.id);
    legalAudit(req, { actor_type: 'dealer', actor_id: d.id, subject_type: 'dealer', subject_id: d.id, action: 'dealer_otp_failed', detail: { ref: o.ref } });
    throw fieldsError({ otp: 'Wrong code. Please check and try again.' });
  }
  db.prepare('DELETE FROM dealer_sign_otps WHERE dealer_id = ?').run(d.id);
  const checks = DEALER_CHECKS.map((c) => ({ key: c.key, label: c.label }));
  const refs = await recordDealerSignature(req, d, { typed_name: b.typed_name, capacity: b.capacity, otp_ref: `${o.ref} (verified ${new Date().toISOString()})` }, checks, png);
  const next = d.onboarding_status === 'approved' ? 'approved' : 'under_review';
  db.prepare('UPDATE dealers SET onboarding_status = ?, submitted_at = ?, phone_verified_at = COALESCE(phone_verified_at, ?), updated_at = ? WHERE id = ?').run(next, now(), now(), now(), d.id);
  legalAudit(req, { actor_type: 'dealer', actor_id: d.id, subject_type: 'dealer', subject_id: d.id, action: 'dealer_signed', detail: { refs, typed_name: b.typed_name, capacity: b.capacity, otp_ref: o.ref } });
  const team = companyVars().support_email;
  notifyContact({ email: team, phone: null, template: 'dealer_submitted', subject: `[Dealer verification] ${d.business_name} signed the agreement`, text: `${d.business_name} (${d.name}, ${d.phone}) signed the dealer agreement (${refs.join(', ')}). Review documents and approve: ${config.publicUrl}/admin/dealer-verification/${d.id}` }).catch(() => {});
  res.json({ ok: true, refs, ...onboardingView(row(d.id)) });
}));

// ---------------------------------------------------------------- dealer: my agreements
dealerOnboardingApi.get('/dealer/legal', (req, res) => {
  const rows = db.prepare("SELECT * FROM legal_acceptances WHERE subject_type = 'dealer' AND subject_id = ? ORDER BY accepted_at DESC, id DESC").all(req.dealer.id);
  const curIds = new Set(DEALER_KINDS.map((k) => currentDoc(k)?.id));
  const d = me(req);
  res.set('Cache-Control', 'no-store').json({ items: rows.map((a) => ({ ...acceptanceView(a), current: curIds.has(a.document_id) })), pending: pendingFor('dealer', req.dealer.id, DEALER_KINDS).map((x) => ({ kind: x.kind, title: x.title, version: x.version, change_note: x.change_note })),
    health: dealerHealth(d), violations: violationRows(d.id).map((v) => ({ id: v.id, title: v.title, severity: v.severity, status: v.status, description: v.description, due_at: v.due_at, created_at: v.created_at, updates: v.history.filter((h) => h.action !== 'opened' && h.action !== 'note').map((h) => ({ at: h.at, action: h.action, note: h.note })) })),
    severity: SEVERITY, violation_status: VIOLATION_STATUS, levels: HEALTH_LEVELS });
});
/** Dealer → Legal & Agreements: documents that apply to dealers (current versions, filled with the dealer's details) + commercial terms. */
const DEALER_BASE = ['dealer_agreement', 'marketplace_policy', 'privacy', 'refund_cancellation'];
/** Agreement + Dealer T&C + every published dealer policy + privacy and refund policy. */
const dealerVisible = () => [...new Set([...DEALER_BASE.slice(0, 2), ...policyCatalog(db.prepare('SELECT id, kind, title, category FROM legal_documents').all()).filter((k) => k.category === 'dealer').map((k) => k.kind), ...DEALER_BASE.slice(2)])].filter((k) => currentDoc(k));
dealerOnboardingApi.get('/dealer/legal/docs', (req, res) => {
  const d = me(req); const vars = dealerVars(d);
  const docs = dealerVisible().map((k) => { const x = currentDoc(k); return x && { kind: k, title: k === 'privacy' ? 'Privacy & Data Policy' : x.title, version: x.version, effective_at: x.effective_at, body: fillTemplate(x.body, vars) }; }).filter(Boolean);
  docs.splice(2, 0, { kind: 'commercial', title: 'Commercial Terms', version: 'current', effective_at: d.approved_at || d.created_at, body: `# Commercial Terms\n\n> Your fees, settlement cycle and return window. These are part of your Dealer Agreement.\n\n## Your commercial schedule\n> What this means: This is how and when you are paid, and what may be deducted.\n${commercialSchedule(dealerCommercial(d))}` });
  res.set('Cache-Control', 'no-store').json({ docs });
});
dealerOnboardingApi.get('/dealer/legal/doc/:kind/pdf', wrap(async (req, res) => {
  if (!dealerVisible().includes(req.params.kind)) throw new HttpError(404, 'Not found');
  const d = me(req); const x = currentDoc(req.params.kind); if (!x) throw new HttpError(404, 'Not found');
  const pdf = await blankPdf([{ ...x, body: fillTemplate(x.body, dealerVars(d)) }], { ref: `D${d.id}-${req.params.kind.toUpperCase()}-v${x.version}`, who: [['Dealer', d.legal_name || d.business_name], ['Dealer ID', `D-${d.id}`]] });
  res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${req.params.kind}-v${x.version}.pdf"`, 'Cache-Control': 'private, no-store' }).send(pdf);
}));
dealerOnboardingApi.get('/dealer/legal/:id/pdf', wrap(async (req, res) => {
  const a = db.prepare("SELECT * FROM legal_acceptances WHERE id = ? AND subject_type = 'dealer' AND subject_id = ?").get(Number(req.params.id), req.dealer.id);
  if (!a) throw new HttpError(404, 'Not found');
  res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${a.ref_no}.pdf"`, 'Cache-Control': 'private, no-store' }).send(await acceptancePdf(a));
}));

// ---------------------------------------------------------------- admin: dealer verification
adminDealerVerification.use(requireAdmin('owner', 'manager'));
const adminActor = (req) => ({ actor_type: 'admin', actor_id: req.admin?.id || null });
function summaryRow(d) {
  const docs = dealerDocs(d.id); const signed = dealerSigned(d.id); const p = onboardingProgress({ dealer: d, docs, signed });
  const latest = latestDocs(docs);
  return {
    id: d.id, dealer_code: `D-${d.id}`, business_name: d.business_name, legal_name: d.legal_name, name: d.name, phone: d.phone, city: d.city,
    business_type: BUSINESS_TYPES[d.business_type] || '—', registered_at: d.created_at, submitted_at: d.submitted_at, deadline: d.onboarding_deadline,
    status: d.onboarding_status, status_label: ONBOARDING_STATUS[d.onboarding_status]?.label, tone: ONBOARDING_STATUS[d.onboarding_status]?.tone,
    kyc: p.done.business && p.done.kyc ? 'Complete' : 'Incomplete',
    documents: p.verified ? 'Verified' : p.rejected.length ? `${p.rejected.length} rejected` : p.missing.length ? `${p.missing.length} missing` : Object.values(latest).some((x) => x.status === 'pending') ? 'To check' : 'Uploaded',
    agreement: signed ? 'Signed' : 'Not signed', can_receive_orders: canReceiveOrders(d), self_registered: !!d.self_registered,
  };
}
adminDealerVerification.get('/dealer-verification', (req, res) => {
  const st = ONBOARDING_STATUS[req.query.status] ? req.query.status : null;
  const rows = db.prepare(`SELECT * FROM dealers ${st ? 'WHERE onboarding_status = ?' : ''} ORDER BY CASE onboarding_status WHEN 'under_review' THEN 0 WHEN 'agreement_signed' THEN 0 WHEN 'documents_rejected' THEN 1 WHEN 'draft' THEN 2 ELSE 3 END, COALESCE(submitted_at, created_at) DESC`).all(...(st ? [st] : []));
  const counts = Object.fromEntries(db.prepare('SELECT onboarding_status s, COUNT(*) n FROM dealers GROUP BY onboarding_status').all().map((x) => [x.s, x.n]));
  res.json({ items: rows.map(summaryRow), counts, statuses: ONBOARDING_STATUS });
});
adminDealerVerification.get('/dealer-verification/:id', wrap((req, res) => {
  const d = row(Number(req.params.id)); if (!d) throw new HttpError(404, 'Not found');
  const v = onboardingView(d);
  const acc = db.prepare("SELECT * FROM legal_acceptances WHERE subject_type = 'dealer' AND subject_id = ? ORDER BY id DESC").all(d.id).map(acceptanceView);
  const audit = db.prepare("SELECT * FROM legal_audit WHERE subject_type = 'dealer' AND subject_id = ? ORDER BY id DESC LIMIT 200").all(d.id)
    .map((a) => ({ ...a, detail: parseJSON(a.detail, {}), label: AUDIT_ACTIONS[a.action] || a.action }));
  res.json({ ...summaryRow(d), ...v, acceptances: acc, audit, commercial_full: dealerCommercial(d), models: COMMERCIAL_MODELS });
}));
adminDealerVerification.post('/dealer-verification/:id/bank/reveal', requireAdmin('owner'), wrap((req, res) => {
  const d = row(Number(req.params.id)); if (!d) throw new HttpError(404, 'Not found');
  legalAudit(req, { ...adminActor(req), subject_type: 'dealer', subject_id: d.id, action: 'bank_viewed', detail: {} });
  res.set('Cache-Control', 'no-store').json({ bank_account: d.bank_account_enc ? decrypt(d.bank_account_enc) : null });
}));
adminDealerVerification.get('/dealer-verification/:id/documents/:docId/file', wrap((req, res) => {
  const x = db.prepare('SELECT * FROM dealer_documents WHERE id = ? AND dealer_id = ?').get(Number(req.params.docId), Number(req.params.id));
  if (!x) throw new HttpError(404, 'Not found');
  legalAudit(req, { ...adminActor(req), subject_type: 'dealer', subject_id: x.dealer_id, action: 'doc_viewed', detail: { id: x.id, doc_type: x.doc_type } });
  res.set({ 'Cache-Control': 'private, no-store', 'Content-Type': x.mime, 'Content-Disposition': `${req.query.download ? 'attachment' : 'inline'}; filename="D${x.dealer_id}-${x.doc_type}${x.mime === 'application/pdf' ? '.pdf' : x.mime === 'image/png' ? '.png' : '.jpg'}"`, 'X-Content-Type-Options': 'nosniff' }).sendFile(legalFile(x.file));
}));
adminDealerVerification.post('/dealer-verification/:id/documents/:docId', wrap((req, res) => {
  const x = db.prepare('SELECT * FROM dealer_documents WHERE id = ? AND dealer_id = ?').get(Number(req.params.docId), Number(req.params.id));
  if (!x) throw new HttpError(404, 'Not found');
  const b = parse(z.object({ action: z.enum(['verify', 'reject']), reason: z.string().trim().max(300).optional().default('') }), req.body);
  if (b.action === 'reject' && b.reason.length < 3) throw fieldsError({ reason: 'Tell the dealer what is wrong' });
  db.prepare('UPDATE dealer_documents SET status = ?, reject_reason = ?, verified_by = ?, verified_at = ? WHERE id = ?').run(b.action === 'verify' ? 'verified' : 'rejected', b.action === 'reject' ? b.reason : null, req.admin?.id || null, now(), x.id);
  const d = row(x.dealer_id);
  if (b.action === 'reject' && !['approved', 'suspended', 'terminated', 'rejected'].includes(d.onboarding_status)) {
    db.prepare("UPDATE dealers SET onboarding_status = 'documents_rejected', status_reason = ? WHERE id = ?").run(`${DOC_TYPES[x.doc_type]?.label}: ${b.reason}`, d.id);
    notifyContact({ email: d.email || null, phone: d.phone, template: 'dealer_doc_rejected', subject: 'Please upload a document again', text: `Namaste ${d.name},\n\nWe could not accept your ${DOC_TYPES[x.doc_type]?.label}: ${b.reason}\nPlease upload it again in the dealer app: ${config.publicUrl}/dealer/onboarding\n\nUtsav Ghar` }).catch(() => {});
  }
  legalAudit(req, { ...adminActor(req), subject_type: 'dealer', subject_id: d.id, action: b.action === 'verify' ? 'doc_verified' : 'doc_rejected', detail: { id: x.id, doc_type: x.doc_type, reason: b.reason || null } });
  res.json({ ok: true });
}));

const STATUS_FOR = { approve: 'approved', reject: 'rejected', request_docs: 'documents_pending', request_correction: 'draft', suspend: 'suspended', terminate: 'terminated', reinstate: 'approved', request_signature: 'agreement_pending' };
adminDealerVerification.post('/dealer-verification/:id/action', wrap((req, res) => {
  const d = row(Number(req.params.id)); if (!d) throw new HttpError(404, 'Not found');
  const b = parse(z.object({ action: z.enum(Object.keys(STATUS_FOR)), reason: z.string().trim().max(500).optional().default(''), docs: z.array(z.string().max(40)).max(12).optional().default([]) }), req.body);
  if (b.action !== 'approve' && b.action !== 'reinstate' && b.reason.length < 3) throw fieldsError({ reason: 'Add a short reason (the dealer will see it)' });
  if (b.action === 'approve' || b.action === 'reinstate') {
    const p = onboardingProgress({ dealer: d, docs: dealerDocs(d.id), signed: dealerSigned(d.id) });
    if (!p.done.business || !p.done.kyc) throw new HttpError(409, 'Business or KYC details are incomplete.');
    if (!p.verified) throw new HttpError(409, 'Verify every required document before approving.');
    if (!dealerSigned(d.id)) throw new HttpError(409, 'The dealer has not signed the current agreement.');
    if (b.action === 'approve' && !(parseJSON(d.pincodes, []).length || d.all_india)) throw new HttpError(409, 'Set the PIN codes this dealer delivers to (Dealers → Edit) before approving.');
  }
  if (b.action === 'reinstate' && d.onboarding_status !== 'suspended') throw new HttpError(409, 'Only a suspended dealer can be reinstated.');
  const st = STATUS_FOR[b.action];
  db.prepare(`UPDATE dealers SET onboarding_status = ?, status_reason = ?, ${st === 'approved' ? 'approved_at = ?, approved_by = ?, onboarding_deadline = NULL,' : ''} updated_at = ? WHERE id = ?`)
    .run(...[st, b.reason || null, ...(st === 'approved' ? [now(), req.admin?.id || null] : []), now(), d.id]);
  if (b.action === 'terminate') db.prepare('UPDATE dealers SET is_active = 0, token_version = token_version + 1 WHERE id = ?').run(d.id);
  const action = { approve: 'dealer_approved', reject: 'dealer_rejected', request_docs: 'docs_requested', request_correction: 'docs_requested', suspend: 'dealer_suspended', terminate: 'dealer_terminated', reinstate: 'dealer_reinstated', request_signature: 'docs_requested' }[b.action];
  legalAudit(req, { ...adminActor(req), subject_type: 'dealer', subject_id: d.id, action, detail: { reason: b.reason || null, docs: b.docs } });
  const msg = {
    approve: 'Your dealer account is approved. You will start receiving orders for your area.',
    reinstate: 'Your dealer account is active again.',
    reject: `Your dealer application was not approved: ${b.reason}`,
    request_docs: `Please upload these documents: ${b.docs.map((k) => DOC_TYPES[k]?.label || k).join(', ') || b.reason}. ${b.reason}`,
    request_correction: `Please correct your details: ${b.reason}`,
    suspend: `Your dealer account is suspended: ${b.reason}. New orders are paused.`,
    terminate: `Your dealer agreement has been terminated: ${b.reason}`,
    request_signature: `Please review and sign the dealer agreement again: ${b.reason}`,
  }[b.action];
  notifyContact({ email: d.email || null, phone: d.phone, template: `dealer_${b.action}`, subject: 'Your Utsav Ghar dealer account', text: `Namaste ${d.name},\n\n${msg}\n\nDealer app: ${config.publicUrl}/dealer\n\nUtsav Ghar` }).catch(() => {});
  res.json({ ok: true, ...summaryRow(row(d.id)) });
}));
const commercialSchema = z.object({
  model: z.enum(['supply', 'commission']), commission_pct: z.coerce.number().min(0).max(60).default(0), platform_fee: z.coerce.number().min(0).max(10000).default(0),
  payment_fee_pct: z.coerce.number().min(0).max(10).default(2), settlement_days: z.coerce.number().int().min(1).max(90).default(7), return_window_days: z.coerce.number().int().min(0).max(60).default(7),
  late_dispatch_penalty: z.coerce.number().min(0).max(10000).default(0), logistics: z.enum(['dealer', 'platform']).default('dealer'),
});
adminDealerVerification.put('/dealer-verification/:id/commercial', wrap((req, res) => {
  const d = row(Number(req.params.id)); if (!d) throw new HttpError(404, 'Not found');
  const b = parse(commercialSchema, req.body);
  const before = dealerCommercial(d);
  const changed = JSON.stringify({ ...DEFAULT_COMMERCIAL, ...b }) !== JSON.stringify(before);
  db.prepare('UPDATE dealers SET commercial = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(b), now(), d.id);
  // signed terms changed → the dealer must sign again (no new orders until then)
  const resign = changed && dealerSigned(d.id);
  if (resign) db.prepare("UPDATE dealers SET onboarding_status = 'agreement_pending', status_reason = 'Commercial terms were updated. Please review and sign again.' WHERE id = ?").run(d.id);
  legalAudit(req, { ...adminActor(req), subject_type: 'dealer', subject_id: d.id, action: 'commercial_updated', detail: { before, after: b, resign } });
  res.json({ ok: true, resign, commercial_full: dealerCommercial(row(d.id)) });
}));
adminDealerVerification.get('/dealer-verification/:id/acceptances/:accId/pdf', wrap(async (req, res) => {
  const a = db.prepare("SELECT * FROM legal_acceptances WHERE id = ? AND subject_type = 'dealer' AND subject_id = ?").get(Number(req.params.accId), Number(req.params.id));
  if (!a) throw new HttpError(404, 'Not found');
  res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${a.ref_no}.pdf"`, 'Cache-Control': 'private, no-store' }).send(await acceptancePdf(a));
}));

// ---------------------------------------------------------------- admin: Legal & Compliance Center
adminLegal.use(requireAdmin('owner', 'manager'));
const owner = requireAdmin('owner', 'legal'); // legal-changing actions: owner or Legal Admin
const adminName = (req) => req.admin?.name || `Admin #${req.admin?.id || '?'}`;
const docSummary = (r) => ({ id: r.id, kind: r.kind, version: r.version, title: r.title, status: r.status, status_label: DOC_STATUS[r.status]?.label, material: !!r.material, change_note: r.change_note, effective_at: r.effective_at, published_at: r.published_at, retired_at: r.retired_at, updated_at: r.updated_at, created_at: r.created_at,
  legal_reviewer: r.legal_reviewer, review_note: r.review_note, approved_at: r.approved_at, submitted_review_at: r.submitted_review_at, legal_approved: !!r.legal_approved,
  category: r.category || DOC_KINDS[r.kind]?.category || 'company', icon: r.icon || DOC_KINDS[r.kind]?.icon || '📄', description: r.description || DOC_KINDS[r.kind]?.desc || '', owner_name: r.owner_name, next_review_at: r.next_review_at,
  applies_to: r.applies_to, countries: r.countries || 'India', policy_type: r.policy_type, internal_submitted_at: r.internal_submitted_at, internal_reviewer: r.internal_reviewer, internal_reviewed_at: r.internal_reviewed_at,
  created_by_name: r.created_by_name, approved_by_name: r.approved_by_name, published_by_name: r.published_by_name,
  accepted: db.prepare('SELECT COUNT(*) n FROM legal_acceptances WHERE document_id = ?').get(r.id).n });

const istDate = (t) => (t ? new Date(t).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' }) : '');
/** Approval information printed on policy PDFs. */
export const approvalRows = (r) => [
  ['Document status', DOC_STATUS[r.status]?.label || r.status],
  ['Legal approval', r.legal_reviewer ? `${r.legal_reviewer}${r.approved_at ? ` - ${istDate(r.approved_at)}` : ''}` : 'Not yet approved by legal counsel'],
  ...(r.approved_by_name ? [['Approved in system by', r.approved_by_name]] : []), ...(r.published_by_name ? [['Published by', `${r.published_by_name} - ${istDate(r.published_at)}`]] : []),
  ...(r.owner_name ? [['Policy owner', r.owner_name]] : []), ...(r.next_review_at ? [['Next review', istDate(r.next_review_at)]] : []),
];
adminLegal.get('/legal/center', (req, res) => {
  res.set('Cache-Control', 'no-store').json({ ...legalCenter(), company: companyVars(), unread: db.prepare("SELECT COUNT(*) n FROM legal_notices WHERE audience = 'admin' AND read_at IS NULL").get().n,
    recent: db.prepare('SELECT a.*, u.name actor_name FROM legal_audit a LEFT JOIN admin_users u ON a.actor_type = \'admin\' AND u.id = a.actor_id ORDER BY a.id DESC LIMIT 12').all().map((a) => ({ ...a, detail: parseJSON(a.detail, {}), label: AUDIT_ACTIONS[a.action] || a.action })) });
});
adminLegal.get('/legal/docs', (req, res) => {
  const all = db.prepare('SELECT * FROM legal_documents ORDER BY kind, id DESC').all();
  const kinds = policyCatalog(all).map((k) => ({ ...k, current: currentDoc(k.kind)?.id || null, versions: all.filter((r) => r.kind === k.kind).map(docSummary) }));
  res.json({ kinds, company: companyVars(), company_keys: Object.keys(COMPANY_DEFAULTS), statuses: DOC_STATUS, unreviewed_live: all.filter((r) => r.status === 'published' && !r.legal_approved && kinds.some((k) => k.current === r.id)).length });
});
adminLegal.get('/legal/kinds/:kind', wrap((req, res) => {
  const rows = db.prepare('SELECT * FROM legal_documents WHERE kind = ? ORDER BY id DESC').all(req.params.kind);
  if (!rows.length && !DOC_KINDS[req.params.kind]) throw new HttpError(404, 'Not found');
  const cur = currentDoc(req.params.kind);
  const audit = db.prepare("SELECT a.*, u.name actor_name FROM legal_audit a LEFT JOIN admin_users u ON a.actor_type = 'admin' AND u.id = a.actor_id WHERE a.detail LIKE ? ORDER BY a.id DESC LIMIT 100").all(`%"kind":"${req.params.kind}"%`)
    .map((a) => ({ ...a, detail: parseJSON(a.detail, {}), label: AUDIT_ACTIONS[a.action] || a.action }));
  res.json({ kind: req.params.kind, meta: DOC_KINDS[req.params.kind] || null, current: cur?.id || null, versions: rows.map((r) => ({ ...docSummary(r), state: policyState(r, cur, Date.now()) })), audit, acceptance: acceptanceData()[req.params.kind] || null });
}));
adminLegal.get('/legal/docs/:id', wrap((req, res) => { const r = docRow(Number(req.params.id)); if (!r) throw new HttpError(404, 'Not found'); res.json({ ...docSummary(r), body: r.body, preview: fillTemplate(r.body, companyVars()), simple: parseLegalDoc(r.body).intro }); }));
const bump = (v) => { const [a, b = 0] = String(v).split('.').map(Number); return `${a}.${(b || 0) + 1}`; };
const dateOrNull = (v) => (v ? new Date(`${String(v).slice(0, 10)}T00:00:00+05:30`).toISOString() : null);
const meta = {
  description: z.string().trim().max(400).optional(), owner_name: z.string().trim().max(120).optional(), next_review_at: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/).optional(),
  planned_effective_at: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/).optional(), applies_to: z.enum(Object.keys(APPLIES_TO)).optional(), countries: z.string().trim().max(200).optional(),
  policy_type: z.enum(Object.keys(POLICY_TYPES)).optional(), icon: z.string().trim().max(8).optional(), simple: z.string().trim().max(600).optional(),
};
/** Create a policy (wizard) or the next version of an existing one. */
adminLegal.post('/legal/docs', owner, wrap((req, res) => {
  const b = parse(z.object({
    kind: z.string().max(60).optional(), category: z.enum(['customer', 'dealer', 'company']).optional(), title: z.string().trim().max(120).optional(), version: z.string().trim().regex(/^\d{1,3}\.\d{1,3}$/, 'Use a version like 1.2 or 2.0').optional(),
    start: z.enum(['current', 'starter', 'blank']).optional().default('current'), submit: z.boolean().optional().default(false), change_note: z.string().trim().max(500).optional(), ...meta,
  }), req.body);
  let kind = b.kind;
  if (!kind) {
    if (!b.title || b.title.length < 3) throw fieldsError({ title: 'Enter the policy name' });
    kind = `custom_${b.title.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40)}`;
    if (DOC_KINDS[kind] || db.prepare('SELECT 1 FROM legal_documents WHERE kind = ?').get(kind)) throw fieldsError({ title: 'A policy with this name already exists' });
  }
  if (DOC_KINDS[kind]?.legacy) throw new HttpError(400, 'This document is no longer used.');
  if (!DOC_KINDS[kind] && !/^custom_[a-z0-9_]{2,40}$/.test(kind)) throw new HttpError(400, 'Unknown policy');
  const busy = db.prepare(`SELECT id FROM legal_documents WHERE kind = ? AND status IN (${IN_PROGRESS_STATUSES.map(() => '?').join(',')})`).get(kind, ...IN_PROGRESS_STATUSES);
  if (busy) throw new HttpError(409, 'A new version of this policy is already in progress. Open it from the library to continue.', { id: busy.id });
  const base = db.prepare('SELECT * FROM legal_documents WHERE kind = ? ORDER BY id DESC LIMIT 1').get(kind) || null;
  let version = b.version || (base ? bump(base.version) : '1.0');
  if (db.prepare('SELECT 1 FROM legal_documents WHERE kind = ? AND version = ?').get(kind, version)) { if (b.version) throw fieldsError({ version: 'This version number is already used' }); while (db.prepare('SELECT 1 FROM legal_documents WHERE kind = ? AND version = ?').get(kind, version)) version = bump(version); }
  const m = DOC_KINDS[kind] || {};
  const title = b.title || base?.title || m.label;
  let body = b.start === 'blank' ? `# ${title}\n\n> \n\n## In simple words\n- \n\n## 1. Introduction\n> What this means: \n` : b.start === 'starter' ? (STARTER_POLICIES[kind]?.body || DEFAULT_LEGAL_DOCS[kind]?.body || '') : (base?.body || STARTER_POLICIES[kind]?.body || DEFAULT_LEGAL_DOCS[kind]?.body || `# ${title}\n\n> \n\n## 1. Introduction\n> What this means: \n`);
  if (b.simple != null) body = setIntro(body, b.simple);
  const t = now(); const cat = b.category || base?.category || m.category || 'company';
  const id = db.prepare(`INSERT INTO legal_documents(kind, version, title, body, status, material, change_note, category, icon, description, owner_name, next_review_at, effective_at, applies_to, countries, policy_type, created_by, created_by_name, created_at, updated_at)
    VALUES(?,?,?,?,'draft',0,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(kind, version, title, body, b.change_note || null, cat, b.icon || base?.icon || m.icon || '📄', b.description ?? base?.description ?? m.desc ?? null,
    b.owner_name ?? base?.owner_name ?? null, dateOrNull(b.next_review_at) ?? null, dateOrNull(b.planned_effective_at), b.applies_to || base?.applies_to || (cat === 'dealer' ? 'dealers' : cat === 'customer' ? 'customers' : 'everyone'),
    b.countries || base?.countries || 'India', b.policy_type || base?.policy_type || cat, req.admin?.id || null, adminName(req), t, t).lastInsertRowid;
  legalAudit(req, { ...adminActor(req), action: base ? 'version_created' : 'policy_created', detail: { kind, version, title } });
  if (b.submit) transition(req, id, 'submit');
  const r = docRow(id);
  res.status(201).json({ ...docSummary(r), body: r.body, simple: parseLegalDoc(r.body).intro });
}));
adminLegal.put('/legal/docs/:id', owner, wrap((req, res) => {
  const r = docRow(Number(req.params.id)); if (!r) throw new HttpError(404, 'Not found');
  if (!EDITABLE_STATUSES.includes(r.status)) throw new HttpError(409, r.status === 'published' || r.status === 'retired' ? 'Published versions cannot be changed. Create a new version.' : 'This version is in review. Ask for changes to edit it again.');
  const b = parse(z.object({ title: z.string().trim().min(3).max(120), body: z.string().min(50, 'The document is too short').max(200_000), version: z.string().trim().regex(/^\d{1,3}\.\d{1,3}$/, 'Use a version like 1.2 or 2.0'), change_note: z.string().trim().max(500).optional().default(''), material: z.boolean().default(false), ...meta }), req.body);
  if (db.prepare('SELECT 1 FROM legal_documents WHERE kind = ? AND version = ? AND id != ?').get(r.kind, b.version, r.id)) throw fieldsError({ version: 'This version number is already used' });
  const body = b.simple != null ? setIntro(b.body, b.simple) : b.body;
  db.prepare(`UPDATE legal_documents SET title = ?, body = ?, version = ?, change_note = ?, material = ?, description = COALESCE(?, description), owner_name = COALESCE(?, owner_name), next_review_at = ?, effective_at = ?,
    applies_to = COALESCE(?, applies_to), countries = COALESCE(?, countries), policy_type = COALESCE(?, policy_type), icon = COALESCE(?, icon), updated_at = ? WHERE id = ?`)
    .run(b.title, body, b.version, b.change_note || null, b.material ? 1 : 0, b.description ?? null, b.owner_name ?? null, b.next_review_at === undefined ? r.next_review_at : dateOrNull(b.next_review_at), b.planned_effective_at === undefined ? r.effective_at : dateOrNull(b.planned_effective_at),
      b.applies_to ?? null, b.countries ?? null, b.policy_type ?? null, b.icon || null, now(), r.id);
  legalAudit(req, { ...adminActor(req), action: 'version_edited', detail: { kind: r.kind, version: b.version } });
  const x = docRow(r.id);
  res.json({ ...docSummary(x), body: x.body, simple: parseLegalDoc(x.body).intro });
}));
adminLegal.delete('/legal/docs/:id', owner, wrap((req, res) => {
  const r = docRow(Number(req.params.id)); if (!r) throw new HttpError(404, 'Not found');
  if (!EDITABLE_STATUSES.includes(r.status)) throw new HttpError(409, 'Versions in review, published or archived are legal records and cannot be deleted.');
  db.prepare('DELETE FROM legal_documents WHERE id = ?').run(r.id);
  legalAudit(req, { ...adminActor(req), action: 'version_edited', detail: { kind: r.kind, version: r.version, deleted: true } });
  res.json({ ok: true });
}));

/** Draft → Internal review → Legal review → Approved → Published (→ Archived); Changes requested goes back to editing. */
function transition(req, id, step, extra = {}) {
  const r = docRow(Number(id)); if (!r) throw new HttpError(404, 'Not found');
  const w = WORKFLOW[step];
  if (!w.from.includes(r.status)) {
    const msg = { submit: 'Only a draft can be sent for review.', internal_approve: 'Only a version in internal review can be passed to legal review.', approve: 'Only a version in legal review can be approved.', publish: 'Only a version approved in legal review can be published. Send the draft for review first.', retire: 'Only a published version can be archived.', return: 'Only a version in review or approved can be sent back for changes.' }[step];
    throw new HttpError(409, msg);
  }
  const t = now(); const set = { status: w.to, updated_at: t, ...extra };
  if (step === 'submit') { if (String(r.body).length < 50) throw new HttpError(400, 'The document is too short.'); set.internal_submitted_at = t; set.review_note = null; }
  if (step === 'internal_approve') { set.internal_reviewer = extra.internal_reviewer || adminName(req); set.internal_reviewed_at = t; set.submitted_review_at = t; }
  if (step === 'approve') { set.approved_by = req.admin?.id || null; set.approved_by_name = adminName(req); set.approved_at = t; }
  if (step === 'publish') { set.legal_approved = 1; set.published_at = t; set.published_by_name = adminName(req); }
  if (step === 'retire') {
    if (db.prepare("SELECT COUNT(*) n FROM legal_documents WHERE kind = ? AND status = 'published' AND id != ? AND effective_at <= ?").get(r.kind, r.id, t).n === 0 && DOC_KINDS[r.kind]?.accept) throw new HttpError(409, 'Publish a newer version first — new customers or dealers must always have a version to accept.');
    set.retired_at = t;
  }
  db.prepare(`UPDATE legal_documents SET ${Object.keys(set).map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(...Object.values(set), r.id);
  legalAudit(req, { ...adminActor(req), action: w.action, detail: { kind: r.kind, version: r.version, title: r.title, note: extra.review_note || null, reviewer: extra.legal_reviewer || null } });
  const x = docRow(r.id);
  if (step === 'approve') addNotice({ audience: 'admin', kind: 'ready', title: `${x.title} v${x.version} is ready for publication.`, body: `Approved by ${x.legal_reviewer}.`, link: `policy:${x.kind}` });
  if (step === 'return') addNotice({ audience: 'admin', kind: 'changes', title: `Changes requested on ${x.title} v${x.version}`, body: x.review_note || '', link: `policy:${x.kind}` });
  if (step === 'publish') announcePublished(x);
  return x;
}
adminLegal.post('/legal/docs/:id/submit', owner, wrap((req, res) => res.json(docSummary(transition(req, req.params.id, 'submit')))));
adminLegal.post('/legal/docs/:id/internal-approve', owner, wrap((req, res) => {
  const b = parse(z.object({ note: z.string().trim().max(500).optional().default('') }), req.body || {});
  res.json(docSummary(transition(req, req.params.id, 'internal_approve', { review_note: b.note || null })));
}));
adminLegal.post('/legal/docs/:id/approve', owner, wrap((req, res) => {
  const b = parse(z.object({ reviewer: z.string().trim().min(3, 'Name of the lawyer / firm who reviewed it').max(160), note: z.string().trim().max(500).optional().default(''), confirm: z.literal(true, { errorMap: () => ({ message: 'Confirm the legal review' }) }) }), req.body);
  res.json(docSummary(transition(req, req.params.id, 'approve', { legal_reviewer: b.reviewer, review_note: b.note || null })));
}));
adminLegal.post('/legal/docs/:id/return', owner, wrap((req, res) => {
  const b = parse(z.object({ note: z.string().trim().max(500).optional().default('') }), req.body || {});
  res.json(docSummary(transition(req, req.params.id, 'return', { review_note: b.note || 'Changes requested' })));
}));
adminLegal.get('/legal/docs/:id/pdf', wrap(async (req, res) => {
  const r = docRow(Number(req.params.id)); if (!r) throw new HttpError(404, 'Not found');
  const pdf = await blankPdf([{ ...r, body: fillTemplate(r.body, companyVars()) }], { ref: `${r.kind.toUpperCase()}-v${r.version}-${r.status.toUpperCase()}`, who: approvalRows(r) });
  res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${r.kind}-v${r.version}.pdf"`, 'Cache-Control': 'private, no-store' }).send(pdf);
}));
adminLegal.post('/legal/docs/:id/publish', owner, wrap((req, res) => {
  const b = parse(z.object({ effective_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')), next_review_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')), material: z.boolean().optional() }), req.body);
  const r = docRow(Number(req.params.id)); if (!r) throw new HttpError(404, 'Not found');
  const eff = b.effective_at ? dateOrNull(b.effective_at) : now();
  const review = b.next_review_at ? dateOrNull(b.next_review_at) : r.next_review_at || new Date(Date.parse(eff) + 365 * 864e5).toISOString();
  res.json(docSummary(transition(req, r.id, 'publish', { effective_at: eff, next_review_at: review, review_reminded_at: null, material: b.material == null ? r.material : b.material ? 1 : 0 })));
}));
adminLegal.post('/legal/docs/:id/retire', owner, wrap((req, res) => res.json(docSummary(transition(req, req.params.id, 'retire')))));

// acceptance tracking
adminLegal.get('/legal/acceptance', (req, res) => {
  const stats = acceptanceData();
  const docs = db.prepare("SELECT kind, version, status, id, (SELECT COUNT(*) FROM legal_acceptances a WHERE a.document_id = legal_documents.id) n FROM legal_documents WHERE status IN ('published','retired') ORDER BY kind, id").all();
  res.json({ stats: Object.values(stats).map((s) => ({ ...s, title: DOC_KINDS[s.kind]?.label })), by_version: docs });
});
adminLegal.get('/legal/acceptance/:kind/people', wrap((req, res) => {
  const m = DOC_KINDS[req.params.kind]; if (!m?.accept) throw new HttpError(404, 'Not found');
  const want = ['accepted', 'pending', 'older'].includes(req.query.status) ? req.query.status : 'pending';
  const cur = currentDoc(req.params.kind);
  const people = m.accept === 'customer' ? db.prepare('SELECT id, name, email, phone FROM users ORDER BY id DESC LIMIT 5000').all() : db.prepare("SELECT id, business_name name, email, phone FROM dealers WHERE onboarding_status NOT IN ('rejected','terminated')").all();
  const pend = new Set(people.filter((p) => pendingFor(m.accept, p.id, [req.params.kind]).length).map((p) => p.id));
  const lastQ = db.prepare('SELECT ref_no, version, document_id, accepted_at FROM legal_acceptances WHERE subject_type = ? AND subject_id = ? AND kind = ? ORDER BY id DESC LIMIT 1');
  const rows = people.map((p) => { const a = lastQ.get(m.accept, p.id, req.params.kind); const st = pend.has(p.id) ? 'pending' : a?.document_id === cur?.id ? 'accepted' : 'older'; return { ...p, who: m.accept, status: st, version: a?.version || null, ref_no: a?.ref_no || null, accepted_at: a?.accepted_at || null }; });
  res.json({ items: rows.filter((r) => r.status === want).slice(0, 500), total: rows.filter((r) => r.status === want).length });
}));
adminLegal.get('/legal/acceptance/report', (req, res) => {
  const rows = db.prepare('SELECT * FROM legal_acceptances ORDER BY id DESC LIMIT 20000').all();
  legalAudit(req, { ...adminActor(req), action: 'report_exported', detail: { rows: rows.length } });
  res.json({ rows: [['Agreement no.', 'Who', 'ID', 'Name', 'Email', 'Mobile', 'Document', 'Version', 'Accepted at', 'Verification', 'IP'],
    ...rows.map((a) => [a.ref_no, a.subject_type, `${a.subject_type === 'dealer' ? 'D' : 'C'}-${a.subject_id}`, a.name, a.email, a.phone, DOC_KINDS[a.kind]?.label || a.kind, a.version, a.accepted_at, a.verification || '', a.ip || ''])] });
});

// dealer compliance
adminLegal.get('/legal/dealers', (req, res) => res.set('Cache-Control', 'no-store').json({ items: dealerProfiles(), rules: getHealthRules(), levels: HEALTH_LEVELS }));
adminLegal.get('/legal/dealers/:id/health', wrap((req, res) => {
  const d = row(Number(req.params.id)); if (!d) throw new HttpError(404, 'Not found');
  res.json({ dealer: { id: d.id, business_name: d.business_name, name: d.name }, health: dealerHealth(d), violations: violationRows(d.id),
    acceptances: db.prepare("SELECT * FROM legal_acceptances WHERE subject_type = 'dealer' AND subject_id = ? ORDER BY id DESC").all(d.id).map(acceptanceView),
    documents: dealerDocRows().filter((x) => x.dealer_id === d.id) });
}));
adminLegal.get('/legal/health-rules', (req, res) => res.json({ rules: getHealthRules(), metrics: HEALTH_METRICS, levels: HEALTH_LEVELS, defaults: DEFAULT_HEALTH_RULES }));
adminLegal.put('/legal/health-rules', owner, wrap((req, res) => {
  const b = parse(z.object({ window_days: z.coerce.number().int().min(7).max(365), min_orders: z.coerce.number().int().min(1).max(1000), ship_hours: z.coerce.number().int().min(1).max(720), thresholds: z.record(z.array(z.union([z.coerce.number().min(0).max(100000), z.null()])).length(3)) }), req.body);
  setHealthRules(b);
  legalAudit(req, { ...adminActor(req), action: 'health_rules_updated', detail: { window_days: b.window_days, min_orders: b.min_orders, ship_hours: b.ship_hours } });
  res.json({ rules: getHealthRules() });
}));

// policy violations
adminLegal.get('/legal/violations', (req, res) => {
  const items = violationRows();
  const counts = {}; for (const v of items) counts[v.status] = (counts[v.status] || 0) + 1;
  res.json({ items, counts, types: VIOLATION_TYPES, severity: SEVERITY, statuses: VIOLATION_STATUS, actions: VIOLATION_ACTIONS,
    dealers: db.prepare("SELECT id, business_name FROM dealers WHERE onboarding_status NOT IN ('rejected','terminated') ORDER BY business_name").all() });
});
adminLegal.get('/legal/dealers/:id/listings', wrap((req, res) => {
  res.json({ items: db.prepare('SELECT d.id, d.name, d.product_id, p.is_active FROM dealer_products d LEFT JOIN products p ON p.id = d.product_id WHERE d.dealer_id = ? AND d.product_id IS NOT NULL ORDER BY d.name').all(Number(req.params.id)).map((x) => ({ ...x, is_active: !!x.is_active })) });
}));
adminLegal.post('/legal/violations', owner, wrap((req, res) => {
  const b = parse(z.object({ dealer_id: z.coerce.number().int(), type: z.enum(Object.keys(VIOLATION_TYPES)), severity: z.enum(Object.keys(SEVERITY)), description: z.string().trim().min(5, 'Describe what happened').max(1000), policy_kind: z.string().max(60).optional().default(''), due_days: z.coerce.number().int().min(0).max(90).optional().default(7), notify: z.boolean().optional().default(true) }), req.body);
  const d = row(b.dealer_id); if (!d) throw fieldsError({ dealer_id: 'Choose a dealer' });
  const t = now(); const title = VIOLATION_TYPES[b.type];
  const hist = [{ at: t, by: adminName(req), action: 'opened', note: b.description }];
  const id = db.prepare('INSERT INTO policy_violations(dealer_id, type, severity, title, description, policy_kind, status, due_at, history, created_by_name, created_at, updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(d.id, b.type, b.severity, title, b.description, b.policy_kind || null, 'open', b.due_days ? new Date(Date.now() + b.due_days * 864e5).toISOString() : null, JSON.stringify(hist), adminName(req), t, t).lastInsertRowid;
  if (b.notify) {
    addNotice({ audience: 'dealer', dealer_id: d.id, kind: 'violation', title: `Policy issue: ${title} (${SEVERITY[b.severity].label})`, body: b.description, link: '/dealer/legal' });
    notifyContact({ email: d.email || null, phone: d.phone, template: 'dealer_violation', subject: `Policy issue on your Utsav Ghar account: ${title}`, text: `Namaste ${d.name},\n\n${b.description}\n\nPlease respond in the dealer app: ${config.publicUrl}/dealer/legal\n\nUtsav Ghar` }).catch(() => {});
  }
  addNotice({ audience: 'admin', kind: 'violation', title: `${SEVERITY[b.severity].label} violation opened for ${d.business_name}: ${title}`, link: `dealer:${d.id}` });
  legalAudit(req, { ...adminActor(req), subject_type: 'dealer', subject_id: d.id, action: 'violation_opened', detail: { id, type: b.type, severity: b.severity } });
  res.status(201).json(violationRows(d.id).find((v) => v.id === id));
}));
adminLegal.post('/legal/violations/:id/action', owner, wrap((req, res) => {
  const v = db.prepare('SELECT * FROM policy_violations WHERE id = ?').get(Number(req.params.id)); if (!v) throw new HttpError(404, 'Not found');
  const b = parse(z.object({ action: z.enum(Object.keys(VIOLATION_ACTIONS)), note: z.string().trim().max(1000).optional().default(''), product_id: z.coerce.number().int().optional() }), req.body);
  if (['closed'].includes(v.status) && b.action !== 'note') throw new HttpError(409, 'This violation is closed.');
  if (['contact', 'request_correction', 'suspend_dealer', 'close', 'resolve'].includes(b.action) && b.note.length < 3) throw fieldsError({ note: 'Add a short message or reason' });
  const d = row(v.dealer_id); const t = now(); const hist = parseJSON(v.history, []);
  let status = v.status; let detail = b.note;
  if (b.action === 'contact' || b.action === 'request_correction') {
    addNotice({ audience: 'dealer', dealer_id: d.id, kind: 'violation', title: b.action === 'request_correction' ? `Correction needed: ${v.title}` : `Message about: ${v.title}`, body: b.note, link: '/dealer/legal' });
    notifyContact({ email: d.email || null, phone: d.phone, template: `dealer_violation_${b.action}`, subject: `${b.action === 'request_correction' ? 'Correction needed' : 'Message'}: ${v.title}`, text: `Namaste ${d.name},\n\n${b.note}\n\nUtsav Ghar` }).catch(() => {});
    if (b.action === 'request_correction') status = 'correction_requested';
  }
  if (b.action === 'suspend_listing') {
    const dp = db.prepare('SELECT * FROM dealer_products WHERE id = ? AND dealer_id = ?').get(b.product_id || 0, d.id);
    if (!dp?.product_id) throw fieldsError({ product_id: 'Choose a live listing of this dealer' });
    db.prepare('UPDATE products SET is_active = 0, updated_at = ? WHERE id = ?').run(t, dp.product_id);
    db.prepare('UPDATE policy_violations SET product_id = ? WHERE id = ?').run(dp.product_id, v.id);
    addNotice({ audience: 'dealer', dealer_id: d.id, kind: 'violation', title: `Listing paused: “${dp.name}”`, body: b.note || v.title, link: '/dealer/products' });
    legalAudit(req, { ...adminActor(req), subject_type: 'dealer', subject_id: d.id, action: 'listing_suspended', detail: { product_id: dp.product_id, name: dp.name, violation: v.id } });
    detail = `“${dp.name}” hidden from the store${b.note ? ` — ${b.note}` : ''}`;
  }
  if (b.action === 'suspend_dealer') {
    if (['terminated', 'rejected'].includes(d.onboarding_status)) throw new HttpError(409, 'This dealer is not active.');
    db.prepare("UPDATE dealers SET onboarding_status = 'suspended', status_reason = ?, updated_at = ? WHERE id = ?").run(`${v.title}: ${b.note}`, t, d.id);
    legalAudit(req, { ...adminActor(req), subject_type: 'dealer', subject_id: d.id, action: 'dealer_suspended', detail: { reason: b.note, violation: v.id } });
    addNotice({ audience: 'dealer', dealer_id: d.id, kind: 'violation', title: 'Your dealer account is suspended', body: b.note, link: '/dealer/legal' });
    notifyContact({ email: d.email || null, phone: d.phone, template: 'dealer_suspend', subject: 'Your Utsav Ghar dealer account', text: `Namaste ${d.name},\n\nYour dealer account is suspended: ${b.note}. New orders are paused.\n\nUtsav Ghar` }).catch(() => {});
  }
  if (b.action === 'resolve') status = 'resolved';
  if (b.action === 'close') status = 'closed';
  hist.push({ at: t, by: adminName(req), action: b.action, note: detail });
  db.prepare('UPDATE policy_violations SET status = ?, history = ?, updated_at = ?, closed_at = ? WHERE id = ?').run(status, JSON.stringify(hist), t, ['resolved', 'closed'].includes(status) ? t : null, v.id);
  legalAudit(req, { ...adminActor(req), subject_type: 'dealer', subject_id: d.id, action: b.action === 'close' ? 'violation_closed' : 'violation_action', detail: { id: v.id, action: b.action, note: b.note || null } });
  res.json(violationRows(d.id).find((x) => x.id === v.id));
}));

// KYC & document compliance
adminLegal.get('/legal/documents', (req, res) => {
  const rows = dealerDocRows().filter((x) => x.latest);
  const summary = { valid: 0, expiring: 0, expired: 0, no_expiry: 0 }; for (const r of rows) summary[r.expiry] += 1;
  const dealers = db.prepare("SELECT * FROM dealers WHERE onboarding_status NOT IN ('rejected','terminated')").all();
  const missing = dealers.flatMap((d) => { const mine = rows.filter((x) => x.dealer_id === d.id); return requiredDocs(d).filter((k) => !mine.some((x) => x.doc_type === k && x.status !== 'rejected')).map((k) => ({ dealer_id: d.id, business_name: d.business_name, doc_type: k, label: DOC_TYPES[k]?.label })); });
  res.set('Cache-Control', 'no-store').json({ items: rows, summary, missing, states: DOC_EXPIRY });
});
adminLegal.post('/legal/documents/:id/remind', owner, wrap((req, res) => {
  const x = dealerDocRows().find((r) => r.id === Number(req.params.id)); if (!x) throw new HttpError(404, 'Not found');
  const d = row(x.dealer_id);
  const title = x.expiry === 'expired' ? `${x.label} has expired` : x.expiry_date ? `${x.label} expires on ${x.expiry_date}` : `Please check your ${x.label}`;
  addNotice({ audience: 'dealer', dealer_id: d.id, kind: 'doc_expiry', title, body: 'Upload the renewed document in Profile → KYC & documents.', link: '/dealer/onboarding' });
  notifyContact({ email: d.email || null, phone: d.phone, template: 'dealer_doc_expiry', subject: title, text: `Namaste ${d.name},\n\n${title}. Please upload the renewed document in the dealer app: ${config.publicUrl}/dealer/onboarding\n\nUtsav Ghar` }).catch(() => {});
  db.prepare('UPDATE dealer_documents SET expiry_reminded_at = ? WHERE id = ?').run(now(), x.id);
  legalAudit(req, { ...adminActor(req), subject_type: 'dealer', subject_id: d.id, action: 'reminder_sent', detail: { doc_type: x.doc_type } });
  res.json({ ok: true });
}));

// calendar & notifications
adminLegal.get('/legal/calendar', (req, res) => res.set('Cache-Control', 'no-store').json({ items: calendarData() }));
adminLegal.get('/legal/notices', (req, res) => res.set('Cache-Control', 'no-store').json({ items: noticesList(150) }));
adminLegal.post('/legal/notices/read', (req, res) => { db.prepare("UPDATE legal_notices SET read_at = ? WHERE audience = 'admin' AND read_at IS NULL").run(now()); res.json({ ok: true }); });

adminLegal.put('/legal/company', owner, wrap((req, res) => {
  const b = parse(z.object(Object.fromEntries(Object.keys(COMPANY_DEFAULTS).map((k) => [k, z.string().trim().max(300).optional().default('')]))), req.body);
  setCompanyVars(b);
  legalAudit(req, { ...adminActor(req), action: 'company_updated', detail: b });
  res.json(companyVars());
}));
adminLegal.get('/legal/stats', (req, res) => {
  const customers = db.prepare('SELECT COUNT(*) n FROM users').get().n;
  const byDoc = db.prepare('SELECT d.kind, d.version, d.status, COUNT(a.id) n FROM legal_documents d LEFT JOIN legal_acceptances a ON a.document_id = d.id GROUP BY d.id ORDER BY d.kind, d.id').all();
  const usersPending = db.prepare('SELECT id FROM users').all().filter((u) => pendingFor('customer', u.id, CUSTOMER_KINDS).length).length;
  const dealers = Object.fromEntries(db.prepare('SELECT onboarding_status s, COUNT(*) n FROM dealers GROUP BY onboarding_status').all().map((x) => [x.s, x.n]));
  const docsToCheck = db.prepare("SELECT COUNT(*) n FROM dealer_documents WHERE status = 'pending'").get().n;
  const graceEnding = db.prepare("SELECT id, business_name, onboarding_deadline FROM dealers WHERE onboarding_status != 'approved' AND onboarding_deadline IS NOT NULL ORDER BY onboarding_deadline").all();
  res.json({ customers, customers_pending: usersPending, by_doc: byDoc, dealers, docs_to_check: docsToCheck, grace: graceEnding, statuses: ONBOARDING_STATUS });
});
adminLegal.get('/legal/audit', (req, res) => {
  const q = []; const p = [];
  if (['customer', 'dealer'].includes(req.query.subject_type)) { q.push('subject_type = ?'); p.push(req.query.subject_type); }
  if (Number(req.query.subject_id)) { q.push('subject_id = ?'); p.push(Number(req.query.subject_id)); }
  if (AUDIT_ACTIONS[req.query.action]) { q.push('action = ?'); p.push(req.query.action); }
  const rows = db.prepare(`SELECT a.*, u.name actor_name FROM legal_audit a LEFT JOIN admin_users u ON a.actor_type = 'admin' AND u.id = a.actor_id ${q.length ? `WHERE ${q.map((x) => `a.${x}`).join(' AND ')}` : ''} ORDER BY a.id DESC LIMIT 300`).all(...p);
  res.json({ items: rows.map((a) => ({ ...a, detail: parseJSON(a.detail, {}), label: AUDIT_ACTIONS[a.action] || a.action })), actions: AUDIT_ACTIONS });
});
adminLegal.get('/legal/acceptances', (req, res) => {
  const qs = String(req.query.q || '').trim();
  const rows = db.prepare(`SELECT * FROM legal_acceptances ${qs ? 'WHERE ref_no LIKE ? OR name LIKE ? OR email LIKE ? OR phone LIKE ?' : ''} ORDER BY id DESC LIMIT 200`).all(...(qs ? Array(4).fill(`%${qs}%`) : []));
  res.json({ items: rows.filter((a) => !['customer', 'dealer'].includes(req.query.subject_type) || a.subject_type === req.query.subject_type).map((a) => ({ ...acceptanceView(a), subject_type: a.subject_type, subject_id: a.subject_id, name: a.name, email: a.email, phone: a.phone, ip: a.ip, user_agent: a.user_agent })) });
});
adminLegal.get('/legal/acceptances/:id/pdf', wrap(async (req, res) => {
  const a = db.prepare('SELECT * FROM legal_acceptances WHERE id = ?').get(Number(req.params.id));
  if (!a) throw new HttpError(404, 'Not found');
  res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${a.ref_no}.pdf"`, 'Cache-Control': 'private, no-store' }).send(await acceptancePdf(a));
}));
