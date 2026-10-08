/**
 * Versioned legal documents, acceptance records, dealer KYC storage and the legal audit trail.
 * Published versions are immutable: edits create a new draft; acceptances point at an exact
 * version + SHA-256 of its filled text, and signed PDFs are stored once and never regenerated.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import * as PDFLib from 'pdf-lib';
import { db, now, parseJSON } from '../db.js';
import { config } from '../config.js';
import { getSettings, setSettings } from './catalog.js';
import { PRIVATE_DIR } from './uploads.js';
import { HttpError } from './http.js';
import { DOC_KINDS, CUSTOMER_KINDS, DEALER_KINDS, CUSTOMER_CONSENTS, DEALER_CHECKS, COMPANY_DEFAULTS, fillTemplate, commercialSchedule, DEFAULT_COMMERCIAL, BUSINESS_TYPES, refNo } from '../../../shared/legal.js';
import { DEFAULT_LEGAL_DOCS } from '../../../shared/legalTemplates.js';
import { STARTER_POLICIES } from '../../../shared/policyTemplates.js';
import { buildAgreementPdf } from '../../../shared/legalPdf.js';

export const LEGAL_DIR = path.join(PRIVATE_DIR, 'legal');
fs.mkdirSync(LEGAL_DIR, { recursive: true });

db.exec(`
CREATE TABLE IF NOT EXISTS legal_documents (
  id INTEGER PRIMARY KEY, kind TEXT NOT NULL, version TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','internal_review','legal_review','changes_requested','approved','published','retired')),
  material INTEGER NOT NULL DEFAULT 0, change_note TEXT, effective_at TEXT, published_at TEXT, retired_at TEXT,
  created_by INTEGER, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(kind, version)
);
CREATE INDEX IF NOT EXISTS idx_legal_docs_kind ON legal_documents(kind, status);
CREATE TABLE IF NOT EXISTS legal_acceptances (
  id INTEGER PRIMARY KEY, ref_no TEXT NOT NULL UNIQUE, subject_type TEXT NOT NULL CHECK (subject_type IN ('customer','dealer')), subject_id INTEGER NOT NULL,
  kind TEXT NOT NULL, document_id INTEGER NOT NULL REFERENCES legal_documents(id), version TEXT NOT NULL, hash TEXT NOT NULL,
  filled_body TEXT NOT NULL, name TEXT, email TEXT, phone TEXT, consents TEXT NOT NULL DEFAULT '{}', signature TEXT,
  signature_file TEXT, pdf_file TEXT, ip TEXT, user_agent TEXT, accepted_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_legal_acc_subject ON legal_acceptances(subject_type, subject_id, kind);
CREATE TABLE IF NOT EXISTS legal_audit (
  id INTEGER PRIMARY KEY, at TEXT NOT NULL, actor_type TEXT NOT NULL, actor_id INTEGER, subject_type TEXT, subject_id INTEGER,
  action TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '{}', ip TEXT, user_agent TEXT
);
CREATE INDEX IF NOT EXISTS idx_legal_audit_subject ON legal_audit(subject_type, subject_id, at);
CREATE TABLE IF NOT EXISTS dealer_documents (
  id INTEGER PRIMARY KEY, dealer_id INTEGER NOT NULL REFERENCES dealers(id), doc_type TEXT NOT NULL, doc_number TEXT,
  file TEXT NOT NULL, original_name TEXT, mime TEXT NOT NULL, size INTEGER NOT NULL, sha256 TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','verified','rejected')), reject_reason TEXT, expiry_date TEXT,
  uploaded_at TEXT NOT NULL, verified_by INTEGER, verified_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_dealer_docs ON dealer_documents(dealer_id, doc_type);
CREATE TABLE IF NOT EXISTS dealer_sign_otps (
  dealer_id INTEGER PRIMARY KEY, code_hash TEXT NOT NULL, ref TEXT NOT NULL, tries INTEGER NOT NULL DEFAULT 0, expires_at TEXT NOT NULL, sent_at TEXT NOT NULL
);`);
const cols = (t) => db.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name);
// older databases: widen the status CHECK to the review workflow (SQLite needs a table rebuild for that)
{
  const sql = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'legal_documents'").get()?.sql || '';
  if (!sql.includes('internal_review')) {
    // rebuild with the wider CHECK, keeping every column the old table had (with its type)
    const info = db.prepare('PRAGMA table_info(legal_documents)').all();
    const base = ['id', 'kind', 'version', 'title', 'body', 'status', 'material', 'change_note', 'effective_at', 'published_at', 'retired_at', 'created_by', 'created_at', 'updated_at'];
    const extra = info.filter((c) => !base.includes(c.name)).map((c) => `, ${c.name} ${c.type || 'TEXT'}${c.notnull ? ` NOT NULL DEFAULT ${c.dflt_value ?? "''"}` : ''}`).join('');
    const names = info.map((c) => c.name).join(', ');
    db.exec(`PRAGMA foreign_keys = OFF; BEGIN;
      ALTER TABLE legal_documents RENAME TO legal_documents_old;
      CREATE TABLE legal_documents (
        id INTEGER PRIMARY KEY, kind TEXT NOT NULL, version TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','internal_review','legal_review','changes_requested','approved','published','retired')),
        material INTEGER NOT NULL DEFAULT 0, change_note TEXT, effective_at TEXT, published_at TEXT, retired_at TEXT,
        created_by INTEGER, created_at TEXT NOT NULL, updated_at TEXT NOT NULL${extra}, UNIQUE(kind, version));
      INSERT INTO legal_documents(${names}) SELECT ${names} FROM legal_documents_old;
      DROP TABLE legal_documents_old;
      CREATE INDEX IF NOT EXISTS idx_legal_docs_kind ON legal_documents(kind, status);
      COMMIT; PRAGMA foreign_keys = ON;`);
  }
}
const addCol = (t, c, d) => { if (!cols(t).includes(c)) db.exec(`ALTER TABLE ${t} ADD COLUMN ${c} ${d}`); };
const hadOnboarding = cols('dealers').includes('onboarding_status');
for (const [c, d] of [
  ['onboarding_status', "TEXT NOT NULL DEFAULT 'draft'"], ['onboarding_deadline', 'TEXT'], ['self_registered', 'INTEGER NOT NULL DEFAULT 0'],
  ['legal_name', 'TEXT'], ['business_type', 'TEXT'], ['registered_address', 'TEXT'], ['website', 'TEXT'], ['country', "TEXT DEFAULT 'India'"],
  ['pan', 'TEXT'], ['cin', 'TEXT'], ['tan', 'TEXT'], ['registration_no', 'TEXT'], ['udyam', 'TEXT'], ['trade_license', 'TEXT'], ['other_regs', 'TEXT'],
  ['bank_name', 'TEXT'], ['bank_holder', 'TEXT'], ['bank_account_enc', 'TEXT'], ['bank_last4', 'TEXT'], ['ifsc', 'TEXT'], ['bank_branch', 'TEXT'],
  ['commercial', 'TEXT'], ['submitted_at', 'TEXT'], ['approved_at', 'TEXT'], ['approved_by', 'INTEGER'], ['status_reason', 'TEXT'],
  ['phone_verified_at', 'TEXT'],
]) addCol('dealers', c, d);
for (const [c, d] of [['legal_reviewer', 'TEXT'], ['review_note', 'TEXT'], ['submitted_review_at', 'TEXT'], ['approved_by', 'INTEGER'], ['approved_at', 'TEXT'], ['legal_approved', 'INTEGER NOT NULL DEFAULT 0'],
  // Legal & Compliance Center
  ['category', 'TEXT'], ['icon', 'TEXT'], ['description', 'TEXT'], ['owner_name', 'TEXT'], ['next_review_at', 'TEXT'], ['applies_to', 'TEXT'], ['countries', 'TEXT'], ['policy_type', 'TEXT'],
  ['internal_submitted_at', 'TEXT'], ['internal_reviewer', 'TEXT'], ['internal_reviewed_at', 'TEXT'], ['created_by_name', 'TEXT'], ['approved_by_name', 'TEXT'], ['published_by_name', 'TEXT'],
  ['review_reminded_at', 'TEXT']]) addCol('legal_documents', c, d);
// earlier "legal_review" drafts keep working; older "sent back to draft" notes stay on the draft
addCol('legal_acceptances', 'verification', 'TEXT');
addCol('dealer_documents', 'expiry_reminded_at', 'TEXT');
// dealers that existed before onboarding: keep receiving orders for 14 days while they complete KYC + agreement
if (!hadOnboarding) db.prepare("UPDATE dealers SET onboarding_status = 'draft', onboarding_deadline = ? WHERE onboarding_deadline IS NULL").run(new Date(Date.now() + 14 * 864e5).toISOString());
export const GRACE_DAYS = 14;
/** Can this dealer receive new orders? Approved, or an existing dealer still inside its grace period. */
export function canReceiveOrders(d) {
  if (!d || !d.is_active) return false;
  const st = d.onboarding_status || 'draft';
  if (st === 'approved') return true;
  if (['rejected', 'suspended', 'terminated'].includes(st)) return false;
  return !!(d.onboarding_deadline && Date.parse(d.onboarding_deadline) > Date.now());
}
for (const [c, d] of [['address', 'TEXT'], ['city', 'TEXT'], ['state', 'TEXT'], ['pincode', 'TEXT'], ['country', "TEXT DEFAULT 'India'"], ['dob', 'TEXT']]) addCol('users', c, d);

