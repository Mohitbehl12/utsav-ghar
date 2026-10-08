import { useEffect, useState } from 'react';
import { Link, NavLink, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { rupees, fmtDate, PAYMENT_LABEL, STATUS_LABEL, tone } from '../lib/format.js';
import { useAuth, useWishlist, useStore } from '../state/store.jsx';
import { Field, Pill, Empty, Spinner, useSeo, Media } from '../components/ui.jsx';
import { ProductGrid } from '../components/ProductCard.jsx';
import { LogoutIcon, TrashIcon } from '../components/Icons.jsx';
import { STATES } from './Checkout.jsx';
import { Timeline } from './Order.jsx';
import { openSubscribe, subscription } from '../components/Subscribe.jsx';
import { passwordProblem } from '@shared/security.js';
import { Strength } from '../components/ui.jsx';
import { CustomerAgreementPanel, useCustomerLegal, MyLegalDocuments, TermsUpdate } from '../components/Legal.jsx';
import { stateForPin } from '@shared/pincode.js';

const TABS = [['', 'My Profile'], ['orders', 'My Orders'], ['wishlist', 'Wishlist'], ['addresses', 'Addresses'], ['payments', 'Payment History'], ['offers', 'Offers'], ['requests', 'Help requests'], ['legal', 'Legal Documents'], ['security', 'Login & Security']];

const COUNTRIES = ['India', 'United Arab Emirates', 'United States', 'United Kingdom', 'Canada', 'Australia', 'Singapore', 'Saudi Arabia', 'Qatar', 'Oman', 'Kuwait', 'Bahrain', 'Nepal', 'New Zealand', 'Germany', 'Other'];
const blankReg = { name: '', email: '', phone: '', password: '', confirm_password: '', address: '', city: '', state: '', pincode: '', country: 'India', dob: '', marketingOptIn: false };

/** "Send code" + 6-digit box with a resend countdown. `send` returns the API answer. */
export function OtpBox({ id = 'otp', value, onChange, send, canSend = true, error, label = 'Verification code *', hint }) {
  const [st, setSt] = useState({});
  const [left, setLeft] = useState(0);
  useEffect(() => { if (left <= 0) return undefined; const t = setTimeout(() => setLeft(left - 1), 1000); return () => clearTimeout(t); }, [left]);
  const go = async () => {
    setSt({ busy: true });
    try { const r = await send(); setSt({ sent: r }); setLeft(r.resend_in || 30); }
    catch (e) { setSt({ err: e.message }); if (e.data?.retry_after) setLeft(e.data.retry_after); }
  };
  return (
    <div className="otp">
      <div className="otp__row">
        <Field label={label} id={id} error={error || st.err} hint={hint || (st.sent ? `Code sent${st.sent.sent_to ? ` to ${st.sent.sent_to}` : ''}. Valid for ${st.sent.expires_in_min || 10} minutes.` : 'We send a 6-digit code to check it is really you.')}>
          <input id={id} inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="6-digit code" value={value} onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))} />
        </Field>
        <button type="button" className="btn btn--ghost otp__send" onClick={go} disabled={!canSend || st.busy || left > 0}>{st.busy ? 'Sending…' : left > 0 ? `Resend in ${left}s` : st.sent ? 'Resend code' : 'Send code'}</button>
      </div>
      {st.sent?.dev_otp && <p className="small muted otp__dev">Test mode — your code is <b>{st.sent.dev_otp}</b> (real customers get it by WhatsApp/SMS and email).</p>}
    </div>
  );
}

