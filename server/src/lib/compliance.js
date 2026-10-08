/**
 * Legal & Compliance Center (server side): policy library data, acceptance tracking, dealer account
 * health, policy violations, document expiry, legal notifications and the legal calendar.
 * The calculations live in shared/compliance.js so the browser preview gives the same answers.
 */
import { db, now, parseJSON } from '../db.js';
import { getSettings, setSettings } from './catalog.js';
import { notifyContact } from './notify.js';
import { config } from '../config.js';
import { DOC_KINDS, DOC_TYPES, requiredDocs, latestDocs } from '../../../shared/legal.js';
import { acceptanceStats, buildLegalCenter, computeDealerHealth, healthRules, legalCalendar, docExpiry } from '../../../shared/compliance.js';
import { dealerSigned } from './legal.js';

db.exec(`
CREATE TABLE IF NOT EXISTS policy_violations (
  id INTEGER PRIMARY KEY, dealer_id INTEGER NOT NULL REFERENCES dealers(id), type TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('low','medium','high','critical')), title TEXT NOT NULL, description TEXT,
  policy_kind TEXT, product_id INTEGER, status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','correction_requested','resolved','closed')),
  due_at TEXT, history TEXT NOT NULL DEFAULT '[]', created_by_name TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, closed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_violations_dealer ON policy_violations(dealer_id, status);
CREATE TABLE IF NOT EXISTS legal_notices (
  id INTEGER PRIMARY KEY, audience TEXT NOT NULL CHECK (audience IN ('admin','dealer','customer')), dealer_id INTEGER,
  kind TEXT NOT NULL, title TEXT NOT NULL, body TEXT, link TEXT, created_at TEXT NOT NULL, read_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_legal_notices ON legal_notices(audience, dealer_id, created_at);`);

// ---------------------------------------------------------------- notifications
export function addNotice({ audience, dealer_id = null, kind, title, body = '', link = null }) {
  db.prepare('INSERT INTO legal_notices(audience, dealer_id, kind, title, body, link, created_at) VALUES(?,?,?,?,?,?,?)').run(audience, dealer_id, kind, title, body, link, now());
}
/** Legal notices for one dealer (their own + broadcasts sent after they joined), newest first. */
export function dealerNotices(dealerId, since) {
  return db.prepare("SELECT * FROM legal_notices WHERE audience = 'dealer' AND (dealer_id = ? OR (dealer_id IS NULL AND created_at >= ?)) ORDER BY id DESC LIMIT 20").all(dealerId, since || '1970');
}
export const noticesList = (limit = 100) => db.prepare('SELECT * FROM legal_notices ORDER BY id DESC LIMIT ?').all(limit);

// ---------------------------------------------------------------- policy library
export const allDocs = () => db.prepare('SELECT * FROM legal_documents').all();
export function acceptanceData(docs = allDocs()) {
  const subjects = {
    customer: db.prepare('SELECT id FROM users').all().map((x) => x.id),
    dealer: db.prepare("SELECT id FROM dealers WHERE onboarding_status NOT IN ('rejected','terminated')").all().map((x) => x.id),
  };
  const acceptances = db.prepare('SELECT id, subject_type, subject_id, kind, document_id FROM legal_acceptances').all();
  return acceptanceStats({ docs, subjects, acceptances, now: Date.now() });
}
export function legalCenter() {
  const docs = allDocs();
  const accCount = Object.fromEntries(db.prepare('SELECT document_id, COUNT(*) n FROM legal_acceptances GROUP BY document_id').all().map((x) => [x.document_id, x.n]));
  return buildLegalCenter({ docs, accStats: acceptanceData(docs), accCount, now: Date.now() });
}

// ---------------------------------------------------------------- dealer documents & health
export function dealerDocRows() {
  const rows = db.prepare('SELECT x.*, d.business_name, d.business_type, d.gstin FROM dealer_documents x JOIN dealers d ON d.id = x.dealer_id ORDER BY x.uploaded_at, x.id').all();
  const byDealer = new Map();
  for (const r of rows) { if (!byDealer.has(r.dealer_id)) byDealer.set(r.dealer_id, []); byDealer.get(r.dealer_id).push(r); }
  const out = [];
  for (const [dealerId, list] of byDealer) {
    const latest = latestDocs(list); const req = requiredDocs(list[0]);
    for (const r of list) out.push({ id: r.id, dealer_id: dealerId, business_name: r.business_name, doc_type: r.doc_type, label: DOC_TYPES[r.doc_type]?.label || r.doc_type, doc_number: r.doc_number, status: r.status, expiry_date: r.expiry_date, uploaded_at: r.uploaded_at, latest: latest[r.doc_type]?.id === r.id, required: req.includes(r.doc_type), expiry: docExpiry(r.expiry_date), reminded_at: r.expiry_reminded_at });
  }
  return out;
}
export const getHealthRules = () => healthRules(parseJSON(getSettings().legal_health_rules, null));
export const setHealthRules = (r) => setSettings({ legal_health_rules: JSON.stringify(healthRules(r)) });

