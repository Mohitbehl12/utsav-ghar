import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NaiveBayes, BM25, sentiment, summarizeReviews } from '../../shared/ml/text.js';
import { classify, parseGift, assist } from '../../shared/ml/assistant.js';
import { holt, forecastDemand, segmentCustomers, orderRisk } from '../../shared/ml/insights.js';
import { writeProduct } from '../../shared/ml/writer.js';

const P = [
  { id: 1, name: 'Premium Brass Diya', slug: 'brass-diya', category_name: 'Diyas', category_slug: 'diyas-candles', segment: 'festive-decor', price: 49900, mrp: 79900, stock: 20, rating: 4.6, rating_count: 40, specs: { Material: 'Solid brass', Care: 'Polish with pitambari' }, is_diwali: true, short_description: 'Hand-polished brass diya' },
  { id: 2, name: 'Brass Pooja Thali Set', slug: 'thali', category_name: 'Pooja Essentials', category_slug: 'pooja-essentials', segment: 'pooja', price: 129900, mrp: 189900, stock: 10, rating: 4.7, rating_count: 30, specs: { Material: 'Brass', "What's included": 'Thali, diya, bell, kalash' }, is_diwali: true },
  { id: 3, name: 'Steel Dinner Set', slug: 'dinner', category_name: 'Dinner Sets', category_slug: 'dinner-sets', segment: 'dining', price: 249900, mrp: 299900, stock: 5, rating: 4.3, rating_count: 12, specs: { Material: 'Stainless steel' } },
];

test('naive bayes learns labels and bm25 retrieves the right doc', () => {
  const nb = new NaiveBayes();
  for (const t of ['where is my parcel', 'track my order', 'order status']) nb.learn(t, 'track');
  for (const t of ['refund my money', 'money back please', 'refund status']) nb.learn(t, 'refund');
  assert.equal(nb.predict('when will my parcel come').label, 'track');
  assert.equal(nb.predict('i want my money back').label, 'refund');
  const ix = new BM25([{ id: 'a', title: 'Delivery time', text: 'Orders arrive in 3-6 days' }, { id: 'b', title: 'Returns', text: 'Return within 7 days of delivery' }]);
  assert.equal(ix.search('how many days for delivery')[0].doc.id, 'a');
});

test('intent model understands English and Hinglish', () => {
  assert.equal(classify('mera paisa wapas kab aayega').label, 'refund');
  assert.equal(classify('can i pay with credit card').label, 'payment_methods');
});

test('sentiment + review highlights with negation and mixed reviews', () => {
  assert.ok(sentiment('beautiful and sturdy, loved it') > 0.3);
  assert.ok(sentiment('not good, arrived broken') < 0);
  assert.ok(sentiment('bahut badhiya quality') > 0);
  assert.equal(summarizeReviews([{ rating: 5, body: 'lovely' }]), null);
  const s = summarizeReviews([
    { rating: 5, body: 'Beautiful finish and solid quality.' }, { rating: 5, body: 'Lovely look, fast delivery.' },
    { rating: 4, body: 'Pretty design but smaller size than expected.' }, { rating: 5, body: 'Great quality, worth the money.' },
  ]);
  assert.ok(s.text.startsWith('Customers'));
  assert.ok(s.pros.some((p) => p.aspect === 'quality'));
  assert.ok(s.cons.some((c) => c.aspect === 'size'));
  assert.equal(s.based_on, 4);
});

test('gift finder reads recipient, occasion and budget', () => {
  const g = parseGift('gift for my mother under 1500 for diwali');
  assert.equal(g.budget, 1500);
  assert.ok(g.recipient && g.occasion);
  const r = assist('gift for my mother under 1500', P);
  assert.equal(r.type, 'gift');
  assert.ok(r.items.every((p) => p.price <= 150000));
});

test('assistant answers product questions from real specs only', () => {
  const r = assist('is the brass diya pure brass', P);
  assert.equal(r.type, 'product');
  assert.match(r.text, /Solid brass/);
  const kb = assist('do you give gift wrap', P);
  assert.equal(kb.type, 'kb');
});

test('holt forecast follows a trend; forecast flags low stock before festival', () => {
  assert.ok(holt([2, 4, 6, 8, 10]).trend > 0);
  const now = Date.parse('2026-10-01T10:00:00Z');
  const sales = [];
  for (let d = 0; d < 84; d++) sales.push({ product_id: 1, qty: 2, at: new Date(now - d * 864e5).toISOString() });
  const rows = forecastDemand({ products: [{ ...P[0], stock: 5 }, { ...P[2], stock: 500 }], sales, calendar: [{ slug: 'diwali', name: 'Diwali', date: '2026-11-08' }], now });
  const diya = rows.find((r) => r.id === 1);
  assert.ok(['reorder_now', 'out'].includes(diya.status));
  assert.ok(diya.reorder_qty > 0);
  assert.ok(diya.forecast > 14 * 2);
  assert.equal(rows.find((r) => r.id === 3).status, 'no_sales');
});

test('customer groups (RFM) put frequent recent big spenders in champions', () => {
  const now = Date.parse('2026-10-01T00:00:00Z');
  const orders = [];
  for (let i = 0; i < 6; i++) orders.push({ customer: 'a', name: 'A', phone: '1', total: 500000, at: new Date(now - i * 10 * 864e5).toISOString() });
  orders.push({ customer: 'b', name: 'B', phone: '2', total: 50000, at: new Date(now - 300 * 864e5).toISOString() });
  orders.push({ customer: 'c', name: 'C', phone: '3', total: 80000, at: new Date(now - 3 * 864e5).toISOString() });
  const r = segmentCustomers(orders, now);
  const groupOf = (n) => r.groups.find((g) => g.customers.some((c) => c.name === n)).key;
  assert.equal(r.total, 3);
  assert.equal(groupOf('A'), 'champions');
  assert.ok(['lost', 'hibernating'].includes(groupOf('B')));
  assert.equal(groupOf('C'), 'new');
});

test('order risk scores suspicious orders high and normal orders low', () => {
  const ok = orderRisk({ total: 150000, avg_order: 140000, first_order: false, customer: { name: 'Priya Sharma', phone: '9876543210', email: 'priya@gmail.com' }, address: { state: 'Delhi', pincode: '110001', line1: 'House 12, Sector 5, Dwarka' }, same_phone_24h: 1, same_ip_24h: 1, max_line_qty: 2 });
  const bad = orderRisk({ total: 2500000, avg_order: 140000, first_order: true, utr: '123', utr_reused: true, customer: { name: 'asdf', phone: '9999999999', email: 'x@mailinator.com' }, address: { state: 'Kerala', pincode: '110001', line1: 'abc' }, same_phone_24h: 5, same_ip_24h: 6, unpaid_same_phone: 3, max_line_qty: 25 });
  assert.equal(ok.level, 'low');
  assert.equal(bad.level, 'high');
  assert.ok(bad.reasons.length >= 3);
});

test('copywriter uses only given facts and fits SEO limits', () => {
  const r = writeProduct({ ...P[1], category_name: 'Pooja Essentials' }, { festival: 'Diwali' });
  assert.equal(r.descriptions.length, 3);
  assert.ok(r.descriptions[0].includes('Thali, diya, bell, kalash'));
  assert.ok(r.seoTitles.every((t) => t.length <= 60));
  assert.ok(r.seoDescs.every((t) => t.length <= 155));
  assert.match(r.whatsapp, /\{link\}/);
  assert.ok(!/copper|glass/i.test(r.descriptions.join(' ')));
});
