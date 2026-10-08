/**
 * Legal & Compliance Center: the numbers and lists behind the admin dashboard.
 * Pure functions — the server and the browser preview pass in plain rows and get the same answer.
 */
import { DOC_KINDS, DISPLAY_STATUS, IN_PROGRESS_STATUSES, POLICY_CATEGORIES } from './legal.js';

const DAY = 864e5;
const ms = (t) => (t ? Date.parse(t) : NaN);

// ---------------------------------------------------------------- policy framework (launch checklist)
/** Areas a marketplace needs a policy for → the document that covers it. */
export const POLICY_FRAMEWORK = {
  customer: [
    ['Terms & Conditions', 'customer_terms'], ['Privacy Policy', 'privacy'], ['Payment Policy', 'payment_policy'], ['Orders', 'customer_terms'],
    ['Shipping Policy', 'shipping_policy'], ['Cancellation Policy', 'refund_cancellation'], ['Return Policy', 'refund_cancellation'], ['Refund Policy', 'refund_cancellation'],
    ['Review Policy', 'review_policy'], ['Account & Security Policy', 'account_security_policy'], ['Complaint Policy', 'complaint_policy'],
    ['Prohibited Activity Policy', 'prohibited_activities'], ['Dispute Resolution', 'dispute_policy'],
  ],
  dealer: [
    ['Dealer Registration & KYC', 'kyc_policy'], ['Dealer Agreement', 'dealer_agreement'], ['Dealer Terms & Conditions', 'marketplace_policy'], ['Product Listing', 'listing_policy'],
    ['Product Quality', 'listing_policy'], ['Inventory', 'listing_policy'], ['Pricing', 'pricing_fee_policy'], ['Commission / Fees', 'pricing_fee_policy'],
    ['Payment / Settlement', 'settlement_policy'], ['Orders & Shipping', 'fulfillment_policy'], ['Returns & Refunds', 'dealer_returns_policy'],
    ['Customer Communication', 'customer_comm_policy'], ['Customer Data', 'customer_data_policy'], ['Intellectual Property', 'ip_policy'],
    ['Product Safety', 'product_safety_policy'], ['Performance', 'performance_policy'], ['Account Health', 'performance_policy'],
    ['Policy Violations', 'violation_policy'], ['Suspension', 'violation_policy'], ['Termination', 'violation_policy'], ['Dispute Resolution', 'dispute_policy'],
  ],
  company: [
    ['Platform Terms', 'platform_terms'], ['Privacy', 'privacy'], ['Data Protection', 'data_protection'], ['Cookies', 'cookie_policy'], ['Security', 'security_policy'],
    ['Legal Notice', 'legal_notice'], ['Dispute Resolution', 'dispute_policy'], ['Grievance / Complaint Process', 'complaint_policy'], ['Communication Policy', 'communication_policy'],
    ['Fraud Prevention', 'fraud_policy'],
  ],
};

// ---------------------------------------------------------------- versions → what a card shows
const byNewest = (a, b) => String(b.published_at || '').localeCompare(String(a.published_at || '')) || b.id - a.id;
/** The live version of a kind: newest published one already in effect. */
export function currentOf(docs, kind, now = Date.now()) {
  return docs.filter((d) => d.kind === kind && d.status === 'published' && !(ms(d.effective_at) > now)).sort(byNewest)[0] || null;
}
/** Display state of one version (adds Scheduled / Expired / Previous version to the stored status). */
export function policyState(v, current, now = Date.now()) {
  if (!v) return 'missing';
  if (v.status === 'retired') return 'archived';
  if (v.status === 'published') {
    if (ms(v.effective_at) > now) return 'scheduled';
    if (current && current.id !== v.id) return 'superseded';
    if (v.next_review_at && ms(v.next_review_at) < now) return 'expired';
    return 'published';
  }
  return v.status;
}
/** Catalog kinds + custom policies created in the admin (kind starts with "custom_"). */
export function policyCatalog(docs = []) {
  const out = Object.entries(DOC_KINDS).filter(([, v]) => !v.legacy).map(([kind, v]) => ({ kind, ...v, custom: false }));
  const seen = new Set(out.map((x) => x.kind));
  for (const d of [...docs].sort((a, b) => b.id - a.id)) {
    if (seen.has(d.kind) || DOC_KINDS[d.kind]) continue;
    seen.add(d.kind);
    out.push({ kind: d.kind, label: d.title, category: POLICY_CATEGORIES[d.category] ? d.category : 'company', icon: d.icon || '📄', desc: d.description || '', short: d.title, custom: true, audience: d.category === 'dealer' ? 'dealer' : 'customer' });
  }
  return out;
}

