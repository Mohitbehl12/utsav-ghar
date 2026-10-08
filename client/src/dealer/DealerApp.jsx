/**
 * Dealer app (/dealer): a phone-first web app for partner shops.
 * New orders arrive from the store → accept → tick items while packing → ready →
 * hand to own delivery person (customer's 4-digit code confirms delivery) or a courier (AWB).
 * Customer phone & address are shown only after the dealer accepts.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, NavLink, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { DEALER_STATUS, DEALER_FLOW, REJECT_REASONS, COURIER_UPDATES } from '@shared/dealers.js';
import { api } from '../lib/api.js';
import { Spinner, useSeo, Strength } from '../components/ui.jsx';
import { LogoMark } from '../components/Icons.jsx';
import { ProductList, ProductForm } from './DealerProducts.jsx';
import { Dashboard, Notifications, Profile, useUnread } from './DealerDashboard.jsx';
import { DealerRegister, Onboarding, OnboardingBanner, MyAgreements } from './DealerOnboarding.jsx';
import UserManual from '../components/UserManual.jsx';
import { DealerPaymentsPage, DealerForgot } from './DealerPayments.jsx';
import '../styles/dealer.css';

const ago = (iso) => {
  if (!iso) return '';
  const m = Math.round((Date.now() - Date.parse(iso)) / 6e4);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} hr ago` : new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};
const time = (iso) => (iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '');

function beep() {
  try {
    const C = window.AudioContext || window.webkitAudioContext; const c = new C();
    [0, 0.25].forEach((d) => { const o = c.createOscillator(); const g = c.createGain(); o.frequency.value = 880; g.gain.value = 0.15; o.connect(g).connect(c.destination); o.start(c.currentTime + d); o.stop(c.currentTime + d + 0.15); });
    setTimeout(() => c.close(), 800);
  } catch { /* sound not allowed yet */ }
  try { navigator.vibrate?.([200, 100, 200]); } catch { /* */ }
  // inside the iPhone / Android dealer app: a real haptic buzz
  try { window.Capacitor?.Plugins?.Haptics?.notification?.({ type: 'WARNING' }); } catch { /* */ }
}