export function violationRows(dealerId = null) {
  return db.prepare(`SELECT v.*, d.business_name FROM policy_violations v JOIN dealers d ON d.id = v.dealer_id ${dealerId ? 'WHERE v.dealer_id = ?' : ''} ORDER BY CASE v.status WHEN 'open' THEN 0 WHEN 'correction_requested' THEN 1 ELSE 2 END, v.id DESC`).all(...(dealerId ? [dealerId] : []))
    .map((v) => ({ ...v, history: parseJSON(v.history, []) }));
}

export function dealerHealth(dealer, rules = getHealthRules(), docsAll = null) {
  const from = new Date(Date.now() - rules.window_days * 864e5).toISOString();
  const rows = db.prepare(`SELECT d.status, d.sent_at, d.accepted_at, d.out_at, d.delivered_at, d.order_id, o.payment_status FROM dealer_orders d JOIN orders o ON o.id = d.order_id WHERE d.dealer_id = ? AND d.sent_at >= ?`).all(dealer.id, from);
  const tq = db.prepare('SELECT topic FROM support_tickets WHERE order_id = ?');
  const orders = rows.map((r) => ({ ...r, refunded: r.payment_status === 'refunded' && r.status === 'delivered', tickets: tq.all(r.order_id).map((t) => t.topic) }));
  const pids = db.prepare('SELECT product_id FROM dealer_products WHERE dealer_id = ? AND product_id IS NOT NULL').all(dealer.id).map((x) => x.product_id);
  const lowReviews = pids.length ? db.prepare(`SELECT COUNT(*) n FROM reviews WHERE status = 'approved' AND rating <= 2 AND created_at >= ? AND product_id IN (${pids.map(() => '?').join(',')})`).get(from, ...pids).n : 0;
  const violations = db.prepare('SELECT type, severity, status FROM policy_violations WHERE dealer_id = ?').all(dealer.id);
  const docs = (docsAll || dealerDocRows()).filter((x) => x.dealer_id === dealer.id);
  return computeDealerHealth({ orders, violations, docs, lowReviews, rules, now: Date.now() });
}

/** One row per dealer: legal profile + health (Dealer compliance tab). */
export function dealerProfiles() {
  const rules = getHealthRules(); const docs = dealerDocRows();
  const dealers = db.prepare('SELECT * FROM dealers ORDER BY business_name').all();
  const accQ = db.prepare("SELECT a.*, l.title FROM legal_acceptances a JOIN legal_documents l ON l.id = a.document_id WHERE a.subject_type = 'dealer' AND a.subject_id = ? AND a.kind = 'dealer_agreement' ORDER BY a.id DESC LIMIT 1");
  const cur = db.prepare("SELECT id, version FROM legal_documents WHERE kind = 'dealer_agreement' AND status = 'published' AND (effective_at IS NULL OR effective_at <= ?) ORDER BY published_at DESC, id DESC LIMIT 1").get(now());
  return dealers.map((d) => {
    const a = accQ.get(d.id); const signed = dealerSigned(d.id); const mine = docs.filter((x) => x.dealer_id === d.id && x.latest);
    const req = requiredDocs(d); const latest = Object.fromEntries(mine.map((x) => [x.doc_type, x]));
    const missing = req.filter((k) => !latest[k] || latest[k].status === 'rejected').length;
    const expired = mine.filter((x) => x.expiry === 'expired').length; const expiring = mine.filter((x) => x.expiry === 'expiring').length;
    const h = dealerHealth(d, rules, docs);
    return {
      id: d.id, dealer_code: `D-${d.id}`, name: d.name, business_name: d.business_name, legal_name: d.legal_name, city: d.city, phone: d.phone,
      onboarding_status: d.onboarding_status, agreement_version: a?.version || null, agreement_ref: a?.ref_no || null, agreement_id: a?.id || null,
      agreement_status: !a ? 'not_signed' : signed ? (a.document_id === cur?.id ? 'signed_current' : 'signed_older') : 'resign_needed',
      signed_at: a?.accepted_at || null, signature: a ? (a.verification || 'OTP + typed name + drawn signature') : null,
      kyc: d.pan && d.bank_last4 ? 'complete' : 'incomplete', documents: { required: req.length, missing, expired, expiring, verified: req.filter((k) => latest[k]?.status === 'verified').length },
      health: { status: h.status, label: h.label, icon: h.icon, tone: h.tone, problems: h.problems, orders: h.orders },
      open_violations: db.prepare("SELECT COUNT(*) n FROM policy_violations WHERE dealer_id = ? AND status IN ('open','correction_requested')").get(d.id).n,
    };
  });
}

