/**
 * Legal documents, consents and dealer onboarding rules (server, admin, dealer app, preview).
 * Wording lives in versioned documents the admin edits; this file only holds the rules.
 * NOTE: the default texts are drafts and must be reviewed by a qualified lawyer before going live.
 */

/**
 * Every policy the platform keeps. `category` groups them in the admin Legal & Compliance Center;
 * `accept` marks the documents people formally accept (customers at sign-up, dealers by e-signature).
 * The others are published policies that the accepted terms refer to.
 * The list follows the areas a marketplace commonly needs (customer, dealer, company) — the wording
 * of every document is our own and must be reviewed by a qualified lawyer.
 */
export const DOC_KINDS = {
  // customer
  customer_terms: { label: 'Customer Terms & Agreement', category: 'customer', icon: '👤', accept: 'customer', short: 'Customer Agreement', desc: 'Rules for shopping on the store: account, orders, prices, delivery and liability' },
  privacy: { label: 'Privacy Policy', category: 'customer', icon: '🔐', accept: 'customer', short: 'Privacy', desc: 'What personal data we collect, why, who we share it with and your rights' },
  refund_cancellation: { label: 'Cancellation, Return & Refund Policy', category: 'customer', icon: '↩️', accept: 'customer', short: 'Returns & refunds', desc: 'When orders can be cancelled or returned and how refunds are paid' },
  payment_policy: { label: 'Payment Policy', category: 'customer', icon: '💳', short: 'Payments', desc: 'Accepted payment methods, payment confirmation, failed payments and security' },
  shipping_policy: { label: 'Shipping & Delivery Policy', category: 'customer', icon: '🚚', short: 'Shipping', desc: 'Delivery areas, timelines, charges, tracking and failed deliveries' },
  review_policy: { label: 'Customer Review Policy', category: 'customer', icon: '⭐', short: 'Reviews', desc: 'What reviews we publish, what we remove and how ratings are calculated' },
  account_security_policy: { label: 'Account & Security Policy', category: 'customer', icon: '🛡️', short: 'Account security', desc: 'Keeping your account safe, sign-in, suspicious activity and closing an account' },
  prohibited_activities: { label: 'Prohibited Activities Policy', category: 'customer', icon: '🚫', short: 'Prohibited activities', desc: 'Things no one may do on the platform (fraud, abuse, misuse of offers)' },
  complaint_policy: { label: 'Complaints & Grievance Policy', category: 'customer', icon: '📣', short: 'Complaints', desc: 'How to raise a complaint, the Grievance Officer and resolution timelines' },
  // dealer
  dealer_agreement: { label: 'Dealer Agreement', category: 'dealer', icon: '🏪', accept: 'dealer', short: 'Dealer Agreement', desc: 'Business relationship and dealer responsibilities (signed by every dealer)' },
  marketplace_policy: { label: 'Dealer Terms & Conditions', category: 'dealer', icon: '📋', accept: 'dealer', short: 'Dealer T&C', desc: 'Day-to-day operating rules for dealers (signed with the agreement)' },
  kyc_policy: { label: 'Dealer Registration & KYC Policy', category: 'dealer', icon: '🪪', short: 'KYC', desc: 'Who can register, required documents, verification and keeping details current' },
  listing_policy: { label: 'Product Listing & Quality Policy', category: 'dealer', icon: '📦', short: 'Listings', desc: 'Accurate titles, photos, stock and quality standards for every product' },
  pricing_fee_policy: { label: 'Pricing & Fee Policy', category: 'dealer', icon: '💰', short: 'Pricing & fees', desc: 'Dealer prices, commission or supply model, fees and fair pricing rules' },
  settlement_policy: { label: 'Payment & Settlement Policy', category: 'dealer', icon: '🏦', short: 'Settlement', desc: 'When and how dealers are paid, deductions, holds and statements' },
  fulfillment_policy: { label: 'Shipping & Fulfilment Policy', category: 'dealer', icon: '🚛', short: 'Fulfilment', desc: 'Accepting, packing and dispatching orders on time, proof of delivery' },
  dealer_returns_policy: { label: 'Dealer Return & Refund Policy', category: 'dealer', icon: '🔁', short: 'Dealer returns', desc: 'How customer returns, damaged items and refunds are handled with dealers' },
  customer_comm_policy: { label: 'Customer Communication Policy', category: 'dealer', icon: '💬', short: 'Communication', desc: 'How dealers may (and may not) contact customers' },
  customer_data_policy: { label: 'Customer Data & Privacy Policy', category: 'dealer', icon: '🔒', short: 'Customer data', desc: 'Using customer data only to fulfil orders, security and deletion' },
  ip_policy: { label: 'Intellectual Property Policy', category: 'dealer', icon: '©️', short: 'IP', desc: 'Brands, trademarks, copyright, counterfeit goods and IP complaints' },
  product_safety_policy: { label: 'Product Safety & Compliance Policy', category: 'dealer', icon: '🧯', short: 'Product safety', desc: 'Legal metrology, labelling, safety standards and restricted products' },
  performance_policy: { label: 'Dealer Performance & Account Health Policy', category: 'dealer', icon: '📊', short: 'Performance', desc: 'The measures we track, targets and what happens when they are missed' },
  violation_policy: { label: 'Dealer Violation, Suspension & Termination Policy', category: 'dealer', icon: '⚠️', short: 'Violations', desc: 'How violations are handled, appeals, suspension and termination' },
  // company
  platform_terms: { label: 'Platform Terms of Use', category: 'company', icon: '🏢', short: 'Platform terms', desc: 'Terms for anyone using the website or apps' },
  data_protection: { label: 'Privacy & Data Protection Policy', category: 'company', icon: '🗄️', short: 'Data protection', desc: 'How the company governs personal data (DPDP Act 2023) internally' },
  cookie_policy: { label: 'Cookie Policy', category: 'company', icon: '🍪', short: 'Cookies', desc: 'Cookies and similar technologies we use and how to control them' },
  communication_policy: { label: 'Communication Policy', category: 'company', icon: '📧', short: 'Communication', desc: 'Emails, SMS, WhatsApp and notifications we send, and opting out' },
  dispute_policy: { label: 'Dispute Resolution Policy', category: 'company', icon: '⚖️', short: 'Disputes', desc: 'Steps to resolve disputes: support, grievance, mediation, arbitration, courts' },
  fraud_policy: { label: 'Fraud Prevention Policy', category: 'company', icon: '🚨', short: 'Fraud', desc: 'How we detect and act on fraud by customers, dealers or others' },
  security_policy: { label: 'Information Security Policy', category: 'company', icon: '🔐', short: 'Security', desc: 'How we protect systems and data, and how to report a vulnerability' },
  legal_notice: { label: 'Legal Notice', category: 'company', icon: '📑', short: 'Legal notice', desc: 'Company identity, registered office, contact and statutory disclosures' },
  // earlier documents, now folded into the Customer Terms & Agreement (kept so old acceptance records still read correctly)
  payment_shipping: { label: 'Payment & Delivery Terms', category: 'customer', short: 'Payment & delivery', legacy: true },
  communications: { label: 'Electronic Communication Consent', category: 'customer', short: 'Communication', legacy: true },
};
for (const v of Object.values(DOC_KINDS)) v.audience = v.category === 'dealer' ? 'dealer' : 'customer';
export const DOC_KIND_KEYS = Object.keys(DOC_KINDS).filter((k) => !DOC_KINDS[k].legacy);
/** Documents people accept: customers at sign-up, dealers by e-signature. */
export const CUSTOMER_KINDS = DOC_KIND_KEYS.filter((k) => DOC_KINDS[k].accept === 'customer');
export const DEALER_KINDS = DOC_KIND_KEYS.filter((k) => DOC_KINDS[k].accept === 'dealer');

