/**
 * Mandatory product declarations for online sale in India.
 *
 * - Consumer Protection (E-Commerce) Rules, 2020: country of origin and the total price (incl. taxes) must be shown
 *   before purchase.
 * - Legal Metrology (Packaged Commodities) Rules, 2011, rule 6(10): an e-commerce entity must show the declarations
 *   required on the package (name and address of manufacturer / packer / importer, common name, net quantity,
 *   retail sale price, consumer care) on the product page. Amendment Rules 2026 (G.S.R. 128(E), 13 Feb 2026, in force
 *   1 Jul 2026), new rule 6(10A): imported products must be findable with a searchable, sortable country-of-origin filter.
 * - GST: HSN code and GST rate are needed to issue a tax invoice.
 *
 * Pure helpers shared by the server, the admin panel and the store.
 */
export const MAKER_TYPES = { manufacturer: 'Manufacturer', packer: 'Packer', importer: 'Importer' };

/** What a product page must show before it is legally ready to sell; returns a list of missing items. */
export function missingDeclarations(p) {
  const miss = [];
  if (!p.origin_country) miss.push('Country of origin');
  if (!p.maker_name || !p.maker_address) miss.push('Manufacturer / packer / importer name and address');
  if (p.origin_country && !/^india$/i.test(p.origin_country) && p.maker_type !== 'importer') miss.push('Importer details (imported product)');
  if (!p.net_quantity) miss.push('Net quantity (e.g. "1 N", "500 g", "Set of 6")');
  if (!p.hsn) miss.push('HSN code');
  if (p.gst_rate == null || p.gst_rate === '') miss.push('GST rate');
  return miss;
}

/** GST split of a GST-inclusive amount (paise). Intra-state → CGST + SGST; inter-state → IGST. */
export function splitGst(inclusivePaise, ratePct, intraState) {
  const rate = Number(ratePct) || 0;
  const taxable = Math.round(inclusivePaise * 100 / (100 + rate));
  const tax = inclusivePaise - taxable;
  if (!intraState) return { taxable, igst: tax, cgst: 0, sgst: 0, tax };
  const cgst = Math.floor(tax / 2);
  return { taxable, igst: 0, cgst, sgst: tax - cgst, tax };
}

/** Indian financial year label for a date: 2026-11-04 → "2026-27". */
export function financialYear(d = new Date()) {
  const ist = new Date(new Date(d).getTime() + 5.5 * 36e5);
  const y = ist.getUTCFullYear(), start = ist.getUTCMonth() >= 3 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

/** GSTIN format check (15 characters; state code + PAN + entity + Z + checksum). Format only — not a registry lookup. */
/** Corporate Identity Number (21 characters, e.g. U52390DL2025PTC123456). */
export const CIN_RE = /^[LU]\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6}$/;
export const GSTIN_RE = /^[0-3][0-9][A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
