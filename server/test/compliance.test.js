import test from 'node:test';
import assert from 'node:assert/strict';
import { policyState, currentOf, acceptanceStats, buildLegalCenter, computeDealerHealth, healthRules, docExpiry, setIntro, legalCalendar, toCsv, POLICY_FRAMEWORK } from '../../shared/compliance.js';
import { DOC_KINDS, CUSTOMER_KINDS, DEALER_KINDS, WORKFLOW, parseLegalDoc } from '../../shared/legal.js';
import { STARTER_POLICIES } from '../../shared/policyTemplates.js';

const NOW = Date.parse('2026-10-06T10:00:00Z');
const iso = (d) => new Date(NOW + d * 864e5).toISOString();
const doc = (id, kind, status, extra = {}) => ({ id, kind, version: '1.0', title: DOC_KINDS[kind]?.label || kind, status, material: 0, published_at: status === 'published' ? iso(-10) : null, effective_at: status === 'published' ? iso(-10) : null, updated_at: iso(-1), ...extra });

test('acceptance kinds stay the same three customer + two dealer documents', () => {
  assert.deepEqual(CUSTOMER_KINDS, ['customer_terms', 'privacy', 'refund_cancellation']);
  assert.deepEqual(DEALER_KINDS, ['dealer_agreement', 'marketplace_policy']);
});
test('every new policy has an original starter template in the simple + full format', () => {
  const kinds = Object.keys(DOC_KINDS).filter((k) => !DOC_KINDS[k].legacy && !['customer_terms', 'privacy', 'refund_cancellation', 'dealer_agreement', 'marketplace_policy'].includes(k));
  for (const k of kinds) {
    const p = parseLegalDoc(STARTER_POLICIES[k]?.body);
    assert.ok(p.title && p.intro && p.summary.length >= 3 && p.sections.length >= 3 && p.sections.every((s) => s.simple && s.body), k);
    assert.ok(!/amazon/i.test(STARTER_POLICIES[k].body), `${k} must not mention or copy another marketplace`);
  }
  for (const items of Object.values(POLICY_FRAMEWORK)) for (const [, kind] of items) assert.ok(DOC_KINDS[kind], kind);
});
test('workflow: internal review before legal review; only approved can publish', () => {
  assert.deepEqual(WORKFLOW.submit.from, ['draft', 'changes_requested']);
  assert.equal(WORKFLOW.internal_approve.to, 'legal_review');
  assert.deepEqual(WORKFLOW.publish.from, ['approved']);
});
test('display states: scheduled, expired (review overdue), previous version, archived', () => {
  const live = doc(1, 'privacy', 'published', { next_review_at: iso(-1) });
  const old = doc(2, 'privacy', 'published', { published_at: iso(-40), effective_at: iso(-40) });
  const future = doc(3, 'privacy', 'published', { published_at: iso(0), effective_at: iso(5) });
  const docs = [live, old, future];
  assert.equal(currentOf(docs, 'privacy', NOW).id, 1);
  assert.equal(policyState(live, live, NOW), 'expired');
  assert.equal(policyState(old, live, NOW), 'superseded');
  assert.equal(policyState(future, live, NOW), 'scheduled');
  assert.equal(policyState({ ...old, status: 'retired' }, live, NOW), 'archived');
  assert.equal(policyState(null), 'missing');
});
test('acceptance stats: accepted, older non-material, pending after material change', () => {
  const v1 = doc(1, 'privacy', 'published', { published_at: iso(-30), effective_at: iso(-30) });
  const v2 = doc(2, 'privacy', 'published', { published_at: iso(-5), effective_at: iso(-5), material: 0 });
  const acc = [{ id: 1, subject_type: 'customer', subject_id: 1, kind: 'privacy', document_id: 2 }, { id: 2, subject_type: 'customer', subject_id: 2, kind: 'privacy', document_id: 1 }];
  let s = acceptanceStats({ docs: [v1, v2], subjects: { customer: [1, 2, 3] }, acceptances: acc, now: NOW }).privacy;
  assert.deepEqual([s.accepted, s.older, s.pending, s.rate], [1, 1, 1, 66.7]);
  s = acceptanceStats({ docs: [v1, { ...v2, material: 1 }], subjects: { customer: [1, 2, 3] }, acceptances: acc, now: NOW }).privacy;
  assert.deepEqual([s.accepted, s.older, s.pending], [1, 0, 2]);
});
test('legal center KPIs, custom policies and checklist', () => {
  const docs = [doc(1, 'customer_terms', 'published', { next_review_at: iso(10), legal_approved: 1 }), doc(2, 'payment_policy', 'internal_review'), doc(3, 'kyc_policy', 'legal_review'), doc(4, 'custom_gift_cards', 'draft', { title: 'Gift Card Policy', category: 'customer' })];
  const c = buildLegalCenter({ docs, accStats: {}, now: NOW });
  assert.equal(c.kpis.active, 1); assert.equal(c.kpis.pending_review, 2); assert.equal(c.kpis.expiring, 1);
  assert.ok(c.cards.some((x) => x.kind === 'custom_gift_cards' && x.custom && x.category === 'customer'));
  const item = c.checklist[0].items.find((i) => i.label === 'Terms & Conditions');
  assert.equal(item.status, 'ready');
  assert.equal(c.checklist[0].items.find((i) => i.label === 'Payment Policy').status, 'in_progress');
});
test('dealer account health levels', () => {
  const orders = Array.from({ length: 10 }, (_, i) => ({ status: i < 2 ? 'rejected' : 'delivered', sent_at: iso(-5), accepted_at: iso(-5), out_at: i < 2 ? null : iso(i === 3 ? -1 : -4.9), tickets: i === 4 ? ['Item arrived damaged'] : [] }));
  const h = computeDealerHealth({ orders, violations: [], docs: [], rules: null, now: NOW });
  const m = Object.fromEntries(h.metrics.map((x) => [x.key, x]));
  assert.equal(m.cancellation_rate.value, 20); assert.equal(m.cancellation_rate.level, 'restricted');
  assert.equal(m.late_shipment_rate.value, 12.5); assert.equal(m.late_shipment_rate.level, 'warning');
  assert.equal(m.quality_complaints.value, 1);
  assert.equal(h.status, 'restricted');
  const few = computeDealerHealth({ orders: orders.slice(0, 2), now: NOW });
  assert.equal(few.status, 'good', 'rates are not judged on too few orders');
  const fraud = computeDealerHealth({ violations: [{ type: 'fraud', severity: 'critical', status: 'open' }], now: NOW });
  assert.equal(fraud.status, 'restricted');
  const docs = computeDealerHealth({ docs: [{ latest: true, expiry_date: new Date(NOW + 10 * 864e5).toISOString().slice(0, 10) }], now: NOW });
  assert.equal(docs.status, 'attention');
});
test('health rules are clamped and keep defaults', () => {
  const r = healthRules({ window_days: 9999, thresholds: { cancellation_rate: [1, 2, 3] } });
  assert.equal(r.window_days, 365); assert.deepEqual(r.thresholds.cancellation_rate, [1, 2, 3]); assert.deepEqual(r.thresholds.fraud, [null, null, 1]);
});
test('document expiry + calendar + helpers', () => {
  assert.equal(docExpiry(null, NOW), 'no_expiry');
  assert.equal(docExpiry('2026-10-01', NOW), 'expired');
  assert.equal(docExpiry('2026-10-20', NOW), 'expiring');
  assert.equal(docExpiry('2027-10-20', NOW), 'valid');
  const ev = legalCalendar({ docs: [doc(1, 'privacy', 'published', { next_review_at: iso(-2) }), doc(2, 'privacy', 'published', { published_at: iso(0), effective_at: iso(3) })], dealerDocs: [{ latest: true, expiry_date: '2026-10-20', label: 'Trade licence', business_name: 'X', dealer_id: 1 }], now: NOW });
  assert.ok(ev.some((e) => e.type === 'review' && e.tone === 'overdue') && ev.some((e) => e.type === 'publish') && ev.some((e) => e.type === 'doc_expiry'));
  const b = setIntro('# T\n\n> Old intro\n\n## 1. A\n> What this means: x\n', 'New intro');
  assert.equal(parseLegalDoc(b).intro, 'New intro');
  assert.equal(parseLegalDoc(setIntro('# T\n\n## 1. A\n> What this means: x', 'Added')).intro, 'Added');
  assert.equal(toCsv([['a', 'b,c'], ['"q"', 1]]), 'a,"b,c"\r\n"""q""",1');
});