export const POLICY_CATEGORIES = {
  customer: { label: 'Customer policies', icon: '👤', hint: 'What shoppers agree to and rely on' },
  dealer: { label: 'Dealer policies', icon: '🏪', hint: 'Rules for dealers selling through the platform' },
  company: { label: 'Company policies', icon: '🏢', hint: 'Platform-wide and statutory documents' },
};
/** Types offered in the "Create new policy" wizard. */
export const POLICY_TYPES = {
  customer: 'Customer policy', dealer: 'Dealer policy', company: 'Company policy', legal_agreement: 'Legal agreement',
  commercial_agreement: 'Commercial agreement', privacy: 'Privacy policy', compliance: 'Compliance policy',
};
export const APPLIES_TO = { customers: 'Customers', dealers: 'Dealers', everyone: 'Everyone', staff: 'Staff / internal' };

/**
 * Version workflow: Draft → Internal review → Legal review → Approved → (Scheduled) → Published.
 * Only an approved version can be published, and only published versions are shown for acceptance.
 */
export const DOC_STATUS = {
  draft: { label: 'Draft', tone: 'warn' },
  internal_review: { label: 'Internal review', tone: 'info' },
  legal_review: { label: 'Legal review', tone: 'info' },
  changes_requested: { label: 'Changes requested', tone: 'orange' },
  approved: { label: 'Approved', tone: 'ok' },
  published: { label: 'Published', tone: 'ok' },
  retired: { label: 'Archived', tone: 'muted' },
};
export const EDITABLE_STATUSES = ['draft', 'changes_requested'];
export const IN_PROGRESS_STATUSES = ['draft', 'internal_review', 'legal_review', 'changes_requested', 'approved'];
/** Allowed moves (server and preview use the same table). */
export const WORKFLOW = {
  submit: { from: ['draft', 'changes_requested'], to: 'internal_review', action: 'version_submitted', done: 'Sent for internal review' },
  internal_approve: { from: ['internal_review'], to: 'legal_review', action: 'version_internal_ok', done: 'Internal review passed — now with legal' },
  approve: { from: ['legal_review'], to: 'approved', action: 'version_approved', done: 'Approved by legal review' },
  return: { from: ['internal_review', 'legal_review', 'approved'], to: 'changes_requested', action: 'version_returned', done: 'Changes requested' },
  publish: { from: ['approved'], to: 'published', action: 'version_published', done: 'Published' },
  retire: { from: ['published'], to: 'retired', action: 'version_retired', done: 'Archived' },
};
export const FLOW_STEPS = [['draft', 'Draft'], ['internal_review', 'Internal review'], ['legal_review', 'Legal review'], ['approved', 'Approved'], ['scheduled', 'Scheduled'], ['published', 'Published'], ['acceptance', 'User acceptance']];
/** What the admin sees on a card (status + computed states like Scheduled / Expired). */
export const DISPLAY_STATUS = {
  published: { label: 'Published', icon: '🟢', tone: 'ok' },
  draft: { label: 'Draft', icon: '🟡', tone: 'warn' },
  internal_review: { label: 'Internal review', icon: '🔵', tone: 'info' },
  legal_review: { label: 'Under legal review', icon: '🔵', tone: 'info' },
  changes_requested: { label: 'Changes requested', icon: '🟠', tone: 'orange' },
  approved: { label: 'Approved · ready to publish', icon: '✅', tone: 'ok' },
  scheduled: { label: 'Scheduled', icon: '🗓️', tone: 'info' },
  expired: { label: 'Expired · review overdue', icon: '🔴', tone: 'bad' },
  archived: { label: 'Archived', icon: '⚫', tone: 'muted' },
  superseded: { label: 'Previous version', icon: '⚫', tone: 'muted' },
  missing: { label: 'Not created', icon: '⚪', tone: 'muted' },
};

