import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeSettlement } from '../../shared/settlement.js';
import { returnRefundAmount, RETURN_REASONS } from '../../shared/returns.js';
import { permission, areaFor, can, PERMISSIONS, ROLE_KEYS, AREAS } from '../../shared/roles.js';

test('supply settlement: dealer value minus returns plus adjustments, no fees', () => {
  const t = computeSettlement({ model: 'supply', sales: [{ value: 12000 }, { value: 8000 }], returns: [{ value: 4000 }], adjustments: [{ label: 'Penalty', amount: -1000 }] });
  assert.deepEqual([t.gross, t.returns, t.fees, t.adjustments, t.net], [20000, 4000, 0, -1000, 15000]);
});
test('commission settlement applies commission %, per-order fee and payment fee on net sales', () => {
  const t = computeSettlement({ model: 'commission', sales: [{ value: 100000 }], returns: [], terms: { commission_pct: 12, platform_fee: 20, payment_fee_pct: 2 } });
  assert.equal(t.commission, 12000); assert.equal(t.platform_fees, 2000); assert.equal(t.payment_fees, 2000); assert.equal(t.net, 84000);
});
test('settlement with only returns is negative (never paid)', () => {
  assert.ok(computeSettlement({ sales: [], returns: [{ value: 500 }] }).net < 0);
});
test('return refund: goods paid + delivery only for damaged/wrong/missing, once', () => {
  const items = [{ paid: 39920, qty: 1 }];
  assert.equal(returnRefundAmount({ items, reason: 'damaged', deliveryFee: 7900 }).total, 47820);
  assert.equal(returnRefundAmount({ items, reason: 'damaged', deliveryFee: 7900, deliveryAlreadyRefunded: true }).total, 39920);
  assert.equal(returnRefundAmount({ items, reason: 'no_longer_needed', deliveryFee: 7900 }).total, 39920);
  assert.ok(RETURN_REASONS.damaged.photo && !RETURN_REASONS.quality.photo);
});
test('roles: owner everything, read-only never edits, finance pays, support cannot refund', () => {
  for (const a of Object.keys(AREAS)) assert.equal(permission('owner', a), 'edit');
  for (const a of Object.keys(AREAS)) assert.notEqual(permission('readonly', a), 'edit');
  assert.equal(permission('readonly', 'admins'), null);
  assert.ok(can('finance', 'refund') && can('finance', 'settle_pay') && !can('support', 'refund') && !can('operations', 'refund'));
  assert.ok(can('legal', 'legal_publish') && !can('manager', 'legal_publish'));
  assert.ok(ROLE_KEYS.every((r) => r === 'owner' || PERMISSIONS[r]));
});
test('areaFor maps admin API paths', () => {
  assert.equal(areaFor('/orders/12/action'), 'orders');
  assert.equal(areaFor('/settlements/preview'), 'settlements');
  assert.equal(areaFor('/legal/docs/3'), 'legal');
  assert.equal(areaFor('/me/password'), 'self');
  assert.equal(areaFor('/tracking/export.csv'), 'orders');
  assert.equal(areaFor('/admins/2'), 'admins');
});