export function calendarData() {
  const docs = allDocs();
  const dealers = db.prepare('SELECT id, business_name, onboarding_status, onboarding_deadline FROM dealers').all();
  const signed = db.prepare("SELECT a.subject_id dealer_id, a.accepted_at, a.version, l.title, d.business_name FROM legal_acceptances a JOIN legal_documents l ON l.id = a.document_id JOIN dealers d ON d.id = a.subject_id WHERE a.subject_type = 'dealer' AND a.kind = 'dealer_agreement' AND a.id IN (SELECT MAX(id) FROM legal_acceptances WHERE subject_type = 'dealer' AND kind = 'dealer_agreement' GROUP BY subject_id)").all();
  return legalCalendar({ docs, dealerDocs: dealerDocRows(), dealers, signed, now: Date.now() });
}

// ---------------------------------------------------------------- reminders (documents expiring, policy reviews due)
export async function runLegalChecks() {
  const t = now(); const soon = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
  for (const x of dealerDocRows().filter((r) => r.latest && r.expiry_date && r.expiry_date <= soon && !r.reminded_at)) {
    const d = db.prepare('SELECT * FROM dealers WHERE id = ?').get(x.dealer_id); if (!d) continue;
    const expired = docExpiry(x.expiry_date) === 'expired';
    const title = expired ? `${x.label} has expired` : `${x.label} expires on ${x.expiry_date}`;
    addNotice({ audience: 'dealer', dealer_id: d.id, kind: 'doc_expiry', title, body: 'Upload the renewed document in Profile → KYC & documents to keep receiving orders.', link: '/dealer/onboarding' });
    addNotice({ audience: 'admin', kind: 'doc_expiry', title: `${d.business_name}: ${title}`, link: `dealer:${d.id}` });
    notifyContact({ email: d.email || null, phone: d.phone, template: 'dealer_doc_expiry', subject: title, text: `Namaste ${d.name},\n\n${title}. Please upload the renewed document in the dealer app: ${config.publicUrl}/dealer/onboarding\n\nUtsav Ghar` }).catch(() => {});
    db.prepare('UPDATE dealer_documents SET expiry_reminded_at = ? WHERE id = ?').run(t, x.id);
  }
  const due = new Date(Date.now() + 14 * 864e5).toISOString();
  for (const r of db.prepare("SELECT * FROM legal_documents WHERE status = 'published' AND next_review_at IS NOT NULL AND next_review_at <= ? AND review_reminded_at IS NULL").all(due)) {
    addNotice({ audience: 'admin', kind: 'review_due', title: `${r.title} v${r.version} is due for review on ${r.next_review_at.slice(0, 10)}`, body: 'Create a new version or confirm the current one with your lawyer.', link: `policy:${r.kind}` });
    db.prepare('UPDATE legal_documents SET review_reminded_at = ? WHERE id = ?').run(t, r.id);
  }
}
export function startLegalJob() {
  setTimeout(() => runLegalChecks().catch(() => {}), 5000).unref?.();
  setInterval(() => runLegalChecks().catch(() => {}), 6 * 60 * 6e4).unref?.();
}

/** Tell the right people when a version is published. */
export function announcePublished(r) {
  const meta = DOC_KINDS[r.kind] || {};
  const cat = r.category || meta.category;
  const live = !(Date.parse(r.effective_at) > Date.now());
  const when = live ? 'now in effect' : `takes effect on ${String(r.effective_at).slice(0, 10)}`;
  addNotice({ audience: 'admin', kind: 'published', title: `${r.title} v${r.version} published (${when})`, body: r.change_note || '', link: `policy:${r.kind}` });
  if (cat === 'dealer' || meta.accept === 'dealer') {
    addNotice({ audience: 'dealer', kind: 'policy_update', title: meta.accept === 'dealer' && r.material ? `Your ${r.title} has been updated. Please review and accept the new version.` : `${r.title} v${r.version} is ${when}`, body: r.change_note || '', link: meta.accept === 'dealer' && r.material ? '/dealer/onboarding' : '/dealer/legal' });
  }
  if (cat === 'customer' || cat === 'company') {
    addNotice({ audience: 'customer', kind: 'policy_update', title: meta.accept === 'customer' && r.material ? `Our ${r.title} has been updated. Customers are asked to review and accept it before their next order.` : `${r.title} v${r.version} published`, body: r.change_note || '', link: '/policies' });
  }
}
