export { formatRupees as rupees } from '@shared/pricing.js';

export const fmtDate = (iso, opts = { day: 'numeric', month: 'short', year: 'numeric' }) =>
  iso ? new Date(iso).toLocaleDateString('en-IN', opts) : '';
export const fmtDateTime = (iso) =>
  iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '';

export const PAYMENT_LABEL = {
  awaiting_payment: 'Awaiting Payment',
  verification_pending: 'Payment Verification Pending',
  confirmed: 'Payment Confirmed',
  rejected: 'Payment Rejected',
  refunded: 'Refunded',
  pending: 'Awaiting Payment',
};
export const STATUS_LABEL = {
  placed: 'Order Placed',
  payment_confirmed: 'Payment Confirmed',
  processing: 'Processing',
  shipped: 'Shipped',
  out_for_delivery: 'Out for Delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  sent_to_dealer: 'Sent to Dealer',
  dealer_accepted: 'Order Accepted',
  packed: 'Packed',
  ready_for_delivery: 'Ready for Delivery',
};
export const tone = (s) =>
  ({
    confirmed: 'ok', delivered: 'ok', payment_confirmed: 'ok',
    verification_pending: 'warn', awaiting_payment: 'warn', pending: 'warn', placed: 'info', processing: 'info', shipped: 'info', out_for_delivery: 'info',
    rejected: 'bad', cancelled: 'bad', refunded: 'muted',
  })[s] || 'muted';

/** Build a UPI deep link (NPCI UPI linking spec). */
export function upiLink({ upiId, payee, amountPaise, note, ref }) {
  const q = new URLSearchParams({ pa: upiId, pn: payee || '', cu: 'INR' });
  if (amountPaise) q.set('am', (amountPaise / 100).toFixed(2));
  if (note) q.set('tn', note);
  if (ref) q.set('tr', ref);
  return `upi://pay?${q.toString().replace(/\+/g, '%20')}`;
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export const slugify = (s) => String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
