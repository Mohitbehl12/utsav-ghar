/**
 * Legal documents UI shared by the store, the dealer app and the admin.
 * Every document is shown in two layers: a "Simple explanation" (intro, "In simple words",
 * and a "What this means" line per section) and the "Full legal terms" folded underneath.
 * Also: View online / Download PDF / Print actions, consent boxes, the customer agreement
 * panel used at sign-up, "accept the updated terms", and My Account → Legal Documents.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { parseLegalDoc } from '@shared/legal.js';
import { api, fetchFile, saveBlob } from '../lib/api.js';
import '../styles/legal.css';

/** Inline **bold** and [links](https://…) only; everything else is plain text (no HTML from documents is ever injected). */
function inline(t, key) {
  const parts = String(t).split(/(\*\*[^*]+\*\*|\[[^\]]+\]\((?:https?:\/\/|\/)[^)\s]+\))/g);
  return parts.map((p, i) => {
    if (/^\*\*[^*]+\*\*$/.test(p)) return <strong key={`${key}-${i}`}>{p.slice(2, -2)}</strong>;
    const m = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(p);
    if (m) return <a key={`${key}-${i}`} href={m[2]} target={m[2].startsWith('/') ? undefined : '_blank'} rel="noopener noreferrer">{m[1]}</a>;
    return p;
  });
}
const cells = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
/** Plain markdown-ish renderer (headings, lists, tables, notices, definitions, links, paragraphs). */
export function LegalText({ body, className = '' }) {
  const out = []; let list = null; let ordered = false; let table = null; let k = 0;
  const flushList = () => { if (list) { const L = ordered ? 'ol' : 'ul'; out.push(<L key={`l${k++}`}>{list}</L>); list = null; } };
  const flushTable = () => {
    if (!table) return;
    const [head, ...rows] = table;
    out.push(<div key={`t${k++}`} className="lg-tablewrap"><table className="lg-doctable"><thead><tr>{head.map((c, i) => <th key={i}>{inline(c, `h${i}`)}</th>)}</tr></thead><tbody>{rows.map((r, ri) => <tr key={ri}>{r.map((c, i) => <td key={i}>{inline(c, `c${ri}${i}`)}</td>)}</tr>)}</tbody></table></div>);
    table = null;
  };
  const flush = () => { flushList(); flushTable(); };
  for (const raw of String(body || '').split('\n')) {
    const l = raw.trimEnd();
    let m;
    if (!l.trim()) { flush(); continue; }
    if (/^\s*\|.*\|\s*$/.test(l)) { flushList(); if (/^\s*\|?\s*:?-{2,}/.test(l)) continue; (table ||= []).push(cells(l)); continue; }
    flushTable();
    if ((m = /^(#{1,4}) (.*)$/.exec(l))) { flush(); const H = `h${Math.min(5, m[1].length + 1)}`; out.push(<H key={k++}>{inline(m[2], k)}</H>); continue; }
    if ((m = /^> \*\*(Important|Note|Warning|Notice)[:.]?\*\*:?\s*(.*)$/i.exec(l))) { flush(); out.push(<p key={k++} className={`lg-notice lg-notice--${m[1].toLowerCase()}`}><strong>{m[1]}:</strong> {inline(m[2], k)}</p>); continue; }
    if ((m = /^> (.*)$/.exec(l))) { flush(); out.push(<p key={k++} className="lg-note">{inline(m[1], k)}</p>); continue; }
    if ((m = /^\s*[-*] \*\*([^*]+)\*\*\s+[—–-]\s+(.*)$/.exec(l))) { if (!list || ordered) { flushList(); list = []; ordered = false; } list.push(<li key={k++} className="lg-def"><dfn>{m[1]}</dfn> — {inline(m[2], k)}</li>); continue; }
    if ((m = /^\s*[-*] (.*)$/.exec(l))) { if (!list || ordered) { flushList(); list = []; ordered = false; } list.push(<li key={k++}>{inline(m[1], k)}</li>); continue; }
    if ((m = /^\s*\d+\. (.*)$/.exec(l))) { if (!list || !ordered) { flushList(); list = []; ordered = true; } list.push(<li key={k++}>{inline(m[1], k)}</li>); continue; }
    flush(); out.push(<p key={k++}>{inline(l, k)}</p>);
  }
  flush();
  return <div className={`lg-text ${className}`}>{out}</div>;
}

/**
 * One document in two layers. `mode`: 'simple' (sections folded, simple lines visible) or 'full' (everything open).
 * `toggle` shows the Simple / Full switch.
 */
export function LegalDocView({ body, mode: initial = 'simple', toggle = true, compact = false }) {
  const doc = parseLegalDoc(body);
  const [mode, setMode] = useState(initial);
  const [open, setOpen] = useState({});
  if (!doc.sections.length && !doc.summary.length) return <LegalText body={body} />;
  const isOpen = (i) => (mode === 'full' ? open[i] !== false : !!open[i]);
  return (
    <div className={`lg-doc ${compact ? 'lg-doc--compact' : ''}`}>
      {doc.title && <h2 className="lg-doc__title">{doc.title}</h2>}
      {doc.intro && <p className="lg-doc__intro">{doc.intro}</p>}
      {doc.notes.map((n) => <p key={n} className="lg-note">{n}</p>)}
      {toggle && (
        <div className="lg-mode" role="group" aria-label="How to read">
          <button type="button" className={mode === 'simple' ? 'is-on' : ''} aria-pressed={mode === 'simple'} onClick={() => { setMode('simple'); setOpen({}); }}>Simple explanation</button>
          <button type="button" className={mode === 'full' ? 'is-on' : ''} aria-pressed={mode === 'full'} onClick={() => { setMode('full'); setOpen({}); }}>Full legal terms</button>
        </div>
      )}
      {doc.summary.length > 0 && (
        <section className="lg-summary">
          <h3>In simple words</h3>
          <ul>{doc.summary.map((s, i) => <li key={i}>{inline(s, `s${i}`)}</li>)}</ul>
          {mode === 'simple' && <p className="lg-summary__more">Open any section below to read the full legal terms.</p>}
        </section>
      )}
      <ol className="lg-sections">
        {doc.sections.map((s, i) => (
          <li key={i} className={`lg-sec ${isOpen(i) ? 'is-open' : ''}`}>
            <h3 className="lg-sec__h">{s.heading}</h3>
            {s.simple && <p className="lg-sec__simple"><b>What this means:</b> {inline(s.simple, `m${i}`)}</p>}
            {s.body && (
              <>
                <button type="button" className="lg-sec__toggle" aria-expanded={isOpen(i)} onClick={() => setOpen({ ...open, [i]: !isOpen(i) })}>{isOpen(i) ? '▾ Hide full legal terms' : '▸ Read full legal terms'}</button>
                {isOpen(i) && <div className="lg-sec__full"><LegalText body={s.body} /></div>}
              </>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

// ---------------------------------------------------------------- printing & PDF helpers
const esc = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
function bodyToHtml(body) {
  const d = parseLegalDoc(body);
  const lines = (txt) => String(txt).split('\n').map((l) => l.trim()).filter(Boolean)
    .map((l) => (/^[-*] /.test(l) ? `<li>${esc(l.slice(2))}</li>` : /^\d+\. /.test(l) ? `<li>${esc(l.replace(/^\d+\. /, ''))}</li>` : `<p>${esc(l.replace(/^> /, ''))}</p>`)).join('')
    .replace(/(<li>.*?<\/li>)+/g, (m) => `<ul>${m}</ul>`);
  if (!d.sections.length) return lines(body);
  return `<h1>${esc(d.title)}</h1>${d.intro ? `<p class="intro">${esc(d.intro)}</p>` : ''}${d.summary.length ? `<div class="sum"><b>In simple words</b><ul>${d.summary.map((s) => `<li>${esc(s)}</li>`).join('')}</ul></div>` : ''}${
    d.sections.map((s) => `<h2>${esc(s.heading)}</h2>${s.simple ? `<div class="wtm"><b>What this means:</b> ${esc(s.simple)}</div>` : ''}${lines(s.body)}`).join('')}`;
}
// built at runtime so no literal style tag sits inside the bundle's script text
const PRINT_CSS = ['<', 'style>', 'body{font:13px/1.55 Arial,sans-serif;max-width:740px;margin:28px auto;padding:0 18px;color:#1E1219}h1{color:#6B1B3A;font-size:22px}h2{font-size:15px;margin:18px 0 6px}.intro{font-style:italic}.sum{background:#EEF7F0;border:1px solid #B7DEC3;padding:8px 14px;border-radius:8px}.wtm{background:#FFF6DE;border:1px solid #F0D58A;padding:6px 12px;border-radius:8px;margin:4px 0 8px}.hd{display:flex;justify-content:space-between;border-bottom:2px solid #6B1B3A;padding-bottom:6px;margin-bottom:12px;font-weight:700;color:#6B1B3A}.meta{color:#666;font-size:12px}', '</', 'style>'].join('');
export function printDocs(docs, company = 'Utsav Ghar') {
  const list = Array.isArray(docs) ? docs : [docs];
  const w = window.open('', '_blank');
  const html = list.map((d) => `<div class="hd"><span>🪔 ${esc(company)}</span><span>${esc(d.title)}</span></div><p class="meta">Version ${esc(d.version)}${d.effective_at ? ` · effective ${esc(fmtDate(d.effective_at))}` : ''}</p>${bodyToHtml(d.body)}`).join('<div style="page-break-after:always"></div>');
  if (!w) { window.print(); return; }
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(list.map((d) => d.title).join(' + '))}</title>${PRINT_CSS}</head><body>${html}</body></html>`);
  w.document.close(); w.focus(); setTimeout(() => w.print(), 300);
}
export async function downloadPdf(path, name) {
  try { saveBlob(await fetchFile(path), name); return true; } catch { return false; }
}

const fmtDate = (s) => (s ? new Date(s).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const fmtTime = (s) => (s ? new Date(s).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');
export { fmtDate, fmtTime };

/** View online · Download PDF · Print — one row of buttons for a document. */
export function DocActions({ doc, pdfPath, pdfName, onView, className = '' }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className={`lg-docactions ${className}`}>
      <button type="button" onClick={onView}>👁️ View online</button>
      {pdfPath && <button type="button" disabled={busy} onClick={async () => { setBusy(true); await downloadPdf(pdfPath, pdfName); setBusy(false); }}>{busy ? '…' : '⬇️ Download PDF'}</button>}
      <button type="button" onClick={() => printDocs(doc)}>🖨️ Print</button>
    </div>
  );
}

/** Full-screen reader for one or more documents (simple explanation + full terms), with Print and Download PDF. */
export function DocViewer({ docs, onClose, pdfPath, pdfName, footer, mode = 'simple' }) {
  const ref = useRef(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const prev = document.activeElement; ref.current?.focus();
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey); document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; prev?.focus?.(); };
  }, [onClose]);
  const list = Array.isArray(docs) ? docs : [docs];
  const title = list.map((d) => d.title).join(' + ');
  const download = async () => { setBusy(true); await downloadPdf(pdfPath, pdfName || 'agreement.pdf'); setBusy(false); };
  return createPortal(
    <div className="lg-viewer" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}>
      <header className="lg-viewer__bar">
        <b>{title}</b>
        <div className="lg-viewer__actions">
          <button type="button" onClick={() => printDocs(list)}>🖨️ Print</button>
          {pdfPath && <button type="button" onClick={download} disabled={busy}>{busy ? '…' : '⬇️ PDF'}</button>}
          <button type="button" onClick={onClose} aria-label="Close">✕</button>
        </div>
      </header>
      <div className="lg-viewer__body">
        {list.map((d) => (
          <article key={`${d.kind}-${d.version}`} className="lg-viewer__doc">
            <p className="lg-meta">Version {d.version}{d.effective_at ? ` · effective ${fmtDate(d.effective_at)}` : ''}</p>
            <LegalDocView body={d.body} mode={mode} />
          </article>
        ))}
        {footer}
      </div>
    </div>,
    document.body,
  );
}

/** The mandatory consent boxes; each label links to the documents it covers. */
export function ConsentBoxes({ consents, docs, value, onChange, errors = {}, only, legend = 'Please read and accept' }) {
  const [open, setOpen] = useState(null);
  const byKind = Object.fromEntries((docs || []).map((d) => [d.kind, d]));
  const shown = only ? consents.filter((c) => c.kinds.some((k) => only.includes(k))) : consents;
  return (
    <fieldset className="lg-consents">
      <legend>{legend} <span aria-hidden="true">*</span></legend>
      {shown.map((c) => {
        const ds = c.kinds.map((k) => byKind[k]).filter(Boolean);
        const err = errors[`consents.${c.key}`];
        return (
          <div key={c.key} className={`lg-consent ${err ? 'is-err' : ''}`}>
            <label>
              <input type="checkbox" checked={!!value[c.key]} onChange={(e) => onChange({ ...value, [c.key]: e.target.checked })} aria-invalid={!!err} required />
              <span>{c.label}</span>
            </label>
            {ds.length > 0 && <button type="button" className="lg-read" onClick={() => setOpen(ds)}>Read {ds.map((d) => d.title).join(' & ')} (v{ds.map((d) => d.version).join(', v')})</button>}
            {err && <small className="lg-err" role="alert">{err}</small>}
          </div>
        );
      })}
      {open && <DocViewer docs={open} onClose={() => setOpen(null)} />}
    </fieldset>
  );
}

export function useCustomerLegal() {
  const [d, setD] = useState(null);
  useEffect(() => { api.get('/legal/customer').then(setD).catch(() => setD({ docs: [], consents: [] })); }, []);
  return d;
}

/**
 * Sign-up: "Customer Terms & Agreement" — intro, simple sections with full terms underneath,
 * the other policies, "Before you create your account" boxes and Download PDF.
 */
export function CustomerAgreementPanel({ legal, value, onChange, errors }) {
  const [open, setOpen] = useState(null);
  const main = legal.docs.find((d) => d.kind === 'customer_terms');
  const others = legal.docs.filter((d) => d.kind !== 'customer_terms');
  return (
    <section className="lg-cust">
      <div className="lg-cust__head">
        <h2>Customer Terms &amp; Agreement</h2>
        {main && <span className="lg-ver">Version {main.version} · effective {fmtDate(main.effective_at)}</span>}
      </div>
      {main && <div className="lg-cust__scroll" tabIndex={0} aria-label="Customer agreement"><LegalDocView body={main.body} /></div>}
      <div className="lg-cust__others">
        {others.map((d) => <button key={d.kind} type="button" className="lg-chipbtn" onClick={() => setOpen([d])}>📄 {d.title} (v{d.version})</button>)}
        {main && <button type="button" className="lg-chipbtn" onClick={() => setOpen([main])}>⤢ Open full agreement</button>}
      </div>
      <h3 className="lg-cust__before">Before you create your account</h3>
      <ConsentBoxes consents={legal.consents} docs={legal.docs} value={value} onChange={onChange} errors={errors} legend="Please confirm" />
      <button type="button" className="lg-pdfbtn" onClick={() => downloadPdf('/legal/customer/pdf', 'utsav-ghar-customer-agreement.pdf')}>⬇️ Download Customer Agreement PDF</button>
      {open && <DocViewer docs={open} onClose={() => setOpen(null)} pdfPath={open[0].kind === 'customer_terms' ? '/legal/customer/pdf' : `/legal/doc/${open[0].kind}/pdf`} pdfName={`utsav-ghar-${open[0].kind}.pdf`} />}
    </section>
  );
}

/** "We've updated our terms" — shown when the customer must accept a new version before ordering. */
export function TermsUpdate({ onDone, compact }) {
  const [d, setD] = useState(null);
  const [v, setV] = useState({});
  const [state, setState] = useState({});
  const load = useCallback(() => api.get('/account/legal').then(setD).catch(() => setD({ pending: [], consents: [] })), []);
  useEffect(() => { load(); }, [load]);
  if (!d || !d.pending.length) return null;
  const kinds = d.pending.map((p) => p.kind);
  const need = d.consents.filter((c) => c.kinds.some((k) => kinds.includes(k)));
  const accept = async (e) => {
    e.preventDefault(); setState({ busy: true });
    try { await api.post('/account/legal/accept', { consents: v }); setState({}); await load(); onDone?.(); } catch (er) { setState({ err: er.message, fields: er.fields }); }
  };
  return (
    <form className={`lg-update ${compact ? 'lg-update--compact' : ''}`} onSubmit={accept}>
      <h3>We have updated our terms</h3>
      <p>Please review and accept the new version{d.pending.length > 1 ? 's' : ''} to continue: {d.pending.map((p) => `${p.title} v${p.version}`).join(', ')}.{d.pending.some((p) => p.change_note) ? ` What changed: ${d.pending.map((p) => p.change_note).filter(Boolean).join('; ')}.` : ''}</p>
      <ConsentBoxes consents={d.consents} docs={d.pending} value={v} onChange={setV} errors={state.fields} only={kinds} />
      {state.err && !Object.keys(state.fields || {}).length && <p className="lg-err" role="alert">{state.err}</p>}
      <button className="btn btn--primary" disabled={state.busy || !need.every((c) => v[c.key])}>{state.busy ? 'Saving…' : 'Accept and continue'}</button>
    </form>
  );
}

/** My Account → Legal Documents: current documents (view / PDF / print) + every agreement accepted. */
export function MyLegalDocuments() {
  const [d, setD] = useState(null);
  const [docs, setDocs] = useState(null);
  const [view, setView] = useState(null);
  const load = useCallback(() => api.get('/account/legal').then(setD).catch(() => setD({ items: [], pending: [] })), []);
  useEffect(() => { load(); api.get('/legal/customer').then((x) => setDocs(x.docs)).catch(() => setDocs([])); }, [load]);
  const open = async (a) => { const full = await api.get(`/account/legal/${a.id}`); setView({ ...full, title: a.title }); };
  if (!d || !docs) return <div className="card"><span className="spinner" role="status" /></div>;
  const pdfFor = (k) => (k === 'customer_terms' ? '/legal/customer/pdf' : `/legal/doc/${k}/pdf`);
  return (
    <div className="card">
      <h2>Legal &amp; Agreements</h2>
      <p className="muted small">Read our current terms in simple words, and download every agreement you accepted.</p>
      {d.pending.length > 0 && <TermsUpdate onDone={load} compact />}
      <ul className="lg-doclist">
        {docs.map((x) => (
          <li key={x.kind}>
            <div><b>{x.title}</b><span className="lg-ver">v{x.version} · effective {fmtDate(x.effective_at)}</span></div>
            <DocActions doc={x} pdfPath={pdfFor(x.kind)} pdfName={`utsav-ghar-${x.kind}-v${x.version}.pdf`} onView={() => setView({ ...x, current: true })} />
          </li>
        ))}
      </ul>
      <h3 className="lg-sub">Agreements you accepted</h3>
      {d.items.length === 0 ? <p className="muted">No accepted documents on record.</p> : (
        <div className="lg-table-wrap">
          <table className="lg-table">
            <thead><tr><th>Agreement</th><th>Version</th><th>Accepted on</th><th>Agreement number</th><th /></tr></thead>
            <tbody>
              {d.items.map((a) => (
                <tr key={a.id}>
                  <td>{a.title}</td><td>v{a.version}</td><td>{fmtTime(a.accepted_at)}</td><td><code>{a.ref_no}</code></td>
                  <td className="lg-actions"><button type="button" className="btn btn--ghost btn--sm" onClick={() => open(a)}>View</button>
                    <button type="button" className="btn btn--ghost btn--sm" onClick={() => downloadPdf(`/account/legal/${a.id}/pdf`, `${a.ref_no}.pdf`)}>PDF</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {view && (view.current
        ? <DocViewer docs={[view]} onClose={() => setView(null)} pdfPath={pdfFor(view.kind)} pdfName={`utsav-ghar-${view.kind}.pdf`} />
        : <DocViewer docs={[{ ...view, kind: view.kind }]} onClose={() => setView(null)} pdfPath={`/account/legal/${view.id}/pdf`} pdfName={`${view.ref_no}.pdf`}
          footer={<p className="lg-meta">Accepted {fmtTime(view.accepted_at)} · agreement number {view.ref_no} · {view.verification || ''} · fingerprint {view.hash.slice(0, 16)}…</p>} />)}
    </div>
  );
}
