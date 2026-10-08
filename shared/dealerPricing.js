/**
 * Selling-price calculator for dealer products (ADMIN ONLY — never sent to dealers).
 *
 *   dealer cost + expenses (shipping, packaging, other) + desired profit
 *   → ÷ (1 − platform/payment fee %)        (the fee is charged on the selling price)
 *   → + GST %                                 (if the price shown to customers includes tax)
 *   → rounded to a nice price (₹799, ₹849…)
 *
 * Example: cost ₹400 + expenses ₹100 + profit ₹300, no fee/GST → ₹800.
 * All amounts are in paise.
 */
export const PRICING_DEFAULTS = {
  shipping: 0, packaging: 0, other: 0,           // paise per piece
  platform_pct: 0, gst_pct: 0,                   // %
  profit_mode: 'amount', profit_value: 0,         // amount (paise) | percent (of dealer cost)
  rounding: 'rupee',                              // rupee | nine (₹…9) | ninety_nine (₹…49 / ₹…99)
};

function roundPrice(paise, mode) {
  const r = Math.ceil(paise / 100); // whole rupees, never below the calculated price
  if (mode === 'nine') return (r % 10 === 9 ? r : r + ((9 - (r % 10) + 10) % 10)) * 100;
  if (mode === 'ninety_nine') { const h = Math.floor(r / 100) * 100; const c = [h + 49, h + 99, h + 149].find((x) => x >= r); return c * 100; }
  return r * 100;
}

export function calcSellingPrice(input) {
  const p = { ...PRICING_DEFAULTS, ...input };
  const n = (v) => Math.max(0, Math.round(Number(v) || 0));
  const cost = n(p.cost);
  const shipping = n(p.shipping); const packaging = n(p.packaging); const other = n(p.other);
  const expenses = shipping + packaging + other;
  const profit = p.profit_mode === 'percent' ? Math.round((cost * Math.max(0, Number(p.profit_value) || 0)) / 100) : n(p.profit_value);
  const platformPct = Math.min(50, Math.max(0, Number(p.platform_pct) || 0));
  const gstPct = Math.min(40, Math.max(0, Number(p.gst_pct) || 0));
  const subtotal = cost + expenses + profit;
  const exTax = subtotal / (1 - platformPct / 100);
  const platformFee = exTax - subtotal;
  const gst = (exTax * gstPct) / 100;
  const raw = exTax + gst;
  const selling = roundPrice(raw, p.rounding);
  // what is actually left after the rounding: (price without GST) − fee − cost − expenses
  const sellingExTax = selling / (1 + gstPct / 100);
  const netProfit = Math.round(sellingExTax * (1 - platformPct / 100) - cost - expenses);
  return {
    cost, shipping, packaging, other, expenses, profit,
    platform_fee: Math.round(platformFee), gst: Math.round(gst), raw: Math.round(raw), selling,
    rounding_extra: Math.round(selling - raw),
    net_profit: netProfit,
    margin_pct: sellingExTax ? Math.round((1000 * netProfit) / sellingExTax) / 10 : 0,   // profit ÷ price (without GST)
    markup_pct: cost ? Math.round((1000 * netProfit) / cost) / 10 : 0,                 // profit ÷ dealer cost
    inputs: { shipping, packaging, other, platform_pct: platformPct, gst_pct: gstPct, profit_mode: p.profit_mode === 'percent' ? 'percent' : 'amount', profit_value: Number(p.profit_value) || 0, rounding: p.rounding },
  };
}

/** Keys that must NEVER appear in anything sent to a dealer. */
export const INTERNAL_KEYS = ['price', 'mrp', 'pricing', 'selling', 'margin_pct', 'markup_pct', 'net_profit', 'profit', 'internal_note'];
