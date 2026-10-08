import test from 'node:test';
import assert from 'node:assert/strict';
import * as PDFLib from 'pdf-lib';
import { dealerProblems, requiredDocs, onboardingProgress, fillTemplate, commercialSchedule, latestDocs } from '../../shared/legal.js';
import { buildAgreementPdf, pdfSafe } from '../../shared/legalPdf.js';

test('KYC validation: PAN, GSTIN must contain PAN, IFSC, CIN for companies', () => {
  const ok = { pan: 'ABCDE1234F', gstin: '27ABCDE1234F1Z5', bank_name: 'HDFC', bank_holder: 'X', ifsc: 'HDFC0001234', business_type: 'proprietorship' };
  assert.deepEqual(dealerProblems(ok, 'kyc'), {});
  assert.ok(dealerProblems({ ...ok, gstin: '27ZZZZZ1234F1Z5' }, 'kyc').gstin);
  assert.ok(dealerProblems({ ...ok, ifsc: 'HDFC1001234' }, 'kyc').ifsc);
  assert.ok(dealerProblems({ ...ok, business_type: 'private_limited' }, 'kyc').cin);
  assert.ok(dealerProblems({ ...ok, bank_account: '123', bank_account_confirm: '123' }, 'kyc').bank_account);
  assert.ok(dealerProblems({ ...ok, bank_account: '50100012345678', bank_account_confirm: '50100012345679' }, 'kyc').bank_account_confirm);
});

test('required documents depend on business type and GSTIN', () => {
  assert.deepEqual(requiredDocs({ business_type: 'proprietorship' }), ['pan_card', 'address_proof', 'signatory_id', 'bank_proof']);
  assert.ok(requiredDocs({ business_type: 'private_limited', gstin: 'x' }).includes('registration_certificate'));
  assert.ok(requiredDocs({ business_type: 'partnership' }).includes('partnership_deed'));
  assert.ok(requiredDocs({ gstin: 'x' }).includes('gst_certificate'));
});

test('progress: a rejected document counts as missing; newest upload wins', () => {
  const docs = [{ id: 1, doc_type: 'pan_card', status: 'rejected', uploaded_at: '2026-01-01' }, { id: 2, doc_type: 'pan_card', status: 'pending', uploaded_at: '2026-01-02' }];
  assert.equal(latestDocs(docs).pan_card.id, 2);
  const p = onboardingProgress({ dealer: { business_type: 'proprietorship' }, docs: [docs[0]] });
  assert.deepEqual(p.rejected, ['pan_card']);
  assert.ok(p.missing.includes('pan_card'));
});

test('templates fill known keys and keep unknown ones visible', () => {
  assert.equal(fillTemplate('Hi {{a}} {{b}}', { a: 'X' }), 'Hi X {{b}}');
  assert.match(commercialSchedule({ model: 'commission', commission_pct: 12 }), /Marketplace commission: 12%/);
  assert.match(commercialSchedule({}), /Model: Supply/);
});

test('agreement PDF is generated with the signature page', async () => {
  const bytes = await buildAgreementPdf(PDFLib, { title: 'Dealer Agreement', company: 'Utsav Ghar', ref_no: 'UGD-1', version: '1.0', effective: '2026-10-06', body: '# T\n\n## 1. A\n- point ₹400 “x”', signature: { typed_name: 'Raj', capacity: 'Director', signed_at: new Date().toISOString() }, hash: 'abc' });
  assert.equal(Buffer.from(bytes.slice(0, 5)).toString(), '%PDF-');
  assert.equal(pdfSafe('₹400 “x”'), 'Rs.400 "x"');
});