/** "Before you create your account" — every box is required. */
export const CUSTOMER_CONSENTS = [
  { key: 'understood', kinds: ['customer_terms'], label: 'I have read and understood the Customer Agreement.' },
  { key: 'terms', kinds: ['customer_terms'], label: 'I agree to the Terms & Conditions.' },
  { key: 'privacy', kinds: ['privacy'], label: 'I have read the Privacy Policy.' },
  { key: 'policies', kinds: ['refund_cancellation'], label: 'I understand the Cancellation, Return and Refund Policy.' },
];

/** "Sign Dealer Agreement" — every box is required. */
export const DEALER_CHECKS = [
  { key: 'accurate', label: 'I confirm that the information provided by me is correct.' },
  { key: 'read', label: 'I have read and understood the Dealer Agreement.' },
  { key: 'agree', label: 'I agree to the Dealer Agreement.' },
  { key: 'esign', label: 'I agree to electronic signing/acceptance of this agreement.' },
];

export const BUSINESS_TYPES = {
  proprietorship: 'Proprietorship',
  partnership: 'Partnership firm',
  llp: 'LLP',
  private_limited: 'Private Limited Company',
  public_limited: 'Public Limited Company',
  other: 'Other',
};

export const DOC_TYPES = {
  pan_card: { label: 'PAN card (business or proprietor)', number: 'pan' },
  gst_certificate: { label: 'GST registration certificate', number: 'gstin' },
  registration_certificate: { label: 'Business registration / incorporation certificate', number: 'registration_no' },
  partnership_deed: { label: 'Partnership deed' },
  address_proof: { label: 'Business address proof (electricity bill, rent agreement or similar)' },
  signatory_id: { label: 'ID proof of owner / director / authorised signatory (PAN, passport, voter ID or driving licence)' },
  bank_proof: { label: 'Cancelled cheque or bank statement page' },
  authorization_letter: { label: 'Authorisation letter / board resolution for the signatory' },
  udyam_certificate: { label: 'MSME / Udyam certificate', number: 'udyam' },
  trade_license: { label: 'Trade / shop licence', number: 'trade_license', expires: true },
  other: { label: 'Other document' },
};

