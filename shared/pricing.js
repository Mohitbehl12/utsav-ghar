/**
 * Utsav Ghar — promotion & pricing engine.
 *
 * Pure function, no I/O. The SERVER is the source of truth: it loads products,
 * offers, settings and the shipping zone from the database and calls
 * computeQuote(). The browser only ever displays the result — prices and
 * discounts sent by the client are never trusted.
 *
 * All money is integer PAISE (₹1 = 100) to avoid floating-point drift.
 *
 * Offer shape (stored in `offers` + `offer_products` + `offer_categories`):
 * {
 *   id, name,
 *   discount_type: 'percent'  — X% off every eligible unit once min_qty is reached
 *                | 'flat'     — ₹X off (discount_value in paise) once min_qty is reached
 *                | 'tiered'   — tiers: [{min_qty:2, percent:10}, {min_qty:3, percent:20}, …]; best tier reached wins
 *                | 'cheapest' — for every min_qty eligible units, the cheapest unit gets discount_value% off
 *   discount_value, min_qty, tiers, max_discount (paise cap), starts_at, ends_at,
 *   coupon_code (null = automatic), first_order_only, is_active,
 *   product_ids: [], category_ids: []   // both empty = whole store
 * }
 * Offers never stack — the single best qualifying offer wins.
 */

export function isOfferLive(offer, now = new Date()) {
  if (!offer || !offer.is_active) return false;
  const t = now.getTime();
  if (offer.starts_at && t < new Date(offer.starts_at).getTime()) return false;
  if (offer.ends_at && t > new Date(offer.ends_at).getTime()) return false;
  return true;
}

export function isProductEligible(offer, product) {
  const p = offer.product_ids || [];
  const c = offer.category_ids || [];
  if (p.length === 0 && c.length === 0) return true;
  return p.includes(product.id) || c.includes(product.category_id);
}

export const sortedTiers = (offer) =>
  (Array.isArray(offer?.tiers) ? offer.tiers : [])
    .map((t) => ({ min_qty: Number(t.min_qty), percent: Number(t.percent) }))
    .filter((t) => t.min_qty >= 1 && t.percent > 0)
    .sort((a, b) => a.min_qty - b.min_qty);

/** The largest percentage an offer can give (used to rank offers for banners). */
export function offerMaxPercent(offer) {
  if (!offer) return 0;
  if (offer.discount_type === 'tiered') return Math.max(0, ...sortedTiers(offer).map((t) => t.percent));
  return offer.discount_type === 'flat' ? 0 : Number(offer.discount_value) || 0;
}

/** Short label: "20% OFF", "Up to 30% OFF", "₹200 OFF", "50% OFF cheapest item". */
export function offerLabel(offer) {
  if (!offer) return '';
  switch (offer.discount_type) {
    case 'flat': return `₹${formatRupees(offer.discount_value, false)} OFF`;
    case 'tiered': return `Up to ${offerMaxPercent(offer)}% OFF`;
    case 'cheapest': return `${offer.discount_value}% OFF cheapest item`;
    default: return `${offer.discount_value}% OFF`;
  }
}

/** Tag on product cards: "Buy 2+ · up to 30% OFF". */
export function offerTag(offer) {
  if (!offer) return '';
  if (offer.discount_type === 'tiered') {
    const t = sortedTiers(offer);
    return `Buy ${t[0]?.min_qty || 2}+ · up to ${offerMaxPercent(offer)}% OFF`;
  }
  if (offer.discount_type === 'cheapest') return `Buy ${offer.min_qty} · cheapest ${offer.discount_value}% OFF`;
  return `Buy ${offer.min_qty} · ${offerLabel(offer)}`;
}

/** Headline sentence: "Buy 2 get 10% · Buy 3 get 20% · Buy 5 get 30% OFF". */
export function offerHeadline(offer) {
  if (!offer) return '';
  if (offer.discount_type === 'tiered') return sortedTiers(offer).map((t) => `Buy ${t.min_qty} get ${t.percent}%`).join(' · ') + ' OFF';
  if (offer.discount_type === 'cheapest') return `Buy ${offer.min_qty}, get the cheapest one ${offer.discount_value}% OFF`;
  return `Buy ${offer.min_qty} products & get ${offerLabel(offer)}`;
}

export function formatRupees(paise, withSymbol = true) {
  const raw = Number(paise || 0) / 100;
  const neg = raw < 0;
  const v = Math.abs(raw);
  const hasFraction = Math.round(v * 100) % 100 !== 0;
  const s = v.toLocaleString('en-IN', {
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: 2,
  });
  return `${neg ? '−' : ''}${withSymbol ? '₹' : ''}${s}`;
}

