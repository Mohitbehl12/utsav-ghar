import { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { rupees, fmtDate, fmtDateTime, PAYMENT_LABEL, STATUS_LABEL, tone } from '../lib/format.js';
import { Pill, Spinner, Modal, Field, Empty, Stars } from '../components/ui.jsx';
import { useToast } from '../state/store.jsx';
import { RiskBadge } from './ai.jsx';
import { DealerPanel } from './dealers.jsx';
import { OrderEconomics } from './pricingPin.jsx';

export function useAdminData(path) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const reload = useCallback(() => api.get(path).then((d) => { setData(d); setErr(null); }).catch(setErr), [path]);
  useEffect(() => { reload(); }, [reload]);
  return [data, reload, err];
}

export const PageHead = ({ title, sub, children }) => (
  <header className="adm-head">
    <div><h1>{title}</h1>{sub && <p className="muted">{sub}</p>}</div>
    {children && <div className="row gap-s wrap">{children}</div>}
  </header>
);

// ---- Dashboard ---------------------------------------------------------------------
function SalesChart({ days }) {
  const [hover, setHover] = useState(null);
  const W = 640, H = 200, P = { l: 52, r: 8, t: 12, b: 28 };
  const max = Math.max(1, ...days.map((d) => d.sales));
  const nice = (() => { const step = 10 ** Math.floor(Math.log10(max)); return Math.ceil(max / step) * step; })();
  const bw = (W - P.l - P.r) / days.length;
  const y = (v) => P.t + (H - P.t - P.b) * (1 - v / nice);
  const ticks = [0, nice / 2, nice];
  return (
    <div className="chart" onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} role="group" aria-label="Confirmed sales per day for the last 14 days">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={P.l} x2={W - P.r} y1={y(t)} y2={y(t)} className="chart__grid" />
            <text x={P.l - 8} y={y(t) + 4} textAnchor="end" className="chart__tick">{t >= 100000 ? `₹${(t / 100000).toFixed(t % 100000 ? 1 : 0)}k` : `₹${Math.round(t / 100)}`}</text>
          </g>
        ))}
        {days.map((d, i) => {
          const x = P.l + i * bw + 2;
          const h = Math.max(d.sales ? 3 : 0, H - P.b - y(d.sales));
          const today = i === days.length - 1;
          return (
            <g key={d.date} onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={0} role="img" aria-label={`${fmtDate(d.date)}: ${rupees(d.sales)}, ${d.orders} orders`}>
              <rect x={P.l + i * bw} y={P.t} width={bw} height={H - P.t - P.b} fill="transparent" />
              {h > 0 && <path d={`M${x},${H - P.b} v${-(h - 4)} q0,-4 4,-4 h${bw - 12} q4,0 4,4 v${h - 4}z`} className={`chart__bar ${today ? 'is-today' : ''} ${hover === i ? 'is-hover' : ''}`} />}
              {(i % 2 === 1 || today) && <text x={x + (bw - 4) / 2} y={H - 8} textAnchor="middle" className="chart__tick">{today ? 'Today' : new Date(d.date).getDate()}</text>}
            </g>
          );
        })}
        <line x1={P.l} x2={W - P.r} y1={H - P.b} y2={H - P.b} className="chart__axis" />
      </svg>
      {hover != null && (
        <div className="chart__tip" style={{ left: `${((P.l + hover * bw + bw / 2) / W) * 100}%` }}>
          <b>{fmtDate(days[hover].date, { weekday: 'short', day: 'numeric', month: 'short' })}</b>
          <span>{rupees(days[hover].sales)} · {days[hover].orders} order{days[hover].orders === 1 ? '' : 's'}</span>
        </div>
      )}
    </div>
  );
}

