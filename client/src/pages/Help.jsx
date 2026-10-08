/**
 * Help Center: instant answers to common problems, a "raise a request" form
 * (with photo for damaged / wrong items), and the conversation for each request.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { TOPICS, SOLUTIONS, topicOf } from '@shared/support.js';
import { api } from '../lib/api.js';
import { fmtDateTime, rupees } from '../lib/format.js';
import { useAuth, useStore, useToast } from '../state/store.jsx';
import { Field, Pill, Spinner, Empty, useSeo } from '../components/ui.jsx';
import { UploadIcon } from '../components/Icons.jsx';
import { waLink } from '../components/Layout.jsx';
import { openChat } from '../components/ChatBot.jsx';

// Requests raised on this device (guest access tokens), so customers can come back to them.
const KEY = 'ug_tickets';
export const savedTickets = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } };
export const saveTicket = (number, token) => { try { localStorage.setItem(KEY, JSON.stringify({ ...savedTickets(), [number]: token })); } catch { /* ignore */ } };
const tokenFor = (n) => savedTickets()[n] || '';
const STATUS_TONE = { open: 'info', in_progress: 'info', waiting: 'warn', resolved: 'ok', closed: 'muted' };

export function SolutionCard({ topic, onRaise }) {
  const s = SOLUTIONS[topic];
  if (!s) return null;
  return (
    <div className="sol">
      <h3>{topicOf(topic).icon} {s.title}</h3>
      <ol>{s.steps.map((x) => <li key={x}>{x}</li>)}</ol>
      <div className="row gap-s wrap">
        {(s.actions || []).map(([label, to]) => <Link key={to} to={to} className="btn btn--ghost btn--sm">{label}</Link>)}
        {onRaise && <button className="btn btn--primary btn--sm" onClick={() => onRaise(topic)}>Still need help? Raise a request</button>}
      </div>
    </div>
  );
}

export function TicketForm({ topic: initial = '', orderNumber = '', source = 'help', onDone }) {
  const { user } = useAuth();
  const [f, setF] = useState({ topic: initial, name: user?.name || '', phone: user?.phone || '', email: user?.email || '', orderNumber, message: '', website: '' });
  const [file, setFile] = useState(null);
  const [st, setSt] = useState({});
  useEffect(() => { setF((x) => ({ ...x, topic: initial || x.topic })); }, [initial]);
  const t = topicOf(f.topic);
  const upd = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    setSt({ busy: true });
    const fd = new FormData();
    for (const [k, v] of Object.entries(f)) fd.set(k, v);
    fd.set('source', source);
    if (file) fd.set('photo', file);
    try {
      const r = await api.post('/support/tickets', fd);
      saveTicket(r.ticket.number, r.token);
      onDone(r.ticket);
    } catch (x) {
      if (x.status === 409 && x.data?.number) { setSt({ err: x.message, existing: x.data.number }); return; }
      setSt({ fields: x.fields, err: Object.keys(x.fields || {}).length ? '' : x.message });
    }
  };
  const fe = st.fields || {};
  return (
    <form className="card form" onSubmit={submit} noValidate>
      <h2>📝 Raise a request</h2>
      <Field label="What's the problem?" id="tk-topic" error={fe.topic}>
        <select id="tk-topic" value={f.topic} onChange={upd('topic')} required>
          <option value="">Choose…</option>
          {TOPICS.map((x) => <option key={x.key} value={x.key}>{x.icon} {x.label}</option>)}
        </select>
      </Field>
      <div className="grid-2">
        <Field label="Your name" id="tk-name" error={fe.name}><input id="tk-name" autoComplete="name" value={f.name} onChange={upd('name')} required /></Field>
        <Field label="Mobile number" id="tk-phone" error={fe.phone} hint="Same number as on your order"><input id="tk-phone" type="tel" autoComplete="tel" value={f.phone} onChange={upd('phone')} /></Field>
        <Field label="Email (optional)" id="tk-email" error={fe.email}><input id="tk-email" type="email" autoComplete="email" value={f.email} onChange={upd('email')} /></Field>
        <Field label={`Order number${t.needsOrder ? '' : ' (if any)'}`} id="tk-order" error={fe.orderNumber} hint="e.g. DIWALI10245"><input id="tk-order" value={f.orderNumber} onChange={(e) => setF({ ...f, orderNumber: e.target.value.toUpperCase() })} /></Field>
      </div>
      <Field label="Tell us what happened" id="tk-msg" error={fe.message}><textarea id="tk-msg" rows={4} value={f.message} onChange={upd('message')} required placeholder="The more detail, the faster we can fix it." /></Field>
      {(t.photo || f.topic === 'payment' || f.topic === 'other') && (
        <label className="upload" htmlFor="tk-photo">
          <UploadIcon width={18} height={18} />
          <span>{file ? file.name : t.photo ? 'Add a photo of the item and box (recommended)' : 'Add a screenshot (optional)'}</span>
          <input id="tk-photo" type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setFile(e.target.files[0] || null)} />
        </label>
      )}
      <input className="hp" type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" value={f.website} onChange={upd('website')} />
      {st.err && <p className="field__error" role="alert">{st.err} {st.existing && <Link className="link" to={`/help/requests/${st.existing}`}>Open {st.existing}</Link>}</p>}
      <button className="btn btn--primary btn--block" disabled={st.busy}>{st.busy ? 'Sending…' : 'Send request'}</button>
      <p className="small muted">We reply within a few hours (10 am – 8 pm, Mon–Sat). You'll get updates on WhatsApp / email.</p>
    </form>
  );
}

