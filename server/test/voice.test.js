import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseVoice, describeForSpeech } from '../../shared/voice.js';

const t = (s) => { const r = parseVoice(s); delete r.raw; return r; };

test('English, Hinglish and Hindi add-to-cart sentences', () => {
  assert.deepEqual(t('add 2 brass diya'), { intent: 'add', qty: 2, query: 'brass diya', maxPrice: null, minPrice: null });
  assert.equal(t('2 brass diya cart mein daal do').qty, 2);
  assert.equal(t('2 brass diya cart mein daal do').query, 'brass diya');
  assert.deepEqual(t('मुझे दो दीये चाहिए'), { intent: 'add', qty: 2, query: 'diya', maxPrice: null, minPrice: null });
  assert.equal(t('teen toran chahiye').qty, 3);
  assert.equal(t('do kalash chahiye').qty, 2);
  assert.equal(t('add one gift hamper').qty, 1);
  assert.equal(t('I want a dinner set').query, 'dinner set');
});

test('"do" as a verb is not the number two', () => {
  assert.equal(t('brass diya cart mein daal do').qty, 1);
  assert.equal(t('brass diya hata do').intent, 'remove');
});

test('price limits in words and numbers', () => {
  assert.equal(t('pooja thali 1000 se kam dikhao').maxPrice, 1000);
  assert.equal(t('show fairy lights under 500').maxPrice, 500);
  assert.equal(t('kadhai paanch sau tak').maxPrice, 500);
  assert.equal(t('मुझे पीतल की थाली 2000 रुपये तक दिखाओ').query, 'brass thali');
  assert.equal(t('dinner set above 2000').minPrice, 2000);
});

test('commands', () => {
  assert.equal(t('cart dikhao').intent, 'cart');
  assert.equal(t('show my cart').intent, 'cart');
  assert.equal(t('checkout karo').intent, 'checkout');
  assert.equal(t('buy now copper bottle').intent, 'buy');
  assert.equal(t('add karo').intent, 'help');
});

test('spoken product summary', () => {
  const s = describeForSpeech({ name: 'Premium Brass Diya', price: 39900, discount_pct: 33, rating: 4.8, rating_count: 214, stock_status: 'in_stock' }, { added: 2 });
  assert.match(s, /399 rupees, 33 percent off/);
  assert.match(s, /Added 2 to your cart/);
});