// ---------------------------------------------------------------- audit
export function legalAudit(req, { actor_type, actor_id = null, subject_type = null, subject_id = null, action, detail = {} }) {
  db.prepare('INSERT INTO legal_audit(at, actor_type, actor_id, subject_type, subject_id, action, detail, ip, user_agent) VALUES(?,?,?,?,?,?,?,?,?)')
    .run(now(), actor_type, actor_id, subject_type, subject_id, action, JSON.stringify(detail || {}), req ? clientIp(req) : null, req ? String(req.get?.('user-agent') || '').slice(0, 300) : null);
}
export const clientIp = (req) => String(req.ip || '').replace(/^::ffff:/, '').slice(0, 64);

// ---------------------------------------------------------------- bank data at rest (AES-256-GCM)
const KEY = crypto.createHash('sha256').update(process.env.DATA_ENCRYPTION_KEY || crypto.createHmac('sha256', config.adminJwtSecret).update('dealer-bank-v1').digest('hex')).digest();
export function encrypt(plain) {
  const iv = crypto.randomBytes(12); const c = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const enc = Buffer.concat([c.update(String(plain), 'utf8'), c.final()]);
  return `v1:${iv.toString('base64')}:${c.getAuthTag().toString('base64')}:${enc.toString('base64')}`;
}
export function decrypt(s) {
  if (!s) return null;
  const [, iv, tag, enc] = String(s).split(':');
  const d = crypto.createDecipheriv('aes-256-gcm', KEY, Buffer.from(iv, 'base64')); d.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(enc, 'base64')), d.final()]).toString('utf8');
}