// ---------------------------------------------------------------- sign in
function Login({ onIn }) {
  const [f, setF] = useState({ phone: '', password: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const go = async (body) => {
    setBusy(true); setErr('');
    try { onIn((await api.post('/dealer/login', body)).dealer); } catch (x) { setErr(x.message); } finally { setBusy(false); }
  };
  return (
    <div className="dl-auth">
      <div className="dl-auth__card">
        <div className="dl-brand"><LogoMark /><div><b>Utsav Ghar</b><small>Dealer app</small></div></div>
        <h1>Sign in</h1>
        <p className="dl-muted">Use the mobile number registered with Utsav Ghar.</p>
        <form onSubmit={(e) => { e.preventDefault(); go({ ...f, phone: f.phone.trim() }); }}>
          <label className="dl-field"><span>Mobile number</span><input inputMode="numeric" autoComplete="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="98xxxxxxxx" required /></label>
          <label className="dl-field"><span>Password</span><input type="password" autoComplete="current-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required /></label>
          <input type="text" name="website" tabIndex={-1} autoComplete="off" className="dl-hp" aria-hidden="true" />
          {err && <p className="dl-err" role="alert">{err}</p>}
          <button className="dl-btn dl-btn--primary dl-btn--block" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        </form>
        {__DEMO__ && (
          <div className="dl-demo">
            <p className="dl-muted">Preview: try the app as a demo dealer.</p>
            <button type="button" className="dl-btn dl-btn--block" onClick={() => go({ phone: '9810022222', password: 'Dealer@2026' })}>Enter dealer app (preview)</button>
          </div>
        )}
        <Link to="/dealer/register" className="dl-btn dl-btn--block dl-register">🏪 New dealer? Register your business</Link>
        <Link to="/dealer/forgot" className="dl-link dl-small">Forgot password? Reset it with a code</Link>
        <Link to="/" className="dl-btn dl-btn--ghost dl-btn--block dl-tostore">← Back to Utsav Ghar store</Link>
      </div>
    </div>
  );
}

function SetPassword({ dealer, onDone }) {
  const [f, setF] = useState({ current: '', next: '' });
  const [err, setErr] = useState('');
  const submit = async (e) => {
    e.preventDefault(); setErr('');
    try { await api.put('/dealer/me/password', f); onDone(); } catch (x) { setErr(x.fields?.next || x.fields?.current || x.message); }
  };
  return (
    <div className="dl-auth">
      <form className="dl-auth__card" onSubmit={submit}>
        <h1>Set your password</h1>
        <p className="dl-muted">Namaste {dealer.name}! For safety, replace the one-time password you received with your own.</p>
        <label className="dl-field"><span>One-time password</span><input type="password" value={f.current} onChange={(e) => setF({ ...f, current: e.target.value })} required /></label>
        <label className="dl-field"><span>New password (8+ characters)</span><input type="password" autoComplete="new-password" value={f.next} onChange={(e) => setF({ ...f, next: e.target.value })} required /></label>
        <Strength value={f.next} />
        {err && <p className="dl-err" role="alert">{err}</p>}
        <button className="dl-btn dl-btn--primary dl-btn--block">Save password</button>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------- list
const TABS = [['new', 'New'], ['active', 'In progress'], ['done', 'Done']];

function useSummary(onNew) {
  const [s, setS] = useState(null);
  const last = useRef(null);
  const load = useCallback(() => api.get('/dealer/summary').then((x) => {
    if (last.current != null && x.new > last.current) onNew?.(x.new - last.current);
    last.current = x.new; setS(x);
  }).catch(() => {}), [onNew]);
  useEffect(() => { load(); const t = setInterval(() => { if (!document.hidden) load(); }, 30000); return () => clearInterval(t); }, [load]);
  return [s, load];
}

function OrderCard({ o, acceptMin }) {
  const st = DEALER_STATUS[o.status] || {};
  const late = o.status === 'sent' && Date.now() - Date.parse(o.sent_at) > acceptMin * 6e4;
  return (
    <Link to={`/dealer/orders/${o.order_number}`} className={`dl-card ${o.status === 'sent' ? 'dl-card--new' : ''}`}>
      <div className="dl-card__top">
        <b>#{o.order_number}</b>
        <span className={`dl-pill dl-pill--${st.tone}`}>{st.icon} {st.short}</span>
      </div>
      <p className="dl-card__items">{o.first_item}{o.lines > 1 ? ` + ${o.lines - 1} more` : ''}</p>
      <p className="dl-muted dl-small">{o.items_count} item{o.items_count === 1 ? '' : 's'} · 📍 {o.city} {o.pincode} · {ago(o.status === 'delivered' ? o.delivered_at : o.sent_at)}</p>
      {late && <p className="dl-late">⏰ Waiting for you — please accept or reject</p>}
      {o.order_cancelled && <p className="dl-late">✖️ Cancelled by the store — do not ship</p>}
    </Link>
  );
}

function OrderList({ dealer, summary, reload }) {
  const [tab, setTab] = useState('new');
  const [items, setItems] = useState(null);
  const load = useCallback(() => api.get(`/dealer/orders?tab=${tab}`).then((r) => setItems(r.items)).catch(() => setItems([])), [tab]);
  useEffect(() => { setItems(null); load(); }, [load]);
  useEffect(() => { load(); }, [summary?.new, summary?.active]); // eslint-disable-line react-hooks/exhaustive-deps
  const counts = { new: summary?.new, active: summary?.active };
  return (
    <>
      <h1 className="sr-only">Orders</h1>
      <section className="dl-stats">
        <div><b>{summary?.new ?? '–'}</b><span>New</span></div>
        <div><b>{summary?.active ?? '–'}</b><span>In progress</span></div>
        <div><b>{summary?.delivered_today ?? '–'}</b><span>Delivered today</span></div>
      </section>
      <nav className="dl-tabs" role="tablist">
        {TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'is-on' : ''} onClick={() => setTab(k)}>{l}{counts[k] ? <em>{counts[k]}</em> : null}</button>)}
      </nav>
      <div className="dl-list">
        {!items ? <Spinner /> : items.length === 0 ? (
          <div className="dl-empty"><span aria-hidden="true">{tab === 'new' ? '📭' : tab === 'active' ? '📦' : '✅'}</span><p>{tab === 'new' ? 'No new orders right now. We will alert you when one arrives.' : tab === 'active' ? 'Nothing to pack right now.' : 'Delivered orders will show here.'}</p></div>
        ) : items.map((o) => <OrderCard key={o.order_number} o={o} acceptMin={summary?.accept_minutes || 120} />)}
      </div>
      <button className="dl-refresh" type="button" onClick={() => { reload(); load(); }}>↻ Refresh</button>
      <p className="dl-muted dl-small dl-center">{dealer.business_name} · {dealer.city}</p>
    </>
  );
}

// ---------------------------------------------------------------- order
function Steps({ status }) {
  const i = DEALER_FLOW.indexOf(status);
  return (
    <ol className="dl-steps" aria-label="Order progress">
      {DEALER_FLOW.map((k, n) => <li key={k} className={n < i ? 'done' : n === i ? 'now' : ''}><span aria-hidden="true">{DEALER_STATUS[k].icon}</span><small>{DEALER_STATUS[k].short}</small></li>)}
    </ol>
  );
}

function PackingSlip({ o }) {
  return (
    <div className="dl-slip" aria-hidden="true">
      <h2>Utsav Ghar · Order #{o.order_number}</h2>
      <p><b>Deliver to:</b> {o.customer.name}, {o.customer.phone}<br />{o.customer.address.line1}{o.customer.address.line2 ? `, ${o.customer.address.line2}` : ''}, {o.customer.address.city}, {o.customer.address.state} {o.customer.address.pincode}</p>
      <table><thead><tr><th>Item</th><th>Qty</th><th>✓</th></tr></thead><tbody>{o.items.map((i) => <tr key={i.id}><td>{i.name}</td><td>{i.qty}</td><td>☐</td></tr>)}</tbody></table>
      <p>Prepaid order — do not collect cash. Handle with care.</p>
    </div>
  );
}

function OrderPage({ reasons }) {
  const { number } = useParams();
  const nav = useNavigate();
  const [o, setO] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [checked, setChecked] = useState([]);
  const [reject, setReject] = useState(null);
  const [disp, setDisp] = useState({ mode: 'self', rider_name: '', rider_phone: '', courier_name: '', awb: '', tracking_url: '' });
  const [otp, setOtp] = useState('');
  const [fe, setFe] = useState({});
  const load = useCallback(() => api.get(`/dealer/orders/${number}`).then((x) => { setO(x); setChecked(x.packed_items || []); }).catch((x) => setErr(x.message)), [number]);
  useEffect(() => { load(); }, [load]);
  useSeo({ title: `Order #${number} · Dealer` });
  if (err && !o) return <div className="dl-page"><p className="dl-err">{err}</p><Link className="dl-btn" to="/dealer/orders">← Back</Link></div>;
  if (!o) return <Spinner />;
  const act = async (action, body = {}) => {
    setBusy(true); setErr(''); setFe({});
    try { const x = await api.post(`/dealer/orders/${number}/${action}`, body); setO(x); setChecked(x.packed_items || checked); setReject(null); if (action === 'reject') nav('/dealer/orders'); }
    catch (x) { setErr(x.message); setFe(x.fields || {}); } finally { setBusy(false); }
  };
  const toggle = (id) => setChecked((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));
  const allTicked = o.items.every((i) => checked.includes(i.id));
  const st = DEALER_STATUS[o.status] || {};
  const c = o.customer;
  const mapUrl = c.revealed ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([c.address.line1, c.address.line2, c.address.city, c.address.pincode].filter(Boolean).join(', '))}` : null;

  return (
    <div className="dl-page">
      <div className="dl-head">
        <Link to="/dealer/orders" className="dl-back" aria-label="Back to orders">←</Link>
        <div><h1>#{o.order_number}</h1><p className="dl-muted dl-small">Received {time(o.sent_at)}{o.deliver_by ? ` · deliver by ${new Date(o.deliver_by).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : ''}</p></div>
        <span className={`dl-pill dl-pill--${st.tone}`}>{st.icon} {st.label}</span>
      </div>
      {DEALER_FLOW.includes(o.status) && <Steps status={o.status} />}
      {o.note && <p className="dl-alert">{o.note}</p>}
      {o.status === 'rejected' && <p className="dl-alert">You rejected this order ({o.reject_reason}). It has gone to another dealer.</p>}
      {o.returns?.length > 0 && o.returns.map((r) => <p key={r.number} className="dl-alert">↩️ Return {r.number} ({r.status === 'requested' ? 'requested by the customer' : r.status === 'approved' ? 'approved — our team will arrange the pickup' : r.status === 'received' ? 'received back' : 'refunded'}): {r.items.map((i) => `${i.qty} × ${i.name}`).join(', ')}</p>)}

      <section className="dl-box">
        <h2>📦 Items to pack <span className="dl-muted">({o.items_count})</span></h2>
        <ul className="dl-items">
          {o.items.map((i) => (
            <li key={i.id}>
              {o.status === 'accepted' ? (
                <label className="dl-check"><input type="checkbox" checked={checked.includes(i.id)} onChange={() => toggle(i.id)} /><span className="dl-check__box" aria-hidden="true" /></label>
              ) : <span className="dl-itemicon" aria-hidden="true">{['packed', 'ready', 'out_for_delivery', 'delivered'].includes(o.status) ? '✅' : '•'}</span>}
              <div><b>{i.name}</b><small className="dl-muted">{[i.category, i.material, i.size].filter(Boolean).join(' · ')}</small></div>
              <span className="dl-qty">× {i.qty}</span>
            </li>
          ))}
        </ul>
        {o.status === 'accepted' && <p className="dl-muted dl-small">Tick each item as you put it in the box.</p>}
        {fe.checked && <p className="dl-err">{fe.checked}</p>}
      </section>

      <section className="dl-box">
        <h2>🏠 Deliver to</h2>
        <p><b>{c.name}</b></p>
        {c.revealed ? (
          <>
            <p>{c.address.line1}{c.address.line2 ? `, ${c.address.line2}` : ''}<br />{c.address.city}, {c.address.state} – {c.address.pincode}</p>
            <div className="dl-row">
              {c.phone && <a className="dl-btn" href={`tel:+91${c.phone}`}>📞 Call {c.phone}</a>}
              <a className="dl-btn" href={mapUrl} target="_blank" rel="noreferrer">🗺️ Map</a>
            </div>
          </>
        ) : <p className="dl-muted">📍 {c.address.city}, {c.address.state} – {c.address.pincode}<br />Full address and phone appear after you accept.</p>}
        <p className="dl-tag">💳 Prepaid — do not collect cash</p>
      </section>

      {o.delivery && (
        <section className="dl-box">
          <h2>🚚 Delivery</h2>
          {o.delivery.mode === 'self' ? <p>Own delivery: <b>{o.delivery.rider_name}</b> ({o.delivery.rider_phone})</p>
            : <p>Courier: <b>{o.delivery.courier_name}</b> · AWB {o.delivery.awb}{o.delivery.tracking_url && <> · <a className="dl-link" href={o.delivery.tracking_url} target="_blank" rel="noreferrer">track</a></>}</p>}
          {o.delivery.tracking?.length > 0 && (
            <ul className="dl-cp">{[...o.delivery.tracking].reverse().map((t, i) => <li key={i}><span aria-hidden="true">{COURIER_UPDATES[t.status]?.icon}</span><div><b>{t.label}</b>{t.location ? ` · ${t.location}` : ''}<small className="dl-muted">{time(t.at)}</small></div></li>)}</ul>
          )}
          {o.delivery.received_by && <p className="dl-small">Received by <b>{o.delivery.received_by}</b></p>}
        </section>
      )}

      {/* ---- actions ---- */}
      {err && <p className="dl-err" role="alert">{err}</p>}
      <div className="dl-actions">
        {o.status === 'sent' && !reject && (
          <>
            <button className="dl-btn dl-btn--primary dl-btn--big" disabled={busy} onClick={() => act('accept')}>👍 Accept order</button>
            <button className="dl-btn dl-btn--ghost" disabled={busy} onClick={() => setReject(reasons[0])}>Can't fulfil</button>
          </>
        )}
        {reject !== null && (
          <div className="dl-box dl-reject">
            <h2>Why can't you take this order?</h2>
            {reasons.map((r) => <label key={r} className="dl-radio"><input type="radio" name="rr" checked={reject === r} onChange={() => setReject(r)} /> {r}</label>)}
            <div className="dl-row"><button className="dl-btn dl-btn--danger" disabled={busy} onClick={() => act('reject', { reason: reject })}>Reject order</button><button className="dl-btn dl-btn--ghost" onClick={() => setReject(null)}>Keep it</button></div>
          </div>
        )}
        {o.status === 'accepted' && !reject && (
          <>
            <button className="dl-btn dl-btn--primary dl-btn--big" disabled={busy || !allTicked} onClick={() => act('pack', { checked })}>{allTicked ? '📦 Mark as packed' : `Tick all items (${checked.length}/${o.items.length})`}</button>
            <button className="dl-btn dl-btn--ghost" onClick={() => setReject(reasons[0])}>Can't fulfil</button>
          </>
        )}
        {o.status === 'packed' && (
          <>
            <button className="dl-btn dl-btn--primary dl-btn--big" disabled={busy} onClick={() => act('ready')}>🏷️ Ready for delivery</button>
            <button className="dl-btn" onClick={() => window.print()}>🖨️ Print packing slip</button>
          </>
        )}
        {o.status === 'ready' && (
          <div className="dl-box">
            <h2>Hand over for delivery</h2>
            <div className="dl-seg" role="radiogroup" aria-label="Delivery by">
              <button type="button" role="radio" aria-checked={disp.mode === 'self'} className={disp.mode === 'self' ? 'is-on' : ''} onClick={() => setDisp({ ...disp, mode: 'self' })}>🛵 Our delivery person</button>
              <button type="button" role="radio" aria-checked={disp.mode === 'courier'} className={disp.mode === 'courier' ? 'is-on' : ''} onClick={() => setDisp({ ...disp, mode: 'courier' })}>📮 Courier</button>
            </div>
            {disp.mode === 'self' ? (
              <>
                <label className="dl-field"><span>Delivery person's name</span><input value={disp.rider_name} onChange={(e) => setDisp({ ...disp, rider_name: e.target.value })} />{fe.rider_name && <em className="dl-err">{fe.rider_name}</em>}</label>
                <label className="dl-field"><span>Their mobile number</span><input inputMode="numeric" value={disp.rider_phone} onChange={(e) => setDisp({ ...disp, rider_phone: e.target.value })} />{fe.rider_phone && <em className="dl-err">{fe.rider_phone}</em>}</label>
                <p className="dl-muted dl-small">The customer gets a 4-digit code. Your delivery person must ask for it when handing over the parcel.</p>
              </>
            ) : (
              <>
                <label className="dl-field"><span>Courier company</span><input list="dl-couriers" value={disp.courier_name} onChange={(e) => setDisp({ ...disp, courier_name: e.target.value })} />{fe.courier_name && <em className="dl-err">{fe.courier_name}</em>}</label>
                <datalist id="dl-couriers">{['Delhivery', 'Blue Dart', 'DTDC', 'Ekart', 'Xpressbees', 'Shadowfax', 'India Post'].map((x) => <option key={x} value={x} />)}</datalist>
                <label className="dl-field"><span>AWB / tracking number</span><input value={disp.awb} onChange={(e) => setDisp({ ...disp, awb: e.target.value })} />{fe.awb && <em className="dl-err">{fe.awb}</em>}</label>
                <label className="dl-field"><span>Tracking link (optional)</span><input inputMode="url" placeholder="https://" value={disp.tracking_url} onChange={(e) => setDisp({ ...disp, tracking_url: e.target.value })} />{fe.tracking_url && <em className="dl-err">{fe.tracking_url}</em>}</label>
              </>
            )}
            <button className="dl-btn dl-btn--primary dl-btn--big" disabled={busy} onClick={() => act('dispatch', disp)}>{disp.mode === 'self' ? '🛵 Send out for delivery' : '📮 Handed to courier'}</button>
          </div>
        )}
        {o.status === 'out_for_delivery' && (
          o.otp_needed ? (
            <form className="dl-box" onSubmit={(e) => { e.preventDefault(); act('deliver', { otp }); }}>
              <h2>Confirm delivery</h2>
              <label className="dl-field"><span>Customer's 4-digit delivery code</span><input className="dl-otp" inputMode="numeric" maxLength={4} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} autoComplete="one-time-code" /></label>
              <button className="dl-btn dl-btn--primary dl-btn--big" disabled={busy || otp.length !== 4}>✅ Delivered</button>
            </form>
          ) : <CourierUpdate busy={busy} onSend={(b) => act('track', b)} />
        )}
        {o.status === 'delivered' && <p className="dl-done">✅ Delivered {time(o.delivered_at)}. Thank you!</p>}
      </div>
      {c.revealed && <PackingSlip o={o} />}
    </div>
  );
}