export function AuthPage({ mode = 'login' }) {
  const { login, register, user } = useAuth();
  const { settings } = useStore();
  const needOtp = mode === 'register' && settings?.signup_otp !== false;
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const [f, setF] = useState(mode === 'login' ? { email: sp.get('email') || '', password: '' } : blankReg);
  const [consents, setConsents] = useState({});
  const [state, setState] = useState({});
  const legal = useCustomerLegal();
  useSeo({ title: mode === 'login' ? 'Sign in | Utsav Ghar' : 'Create account | Utsav Ghar' });
  if (user) return <Navigate to={sp.get('next') || '/account'} replace />;
  const upd = (k) => (e) => {
    const v = e.target.value; const next = { ...f, [k]: v };
    if (k === 'pincode' && f.country === 'India' && /^\d{6}$/.test(v) && !f.state) next.state = stateForPin(v) || '';
    setF(next);
  };
  const india = f.country === 'India';
  const allTicked = !!legal?.consents?.length && legal.consents.every((c) => consents[c.key]);
  const submit = async (e) => {
    e.preventDefault();
    setState({ busy: true });
    try {
      mode === 'login' ? await login(f.email, f.password) : await register({ ...f, consents });
      nav(sp.get('next') || '/account', { replace: true });
    } catch (err) {
      setState({ err: err.message, fields: err.fields });
    }
  };
  const fe = state.fields || {};
  // the button stays disabled until every mandatory field and box is done
  const missing = mode !== 'register' ? [] : [
    f.name.trim().length < 2 && 'full name', !(india ? /^[6-9]\d{9}$/.test(f.phone.replace(/\D/g, '').slice(-10)) : f.phone.trim().length >= 7) && 'mobile number',
    !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email) && 'email', f.password.length < 8 && 'password', (!f.confirm_password || f.confirm_password !== f.password) && 'matching password',
    needOtp && !/^\d{6}$/.test(f.otp || '') && 'verification code',
    f.address.trim().length < 5 && 'address', !(india ? /^[1-9]\d{5}$/.test(f.pincode) : f.pincode.trim().length >= 2) && (india ? 'PIN code' : 'postal code'),
    f.city.trim().length < 2 && 'city', f.state.trim().length < 2 && 'state', !allTicked && 'all 4 boxes',
  ].filter(Boolean);
  const nfe = Object.keys(fe).filter((k) => !k.startsWith('consents.')).length;
  return (
    <div className={`container auth ${mode === 'register' ? 'auth--wide' : ''}`}>
      <form className="card form auth__card" onSubmit={submit} noValidate={mode === 'register'}>
        <h1>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h1>
        <p className="muted">{mode === 'login' ? 'Sign in to see your orders, wishlist and saved addresses.' : 'One account for orders, tracking, returns and your wishlist. All fields marked * are required.'}</p>
        {mode === 'register' && (
          <>
            <h2 className="auth__sec">1. Your details</h2>
            <Field label="Full name *" id="au-name" error={fe.name}><input id="au-name" autoComplete="name" value={f.name} onChange={upd('name')} required /></Field>
            <div className="auth__two">
              <Field label="Mobile number *" id="au-phone" error={fe.phone}><input id="au-phone" type="tel" inputMode="tel" autoComplete="tel" placeholder={india ? '98xxxxxxxx' : '+971 50 123 4567'} value={f.phone} onChange={upd('phone')} required /></Field>
              <Field label="Date of birth (optional)" id="au-dob" error={fe.dob} hint="For birthday offers. Not shared."><input id="au-dob" type="date" max={new Date().toISOString().slice(0, 10)} value={f.dob} onChange={upd('dob')} /></Field>
            </div>
          </>
        )}
        <Field label={mode === 'register' ? 'Email address *' : 'Email'} id="au-email" error={fe.email}><input id="au-email" type="email" autoComplete="email" value={f.email} onChange={upd('email')} required /></Field>
        {mode === 'register' ? (
          <div className="auth__two">
            <Field label="Password *" id="au-pw" error={fe.password} hint="8+ characters. Avoid your name, email or common words.">
              <input id="au-pw" type="password" autoComplete="new-password" value={f.password} onChange={upd('password')} required />
            </Field>
            <Field label="Confirm password *" id="au-pw2" error={fe.confirm_password || (f.confirm_password && f.confirm_password !== f.password ? 'Passwords do not match' : undefined)}>
              <input id="au-pw2" type="password" autoComplete="new-password" value={f.confirm_password} onChange={upd('confirm_password')} required />
            </Field>
          </div>
        ) : (
          <Field label="Password" id="au-pw" error={fe.password}><input id="au-pw" type="password" autoComplete="current-password" value={f.password} onChange={upd('password')} required /></Field>
        )}
        {mode === 'register' && <Strength value={f.password} />}
        {needOtp && (
          <OtpBox id="au-otp" value={f.otp || ''} onChange={(v) => setF({ ...f, otp: v })} error={fe.otp}
            canSend={/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email) && (india ? /^[6-9]\d{9}$/.test(f.phone.replace(/\D/g, '').slice(-10)) : f.phone.trim().length >= 7)}
            label="Mobile & email code *" send={() => api.post('/auth/register/otp', { email: f.email, phone: f.phone, country: f.country })} />
        )}
        {mode === 'login' && <p className="small right"><Link className="link" to={`/forgot-password${f.email ? `?email=${encodeURIComponent(f.email)}` : ''}`}>Forgot password?</Link></p>}
        {mode === 'register' && (
          <>
            <h2 className="auth__sec">2. Address</h2>
            <Field label="Country *" id="au-country" error={fe.country}><select id="au-country" value={f.country} onChange={(e) => setF({ ...f, country: e.target.value, state: '' })}>{COUNTRIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
            <Field label="House no., street, area *" id="au-addr" error={fe.address}><input id="au-addr" autoComplete="street-address" value={f.address} onChange={upd('address')} required /></Field>
            <div className="auth__three">
              <Field label={india ? 'PIN code *' : 'Postal / ZIP code *'} id="au-pin" error={fe.pincode}><input id="au-pin" inputMode={india ? 'numeric' : 'text'} maxLength={india ? 6 : 12} autoComplete="postal-code" value={f.pincode} onChange={upd('pincode')} required /></Field>
              <Field label="City *" id="au-city" error={fe.city}><input id="au-city" autoComplete="address-level2" value={f.city} onChange={upd('city')} required /></Field>
              <Field label="State *" id="au-state" error={fe.state}>{india ? <select id="au-state" value={f.state} onChange={upd('state')} required><option value="">Choose…</option>{STATES.map((x) => <option key={x}>{x}</option>)}</select> : <input id="au-state" autoComplete="address-level1" value={f.state} onChange={upd('state')} required />}</Field>
            </div>
            <h2 className="auth__sec">3. Read &amp; accept</h2>
            {legal ? <CustomerAgreementPanel legal={legal} value={consents} onChange={setConsents} errors={fe} /> : <Spinner />}
            <label className="check"><input type="checkbox" checked={f.marketingOptIn} onChange={(e) => setF({ ...f, marketingOptIn: e.target.checked })} /><span>Optional: send me weekly picks and festival alerts on WhatsApp &amp; email (stop any time)</span></label>
          </>
        )}
        <input className="hp" type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" value={f.website || ''} onChange={upd('website')} />
        {state.err && (!nfe || mode === 'login') && <p className="field__error" role="alert">{state.err}</p>}
        {mode === 'register' && nfe > 0 && <p className="field__error" role="alert">Please check the highlighted fields.</p>}
        <button className="btn btn--primary btn--lg btn--block" disabled={state.busy || (mode === 'register' && missing.length > 0)}>{mode === 'login' ? 'Sign in' : 'Accept & Create Account'}</button>
        {mode === 'register' && missing.length > 0 && <p className="lg-missing">Still needed: {missing.join(', ')}</p>}
        <p className="center small">
          {mode === 'login' ? <>New here? <Link className="link" to={`/register${sp.get('next') ? `?next=${sp.get('next')}` : ''}`}>Create an account</Link></> : <>Already registered? <Link className="link" to={`/login${sp.get('next') ? `?next=${sp.get('next')}` : ''}`}>Sign in</Link></>}
        </p>
      </form>
    </div>
  );
}