// ---------------------------------------------------------------- documents & versions
export function companyVars() {
  const s = getSettings();
  const c = typeof s.legal_company === 'object' && s.legal_company ? s.legal_company : parseJSON(s.legal_company, {}) || {};
  return { ...COMPANY_DEFAULTS, ...Object.fromEntries(Object.entries(c).filter(([, v]) => v)) };
}
export const setCompanyVars = (v) => setSettings({ legal_company: JSON.stringify(v) });

/** First start: version 1.0 of every document, published so sign-up works; marked DRAFT inside for legal review. */
export function seedLegalDocs() {
  const t = now();
  for (const [kind, d] of Object.entries(DEFAULT_LEGAL_DOCS)) {
    if (db.prepare('SELECT 1 FROM legal_documents WHERE kind = ?').get(kind)) continue;
    // sample v1.0 is live so sign-up works, but marked "not legally approved" until a reviewed version is published
    db.prepare("INSERT INTO legal_documents(kind, version, title, body, status, material, change_note, effective_at, published_at, created_at, updated_at, legal_approved) VALUES(?,?,?,?,'published',1,?,?,?,?,?,0)")
      .run(kind, '1.0', d.title, d.body, 'First version (sample text)', t, t, t, t);
  }
  // the other policies start as drafts: complete → internal review → legal review → approve → publish
  for (const [kind, d] of Object.entries(STARTER_POLICIES)) {
    if (db.prepare('SELECT 1 FROM legal_documents WHERE kind = ?').get(kind)) continue;
    db.prepare("INSERT INTO legal_documents(kind, version, title, body, status, material, change_note, category, icon, description, applies_to, countries, created_by_name, created_at, updated_at) VALUES(?,?,?,?,'draft',0,?,?,?,?,?,?,?,?,?)")
      .run(kind, '1.0', d.title, d.body, 'Starter template', DOC_KINDS[kind].category, DOC_KINDS[kind].icon, DOC_KINDS[kind].desc, DOC_KINDS[kind].category === 'dealer' ? 'dealers' : DOC_KINDS[kind].category === 'customer' ? 'customers' : 'everyone', 'India', 'System (starter template)', t, t);
  }
}
seedLegalDocs();