export function HelpPage() {
  const { settings } = useStore();
  const { user } = useAuth();
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(sp.get('topic') || '');
  const [raise, setRaise] = useState(sp.get('raise') ? (sp.get('topic') || 'other') : '');
  const [mine, setMine] = useState([]);
  useSeo({ title: 'Help Center | Utsav Ghar', description: 'Track orders, returns, refunds, payment help and more.' });
  useEffect(() => {
    const local = Object.keys(savedTickets());
    const fromLocal = Promise.all(local.slice(-8).map((n) => api.get(`/support/tickets/${n}`, { headers: { 'X-Ticket-Token': tokenFor(n) } }).catch(() => null)));
    const fromAcct = user ? api.get('/account/tickets').catch(() => []) : Promise.resolve([]);
    Promise.all([fromLocal, fromAcct]).then(([a, b]) => {
      const m = new Map();
      for (const t of [...b, ...a.filter(Boolean)]) m.set(t.number, t);
      setMine([...m.values()].sort((x, y) => String(y.updated_at).localeCompare(String(x.updated_at))));
    });
  }, [user]);
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return TOPICS;
    return TOPICS.filter((t) => `${t.label} ${SOLUTIONS[t.key]?.title} ${(SOLUTIONS[t.key]?.steps || []).join(' ')}`.toLowerCase().includes(s));
  }, [q]);
  const wa = settings?.whatsapp_number || settings?.support_phone;
  return (
    <div className="container help">
      <header className="help__head">
        <p className="eyebrow">Help Center</p>
        <h1>How can we help you? 🙏</h1>
        <input className="help__search" type="search" placeholder="Search: refund, damaged, payment, delivery…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search help" />
        <div className="help__quick">
          <Link to="/track" className="hq"><span>📦</span>Track order</Link>
          <Link to="/help/manual" className="hq"><span>📘</span>User manual</Link>
          <button className="hq" onClick={() => openChat()}><span>💬</span>Chat with us</button>
          {wa && <a className="hq" href={waLink(wa, 'Namaste! I need help with my Utsav Ghar order.')} target="_blank" rel="noreferrer"><span>🟢</span>WhatsApp</a>}
          {settings?.support_phone && <a className="hq" href={`tel:${settings.support_phone.replace(/[^\d+]/g, '')}`}><span>📞</span>Call us</a>}
          <button className="hq" onClick={() => { setRaise('other'); setTimeout(() => document.getElementById('raise')?.scrollIntoView({ behavior: 'smooth' }), 50); }}><span>📝</span>Raise a request</button>
        </div>
      </header>

      {mine.length > 0 && (
        <section className="card">
          <h2>Your requests</h2>
          <ul className="tlist">
            {mine.map((t) => (
              <li key={t.number}><Link to={`/help/requests/${t.number}`}><b>{t.number}</b> · {t.topic_label}{t.order ? ` · #${t.order.order_number}` : ''}</Link> <Pill tone={STATUS_TONE[t.status]}>{t.status_label}</Pill></li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="help__h">Common problems — instant answers</h2>
        {list.length === 0 && <Empty icon="🔍" title="No match">Try another word, or <button className="link-btn link" onClick={() => openChat(q)}>ask our chat assistant</button>.</Empty>}
        <div className="topics">
          {list.map((t) => (
            <div key={t.key} className={`topic ${open === t.key ? 'is-open' : ''}`}>
              <button className="topic__btn" aria-expanded={open === t.key} onClick={() => setOpen(open === t.key ? '' : t.key)}><span aria-hidden="true">{t.icon}</span>{t.label}</button>
              {open === t.key && <SolutionCard topic={t.key} onRaise={(k) => { setRaise(k); setTimeout(() => document.getElementById('raise')?.scrollIntoView({ behavior: 'smooth' }), 50); }} />}
            </div>
          ))}
        </div>
      </section>

      <section id="raise">
        {raise ? <TicketForm topic={raise} orderNumber={sp.get('order') || ''} onDone={(t) => nav(`/help/requests/${t.number}`)} /> : (
          <div className="card center"><p>Didn't find your answer?</p><button className="btn btn--primary" onClick={() => setRaise('other')}>Raise a request</button></div>
        )}
      </section>
    </div>
  );
}

export function TicketPage() {
  const { number } = useParams();
  const toast = useToast();
  const [t, setT] = useState(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const headers = { 'X-Ticket-Token': tokenFor(number) };
  useSeo({ title: `Request ${number} | Utsav Ghar` });
  const load = () => api.get(`/support/tickets/${number}`, { headers }).then(setT).catch((e) => setErr(e.message));
  useEffect(() => { load(); const i = setInterval(load, 30000); return () => clearInterval(i); }, [number]); // eslint-disable-line react-hooks/exhaustive-deps
  if (err) return <div className="container"><Empty icon="🔒" title="Request not found" action={<Link className="btn btn--primary" to="/help">Go to Help Center</Link>}>Open it from the same phone you used, or sign in to the account you used.</Empty></div>;
  if (!t) return <div className="container center pad"><Spinner /></div>;
  const send = async (e) => {
    e.preventDefault(); if (!msg.trim()) return;
    setBusy(true);
    const fd = new FormData(); fd.set('message', msg); if (file) fd.set('photo', file);
    try { setT(await api.post(`/support/tickets/${number}/messages`, fd, { headers })); setMsg(''); setFile(null); } catch (x) { toast(x.message, 'warn'); } finally { setBusy(false); }
  };
  const rate = async (n) => { try { setT(await api.post(`/support/tickets/${number}/rate`, { rating: n }, { headers })); toast('Thank you for your feedback 🙏'); } catch (x) { toast(x.message, 'warn'); } };
  const img = (m) => m.image || (m.has_image ? `/api/support/tickets/${number}/messages/${m.id}/image?token=${encodeURIComponent(tokenFor(number))}` : null);
  return (
    <div className="container ticket">
      <nav className="crumbs"><Link to="/help">Help Center</Link><span>/</span><span>{t.number}</span></nav>
      <header className="ticket__head">
        <h1>{topicOf(t.topic).icon} {t.topic_label}</h1>
        <p><Pill tone={STATUS_TONE[t.status]}>{t.status_label}</Pill> <span className="muted small">Request {t.number} · raised {fmtDateTime(t.created_at)}</span></p>
        {t.order && <p className="small">Order <Link className="link" to={`/order/${t.order.order_number}`}>#{t.order.order_number}</Link> · {rupees(t.order.total)}</p>}
      </header>
      <div className="ticket__grid">
        <section className="card">
          <ul className="thread">
            {t.messages.map((m) => (
              <li key={m.id} className={`msg msg--${m.author}`}>
                <span className="msg__who">{m.author === 'customer' ? 'You' : m.author === 'admin' ? 'Utsav Ghar team' : 'ℹ️'}</span>
                <p>{m.body}</p>
                {img(m) && <img className="msg__img" src={img(m)} alt="Attached photo" loading="lazy" />}
                <time className="small muted">{fmtDateTime(m.created_at)}</time>
              </li>
            ))}
          </ul>
          {t.status !== 'closed' ? (
            <form className="reply" onSubmit={send}>
              <label htmlFor="rp" className="sr-only">Your reply</label>
              <textarea id="rp" rows={3} value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Write a reply…" />
              <div className="row between wrap gap-s">
                <label className="upload upload--sm" htmlFor="rp-photo"><UploadIcon width={16} height={16} /><span>{file ? file.name : 'Add photo'}</span><input id="rp-photo" type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setFile(e.target.files[0] || null)} /></label>
                <button className="btn btn--primary" disabled={busy || !msg.trim()}>Send</button>
              </div>
            </form>
          ) : <p className="muted small">This request is closed. <Link className="link" to="/help?raise=1">Raise a new one</Link> if you need more help.</p>}
          {['resolved', 'closed'].includes(t.status) && (
            <div className="rate">
              <p><b>{t.rating ? 'Thanks for rating us!' : 'How did we do?'}</b></p>
              <div className="rate__stars" role="group" aria-label="Rate our help">
                {[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" className={n <= (t.rating || 0) ? 'is-on' : ''} onClick={() => rate(n)} aria-label={`${n} star${n > 1 ? 's' : ''}`} disabled={!!t.rating}>★</button>)}
              </div>
            </div>
          )}
        </section>
        {t.solution && <aside><SolutionCard topic={t.topic} /></aside>}
      </div>
    </div>
  );
}