function Profile() {
  const { user, setUser } = useAuth();
  const [f, setF] = useState({ name: user.name, phone: user.phone || '' });
  const [state, setState] = useState({});
  const save = async (e) => {
    e.preventDefault();
    setState({ busy: true });
    try { setUser((await api.put('/account/profile', f)).user); setState({ ok: 'Profile saved.' }); }
    catch (err) { setState({ fields: err.fields, err: err.message }); }
  };
  return (
    <form className="card form" onSubmit={save}>
      <h2>My Profile</h2>
      <Field label="Name" id="pf-name" error={state.fields?.name}><input id="pf-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
      <Field label="Mobile" id="pf-phone" error={state.fields?.phone}><input id="pf-phone" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
      <Field label="Email" id="pf-email" hint="Your sign-in email. Change it below."><input id="pf-email" value={user.email} disabled /></Field>
      <button className="btn btn--primary" disabled={state.busy}>Save changes</button>
      {state.ok && <p className="ok small" role="status">{state.ok}</p>}
      {state.err && !Object.keys(state.fields || {}).length && <p className="field__error" role="alert">{state.err}</p>}
      <ChangeEmail />
    </form>
  );
}

function ChangeEmail() {
  const { user, setUser } = useAuth();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ email: '', password: '', otp: '' });
  const [st, setSt] = useState({});
  if (!open) return <p className="small"><button type="button" className="link" onClick={() => setOpen(true)}>Change email</button></p>;
  const save = async () => {
    setSt({ busy: true });
    try { const r = await api.post('/account/email', { otp: f.otp }); setUser({ ...user, ...r.user }); setSt({ ok: 'Email changed.' }); setOpen(false); }
    catch (e) { setSt({ err: e.message, fields: e.fields }); }
  };
  return (
    <div className="subcard">
      <h3>Change email</h3>
      <Field label="New email" id="ce-email" error={st.fields?.email}><input id="ce-email" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
      <Field label="Current password" id="ce-pw" error={st.fields?.password}><input id="ce-pw" type="password" autoComplete="current-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
      <OtpBox id="ce-otp" value={f.otp} onChange={(v) => setF({ ...f, otp: v })} error={st.fields?.otp} label="Code sent to the new email" canSend={!!f.email && !!f.password}
        send={() => api.post('/account/email/otp', { email: f.email, password: f.password })} />
      <div className="row gap-s"><button type="button" className="btn btn--primary btn--sm" disabled={st.busy || f.otp.length !== 6} onClick={save}>Confirm new email</button><button type="button" className="btn btn--ghost btn--sm" onClick={() => setOpen(false)}>Cancel</button></div>
      {st.err && !Object.keys(st.fields || {}).length && <p className="field__error" role="alert">{st.err}</p>}
    </div>
  );
}

