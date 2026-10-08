/**
 * Admin → AI insights (built-in ML, free — no external AI service):
 *  - Forecast & stock alerts (Holt trend + festival uplift)
 *  - Customer groups (RFM segmentation) with next best action
 *  - Risky orders (weighted fraud / payment risk score)
 * Plus <WriterPanel/> used in the product form ("✨ Write for me").
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { rupees, fmtDateTime, PAYMENT_LABEL } from '../lib/format.js';
import { Pill, Spinner, Empty } from '../components/ui.jsx';
import { useToast } from '../state/store.jsx';
import { PageHead, useAdminData } from './pages.jsx';

const STATUS = {
  out: ['Out of stock', 'bad'], reorder_now: ['Reorder now', 'bad'], reorder_soon: ['Reorder soon', 'warn'],
  overstock: ['Overstock', 'info'], ok: ['Healthy', 'ok'], no_sales: ['No sales yet', 'muted'], out_no_sales: ['Out · no sales', 'muted'],
};
const LEVEL = { high: ['High risk', 'bad'], medium: ['Check', 'warn'], low: ['Low', 'ok'] };

function Spark({ data = [] }) {
  if (!data.length) return null;
  const max = Math.max(1, ...data);
  const pts = data.map((v, i) => `${(i / Math.max(1, data.length - 1)) * 80},${22 - (v / max) * 20}`).join(' ');
  return <svg className="spark" viewBox="0 0 80 24" width="80" height="24" aria-hidden="true"><polyline points={pts} fill="none" stroke="currentColor" strokeWidth="1.6" /></svg>;
}

function Forecast() {
  const [lead, setLead] = useState(10);
  const [filter, setFilter] = useState('alerts');
  const [d, , err] = useAdminData(`/admin/ai/forecast?lead=${lead}`);
  if (err) return <p className="field__error">{err.message}</p>;
  if (!d) return <Spinner />;
  const rows = d.rows.filter((r) => (filter === 'alerts' ? ['out', 'reorder_now', 'reorder_soon'].includes(r.status) : filter === 'overstock' ? r.status === 'overstock' : true));
  return (
    <>
      <div className="kpis">
        <div className="kpi kpi--bad"><span className="kpi__label">Reorder now</span><b className="kpi__value">{d.summary.reorder_now}</b></div>
        <div className="kpi kpi--warn"><span className="kpi__label">Reorder soon</span><b className="kpi__value">{d.summary.reorder_soon}</b></div>
        <div className="kpi"><span className="kpi__label">Overstocked</span><b className="kpi__value">{d.summary.overstock}</b><span className="kpi__sub">{rupees(d.summary.overstock_value)} tied up</span></div>
        <div className="kpi"><span className="kpi__label">Orders learned from</span><b className="kpi__value">{d.orders_90d}</b><span className="kpi__sub">last 90 days</span></div>
      </div>
      <div className="row gap-s wrap ai-bar">
        <div className="tabs ai-filter">{[['alerts', 'Stock alerts'], ['overstock', 'Overstock'], ['all', 'All products']].map(([k, l]) => <button key={k} type="button" className={filter === k ? 'is-on' : ''} onClick={() => setFilter(k)}>{l}</button>)}</div>
        <label className="small">Supplier lead time <select value={lead} onChange={(e) => setLead(+e.target.value)}>{[3, 7, 10, 14, 21, 30].map((n) => <option key={n} value={n}>{n} days</option>)}</select></label>
      </div>
      {d.demo && <p className="small muted">Preview: forecast uses simulated demo sales. Your live store learns from real orders.</p>}
      {!rows.length ? <Empty title="Nothing to act on" text="Stock looks healthy for the next 30 days." /> : (
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Table">
          <table className="table">
            <thead><tr><th>Product</th><th>Status</th><th>In stock</th><th>Last 12 weeks</th><th>Next 30 days (forecast)</th><th>Days left</th><th>Order qty</th><th>Why</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td><Link className="link" to={`/admin/products/${r.id}`}>{r.name}</Link><div className="small muted">{r.category}</div></td>
                  <td><Pill tone={STATUS[r.status]?.[1]}>{STATUS[r.status]?.[0] || r.status}</Pill></td>
                  <td>{r.stock}</td>
                  <td><Spark data={r.history} /> <span className="small muted">{r.sold_12w} sold</span></td>
                  <td><b>{r.forecast}</b> <span className="small muted">({r.trend === 'up' ? '↗ rising' : r.trend === 'down' ? '↘ falling' : '→ steady'} · {r.confidence} confidence)</span></td>
                  <td>{r.cover_days == null ? '—' : r.cover_days > 365 ? '1 yr+' : `${r.cover_days} d`}</td>
                  <td>{r.reorder_qty ? <b>{r.reorder_qty}</b> : '—'}</td>
                  <td className="small">{(r.festival || []).join(' · ') || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="small muted">How it works: weekly sales are smoothed with a trend model (Holt), boosted for festivals in your Messages calendar, and compared with stock + safety stock for your lead time.</p>
    </>
  );
}

function Groups() {
  const [d, , err] = useAdminData('/admin/ai/segments');
  const [open, setOpen] = useState(null);
  if (err) return <p className="field__error">{err.message}</p>;
  if (!d) return <Spinner />;
  if (!d.total) return <Empty title="No paying customers yet" text="Groups appear after your first confirmed orders." />;
  return (
    <>
      <p className="muted">{d.total} customers grouped by how recently, how often and how much they buy (RFM).{d.demo ? ' Preview uses demo customers.' : ''}</p>
      <div className="segs">
        {d.groups.map((g) => (
          <div key={g.key} className={`segcard card ${open === g.key ? 'on' : ''}`}>
            <button type="button" className="segcard__btn" onClick={() => setOpen(open === g.key ? null : g.key)} aria-expanded={open === g.key}>
              <span className="segcard__icon" aria-hidden="true">{g.icon}</span>
              <span><b>{g.label}</b><span className="small muted"> · {g.count} customers · {rupees(g.revenue)}</span></span>
            </button>
            <p className="small"><b>Do this:</b> {g.action}</p>
            {open === g.key && (
              <div className="table-wrap" tabIndex={0} role="region" aria-label="Table">
                <table className="table table--compact">
                  <thead><tr><th>Customer</th><th>Orders</th><th>Spent</th><th>Last order</th><th>Buys again</th></tr></thead>
                  <tbody>{g.customers.slice(0, 50).map((c, i) => (
                    <tr key={i}><td>{c.name}<div className="small muted">{c.phone}{c.subscribed ? ' · 🔔 subscribed' : ''}</div></td><td>{c.f}</td><td>{rupees(c.m)}</td><td>{c.recency} days ago</td><td>{Math.round((c.p_return || 0) * 100)}%</td></tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </div>
        ))}
      </div>
      <p className="small muted">Tip: send offers only to customers who subscribed (🔔) — use Customer messages → Send now.</p>
    </>
  );
}

function Risk() {
  const [d, , err] = useAdminData('/admin/ai/risk');
  if (err) return <p className="field__error">{err.message}</p>;
  if (!d) return <Spinner />;
  return (
    <>
      <p className="muted">{d.flagged ? `${d.flagged} order(s) need a second look before you ship.` : 'No risky orders in the last 30 days. 🎉'}</p>
      {!d.items.length ? <Empty title="No orders yet" /> : (
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Table">
          <table className="table">
            <thead><tr><th>Order</th><th>Risk</th><th>Customer</th><th>Total</th><th>Payment</th><th>Reasons</th></tr></thead>
            <tbody>{d.items.map((o) => (
              <tr key={o.id}>
                <td><Link className="link" to={`/admin/orders?q=${o.order_number}`}>#{o.order_number}</Link><div className="small muted">{fmtDateTime(o.created_at)}</div></td>
                <td><Pill tone={LEVEL[o.level][1]}>{LEVEL[o.level][0]} · {o.score}</Pill></td>
                <td>{o.name}<div className="small muted">{o.phone}</div></td>
                <td>{rupees(o.total)}</td>
                <td>{PAYMENT_LABEL[o.payment_status] || o.payment_status}</td>
                <td className="small">{o.reasons.length ? o.reasons.join(' · ') : '—'}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      <p className="small muted">The score (0–100) adds up warning signs such as a reused UTR, many orders from one phone in 24 hours, PIN code not matching the state, or an unusually large first order. It never blocks an order by itself — you decide.</p>
    </>
  );
}

export function AiInsights() {
  const [tab, setTab] = useState('forecast');
  return (
    <div>
      <PageHead title="🤖 AI insights" sub="Built-in machine learning — runs on your own server, free, no data sent outside." />
      <div className="tabs" role="tablist">
        {[['forecast', '📦 Forecast & stock alerts'], ['groups', '👥 Customer groups'], ['risk', '🛡️ Risky orders']].map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'is-on' : ''} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      {tab === 'forecast' && <Forecast />}
      {tab === 'groups' && <Groups />}
      {tab === 'risk' && <Risk />}
    </div>
  );
}

/** Risk badge for an order (used in Orders / Payments). */
export function RiskBadge({ number }) {
  const [r, setR] = useState(null);
  useEffect(() => { setR(null); api.get(`/admin/ai/risk/${number}`).then(setR).catch(() => {}); }, [number]);
  if (!r || r.level === 'low') return null;
  return <span title={r.reasons.join(' · ')}><Pill tone={LEVEL[r.level][1]}>⚠️ {LEVEL[r.level][0]}</Pill></span>;
}

