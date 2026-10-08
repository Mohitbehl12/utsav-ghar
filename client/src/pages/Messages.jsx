/**
 * Pages reached from customer messages:
 *  /go/:code[/:slug]     — the link in every email / WhatsApp message. Logs the
 *                          click, shows the picks (or opens the product), and
 *                          credits a resulting order to the message.
 *  /preferences/:token   — change how often / channels / interests, or stop.
 */
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { SEGMENTS } from '@shared/festivals.js';
import { FREQUENCIES } from '@shared/crm.js';
import { api } from '../lib/api.js';
import { rememberSubscription } from '../components/Subscribe.jsx';
import { ProductGrid } from '../components/ProductCard.jsx';
import { Empty, Spinner, useSeo } from '../components/ui.jsx';

export const setCrmCode = (code) => { try { localStorage.setItem('ug_crm', JSON.stringify({ code, at: Date.now() })); } catch { /* ignore */ } };

export function GoPage() {
  const { code, slug } = useParams();
  const nav = useNavigate();
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  useSeo({ title: 'Picked for you | Utsav Ghar' });
  useEffect(() => {
    api.get(`/go/${encodeURIComponent(code)}`).then((r) => {
      setCrmCode(code);
      if (r.token) rememberSubscription(r.token);
      const hit = slug && r.products.find((p) => p.slug === slug);
      if (hit) nav(hit.url, { replace: true });
      else setData(r);
    }).catch((e) => setErr(e.message));
  }, [code, slug]); // eslint-disable-line react-hooks/exhaustive-deps
  if (err) return <div className="container"><Empty icon="🪔" title="This offer link has expired" action={<Link className="btn btn--primary" to="/">See today's deals</Link>}>Fresh picks are waiting on the home page.</Empty></div>;
  if (!data) return <div className="container center" style={{ padding: 60 }}><Spinner /></div>;
  return (
    <div className="container gopage">
      <header className="gopage__head">
        <p className="eyebrow">{data.kind === 'festival' ? 'Festival alert' : 'Picked for you'}</p>
        <h1>{data.subject}</h1>
        <p className="muted">Tap any product to see details, or add it straight to your cart.</p>
      </header>
      <ProductGrid products={data.products} />
      <p className="center"><Link to="/" className="btn btn--ghost">Keep shopping</Link></p>
    </div>
  );
}

export function PreferencesPage() {
  const { token } = useParams();
  const [sp] = useSearchParams();
  const [p, setP] = useState(null);
  const [err, setErr] = useState('');
  const [saved, setSaved] = useState('');
  useSeo({ title: 'Message preferences | Utsav Ghar' });
  useEffect(() => {
    const stop = sp.get('stop');
    (stop ? api.post(`/preferences/${token}/stop?channel=${stop === 'email' || stop === 'whatsapp' ? stop : 'all'}`, {}) : api.get(`/preferences/${token}`))
      .then((r) => { setP(r); if (stop) setSaved(stop === 'email' ? "You won't get emails from us any more." : stop === 'whatsapp' ? "You won't get WhatsApp messages from us any more." : "You're unsubscribed."); })
      .catch((e) => setErr(e.message));
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps
  if (err) return <div className="container"><Empty icon="🔗" title="Link not found">{err}</Empty></div>;
  if (!p) return <div className="container center" style={{ padding: 60 }}><Spinner /></div>;
  const upd = (k, v) => setP((x) => ({ ...x, [k]: v }));
  const save = async (e) => {
    e.preventDefault();
    const r = await api.put(`/preferences/${token}`, { email_opt_in: p.email_opt_in, whatsapp_opt_in: p.whatsapp_opt_in, frequency: p.frequency, interests: p.interests });
    setP(r); setSaved(r.status === 'unsubscribed' ? "You're unsubscribed. You can come back any time." : 'Saved! 🙏');
  };
  const stopAll = async () => { const r = await api.post(`/preferences/${token}/stop`, {}); setP(r); setSaved("You're unsubscribed. You can come back any time."); };
  return (
    <div className="container prefs">
      <h1>Your message settings</h1>
      <p className="muted">{p.name ? `Namaste ${p.name}! ` : ''}Choose how you hear from Utsav Ghar.</p>
      {saved && <p className="prefs__saved" role="status">{saved}</p>}
      <form onSubmit={save} className="prefs__form">
        <fieldset>
          <legend>Send me messages on</legend>
          {p.phone && <label className="check"><input type="checkbox" checked={p.whatsapp_opt_in} onChange={(e) => upd('whatsapp_opt_in', e.target.checked)} /><span>💬 WhatsApp ({p.phone})</span></label>}
          {p.email && <label className="check"><input type="checkbox" checked={p.email_opt_in} onChange={(e) => upd('email_opt_in', e.target.checked)} /><span>✉️ Email ({p.email})</span></label>}
        </fieldset>
        <fieldset>
          <legend>How often</legend>
          {FREQUENCIES.map((o) => <label key={o.value} className="check"><input type="radio" name="freq" checked={p.frequency === o.value} onChange={() => upd('frequency', o.value)} /><span>{o.label}</span></label>)}
        </fieldset>
        <fieldset>
          <legend>I'm interested in</legend>
          <div className="subf__chips">
            {SEGMENTS.map((s) => {
              const on = p.interests.includes(s.slug);
              return <button type="button" key={s.slug} className={`chip ${on ? 'chip--on' : ''}`} aria-pressed={on} onClick={() => upd('interests', on ? p.interests.filter((x) => x !== s.slug) : [...p.interests, s.slug])}>{s.icon} {s.name}</button>;
            })}
          </div>
        </fieldset>
        <div className="row gap-s">
          <button className="btn btn--primary">Save</button>
          {p.status === 'active' && <button type="button" className="btn btn--ghost" onClick={stopAll}>Unsubscribe from everything</button>}
        </div>
      </form>
    </div>
  );
}
