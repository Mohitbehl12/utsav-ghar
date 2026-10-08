/**
 * Dealer business dashboard, notifications and profile.
 * Every rupee here is the dealer's own value (dealer price × qty) — the API never sends
 * the customer selling price, margin or pricing formula.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { DEALER_STATUS } from '@shared/dealers.js';
import { DASH_RANGES } from '@shared/dealerDashboard.js';
import { api } from '../lib/api.js';
import { Spinner } from '../components/ui.jsx';

const rs = (p) => `₹${Math.round((p || 0) / 100).toLocaleString('en-IN')}`;
const rsShort = (p) => {
  const v = (p || 0) / 100;
  if (v >= 1e7) return `₹${(v / 1e7).toFixed(1).replace(/\.0$/, '')}Cr`;
  if (v >= 1e5) return `₹${(v / 1e5).toFixed(1).replace(/\.0$/, '')}L`;
  if (v >= 1e3) return `₹${(v / 1e3).toFixed(1).replace(/\.0$/, '')}k`;
  return `₹${Math.round(v)}`;
};
const num = (n) => (n ?? 0).toLocaleString('en-IN');
const ago = (s) => {
  const m = Math.round((Date.now() - Date.parse(s)) / 6e4);
  if (!Number.isFinite(m)) return '';
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  if (m < 1440) return `${Math.round(m / 60)} h ago`;
  return `${Math.round(m / 1440)} d ago`;
};

export function useDashboard(range) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  const load = useCallback(() => api.get(`/dealer/dashboard?range=${range}`).then((x) => { setD(x); setErr(''); }).catch((e) => setErr(e.message || 'Could not load')), [range]);
  useEffect(() => { load(); const t = setInterval(() => { if (!document.hidden) load(); }, 60000); return () => clearInterval(t); }, [load]);
  return [d, load, err];
}

// ---------------------------------------------------------------- charts (plain SVG, hover/tap for values)
function useWidth() {
  const ref = useRef(null);
  const [w, setW] = useState(320);
  useEffect(() => {
    const el = ref.current; if (!el) return undefined;
    const ro = new ResizeObserver(([e]) => setW(Math.max(240, Math.floor(e.contentRect.width))));
    ro.observe(el); return () => ro.disconnect();
  }, []);
  return [ref, w];
}
const niceMax = (v) => {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v)); const f = v / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
};
const everyNth = (n, w) => Math.max(1, Math.ceil(n / Math.max(3, Math.floor(w / 56))));

/** Sales trend: one series (your earnings) as columns — the title names it. */
function SalesChart({ series, metric }) {
  const [ref, w] = useWidth();
  const [hi, setHi] = useState(null);
  const h = 180; const pad = { l: 44, r: 8, t: 10, b: 26 };
  const vals = series.map((s) => (metric === 'value' ? s.value / 100 : s.units));
  const max = niceMax(Math.max(...vals, 0));
  const iw = w - pad.l - pad.r; const ih = h - pad.t - pad.b;
  const bw = iw / series.length; const barW = Math.max(2, Math.min(28, bw - 2));
  const y = (v) => pad.t + ih - (v / max) * ih;
  const nth = everyNth(series.length, iw);
  const fmt = (v) => (metric === 'value' ? rsShort(v * 100) : num(v));
  const tip = hi != null ? series[hi] : null;
  return (
    <div className="dd-chart" ref={ref}>
      <svg width={w} height={h} role="img" aria-label={`${metric === 'value' ? 'Earnings' : 'Units sold'} by ${series.length > 13 ? 'day' : 'period'}`} onMouseLeave={() => setHi(null)}>
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={pad.l} x2={w - pad.r} y1={y(max * f)} y2={y(max * f)} className="dd-grid" />
            <text x={pad.l - 6} y={y(max * f) + 4} textAnchor="end" className="dd-axis">{fmt(max * f)}</text>
          </g>
        ))}
        {series.map((s, i) => {
          const v = vals[i]; const x = pad.l + i * bw + (bw - barW) / 2; const top = y(v); const bh = Math.max(0, pad.t + ih - top);
          return (
            <g key={s.key}>
              {bh > 0 && <path d={roundTop(x, top, barW, bh, Math.min(4, barW / 2))} className={`dd-bar ${hi === i ? 'is-hi' : ''}`} />}
              <rect x={pad.l + i * bw} y={pad.t} width={bw} height={ih} fill="transparent" onMouseEnter={() => setHi(i)} onClick={() => setHi(i)} />
              {i % nth === 0 && <text x={pad.l + i * bw + bw / 2} y={h - 8} textAnchor="middle" className="dd-axis">{s.label}</text>}
            </g>
          );
        })}
      </svg>
      {tip && (
        <div className="dd-tip" style={{ left: Math.min(w - 150, Math.max(0, pad.l + hi * bw + bw / 2 - 75)) }}>
          <b>{tip.label}</b>
          <span>Earnings <strong>{rs(tip.value)}</strong></span>
          <span>Units sold <strong>{num(tip.units)}</strong></span>
          <span>Orders delivered <strong>{num(tip.orders)}</strong></span>
        </div>
      )}
    </div>
  );
}
function roundTop(x, y, w, h, r) {
  const rr = Math.min(r, h);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

/** Stock in vs stock out: two series, side-by-side columns, legend + tooltip. */
function StockFlowChart({ series }) {
  const [ref, w] = useWidth();
  const [hi, setHi] = useState(null);
  const h = 170; const pad = { l: 36, r: 8, t: 10, b: 26 };
  const max = niceMax(Math.max(...series.flatMap((s) => [s.stock_in, s.stock_out]), 0));
  const iw = w - pad.l - pad.r; const ih = h - pad.t - pad.b;
  const bw = iw / series.length; const gap = 2; const each = Math.max(1.5, Math.min(12, (bw - 4 - gap) / 2));
  const y = (v) => pad.t + ih - (v / max) * ih;
  const nth = everyNth(series.length, iw);
  const tip = hi != null ? series[hi] : null;
  return (
    <div className="dd-chart" ref={ref}>
      <div className="dd-legend"><span><i className="dd-sw dd-sw--in" />Stock added</span><span><i className="dd-sw dd-sw--out" />Stock sent out</span></div>
      <svg width={w} height={h} role="img" aria-label="Stock added versus stock sent out" onMouseLeave={() => setHi(null)}>
        {[0, 0.5, 1].map((f) => (
          <g key={f}><line x1={pad.l} x2={w - pad.r} y1={y(max * f)} y2={y(max * f)} className="dd-grid" /><text x={pad.l - 6} y={y(max * f) + 4} textAnchor="end" className="dd-axis">{num(Math.round(max * f))}</text></g>
        ))}
        {series.map((s, i) => {
          const cx = pad.l + i * bw + bw / 2;
          const bar = (v, x, cls) => { const t = y(v); const bh = pad.t + ih - t; return bh > 0 ? <path d={roundTop(x, t, each, bh, Math.min(3, each / 2))} className={`${cls} ${hi === i ? 'is-hi' : ''}`} /> : null; };
          return (
            <g key={s.key}>
              {bar(s.stock_in, cx - each - gap / 2, 'dd-in')}
              {bar(s.stock_out, cx + gap / 2, 'dd-out')}
              <rect x={pad.l + i * bw} y={pad.t} width={bw} height={ih} fill="transparent" onMouseEnter={() => setHi(i)} onClick={() => setHi(i)} />
              {i % nth === 0 && <text x={cx} y={h - 8} textAnchor="middle" className="dd-axis">{s.label}</text>}
            </g>
          );
        })}
      </svg>
      {tip && (
        <div className="dd-tip" style={{ left: Math.min(w - 150, Math.max(0, pad.l + hi * bw + bw / 2 - 75)), top: 26 }}>
          <b>{tip.label}</b>
          <span><i className="dd-sw dd-sw--in" />Added <strong>{num(tip.stock_in)}</strong></span>
          <span><i className="dd-sw dd-sw--out" />Sent out <strong>{num(tip.stock_out)}</strong></span>
        </div>
      )}
    </div>
  );
}

/** Sales by product: horizontal bars, labelled directly. */
function ProductBars({ rows: raw, metric }) {
  const rows = [...raw].sort((a, b) => (metric === 'value' ? b.value - a.value : b.units - a.units));
  const vals = rows.map((r) => (metric === 'value' ? r.value : r.units));
  const max = Math.max(...vals, 1);
  return (
    <ul className="dd-hbars">
      {rows.map((r, i) => (
        <li key={r.name} title={`${r.name}: ${num(r.units)} sold · ${rs(r.value)}`}>
          <span className="dd-hbars__name">{r.name}</span>
          <span className="dd-hbars__track"><span className="dd-hbars__bar" style={{ width: `${Math.max(2, (vals[i] / max) * 100)}%` }} /></span>
          <b>{metric === 'value' ? rs(r.value) : num(r.units)}</b>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------- dashboard
const Wrap = ({ o, children }) => (o.archived ? <div className="dd-orders__row">{children}</div> : <Link to={`/dealer/orders/${o.order_number}`}>{children}</Link>);
function Delta({ v }) {
  if (v == null) return null;
  if (v === 0) return <small className="dd-delta">same as previous period</small>;
  return <small className={`dd-delta ${v > 0 ? 'is-up' : 'is-down'}`}>{v > 0 ? '▲' : '▼'} {Math.abs(v)}% vs previous</small>;
}
function Tile({ icon, label, value, sub, tone, to }) {
  const body = (<><span className="dd-tile__icon" aria-hidden="true">{icon}</span><span className="dd-tile__label">{label}</span><b className="dd-tile__value">{value}</b>{sub}</>);
  return to ? <Link to={to} className={`dd-tile ${tone ? `dd-tile--${tone}` : ''}`}>{body}</Link> : <div className={`dd-tile ${tone ? `dd-tile--${tone}` : ''}`}>{body}</div>;
}

export function Dashboard({ dealer }) {
  const [range, setRange] = useState(() => { try { return localStorage.getItem('ug_dd_range') || '30d'; } catch { return '30d'; } });
  const [metric, setMetric] = useState('value');
  const [table, setTable] = useState(false);
  const [d, reload, err] = useDashboard(range);
  const pick = (r) => { setRange(r); try { localStorage.setItem('ug_dd_range', r); } catch { /* */ } };
  const k = d?.kpis;
  const hasSales = d && d.series.some((s) => s.units > 0);
  const hasFlow = d && d.series.some((s) => s.stock_in > 0 || s.stock_out > 0);
  const hello = useMemo(() => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; }, []);
  if (!d) return err ? <div className="dl-page"><p className="dl-err">{err}</p><button className="dl-btn" onClick={reload}>Try again</button></div> : <Spinner />;
  return (
    <div className="dl-page dd">
      <div className="dd-hello">
        <div><h1 className="dl-h1">{hello}, {dealer.name.split(' ')[0]} 🙏</h1><p className="dl-muted dl-small">Your business at a glance · last {d.range_label}</p></div>
      </div>
      <div className="dd-range" role="group" aria-label="Time range">
        {Object.entries(DASH_RANGES).map(([key, r]) => <button key={key} type="button" className={range === key ? 'is-on' : ''} aria-pressed={range === key} onClick={() => pick(key)}>{r.label}</button>)}
      </div>

      {(k.new_orders > 0 || k.out_of_stock > 0) && (
        <div className="dd-alerts">
          {k.new_orders > 0 && <Link to="/dealer/orders" className="dd-alert dd-alert--order">🛒 <b>{k.new_orders} new order{k.new_orders > 1 ? 's' : ''}</b> waiting — accept now →</Link>}
          {k.out_of_stock > 0 && <Link to="/dealer/products" className="dd-alert dd-alert--bad">🚫 <b>{k.out_of_stock} product{k.out_of_stock > 1 ? 's' : ''} out of stock</b> — customers can't order →</Link>}
        </div>
      )}

      <section className="dd-hero" aria-label="Earnings">
        <span className="dl-small">Your earnings (delivered) · {d.range_label}</span>
        <b>{rs(k.sales_value)}</b>
        <Delta v={k.sales_change_pct} />
        <div className="dd-hero__row">
          <span><b>{num(k.units_sold)}</b> units sold</span>
          <span><b>{num(k.orders_delivered)}</b> orders delivered</span>
          <span><b>{rs(k.pipeline_value)}</b> on the way</span>
        </div>
        <p className="dd-hero__note">At your dealer price × quantity. Paid as per your agreement with Utsav Ghar. <Link to="/dealer/payments" className="dd-hero__link">See payments →</Link></p>
      </section>

      <section className="dd-tiles" aria-label="Key numbers">
        <Tile icon="📦" label="Total stock" value={num(k.total_stock)} sub={<small>worth {rs(k.stock_value)} at your price</small>} to="/dealer/products" />
        <Tile icon="🛍️" label="Products live" value={`${num(k.products_live)}`} sub={<small>{k.products_review ? `${k.products_review} under review` : `${k.products_total} added in all`}</small>} to="/dealer/products" />
        <Tile icon="🧾" label="Open orders" value={num(k.open_orders)} sub={<small>{k.new_orders} new · {k.open_orders - k.new_orders} in progress</small>} to="/dealer/orders" tone={k.new_orders ? 'warn' : ''} />
        <Tile icon="⚠️" label="Low / out of stock" value={`${k.low_stock} / ${k.out_of_stock}`} sub={<small>{k.low_stock + k.out_of_stock ? 'refill soon' : 'all good'}</small>} tone={k.out_of_stock ? 'bad' : k.low_stock ? 'warn' : 'ok'} to="/dealer/products" />
        <Tile icon="🔄" label="Stock in / out" value={`${num(k.stock_in)} / ${num(k.stock_out)}`} sub={<small>added / sent · {d.range_label}</small>} />
        <Tile icon="⚡" label="Service" value={k.accept_rate == null ? '–' : `${k.accept_rate}%`} sub={<small>accepted{k.avg_accept_minutes != null ? ` · in ~${k.avg_accept_minutes} min` : ''}{k.avg_dispatch_hours != null ? ` · ships in ~${k.avg_dispatch_hours} h` : ''}</small>} />
      </section>

      <section className="dl-box dd-card">
        <div className="dd-card__head">
          <h2>Sales trend</h2>
          <div className="dd-seg" role="group" aria-label="Show">
            <button type="button" aria-pressed={metric === 'value'} className={metric === 'value' ? 'is-on' : ''} onClick={() => setMetric('value')}>₹ Earnings</button>
            <button type="button" aria-pressed={metric === 'units'} className={metric === 'units' ? 'is-on' : ''} onClick={() => setMetric('units')}>Units</button>
          </div>
        </div>
        <p className="dl-small dl-muted">{metric === 'value' ? 'Your earnings' : 'Units delivered'} per {d.bucket} · tap a bar for details</p>
        {hasSales ? <SalesChart series={d.series} metric={metric} /> : <p className="dd-empty">No deliveries in this period yet.</p>}
        <button type="button" className="dd-link" onClick={() => setTable((x) => !x)}>{table ? 'Hide table' : 'Show as table'}</button>
        {table && (
          <div className="dd-tablewrap"><table className="dd-table"><thead><tr><th>{d.bucket === 'month' ? 'Month' : d.bucket === 'week' ? 'Week of' : 'Day'}</th><th>Orders</th><th>Units</th><th>Earnings</th><th>Stock in</th><th>Stock out</th></tr></thead>
            <tbody>{[...d.series].reverse().map((s) => <tr key={s.key}><td>{s.label}</td><td>{s.orders}</td><td>{s.units}</td><td>{rs(s.value)}</td><td>{s.stock_in}</td><td>{s.stock_out}</td></tr>)}</tbody></table></div>
        )}
      </section>

      <section className="dl-box dd-card">
        <div className="dd-card__head"><h2>Sales by product</h2><span className="dl-small dl-muted">{metric === 'value' ? 'earnings' : 'units'}</span></div>
        {d.by_product.length ? <ProductBars rows={d.by_product} metric={metric} /> : <p className="dd-empty">Your best sellers will show here.</p>}
      </section>

      <section className="dl-box dd-card">
        <div className="dd-card__head"><h2>Top sellers</h2></div>
        {d.top_products.length ? (
          <ol className="dd-top">{d.top_products.map((p, i) => <li key={p.name}><span className="dd-top__rank">{['🥇', '🥈', '🥉'][i] || i + 1}</span><span className="dd-top__name">{p.name}</span><span className="dl-small"><b>{num(p.units)}</b> sold · {rs(p.value)}</span></li>)}</ol>
        ) : <p className="dd-empty">No sales yet in this period.</p>}
      </section>

      <section className="dl-box dd-card">
        <div className="dd-card__head"><h2>Stock in vs stock out</h2></div>
        {hasFlow ? <StockFlowChart series={d.series} /> : <p className="dd-empty">Stock you add and parcels you send out will show here.</p>}
      </section>

      <section className="dl-box dd-card">
        <div className="dd-card__head"><h2>Stock alerts</h2><Link to="/dealer/products" className="dd-link">Update stock →</Link></div>
        {d.stock_alerts.length ? (
          <ul className="dd-stock">{d.stock_alerts.map((s) => <li key={s.id}><span>{s.name}</span><span className={`dl-pill dl-pill--${s.level === 'out' ? 'bad' : 'warn'}`}>{s.level === 'out' ? '🚫 Out of stock' : `⚠️ ${s.stock} left`}</span></li>)}</ul>
        ) : <p className="dd-empty">✅ All products have enough stock.</p>}
        {d.stock_table.length > 0 && (
          <details className="dd-details"><summary>All products stock ({d.stock_table.length})</summary>
            <div className="dd-tablewrap"><table className="dd-table"><thead><tr><th>Product</th><th>In stock</th><th>Sold ({d.range_label})</th><th>Your price</th></tr></thead>
              <tbody>{d.stock_table.map((s) => <tr key={s.id}><td>{s.name}{!s.live && <small className="dl-muted"> · not live</small>}</td><td>{s.stock}</td><td>{s.sold}</td><td>{rs(s.dealer_price)}</td></tr>)}</tbody></table></div>
          </details>
        )}
      </section>

      <section className="dl-box dd-card">
        <div className="dd-card__head"><h2>Recent orders</h2><Link to="/dealer/orders" className="dd-link">All orders →</Link></div>
        {d.recent_orders.length ? (
          <ul className="dd-orders">{d.recent_orders.map((o) => {
            const st = DEALER_STATUS[o.status] || {};
            return (
              <li key={o.order_number}><Wrap o={o}>
                <span><b>#{o.order_number}</b><small className="dl-muted">{o.first_item}{o.lines > 1 ? ` + ${o.lines - 1}` : ''} · {o.items} pc · {o.city} · {ago(o.sent_at)}</small></span>
                <span className="dd-orders__r">{o.value != null && <b>{rs(o.value)}</b>}<span className={`dl-pill dl-pill--${o.cancelled ? 'bad' : st.tone}`}>{o.cancelled ? '✖️ Cancelled' : `${st.icon || ''} ${st.short || o.status}`}</span></span>
              </Wrap></li>
            );
          })}</ul>
        ) : <p className="dd-empty">No orders yet.</p>}
      </section>
      {k.value_missing_lines > 0 && <p className="dl-small dl-muted">ℹ️ {k.value_missing_lines} sold item{k.value_missing_lines > 1 ? 's have' : ' has'} no dealer price on record yet, so not counted in earnings. Our team will update it.</p>}
      <button className="dl-refresh" type="button" onClick={reload}>↻ Refresh</button>
    </div>
  );
}

// ---------------------------------------------------------------- notifications
export function Notifications({ onSeen }) {
  const [d, reload] = useDashboard('30d');
  useEffect(() => {
    if (!d) return undefined;
    const t = setTimeout(() => api.post('/dealer/notifications/seen').then(() => onSeen?.()).catch(() => {}), 1500);
    return () => clearTimeout(t);
  }, [d]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!d) return <Spinner />;
  return (
    <div className="dl-page">
      <div className="dl-head"><div><h1 className="dl-h1">🔔 Notifications</h1><p className="dl-muted dl-small">New orders, product reviews and stock alerts</p></div></div>
      {d.notifications.length === 0 ? <div className="dl-empty"><span aria-hidden="true">🔕</span><p>Nothing new. We will tell you when an order arrives.</p></div> : (
        <ul className="dd-notes">
          {d.notifications.map((n, i) => (
            <li key={i} className={`dd-note dd-note--${n.kind} ${n.unread ? 'is-unread' : ''}`}>
              <Link to={n.link}><span className="dd-note__icon" aria-hidden="true">{n.icon}</span><span><span>{n.text}</span><small className="dl-muted">{ago(n.at)}{n.unread ? ' · new' : ''}</small></span></Link>
            </li>
          ))}
        </ul>
      )}
      <button className="dl-refresh" type="button" onClick={reload}>↻ Refresh</button>
    </div>
  );
}

export function useUnread() {
  const [n, setN] = useState(0);
  const load = useCallback(() => api.get('/dealer/dashboard?range=7d').then((x) => setN(x.unread || 0)).catch(() => {}), []);
  useEffect(() => { load(); const t = setInterval(() => { if (!document.hidden) load(); }, 60000); return () => clearInterval(t); }, [load]);
  return [n, load, setN];
}

// ---------------------------------------------------------------- profile
export function Profile({ onOut }) {
  const [p, setP] = useState(null);
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.get('/dealer/profile').then((x) => { setP(x); setEmail(x.email || ''); }).catch(() => setP(false)); }, []);
  if (p === null) return <Spinner />;
  if (!p) return <p className="dl-err">Could not load your profile.</p>;
  const save = async (e) => {
    e.preventDefault(); setBusy(true); setMsg('');
    try { const x = await api.put('/dealer/profile', { email }); setP(x); setMsg('✅ Saved'); } catch (er) { setMsg(er.message || 'Could not save'); } finally { setBusy(false); }
  };
  const row = (l, v) => (v ? <div className="dd-prof__row"><span>{l}</span><b>{v}</b></div> : null);
  return (
    <div className="dl-page">
      <div className="dd-prof__card">
        <span className="dd-prof__avatar" aria-hidden="true">{p.business_name.slice(0, 1)}</span>
        <div><h1 className="dl-h1">{p.business_name}</h1><p className="dl-small">{p.name} · 📱 {p.phone}</p></div>
      </div>
      <section className="dl-box">
        <h2>Business details</h2>
        {row('Address', [p.address, p.city, p.state, p.pincode].filter(Boolean).join(', '))}
        {row('GSTIN', p.gstin)}
        {row('Delivers to', p.serves === 'All India' ? 'All India' : `${p.serves_count} PIN area${p.serves_count === 1 ? '' : 's'}: ${p.serves.join(', ')}${p.serves_count > p.serves.length ? '…' : ''}`)}
        {row('Categories', p.categories.join(', '))}
        {row('Partner since', p.member_since ? new Date(p.member_since).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }) : null)}
        <p className="dl-small dl-muted">To change your address, GSTIN, delivery area or categories, message our team — these decide which orders come to you.</p>
      </section>
      <form className="dl-box" onSubmit={save}>
        <h2>Email for updates</h2>
        <label className="dl-field">Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@business.com" autoComplete="email" /></label>
        <button className="dl-btn dl-btn--primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        {msg && <p className="dl-small" role="status">{msg}</p>}
      </form>
      <section className="dl-box">
        <h2>Privacy</h2>
        <p className="dl-small dl-muted">You see your own products, stock, orders and earnings at your dealer price. Customer prices and other dealers' details are not shared.</p>
      </section>
      <Link to="/dealer/payments" className="dl-btn dl-btn--block">💰 Payments &amp; settlement</Link>
      <Link to="/dealer/legal" className="dl-btn dl-btn--block">📜 Legal &amp; Agreements</Link>
      <Link to="/dealer/onboarding" className="dl-btn dl-btn--block">📝 KYC, documents &amp; onboarding status</Link>
      <Link to="/dealer/manual" className="dl-btn dl-btn--block">📘 Dealer user manual (English / हिंदी)</Link>
      <Link to="/" className="dl-btn dl-btn--block">🏪 Go to the Utsav Ghar store</Link>
      <button className="dl-btn dl-btn--block" onClick={onOut}>Sign out</button>
    </div>
  );
}