export const docRow = (id) => db.prepare('SELECT * FROM legal_documents WHERE id = ?').get(id);
export const currentDoc = (kind) => db.prepare("SELECT * FROM legal_documents WHERE kind = ? AND status = 'published' AND (effective_at IS NULL OR effective_at <= ?) ORDER BY published_at DESC, id DESC LIMIT 1").get(kind, now());
export const publicDoc = (r, vars) => r && ({ id: r.id, kind: r.kind, version: r.version, title: r.title, body: fillTemplate(r.body, vars || companyVars()), effective_at: r.effective_at, published_at: r.published_at, material: !!r.material, change_note: r.change_note });
export const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

/** Versions a subject still has to accept: latest published version of each kind where the accepted one is older AND the newer one is material. */
export function pendingFor(subject_type, subject_id, kinds) {
  const out = [];
  for (const kind of kinds) {
    const cur = currentDoc(kind); if (!cur) continue;
    const acc = db.prepare('SELECT a.document_id, d.published_at FROM legal_acceptances a JOIN legal_documents d ON d.id = a.document_id WHERE a.subject_type = ? AND a.subject_id = ? AND a.kind = ? ORDER BY a.id DESC LIMIT 1').get(subject_type, subject_id, kind);
    if (!acc) { out.push(cur); continue; }
    if (acc.document_id === cur.id) continue;
    // any material version published after the one they accepted?
    const material = db.prepare("SELECT 1 FROM legal_documents WHERE kind = ? AND status IN ('published','retired') AND material = 1 AND published_at > ? LIMIT 1").get(kind, acc.published_at);
    if (material) out.push(cur);
  }
  return out;
}

function nextRef(prefix) {
  const n = (db.prepare('SELECT MAX(id) m FROM legal_acceptances').get().m || 0) + 1;
  return `${refNo(prefix, n)}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
}

/** Record a customer's acceptance of the current customer documents. */
export function recordCustomerAcceptance(req, user, consents, kinds = CUSTOMER_KINDS, verificationText = null) {
  const vars = companyVars(); const t = now(); const out = [];
  db.transaction(() => {
    for (const kind of kinds) {
      const d = currentDoc(kind); if (!d) continue;
      const body = fillTemplate(d.body, vars);
      const ref = nextRef('UGC');
      db.prepare(`INSERT INTO legal_acceptances(ref_no, subject_type, subject_id, kind, document_id, version, hash, filled_body, name, email, phone, consents, ip, user_agent, accepted_at, verification)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(ref, 'customer', user.id, kind, d.id, d.version, sha(body), body, user.name, user.email, user.phone, JSON.stringify(consents || {}), clientIp(req), String(req.get('user-agent') || '').slice(0, 300), t,
        verificationText || 'Accepted by ticking the required boxes while signed in to the account');
      out.push(ref);
    }
  })();
  return out;
}

export function acceptanceView(a) {
  return { id: a.id, ref_no: a.ref_no, kind: a.kind, title: DOC_KINDS[a.kind]?.label, version: a.version, accepted_at: a.accepted_at, hash: a.hash, consents: parseJSON(a.consents, {}), verification: a.verification || null,
    signature: a.signature ? (({ typed_name, capacity, otp_ref }) => ({ typed_name, capacity, otp_ref }))(parseJSON(a.signature, {})) : null, has_pdf: true };
}

/** PDF of an acceptance: the stored signed PDF for dealers; built on the fly (from the stored text) for customers. */
/** Company signatory block printed on signed dealer agreements. */
export const companyRep = (v = companyVars()) => [['Authorised signatory', v.authorised_signatory], ['Designation', v.signatory_designation], ['Company', `${v.company_legal_name}, ${v.company_address}`], ['Legal contact', v.legal_email]];
const consentLabels = (a) => {
  const c = parseJSON(a.consents, {}) || {};
  return a.subject_type === 'customer' ? CUSTOMER_CONSENTS.filter((x) => c[x.key]).map((x) => x.label) : DEALER_CHECKS.filter((x) => c[x.key]).map((x) => x.label);
};