/**
 * Acceptance per document people must accept.
 * @param docs all versions; @param subjects { customer: [ids], dealer: [ids] }
 * @param acceptances [{ id, subject_type, subject_id, kind, document_id }]
 * accepted = on the live version · older = on an earlier version that is still valid · pending = must accept
 */
export function acceptanceStats({ docs = [], subjects = {}, acceptances = [], now = Date.now() }) {
  const byId = new Map(docs.map((d) => [d.id, d]));
  const latest = new Map();
  for (const a of [...acceptances].sort((x, y) => x.id - y.id)) latest.set(`${a.subject_type}:${a.subject_id}:${a.kind}`, a.document_id);
  const out = {};
  for (const [kind, meta] of Object.entries(DOC_KINDS)) {
    if (!meta.accept || meta.legacy) continue;
    const cur = currentOf(docs, kind, now); const ids = subjects[meta.accept] || [];
    const s = { kind, who: meta.accept, version: cur?.version || null, required: ids.length, accepted: 0, older: 0, pending: 0, rate: null };
    if (!cur) { out[kind] = s; continue; }
    for (const id of ids) {
      const docId = latest.get(`${meta.accept}:${id}:${kind}`);
      if (!docId) { s.pending += 1; continue; }
      if (docId === cur.id) { s.accepted += 1; continue; }
      const acc = byId.get(docId);
      const material = docs.some((d) => d.kind === kind && ['published', 'retired'].includes(d.status) && d.material && String(d.published_at) > String(acc?.published_at || ''));
      if (material) s.pending += 1; else s.older += 1;
    }
    s.rate = ids.length ? Math.round(((s.accepted + s.older) / ids.length) * 1000) / 10 : null;
    out[kind] = s;
  }
  return out;
}

/**
 * Everything the Overview and Policy library need.
 * @param docs all versions (with category/icon/description/next_review_at…)
 * @param accStats from acceptanceStats · @param accCount { [documentId]: n }
 */
