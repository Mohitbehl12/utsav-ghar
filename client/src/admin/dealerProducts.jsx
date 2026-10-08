/**
 * Admin → Dealer products: review queue, pricing calculator and publishing.
 * Dealer price (cost) → + expenses + profit (+ platform fee, GST, rounding) → customer price.
 * Everything on this page is internal; dealers only ever see their own price and the status.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { calcSellingPrice } from '@shared/dealerPricing.js';
import { api } from '../lib/api.js';
import { rupees, fmtDateTime } from '../lib/format.js';
import { Field, Pill, Spinner, Empty, Modal } from '../components/ui.jsx';
import { useToast, useStore } from '../state/store.jsx';
import { PageHead } from './pages.jsx';

const TONE = { pending: 'warn', changes_requested: 'bad', approved: 'ok', rejected: 'muted' };
const TABS = [['pending', '⏳ To review'], ['changes_requested', '✏️ Waiting for dealer'], ['approved', '✅ Approved'], ['rejected', '✖️ Rejected'], ['', 'All']];
const toRs = (p) => (p == null ? '' : Math.round(p) / 100);
const ROUND = [['rupee', 'Exact (₹ 1)'], ['nine', 'End in 9 (₹…9)'], ['ninety_nine', '₹…49 / ₹…99']];

/** Admin defaults are stored in paise; the form works in rupees. */
const formFromDefaults = (d) => ({
  shipping: toRs(d.shipping), packaging: toRs(d.packaging), other: toRs(d.other), platform_pct: d.platform_pct, gst_pct: d.gst_pct,
  profit_mode: d.profit_mode, profit_value: d.profit_mode === 'amount' ? toRs(d.profit_value) : d.profit_value, rounding: d.rounding,
});
const toCalc = (cost, f) => calcSellingPrice({
  cost, shipping: Math.round(f.shipping * 100), packaging: Math.round(f.packaging * 100), other: Math.round(f.other * 100), platform_pct: f.platform_pct, gst_pct: f.gst_pct,
  profit_mode: f.profit_mode, profit_value: f.profit_mode === 'amount' ? Math.round(f.profit_value * 100) : f.profit_value, rounding: f.rounding,
});