/** "✨ Write for me": descriptions, SEO, social posts from the product's own details. */
export function WriterPanel({ f, setF }) {
  const [r, setR] = useState(null);
  const [v, setV] = useState(0);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const run = async (variant = v) => {
    setBusy(true);
    try {
      setR(await api.post('/admin/ai/write', { name: f.name, category_id: f.category_id ? Number(f.category_id) : undefined, specs: f.specs, price: Number(f.price) || 0, mrp: Number(f.mrp) || 0, is_diwali: !!f.is_diwali, short_description: f.short_description || undefined, variant }));
    } catch (x) { toast(x.message, 'warn'); } finally { setBusy(false); }
  };
  const wa = r ? r.whatsapp.replace('{link}', f.url ? `${location.origin}${f.url}` : '(product link — save the product first)') : '';
  const use = (k, val) => { setF((x) => ({ ...x, [k]: val })); toast('Added — review it and Save'); };
  const copy = (t) => { navigator.clipboard?.writeText(t).then(() => toast('Copied'), () => toast('Copy failed', 'warn')); };
  return (
    <div className="writer card">
      <div className="row between wrap gap-s">
        <b>✨ Write for me</b>
        <div className="row gap-s">
          {r && <button type="button" className="btn btn--ghost btn--sm" disabled={busy} onClick={() => { setV(v + 1); run(v + 1); }}>↻ Other versions</button>}
          <button type="button" className="btn btn--sm" disabled={busy || !f.name} onClick={() => run()}>{busy ? 'Writing…' : r ? 'Rewrite' : 'Write description & SEO'}</button>
        </div>
      </div>
      {!r && <p className="small muted">Fill the name, category, price and specs (material, size, what's included) — the writer uses only these facts, so nothing is made up.</p>}
      {r && (
        <div className="writer__out">
          <h4>Full description</h4>
          {r.descriptions.map((t, i) => <div key={i} className="writer__opt"><p>{t}</p><button type="button" className="btn btn--sm" onClick={() => use('description', t)}>Use</button></div>)}
          <h4>Short description</h4>
          {r.shorts.map((t, i) => <div key={i} className="writer__opt"><p>{t}</p><button type="button" className="btn btn--sm" onClick={() => use('short_description', t.slice(0, 200))}>Use</button></div>)}
          <h4>SEO title</h4>
          {r.seoTitles.map((t, i) => <div key={i} className="writer__opt"><p>{t} <span className="small muted">({t.length})</span></p><button type="button" className="btn btn--sm" onClick={() => use('seo_title', t.slice(0, 70))}>Use</button></div>)}
          <h4>SEO meta description</h4>
          {r.seoDescs.map((t, i) => <div key={i} className="writer__opt"><p>{t} <span className="small muted">({t.length})</span></p><button type="button" className="btn btn--sm" onClick={() => use('seo_description', t)}>Use</button></div>)}
          <h4>Social posts</h4>
          <div className="writer__opt"><pre>{r.instagram}</pre><button type="button" className="btn btn--sm" onClick={() => copy(r.instagram)}>Copy Instagram</button></div>
          <div className="writer__opt"><pre>{wa}</pre><button type="button" className="btn btn--sm" onClick={() => copy(wa)}>Copy WhatsApp</button></div>
        </div>
      )}
    </div>
  );
}
