import { test } from 'node:test';
import assert from 'node:assert/strict';
import { festivalAlertDue, digestDue, personalPicks, festivalSections, buildMessage, renderEmail, renderWhatsApp, daysUntil, upcoming } from '../../shared/crm.js';
import { normalizeIndianPhone, isIndianMobile } from '../../shared/phone.js';

const at = (iso) => Date.parse(`${iso}T05:00:00Z`); // 10:30 IST
const P = (id, segment, category_slug, extra = {}) => ({ id, slug: `p${id}`, name: `Product ${id}`, segment, category_id: id % 5, category_slug, price: 50000, mrp: 70000, discount_pct: 29, rating: 4.6, rating_count: 80, stock_status: 'in_stock', is_active: true, ...extra });
const products = [
  P(1, 'pooja', 'pooja-essentials'), P(2, 'pooja', 'pooja-essentials'), P(3, 'festive-decor', 'diyas-candles', { is_diwali: true }),
  P(4, 'dining', 'dinnerware'), P(5, 'kitchen', 'cookware'), P(6, 'festive-decor', 'christmas-decor'), P(7, 'gifts', 'diwali-gifts', { is_diwali: true }),
  P(8, 'dining', 'serveware'), P(9, 'festive-decor', 'diwali-lights', { is_diwali: true, stock_status: 'out_of_stock' }),
];
const cal = [
  { slug: 'diwali', name: 'Diwali', emoji: '🪔', date: '2026-11-08', collection: true, major: true },
  { slug: 'bhai-dooj', name: 'Bhai Dooj', emoji: '🎁', date: '2026-11-10', categories: ['diwali-gifts'] },
  { slug: 'christmas', name: 'Christmas', emoji: '🎄', date: '2026-12-25', categories: ['christmas-decor'], major: true },
];

test('phone numbers typed with spaces, dashes or +91 are accepted', () => {
  for (const s of ['98765 43210', '98765-43210', '+91 98765 43210', '091-9876543210', '919876543210']) assert.equal(normalizeIndianPhone(s), '9876543210');
  assert.equal(isIndianMobile('12345 67890'), false);
});

test('festival alerts: 21/10/5 days before big festivals, 7 before others, bigger one wins a clash', () => {
  assert.equal(festivalAlertDue(cal, at('2026-10-18'))?.festival.slug, 'diwali');
  assert.equal(festivalAlertDue(cal, at('2026-10-29'))?.stage, 10);
  assert.equal(festivalAlertDue(cal, at('2026-11-03'))?.festival.slug, 'diwali'); // Bhai Dooj 7-day alert same day → Diwali wins
  assert.equal(festivalAlertDue(cal, at('2026-10-19')), null);
  assert.equal(festivalAlertDue(cal.map((f) => ({ ...f, enabled: false })), at('2026-10-18')), null);
  assert.equal(daysUntil('2026-11-08', at('2026-11-01')), 7);
  assert.ok(upcoming(cal, at('2026-10-01'))[0].alerts.length === 3);
});

test('daily / weekly / festivals-only timing, and never after unsubscribing', () => {
  const now = at('2026-10-10');
  assert.equal(digestDue({ status: 'active', email_opt_in: 1, frequency: 'daily', last_digest_at: new Date(at('2026-10-09')).toISOString() }, now), true);
  assert.equal(digestDue({ status: 'active', email_opt_in: 1, frequency: 'daily', last_digest_at: new Date(now - 36e5).toISOString() }, now), false);
  assert.equal(digestDue({ status: 'active', email_opt_in: 1, frequency: 'weekly', last_digest_at: new Date(at('2026-10-06')).toISOString() }, now), false);
  assert.equal(digestDue({ status: 'active', email_opt_in: 1, frequency: 'weekly', last_digest_at: new Date(at('2026-10-03')).toISOString() }, now), true);
  assert.equal(digestDue({ status: 'active', whatsapp_opt_in: 1, frequency: 'festivals' }, now), false);
  assert.equal(digestDue({ status: 'unsubscribed', email_opt_in: 1, frequency: 'daily' }, now), false);
});

test('picks follow interests, skip last week\'s items and out-of-stock, max 2 per category', () => {
  const picks = personalPicks({ products, sub: { interests: ['dining'] }, recentSent: [1], limit: 4 });
  assert.ok(picks.filter((p) => p.segment === 'dining').length >= 2);
  assert.ok(!picks.some((p) => p.id === 1 || p.id === 9));
});

test('festival alerts are grouped by section (category-wise)', () => {
  const secs = festivalSections({ products, festival: cal[0], sub: { interests: ['gifts'] } });
  assert.equal(secs[0].slug, 'gifts');
  assert.ok(secs.every((s) => s.items.every((p) => p.is_diwali && p.stock_status !== 'out_of_stock')));
});

test('email & WhatsApp carry app/website links, unsubscribe, and no line breaks in template params', () => {
  const m = buildMessage({ sub: { name: 'Meera Joshi', frequency: 'daily', interests: [] }, products, signals: {}, bought: [], recentSent: [], alert: null, deal: products[3], offer: 'Buy 2 get 10%' });
  const e = renderEmail(m, { baseUrl: 'https://www.utsavghar.in', code: 'abc123defg', token: 'tok' });
  assert.match(e.html, /https:\/\/www\.utsavghar\.in\/go\/abc123defg\/p\d+\?utm_source=email/);
  assert.match(e.html, /Unsubscribe/);
  assert.match(e.headers['List-Unsubscribe'], /preferences\/tok\?stop=email/);
  assert.match(e.html, /Namaste Meera/);
  assert.doesNotMatch(e.html, /<script/i);
  const w = renderWhatsApp(m, { baseUrl: 'https://www.utsavghar.in', code: 'abc123defg', token: 'tok' });
  assert.ok(w.template.params.every((x) => !/\n/.test(x)));
  assert.match(w.template.buttonSuffix, /^abc123defg\?utm_source=whatsapp/);
  assert.match(w.text, /Reply STOP/);
});

test('names are escaped in the email', () => {
  const m = buildMessage({ sub: { name: '<img src=x onerror=alert(1)>', frequency: 'daily' }, products, signals: {}, bought: [], recentSent: [] });
  assert.doesNotMatch(renderEmail(m, { baseUrl: 'https://x.in', code: 'c', token: 't' }).html, /<img src=x/);
});
