import { useEffect, useState } from 'react';
import { Link, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { Field, Spinner, useSeo } from '../components/ui.jsx';
import { LogoMark, LogoutIcon, MenuIcon } from '../components/Icons.jsx';
import { Dashboard, Orders, Payments, Reviews, Customers, Audit } from './pages.jsx';
import { Products, ProductForm, Categories, Offers, Settings } from './catalog.jsx';
import { Profit } from './profit.jsx';
import { Photos } from './photos.jsx';
import { Marketing } from './marketing.jsx';
import { Messages } from './messages.jsx';
import { Support } from './support.jsx';
import { AiInsights } from './ai.jsx';
import { Dealers } from './dealers.jsx';
import { Tracking } from './tracking.jsx';
import { DealerProducts } from './dealerProducts.jsx';
import { PricingByPin } from './pricingPin.jsx';
import { DealerVerification } from './legal.jsx';
import { LegalCenter } from './legalCenter.jsx';
import { Security, ChangePassword } from './security.jsx';
import UserManual from '../components/UserManual.jsx';
import { Returns, Settlements, AdminUsers } from './aftersales.jsx';
import { NAV_AREA, permission } from '@shared/roles.js';
import '../styles/admin.css';

/** Can this admin open a menu page? (the server enforces the same map) */
const mayOpen = (admin, key) => !!permission(admin.role, NAV_AREA[key] ?? 'other') || (NAV_AREA[key] === undefined && ['owner', 'manager'].includes(admin.role));
function NoAccess({ admin }) {
  const loc = useLocation();
  const key = loc.pathname.replace(/^\/admin\/?/, '').split('/')[0];
  if (mayOpen(admin, key)) return null;
  return <div className="notice notice--warn" role="alert">🔒 Your role ({admin.role_label || admin.role}) does not have access to this page. Ask the store owner if you need it.</div>;
}
const NAV = [
  ['', 'Dashboard', '📊'], ['orders', 'Orders', '📦'], ['dealers', 'Dealers', '🏪'], ['dealer-verification', 'Dealer verification', '🛡️'], ['tracking', 'Delivery tracking', '📍'], ['dealer-products', 'Dealer products', '🧾'], ['payments', 'Payments', '💳'], ['returns', 'Returns & refunds', '↩️'], ['settlements', 'Dealer settlements', '🧾'], ['products', 'Products', '🪔'], ['photos', 'Product photos', '📷'], ['profit', 'Profit & pricing', '📈'], ['pricing-pin', 'Pricing by PIN', '🧮'], ['marketing', 'Marketing', '📣'], ['messages', 'Customer messages', '🔔'], ['support', 'Support requests', '🛟'], ['ai', 'AI insights', '🤖'], ['legal', 'Legal & Compliance', '⚖️'],
  ['categories', 'Categories', '🗂️'], ['offers', 'Offers', '🎁'], ['reviews', 'Reviews', '⭐'], ['customers', 'Customers', '👥'],
  ['settings', 'Payment & Store', '⚙️'], ['security', 'Security', '🛡️'], ['audit', 'Audit log', '📝'], ['admins', 'Admin users & roles', '👥'], ['manual', 'User manual', '📘'],
];

function Login({ onIn }) {
  const [f, setF] = useState(__DEMO__ ? { email: 'admin@utsavghar.in', password: 'ChangeMe@2026' } : { email: '', password: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr('');
    try {
      const r = await api.post('/admin/login', { ...f, email: f.email.trim() });
      if (r.twoFactor) setTicket(r.ticket); else onIn(r.admin);
    } catch (x) { setErr(x.message); } finally { setBusy(false); }
  };
  const [ticket, setTicket] = useState(null);
  const [code, setCode] = useState('');
  const submitCode = async (e) => {
    e.preventDefault();
    setBusy(true); setErr('');
    try { onIn((await api.post('/admin/login/2fa', { ticket, code: code.trim() })).admin); }
    catch (x) { setErr(x.message); if (x.status === 401 && /expired/i.test(x.message)) setTicket(null); }
    finally { setBusy(false); }
  };
  // Preview only: one tap, no typing (browser autofill sometimes replaces the demo details).
  const demoIn = async () => {
    setBusy(true); setErr('');
    try { const r = await api.post('/admin/login', { email: 'admin@utsavghar.in', password: 'ChangeMe@2026', preview: true }); if (r.twoFactor) setTicket(r.ticket); else onIn(r.admin); } catch (x) { setErr(x.message); } finally { setBusy(false); }
  };
  if (ticket) {
    return (
      <div className="adm-login">
        <form className="card form adm-login__card" onSubmit={submitCode}>
          <div className="row gap-s"><LogoMark size={40} /><div><b className="brand__name">Utsav Ghar</b><p className="small muted" style={{ margin: 0 }}>Two-step login</p></div></div>
          <p className="small">Open your authenticator app and enter the 6-digit code for <b>Utsav Ghar</b>. Lost your phone? Enter one of your backup codes.</p>
          <Field label="Code" id="adm-code"><input id="adm-code" inputMode="numeric" autoComplete="one-time-code" autoFocus value={code} onChange={(e) => setCode(e.target.value)} maxLength={9} required /></Field>
          {err && <p className="field__error" role="alert">{err}</p>}
          <button className="btn btn--primary btn--block" disabled={busy}>Verify</button>
          <button type="button" className="link-btn small center" onClick={() => { setTicket(null); setCode(''); setErr(''); }}>← Use a different account</button>
        </form>
      </div>
    );
  }
  return (
    <div className="adm-login">
      <form className="card form adm-login__card" onSubmit={submit}>
        <div className="row gap-s"><LogoMark size={40} /><div><b className="brand__name">Utsav Ghar</b><p className="small muted" style={{ margin: 0 }}>Store admin</p></div></div>
        {__DEMO__ && <p className="notice notice--info small">Demo admin: <b>admin@utsavghar.in</b> / <b>ChangeMe@2026</b> (already filled in).</p>}
        <Field label="Email" id="adm-email"><input id="adm-email" type="email" autoComplete="username" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required /></Field>
        <Field label="Password" id="adm-pw"><input id="adm-pw" type="password" autoComplete="current-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required /></Field>
        {err && <p className="field__error" role="alert">{err}</p>}
        <button className="btn btn--primary btn--block" disabled={busy}>Sign in</button>
        {__DEMO__ && <button type="button" className="btn btn--gold btn--block" disabled={busy} onClick={demoIn}>Enter admin (preview)</button>}
        <Link to="/" className="small link center">← Back to store</Link>
      </form>
    </div>
  );
}

export default function AdminApp() {
  const [admin, setAdmin] = useState(undefined);
  const [menu, setMenu] = useState(false);
  const nav = useNavigate();
  useSeo({ title: 'Admin | Utsav Ghar' });
  useEffect(() => { api.get('/admin/me').then((r) => setAdmin(r.admin)).catch(() => setAdmin(null)); }, []);
  if (admin === undefined) return <div className="center pad"><Spinner /></div>;
  if (!admin) return <Login onIn={setAdmin} />;
  if (admin.must_change_password) {
    return (
      <div className="adm-login"><div className="adm-login__card" style={{ width: 'min(520px, 100%)' }}>
        <ChangePassword admin={admin} forced onDone={() => api.get('/admin/me').then((r) => setAdmin(r.admin))} />
      </div></div>
    );
  }
  const logout = async () => { await api.post('/admin/logout'); setAdmin(null); nav('/admin'); };
  return (
    <div className={`adm ${menu ? 'adm--menu' : ''}`}>
      <aside className="adm__side">
        <Link to="/admin" className="adm__brand"><LogoMark size={32} /><span>Utsav Ghar<small>Admin</small></span></Link>
        <nav onClick={() => setMenu(false)}>
          {NAV.filter(([p]) => mayOpen(admin, p)).map(([p, label, icon]) => <NavLink key={p} to={`/admin${p ? `/${p}` : ''}`} end={!p}><span aria-hidden="true">{icon}</span>{label}</NavLink>)}
        </nav>
        <div className="adm__me">
          <p className="small"><b>{admin.name}</b><br /><span className="muted">{admin.email} · {admin.role_label || admin.role}</span></p>
          <div className="row gap-s">
            <Link to="/" className="btn btn--ghost btn--sm">View store</Link>
            <button className="btn btn--ghost btn--sm" onClick={logout}><LogoutIcon width={16} height={16} /> Sign out</button>
          </div>
        </div>
      </aside>
      <div className="adm__main">
        <header className="adm__top">
          <button className="icon-btn adm__burger" onClick={() => setMenu((m) => !m)} aria-label="Menu"><MenuIcon /></button>
          <b>Store admin</b>
        </header>
        <div className="adm__content">
          <NoAccess admin={admin} />
          <Routes>
            <Route index element={<Dashboard />} />
            <Route path="orders" element={<Orders />} />
            <Route path="orders/:id" element={<Orders />} />
            <Route path="payments" element={<Payments />} />
            <Route path="products" element={<Products />} />
            <Route path="products/new" element={<ProductForm />} />
            <Route path="products/:id" element={<ProductForm />} />
            <Route path="profit" element={<Profit />} />
            <Route path="photos" element={<Photos />} />
            <Route path="marketing" element={<Marketing />} />
            <Route path="messages" element={<Messages />} />
            <Route path="ai" element={<AiInsights />} />
            <Route path="dealers" element={<Dealers />} />
            <Route path="tracking" element={<Tracking />} />
            <Route path="pricing-pin" element={<PricingByPin />} />
            <Route path="dealer-verification" element={<DealerVerification role={admin.role} />} />
            <Route path="dealer-verification/:id" element={<DealerVerification role={admin.role} />} />
            <Route path="legal" element={<LegalCenter role={admin.role} />} />
            <Route path="dealer-products" element={<DealerProducts />} />
            <Route path="dealer-products/:id" element={<DealerProducts />} />
            <Route path="support" element={<Support />} />
            <Route path="support/:number" element={<Support />} />
            <Route path="categories" element={<Categories />} />
            <Route path="offers" element={<Offers />} />
            <Route path="reviews" element={<Reviews />} />
            <Route path="customers" element={<Customers />} />
            <Route path="settings" element={<Settings role={admin.role} />} />
            <Route path="audit" element={<Audit />} />
            <Route path="manual" element={<UserManual kind="admin" variant="admin" />} />
            <Route path="returns" element={<Returns admin={admin} />} />
            <Route path="settlements" element={<Settlements admin={admin} />} />
            <Route path="admins" element={<AdminUsers admin={admin} />} />
            <Route path="security" element={<Security admin={admin} onAdmin={setAdmin} />} />
          </Routes>
        </div>
      </div>
    </div>
  );
}