function CourierUpdate({ busy, onSend }) {
  const [f, setF] = useState({ status: 'in_transit', location: '', received_by: '' });
  return (
    <form className="dl-box" onSubmit={(e) => { e.preventDefault(); onSend(f); setF({ ...f, location: '' }); }}>
      <h2>Courier update</h2>
      <p className="dl-muted dl-small">Copy the latest status from the courier's tracking page.</p>
      <div className="dl-chips" role="radiogroup" aria-label="Courier status">
        {['in_transit', 'out_for_delivery', 'attempt_failed', 'delivered'].map((k) => (
          <button key={k} type="button" role="radio" aria-checked={f.status === k} className={f.status === k ? 'is-on' : ''} onClick={() => setF({ ...f, status: k })}>{COURIER_UPDATES[k].icon} {k === 'attempt_failed' ? 'Attempt failed' : COURIER_UPDATES[k].label}</button>
        ))}
      </div>
      <label className="dl-field"><span>Location (optional)</span><input value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} placeholder="e.g. Pune hub" /></label>
      {f.status === 'delivered' && <label className="dl-field"><span>Received by (optional)</span><input value={f.received_by} onChange={(e) => setF({ ...f, received_by: e.target.value })} /></label>}
      <button className="dl-btn dl-btn--primary dl-btn--big" disabled={busy}>{f.status === 'delivered' ? '✅ Mark delivered' : 'Save update'}</button>
    </form>
  );
}

