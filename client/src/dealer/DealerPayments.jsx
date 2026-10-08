/** Dealer app: Payments & settlement, and Forgot password. */
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { Spinner } from '../components/ui.jsx';
import { LogoMark } from '../components/Icons.jsx';
import { SETTLEMENT_STATUS } from '@shared/settlement.js';

const rs = (p) => `₹${(Number(p || 0) / 100).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const day = (s) => (s ? new Date(s).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

export function DealerPaymentsPage() {
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  const [open, setOpen] = useState(null);
  useEffect(() => { api.get('/dealer/payments').then(setD).catch((e) => setErr(e.message)); }, []);
  if (err) return <p className="dl-err">{err}</p>;
  if (!d) return <Spinner />;
  const t = d.totals;
  return (
    <div className="dl-page">
      <h1 className="dl-h1">Payments &amp; settlement</h1>
      <p className="dl-muted dl-small">{d.model === 'supply' ? 'You are paid your dealer price × the quantity delivered. No commission.' : 'Sales value less commission and fees, as in your Commercial Schedule.'} Settlement within {d.settlement_days} days after delivery, less any returns. {d.bank ? <>Paid to <b>{d.bank}</b>.</> : <b>Add your bank account in KYC to get paid.</b>}</p>
      <section className="dl-box dl-pay-due">
        <h2>Due to you now</h2>
        <div className="dl-pay-net"><span>Next settlement (estimate)</span><b>{rs(Math.max(0, d.due.net))}</b><small>{d.due.orders} delivered order{d.due.orders === 1 ? '' : 's'} not yet settled{d.due.returns ? ` · returns −${rs(d.due.returns)}` : ''}</small></div>
        {d.due.net < 0 && <p className="dl-note">Returns are more than new sales right now. The difference is adjusted in your next settlement — nothing is taken from your bank.</p>}
        {d.due.items.length > 0 && (
          <details><summary>See orders ({d.due.items.length})</summary>
            <ul className="dl-paylist">{d.due.items.map((x, i) => <li key={i}><span>{x.kind === 'return' ? '↩️ ' : '📦 '}{x.label}{x.at ? <small> · delivered {day(x.at)}</small> : null}</span><b className={x.amount < 0 ? 'neg' : ''}>{x.amount < 0 ? `−${rs(-x.amount)}` : rs(x.amount)}</b></li>)}</ul>
          </details>
        )}
      </section>
      <div className="dl-kpis">
        <div><span>Total paid</span><b>{rs(t.paid)}</b></div>
        <div><span>Processing</span><b>{rs(t.processing)}</b></div>
        <div><span>Total sales (paid)</span><b>{rs(t.gross)}</b></div>
        <div><span>Returns deducted</span><b className="neg">−{rs(t.returns)}</b></div>
        <div><span>Fees</span><b className="neg">−{rs(t.fees)}</b></div>
        <div><span>Adjustments</span><b>{t.adjustments < 0 ? `−${rs(-t.adjustments)}` : rs(t.adjustments)}</b></div>
      </div>
      <section className="dl-box">
        <h2>Settlements</h2>
        {d.settlements.length === 0 ? <p className="dl-muted">No settlements yet. Your first one is made after your first delivered orders.</p> : (
          <ul className="dl-setl">
            {d.settlements.map((s) => (
              <li key={s.id}>
                <button type="button" className="dl-setl__row" onClick={() => setOpen(open === s.id ? null : s.id)} aria-expanded={open === s.id}>
                  <span><b>{s.number}</b><small>{day(s.created_at)} · {s.orders} order{s.orders === 1 ? '' : 's'}</small></span>
                  <span className="dl-setl__amt"><b>{rs(s.net)}</b><em className={`dl-pill dl-pill--${SETTLEMENT_STATUS[s.status]?.tone}`}>{SETTLEMENT_STATUS[s.status]?.label}</em></span>
                </button>
                {open === s.id && (
                  <div className="dl-setl__det">
                    <dl>
                      <div><dt>Total sales</dt><dd>{rs(s.gross)}</dd></div>
                      {s.returns > 0 && <div><dt>Returns</dt><dd>−{rs(s.returns)}</dd></div>}
                      {s.commission > 0 && <div><dt>Commission</dt><dd>−{rs(s.commission)}</dd></div>}
                      {s.platform_fees > 0 && <div><dt>Platform fees</dt><dd>−{rs(s.platform_fees)}</dd></div>}
                      {s.payment_fees > 0 && <div><dt>Payment fees</dt><dd>−{rs(s.payment_fees)}</dd></div>}
                      {s.adjustments.map((a, i) => <div key={i}><dt>{a.label}</dt><dd>{a.amount < 0 ? `−${rs(-a.amount)}` : rs(a.amount)}</dd></div>)}
                      <div className="dl-setl__net"><dt>Net settlement</dt><dd>{rs(s.net)}</dd></div>
                    </dl>
                    <p className="dl-small dl-muted">{SETTLEMENT_STATUS[s.status]?.help}{s.utr ? ` UTR ${s.utr} · paid ${day(s.paid_on)}.` : ''}</p>
                    <details><summary>Orders in this settlement</summary><ul className="dl-paylist">{s.items.map((x, i) => <li key={i}><span>{x.label}</span><b className={x.amount < 0 ? 'neg' : ''}>{x.amount < 0 ? `−${rs(-x.amount)}` : rs(x.amount)}</b></li>)}</ul></details>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** Signed-out: reset password with a code sent to the registered mobile. */
export function DealerForgot() {
  const nav = useNavigate();
  const [f, setF] = useState({ phone: '', otp: '', password: '', confirm_password: '' });
  const [st, setSt] = useState({});
  const [left, setLeft] = useState(0);
  useEffect(() => { if (left <= 0) return undefined; const t = setTimeout(() => setLeft(left - 1), 1000); return () => clearTimeout(t); }, [left]);
  const send = async () => {
    setSt({ ...st, sending: true, err: '' });
    try { const r = await api.post('/dealer/password/forgot', { phone: f.phone }); setSt({ sent: r }); setLeft(r.resend_in || 30); }
    catch (e) { setSt({ err: e.message }); }
  };
  const submit = async (e) => {
    e.preventDefault(); setSt({ ...st, busy: true, err: '' });
    try { await api.post('/dealer/password/reset', f); setSt({ done: true }); setTimeout(() => nav('/dealer'), 1800); }
    catch (x) { setSt({ ...st, busy: false, err: x.message, fields: x.fields }); }
  };
  const fe = st.fields || {};
  return (
    <div className="dl-auth">
      <div className="dl-auth__card">
        <div className="dl-brand"><LogoMark /><div><b>Utsav Ghar</b><small>Dealer app</small></div></div>
        <h1>Reset password</h1>
        <p className="dl-muted">We send a 6-digit code to your registered mobile number.</p>
        <form onSubmit={submit} noValidate>
          <label className="dl-field"><span>Mobile number</span><input inputMode="numeric" autoComplete="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="98xxxxxxxx" /></label>
          <button type="button" className="dl-btn dl-btn--block" disabled={st.sending || left > 0 || f.phone.replace(/\D/g, '').length < 10} onClick={send}>{left > 0 ? `Resend code in ${left}s` : st.sent ? 'Resend code' : 'Send code'}</button>
          {st.sent && <p className="dl-small dl-muted" role="status">{st.sent.message}{st.sent.dev_otp ? <> Test mode code: <b>{st.sent.dev_otp}</b></> : null}</p>}
          <label className="dl-field"><span>6-digit code</span><input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={f.otp} onChange={(e) => setF({ ...f, otp: e.target.value.replace(/\D/g, '') })} />{fe.otp && <em className="dl-err">{fe.otp}</em>}</label>
          <label className="dl-field"><span>New password</span><input type="password" autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />{fe.password && <em className="dl-err">{fe.password}</em>}</label>
          <label className="dl-field"><span>Confirm new password</span><input type="password" autoComplete="new-password" value={f.confirm_password} onChange={(e) => setF({ ...f, confirm_password: e.target.value })} />{fe.confirm_password && <em className="dl-err">{fe.confirm_password}</em>}</label>
          {st.err && <p className="dl-err" role="alert">{st.err}</p>}
          {st.done && <p className="dl-note dl-note--ok" role="status">✅ Password changed. Sign in with your new password.</p>}
          <button className="dl-btn dl-btn--primary dl-btn--block" disabled={st.busy || st.done || f.otp.length !== 6 || f.password.length < 8 || f.password !== f.confirm_password}>Set new password</button>
        </form>
        <Link to="/dealer" className="dl-btn dl-btn--ghost dl-btn--block">← Back to sign in</Link>
      </div>
    </div>
  );
}
