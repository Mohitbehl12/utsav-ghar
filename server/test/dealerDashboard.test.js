import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDealerDashboard, assertDealerSafe, buckets } from '../../shared/dealerDashboard.js';

const now = Date.parse('2026-10-05T12:00:00Z');
const iso = (daysAgo) => new Date(now - daysAgo * 864e5).toISOString();
const order = (n, daysAgo, status, lines, extra = {}) => ({ order_number: n, status, sent_at: iso(daysAgo + 1), accepted_at: status === 'rejected' ? null : iso(daysAgo + 0.9), out_at: ['delivered', 'out_for_delivery'].includes(status) ? iso(daysAgo + 0.5) : null, delivered_at: status === 'delivered' ? iso(daysAgo) : null, city: 'Pune', lines, ...extra });

test('earnings are dealer price × qty, counted when delivered', () => {
  const d = buildDealerDashboard({ now, range: '7d', orders: [
    order('A', 1, 'delivered', [{ product_id: 1, name: 'Diya', qty: 2, value: 80000 }]),
    order('B', 2, 'packed', [{ product_id: 1, name: 'Diya', qty: 1, value: 40000 }]),
    order('C', 3, 'rejected', [{ product_id: 1, name: 'Diya', qty: 5, value: 200000 }]),
    order('D', 40, 'delivered', [{ product_id: 1, name: 'Diya', qty: 1, value: 40000 }]),
  ] });
  assert.equal(d.kpis.sales_value, 80000);
  assert.equal(d.kpis.units_sold, 2);
  assert.equal(d.kpis.pipeline_value, 40000);
  assert.equal(d.kpis.open_orders, 1);
  assert.equal(d.series.length, 7);
  assert.equal(d.top_products[0].units, 2);
  assert.equal(d.kpis.accept_rate, 67); // 2 accepted of 3 decided in range
});

test('stock alerts and stock in/out', () => {
  const d = buildDealerDashboard({ now, range: '30d',
    products: [{ id: 1, name: 'Diya', status: 'approved', live: true, stock: 3, dealer_price: 40000, updated_at: iso(1) }, { id: 2, name: 'Toran', status: 'approved', live: true, stock: 0, dealer_price: 10000, updated_at: iso(1) }, { id: 3, name: 'Urli', status: 'pending', stock: 9, dealer_price: 1, updated_at: iso(1) }],
    moves: [{ at: iso(5), delta: 20 }, { at: iso(4), delta: -2 }],
    orders: [order('A', 2, 'delivered', [{ product_id: 1, name: 'Diya', qty: 4, value: 1 }])] });
  assert.equal(d.kpis.total_stock, 3);
  assert.equal(d.kpis.stock_value, 120000);
  assert.deepEqual([d.kpis.low_stock, d.kpis.out_of_stock, d.kpis.products_review], [1, 1, 1]);
  assert.deepEqual([d.kpis.stock_in, d.kpis.stock_out], [20, 4]);
  assert.equal(d.stock_alerts[0].level, 'out');
  assert.ok(d.notifications.some((n) => n.text.includes('Only 3 left')));
});

test('no % change when history does not cover the previous period', () => {
  const d = buildDealerDashboard({ now, range: '30d', orders: [order('A', 2, 'delivered', [{ product_id: 1, name: 'Diya', qty: 1, value: 1 }])] });
  assert.equal(d.kpis.sales_change_pct, null);
});

test('ranges: 12 monthly buckets, ~13 weekly buckets', () => {
  assert.equal(buckets('12m', now).list.length, 12);
  assert.ok(buckets('90d', now).list.length >= 13);
});

test('guard rejects selling-price fields anywhere', () => {
  assert.throws(() => assertDealerSafe({ a: [{ ok: 1, price: 82900 }] }), /price/);
  assert.throws(() => assertDealerSafe({ margin_pct: 1 }));
  assert.doesNotThrow(() => assertDealerSafe({ dealer_price: 1, value: 2 }));
});