// ---------------------------------------------------------------- shell
export default function DealerApp() {
  const [dealer, setDealer] = useState(undefined);
  const [reasons, setReasons] = useState(REJECT_REASONS);
  const [alert, setAlert] = useState(0);
  const nav = useNavigate();
  useSeo({ title: 'Dealer app · Utsav Ghar' });
  useEffect(() => { api.get('/dealer/me?soft=1').then((r) => { setDealer(r.dealer); setReasons(r.reasons || REJECT_REASONS); }).catch(() => setDealer(null)); }, []);
  const onNew = useCallback((n) => {
    beep(); setAlert(n);
    try { if (Notification?.permission === 'granted') new Notification('New Utsav Ghar order', { body: `${n} new order${n > 1 ? 's' : ''} waiting for you` }); } catch { /* */ }
  }, []);
  useEffect(() => { const base = 'Dealer app · Utsav Ghar'; document.title = alert ? `(${alert}) New order! · ${base}` : base; }, [alert]);
  if (dealer === undefined) return <div className="dl-shell"><Spinner /></div>;
  if (!dealer) return <div className="dl-shell"><Routes><Route path="register" element={<DealerRegister onIn={setDealer} />} /><Route path="forgot" element={<DealerForgot />} /><Route path="manual" element={<UserManual kind="dealer" variant="dealer" />} /><Route path="*" element={<Login onIn={setDealer} />} /></Routes></div>;
  if (dealer.must_change_password) return <div className="dl-shell"><SetPassword dealer={dealer} onDone={() => setDealer({ ...dealer, must_change_password: false })} /></div>;
  const onOut = async () => { await api.post('/dealer/logout').catch(() => {}); setDealer(null); nav('/dealer'); };
  const refresh = () => api.get('/dealer/me').then((r) => setDealer(r.dealer)).catch(() => {});
  // not yet allowed to trade (new dealer, or a new agreement to sign): onboarding only
  if (!dealer.can_receive_orders) return <OnboardingShell dealer={dealer} onOut={onOut} refresh={refresh} />;
  return <Signed dealer={dealer} reasons={reasons} onNew={onNew} alert={alert} clearAlert={() => setAlert(0)} onOut={onOut} refresh={refresh} />;
}

