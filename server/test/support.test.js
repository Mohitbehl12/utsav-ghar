import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectIntent, TOPICS, SOLUTIONS } from '../../shared/support.js';
import { describeInstrument } from '../src/lib/razorpay.js';

test('chat understands English, Hinglish and Hindi problems', () => {
  const cases = { 'where is my order': 'track', 'order kab aayega': 'track', 'mera diya toota hua aaya': 'damaged', 'galat item aaya': 'wrong_item',
    'paise kat gaye but order pending': 'payment', 'refund kab milega': 'refund', 'order cancel karna hai': 'cancel', 'can I pay by credit card': 'payment_methods',
    'is cash on delivery available': 'cod', 'talk to a human': 'human', 'koi offer hai': 'offers', 'show brass diya under 1000': 'shop', 'मेरा ऑर्डर कहाँ है': 'track' };
  for (const [q, want] of Object.entries(cases)) assert.equal(detectIntent(q).intent, want, q);
});
test('order numbers vs prices', () => {
  assert.equal(detectIntent('where is DIWALI10245').orderNumber, 'DIWALI10245');
  assert.equal(detectIntent('10245').orderNumber, 'DIWALI10245');
  assert.equal(detectIntent('diya under 1000').orderNumber, null);
  assert.equal(detectIntent('kadhai 2500 tak').orderNumber, null);
});
test('every topic has an instant solution', () => {
  for (const t of TOPICS) assert.ok(SOLUTIONS[t.key]?.steps?.length, t.key);
});
test('only safe card details are recorded (network + last 4)', () => {
  assert.equal(describeInstrument({ method: 'card', card: { network: 'Visa', type: 'credit', last4: '4242' } }), 'Visa credit •••• 4242');
  assert.equal(describeInstrument({ method: 'netbanking', bank: 'HDFC' }), 'Netbanking · HDFC');
  assert.equal(describeInstrument({ method: 'emi', card: { network: 'RuPay', last4: '1111' } }), 'EMI · RuPay •••• 1111');
});
