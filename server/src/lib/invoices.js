/**
 * GST tax invoices (CGST Act s.31 with CGST Rules r.46). One invoice per paid order, issued by the seller of record
 * (the company in Admin → Legal → Company details). Numbers run in a single series per financial year:
 * INV/2026-27/000001 (unique, consecutive, at most 16 characters as rule 46(b) requires).
 *
 * Prices on the store include GST, so each line's taxable value is backed out of the price actually paid
 * (after its share of any discount). Intra-state supply → CGST + SGST; inter-state → IGST.
 * Delivery charges follow the item with the highest GST rate (treated as part of a composite supply — confirm
 * with your tax adviser).
 *
 * An invoice can't be issued until the company GSTIN/state and every item's HSN and GST rate are set: the
 * function says exactly what is missing instead of producing a wrong invoice.
 */
import { db, now, parseJSON } from '../db.js';
import { HttpError } from './http.js';
import { companyVars } from './legal.js';
import { marketplaceSellerOf } from './seller.js';
import { GSTIN_RE, financialYear, splitGst } from '../../../shared/declarations.js';

const norm = (s) => String(s || '').trim().toLowerCase().replace(/[^a-z]/g, '');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const inr = (p) => `₹${(p / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Why an invoice can't be issued for this order yet (empty = ready). */
export function invoiceBlockers(order) {
  const c = companyVars();
  const out = [];
  if (!GSTIN_RE.test(String(c.company_gstin || '').toUpperCase())) out.push('Company GSTIN (Admin → Legal → Company details)');
  if (!c.company_state) out.push('State of GST registration (Admin → Legal → Company details)');
  if (/^\[/.test(c.company_legal_name || '') || /^\[/.test(c.company_address || '')) out.push('Registered company name and address');
  if (order && order.payment_status !== 'confirmed' && order.payment_status !== 'refunded') out.push('Payment not confirmed yet');
  if (order && (order.ship_country || 'IN') !== 'IN') out.push('Export invoices (shipping outside India) are not supported yet');
  if (order) {
    const missing = db.prepare(`SELECT oi.product_name FROM order_items oi LEFT JOIN products p ON p.id = oi.product_id
      WHERE oi.order_id = ? AND (p.id IS NULL OR p.hsn IS NULL OR p.hsn = '' OR p.gst_rate IS NULL)`).all(order.id);
    if (missing.length) out.push(`HSN code and GST rate for: ${missing.map((m) => m.product_name).join(', ')}`);
    // A dealer on the commission model is the seller of record for their items: the dealer issues that tax invoice,
    // not Utsav Ghar (CGST s.31). Marketplace invoicing isn't built yet, so don't issue a wrong invoice.
    const market = db.prepare('SELECT DISTINCT product_id, product_name FROM order_items WHERE order_id = ?').all(order.id).filter((i) => i.product_id && marketplaceSellerOf(i.product_id));
    if (market.length) out.push(`Items sold by a marketplace dealer are invoiced by that dealer: ${market.map((m) => m.product_name).join(', ')}`);
  }
  return out;
}

function build(order, invoiceNo, issuedAt) {
  const c = companyVars();
  const intra = norm(order.ship_state) === norm(c.company_state);
  const items = db.prepare(`SELECT oi.*, p.hsn, p.gst_rate FROM order_items oi LEFT JOIN products p ON p.id = oi.product_id WHERE oi.order_id = ? ORDER BY oi.id`).all(order.id);
  const lines = items.map((it) => {
    const paid = it.unit_price * it.qty - (it.discount_share || 0);
    return { description: it.product_name, hsn: it.hsn, qty: it.qty, unit_price: it.unit_price, discount: it.discount_share || 0, rate: Number(it.gst_rate), amount: paid, ...splitGst(paid, it.gst_rate, intra) };
  });
  if (order.delivery_fee > 0) {
    const rate = Math.max(...lines.map((l) => l.rate), 0);
    lines.push({ description: 'Delivery charges', hsn: '996812', qty: 1, unit_price: order.delivery_fee, discount: 0, rate, amount: order.delivery_fee, ...splitGst(order.delivery_fee, rate, intra) });
  }
  const sum = (k) => lines.reduce((s, l) => s + l[k], 0);
  return {
    invoice_no: invoiceNo, issued_at: issuedAt, order_number: order.order_number, order_date: order.created_at,
    seller: { name: c.company_legal_name, trade_name: c.company_name, address: c.company_address, gstin: String(c.company_gstin).toUpperCase(), state: c.company_state, email: c.support_email, phone: c.support_phone },
    buyer: { name: order.customer_name, phone: order.customer_phone, address: [order.ship_line1, order.ship_line2, order.ship_city, order.ship_state, order.ship_pincode].filter(Boolean).join(', ') },
    place_of_supply: order.ship_state, supply_type: intra ? 'Intra-state (CGST + SGST)' : 'Inter-state (IGST)', reverse_charge: 'No',
    lines, totals: { taxable: sum('taxable'), cgst: sum('cgst'), sgst: sum('sgst'), igst: sum('igst'), tax: sum('tax'), total: sum('amount') },
    order_total: order.total,
  };
}

/** The order's invoice, issuing it (once, atomically) if needed. Throws 409 with the list of what's missing. */
export function ensureInvoice(order) {
  const existing = db.prepare('SELECT * FROM invoices WHERE order_id = ?').get(order.id);
  if (existing) return { ...existing, data: parseJSON(existing.data, {}) };
  const blockers = invoiceBlockers(order);
  if (blockers.length) throw new HttpError(409, `The tax invoice can't be issued yet. Missing: ${blockers.join('; ')}.`, { code: 'INVOICE_NOT_READY', missing: blockers });
  return db.transaction(() => {
    const again = db.prepare('SELECT * FROM invoices WHERE order_id = ?').get(order.id);
    if (again) return { ...again, data: parseJSON(again.data, {}) };
    const issuedAt = now();
    const fy = financialYear(new Date(issuedAt));
    const seq = (db.prepare('SELECT COALESCE(MAX(seq), 0) AS n FROM invoices WHERE fy = ?').get(fy).n || 0) + 1;
    const no = `INV/${fy}/${String(seq).padStart(6, '0')}`;
    const data = build(order, no, issuedAt);
    db.prepare('INSERT INTO invoices(order_id, invoice_no, fy, seq, issued_at, data) VALUES(?,?,?,?,?,?)').run(order.id, no, fy, seq, issuedAt, JSON.stringify(data));
    db.prepare('INSERT INTO order_events(order_id, status, note, created_at) VALUES(?,?,?,?)').run(order.id, 'invoice_issued', `Tax invoice ${no}`, issuedAt);
    return { order_id: order.id, invoice_no: no, fy, seq, issued_at: issuedAt, data };
  })();
}