/** Forgot password: email → code (email + mobile) → new password. */
export function ForgotPassword() {
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const [f, setF] = useState({ email: sp.get('email') || '', otp: '', password: '', confirm_password: '' });
  const [st, setSt] = useState({});
  useSeo({ title: 'Reset password | Utsav Ghar' });
  const submit = async (e) => {
    e.preventDefault(); setSt({ busy: true });
    try { await api.post('/auth/password/reset', f); setSt({ done: true }); setTimeout(() => nav(`/login?email=${encodeURIComponent(f.email)}`), 1800); }
    catch (err) { setSt({ err: err.message, fields: err.fields }); }
  };
  const fe = st.fields || {};
  return (
    <div className="container auth">
      <form className="card form auth__card" onSubmit={submit} noValidate>
        <h1>Reset your password</h1>
        <p className="muted">Enter your account email. We send a 6-digit code to that email and to your mobile number.</p>
        <Field label="Email" id="fp-email" error={fe.email}><input id="fp-email" type="email" autoComplete="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <OtpBox id="fp-otp" value={f.otp} onChange={(v) => setF({ ...f, otp: v })} error={fe.otp} label="Code" canSend={/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email)}
          send={() => api.post('/auth/password/forgot', { email: f.email })} hint="If an account exists for this email, the code arrives in a minute." />
        <div className="auth__two">
          <Field label="New password" id="fp-pw" error={fe.password} hint="8+ characters"><input id="fp-pw" type="password" autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
          <Field label="Confirm new password" id="fp-pw2" error={fe.confirm_password || (f.confirm_password && f.confirm_password !== f.password ? 'Passwords do not match' : undefined)}><input id="fp-pw2" type="password" autoComplete="new-password" value={f.confirm_password} onChange={(e) => setF({ ...f, confirm_password: e.target.value })} /></Field>
        </div>
        <Strength value={f.password} />
        {st.err && <p className="field__error" role="alert">{st.err}</p>}
        {st.done && <p className="ok" role="status">✅ Password changed. You were signed out on all devices. Taking you to sign in…</p>}
        <button className="btn btn--primary btn--lg btn--block" disabled={st.busy || st.done || f.otp.length !== 6 || f.password.length < 8 || f.password !== f.confirm_password}>Set new password</button>
        <p className="center small"><Link className="link" to="/login">Back to sign in</Link></p>
      </form>
    </div>
  );
}

