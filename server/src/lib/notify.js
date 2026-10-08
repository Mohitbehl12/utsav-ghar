/**
 * Notification outbox. Every message is written to `notifications` first, then
 * delivered by whichever channels are configured in .env. Unconfigured channels
 * are marked 'skipped' so nothing is silently lost — the admin can see them.
 */
import nodemailer from 'nodemailer';
import { db, now } from '../db.js';
import { config } from '../config.js';
import { formatRupees } from '../../../shared/pricing.js';

const mailer = config.smtp.host
  ? nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.port === 465,
      auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
    })
  : null;

const TEMPLATES = {
  order_placed: (o) => ({
    subject: `Order ${o.order_number} received — Utsav Ghar`,
    text: `Namaste ${o.customer_name},\n\nThank you for your order ${o.order_number} of ${formatRupees(o.total)}.\nWe will confirm once your UPI payment is verified.\n\nTrack: ${config.publicUrl}/track?order=${o.order_number}\n\nShubh Deepavali!\nTeam Utsav Ghar`,
  }),
  payment_confirmed: (o) => ({
    subject: `Payment confirmed for ${o.order_number}`,
    text: `Namaste ${o.customer_name},\n\nWe have received your payment of ${formatRupees(o.total)}. Your order is now being prepared.\n\nTrack: ${config.publicUrl}/track?order=${o.order_number}`,
  }),
  payment_rejected: (o) => ({
    subject: `Payment issue with ${o.order_number}`,
    text: `Namaste ${o.customer_name},\n\nWe could not verify the payment for order ${o.order_number}. Please reply to this email or call us so we can help.`,
  }),
  shipped: (o) => ({
    subject: `Your order ${o.order_number} has shipped 🚚`,
    text: `Good news ${o.customer_name}! Your order is on its way${o.tracking_number ? ` (${o.tracking_carrier || 'Courier'}: ${o.tracking_number})` : ''}.\n\nTrack: ${config.publicUrl}/track?order=${o.order_number}`,
  }),
  out_for_delivery: (o) => {
    const d = db.prepare("SELECT rider_name, rider_phone, otp, courier_name, awb FROM dealer_orders WHERE order_id = ? AND status = 'out_for_delivery' ORDER BY id DESC LIMIT 1").get(o.id) || {};
    return {
      subject: `Out for delivery: ${o.order_number} 🛵`,
      text: `Namaste ${o.customer_name},\n\nYour order ${o.order_number} is out for delivery today${d.rider_name ? ` with ${d.rider_name} (${d.rider_phone})` : d.courier_name ? ` with ${d.courier_name} (AWB ${d.awb})` : ''}.\n\n${d.otp ? `Your delivery code: ${d.otp}\nShare this code ONLY after you receive the parcel.\n\n` : ''}Track: ${config.publicUrl}/track?order=${o.order_number}`,
    };
  },
  delivered: (o) => ({
    subject: `Delivered: ${o.order_number}`,
    text: `Your order has been delivered. We hope it brings light to your home! Leave a review: ${config.publicUrl}/account/orders`,
  }),
  cancelled: (o) => ({
    subject: `Order ${o.order_number} cancelled`,
    text: `Your order ${o.order_number} has been cancelled. If you already paid, a refund will be processed within 5–7 business days.`,
  }),
};

const insert = () =>
  db.prepare('INSERT INTO notifications(channel, recipient, template, payload, order_id, status) VALUES(?,?,?,?,?,?)');
const mark = () => db.prepare('UPDATE notifications SET status = ?, error = ?, sent_at = ? WHERE id = ?');

