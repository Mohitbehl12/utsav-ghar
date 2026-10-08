import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeQuote } from '../../shared/pricing.js';

const P = (id, price, cat = 1, stock = 50) => [id, { id, name: `P${id}`, slug: `p${id}`, price, mrp: price + 10000, category_id: cat, stock, is_active: true }];
const products = new Map([P(1, 49900), P(2, 69900), P(3, 39900), P(4, 99900, 2), P(5, 10000, 1, 1)]);
const buy3 = { id: 1, name: 'Buy 3', discount_type: 'percent', discount_value: 50, min_qty: 3, max_discount: null, is_active: true, product_ids: [], category_ids: [1] };
const coupon = { id: 2, name: 'SHUBH10', discount_type: 'percent', discount_value: 10, min_qty: 1, max_discount: 30000, coupon_code: 'SHUBH10', is_active: true, product_ids: [], category_ids: [] };
const settings = { delivery_fee: 7900, free_delivery_above: 99900 };
const q = (items, extra = {}) => computeQuote({ items, products, offers: [buy3, coupon], settings, ...extra });

test('spec example: 499 + 699 + 399 → 50% off = ₹798.50', () => {
  const r = q([{ productId: 1, qty: 1 }, { productId: 2, qty: 1 }, { productId: 3, qty: 1 }]);
  assert.equal(r.subtotal, 159700);
  assert.equal(r.discount, 79850);
  assert.equal(r.delivery, 7900); // 798.50 < 999 free-delivery threshold
  assert.equal(r.total, 79850 + 7900);
  assert.equal(r.offer.id, 1);
});

test('2 eligible items → nudge to add 1 more', () => {
  const r = q([{ productId: 1, qty: 1 }, { productId: 2, qty: 1 }]);
  assert.equal(r.discount, 0);
  assert.equal(r.nudge.needed, 1);
  assert.match(r.nudge.message, /Add 1 more eligible product/);
});

test('quantity counts as units (3 × same product qualifies)', () => {
  assert.equal(q([{ productId: 1, qty: 3 }]).discount, 74850);
});

test('ineligible category items are not discounted and do not count', () => {
  const r = q([{ productId: 1, qty: 2 }, { productId: 4, qty: 1 }]);
  assert.equal(r.discount, 0);
  const r2 = q([{ productId: 1, qty: 3 }, { productId: 4, qty: 1 }]);
  assert.equal(r2.discount, 74850); // only eligible 3 × 499
});

test('max discount cap', () => {
  const capped = { ...buy3, max_discount: 50000 };
  const r = computeQuote({ items: [{ productId: 2, qty: 3 }], products, offers: [capped], settings });
  assert.equal(r.discount, 50000);
});

test('inactive / expired / future offers are ignored', () => {
  const now = new Date('2026-10-01');
  for (const o of [{ ...buy3, is_active: false }, { ...buy3, ends_at: '2026-09-01' }, { ...buy3, starts_at: '2026-12-01' }]) {
    assert.equal(computeQuote({ items: [{ productId: 1, qty: 3 }], products, offers: [o], settings, now }).discount, 0);
  }
});

test('coupon only applies when entered, best offer wins, no stacking', () => {
  const one = [{ productId: 4, qty: 1 }];
  assert.equal(q(one).discount, 0);
  assert.equal(q(one, { couponCode: 'shubh10' }).discount, 9990);
  const three = [{ productId: 1, qty: 3 }];
  const r = q(three, { couponCode: 'SHUBH10' });
  assert.equal(r.offer.id, 1); // 50% beats 10%
  assert.match(r.couponError, /better offer/);
  assert.match(q(one, { couponCode: 'NOPE' }).couponError, /invalid/);
});

test('stock is enforced and unknown products dropped', () => {
  const r = q([{ productId: 5, qty: 4 }, { productId: 999, qty: 1 }]);
  assert.equal(r.lines[0].qty, 1);
  assert.deepEqual(r.errors.map((e) => e.code).sort(), ['QTY_REDUCED', 'UNAVAILABLE']);
});