function RequestsTab() {
  const [list] = useLoad('/account/tickets');
  return (
    <div className="card">
      <div className="row between wrap gap-s"><h2>Help requests</h2><Link className="btn btn--primary btn--sm" to="/help?raise=1">Raise a request</Link></div>
      {!list ? <Spinner /> : list.length === 0 ? <Empty icon="💬" title="No requests yet">Problem with an order? Our <Link className="link" to="/help">Help Center</Link> has instant answers.</Empty> : (
        <ul className="tlist">
          {list.map((t) => (
            <li key={t.number}><Link to={`/help/requests/${t.number}`}><b>{t.number}</b> · {t.topic_label}{t.order ? ` · #${t.order.order_number}` : ''}</Link> <Pill tone={t.status === 'resolved' || t.status === 'closed' ? 'ok' : t.status === 'waiting' ? 'warn' : 'info'}>{t.status_label}</Pill>{t.last && <p className="small muted">{t.last}</p>}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SecurityTab() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const [pw, setPw] = useState({ current: '', next: '' });
  const [pwState, setPwState] = useState({});
  const [del, setDel] = useState({ password: '', confirm: '' });
  const [delState, setDelState] = useState({});
  const [activity] = useLoad('/account/activity');
  const change = async (e) => {
    e.preventDefault();
    const weak = passwordProblem(pw.next, { email: user.email, name: user.name });
    if (weak) return setPwState({ fields: { next: weak } });
    setPwState({ busy: true });
    try { await api.put('/account/password', pw); setPw({ current: '', next: '' }); setPwState({ ok: 'Password changed. You were signed out on your other devices.' }); }
    catch (err) { setPwState({ fields: err.fields, err: err.message }); }
  };
  const outAll = async () => {
    if (!window.confirm('Sign out on all devices, including this one?')) return;
    await api.post('/account/logout-all', {}); await logout().catch(() => {}); nav('/login');
  };
  const download = async () => {
    const data = await api.get('/account/export');
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = 'utsav-ghar-my-data.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 2000);
  };
  const remove = async (e) => {
    e.preventDefault();
    setDelState({ busy: true });
    try { await api.del('/account', { body: del }); } catch (err) { setDelState({ fields: Object.keys(err.fields || {}).length ? err.fields : null, err: err.message }); return; }
    await logout().catch(() => {}); nav('/', { replace: true });
  };
  const KIND = { login_ok: 'Signed in', password_changed: 'Password changed', logout_all: 'Signed out everywhere', data_exported: 'Data downloaded' };
  return (
    <div className="stack">
      <form className="card form" onSubmit={change}>
        <h2>🔑 Change password</h2>
        <Field label="Current password" id="sc-cur" error={pwState.fields?.current}><input id="sc-cur" type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} required /></Field>
        <Field label="New password" id="sc-new" error={pwState.fields?.next} hint="8+ characters. Avoid your name, email or common words."><input id="sc-new" type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} required /></Field>
        <Strength value={pw.next} />
        <button className="btn btn--primary" disabled={pwState.busy}>Change password</button>
        {pwState.ok && <p className="ok small">{pwState.ok}</p>}
        {pwState.err && !pwState.fields && <p className="field__error">{pwState.err}</p>}
      </form>
      <section className="card form">
        <h2>💻 Devices</h2>
        <p className="small muted">Signed in on a shared or lost phone? Sign out everywhere, then change your password.</p>
        <button className="btn btn--ghost" onClick={outAll}>Sign out on all devices</button>
        {activity?.length > 0 && (
          <table className="table"><tbody>{activity.slice(0, 8).map((a, i) => <tr key={i}><td className="small">{fmtDate(a.created_at)}</td><td className="small">{KIND[a.kind] || a.kind}</td><td className="small muted">{(a.user_agent || '').replace(/\(.*?\)/g, '').slice(0, 30)}</td></tr>)}</tbody></table>
        )}
      </section>
      <section className="card form">
        <h2>📦 Your data</h2>
        <p className="small muted">Download everything we keep about you: profile, addresses, orders, wishlist and message settings.</p>
        <button className="btn btn--ghost" onClick={download}>Download my data</button>
      </section>
      <form className="card form danger-zone" onSubmit={remove}>
        <h2>🗑️ Delete my account</h2>
        <p className="small">This removes your profile, addresses, wishlist and message subscriptions and signs you out. Your past orders are kept without your account (Indian tax law requires keeping invoices), and you can still track them with the order number.</p>
        <Field label="Password" id="dl-pw" error={delState.fields?.password}><input id="dl-pw" type="password" autoComplete="current-password" value={del.password} onChange={(e) => setDel({ ...del, password: e.target.value })} required /></Field>
        <Field label='Type DELETE to confirm' id="dl-c" error={delState.fields?.confirm}><input id="dl-c" value={del.confirm} onChange={(e) => setDel({ ...del, confirm: e.target.value })} required /></Field>
        {delState.err && !delState.fields && <p className="field__error">{delState.err}</p>}
        <button className="btn btn--danger" disabled={delState.busy || del.confirm !== 'DELETE'}>Delete my account</button>
      </form>
    </div>
  );
}

function useLoad(path) {
  const [data, setData] = useState(null);
  const reload = () => api.get(path).then(setData).catch(() => setData([]));
  useEffect(() => { reload(); }, [path]); // eslint-disable-line react-hooks/exhaustive-deps
  return [data, reload];
}

function Orders() {
  const [orders] = useLoad('/account/orders');
  const [open, setOpen] = useState(null);
  if (!orders) return <Spinner />;
  if (!orders.length) return <Empty icon="📦" title="No orders yet" action={<Link to="/shop" className="btn btn--primary">Start shopping</Link>} />;
  return (
    <div className="stack">
      <h2>My Orders</h2>
      {orders.map((o) => (
        <article key={o.order_number} className="card order-row">
          <div className="row between wrap">
            <div><b>#{o.order_number}</b><p className="small muted">{fmtDate(o.created_at)} · {o.items.length} item{o.items.length > 1 ? 's' : ''} · {rupees(o.totals.total)}</p></div>
            <div className="row gap-s wrap"><Pill tone={tone(o.payment_status)}>{PAYMENT_LABEL[o.payment_status]}</Pill><Pill tone={tone(o.status)}>{STATUS_LABEL[o.status]}</Pill></div>
          </div>
          <p className="small">{o.items.map((i) => `${i.name} × ${i.qty}`).join(', ')}</p>
          <div className="row gap-s">
            <button className="btn btn--ghost btn--sm" onClick={() => setOpen(open === o.order_number ? null : o.order_number)}>{open === o.order_number ? 'Hide tracking' : 'Track order'}</button>
            <Link className="btn btn--ghost btn--sm" to={`/order/${o.order_number}`}>{['awaiting_payment', 'rejected'].includes(o.payment_status) ? 'Complete payment' : 'View details'}</Link>
          </div>
          {open === o.order_number && <Timeline order={o} />}
        </article>
      ))}
    </div>
  );
}

function Wishlist() {
  const wish = useWishlist();
  const [items] = useLoad(`/account/wishlist?v=${wish.ids.length}`);
  if (!items) return <Spinner />;
  return (
    <div>
      <h2>My Wishlist ❤️</h2>
      {items.length ? <ProductGrid products={items} cols={3} /> : <Empty icon="❤️" title="Your wishlist is empty">Tap the heart on any product to save it here.</Empty>}
    </div>
  );
}

const blankAddr = { label: 'Home', name: '', phone: '', line1: '', line2: '', city: '', state: '', pincode: '', is_default: false };
function Addresses() {
  const [list, reload] = useLoad('/account/addresses');
  const [editing, setEditing] = useState(null); // null | 'new' | address id
  const [f, setF] = useState(blankAddr);
  const [fe, setFe] = useState({});
  const [msg, setMsg] = useState('');
  const open = (a) => { setFe({}); setMsg(''); setEditing(a ? a.id : 'new'); setF(a ? { label: a.label || 'Home', name: a.name, phone: a.phone, line1: a.line1, line2: a.line2 || '', city: a.city, state: a.state, pincode: a.pincode, is_default: !!a.is_default } : blankAddr); };
  const save = async (e) => {
    e.preventDefault();
    try {
      if (editing === 'new') await api.post('/account/addresses', f); else await api.put(`/account/addresses/${editing}`, f);
      setEditing(null); setFe({}); setMsg(editing === 'new' ? 'Address saved.' : 'Address updated.'); reload();
    } catch (err) { setFe(Object.keys(err.fields || {}).length ? err.fields : { _: err.message }); }
  };
  const makeDefault = async (a) => { await api.post(`/account/addresses/${a.id}/default`); setMsg(`“${a.label || 'Address'}” is now your default address.`); reload(); };
  const remove = async (a) => { if (!window.confirm('Delete this address?')) return; await api.del(`/account/addresses/${a.id}`); setMsg('Address deleted.'); reload(); };
  if (!list) return <Spinner />;
  const upd = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <div className="stack">
      <div className="row between"><h2>Addresses</h2><button className="btn btn--ghost btn--sm" onClick={() => (editing ? setEditing(null) : open(null))}>{editing ? 'Cancel' : '+ Add address'}</button></div>
      {msg && <p className="ok small" role="status">{msg}</p>}
      {editing && (
        <form className="card form" onSubmit={save} noValidate>
          <h3>{editing === 'new' ? 'New address' : 'Edit address'}</h3>
          <div className="form__grid">
            <Field label="Label" id="ad-label"><input id="ad-label" value={f.label} onChange={upd('label')} placeholder="Home, Office…" /></Field>
            <Field label="Name" id="ad-name" error={fe.name}><input id="ad-name" value={f.name} onChange={upd('name')} /></Field>
            <Field label="Mobile" id="ad-phone" error={fe.phone}><input id="ad-phone" type="tel" value={f.phone} onChange={upd('phone')} /></Field>
            <Field label="Address" id="ad-line1" error={fe.line1}><input id="ad-line1" value={f.line1} onChange={upd('line1')} /></Field>
            <Field label="Landmark (optional)" id="ad-line2" error={fe.line2}><input id="ad-line2" value={f.line2} onChange={upd('line2')} /></Field>
            <Field label="City" id="ad-city" error={fe.city}><input id="ad-city" value={f.city} onChange={upd('city')} /></Field>
            <Field label="State" id="ad-state" error={fe.state}><select id="ad-state" value={f.state} onChange={upd('state')}><option value="">Select</option>{STATES.map((x) => <option key={x}>{x}</option>)}</select></Field>
            <Field label="PIN code" id="ad-pin" error={fe.pincode}><input id="ad-pin" inputMode="numeric" value={f.pincode} onChange={upd('pincode')} maxLength={6} /></Field>
          </div>
          <label className="check"><input type="checkbox" checked={f.is_default} onChange={(e) => setF({ ...f, is_default: e.target.checked })} /><span>Make this my default address</span></label>
          {fe._ && <p className="field__error" role="alert">{fe._}</p>}
          <button className="btn btn--primary">{editing === 'new' ? 'Save address' : 'Save changes'}</button>
        </form>
      )}
      {list.length === 0 && !editing && <Empty icon="🏠" title="No saved addresses">Addresses you use at checkout can be saved here.</Empty>}
      <div className="addr-grid">
        {list.map((a) => (
          <div key={a.id} className="card addr">
            <div className="row between"><b>{a.label || 'Address'}{a.is_default ? <Pill tone="info">Default</Pill> : null}</b>
              <span className="row gap-s">
                <button className="link small" onClick={() => open(a)}>Edit</button>
                <button className="icon-btn" aria-label="Delete address" onClick={() => remove(a)}><TrashIcon width={18} height={18} /></button>
              </span></div>
            <p>{a.name} · {a.phone}<br />{a.line1}{a.line2 ? `, ${a.line2}` : ''}<br />{a.city}, {a.state} {a.pincode}</p>
            {!a.is_default && <button className="btn btn--ghost btn--sm" onClick={() => makeDefault(a)}>Set as default</button>}
          </div>
        ))}
      </div>
    </div>
  );
}

function Payments() {
  const [rows] = useLoad('/account/payments');
  if (!rows) return <Spinner />;
  return (
    <div>
      <h2>Payment History</h2>
      {rows.length === 0 ? <Empty icon="💳" title="No payments yet" /> : (
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Table">
          <table className="table">
            <thead><tr><th>Order</th><th>Date</th><th>Method</th><th className="num">Amount</th><th>UPI ref</th><th>Status</th></tr></thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.order_number}>
                  <td><Link className="link" to={`/order/${p.order_number}`}>#{p.order_number}</Link></td>
                  <td>{fmtDate(p.created_at)}</td><td>{p.method === 'razorpay' ? 'Online' : 'UPI'}</td>
                  <td className="num">{rupees(p.amount)}</td><td><code>{p.customer_ref || '—'}</code></td>
                  <td><Pill tone={tone(p.status)}>{PAYMENT_LABEL[p.status]}</Pill></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function OffersList() {
  const [offers] = useLoad('/account/offers');
  if (!offers) return <Spinner />;
  return (
    <div className="offer-cards">
      {offers.map((o) => (
        <article key={o.id} className="offer-card">
          <p className="offer-card__label">{o.label}</p>
          <h3>{o.name}</h3>
          <p>{o.description}</p>
          <p className="small">{o.coupon_code ? <>Use code <code className="coupon-code">{o.coupon_code}</code></> : 'Applied automatically in your cart'}{o.min_qty > 1 ? ` · min. ${o.min_qty} items` : ''}{o.ends_at ? ` · ends ${fmtDate(o.ends_at)}` : ''}</p>
          <Link to={o.coupon_code ? '/shop' : '/shop?offer=1'} className="btn btn--primary btn--sm">Shop now</Link>
        </article>
      ))}
    </div>
  );
}

export default function Account() {
  const { tab = '' } = useParams();
  const { user, logout } = useAuth();
  const nav = useNavigate();
  useSeo({ title: 'My Account | Utsav Ghar' });
  if (user === undefined) return <div className="container center pad"><Spinner /></div>;
  if (!user) {
    if (tab === 'wishlist') return <GuestWishlist />;
    return <Navigate to={`/login?next=/account/${tab}`} replace />;
  }
  const View = { '': Profile, orders: Orders, wishlist: Wishlist, addresses: Addresses, payments: Payments, security: SecurityTab, requests: RequestsTab, legal: MyLegalDocuments, offers: () => <><h2>Available Offers</h2><OffersList /></> }[tab] || Profile;
  return (
    <div className="container account">
      <header className="account__head">
        <div><p className="eyebrow">My account</p><h1>Namaste, {user.name.split(' ')[0]} 🙏</h1></div>
        <button className="btn btn--ghost btn--sm" onClick={logout}><LogoutIcon width={16} height={16} /> Sign out</button>
      </header>
      {tab !== 'legal' && <TermsUpdate compact />}
      <div className="account__grid">
        <nav className="account__nav" aria-label="Account sections">
          {TABS.map(([k, label]) => <NavLink key={k} to={`/account${k ? `/${k}` : ''}`} end>{label}</NavLink>)}
          <button className="account__alerts" onClick={() => (subscription()?.token ? nav(`/preferences/${subscription().token}`) : openSubscribe())}>🔔 Deals &amp; festival alerts</button>
        </nav>
        <section><View /></section>
      </div>
    </div>
  );
}

function GuestWishlist() {
  const wish = useWishlist();
  const [items, setItems] = useState(null);
  useEffect(() => {
    api.get('/products?limit=60').then((r) => setItems(r.items.filter((p) => wish.ids.includes(p.id)))).catch(() => setItems([]));
  }, [wish.ids]);
  return (
    <div className="container account">
      <h1>My Wishlist ❤️</h1>
      <p className="muted"><Link to="/login?next=/account/wishlist" className="link">Sign in</Link> to keep your wishlist on every device.</p>
      {!items ? <Spinner /> : items.length ? <ProductGrid products={items} /> : <Empty icon="❤️" title="Your wishlist is empty">Tap the heart on any product to save it here.</Empty>}
    </div>
  );
}

export function OffersPage() {
  const { offer } = useStore();
  useSeo({ title: 'Offers & Coupons | Utsav Ghar', description: 'Current festival offers and coupon codes at Utsav Ghar.' });
  return (
    <div className="container offers-page">
      <p className="eyebrow">Offers</p>
      <h1>This Season's Offers</h1>
      {offer && <p className="lede">🎁 <b>{offer.headline}.</b> Applied automatically to eligible items in your cart; you always get the better of this or any coupon.</p>}
      <OffersList />
    </div>
  );
}