export function buildLegalCenter({ docs = [], accStats = {}, accCount = {}, now = Date.now(), soonDays = 30 }) {
  const catalog = policyCatalog(docs);
  const cards = catalog.map((k) => {
    const versions = docs.filter((d) => d.kind === k.kind).sort((a, b) => b.id - a.id);
    const current = currentOf(docs, k.kind, now);
    const working = versions.find((v) => IN_PROGRESS_STATUSES.includes(v.status)) || null;
    const scheduled = versions.find((v) => v.status === 'published' && ms(v.effective_at) > now) || null;
    const lead = current || scheduled || working || versions[0] || null;
    const state = policyState(lead, current, now);
    const st = accStats[k.kind];
    return {
      kind: k.kind, label: lead?.title || k.label, icon: lead?.icon || k.icon, desc: lead?.description || k.desc, category: k.category, accept: k.accept || null, custom: k.custom,
      state, state_label: DISPLAY_STATUS[state]?.label, tone: DISPLAY_STATUS[state]?.tone, state_icon: DISPLAY_STATUS[state]?.icon,
      version: lead?.version || null, current_id: current?.id || null, current_version: current?.version || null,
      working: working && { id: working.id, version: working.version, status: working.status, state_label: DISPLAY_STATUS[working.status]?.label, updated_at: working.updated_at, review_note: working.review_note || null },
      scheduled: scheduled && { id: scheduled.id, version: scheduled.version, effective_at: scheduled.effective_at },
      effective_at: current?.effective_at || scheduled?.effective_at || null,
      updated_at: versions.reduce((m, v) => (String(v.updated_at || '') > m ? String(v.updated_at) : m), '') || null,
      next_review_at: current?.next_review_at || null,
      owner_name: lead?.owner_name || null, applies_to: lead?.applies_to || (k.category === 'dealer' ? 'dealers' : k.category === 'customer' ? 'customers' : 'everyone'),
      legal_approved: current ? !!current.legal_approved : null, legal_reviewer: current?.legal_reviewer || null,
      accepted: st ? st.accepted : current ? accCount[current.id] || 0 : 0, acceptance: st || null,
      versions: versions.length, search: [k.kind, lead?.title, k.label, k.desc, k.category, lead?.version, DISPLAY_STATUS[state]?.label, lead?.owner_name].filter(Boolean).join(' ').toLowerCase(),
    };
  });
  const live = cards.filter((c) => c.current_id);
  const reviewSoon = live.filter((c) => c.next_review_at && ms(c.next_review_at) - now < soonDays * DAY);
  const accKinds = Object.values(accStats).filter((s) => s.required > 0 && s.version);
  const accReq = accKinds.reduce((a, s) => a + s.required, 0); const accOk = accKinds.reduce((a, s) => a + s.accepted + s.older, 0);
  const pendingReview = docs.filter((d) => ['internal_review', 'legal_review'].includes(d.status));
  const states = {}; for (const c of cards) states[c.state] = (states[c.state] || 0) + 1;
  const kpis = {
    active: live.length, total: cards.length, published_30d: docs.filter((d) => d.status === 'published' && now - ms(d.published_at) < 30 * DAY).length,
    pending_review: pendingReview.length, internal: pendingReview.filter((d) => d.status === 'internal_review').length, legal: pendingReview.filter((d) => d.status === 'legal_review').length,
    ready_to_publish: docs.filter((d) => d.status === 'approved').length, changes_requested: docs.filter((d) => d.status === 'changes_requested').length,
    expiring: reviewSoon.length, overdue: reviewSoon.filter((c) => ms(c.next_review_at) < now).length, no_review_date: live.filter((c) => !c.next_review_at).length,
    acceptance_rate: accReq ? Math.round((accOk / accReq) * 1000) / 10 : null, acceptance_ok: accOk, acceptance_required: accReq,
    acceptance_pending: accKinds.reduce((a, s) => a + s.pending, 0),
    unreviewed_live: live.filter((c) => !c.legal_approved).length, drafts: cards.filter((c) => c.state === 'draft').length,
  };
  const categories = Object.entries(POLICY_CATEGORIES).map(([key, v]) => {
    const list = cards.filter((c) => c.category === key);
    return { key, ...v, total: list.length, live: list.filter((c) => c.current_id).length, in_progress: list.filter((c) => c.working).length };
  });
  const byKind = Object.fromEntries(cards.map((c) => [c.kind, c]));
  const checklist = Object.entries(POLICY_FRAMEWORK).map(([area, items]) => ({
    area, label: POLICY_CATEGORIES[area].label,
    items: items.map(([label, kind]) => {
      const c = byKind[kind];
      const st = !c || c.state === 'missing' ? 'missing' : c.current_id ? (c.legal_approved ? 'ready' : 'live_unreviewed') : 'in_progress';
      return { label, kind, policy: c?.label || DOC_KINDS[kind]?.label, status: st };
    }),
  }));
  return { cards, kpis, categories, states, checklist, review_queue: pendingReview.map((d) => ({ id: d.id, kind: d.kind, title: d.title, version: d.version, status: d.status, label: DISPLAY_STATUS[d.status]?.label, since: d.internal_submitted_at || d.submitted_review_at || d.updated_at })) };
}

// ---------------------------------------------------------------- calendar
/**
 * Dated events: policy reviews, scheduled publications, recent publications, dealer documents expiring,
 * dealer grace periods and yearly agreement reviews. tone: done | upcoming | overdue.
 */