/** Required documents depend on the business type (and on GSTIN being given). */
export function requiredDocs(dealer = {}) {
  const t = dealer.business_type || 'proprietorship';
  const req = ['pan_card', 'address_proof', 'signatory_id', 'bank_proof'];
  if (dealer.gstin) req.push('gst_certificate');
  if (t === 'partnership') req.push('partnership_deed', 'authorization_letter');
  if (['llp', 'private_limited', 'public_limited'].includes(t)) req.push('registration_certificate', 'authorization_letter');
  if (t === 'other') req.push('registration_certificate');
  return req;
}
export function optionalDocs(dealer = {}) {
  const req = requiredDocs(dealer);
  return ['udyam_certificate', 'trade_license', 'gst_certificate', 'registration_certificate', 'other'].filter((k) => !req.includes(k));
}

export const ONBOARDING_STATUS = {
  draft: { label: 'Draft', tone: 'muted' },
  submitted: { label: 'Submitted', tone: 'info' },
  documents_pending: { label: 'Documents pending', tone: 'warn' },
  under_review: { label: 'Under review', tone: 'info' },
  documents_rejected: { label: 'Documents rejected', tone: 'bad' },
  agreement_pending: { label: 'Agreement pending', tone: 'warn' },
  agreement_signed: { label: 'Agreement signed', tone: 'info' },
  approved: { label: 'Approved', tone: 'ok' },
  rejected: { label: 'Rejected', tone: 'bad' },
  suspended: { label: 'Suspended', tone: 'bad' },
  terminated: { label: 'Terminated', tone: 'muted' },
};

export const ONBOARDING_STEPS = [
  { key: 'business', label: 'Business information' },
  { key: 'kyc', label: 'KYC & bank' },
  { key: 'documents', label: 'Documents' },
  { key: 'review', label: 'Agreement review' },
  { key: 'sign', label: 'Digital signature' },
  { key: 'verification', label: 'Admin verification' },
  { key: 'approval', label: 'Dealer approval' },
];

export const COMMERCIAL_MODELS = {
  supply: { label: 'Supply model', hint: 'Dealer supplies at the agreed dealer price; Utsav Ghar sets the customer price.' },
  commission: { label: 'Commission model', hint: 'Dealer sells through the platform; Utsav Ghar deducts commission and fees.' },
};
export const DEFAULT_COMMERCIAL = { model: 'supply', commission_pct: 0, platform_fee: 0, payment_fee_pct: 2, settlement_days: 7, return_window_days: 7, late_dispatch_penalty: 0, logistics: 'dealer' };