/** PDF of an acceptance: the stored signed PDF for dealers; built on the fly (from the stored text) for customers. */
export async function acceptancePdf(a) {
  if (a.pdf_file) {
    const f = path.join(LEGAL_DIR, a.pdf_file);
    if (fs.existsSync(f)) return fs.readFileSync(f);
  }
  const vars = companyVars(); const sig = parseJSON(a.signature, {}) || {};
  const who = a.subject_type === 'dealer' ? 'Dealer' : 'Customer';
  return Buffer.from(await buildAgreementPdf(PDFLib, {
    title: DOC_KINDS[a.kind]?.label || a.kind, heading: (DOC_KINDS[a.kind]?.label || a.kind).toUpperCase(), company: vars.company_name, company_legal: vars.company_legal_name,
    ref_no: a.ref_no, version: a.version, effective: a.accepted_at.slice(0, 10),
    parties: [['Company', `${vars.company_legal_name}, ${vars.company_address}`], [`${who} name`, a.name], [`${who} ID`, `${a.subject_type === 'dealer' ? 'D' : 'C'}-${a.subject_id}`], ['Email', a.email], ['Mobile number', a.phone], ['Agreement number', a.ref_no]],
    body: a.filled_body,
    statement: `${a.name} accepted ${DOC_KINDS[a.kind]?.label || 'this document'} version ${a.version} electronically on ${new Date(a.accepted_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} (IST), confirming:`,
    checks: consentLabels(a),
    signature: { typed_name: sig.typed_name || a.name, capacity: sig.capacity, signed_at: a.accepted_at, ip: a.ip, user_agent: a.user_agent, otp_ref: sig.otp_ref, verification: a.verification },
    company_rep: a.subject_type === 'dealer' ? companyRep(vars) : null, hash: a.hash,
  }));
}

/** Blank copy of current documents (read before accepting / print). */
export async function blankPdf(docs, { who = null, ref = 'COPY', heading } = {}) {
  const v = companyVars();
  return Buffer.from(await buildAgreementPdf(PDFLib, {
    title: docs.map((x) => x.title).join(' + '), heading: heading || docs[0].title.toUpperCase(), company: v.company_name, company_legal: v.company_legal_name,
    ref_no: ref, version: docs.map((x) => x.version).join(' / '), effective: (docs[0].effective_at || now()).slice(0, 10),
    parties: [['Company', `${v.company_legal_name}, ${v.company_address}`], ...(who || [])], body: docs.map((x) => ({ title: x.title, body: x.body })), unsigned: true, signature: {},
    hash: sha(docs.map((x) => x.body).join('\n')), footer: 'Copy of the current version. Generated automatically from the published document.',
  }));
}

// ---------------------------------------------------------------- dealer helpers
export function dealerVars(d, sig = {}) {
  const v = companyVars();
  return {
    ...v,
    effective_date: new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }),
    dealer_legal_name: d.legal_name || d.business_name, dealer_business_type: BUSINESS_TYPES[d.business_type] || 'Business',
    dealer_pan: d.pan || '-', dealer_gstin: d.gstin || 'Not registered', dealer_address: [d.registered_address || d.address, d.city, d.state, d.pincode].filter(Boolean).join(', '),
    signatory_name: sig.typed_name || d.name, signatory_capacity: sig.capacity || 'Authorised signatory',
    commercial_schedule: commercialSchedule(dealerCommercial(d)),
  };
}
export const dealerCommercial = (d) => ({ ...DEFAULT_COMMERCIAL, ...(parseJSON(d.commercial, {}) || {}) });
export const dealerDocs = (dealerId) => db.prepare('SELECT * FROM dealer_documents WHERE dealer_id = ? ORDER BY uploaded_at, id').all(dealerId);
export const dealerSigned = (dealerId) => !pendingFor('dealer', dealerId, DEALER_KINDS).length && !!db.prepare("SELECT 1 FROM legal_acceptances WHERE subject_type = 'dealer' AND subject_id = ? AND kind = 'dealer_agreement'").get(dealerId);