export function legalCalendar({ docs = [], dealerDocs = [], dealers = [], signed = [], now = Date.now(), horizonDays = 365 }) {
  const ev = [];
  const add = (at, type, title, detail, link, toneOverride) => {
    const t = ms(at); if (!Number.isFinite(t)) return;
    if (t > now + horizonDays * DAY) return;
    ev.push({ at: new Date(t).toISOString(), type, title, detail, link, tone: toneOverride || (t < now ? 'overdue' : 'upcoming') });
  };
  const kinds = [...new Set(docs.map((d) => d.kind))];
  for (const kind of kinds) {
    const cur = currentOf(docs, kind, now);
    if (cur?.next_review_at) add(cur.next_review_at, 'review', `Review: ${cur.title}`, `v${cur.version} · owner ${cur.owner_name || 'not set'}`, `policy:${kind}`);
  }
  for (const d of docs) {
    if (d.status === 'published' && ms(d.effective_at) > now) add(d.effective_at, 'publish', `Goes live: ${d.title} v${d.version}`, d.change_note || 'Scheduled publication', `policy:${d.kind}`, 'upcoming');
    if (d.status === 'published' && ms(d.published_at) <= now && now - ms(d.published_at) < 120 * DAY) add(d.published_at, 'published', `Published: ${d.title} v${d.version}`, d.legal_reviewer ? `Reviewed by ${d.legal_reviewer}` : 'Sample text', `policy:${d.kind}`, 'done');
  }
  for (const x of dealerDocs) {
    if (!x.expiry_date || !x.latest) continue;
    const t = ms(`${x.expiry_date}T23:59:59+05:30`);
    add(new Date(t).toISOString(), 'doc_expiry', `${x.label} expires`, x.business_name, `dealer:${x.dealer_id}`, t < now ? 'overdue' : 'upcoming');
  }
  for (const d of dealers) if (d.onboarding_deadline && d.onboarding_status !== 'approved') add(d.onboarding_deadline, 'grace', `Onboarding deadline: ${d.business_name}`, 'Must finish KYC and sign to keep getting orders', `dealer:${d.id}`);
  for (const s of signed) {
    const due = ms(s.accepted_at) + 365 * DAY;
    add(new Date(due).toISOString(), 'renewal', `Yearly agreement review: ${s.business_name}`, `${s.title} v${s.version} signed ${String(s.accepted_at).slice(0, 10)}`, `dealer:${s.dealer_id}`);
  }
  return ev.sort((a, b) => a.at.localeCompare(b.at));
}

// ---------------------------------------------------------------- dealer documents
export const DOC_EXPIRY = {
  valid: { label: 'Valid', icon: '🟢', tone: 'ok' }, expiring: { label: 'Expiring soon', icon: '🟡', tone: 'warn' },
  expired: { label: 'Expired', icon: '🔴', tone: 'bad' }, no_expiry: { label: 'No expiry', icon: '⚪', tone: 'muted' },
};
export function docExpiry(expiry, now = Date.now(), soonDays = 30) {
  if (!expiry) return 'no_expiry';
  const t = ms(`${String(expiry).slice(0, 10)}T23:59:59+05:30`);
  if (t < now) return 'expired';
  return t - now < soonDays * DAY ? 'expiring' : 'valid';
}