function Defaults({ open, onClose, data, onSaved }) {
  const [f, setF] = useState(() => ({ ...formFromDefaults(data.defaults), review_email: data.review_email || '' }));
  const [err, setErr] = useState({});
  const toast = useToast();
  if (!open) return null;
  const n = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async (e) => {
    e.preventDefault();
    try { onSaved(await api.put('/admin/dealer-products-defaults', f)); toast('Saved'); onClose(); } catch (x) { setErr(x.fields || {}); toast(x.message, 'warn'); }
  };
  return (
    <Modal open onClose={onClose} title="Default costs & review email" wide>
      <form onSubmit={save} className="dp-defaults">
        <Field label="Send new dealer products for review to" id="dp-email" error={err.review_email} hint="Your team's email. Falls back to the store support email."><input id="dp-email" type="email" value={f.review_email} onChange={n('review_email')} /></Field>
        <p className="small muted">These pre-fill the calculator for every new dealer product. You can change them per product.</p>
        <div className="grid-3">
          <Field label="Shipping / delivery (₹ per piece)" id="dp-s"><input id="dp-s" type="number" min={0} step="0.01" value={f.shipping} onChange={n('shipping')} /></Field>
          <Field label="Packaging (₹)" id="dp-p"><input id="dp-p" type="number" min={0} step="0.01" value={f.packaging} onChange={n('packaging')} /></Field>
          <Field label="Other expenses (₹)" id="dp-o" hint="Marketing, returns, staff…"><input id="dp-o" type="number" min={0} step="0.01" value={f.other} onChange={n('other')} /></Field>
          <Field label="Platform / payment fee (%)" id="dp-f" hint="e.g. 2 for Razorpay"><input id="dp-f" type="number" min={0} max={50} step="0.1" value={f.platform_pct} onChange={n('platform_pct')} /></Field>
          <Field label="GST included in price (%)" id="dp-g" hint="0 if not registered"><input id="dp-g" type="number" min={0} max={40} step="0.1" value={f.gst_pct} onChange={n('gst_pct')} /></Field>
          <Field label="Rounding" id="dp-r"><select id="dp-r" value={f.rounding} onChange={n('rounding')}>{ROUND.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
          <Field label="Profit" id="dp-pm"><select id="dp-pm" value={f.profit_mode} onChange={n('profit_mode')}><option value="amount">Fixed ₹ per piece</option><option value="percent">% of dealer price</option></select></Field>
          <Field label={f.profit_mode === 'amount' ? 'Profit (₹)' : 'Profit (%)'} id="dp-pv"><input id="dp-pv" type="number" min={0} step="0.01" value={f.profit_value} onChange={n('profit_value')} /></Field>
        </div>
        <div className="row gap-s"><button type="button" className="btn btn--ghost" onClick={onClose}>Cancel</button><button className="btn btn--primary">Save defaults</button></div>
      </form>
    </Modal>
  );
}

function Queue() {
  const [tab, setTab] = useState('pending');
  const [d, setD] = useState(null);
  const [defs, setDefs] = useState(false);
  const load = () => api.get(`/admin/dealer-products${tab ? `?status=${tab}` : ''}`).then(setD);
  useEffect(() => { setD(null); load(); }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <PageHead title="🧾 Dealer products" sub="Products added by dealers. Set the customer price and publish — dealers only ever see their own price.">
        <button className="btn btn--sm" onClick={() => setDefs(true)} disabled={!d}>⚙️ Default costs</button>
      </PageHead>
      <div className="tabs" role="tablist">{TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'is-on' : ''} onClick={() => setTab(k)}>{l}{d?.counts?.[k] ? ` (${d.counts[k]})` : ''}</button>)}</div>
      {!d ? <Spinner /> : !d.items.length ? <Empty icon="🧾" title="Nothing here">{tab === 'pending' ? 'New products from dealers will appear here, and your team gets an email.' : ''}</Empty> : (
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Table">
          <table className="table">
            <thead><tr><th /><th>Product</th><th>Dealer</th><th className="num">Dealer price</th><th className="num">Qty</th><th className="num">Customer price</th><th>Status</th><th>Sent</th></tr></thead>
            <tbody>{d.items.map((x) => (
              <tr key={x.id}>
                <td>{x.thumb ? <img className="dp-thumb" src={x.thumb} alt="" loading="lazy" /> : <span className="dp-thumb" aria-hidden="true">📦</span>}</td>
                <td><Link className="link" to={`/admin/dealer-products/${x.id}`}>{x.name}</Link><div className="small muted">{x.category}{x.revision > 1 ? ` · update #${x.revision}` : ''}</div></td>
                <td className="small">{x.dealer?.business_name}<div className="muted">{x.dealer?.city}</div></td>
                <td className="num">{rupees(x.dealer_price)}{x.price_changed && <div><Pill tone="warn">was {rupees(x.approved_dealer_price)}</Pill></div>}</td>
                <td className="num">{x.quantity}</td>
                <td className="num">{x.live ? <>{rupees(x.live.price)}<div className="small muted">{x.live.is_active ? 'live' : 'hidden'}</div></> : '—'}</td>
                <td><Pill tone={TONE[x.status]}>{x.status_label}</Pill></td>
                <td className="small">{fmtDateTime(x.submitted_at)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {d && <Defaults open={defs} onClose={() => setDefs(false)} data={d} onSaved={(r) => setD({ ...d, defaults: r.defaults, review_email: r.review_email })} />}
    </>
  );
}

function Breakdown({ c }) {
  const rows = [
    ['Dealer price (cost)', c.cost], ['Shipping / delivery', c.shipping], ['Packaging', c.packaging], ['Other expenses', c.other], ['Your profit', c.profit],
    ...(c.platform_fee ? [['Platform / payment fee', c.platform_fee]] : []), ...(c.gst ? [['GST', c.gst]] : []), ...(c.rounding_extra ? [['Rounding', c.rounding_extra]] : []),
  ];
  return (
    <table className="dp-break">
      <tbody>
        {rows.map(([l, v]) => <tr key={l}><th scope="row">{l}</th><td className="num">{rupees(v)}</td></tr>)}
        <tr className="dp-break__total"><th scope="row">Customer price</th><td className="num">{rupees(c.selling)}</td></tr>
      </tbody>
    </table>
  );
}

function Review() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const { categories } = useStore();
  const [d, setD] = useState(null);
  const [f, setF] = useState(null);
  const [p, setP] = useState(null);
  const [price, setPrice] = useState('');
  const [touched, setTouched] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [fe, setFe] = useState({});
  const [zoom, setZoom] = useState(null);
  useEffect(() => {
    api.get(`/admin/dealer-products/${id}`).then((x) => {
      setD(x);
      const src = x.status === 'approved' && x.live_full && x.revision === 1 ? x.live_full : x;
      setF({ name: src.name, category_id: src.category_id, short_description: src.short_description || '', description: src.description || '', specs: { ...(src.specs || {}) },
        mrp: x.live ? toRs(x.live.mrp) : '', is_active: x.live ? x.live.is_active : true, is_new: true, is_diwali: false, internal_note: x.internal_note || '', note_to_dealer: '', allow_below_cost: false });
      setP(x.pricing?.inputs ? formFromDefaults(x.pricing.inputs) : formFromDefaults(x.defaults));
      setTouched(false);
    }).catch((e) => toast(e.message, 'warn'));
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  const calc = useMemo(() => (d && p ? toCalc(d.dealer_price, p) : null), [d, p]);
  useEffect(() => { if (calc && !touched) setPrice(toRs(calc.selling)); }, [calc, touched]);
  if (!d || !f || !p) return <Spinner />;
  const finalPaise = Math.round(Number(price || 0) * 100);
  const sellingExTax = finalPaise / (1 + (Number(p.gst_pct) || 0) / 100);
  const actualProfit = Math.round(sellingExTax * (1 - (Number(p.platform_pct) || 0) / 100) - calc.cost - calc.expenses);
  const below = finalPaise < d.dealer_price;
  const setPf = (k) => (e) => setP({ ...p, [k]: e.target.value });
  const setFf = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const publish = async () => {
    setBusy(true); setFe({});
    try {
      const r = await api.post(`/admin/dealer-products/${id}/publish`, { ...f, category_id: Number(f.category_id), mrp: f.mrp === '' ? undefined : Number(f.mrp), price: Number(price), pricing: p });
      setD(r); toast(f.is_active ? 'Published — customers can buy it now' : 'Approved (hidden from customers)');
    } catch (x) { setFe(x.fields || {}); toast(x.message, 'warn'); } finally { setBusy(false); }
  };
  const decide = async (kind) => {
    setBusy(true);
    try { setD(await api.post(`/admin/dealer-products/${id}/${kind}`, { note })); toast(kind === 'reject' ? 'Rejected — dealer informed' : 'Sent back to the dealer'); setNote(''); }
    catch (x) { toast(x.message, 'warn'); } finally { setBusy(false); }
  };
  const lf = d.live_full;
  const changed = (k) => lf && JSON.stringify(lf[k] ?? '') !== JSON.stringify(d[k] ?? '');
  return (
    <>
      <PageHead title={d.name} sub={`From ${d.dealer?.business_name} (${d.dealer?.city || ''} · ${d.dealer?.phone}) · sent ${fmtDateTime(d.submitted_at)}${d.revision > 1 ? ` · update #${d.revision}` : ''}`}>
        <Link className="btn btn--sm btn--ghost" to="/admin/dealer-products">← All dealer products</Link>
      </PageHead>
      <div className="row gap-s wrap dp-status">
        <Pill tone={TONE[d.status]}>{d.status_label}</Pill>
        {d.live && <a className="link small" href={d.live.url} target="_blank" rel="noreferrer">On store at {rupees(d.live.price)} ({d.live.is_active ? 'live' : 'hidden'}) ↗</a>}
        {d.price_changed && <Pill tone="warn">Dealer changed price {rupees(d.approved_dealer_price)} → {rupees(d.dealer_price)}</Pill>}
        <span className="small muted">Dealer can see: status, their price, notes to dealer. Never the customer price, profit or expenses.</span>
      </div>
      <div className="dp-grid">
        <section className="card dp-card">
          <h3>📷 Dealer's photos ({d.images.length})</h3>
          <div className="dp-photos">{d.images.map((i) => <button key={i.name} type="button" onClick={() => setZoom(i.url)}><img src={i.url} alt={`${d.name} photo`} /></button>)}</div>
          <h3>🏷️ Listing (you can edit before publishing)</h3>
          <Field label={`Name${changed('name') ? ' · changed by dealer' : ''}`} id="dp-name"><input id="dp-name" value={f.name} onChange={setFf('name')} /></Field>
          <Field label="Category" id="dp-cat"><select id="dp-cat" value={f.category_id} onChange={setFf('category_id')}>{(categories || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
          <Field label="Short description" id="dp-sd"><input id="dp-sd" maxLength={200} value={f.short_description} onChange={setFf('short_description')} /></Field>
          <Field label={`Description${changed('description') ? ' · changed by dealer' : ''}`} id="dp-d"><textarea id="dp-d" rows={5} value={f.description} onChange={setFf('description')} /></Field>
          <div className="grid-2">{Object.entries({ ...d.specs, ...f.specs }).map(([k]) => <Field key={k} label={k} id={`dp-s-${k}`}><input id={`dp-s-${k}`} value={f.specs[k] || ''} onChange={(e) => setF({ ...f, specs: { ...f.specs, [k]: e.target.value } })} /></Field>)}</div>
          <p className="small muted">Dealer SKU: {d.dealer_sku || '—'} · HSN: {d.hsn || '—'} · Quantity available: <b>{d.quantity}</b></p>
          {d.status === 'approved' && lf && d.revision > 1 && <p className="notice notice--warn small">The listing above shows what is live now. The dealer's latest text is: “{d.description?.slice(0, 160)}…” — copy anything you want to keep.</p>}
        </section>

        <section className="card dp-card dp-price">
          <h3>🧮 Price calculator <span className="small muted">(internal)</span></h3>
          <div className="dp-cost"><span>Dealer price</span><b>{rupees(d.dealer_price)}</b></div>
          <div className="grid-2">
            <Field label="Shipping / delivery (₹)" id="pc-s"><input id="pc-s" type="number" min={0} step="0.01" value={p.shipping} onChange={setPf('shipping')} /></Field>
            <Field label="Packaging (₹)" id="pc-p"><input id="pc-p" type="number" min={0} step="0.01" value={p.packaging} onChange={setPf('packaging')} /></Field>
            <Field label="Other expenses (₹)" id="pc-o"><input id="pc-o" type="number" min={0} step="0.01" value={p.other} onChange={setPf('other')} /></Field>
            <Field label="Platform / payment fee (%)" id="pc-f"><input id="pc-f" type="number" min={0} max={50} step="0.1" value={p.platform_pct} onChange={setPf('platform_pct')} /></Field>
            <Field label="GST in price (%)" id="pc-g"><input id="pc-g" type="number" min={0} max={40} step="0.1" value={p.gst_pct} onChange={setPf('gst_pct')} /></Field>
            <Field label="Rounding" id="pc-r"><select id="pc-r" value={p.rounding} onChange={setPf('rounding')}>{ROUND.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
            <Field label="Profit" id="pc-pm"><select id="pc-pm" value={p.profit_mode} onChange={setPf('profit_mode')}><option value="amount">Fixed ₹</option><option value="percent">% of dealer price</option></select></Field>
            <Field label={p.profit_mode === 'amount' ? 'Profit (₹)' : 'Profit (%)'} id="pc-pv"><input id="pc-pv" type="number" min={0} step="0.01" value={p.profit_value} onChange={setPf('profit_value')} /></Field>
          </div>
          <Breakdown c={calc} />
          <div className="grid-2 dp-final">
            <Field label="Customer price (₹)" id="pc-final" error={fe.price} hint={touched ? <button type="button" className="link-btn link" onClick={() => setTouched(false)}>Use calculator ({rupees(calc.selling)})</button> : 'From the calculator — you can change it'}>
              <input id="pc-final" type="number" min={1} step="1" value={price} onChange={(e) => { setTouched(true); setPrice(e.target.value); }} />
            </Field>
            <Field label="MRP (₹, optional strike-through)" id="pc-mrp"><input id="pc-mrp" type="number" min={0} step="1" value={f.mrp} onChange={setFf('mrp')} /></Field>
          </div>
          <div className={`dp-result ${actualProfit < 0 ? 'is-bad' : ''}`}>
            <div><span>Profit per piece</span><b>{rupees(actualProfit)}</b></div>
            <div><span>Margin</span><b>{sellingExTax ? `${Math.round((1000 * actualProfit) / sellingExTax) / 10}%` : '—'}</b></div>
            <div><span>Markup on dealer price</span><b>{d.dealer_price ? `${Math.round((1000 * actualProfit) / d.dealer_price) / 10}%` : '—'}</b></div>
          </div>
          {below && <label className="check dp-warn"><input type="checkbox" checked={f.allow_below_cost} onChange={setFf('allow_below_cost')} /> Sell below the dealer price (loss) — I'm sure</label>}
          <label className="check"><input type="checkbox" checked={f.is_active} onChange={setFf('is_active')} /> Show to customers now (untick to approve but keep hidden)</label>
          <label className="check"><input type="checkbox" checked={f.is_new} onChange={setFf('is_new')} /> Mark as “New”</label>
          <label className="check"><input type="checkbox" checked={f.is_diwali} onChange={setFf('is_diwali')} /> Part of the festival collection</label>
          <Field label="Note to dealer (they will see this)" id="pc-nd"><input id="pc-nd" value={f.note_to_dealer} onChange={setFf('note_to_dealer')} placeholder="e.g. Looks great — please keep 20 pieces ready for Diwali" /></Field>
          <Field label="Internal note (team only)" id="pc-ni"><input id="pc-ni" value={f.internal_note} onChange={setFf('internal_note')} /></Field>
          <button className="btn btn--primary btn--block" disabled={busy || !price || (below && !f.allow_below_cost)} onClick={publish}>{d.status === 'approved' ? '💾 Update store listing' : f.is_active ? '✅ Approve & publish' : '✅ Approve (keep hidden)'}</button>

          <div className="dp-decline">
            <Field label="Or send back to the dealer" id="pc-back" hint="They see this message"><textarea id="pc-back" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Please add a photo of the base, and the exact weight" /></Field>
            <div className="row gap-s wrap">
              <button className="btn btn--sm" disabled={busy || note.trim().length < 5} onClick={() => decide('request-changes')}>✏️ Ask for changes</button>
              <button className="btn btn--sm btn--ghost" disabled={busy || note.trim().length < 5} onClick={() => decide('reject')}>✖️ Reject</button>
            </div>
          </div>
        </section>
      </div>
      <Modal open={!!zoom} onClose={() => setZoom(null)} title="Photo" wide>{zoom && <img src={zoom} alt="" className="dp-zoom" />}</Modal>
      {nav && null}
    </>
  );
}

export function DealerProducts() {
  const { id } = useParams();
  return id ? <Review /> : <Queue />;
}