/** Printable HTML (the browser's "Save as PDF" makes the PDF). */
export function invoiceHtml(inv) {
  const d = inv.data;
  const date = (t) => new Date(t).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
  const intra = d.totals.igst === 0;
  const rows = d.lines.map((l, i) => `<tr><td>${i + 1}</td><td>${esc(l.description)}</td><td>${esc(l.hsn)}</td><td class="n">${l.qty}</td><td class="n">${inr(l.taxable)}</td><td class="n">${l.rate}%</td>${intra ? `<td class="n">${inr(l.cgst)}</td><td class="n">${inr(l.sgst)}</td>` : `<td class="n">${inr(l.igst)}</td>`}<td class="n">${inr(l.amount)}</td></tr>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Tax invoice ${esc(d.invoice_no)}</title>
<style>body{font:14px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#222;max-width:860px;margin:24px auto;padding:0 16px}h1{font-size:20px;margin:0 0 4px}.g{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:16px 0}.b{border:1px solid #ddd;border-radius:8px;padding:12px}table{width:100%;border-collapse:collapse;margin-top:12px}th,td{border-bottom:1px solid #e5e5e5;padding:6px 4px;text-align:left;vertical-align:top}.n{text-align:right;white-space:nowrap}tfoot td{font-weight:600}small{color:#666}@media print{button{display:none}}@media(max-width:600px){.g{grid-template-columns:1fr}table{font-size:12px}}</style></head><body>
<button onclick="print()" style="float:right">Print / Save as PDF</button>
<h1>Tax Invoice</h1><div>Invoice no. <b>${esc(d.invoice_no)}</b> · Date ${date(d.issued_at)} · Order ${esc(d.order_number)} (${date(d.order_date)})</div>
<div class="g"><div class="b"><small>Sold by</small><br><b>${esc(d.seller.name)}</b>${d.seller.trade_name && d.seller.trade_name !== d.seller.name ? ` (${esc(d.seller.trade_name)})` : ''}<br>${esc(d.seller.address)}<br>GSTIN: <b>${esc(d.seller.gstin)}</b> · State: ${esc(d.seller.state)}<br>${esc([d.seller.phone, d.seller.email].filter(Boolean).join(' · '))}</div>
<div class="b"><small>Bill to / Ship to</small><br><b>${esc(d.buyer.name)}</b><br>${esc(d.buyer.address)}<br>${esc(d.buyer.phone)}<br><small>Place of supply:</small> ${esc(d.place_of_supply)} · ${esc(d.supply_type)} · Reverse charge: ${esc(d.reverse_charge)}</div></div>
<table><thead><tr><th>#</th><th>Description</th><th>HSN/SAC</th><th class="n">Qty</th><th class="n">Taxable value</th><th class="n">GST</th>${intra ? '<th class="n">CGST</th><th class="n">SGST</th>' : '<th class="n">IGST</th>'}<th class="n">Amount</th></tr></thead><tbody>${rows}</tbody>
<tfoot><tr><td colspan="4">Total</td><td class="n">${inr(d.totals.taxable)}</td><td></td>${intra ? `<td class="n">${inr(d.totals.cgst)}</td><td class="n">${inr(d.totals.sgst)}</td>` : `<td class="n">${inr(d.totals.igst)}</td>`}<td class="n">${inr(d.totals.total)}</td></tr></tfoot></table>
<p>Amount includes GST of ${inr(d.totals.tax)}. Prices on the website are inclusive of all taxes; discounts are shown in the taxable value.</p>
<p><small>This is a computer-generated invoice and does not need a signature. Questions: ${esc(d.seller.email || '')}.</small></p></body></html>`;
}
