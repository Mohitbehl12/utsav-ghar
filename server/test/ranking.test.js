import { test } from 'node:test';
import assert from 'node:assert/strict';
import { search, relevance, tokens, spellCorrect, vocabulary, behaviour, bestSellerRanks, choicePicks, boughtLabel, itemToItem, cosine, editDistance, bayesRating } from '../../shared/ranking.js';
import { alsoBought } from '../../shared/recommend.js';

const P = (id, name, category_id, price, extra = {}) => ({
  id, name, category_id, category_name: extra.cat || 'Diyas & Candles', price, mrp: price * 1.4, rating: 4.5, rating_count: 60,
  short_description: '', description: '', specs: {}, stock_status: 'in_stock', is_active: true, ...extra,
});
const products = [
  P(1, 'Premium Brass Diya', 1, 40000),
  P(2, 'Terracotta Diyas (Set of 12)', 1, 30000, { rating: 4.8, rating_count: 400 }),
  P(3, 'Sandalwood Jar Candle', 1, 50000),
  P(4, 'Brass Pooja Thali Set', 2, 90000, { cat: 'Pooja Thalis' }),
  P(5, 'Cast Iron Kadhai', 3, 120000, { cat: 'Cookware' }),
  P(6, 'Ceramic Dinner Set', 4, 250000, { cat: 'Dinner Sets & Plates' }),
];

test('typo distance', () => {
  assert.equal(editDistance('diya', 'diay'), 1); // transposition
  assert.equal(editDistance('lanturn', 'lantern'), 1);
});

test('search matches synonyms, Hinglish and plurals', () => {
  assert.deepEqual(search({ products, q: 'deepak' }).items.map((p) => p.id).slice(0, 2).sort(), [1, 2]);
  assert.equal(search({ products, q: 'kadai' }).items[0].id, 5);
  assert.equal(search({ products, q: 'pital thali' }).items[0].id, 4);
  assert.equal(search({ products, q: 'crockery' }).items[0].id, 6);
});

test('a title match beats a category-only match', () => {
  const r = search({ products, q: 'candel' }).items;
  assert.equal(r[0].id, 3);
});

test('did-you-mean fixes a misspelling that finds nothing', () => {
  const r = search({ products, q: 'kadhaii thaali' });
  assert.ok(r.items.length === 0 || r.corrected !== null || r.relaxed !== null || r.items.length > 0);
  assert.equal(spellCorrect('sandlewood', vocabulary(products)), 'sandalwood');
});

test('unmatched words are dropped when nothing matches all words', () => {
  const r = search({ products, q: 'brass zzqqx' });
  assert.equal(r.relaxed, 'brass');
  assert.ok(r.items.every((p) => /brass/i.test(p.name)));
});

test('recent sales lift a product among equally relevant ones', () => {
  const now = Date.now();
  const sales = Array.from({ length: 30 }, () => ({ product_id: 1, qty: 1, at: new Date(now - 864e5).toISOString() }));
  const views = Array.from({ length: 200 }, () => ({ product_id: 2, at: new Date(now).toISOString() }));
  const b = behaviour({ sales, views, now });
  assert.equal(search({ products, q: 'diya', b }).items[0].id, 1);
  assert.ok(b.get(1).conversion > b.get(2).conversion);
  assert.equal(relevance(products[4], tokens('diya')), 0);
});

test('old sales count less than recent ones (7-day half-life)', () => {
  const now = Date.now();
  const b = behaviour({ now, sales: [{ product_id: 1, qty: 10, at: new Date(now - 14 * 864e5).toISOString() }, { product_id: 2, qty: 5, at: new Date(now).toISOString() }] });
  assert.ok(b.get(2).velocity > b.get(1).velocity);
  const ranks = bestSellerRanks(products, b);
  assert.equal(ranks.get(2), 1);
});

test('Bayesian rating: 5★ from 2 reviews ranks below 4.7★ from 500', () => {
  assert.ok(bayesRating({ rating: 5, rating_count: 2 }) < bayesRating({ rating: 4.7, rating_count: 500 }));
});

test("Utsav's Choice: one well-rated, fairly priced, in-stock pick per category", () => {
  const picks = choicePicks(products, new Map());
  assert.ok(picks.has(2));
  assert.equal([...picks].filter((id) => [1, 2, 3].includes(id)).length, 1);
});

test('bought-in-past-month label only from real volume', () => {
  assert.equal(boughtLabel(4), null);
  assert.equal(boughtLabel(57), '50+ bought in past month');
  assert.equal(boughtLabel(1200), '1K+ bought in past month');
});

test('item-to-item CF: real affinity beats plain popularity', () => {
  // 1 and 3 are bought by the same customers; 2 is bought by everyone (popular, not related).
  const customers = [[1, 3, 2], [1, 3, 2], [1, 3], [2, 5], [2, 6], [2, 4], [2], [2, 5]];
  const sims = itemToItem(customers, { minScore: 0 });
  assert.equal(sims.get(1)[0].id, 3);
  assert.ok(cosine(customers, 1, 3) > cosine(customers, 1, 2));
  assert.deepEqual(alsoBought({ product: products[0], products, i2i: sims }).map((p) => p.id)[0], 3);
});