export function Dashboard() {
  const [s] = useAdminData('/admin/stats');
  if (!s) return <Spinner />;
  const tiles = [
    ['Total sales', rupees(s.totalSales), 'confirmed payments', null],
    ['Gross profit', rupees(s.grossProfit ?? 0), s.totalSales ? `after product costs · see breakdown` : 'no paid orders yet', '/admin/profit', null],
    ["Today's sales", rupees(s.todaySales), `${s.todayOrders} order${s.todayOrders === 1 ? '' : 's'} today`, null],
    ['Orders', s.orders, `${s.toShip} to pack & ship`, '/admin/orders'],
    ['Pending payments', s.pendingPayments, `${s.awaitingPayment} not yet paid`, '/admin/payments?status=verification_pending', s.pendingPayments ? 'warn' : null],
    ['Products', s.products, 'active in store', '/admin/products'],
    ['Low stock', s.lowStock.length, 'at or below threshold', '/admin/products', s.lowStock.length ? 'bad' : null],
    ['Active offers', s.activeOffers, s.pendingReviews ? `${s.pendingReviews} reviews to moderate` : 'running now', '/admin/offers'],
  ];
  return (
    <>
      <PageHead title="Dashboard" sub={`Updated ${fmtDateTime(new Date().toISOString())}`} />
      <div className="kpis">
        {tiles.map(([label, value, sub, to, alert]) => {
          const inner = <><span className="kpi__label">{label}</span><b className="kpi__value">{value}</b><span className="kpi__sub">{alert && <span className={`dot dot--${alert}`} />}{sub}</span></>;
          return to ? <Link key={label} to={to} className={`kpi ${alert ? `kpi--${alert}` : ''}`}>{inner}</Link> : <div key={label} className="kpi">{inner}</div>;
        })}
      </div>
      <div className="adm-grid">
        <section className="card adm-grid__wide">
          <h2>Sales · last 14 days</h2>
          <SalesChart days={s.salesByDay} />
        </section>
        <section className="card">
          <h2>Needs attention</h2>
          <ul className="attn">
            {s.pendingPayments > 0 && <li><Link to="/admin/payments?status=verification_pending">💳 <b>{s.pendingPayments}</b> UPI payment{s.pendingPayments > 1 ? 's' : ''} to verify</Link></li>}
            {s.toShip > 0 && <li><Link to="/admin/orders?status=payment_confirmed">📦 <b>{s.toShip}</b> paid order{s.toShip > 1 ? 's' : ''} to pack &amp; ship</Link></li>}
            {s.pendingReviews > 0 && <li><Link to="/admin/reviews">⭐ <b>{s.pendingReviews}</b> review{s.pendingReviews > 1 ? 's' : ''} awaiting moderation</Link></li>}
            {s.lowStock.map((p) => <li key={p.id}><Link to={`/admin/products/${p.id}`}>⚠️ <b>{p.name}</b>: {p.stock} left</Link></li>)}
            {!s.pendingPayments && !s.toShip && !s.pendingReviews && !s.lowStock.length && <li className="muted">All caught up ✨</li>}
          </ul>
        </section>
        <section className="card adm-grid__wide">
          <div className="row between"><h2>Recent orders</h2><Link to="/admin/orders" className="link small">All orders →</Link></div>
          <div className="table-wrap" tabIndex={0} role="region" aria-label="Table">
            <table className="table">
              <thead><tr><th>Order</th><th>Customer</th><th className="num">Amount</th><th>Payment</th><th>Status</th><th>Date</th></tr></thead>
              <tbody>{s.recentOrders.map((o) => (
                <tr key={o.order_number}><td><b>#{o.order_number}</b></td><td>{o.customer_name}</td><td className="num">{rupees(o.total)}</td>
                  <td><Pill tone={tone(o.payment_status)}>{PAYMENT_LABEL[o.payment_status]}</Pill></td><td><Pill tone={tone(o.status)}>{STATUS_LABEL[o.status]}</Pill></td><td>{fmtDate(o.created_at)}</td></tr>
              ))}</tbody>
            </table>
          </div>
        </section>
        <section className="card">
          <h2>Top products</h2>
          {s.topProducts.length ? (
            <ol className="top">{s.topProducts.map((p) => <li key={p.name}><span>{p.name}</span><b>{p.qty} sold</b></li>)}</ol>
          ) : <p className="muted">No confirmed sales yet.</p>}
        </section>
      </div>
    </>
  );
}

