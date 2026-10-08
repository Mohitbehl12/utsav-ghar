/**
 * Builds the PDF of a legal document — a blank copy to read/print, or the accepted / signed record.
 * Pass the pdf-lib module in (`import * as PDFLib from 'pdf-lib'`) so this file has no package
 * imports and runs on the server and in the browser preview alike.
 * Layout: logo header on every page, title block, parties/details table, "In simple words",
 * each section with its "What this means" box and the detailed terms, the acceptance / signature
 * page, and "Page x of y" footers with the reference number.
 * Standard PDF fonts cover Latin text only, so ₹ is written as "Rs." and other symbols are simplified.
 */
import { parseLegalDoc } from './legal.js';

const MAP = { '₹': 'Rs.', '“': '"', '”': '"', '‘': "'", '’': "'", '–': '-', '—': '-', '…': '...', '•': '-', '×': 'x', '·': '-', '→': '->', '✓': 'Yes', ' ': ' ' };
export const pdfSafe = (s) => String(s ?? '').replace(/[^\x20-\x7E\n]/g, (c) => MAP[c] ?? (/[À-ÿ]/.test(c) ? c : '?'));

/**
 * @param PDFLib  the pdf-lib module
 * @param d {title, heading?, company, company_legal?, company_address?, ref_no, version, effective, parties:[[label, value]],
 *           body, statement?, checks:[label], signature:{typed_name, capacity, signed_at, ip, user_agent, otp_ref, verification, image_png|null},
 *           company_rep?:[[label,value]], audit:[[label, value]], hash, footer, unsigned?}
 * @returns Uint8Array
 */