const cap = (offer, d, base) => {
  if (offer.max_discount != null && offer.max_discount !== '') d = Math.min(d, Number(offer.max_discount));
  return Math.max(0, Math.min(Math.round(d), base));
};

/** Evaluate one offer against the eligible lines. Returns null when it doesn't qualify. */
function evaluate(offer, eligibleLines) {
  const units = eligibleLines.reduce((s, l) => s + l.qty, 0);
  const subtotal = eligibleLines.reduce((s, l) => s + l.lineTotal, 0);
  const minQty = Math.max(1, Number(offer.min_qty) || 1);
  const shares = new Map(); // productId -> paise of discount on that line

  const proportional = (d) => {
    let given = 0;
    eligibleLines.forEach((l, i) => {
      const s = i === eligibleLines.length - 1 ? d - given : Math.round((d * l.lineTotal) / (subtotal || 1));
      shares.set(l.productId, s);
      given += s;
    });
  };

  if (offer.discount_type === 'tiered') {
    const tiers = sortedTiers(offer);
    const reached = tiers.filter((t) => units >= t.min_qty).at(-1);
    const next = tiers.find((t) => units < t.min_qty);
    if (!reached) return { qualifies: false, needed: (tiers[0]?.min_qty || minQty) - units, nextLabel: `${tiers[0]?.percent || 0}% OFF`, units };
    const d = cap(offer, (subtotal * reached.percent) / 100, subtotal);
    proportional(d);
    return { qualifies: true, discount: d, units, subtotal, shares, label: `${reached.percent}% OFF`, next: next ? { needed: next.min_qty - units, label: `${next.percent}% OFF` } : null };
  }

  if (units < minQty) return { qualifies: false, needed: minQty - units, nextLabel: offerLabel(offer), units };

  if (offer.discount_type === 'cheapest') {
    const unitPrices = eligibleLines.flatMap((l) => Array.from({ length: l.qty }, () => ({ id: l.productId, price: l.unitPrice }))).sort((a, b) => a.price - b.price);
    const free = unitPrices.slice(0, Math.floor(units / minQty));
    let d = 0;
    for (const u of free) {
      const off = Math.round((u.price * Number(offer.discount_value)) / 100);
      d += off;
      shares.set(u.id, (shares.get(u.id) || 0) + off);
    }
    const capped = cap(offer, d, subtotal);
    if (capped !== d) { shares.clear(); proportional(capped); }
    const nextGroup = minQty - (units % minQty);
    return { qualifies: true, discount: capped, units, subtotal, shares, label: offerLabel(offer), next: { needed: nextGroup, label: `another ${offer.discount_value}% OFF item` } };
  }

  const d = cap(offer, offer.discount_type === 'flat' ? Number(offer.discount_value) : (subtotal * Number(offer.discount_value)) / 100, subtotal);
  proportional(d);
  return { qualifies: true, discount: d, units, subtotal, shares, label: offerLabel(offer), next: null };
}

/**
 * @param {object} args
 * @param {{productId:number, qty:number}[]} args.items
 * @param {Map<number,object>|object} args.products  id -> product row
 * @param {object[]} args.offers
 * @param {string}  [args.couponCode]
 * @param {{delivery_fee:number, free_delivery_above:number, extra_item_fee?:number, international?:boolean}} args.settings  shipping zone (paise)
 * @param {{firstOrder?:boolean}} [args.customer]  firstOrder=false disables first-order-only offers
 * @param {Date} [args.now]
 */