function OnboardingShell({ dealer, onOut, refresh }) {
  return (
    <div className="dl-shell">
      <header className="dl-top">
        <Link to="/dealer" className="dl-brand"><LogoMark /><div><b>{dealer.business_name}</b><small>Dealer onboarding</small></div></Link>
        <div className="dl-topr"><Link to="/" className="dl-store" title="Go to the Utsav Ghar store">🏪<span>Store</span></Link></div>
      </header>
      <nav className="dl-nav dl-nav--3" aria-label="Dealer app">
        <NavLink to="/dealer" end>📝 <span>Onboarding</span></NavLink>
        <NavLink to="/dealer/legal">📜 <span>Agreements</span></NavLink>
        <NavLink to="/dealer/profile">👤 <span>Profile</span></NavLink>
      </nav>
      <main className="dl-main">
        <Routes>
          <Route index element={<Onboarding onChanged={refresh} />} />
          <Route path="onboarding" element={<Onboarding onChanged={refresh} />} />
          <Route path="legal" element={<MyAgreements />} />
          <Route path="manual" element={<UserManual kind="dealer" variant="dealer" />} />
          <Route path="profile" element={<Profile onOut={onOut} />} />
          <Route path="*" element={<Onboarding onChanged={refresh} />} />
        </Routes>
      </main>
    </div>
  );
}