export async function buildAgreementPdf(PDFLib, d) {
  const { PDFDocument, StandardFonts, rgb } = PDFLib;
  const pdf = await PDFDocument.create();
  pdf.setTitle(pdfSafe(`${d.title} - ${d.ref_no}`));
  pdf.setAuthor(pdfSafe(d.company || 'Utsav Ghar'));
  pdf.setSubject(pdfSafe(`${d.title} version ${d.version}`));
  pdf.setCreationDate(new Date(d.signature?.signed_at || Date.now()));
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const italic = await pdf.embedFont(StandardFonts.HelveticaOblique);
  const W = 595.28, H = 841.89, M = 54, maxW = W - 2 * M;
  const ink = rgb(0.12, 0.07, 0.1), muted = rgb(0.42, 0.35, 0.38), brand = rgb(0.42, 0.11, 0.23), gold = rgb(0.89, 0.66, 0.21);
  const tint = rgb(1, 0.965, 0.87), tintLine = rgb(0.94, 0.84, 0.54), okTint = rgb(0.93, 0.97, 0.94);
  let page; let y;
  const logo = (p, x, top, s = 1) => {
    // a small diya: bowl + flame, drawn as vectors (no image needed)
    p.drawSvgPath('M0 10 Q12 22 24 10 L20 8 Q12 14 4 8 Z', { x, y: top, scale: s, color: gold });
    p.drawSvgPath('M12 -6 Q6 2 12 8 Q18 2 12 -6 Z', { x, y: top, scale: s, color: rgb(0.95, 0.45, 0.1) });
  };
  const newPage = () => {
    page = pdf.addPage([W, H]); y = H - 78;
    page.drawRectangle({ x: 0, y: H - 46, width: W, height: 46, color: rgb(0.16, 0.06, 0.11) });
    logo(page, M, H - 14, 1);
    page.drawText(pdfSafe(d.company || 'Utsav Ghar'), { x: M + 32, y: H - 30, size: 13, font: bold, color: rgb(0.98, 0.92, 0.83) });
    const right = pdfSafe(d.heading || d.title);
    page.drawText(right, { x: W - M - bold.widthOfTextAtSize(right, 9), y: H - 29, size: 9, font: bold, color: gold });
  };
  const need = (h) => { if (y - h < 64) newPage(); };
  const wrap = (text, f, size, width) => {
    const out = [];
    for (const para of pdfSafe(text).split('\n')) {
      let line = '';
      for (const word of para.split(/\s+/).filter(Boolean)) {
        const t = line ? `${line} ${word}` : word;
        if (f.widthOfTextAtSize(t, size) > width && line) { out.push(line); line = word; } else line = t;
      }
      out.push(line);
    }
    return out;
  };
  const text = (t, { size = 10, f = font, color = ink, indent = 0, gap = 4, lh = 1.38 } = {}) => {
    for (const line of wrap(t, f, size, maxW - indent)) { need(size * lh); page.drawText(line, { x: M + indent, y: y - size, size, font: f, color }); y -= size * lh; }
    y -= gap;
  };
  const box = (label, t, { fill = tint, line = tintLine } = {}) => {
    const lines = wrap(t, font, 9.5, maxW - 24);
    const h = 18 + lines.length * 13 + 6;
    need(h + 6);
    page.drawRectangle({ x: M, y: y - h, width: maxW, height: h, color: fill, borderColor: line, borderWidth: 0.6 });
    page.drawText(pdfSafe(label), { x: M + 12, y: y - 14, size: 8.5, font: bold, color: brand });
    lines.forEach((l, i) => page.drawText(l, { x: M + 12, y: y - 28 - i * 13, size: 9.5, font, color: ink }));
    y -= h + 8;
  };
  const kv = (rows) => {
    for (const [k, v] of rows) {
      const lines = wrap(v || '-', font, 9.5, maxW - 160);
      need(lines.length * 13 + 4);
      page.drawText(pdfSafe(k), { x: M, y: y - 9.5, size: 9, font: bold, color: muted });
      lines.forEach((l, i) => page.drawText(l, { x: M + 160, y: y - 9.5 - i * 13, size: 9.5, font, color: ink }));
      y -= lines.length * 13 + 4;
    }
    y -= 6;
  };
  const rule = () => { need(10); page.drawLine({ start: { x: M, y: y - 4 }, end: { x: W - M, y: y - 4 }, thickness: 0.6, color: muted }); y -= 14; };
  const terms = (body) => {
    for (const raw of String(body || '').split('\n')) {
      const l = raw.replace(/\*\*(.+?)\*\*/g, '$1').replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '$1 ($2)').trimEnd();
      if (!l.trim()) { y -= 3; continue; }
      if (/^\s*\|.*\|\s*$/.test(l)) { if (/^\s*\|?\s*:?-{2,}/.test(l)) continue; text(l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim()).join('   |   '), { size: 9, indent: 6, gap: 2 }); continue; }
      if (/^#{3,4} /.test(l)) { text(l.replace(/^#+ /, ''), { size: 10, f: bold, gap: 2 }); continue; }
      if (/^> /.test(l)) text(l.slice(2), { size: 9, color: muted, gap: 4 });
      else if (/^\s*[-*] /.test(l)) text(`-  ${l.replace(/^\s*[-*] /, '')}`, { size: 9.5, indent: 10, gap: 2 });
      else if (/^\s*\d+\. /.test(l)) text(l.trim(), { size: 9.5, indent: 10, gap: 2 });
      else text(l, { size: 9.5, gap: 3 });
    }
  };

  newPage();
  text(d.heading || d.title, { size: 20, f: bold, color: brand, gap: 2 });
  text(`Version ${d.version}   |   Effective ${d.effective}   |   Reference ${d.ref_no}`, { size: 9, color: muted, gap: 10 });
  if (d.unsigned) box('COPY FOR READING', 'This is a copy of the current version for you to read, save or print. It becomes your agreement only when you accept it on the website or app.', { fill: rgb(0.96, 0.95, 0.99), line: rgb(0.8, 0.78, 0.9) });
  if (d.parties?.length) { kv(d.parties); rule(); }
  // one or more documents (a combined customer pack has several)
  const docs = Array.isArray(d.body) ? d.body : [{ title: d.title, body: d.body }];
  docs.forEach((doc, di) => {
    const p = parseLegalDoc(doc.body);
    if (di > 0 || docs.length > 1) { need(60); y -= 6; text(p.title || doc.title, { size: 15, f: bold, color: brand, gap: 4 }); }
    if (p.intro) text(p.intro, { size: 10.5, f: italic, color: ink, gap: 8 });
    for (const n of p.notes) text(n, { size: 8.5, color: muted, gap: 6 });
    if (p.summary.length) box('IN SIMPLE WORDS', p.summary.map((s) => `-  ${s}`).join('\n'), { fill: okTint, line: rgb(0.72, 0.87, 0.76) });
    for (const s of p.sections) {
      need(60); y -= 4;
      text(s.heading, { size: 11.5, f: bold, gap: 3 });
      if (s.simple) box('WHAT THIS MEANS', s.simple);
      terms(s.body);
    }
  });

  // acceptance / signature page
  newPage();
  const signed = !!(d.signature?.typed_name);
  text(d.signature?.image_png || d.signature?.capacity ? 'Execution and signature' : signed ? 'Record of acceptance' : 'Acceptance', { size: 15, f: bold, color: brand, gap: 8 });
  if (d.statement) text(d.statement, { size: 10, gap: 8 });
  if (d.checks?.length) { for (const c of d.checks) text(`[x]  ${c}`, { size: 9.5, gap: 2 }); y -= 8; }
  const s = d.signature || {};
  if (s.image_png) {
    try {
      const img = await pdf.embedPng(s.image_png);
      const w = Math.min(220, img.width), h = (img.height / img.width) * w;
      need(h + 24);
      page.drawRectangle({ x: M, y: y - h - 8, width: w + 16, height: h + 16, borderColor: muted, borderWidth: 0.6 });
      page.drawImage(img, { x: M + 8, y: y - h, width: w, height: h });
      y -= h + 24;
    } catch { /* unreadable image: the typed name and OTP still stand */ }
  }
  if (signed) {
    kv([
      ['Signed / accepted by', s.typed_name], ['Capacity', s.capacity], ['Date (IST)', s.signed_at ? new Date(s.signed_at).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'long', year: 'numeric' }) : ''],
      ['Time (IST)', s.signed_at ? new Date(s.signed_at).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' }) : ''],
      ['Verification', s.verification], ['OTP reference', s.otp_ref], ['IP address', s.ip], ['Device / browser', s.user_agent],
      ...(d.audit || []), ['Agreement reference', d.ref_no], ['Document fingerprint (SHA-256)', d.hash],
    ].filter(([, v]) => v));
  } else text('Not yet accepted. Acceptance is recorded with the date, time, version and a reference number when you tick the boxes and continue.', { size: 9.5, color: muted });
  if (d.company_rep?.length) { rule(); text(`For ${d.company_legal || d.company}`, { size: 10, f: bold, gap: 4 }); kv(d.company_rep); }
  text(d.footer || 'This document was accepted electronically under section 10A of the Information Technology Act, 2000. The fingerprint above identifies the exact text that was accepted.', { size: 8.5, color: muted });

  // footers: "Page x of y" + reference on every page
  const pages = pdf.getPages();
  pages.forEach((p, i) => {
    p.drawLine({ start: { x: M, y: 44 }, end: { x: W - M, y: 44 }, thickness: 0.5, color: muted });
    p.drawText(pdfSafe(`${d.company_legal || d.company} - ${d.title} v${d.version} - Ref ${d.ref_no}`).slice(0, 110), { x: M, y: 30, size: 7.5, font, color: muted });
    const pn = `Page ${i + 1} of ${pages.length}`;
    p.drawText(pn, { x: W - M - font.widthOfTextAtSize(pn, 7.5), y: 30, size: 7.5, font, color: muted });
  });
  return pdf.save();
}
