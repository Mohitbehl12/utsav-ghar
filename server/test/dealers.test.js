import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pinScore, parsePins, pickDealer, maskForDealer } from '../../shared/dealers.js';
import { calcSellingPrice } from '../../shared/dealerPricing.js';

test('PIN patterns: exact, prefix, star and range', () => {
  assert.equal(pinScore(['110017'], '110017'), 6);
  assert.equal(pinScore(['1100'], '110017'), 4);
  assert.equal(pinScore(['110*'], '110017'), 3);
  assert.equal(pinScore(['110001-110099'], '110050'), 5);
  assert.equal(pinScore(['400001-400099'], '110050'), 0);
  assert.deepEqual(parsePins('110001, 1100* ; 400001-400099 abc 12345678'), ['110001', '1100', '400001-400099']);
});

test('order goes to one dealer who sells every item and serves the PIN; nearest/priority wins', () => {
  const dealers = [
    { id: 1, is_active: true, pincodes: ['1100'], category_ids: [1], product_ids: [], pincode: '110006' },
    { id: 2, is_active: true, pincodes: ['1100'], category_ids: [1, 2], product_ids: [], pincode: '110017' },
    { id: 3, is_active: true, pincodes: [], all_india: true, category_ids: [1, 2], product_ids: [], pincode: '400001' },
    { id: 4, is_active: false, pincodes: ['110017'], category_ids: [1, 2], product_ids: [], pincode: '110017' },
  ];
  const items = [{ product_id: 10, category_id: 1 }, { product_id: 20, category_id: 2 }];
  assert.equal(pickDealer({ dealers, items, pincode: '110017' }).dealer.id, 2); // dealer 1 misses category 2, 4 is off
  assert.equal(pickDealer({ dealers, items, pincode: '110017', exclude: [2] }).dealer.id, 3); // falls back to all-India
  assert.equal(pickDealer({ dealers, items, pincode: '560001', exclude: [3] }).dealer, null);
  assert.equal(pickDealer({ dealers, items: [{ product_id: 10, category_id: 1 }], pincode: '110007' }).dealer.id, 1); // nearer shop
});

test('customer identity hidden until the dealer accepts', () => {
  const o = { customer_name: 'Neha Gupta', customer_phone: '9811122233', ship_line1: '22 Lake View', ship_city: 'Noida', ship_state: 'UP', ship_pincode: '201301' };
  const before = maskForDealer(o, 'sent');
  assert.equal(before.phone, null); assert.equal(before.address.line1, null); assert.equal(before.address.pincode, '201301');
  assert.match(before.name, /^Neha /);
  assert.equal(maskForDealer(o, 'accepted').phone, '9811122233');
});

test('selling price: cost + expenses + profit, platform fee and GST, nice rounding', () => {
  const a = calcSellingPrice({ cost: 40000, other: 10000, profit_value: 30000 });
  assert.equal(a.selling, 80000); assert.equal(a.net_profit, 30000); assert.equal(a.margin_pct, 37.5);
  const b = calcSellingPrice({ cost: 40000, shipping: 6000, packaging: 2000, other: 2000, profit_value: 30000, platform_pct: 2, gst_pct: 12, rounding: 'ninety_nine' });
  assert.equal(b.selling, 94900); assert.ok(b.net_profit >= 30000); // rounding only ever adds profit
  assert.equal(calcSellingPrice({ cost: 40000, profit_mode: 'percent', profit_value: 50, rounding: 'nine' }).selling, 60900);
  assert.equal(calcSellingPrice({ cost: 0 }).selling, 0);
});