// ---------------------------------------------------------------- dealer account health
export const HEALTH_LEVELS = {
  good: { label: 'Good', icon: '🟢', tone: 'ok', rank: 0 },
  attention: { label: 'Needs attention', icon: '🟡', tone: 'warn', rank: 1 },
  warning: { label: 'Warning', icon: '🟠', tone: 'orange', rank: 2 },
  restricted: { label: 'Restricted', icon: '🔴', tone: 'bad', rank: 3 },
};
export const HEALTH_METRICS = [
  { key: 'cancellation_rate', label: 'Order cancellation rate', unit: '%', rate: true, hint: 'Orders the dealer rejected or could not fulfil, of all orders sent' },
  { key: 'late_shipment_rate', label: 'Late shipment rate', unit: '%', rate: true, hint: 'Orders dispatched later than the dispatch time after acceptance' },
  { key: 'complaints', label: 'Customer complaints', unit: '', hint: 'Support requests about this dealer’s orders' },
  { key: 'return_rate', label: 'Return rate', unit: '%', rate: true, hint: 'Delivered orders returned or refunded' },
  { key: 'refund_issues', label: 'Refund issues', unit: '', hint: 'Support requests about refunds on this dealer’s orders' },
  { key: 'quality_complaints', label: 'Product quality complaints', unit: '', hint: 'Damaged / defective complaints + 1–2★ reviews on the dealer’s products' },
  { key: 'violations', label: 'Open policy violations', unit: '', hint: 'Violations not yet resolved or closed' },
  { key: 'document_expiry', label: 'Document expiry', unit: '', hint: '1 = expiring within 30 days · 2 = expired · 3 = expired more than 30 days ago' },
  { key: 'fraud', label: 'Fraud indicators', unit: '', hint: 'Open fraud-type violations' },
];
/** Thresholds per metric: [needs attention, warning, restricted] (value ≥ threshold). null = level not used. */
export const DEFAULT_HEALTH_RULES = {
  window_days: 90, min_orders: 5, ship_hours: 48,
  thresholds: {
    cancellation_rate: [2.5, 5, 10], late_shipment_rate: [4, 8, 15], complaints: [3, 6, 10], return_rate: [5, 10, 20], refund_issues: [2, 4, 8],
    quality_complaints: [2, 4, 8], violations: [1, 2, 3], document_expiry: [1, 2, 3], fraud: [null, null, 1],
  },
};
export function healthRules(saved) {
  const s = saved && typeof saved === 'object' ? saved : {};
  const n = (v, d, lo, hi) => (Number.isFinite(Number(v)) && v !== '' && v !== null ? Math.min(hi, Math.max(lo, Number(v))) : d);
  const thresholds = {};
  for (const m of HEALTH_METRICS) {
    const def = DEFAULT_HEALTH_RULES.thresholds[m.key]; const got = Array.isArray(s.thresholds?.[m.key]) ? s.thresholds[m.key] : def;
    thresholds[m.key] = def.map((d, i) => (got[i] === null || got[i] === '' ? null : n(got[i], d, 0, 100000)));
  }
  return { window_days: n(s.window_days, 90, 7, 365), min_orders: n(s.min_orders, 5, 1, 1000), ship_hours: n(s.ship_hours, 48, 1, 720), thresholds };
}
const RX_RETURN = /return|exchange|replace/i;
const RX_REFUND = /refund|money back|payment/i;
const RX_QUALITY = /damag|broken|defect|quality|fake|counterfeit|wrong item|leak/i;
/**
 * @param orders [{ status, sent_at, accepted_at, out_at, delivered_at, refunded, tickets: [topic] }]
 * @param violations [{ type, severity, status }] · @param docs [{ expiry_date, latest, required }]
 * @param lowReviews number of 1–2★ approved reviews on the dealer's products in the window
 */
export function computeDealerHealth({ orders = [], violations = [], docs = [], lowReviews = 0, rules: raw, now = Date.now() }) {
  const rules = healthRules(raw);
  const from = now - rules.window_days * DAY;
  const win = orders.filter((o) => ms(o.sent_at) >= from);
  const assigned = win.length;
  const rejected = win.filter((o) => o.status === 'rejected').length;
  const dispatched = win.filter((o) => o.out_at);
  const late = dispatched.filter((o) => ms(o.out_at) - ms(o.accepted_at || o.sent_at) > rules.ship_hours * 36e5).length;
  const delivered = win.filter((o) => o.status === 'delivered');
  const returned = delivered.filter((o) => o.refunded || (o.tickets || []).some((t) => RX_RETURN.test(t))).length;
  const tickets = win.flatMap((o) => o.tickets || []);
  const open = violations.filter((v) => ['open', 'correction_requested'].includes(v.status));
  let docLevel = 0;
  for (const d of docs.filter((x) => x.latest && x.expiry_date)) {
    const st = docExpiry(d.expiry_date, now);
    if (st === 'expired') docLevel = Math.max(docLevel, now - ms(`${d.expiry_date}T23:59:59+05:30`) > 30 * DAY ? 3 : 2);
    else if (st === 'expiring') docLevel = Math.max(docLevel, 1);
  }
  const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0);
  const values = {
    cancellation_rate: [pct(rejected, assigned), `${rejected} of ${assigned} orders`],
    late_shipment_rate: [pct(late, dispatched.length), `${late} of ${dispatched.length} dispatched`],
    complaints: [tickets.length, `${tickets.length} support request${tickets.length === 1 ? '' : 's'}`],
    return_rate: [pct(returned, delivered.length), `${returned} of ${delivered.length} delivered`],
    refund_issues: [tickets.filter((t) => RX_REFUND.test(t)).length, 'refund / payment requests'],
    quality_complaints: [tickets.filter((t) => RX_QUALITY.test(t)).length + lowReviews, `${lowReviews} low review${lowReviews === 1 ? '' : 's'} + complaints`],
    violations: [open.length, open.length ? open.map((v) => v.severity).join(', ') : 'none open'],
    document_expiry: [docLevel, ['All valid', 'Expiring within 30 days', 'Expired', 'Expired over 30 days ago'][docLevel]],
    fraud: [open.filter((v) => v.type === 'fraud').length, 'open fraud flags'],
  };
  const enough = assigned >= rules.min_orders;
  const metrics = HEALTH_METRICS.map((m) => {
    const [value, detail] = values[m.key];
    const [a, w, r] = rules.thresholds[m.key];
    let level = 'good';
    if (!m.rate || enough) {
      if (r != null && value >= r) level = 'restricted';
      else if (w != null && value >= w) level = 'warning';
      else if (a != null && value >= a && value > 0) level = 'attention';
    }
    const shown = m.unit === '%' ? `${value}%` : m.key === 'document_expiry' ? detail : String(value);
    return { key: m.key, label: m.label, hint: m.hint, value, display: shown, detail: m.rate && !enough ? `${detail} · not enough orders to rate` : detail, level, thresholds: rules.thresholds[m.key] };
  });
  const status = metrics.reduce((s, m) => (HEALTH_LEVELS[m.level].rank > HEALTH_LEVELS[s].rank ? m.level : s), 'good');
  return { status, label: HEALTH_LEVELS[status].label, icon: HEALTH_LEVELS[status].icon, tone: HEALTH_LEVELS[status].tone, metrics, orders: assigned, window_days: rules.window_days, enough_orders: enough, problems: metrics.filter((m) => m.level !== 'good').map((m) => m.label) };
}