function Signed({ dealer, reasons, onNew, alert, clearAlert, onOut, refresh }) {
  const [summary, reload] = useSummary(onNew);
  const [unread, reloadUnread, setUnread] = useUnread();
  const [perm, setPerm] = useState(() => { try { return Notification.permission; } catch { return 'unsupported'; } });
  useEffect(() => { if (alert) reloadUnread(); }, [alert]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="dl-shell">
      <header className="dl-top">
        <Link to="/dealer" className="dl-brand" onClick={clearAlert}><LogoMark /><div><b>{dealer.business_name}</b><small>Utsav Ghar dealer</small></div></Link>
        <div className="dl-topr">
        <Link to="/" className="dl-store" title="Go to the Utsav Ghar store">🏪<span>Store</span></Link>
        <Link to="/dealer/alerts" className="dl-bell" aria-label={`Notifications${unread ? `, ${unread} new` : ''}`}>🔔{unread ? <em>{unread > 9 ? '9+' : unread}</em> : null}</Link>
        </div>
      </header>
      {alert > 0 && <Link to="/dealer/orders" className="dl-banner" onClick={clearAlert}>🔔 {alert} new order{alert > 1 ? 's' : ''} arrived — tap to open</Link>}
      <OnboardingBanner dealer={dealer} />
      {perm === 'default' && <button className="dl-banner dl-banner--soft" onClick={() => Notification.requestPermission().then(setPerm)}>🔔 Turn on alerts for new orders</button>}
      <nav className="dl-nav dl-nav--4" aria-label="Dealer app">
        <NavLink to="/dealer" end>📊 <span>Dashboard</span></NavLink>
        <NavLink to="/dealer/orders">📦 <span>Orders</span>{summary?.new ? <em>{summary.new}</em> : null}</NavLink>
        <NavLink to="/dealer/products">🛍️ <span>Products</span></NavLink>
        <NavLink to="/dealer/profile">👤 <span>Profile</span></NavLink>
      </nav>
      <main className="dl-main">
        <Routes>
          <Route index element={<Dashboard dealer={dealer} />} />
          <Route path="orders" element={<OrderList dealer={dealer} summary={summary} reload={reload} />} />
          <Route path="orders/:number" element={<OrderPage reasons={reasons} />} />
          <Route path="products" element={<ProductList />} />
          <Route path="products/new" element={<ProductForm />} />
          <Route path="products/:id" element={<ProductForm />} />
          <Route path="alerts" element={<Notifications onSeen={() => setUnread(0)} />} />
          <Route path="profile" element={<Profile onOut={onOut} />} />
          <Route path="onboarding" element={<Onboarding onChanged={refresh} />} />
          <Route path="legal" element={<MyAgreements />} />
          <Route path="manual" element={<UserManual kind="dealer" variant="dealer" />} />
          <Route path="payments" element={<DealerPaymentsPage />} />
        </Routes>
      </main>
    </div>
  );
}