// ---- Orders ----------------------------------------------------------------------------
const ACTIONS = {
  confirm_payment: ['Confirm Payment', 'btn--primary'],
  reject_payment: ['Reject Payment', 'btn--danger', true],
  process: ['Process Order', 'btn--primary'],
  ship: ['Mark Shipped', 'btn--primary'],
  out_for_delivery: ['Out for Delivery', 'btn--ghost'],
  deliver: ['Mark Delivered', 'btn--primary'],
  cancel: ['Cancel Order', 'btn--danger', true],
  mark_refunded: ['Mark Refunded', 'btn--ghost'],
};
function allowed(o) {
  const a = [];
  if (o.status !== 'cancelled' && o.payment_status !== 'confirmed' && o.payment_status !== 'refunded') a.push('confirm_payment');
  if (['awaiting_payment', 'verification_pending'].includes(o.payment_status) && o.status !== 'cancelled') a.push('reject_payment');
  if (o.status === 'payment_confirmed') a.push('process');
  if (o.status === 'processing') a.push('ship');
  if (o.status === 'shipped') a.push('out_for_delivery', 'deliver');
  if (o.status === 'out_for_delivery') a.push('deliver');
  if (!['delivered', 'cancelled'].includes(o.status)) a.push('cancel');
  if (o.status === 'cancelled' && o.payment_status === 'confirmed') a.push('mark_refunded');
  return a;
}
export const screenshotUrl = (o) => o.payment?.screenshot || o.screenshot_url || (o.payment_id || o.id ? `/api/admin/payments/${o.payment_id || o.id}/screenshot` : '');

