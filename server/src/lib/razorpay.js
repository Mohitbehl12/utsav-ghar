/**
 * Razorpay integration (UPI intent / QR / cards via Razorpay Checkout) with
 * SERVER-SIDE verification. Swap for Cashfree / PhonePe PG / PayU by
 * implementing the same three functions.
 */
import crypto from 'node:crypto';
import { config } from '../config.js';
import { HttpError } from './http.js';

export const gatewayEnabled = () => !!(config.razorpay.keyId && config.razorpay.keySecret);

export async function createGatewayOrder({ amount, receipt, notes }) {
  if (!gatewayEnabled()) throw new HttpError(400, 'Online payment gateway is not configured.');
  const auth = Buffer.from(`${config.razorpay.keyId}:${config.razorpay.keySecret}`).toString('base64');
  const r = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount, currency: 'INR', receipt, notes, payment_capture: 1 }),
  });
  if (!r.ok) throw new HttpError(502, 'Payment gateway is unavailable. Please try UPI QR instead.');
  return r.json();
}

const safeEq = (a, b) => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

/**
 * Look up how a payment was made (card network + last 4 digits, bank, wallet …) for
 * the admin view. Card numbers never touch our server: Razorpay returns only the
 * network, type and last 4 digits. Best effort — returns null on any error.
 */
export async function fetchPaymentInstrument(paymentId) {
  if (!gatewayEnabled() || !paymentId) return null;
  try {
    const auth = Buffer.from(`${config.razorpay.keyId}:${config.razorpay.keySecret}`).toString('base64');
    const r = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}`, { headers: { Authorization: `Basic ${auth}` } });
    if (!r.ok) return null;
    return describeInstrument(await r.json());
  } catch { return null; }
}
export function describeInstrument(p) {
  if (!p) return null;
  if (p.method === 'card' && p.card) return `${p.card.network || 'Card'} ${p.card.type || ''} •••• ${p.card.last4 || ''}${p.card.international ? ' (international)' : ''}`.replace(/\s+/g, ' ').trim();
  if (p.method === 'emi' && p.card) return `EMI · ${p.card.network || ''} •••• ${p.card.last4 || ''}`.trim();
  if (p.method === 'netbanking') return `Netbanking · ${p.bank || ''}`.trim();
  if (p.method === 'wallet') return `Wallet · ${p.wallet || ''}`.trim();
  if (p.method === 'upi') return `UPI · ${p.vpa || ''}`.trim();
  if (p.method === 'paylater') return `Pay Later · ${p.wallet || p.provider || ''}`.trim();
  return p.method || null;
}

/** Verify the signature Razorpay Checkout returns to the browser. */
export function verifyCheckoutSignature({ razorpay_order_id, razorpay_payment_id, razorpay_signature }) {
  const expected = crypto
    .createHmac('sha256', config.razorpay.keySecret)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest('hex');
  return safeEq(expected, razorpay_signature);
}

/** Verify webhook body (must be the RAW request body). */
export function verifyWebhook(rawBody, signature) {
  if (!config.razorpay.webhookSecret) return false;
  const expected = crypto.createHmac('sha256', config.razorpay.webhookSecret).update(rawBody).digest('hex');
  return safeEq(expected, signature || '');
}
