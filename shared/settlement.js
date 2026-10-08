/**
 * Dealer settlement — one pure calculation used by the server, the admin panel,
 * the dealer app and the tests. All money in paise.
 *
 * Supply model:     sales = dealer price × quantity delivered; no commission.
 * Commission model: sales = item value paid by the customer; minus commission %,
 *                   platform fee per order and payment fee % (Commercial Schedule).
 * Returns received/refunded are deducted at the same value they were paid at.
 * Adjustments are manual (+ bonus / − penalty) with a label.
 * A settlement is never created with a net of zero or less, and an order or
 * return is never counted in two settlements.
 */
export const SETTLEMENT_STATUS = {
  processing: { label: 'Processing', tone: 'warn', help: 'Approved by finance; the bank transfer is being made.' },
  paid: { label: 'Paid', tone: 'ok', help: 'Sent to your bank account. See the UTR reference.' },
  cancelled: { label: 'Cancelled', tone: 'muted', help: 'This batch was cancelled; its orders will be in the next one.' },
};

const sum = (a, f) => a.reduce((s, x) => s + (f(x) || 0), 0);

/**
 * @param {object} p
 * @param {'supply'|'commission'} p.model
 * @param {Array} p.sales    [{ref, value}]  value = dealer value (supply) or item value (commission)
 * @param {Array} p.returns  [{ref, value}]
 * @param {Array} p.adjustments [{label, amount}]  (+ adds, − deducts)
 * @param {object} p.terms   { commission_pct, platform_fee (₹ per order), payment_fee_pct }
 */
export function computeSettlement({ model = 'supply', sales = [], returns = [], adjustments = [], terms = {} }) {
  const gross = sum(sales, (s) => s.value);
  const returnsTotal = sum(returns, (r) => r.value);
  let commission = 0;
  let platformFees = 0;
  let paymentFees = 0;
  if (model === 'commission') {
    const base = gross - returnsTotal;
    commission = Math.round((Math.max(0, base) * (Number(terms.commission_pct) || 0)) / 100);
    platformFees = Math.round((Number(terms.platform_fee) || 0) * 100) * sales.length;
    paymentFees = Math.round((Math.max(0, base) * (Number(terms.payment_fee_pct) || 0)) / 100);
  }
  const adj = sum(adjustments, (a) => a.amount);
  const fees = commission + platformFees + paymentFees;
  const net = gross - returnsTotal - fees + adj;
  return { orders: sales.length, gross, returns: returnsTotal, commission, platform_fees: platformFees, payment_fees: paymentFees, fees, adjustments: adj, net };
}