// ---------------------------------------------------------------- validation
export const RX = {
  pan: /^[A-Z]{5}[0-9]{4}[A-Z]$/,
  gstin: /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/,
  ifsc: /^[A-Z]{4}0[A-Z0-9]{6}$/,
  cin: /^[LU][0-9]{5}[A-Z]{2}[0-9]{4}[A-Z]{3}[0-9]{6}$/,
  llpin: /^[A-Z]{3}-[0-9]{4}$/,
  tan: /^[A-Z]{4}[0-9]{5}[A-Z]$/,
  udyam: /^UDYAM-[A-Z]{2}-[0-9]{2}-[0-9]{7}$/,
  account: /^[0-9]{9,18}$/,
  pin: /^[1-9][0-9]{5}$/,
};
const up = (v) => String(v || '').trim().toUpperCase().replace(/\s+/g, '');

/** Field problems for the dealer's business + KYC details ({} = all good). `step`: 'business' | 'kyc' | 'all'. */
export function dealerProblems(d = {}, step = 'all') {
  const f = {};
  const need = (k, msg) => { if (!String(d[k] ?? '').trim()) f[k] = msg; };
  if (step === 'business' || step === 'all') {
    need('business_name', 'Enter the business / shop name');
    need('legal_name', 'Enter the legal entity name as on PAN or GST');
    if (!BUSINESS_TYPES[d.business_type]) f.business_type = 'Choose the business type';
    need('name', 'Enter the contact person');
    if (!/^[6-9][0-9]{9}$/.test(String(d.phone || '').replace(/\D/g, '').slice(-10))) f.phone = 'Enter a valid 10-digit mobile number';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(d.email || ''))) f.email = 'Enter a valid email';
    need('registered_address', 'Enter the registered address');
    need('address', 'Enter the business address');
    need('city', 'Enter the city'); need('state', 'Choose the state');
    if (!RX.pin.test(String(d.pincode || ''))) f.pincode = 'Enter a valid 6-digit PIN code';
    if (d.website && !/^https?:\/\/[^\s]+\.[^\s]+/.test(d.website)) f.website = 'Enter a full web address (https://…)';
  }
  if (step === 'kyc' || step === 'all') {
    if (!RX.pan.test(up(d.pan))) f.pan = 'Enter a valid PAN (e.g. ABCDE1234F)';
    if (d.gstin && !RX.gstin.test(up(d.gstin))) f.gstin = 'Enter a valid 15-character GSTIN';
    if (d.gstin && RX.pan.test(up(d.pan)) && up(d.gstin).slice(2, 12) !== up(d.pan)) f.gstin = 'GSTIN must contain the same PAN';
    if (d.cin && !RX.cin.test(up(d.cin)) && !RX.llpin.test(up(d.cin))) f.cin = 'Enter a valid CIN or LLPIN';
    if (['private_limited', 'public_limited'].includes(d.business_type) && !d.cin) f.cin = 'CIN is required for a company';
    if (d.business_type === 'llp' && !d.cin) f.cin = 'LLPIN is required for an LLP';
    if (d.tan && !RX.tan.test(up(d.tan))) f.tan = 'Enter a valid TAN';
    if (d.udyam && !RX.udyam.test(up(d.udyam))) f.udyam = 'Format: UDYAM-XX-00-0000000';
    if (!String(d.bank_name || '').trim()) f.bank_name = 'Enter the bank name';
    if (!String(d.bank_holder || '').trim()) f.bank_holder = 'Enter the account holder name';
    if (d.bank_account !== undefined && !RX.account.test(String(d.bank_account || '').replace(/\s/g, ''))) f.bank_account = 'Enter a valid account number (9–18 digits)';
    if (d.bank_account !== undefined && d.bank_account_confirm !== undefined && String(d.bank_account).replace(/\s/g, '') !== String(d.bank_account_confirm).replace(/\s/g, '')) f.bank_account_confirm = 'Account numbers do not match';
    if (!RX.ifsc.test(up(d.ifsc))) f.ifsc = 'Enter a valid IFSC (e.g. HDFC0001234)';
  }
  return f;
}
export const normalizeIds = (d) => ({ ...d, pan: up(d.pan), gstin: up(d.gstin), cin: String(d.cin || '').trim().toUpperCase(), tan: up(d.tan), udyam: String(d.udyam || '').trim().toUpperCase(), ifsc: up(d.ifsc) });
export const maskAccount = (last4) => (last4 ? `XXXX XXXX ${last4}` : '');

