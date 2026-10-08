/**
 * Server-side conversion reporting, sent ONLY when a payment is confirmed
 * (by an admin after checking the bank, or by the payment gateway).
 *
 * - Meta Conversions API: Purchase event, event_id = order number so Meta can
 *   de-duplicate it against any browser event. Personal data is SHA-256 hashed
 *   as Meta requires. Needs META_CAPI_TOKEN in .env + Pixel ID in settings.
 * - GA4 Measurement Protocol: purchase event. Needs GA4_API_SECRET in .env +
 *   Measurement ID in settings.
 * Both are skipped silently when not configured; failures never block orders.
 */
import crypto from 'node:crypto';
import { db, now } from '../db.js';
import { config } from '../config.js';
import { getSettings } from './catalog.js';

const sha = (v) => (v ? crypto.createHash('sha256').update(String(v).trim().toLowerCase()).digest('hex') : undefined);
const phoneE164 = (p, country) => {
  const d = String(p || '').replace(/\D/g, '');
  if (!d) return undefined;
  return country === 'IN' && d.length === 10 ? `91${d}` : d;
};

export const conversionsStatus = () => ({
  metaCapi: !!config.meta.capiToken,
  ga4: !!config.ga4.apiSecret,
});

async function sendMeta(o, items, s) {
  if (!s.meta_pixel_id || !config.meta.capiToken) return 'skipped';
  const body = {
    data: [{
      event_name: 'Purchase',
      event_time: Math.floor(Date.now() / 1000),
      event_id: o.order_number,
      action_source: 'website',
      event_source_url: o.landing_page || `${config.publicUrl}/checkout`,
      user_data: {
        em: o.customer_email ? [sha(o.customer_email)] : undefined,
        ph: [sha(phoneE164(o.customer_phone, o.ship_country))],
        fn: [sha(o.customer_name.split(' ')[0])],
        ln: o.customer_name.includes(' ') ? [sha(o.customer_name.split(' ').slice(1).join(' '))] : undefined,
        ct: [sha(o.ship_city.replace(/\s+/g, ''))],
        zp: [sha(o.ship_pincode.replace(/\s+/g, ''))],
        country: [sha(o.ship_country || 'in')],
        client_ip_address: o.client_ip || undefined,
        client_user_agent: o.user_agent || undefined,
        fbp: o.fbp || undefined,
        fbc: o.fbc || undefined,
      },
      custom_data: {
        currency: 'INR',
        value: o.total / 100,
        order_id: o.order_number,
        content_type: 'product',
        content_ids: items.map((i) => String(i.product_id)),
        contents: items.map((i) => ({ id: String(i.product_id), quantity: i.qty, item_price: i.unit_price / 100 })),
        num_items: items.reduce((n, i) => n + i.qty, 0),
      },
    }],
    ...(config.meta.testEventCode ? { test_event_code: config.meta.testEventCode } : {}),
  };
  const r = await fetch(`https://graph.facebook.com/v20.0/${encodeURIComponent(s.meta_pixel_id)}/events?access_token=${encodeURIComponent(config.meta.capiToken)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  return r.ok ? 'sent' : `failed ${r.status}`;
}

async function sendGa4(o, items, s) {
  if (!s.ga4_measurement_id || !config.ga4.apiSecret) return 'skipped';
  const body = {
    client_id: o.ga_client_id || `${Math.floor(Math.random() * 1e9)}.${Math.floor(Date.now() / 1000)}`,
    events: [{
      name: 'purchase',
      params: {
        transaction_id: o.order_number,
        currency: 'INR',
        value: o.total / 100,
        shipping: o.delivery_fee / 100,
        coupon: o.coupon_code || undefined,
        campaign: o.utm_campaign || undefined,
        source: o.utm_source || undefined,
        medium: o.utm_medium || undefined,
        items: items.map((i) => ({ item_id: String(i.product_id), item_name: i.product_name, price: i.unit_price / 100, quantity: i.qty })),
      },
    }],
  };
  const r = await fetch(`https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(s.ga4_measurement_id)}&api_secret=${encodeURIComponent(config.ga4.apiSecret)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  return r.ok ? 'sent' : `failed ${r.status}`;
}

/** Report a confirmed purchase once. Safe to call more than once per order. */
export async function reportPurchase(orderId) {
  const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (!o || o.conversion_sent || o.payment_status !== 'confirmed') return;
  db.prepare('UPDATE orders SET conversion_sent = 1 WHERE id = ?').run(o.id); // claim first: no double sends
  const items = db.prepare('SELECT product_id, product_name, unit_price, qty FROM order_items WHERE order_id = ?').all(o.id);
  const s = getSettings();
  const results = await Promise.allSettled([sendMeta(o, items, s), sendGa4(o, items, s)]);
  const [meta, ga] = results.map((r) => (r.status === 'fulfilled' ? r.value : `error ${r.reason?.message || ''}`.slice(0, 80)));
  db.prepare('INSERT INTO order_events(order_id, status, note, created_at) VALUES(?,?,?,?)').run(o.id, 'conversion_reported', `Meta: ${meta} · GA4: ${ga}`, now());
}
