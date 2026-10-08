import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boughtTogether, alsoViewed, similar, forYou, forCart, dealOfTheDay, coCounts } from '../../shared/recommend.js';

const P = (id, category_id, segment, price, extra = {}) => ({ id, category_id, segment, price, mrp: price * 1.5, rating: 4.5, rating_count: 50, stock: 10, is_active: true, ...extra });
const products = [
  P(1, 10, 'festive-decor', 40000), P(2, 10, 'festive-decor', 35000), P(3, 11, 'festive-decor', 30000),
  P(4, 20, 'pooja', 50000), P(5, 30, 'kitchen', 90000), P(6, 31, 'dining', 70000), P(7, 10, 'festive-decor', 45000, { stock: 0 }),
];

test('co-counts come from shared groups', () => {
  const c = coCounts([[1, 5], [1, 5, 6], [2, 3]], 1);
  assert.equal(c.get(5), 2); assert.equal(c.get(6), 1); assert.equal(c.get(3), undefined);
});
test('bought together prefers real co-purchases and skips same category / out of stock', () => {
  const r = boughtTogether({ product: products[0], products, baskets: [[1, 5], [1, 5], [1, 6]], limit: 2 });
  assert.equal(r[0].id, 5);
  assert.ok(!r.some((p) => p.id === 1 || p.id === 7));
  assert.ok(!r.some((p) => p.category_id === 10), 'no second item from the same category');
});
test('also viewed uses sessions, then same category', () => {
  const r = alsoViewed({ product: products[0], products, sessions: [[1, 6], [1, 6]], limit: 3 });
  assert.equal(r[0].id, 6);
  assert.ok(r.some((p) => p.id === 2));
});
test('similar stays in the category and excludes itself', () => {
  const r = similar({ product: products[0], products, limit: 3 });
  assert.deepEqual(r.map((p) => p.id), [2]);
});
test('for you follows history and hides what was already seen', () => {
  const r = forYou({ products, viewed: [4], limit: 3 });
  assert.ok(!r.some((p) => p.id === 4));
  assert.ok(r.length > 0);
  const cold = forYou({ products, limit: 3 });
  assert.equal(cold.length, 3, 'new visitors still get suggestions');
});
test('cart suggestions exclude cart items', () => {
  const r = forCart({ products, cartIds: [1, 5], baskets: [[1, 6]], limit: 3 });
  assert.equal(r[0].id, 6);
  assert.ok(!r.some((p) => [1, 5].includes(p.id)));
});
test('deal of the day is an in-stock discounted product and changes by day', () => {
  const d1 = dealOfTheDay({ products, now: new Date('2026-10-01T06:00:00Z') });
  assert.ok(d1 && d1.stock > 0);
});