/** Which onboarding step a dealer is on, and what is done. */
export function onboardingProgress({ dealer = {}, docs = [], signed = false }) {
  const businessOk = !Object.keys(dealerProblems(dealer, 'business')).length;
  const kycOk = !Object.keys(dealerProblems({ ...dealer, bank_account: undefined }, 'kyc')).length && !!dealer.bank_last4;
  const req = requiredDocs(dealer);
  const latest = latestDocs(docs);
  const uploaded = req.every((k) => latest[k] && latest[k].status !== 'rejected');
  const verified = req.every((k) => latest[k]?.status === 'verified');
  const st = dealer.onboarding_status || 'draft';
  const done = {
    business: businessOk, kyc: kycOk, documents: uploaded, review: signed, sign: signed,
    verification: st === 'approved' || (verified && signed),
    approval: st === 'approved',
  };
  const current = ONBOARDING_STEPS.find((s) => !done[s.key])?.key || 'approval';
  return { done, current, required: req, missing: req.filter((k) => !latest[k] || latest[k].status === 'rejected'), rejected: req.filter((k) => latest[k]?.status === 'rejected'), verified };
}
/** Newest upload per document type. */
export function latestDocs(docs = []) {
  const m = {};
  for (const d of [...docs].sort((a, b) => String(a.uploaded_at).localeCompare(String(b.uploaded_at)) || a.id - b.id)) m[d.doc_type] = d;
  return m;
}

// ---------------------------------------------------------------- templates
/** {{key}} → value (unknown keys are left visible so a missing setting is noticed). */
export function fillTemplate(body, vars = {}) {
  return String(body || '').replace(/\{\{\s*([a-z0-9_.]+)\s*\}\}/gi, (m, k) => (vars[k] != null && vars[k] !== '' ? String(vars[k]) : m));
}
export const COMPANY_DEFAULTS = {
  company_name: 'Utsav Ghar', company_legal_name: '[Registered company name]', company_address: '[Registered office address]',
  support_email: 'support@utsavghar.in', support_phone: '[Support phone]', grievance_officer: '[Name of Grievance Officer]',
  grievance_email: 'grievance@utsavghar.in', jurisdiction_city: '[City]', website: 'www.utsavghar.in',
  legal_email: 'legal@utsavghar.in', authorised_signatory: '[Name of authorised signatory]', signatory_designation: '[Designation]',
};

/** Commercial schedule text for one dealer (inserted into the agreement as {{commercial_schedule}}). */
export function commercialSchedule(c = {}) {
  const x = { ...DEFAULT_COMMERCIAL, ...c };
  const lines = x.model === 'commission'
    ? [`Model: Commission. The Dealer sells to customers through the Platform at the price the Dealer and the Platform agree for each listing.`,
      `Marketplace commission: ${x.commission_pct}% of the item price (excluding taxes) for each delivered order.`,
      `Platform fee: Rs. ${x.platform_fee} per order.`,
      `Payment processing fee: ${x.payment_fee_pct}% of the amount collected from the customer.`]
    : [`Model: Supply. The Dealer supplies each product to the Platform at the dealer price accepted by the Platform for that product ("Dealer Price"). The Platform alone decides the price charged to customers.`,
      `The Dealer is paid the Dealer Price multiplied by the quantity delivered. No commission is deducted.`];
  lines.push(
    `Logistics: ${x.logistics === 'platform' ? 'the Platform arranges courier pickup; charges are as per the Platform rate card' : 'the Dealer delivers with its own rider or a courier at its own cost unless agreed otherwise in writing'}.`,
    `Taxes: each party bears its own taxes. Tax collected at source (TCS) and tax deducted at source (TDS) are applied where the law requires.`,
    `Settlement: within ${x.settlement_days} days after delivery, less any refunds, returns or penalties due.`,
    `Returns: customer return window of ${x.return_window_days} days from delivery; returned goods in resaleable condition are taken back by the Dealer.`,
    `Late dispatch penalty: ${Number(x.late_dispatch_penalty) ? `Rs. ${x.late_dispatch_penalty} per order dispatched after the promised time` : 'none, unless repeated delays are notified in writing'}.`,
  );
  return lines.map((l, i) => `${i + 1}. ${l}`).join('\n');
}