export async function notifyOrder(order, template) {
  const t = TEMPLATES[template];
  if (!t) return;
  const msg = t(order);
  const kept = JSON.stringify({ ...msg, text: msg.text.replace(/(delivery code: )\d{4}/i, '$1••••') }); // the code is only in the message sent

  if (order.customer_email) {
    const id = insert().run('email', order.customer_email, template, kept, order.id, 'queued').lastInsertRowid;
    if (!mailer) mark().run('skipped', 'SMTP not configured', null, id);
    else
      mailer
        .sendMail({ from: config.smtp.from, to: order.customer_email, subject: msg.subject, text: msg.text })
        .then(() => mark().run('sent', null, now(), id))
        .catch((e) => mark().run('failed', String(e.message).slice(0, 500), null, id));
  }

  // WhatsApp / SMS: plug in your provider (Meta Cloud API, Gupshup, MSG91, Twilio).
  const wid = insert().run('whatsapp', order.customer_phone, template, kept, order.id, 'queued').lastInsertRowid;
  if (!config.whatsapp.token) {
    mark().run('skipped', 'WhatsApp provider not configured', null, wid);
  } else {
    try {
      const r = await fetch(`https://graph.facebook.com/v20.0/${config.whatsapp.phoneNumberId}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.whatsapp.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: order.customer_phone.replace(/\D/g, '').replace(/^(\d{10})$/, '91$1'),
          type: 'text',
          text: { body: msg.text },
        }),
      });
      mark().run(r.ok ? 'sent' : 'failed', r.ok ? null : `HTTP ${r.status}`, r.ok ? now() : null, wid);
    } catch (e) {
      mark().run('failed', String(e.message).slice(0, 500), null, wid);
    }
  }
}

/** Send a one-off message (e.g. an abandoned-cart reminder) through the same outbox. */
export async function notifyContact({ email, phone, template, subject, text, storeText = null }) {
  // storeText: what the outbox keeps (one-time codes are masked there; only the message sent contains them)
  const kept = JSON.stringify({ subject, text: storeText ?? text });
  if (email) {
    const id = insert().run('email', email, template, kept, null, 'queued').lastInsertRowid;
    if (!mailer) mark().run('skipped', 'SMTP not configured', null, id);
    else await mailer.sendMail({ from: config.smtp.from, to: email, subject, text })
      .then(() => mark().run('sent', null, now(), id))
      .catch((e) => mark().run('failed', String(e.message).slice(0, 500), null, id));
  }
  if (phone) {
    const wid = insert().run('whatsapp', phone, template, kept, null, 'queued').lastInsertRowid;
    if (!config.whatsapp.token) return mark().run('skipped', 'WhatsApp provider not configured', null, wid);
    try {
      const r = await fetch(`https://graph.facebook.com/v20.0/${config.whatsapp.phoneNumberId}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.whatsapp.token}`, 'Content-Type': 'application/json' },
        // Note: messages outside a 24-hour customer window need an approved template on WhatsApp Business.
        body: JSON.stringify({ messaging_product: 'whatsapp', to: phone.replace(/\D/g, '').replace(/^(\d{10})$/, '91$1'), type: 'text', text: { body: text } }),
      });
      mark().run(r.ok ? 'sent' : 'failed', r.ok ? null : `HTTP ${r.status}`, r.ok ? now() : null, wid);
    } catch (e) {
      mark().run('failed', String(e.message).slice(0, 500), null, wid);
    }
  }
}

/** Low-level delivery used by customer messages (src/lib/crm.js). Returns {status, error}. */
export async function deliverEmail({ to, subject, html, text, headers }) {
  if (!mailer) return { status: 'skipped', error: 'SMTP not configured' };
  try {
    await mailer.sendMail({ from: config.smtp.from, to, subject, html, text, headers });
    return { status: 'sent' };
  } catch (e) {
    return { status: 'failed', error: String(e.message).slice(0, 500) };
  }
}

export const waNumber = (phone) => String(phone).replace(/\D/g, '').replace(/^(\d{10})$/, '91$1');

/** Send an approved WhatsApp template (needed for any business-initiated marketing message). */
export async function deliverWhatsAppTemplate({ to, params, buttonSuffix }) {
  if (!config.whatsapp.token) return { status: 'skipped', error: 'WhatsApp provider not configured' };
  if (!config.whatsapp.marketingTemplate) return { status: 'skipped', error: 'WHATSAPP_MARKETING_TEMPLATE not set (template must be approved by Meta)' };
  try {
    const components = [{ type: 'body', parameters: params.map((t) => ({ type: 'text', text: String(t).replace(/\s*\n\s*/g, ' ').slice(0, 1000) })) }];
    if (buttonSuffix) components.push({ type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: buttonSuffix }] });
    const r = await fetch(`https://graph.facebook.com/v20.0/${config.whatsapp.phoneNumberId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.whatsapp.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to: waNumber(to), type: 'template',
        template: { name: config.whatsapp.marketingTemplate, language: { code: config.whatsapp.templateLang }, components } }),
    });
    if (r.ok) return { status: 'sent' };
    const body = await r.text().catch(() => '');
    return { status: 'failed', error: `HTTP ${r.status} ${body.slice(0, 300)}` };
  } catch (e) {
    return { status: 'failed', error: String(e.message).slice(0, 500) };
  }
}