test('client-supplied garbage cannot change prices', () => {
  const r = q([{ productId: 1, qty: 1, price: 1 }, { productId: '2', qty: -5 }, { productId: 3, qty: 1.7 }]);
  assert.equal(r.subtotal, 49900 + 39900);
});

test('free delivery above threshold', () => {
  assert.equal(q([{ productId: 4, qty: 1 }]).delivery, 0);
});

// ---- tiered / cheapest / first-order / international -------------------------
const tiered = { id: 3, name: 'Tiered', discount_type: 'tiered', tiers: [{ min_qty: 2, percent: 10 }, { min_qty: 3, percent: 20 }, { min_qty: 5, percent: 30 }], min_qty: 2, is_active: true, product_ids: [], category_ids: [1] };
const tq = (items, extra = {}) => computeQuote({ items, products, offers: [tiered], settings, ...extra });

test('tiered: 1 item → nudge to 10%', () => {
  const r = tq([{ productId: 1, qty: 1 }]);
  assert.equal(r.discount, 0);
  assert.match(r.nudge.message, /Add 1 more .* 10% OFF/);
});
test('tiered: 2 → 10%, 3 → 20% with upsell to 30%, 5 → 30%', () => {
  assert.equal(tq([{ productId: 1, qty: 2 }]).discount, 9980);
  const r3 = tq([{ productId: 1, qty: 1 }, { productId: 2, qty: 1 }, { productId: 3, qty: 1 }]);
  assert.equal(r3.discount, 31940); // 20% of 1597
  assert.equal(r3.offer.label, '20% OFF');
  assert.match(r3.upsell.message, /Add 2 more .* 30% OFF/);
  assert.equal(tq([{ productId: 1, qty: 5 }]).discount, 74850);
});
test('cheapest item 50% off for each group of 3', () => {
  const cheap = { id: 4, name: 'Cheapest', discount_type: 'cheapest', discount_value: 50, min_qty: 3, is_active: true, product_ids: [], category_ids: [1] };
  const r = computeQuote({ items: [{ productId: 1, qty: 1 }, { productId: 2, qty: 1 }, { productId: 3, qty: 1 }], products, offers: [cheap], settings });
  assert.equal(r.discount, 19950); // half of the ₹399 item
  assert.equal(r.lines.find((l) => l.productId === 3).discountShare, 19950);
  const six = computeQuote({ items: [{ productId: 1, qty: 3 }, { productId: 3, qty: 3 }], products, offers: [cheap], settings });
  assert.equal(six.discount, 19950 * 2); // two groups → two cheapest units
});
test('discount shares always add up to the discount', () => {
  const r = tq([{ productId: 1, qty: 2 }, { productId: 2, qty: 1 }, { productId: 3, qty: 2 }]);
  assert.equal(r.lines.reduce((s, l) => s + l.discountShare, 0), r.discount);
});
test('first-order coupon refused for returning customers', () => {
  const welcome = { id: 5, name: 'Welcome', discount_type: 'percent', discount_value: 10, min_qty: 1, max_discount: 30000, coupon_code: 'WELCOME10', first_order_only: true, is_active: true, product_ids: [], category_ids: [] };
  const items = [{ productId: 4, qty: 1 }];
  assert.equal(computeQuote({ items, products, offers: [welcome], settings, couponCode: 'welcome10' }).discount, 9990);
  const back = computeQuote({ items, products, offers: [welcome], settings, couponCode: 'WELCOME10', customer: { firstOrder: false } });
  assert.equal(back.discount, 0);
  assert.match(back.couponError, /first orders only/);
});
test('international: domestic-only products removed, per-item shipping added', () => {
  const intl = new Map([...products, [9, { id: 9, name: 'Incense', slug: 'inc', price: 24900, mrp: 34900, category_id: 1, stock: 10, is_active: true, ships_international: 0 }]]);
  const r = computeQuote({ items: [{ productId: 9, qty: 1 }, { productId: 4, qty: 2 }], products: intl, offers: [], settings: { delivery_fee: 149900, free_delivery_above: 999900, extra_item_fee: 19900, international: true } });
  assert.deepEqual(r.errors.map((e) => e.code), ['DOMESTIC_ONLY']);
  assert.equal(r.delivery, 149900 + 19900);
});
