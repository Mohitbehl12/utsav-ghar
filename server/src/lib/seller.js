/**
 * Who sells a product, for the "Sold by" line (Consumer Protection (E-Commerce) Rules 2020 r.5(3)(a): a marketplace
 * must show the seller's name, address and contact before purchase).
 *
 * A product that came from a dealer on the COMMISSION model is sold by that dealer (Utsav Ghar is the marketplace).
 * Everything else — our own stock and dealers on the SUPPLY model, who sell to us — is sold by the company itself.
 */
import { db, parseJSON } from '../db.js';
import { DEFAULT_COMMERCIAL } from '../../../shared/legal.js';

export function marketplaceSellerOf(productId) {
  const d = db.prepare(`SELECT d.id, d.business_name, d.address, d.city, d.state, d.pincode, d.gstin, d.commercial, d.is_active
    FROM dealer_products dp JOIN dealers d ON d.id = dp.dealer_id
    WHERE dp.product_id = ? AND dp.status = 'approved' ORDER BY dp.id DESC LIMIT 1`).get(productId);
  if (!d) return null;
  const model = { ...DEFAULT_COMMERCIAL, ...parseJSON(d.commercial, {}) }.model;
  if (model !== 'commission') return null;
  return {
    dealer_id: d.id,
    name: d.business_name,
    address: [d.address, d.city, d.state, d.pincode].filter(Boolean).join(', '),
    gstin: d.gstin || null,
  };
}

/** Public view: never the dealer's id or contact phone. */
export function publicSeller(productId) {
  const s = marketplaceSellerOf(productId);
  return s ? { name: s.name, address: s.address, gstin: s.gstin, marketplace: true } : null;
}
