// Guards against dark patterns and missing declarations creeping back into the storefront source.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { missingDeclarations, splitGst, financialYear, GSTIN_RE, CIN_RE } from '../../shared/declarations.js';
import { complaintSla } from '../../shared/support.js';
import { originOf, facetsFor } from '../../shared/facets.js';

const src = (p) => readFileSync(new URL(`../../client/src/${p}`, import.meta.url), 'utf8');

test("today's pick has no countdown or 'today only' claim (its price doesn't change at midnight)", () => {
  const recs = src('components/Recs.jsx');
  const deal = recs.slice(recs.indexOf('export function DealOfDay'), recs.indexOf('export function DealOfDay') + 1500);
  assert.ok(!/useCountdown|Ends in|Today only|Deal of the day/.test(deal));
});

test('Meta Pixel / GA4 load only after consent', () => {
  const t = src('lib/track.js');
  const init = t.slice(t.indexOf('export function initTracking'), t.indexOf('function load()'));
  assert.ok(/trackingConsent\(\) === true/.test(init), 'initTracking must check consent before loading');
  assert.ok(!/inject\(/.test(init), 'no script injection outside load()');
});

test('product page shows the legal declarations', () => {
  const p = src('pages/Product.jsx');
  for (const s of ['Country of origin', 'Net quantity', 'Consumer care', 'inclusive of all taxes']) assert.ok(p.includes(s), s);
});

test('missing declarations are listed', () => {
  assert.deepEqual(missingDeclarations({ origin_country: 'India', maker_name: 'A', maker_address: 'B', net_quantity: '1 N', hsn: '6913', gst_rate: 12 }), []);
  const m = missingDeclarations({ origin_country: 'China', maker_type: 'manufacturer', maker_name: 'A', maker_address: 'B', net_quantity: '1 N', hsn: '9405', gst_rate: 0 });
  assert.deepEqual(m, ['Importer details (imported product)']);
  assert.equal(missingDeclarations({}).length, 5);
});

test('GST is backed out of inclusive prices and split correctly', () => {
  assert.deepEqual(splitGst(11200, 12, true), { taxable: 10000, igst: 0, cgst: 600, sgst: 600, tax: 1200 });
  assert.deepEqual(splitGst(11800, 18, false), { taxable: 10000, igst: 1800, cgst: 0, sgst: 0, tax: 1800 });
  const odd = splitGst(9999, 18, true);
  assert.equal(odd.taxable + odd.cgst + odd.sgst, 9999);
  assert.deepEqual(splitGst(5000, 0, true), { taxable: 5000, igst: 0, cgst: 0, sgst: 0, tax: 0 });
});

test('financial year runs April to March in IST', () => {
  assert.equal(financialYear(new Date('2027-03-31T18:00:00Z')), '2026-27'); // 23:30 IST, 31 Mar
  assert.equal(financialYear(new Date('2027-03-31T18:31:00Z')), '2027-28'); // 00:01 IST, 1 Apr
});

test('GSTIN format', () => {
  assert.ok(GSTIN_RE.test('07AAACU1234F1Z5'));
  for (const bad of ['07AAACU1234F1Z', '99AAACU1234F1Z5', '07aaacu1234f1z5', '07AAACU1234F0Z5']) assert.ok(!GSTIN_RE.test(bad), bad);
});

test('country-of-origin facet', () => {
  assert.equal(originOf({ origin_country: '  India ' }), 'india');
  assert.equal(originOf({}), 'not-stated');
  const f = facetsFor([{ price: 100, origin_country: 'India' }, { price: 200, origin_country: 'China' }, { price: 300 }]);
  assert.deepEqual(f.origins.map((o) => o.value), ['china', 'india', 'not-stated']);
});

test('CIN format (Companies Act s.12(3)(c) on the website)', () => {
  assert.ok(CIN_RE.test('U52390DL2025PTC123456'));
  assert.ok(CIN_RE.test('L17110MH1973PLC019786'));
  assert.ok(!CIN_RE.test('U52390DL2025PTC12345') && !CIN_RE.test('07AAACU1234F1Z5'));
});

test('complaint time limits: first reply 24 h, redress within 30 days (E-Commerce Rules r.4(5))', () => {
  const t0 = Date.parse('2026-11-01T00:00:00Z');
  const t = { created_at: '2026-11-01T00:00:00Z', status: 'open', resolved_at: null };
  assert.equal(complaintSla(t, null, t0 + 23 * 3600e3).reply_overdue, false);
  assert.equal(complaintSla(t, null, t0 + 25 * 3600e3).reply_overdue, true);
  assert.equal(complaintSla(t, '2026-11-01T05:00:00Z', t0 + 25 * 3600e3).reply_overdue, false, 'a staff reply stops the first-reply clock');
  assert.equal(complaintSla(t, '2026-11-01T05:00:00Z', t0 + 31 * 86400e3).resolve_overdue, true);
  const done = { ...t, status: 'resolved', resolved_at: '2026-12-05T00:00:00Z' };
  assert.deepEqual([complaintSla(done, null, t0 + 40 * 86400e3).resolve_overdue, complaintSla(done, null).resolved_late], [false, true]);
});