function OrderDetail({ id, onChanged, onClose }) {
  const [o, setO] = useState(null);
  const [armed, setArmed] = useState(null);
  const [ship, setShip] = useState({ carrier: '', trackingNumber: '' });
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  useEffect(() => { api.get(`/admin/orders/${id}`).then((d) => { setO(d); setNote(d.admin_note || ''); }); }, [id]);
  if (!o) return <Spinner />;
  const run = async (action) => {
    if (ACTIONS[action][2] && armed !== action) { setArmed(action); return; }
    setBusy(true);
    try {
      const d = await api.post(`/admin/orders/${o.id}/action`, { action, ...(action === 'ship' ? ship : {}) });
      setO(d); setArmed(null); onChanged(); toast(`#${o.order_number}: ${ACTIONS[action][0]} ✓`);
    } catch (e) { toast(e.message, 'warn'); } finally { setBusy(false); }
  };
  return (
    <div className="odetail">
      <div className="row between wrap"><h2>Order #{o.order_number} <RiskBadge number={o.order_number} /></h2><span className="muted small">{fmtDateTime(o.created_at)}</span></div>
      <div className="row gap-s wrap"><Pill tone={tone(o.payment_status)}>{PAYMENT_LABEL[o.payment_status]}</Pill><Pill tone={tone(o.status)}>{STATUS_LABEL[o.status]}</Pill></div>
      <div className="odetail__grid">
        <section>
          <h3>Customer</h3>
          <p><b>{o.customer.name}</b><br />{o.customer.phone}{o.customer.email ? <><br />{o.customer.email}</> : null}</p>
          <p className="small">{o.address.line1}{o.address.line2 ? `, ${o.address.line2}` : ''}, {o.address.city}, {o.address.state} {o.address.pincode}</p>
        </section>
        <section className="odetail__pay">
          <h3>Payment</h3>
          <p className="small">Amount due <b className="big">{rupees(o.totals.total)}</b></p>
          <p className="small">Method: {o.payment?.method === 'razorpay' ? 'Online (gateway)' : 'UPI · manual verification'}</p>
          <p className="small">Customer UTR: <code className="utr">{o.payment?.customer_ref || 'not submitted'}</code></p>
          {o.payment?.has_screenshot && <a className="link small" href={screenshotUrl(o)} target="_blank" rel="noreferrer">View payment screenshot ↗</a>}
          {o.payment_status === 'verification_pending' && <p className="notice notice--warn small">Check your bank / UPI merchant statement for <b>{rupees(o.totals.total)}</b> with UTR <b>{o.payment?.customer_ref}</b> before confirming. A screenshot alone is not proof of payment.</p>}
        </section>
      </div>
      <DealerPanel order={o} onChange={(d) => { setO(d); onChanged(); }} />
      <OrderEconomics order={o} onChange={setO} />
      <table className="specs">
        <tbody>
          {o.items.map((i) => <tr key={i.name}><th scope="row">{i.name} × {i.qty}{i.offer_eligible ? ' · offer' : ''}</th><td className="num">{rupees(i.line_total)}</td></tr>)}
          <tr><th scope="row">Subtotal</th><td className="num">{rupees(o.totals.subtotal)}</td></tr>
          {o.totals.discount > 0 && <tr><th scope="row">{o.offer_name}</th><td className="num ok">−{rupees(o.totals.discount)}</td></tr>}
          <tr><th scope="row">Delivery</th><td className="num">{rupees(o.totals.delivery)}</td></tr>
          <tr><th scope="row"><b>Total</b></th><td className="num"><b>{rupees(o.totals.total)}</b></td></tr>
        </tbody>
      </table>
      <section>
        <h3>Actions</h3>
        {o.status === 'processing' && (
          <div className="row gap-s wrap ship-fields">
            <input aria-label="Courier" placeholder="Courier (e.g. Delhivery)" value={ship.carrier} onChange={(e) => setShip({ ...ship, carrier: e.target.value })} />
            <input aria-label="Tracking number" placeholder="Tracking number" value={ship.trackingNumber} onChange={(e) => setShip({ ...ship, trackingNumber: e.target.value })} />
          </div>
        )}
        <div className="row gap-s wrap">
          {allowed(o).map((a) => (
            <button key={a} className={`btn btn--sm ${ACTIONS[a][1]}`} disabled={busy} onClick={() => run(a)}>
              {armed === a ? `Tap again to ${ACTIONS[a][0].toLowerCase()}` : ACTIONS[a][0]}
            </button>
          ))}
          {armed && <button className="btn btn--sm btn--ghost" onClick={() => setArmed(null)}>Keep as is</button>}
        </div>
      </section>
      <section>
        <h3>History</h3>
        <ul className="events">{o.events.map((e, i) => <li key={i}><b>{STATUS_LABEL[e.status] || e.status.replace(/_/g, ' ')}</b> <span className="muted">{fmtDateTime(e.created_at)}</span>{e.note ? <> · {e.note}</> : null}</li>)}</ul>
      </section>
      <section>
        <h3>Internal note</h3>
        <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} aria-label="Internal note" />
        <button className="btn btn--ghost btn--sm" onClick={async () => { await api.put(`/admin/orders/${o.id}/note`, { note }); toast('Note saved'); }}>Save note</button>
      </section>
      <button className="btn btn--ghost btn--block" onClick={onClose}>Close</button>
    </div>
  );
}

