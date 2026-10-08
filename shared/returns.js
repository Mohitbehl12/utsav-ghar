/** Returns & refunds — shared by the server, the website and the preview. Money in paise. */
export const RETURN_REASONS = {
  damaged: { label: 'Item arrived damaged or broken', damage: true, photo: true, refundDelivery: true },
  wrong_item: { label: 'Wrong item received', damage: true, photo: true, refundDelivery: true },
  missing_item: { label: 'Item missing from the parcel', damage: true, photo: false, refundDelivery: true },
  not_as_described: { label: 'Not as shown or described', damage: false, photo: true, refundDelivery: false },
  quality: { label: 'Quality not as expected', damage: false, photo: false, refundDelivery: false },
  no_longer_needed: { label: 'No longer needed (unused, in original packing)', damage: false, photo: false, refundDelivery: false },
};
export const RETURN_STATUS = {
  requested: { label: 'Return requested', tone: 'warn', help: 'We received your request and will reply within 1 working day.' },
  approved: { label: 'Approved — pickup pending', tone: 'info', help: 'Keep the item packed. We will arrange the pickup.' },
  rejected: { label: 'Not accepted', tone: 'bad', help: 'See the reason below. You can reply through Help Center.' },
  received: { label: 'Received — refund in progress', tone: 'info', help: 'We received the item. Your refund is being processed.' },
  refunded: { label: 'Refunded', tone: 'ok', help: 'The money has been sent back to your original payment method.' },
  cancelled: { label: 'Return cancelled', tone: 'muted', help: 'This return was cancelled.' },
};
export const REFUND_STATUS = {
  pending: { label: 'Refund pending', tone: 'warn' },
  processed: { label: 'Refunded', tone: 'ok' },
  failed: { label: 'Refund failed — retrying', tone: 'bad' },
};

/**
 * Refund for a return = what the customer actually paid for those pieces
 * (line total minus their share of the discount), plus the delivery charge once
 * when the item was damaged / wrong / missing (policy §4).
 */
export function returnRefundAmount({ items, reason, deliveryFee = 0, deliveryAlreadyRefunded = false }) {
  const goods = items.reduce((s, i) => s + (i.paid ?? i.unit_paid * i.qty), 0);
  const delivery = RETURN_REASONS[reason]?.refundDelivery && !deliveryAlreadyRefunded ? Math.max(0, deliveryFee || 0) : 0;
  return { goods, delivery, total: goods + delivery };
}