export const AUDIT_ACTIONS = {
  customer_accepted: 'Customer accepted documents', customer_reaccepted: 'Customer accepted new version',
  dealer_registered: 'Dealer registered', dealer_saved: 'Dealer saved details', dealer_doc_uploaded: 'Document uploaded',
  dealer_submitted: 'Dealer submitted for review', dealer_otp_sent: 'Signing OTP sent', dealer_otp_failed: 'Wrong signing OTP',
  dealer_signed: 'Dealer signed agreement', doc_verified: 'Document verified', doc_rejected: 'Document rejected',
  docs_requested: 'More documents requested', dealer_approved: 'Dealer approved', dealer_rejected: 'Dealer rejected',
  dealer_suspended: 'Dealer suspended', dealer_terminated: 'Dealer terminated', dealer_reinstated: 'Dealer reinstated',
  bank_viewed: 'Bank details viewed', doc_viewed: 'Document viewed', version_created: 'Draft version created',
  version_edited: 'Draft edited', version_published: 'Version published', version_retired: 'Version retired', company_updated: 'Company details updated',
  commercial_updated: 'Commercial terms updated',
  version_submitted: 'Sent for internal review', version_internal_ok: 'Internal review passed', version_approved: 'Approved by legal review', version_returned: 'Changes requested',
  policy_created: 'Policy created', violation_opened: 'Violation opened', violation_action: 'Violation action', violation_closed: 'Violation closed',
  listing_suspended: 'Listing suspended', health_rules_updated: 'Account health rules updated', reminder_sent: 'Reminder sent', report_exported: 'Report exported',
};

/** sha-256 hex of a string (Web Crypto works in Node 20 and browsers). */
export async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(text)));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
export const refNo = (prefix, n) => `${prefix}-${new Date(Date.now() + 330 * 6e4).toISOString().slice(0, 10).replace(/-/g, '')}-${String(n).padStart(6, '0')}`; // date in India time

/**
 * Split a document into its parts for the "Simple explanation / Full legal terms" view and the PDF:
 * # title, > intro, "## In simple words" list, and "## N. Section" blocks whose first "> " line is the simple explanation.
 */
export function parseLegalDoc(body) {
  const out = { title: '', intro: '', notes: [], summary: [], sections: [] };
  let cur = null; let inSummary = false;
  for (const raw of String(body || '').split('\n')) {
    const l = raw.trimEnd();
    if (/^# /.test(l)) { out.title = l.slice(2).trim(); continue; }
    const h = /^## (.*)$/.exec(l);
    if (h) {
      inSummary = /^in simple words$/i.test(h[1].trim());
      cur = inSummary ? null : { heading: h[1].trim(), simple: '', body: [] };
      if (cur) out.sections.push(cur);
      continue;
    }
    const q = /^> (.*)$/.exec(l);
    if (q) {
      const t = q[1].trim();
      if (cur && !cur.simple && !cur.body.length) cur.simple = t.replace(/^\*{0,2}What this means:?\*{0,2}:?\s*/i, '');
      else if (!cur && !out.sections.length && !out.intro && !/sample text|draft/i.test(t)) out.intro = t;
      else if (!cur) out.notes.push(t);
      else cur.body.push(l);
      continue;
    }
    if (inSummary) { const b = /^\s*[-*] (.*)$/.exec(l); if (b) out.summary.push(b[1]); continue; }
    if (cur) cur.body.push(l);
  }
  for (const c of out.sections) c.body = c.body.join('\n').trim();
  return out;
}