export function Orders() {
  const [sp, setSp] = useSearchParams();
  const { id } = useParams();
  const nav = useNavigate();
  const qs = new URLSearchParams();
  for (const k of ['status', 'payment', 'q']) if (sp.get(k)) qs.set(k, sp.get(k));
  const [shown, setShown] = useState(100);
  qs.set('limit', String(shown));
  const [rows, reload] = useAdminData(`/admin/orders?${qs}`);
  const set = (k, v) => { const n = new URLSearchParams(sp); v ? n.set(k, v) : n.delete(k); setSp(n, { replace: true }); };
  return (
    <>
      <PageHead title="Orders" sub="Confirm payments, then move each order through packing and delivery." />
      <div className="adm-filters">
        <input type="search" placeholder="Search order ID, name or phone" defaultValue={sp.get('q') || ''} onKeyDown={(e) => e.key === 'Enter' && set('q', e.target.value)} aria-label="Search orders" />
        <select value={sp.get('payment') || ''} onChange={(e) => set('payment', e.target.value)} aria-label="Payment status">
          <option value="">All payments</option>{Object.entries(PAYMENT_LABEL).filter(([k]) => k !== 'pending').map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={sp.get('status') || ''} onChange={(e) => set('status', e.target.value)} aria-label="Order status">
          <option value="">All statuses</option>{Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      {rows && rows.length >= shown && <p className="small muted">Showing the latest {shown}. <button className="link" onClick={() => setShown(shown + 100)}>Show 100 more</button> · or search by order ID, name or phone.</p>}
      {!rows ? <Spinner /> : rows.length === 0 ? <Empty icon="📦" title="No orders match" /> : (
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Table">
          <table className="table table--click">
            <thead><tr><th>Order ID</th><th>Customer</th><th>Products</th><th className="num">Amount</th><th className="num">Discount</th><th>Payment</th><th>Status</th><th>Date</th></tr></thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.id} onClick={() => nav(`/admin/orders/${o.id}?${sp}`)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && nav(`/admin/orders/${o.id}?${sp}`)}>
                  <td><b>#{o.order_number}</b></td>
                  <td>{o.customer.name}<br /><span className="muted small">{o.customer.phone}</span></td>
                  <td className="wrap-cell">{o.items.map((i) => `${i.name} × ${i.qty}`).join(', ')}</td>
                  <td className="num">{rupees(o.totals.total)}</td>
                  <td className="num">{o.totals.discount ? `−${rupees(o.totals.discount)}` : '—'}</td>
                  <td><Pill tone={tone(o.payment_status)}>{PAYMENT_LABEL[o.payment_status]}</Pill></td>
                  <td><Pill tone={tone(o.status)}>{STATUS_LABEL[o.status]}</Pill></td>
                  <td>{fmtDate(o.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Modal open={!!id} onClose={() => nav(`/admin/orders?${sp}`)} title="Order" wide>
        {id && <OrderDetail id={id} onChanged={reload} onClose={() => nav(`/admin/orders?${sp}`)} />}
      </Modal>
    </>
  );
}

// ---- Payments --------------------------------------------------------------------------
export function Payments() {
  const [sp, setSp] = useSearchParams();
  const status = sp.get('status') || '';
  const [rows, reload] = useAdminData(`/admin/payments${status ? `?status=${status}` : ''}`);
  const [armed, setArmed] = useState(null);
  const [risk] = useAdminData('/admin/ai/risk');
  const riskOf = new Map((risk?.items || []).filter((x) => x.level !== 'low').map((x) => [x.order_number, x]));
  const toast = useToast();
  const act = async (p, action) => {
    const key = `${p.order_id}:${action}`;
    if (action === 'reject_payment' && armed !== key) { setArmed(key); return; }
    try { await api.post(`/admin/orders/${p.order_id}/action`, { action }); toast(`#${p.order_number}: ${action === 'confirm_payment' ? 'payment confirmed' : 'payment rejected'}`); setArmed(null); reload(); }
    catch (e) { toast(e.message, 'warn'); }
  };
  const tabs = [['', 'All'], ['verification_pending', 'To verify'], ['pending', 'Not paid yet'], ['confirmed', 'Confirmed'], ['rejected', 'Rejected']];
  return (
    <>
      <PageHead title="Payments" sub="Match each UTR against your bank or UPI merchant statement before confirming." />
      <div className="tabs" role="tablist">
        {tabs.map(([k, l]) => <button key={k} role="tab" aria-selected={status === k} className={status === k ? 'is-on' : ''} onClick={() => setSp(k ? { status: k } : {})}>{l}</button>)}
      </div>
      {!rows ? <Spinner /> : rows.length === 0 ? <Empty icon="💳" title="Nothing here" /> : (
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Table">
          <table className="table">
            <thead><tr><th>Order</th><th>Customer</th><th className="num">Amount</th><th>Method</th><th>UTR / reference</th><th>Proof</th><th>Status</th><th /></tr></thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.order_id}>
                  <td><Link className="link" to={`/admin/orders/${p.order_id}`}>#{p.order_number}</Link>{riskOf.get(p.order_number) && <div title={riskOf.get(p.order_number).reasons.join(' · ')}><Pill tone={riskOf.get(p.order_number).level === 'high' ? 'bad' : 'warn'}>⚠️ {riskOf.get(p.order_number).level === 'high' ? 'High risk' : 'Check'}</Pill></div>}</td>
                  <td>{p.customer_name}<br /><span className="muted small">{p.customer_phone}</span></td>
                  <td className="num"><b>{rupees(p.amount)}</b></td>
                  <td>{p.method === 'razorpay' ? (p.instrument || 'Online (gateway)') : 'UPI'}</td>
                  <td><code className="utr">{p.customer_ref || p.gateway_payment_id || '—'}</code></td>
                  <td>{p.has_screenshot ? <a className="link" href={p.screenshot_url || `/api/admin/payments/${p.id}/screenshot`} target="_blank" rel="noreferrer">Screenshot ↗</a> : <span className="muted">—</span>}</td>
                  <td><Pill tone={tone(p.status)}>{PAYMENT_LABEL[p.status]}</Pill></td>
                  <td>
                    {['verification_pending', 'pending'].includes(p.status) && (
                      <div className="row gap-s">
                        <button className="btn btn--sm btn--primary" onClick={() => act(p, 'confirm_payment')}>Confirm</button>
                        <button className="btn btn--sm btn--danger" onClick={() => act(p, 'reject_payment')}>{armed === `${p.order_id}:reject_payment` ? 'Tap to reject' : 'Reject'}</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

// ---- Reviews -----------------------------------------------------------------------------
export function Reviews() {
  const [rows, reload] = useAdminData('/admin/reviews');
  const set = async (r, status) => { await api.put(`/admin/reviews/${r.id}`, { status }); reload(); };
  return (
    <>
      <PageHead title="Reviews" sub="Approve genuine reviews; reject spam or abuse. Only approved reviews appear on the store." />
      {!rows ? <Spinner /> : rows.length === 0 ? <Empty icon="⭐" title="No reviews yet" /> : (
        <div className="stack">
          {rows.map((r) => (
            <article key={r.id} className="card review-mod">
              <div className="row between wrap"><div><b>{r.product_name}</b> <Stars value={r.rating} /></div><Pill tone={r.status === 'approved' ? 'ok' : r.status === 'rejected' ? 'bad' : 'warn'}>{r.status}</Pill></div>
              <p>{r.body}</p>
              {r.image_url && <img src={r.image_url} alt="" className="review__img" />}
              <p className="small muted">{r.author}{r.city ? `, ${r.city}` : ''} · {fmtDate(r.created_at)} {r.is_verified_purchase ? '· ✓ verified purchase' : ''}</p>
              <div className="row gap-s">
                {r.status !== 'approved' && <button className="btn btn--sm btn--primary" onClick={() => set(r, 'approved')}>Approve</button>}
                {r.status !== 'rejected' && <button className="btn btn--sm btn--ghost" onClick={() => set(r, 'rejected')}>Reject</button>}
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}

export function Customers() {
  const [rows] = useAdminData('/admin/customers');
  return (
    <>
      <PageHead title="Customers" sub="Registered accounts. Guest checkouts appear under Orders." />
      {!rows ? <Spinner /> : rows.length === 0 ? <Empty icon="👥" title="No registered customers yet" /> : (
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Table">
          <table className="table">
            <thead><tr><th>Name</th><th>Email</th><th>Mobile</th><th className="num">Orders</th><th className="num">Spent</th><th>Joined</th></tr></thead>
            <tbody>{rows.map((u) => <tr key={u.id}><td>{u.name}</td><td>{u.email}</td><td>{u.phone}</td><td className="num">{u.orders}</td><td className="num">{rupees(u.spent)}</td><td>{fmtDate(u.created_at)}</td></tr>)}</tbody>
          </table>
        </div>
      )}
    </>
  );
}

export function Audit() {
  const [rows] = useAdminData('/admin/audit');
  return (
    <>
      <PageHead title="Audit log" sub="Every admin change: who, what and when." />
      {!rows ? <Spinner /> : (
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Table">
          <table className="table">
            <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Item</th></tr></thead>
            <tbody>{rows.map((a) => <tr key={a.id}><td>{fmtDateTime(a.created_at)}</td><td>{a.admin_name || '—'}</td><td>{a.action.replace(/_/g, ' ')}</td><td>{a.entity} {a.entity_id}</td></tr>)}</tbody>
          </table>
        </div>
      )}
    </>
  );
}