// ---------------------------------------------------------------- policy violations
export const VIOLATION_TYPES = {
  incorrect_info: 'Incorrect product information', quality: 'Product quality complaint', late_shipment: 'Repeated late shipment',
  cancellation: 'High order cancellation', ip_complaint: 'Intellectual property / counterfeit complaint', unsafe_product: 'Unsafe or restricted product',
  pricing: 'Pricing violation', customer_contact: 'Customer contact or data misuse', document_expired: 'Document expired', fraud: 'Fraud indicator', other: 'Other',
};
export const SEVERITY = {
  low: { label: 'Low', icon: '🟢', tone: 'ok' }, medium: { label: 'Medium', icon: '🟡', tone: 'warn' },
  high: { label: 'High', icon: '🟠', tone: 'orange' }, critical: { label: 'Critical', icon: '🔴', tone: 'bad' },
};
export const VIOLATION_STATUS = {
  open: { label: 'Open', tone: 'bad' }, correction_requested: { label: 'Correction requested', tone: 'warn' },
  resolved: { label: 'Resolved', tone: 'ok' }, closed: { label: 'Closed', tone: 'muted' },
};
export const VIOLATION_ACTIONS = {
  contact: 'Contact dealer', request_correction: 'Request correction', suspend_listing: 'Suspend listing',
  suspend_dealer: 'Suspend dealer', resolve: 'Mark resolved', close: 'Close violation', note: 'Add note',
};

// ---------------------------------------------------------------- editing helpers
/** Put the "simple explanation" (the `> ` line under the title) into a document body. */
export function setIntro(body, text) {
  const lines = String(body || '').split('\n');
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  const ti = lines.findIndex((l) => /^# /.test(l));
  const firstH2 = lines.findIndex((l) => /^## /.test(l));
  const qi = lines.findIndex((l, i) => i > ti && (firstH2 < 0 || i < firstH2) && /^> /.test(l) && !/sample text|draft/i.test(l));
  if (qi >= 0) { if (t) lines[qi] = `> ${t}`; else lines.splice(qi, 1); return lines.join('\n'); }
  if (!t) return lines.join('\n');
  if (ti >= 0) { lines.splice(ti + 1, 0, '', `> ${t}`); return lines.join('\n'); }
  return [`> ${t}`, '', ...lines].join('\n');
}
/** CSV text (Excel-friendly) from rows of arrays. */
export function toCsv(rows) {
  return rows.map((r) => r.map((v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(',')).join('\r\n');
}