/** Store the executed agreement: one acceptance per dealer document + the signed PDF (stored once). */
export async function recordDealerSignature(req, d, sig, checks, signaturePng) {
  const t = now(); const vars = dealerVars(d, sig); const refs = [];
  const sigFile = signaturePng ? `sig-${d.id}-${crypto.randomBytes(6).toString('hex')}.png` : null;
  if (sigFile) fs.writeFileSync(path.join(LEGAL_DIR, sigFile), signaturePng);
  for (const kind of DEALER_KINDS) {
    const doc = currentDoc(kind); if (!doc) continue;
    const body = fillTemplate(doc.body, vars); const ref = nextRef('UGD');
    const signature = { typed_name: sig.typed_name, capacity: sig.capacity, otp_ref: sig.otp_ref, checks };
    const verification = 'Mobile OTP verified · typed full name · drawn signature';
    const pdf = Buffer.from(await buildAgreementPdf(PDFLib, {
      title: doc.title, heading: doc.title.toUpperCase(), company: vars.company_name, company_legal: vars.company_legal_name, ref_no: ref, version: doc.version, effective: t.slice(0, 10),
      parties: [['Company', `${vars.company_legal_name}, ${vars.company_address}`], ['Dealer name', d.name], ['Legal business name', `${vars.dealer_legal_name} (${vars.dealer_business_type})`], ['Dealer ID', `D-${d.id}`],
        ['Agreement number', ref], ['PAN / GSTIN', `${vars.dealer_pan} / ${vars.dealer_gstin}`], ['Address', vars.dealer_address], ['Contact', `${d.phone} - ${d.email || ''}`]],
      body, statement: `${sig.typed_name} (${sig.capacity}) signed ${doc.title} version ${doc.version} electronically for ${vars.dealer_legal_name}, confirming:`, checks: checks.map((c) => c.label),
      signature: { typed_name: sig.typed_name, capacity: sig.capacity, signed_at: t, ip: clientIp(req), user_agent: String(req.get('user-agent') || '').slice(0, 300), otp_ref: sig.otp_ref, verification, image_png: signaturePng },
      company_rep: companyRep(vars), audit: [['Agreement', `${doc.title} v${doc.version}`]], hash: sha(body),
    }));
    const pdfFile = `${ref}.pdf`;
    fs.writeFileSync(path.join(LEGAL_DIR, pdfFile), pdf);
    db.prepare(`INSERT INTO legal_acceptances(ref_no, subject_type, subject_id, kind, document_id, version, hash, filled_body, name, email, phone, consents, signature, signature_file, pdf_file, ip, user_agent, accepted_at, verification)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(ref, 'dealer', d.id, kind, doc.id, doc.version, sha(body), body, sig.typed_name, d.email, d.phone,
      JSON.stringify(Object.fromEntries(checks.map((c) => [c.key, true]))), JSON.stringify(signature), sigFile, pdfFile, clientIp(req), String(req.get('user-agent') || '').slice(0, 300), t, verification);
    refs.push(ref);
  }
  return refs;
}

// ---------------------------------------------------------------- uploaded KYC files (PDF / JPG / PNG, sniffed)
export function sniffDoc(buf) {
  if (buf.slice(0, 5).toString() === '%PDF-') return { mime: 'application/pdf', ext: '.pdf' };
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: 'image/jpeg', ext: '.jpg' };
  if (buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: 'image/png', ext: '.png' };
  return null;
}
export function saveKycFile(dealerId, file) {
  const t = sniffDoc(file.buffer);
  if (!t) throw new HttpError(400, 'Upload a PDF, JPG or PNG file.');
  if (t.mime === 'application/pdf' && /\/(JavaScript|JS|Launch|EmbeddedFile)\b/.test(file.buffer.toString('latin1'))) throw new HttpError(400, 'This PDF contains scripts or attachments. Please upload a plain scanned PDF.');
  const name = `kyc-${dealerId}-${Date.now().toString(36)}-${crypto.randomBytes(8).toString('hex')}${t.ext}`;
  fs.writeFileSync(path.join(LEGAL_DIR, name), file.buffer);
  return { file: name, mime: t.mime, size: file.buffer.length, sha256: sha(file.buffer) };
}
export const legalFile = (name) => {
  if (!/^[a-zA-Z0-9-]+\.(pdf|jpg|png)$/.test(String(name))) throw new HttpError(404, 'Not found');
  const f = path.join(LEGAL_DIR, name);
  if (!fs.existsSync(f)) throw new HttpError(404, 'Not found');
  return f;
};

export { DOC_KINDS, CUSTOMER_KINDS, DEALER_KINDS };