export function computeQuote({ items = [], products, offers = [], couponCode = '', settings = {}, customer = {}, now = new Date() }) {
  const get = (id) => (products instanceof Map ? products.get(Number(id)) : products[id]);
  const errors = [];
  const lines = [];

  // 1. Merge duplicate lines and validate every product against the catalogue.
  const merged = new Map();
  for (const it of items) {
    const id = Number(it.productId);
    const qty = Math.floor(Number(it.qty));
    if (!Number.isInteger(id) || !Number.isFinite(qty) || qty < 1) continue;
    merged.set(id, (merged.get(id) || 0) + Math.min(qty, 99));
  }
  for (const [id, wanted] of merged) {
    const p = get(id);
    if (!p || !p.is_active) {
      errors.push({ productId: id, code: 'UNAVAILABLE', message: 'A product in your cart is no longer available and was removed.' });
      continue;
    }
    if (settings.international && (p.ships_international === 0 || p.ships_international === false)) {
      errors.push({ productId: id, code: 'DOMESTIC_ONLY', message: `${p.name} ships within India only. Remove it to order for delivery abroad.` });
      continue;
    }
    let qty = wanted;
    if (p.stock <= 0) {
      errors.push({ productId: id, code: 'OUT_OF_STOCK', message: `${p.name} is out of stock.` });
      continue;
    }
    if (qty > p.stock) {
      qty = p.stock;
      errors.push({ productId: id, code: 'QTY_REDUCED', message: `Only ${p.stock} of ${p.name} left — quantity adjusted.` });
    }
    lines.push({
      productId: p.id,
      name: p.name,
      slug: p.slug,
      category_id: p.category_id,
      qty,
      unitPrice: p.price,
      mrp: p.mrp || p.price,
      lineTotal: p.price * qty,
      offerEligible: false,
      discountShare: 0,
    });
  }

  const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);
  const mrpTotal = lines.reduce((s, l) => s + l.mrp * l.qty, 0);

  // 2. Evaluate offers.
  const code = String(couponCode || '').trim().toUpperCase();
  const live = offers.filter((o) => isOfferLive(o, now));
  const byCode = live.find((o) => o.coupon_code && o.coupon_code.toUpperCase() === code);
  const firstOrderBlocked = (o) => o.first_order_only && customer.firstOrder === false;
  const usable = live.filter((o) => (!o.coupon_code || o.coupon_code.toUpperCase() === code) && !firstOrderBlocked(o));
  let couponError = null;
  if (code && !byCode) couponError = 'This coupon code is invalid or has expired.';
  else if (code && byCode && firstOrderBlocked(byCode)) couponError = `${byCode.coupon_code} is for first orders only.`;

  let best = null;
  let nudge = null;
  const progress = [];
  for (const offer of usable) {
    const eligibleLines = lines.filter((l) => isProductEligible(offer, { id: l.productId, category_id: l.category_id }));
    const r = evaluate(offer, eligibleLines);
    progress.push({ offerId: offer.id, eligibleUnits: r.units, qualifies: r.qualifies });
    if (r.qualifies) {
      if (!best || r.discount > best.r.discount) best = { offer, r, productIds: eligibleLines.map((l) => l.productId) };
    } else if (!offer.coupon_code && (!nudge || r.needed < nudge.needed)) {
      nudge = { offer, needed: r.needed, label: r.nextLabel };
    }
  }
  if (code && !couponError && best && best.offer.coupon_code?.toUpperCase() !== code) {
    couponError = 'A better offer is already applied — coupons cannot be combined.';
  }

  if (best) {
    for (const l of lines) {
      l.offerEligible = best.productIds.includes(l.productId);
      l.discountShare = best.r.shares.get(l.productId) || 0;
    }
  }

  const discount = best ? best.r.discount : 0;
  const afterDiscount = subtotal - discount;
  const units = lines.reduce((s, l) => s + l.qty, 0);
  const fee = Number(settings.delivery_fee ?? 0) + Number(settings.extra_item_fee ?? 0) * Math.max(0, units - 1);
  const freeAbove = Number(settings.free_delivery_above ?? 0);
  const delivery = lines.length === 0 || (freeAbove > 0 && afterDiscount >= freeAbove) || fee === 0 ? 0 : fee;
  const plural = (n) => `${n} more eligible product${n > 1 ? 's' : ''}`;

  return {
    lines,
    itemCount: units,
    mrpTotal,
    productSavings: mrpTotal - subtotal,
    subtotal,
    offer: best
      ? {
          id: best.offer.id,
          name: best.offer.name,
          label: best.r.label,
          type: best.offer.discount_type,
          couponCode: best.offer.coupon_code || null,
          eligibleUnits: best.r.units,
          eligibleSubtotal: best.r.subtotal,
        }
      : null,
    discount,
    delivery,
    freeDeliveryAbove: freeAbove,
    total: afterDiscount + delivery,
    nudge:
      !best && nudge
        ? { offerId: nudge.offer.id, needed: nudge.needed, label: nudge.label, message: `Add ${plural(nudge.needed)} to unlock ${nudge.label}.` }
        : null,
    // After an offer applies: what the next step up is worth ("Add 1 more for 30% OFF").
    upsell:
      best && best.r.next && !best.offer.coupon_code
        ? { needed: best.r.next.needed, label: best.r.next.label, message: `Add ${plural(best.r.next.needed)} to get ${best.r.next.label}.` }
        : null,
    progress,
    couponError,
    errors,
  };
}
