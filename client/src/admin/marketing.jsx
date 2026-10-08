import { useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { rupees, fmtDateTime, copyText } from '../lib/format.js';
import { Field, Pill, Spinner, Empty } from '../components/ui.jsx';
import { useToast } from '../state/store.jsx';
import { countryName } from '../lib/countries.js';
import { PageHead, useAdminData } from './pages.jsx';

const PRESETS = [
  ['Instagram bio link', 'instagram', 'social', 'bio'],
  ['Instagram Story', 'instagram', 'story', 'diwali'],
  ['Instagram / Facebook ad', 'instagram', 'paid', 'diwali-test'],
  ['Creator / influencer', 'influencer', 'creator', 'diwali'],
  ['WhatsApp broadcast', 'whatsapp', 'broadcast', 'diwali'],
  ['Google Ads', 'google', 'cpc', 'diwali-search'],
];

function Funnel({ steps }) {
  const top = Math.max(1, steps[0]?.count || 0);
  return (
    <ol className="mfunnel">
      {steps.map((s, i) => {
        const prev = i ? steps[i - 1].count : null;
        return (
          <li key={s.key}>
            <span className="mfunnel__label">{s.label}</span>
            <span className="mfunnel__bar"><i style={{ width: `${Math.max(1.5, (s.count / top) * 100)}%` }} /></span>
            <b className="mfunnel__n">{s.count.toLocaleString('en-IN')}</b>
            <span className="mfunnel__rate">{prev && s.count <= prev ? `${Math.round((s.count / prev) * 1000) / 10}% of previous` : ''}</span>
          </li>
        );
      })}
    </ol>
  );
}

function LinkBuilder() {
  const toast = useToast();
  const base = typeof window !== 'undefined' && !__DEMO__ ? window.location.origin : 'https://www.utsavghar.in';
  const [f, setF] = useState({ path: '/', source: 'instagram', medium: 'social', campaign: 'bio', content: '' });
  const url = useMemo(() => {
    const u = new URL(f.path || '/', base);
    if (f.source) u.searchParams.set('utm_source', f.source.trim().toLowerCase());
    if (f.medium) u.searchParams.set('utm_medium', f.medium.trim().toLowerCase());
    if (f.campaign) u.searchParams.set('utm_campaign', f.campaign.trim().toLowerCase().replace(/\s+/g, '-'));
    if (f.content) u.searchParams.set('utm_content', f.content.trim().toLowerCase().replace(/\s+/g, '-'));
    return u.toString();
  }, [f, base]);
  const upd = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <section className="card form">
      <h2>🔗 Tracked link builder</h2>
      <p className="small muted">Use a tagged link everywhere you post, so every order shows where it came from. Pick a preset, adjust, copy.</p>
      <div className="chips">{PRESETS.map(([label, source, medium, campaign]) => <button type="button" key={label} className="chip" onClick={() => setF({ ...f, source, medium, campaign })}>{label}</button>)}</div>
      <div className="form__grid">
        <Field label="Page" id="lb-path" hint="e.g. / or /shop/combos or /shop/diyas-candles/premium-brass-diya"><input id="lb-path" value={f.path} onChange={upd('path')} /></Field>
        <Field label="Source" id="lb-src" hint="instagram, facebook, influencer, whatsapp, google"><input id="lb-src" value={f.source} onChange={upd('source')} /></Field>
        <Field label="Medium" id="lb-med" hint="social, story, paid, creator, cpc"><input id="lb-med" value={f.medium} onChange={upd('medium')} /></Field>
        <Field label="Campaign" id="lb-camp" hint="diwali-test, diwali-scale, uae-test"><input id="lb-camp" value={f.campaign} onChange={upd('campaign')} /></Field>
        <Field label="Content (optional)" id="lb-cont" hint="creator name or ad version, e.g. reel-before-after"><input id="lb-cont" value={f.content} onChange={upd('content')} /></Field>
      </div>
      <div className="linkout">
        <code>{url}</code>
        <button type="button" className="btn btn--primary btn--sm" onClick={async () => toast((await copyText(url)) ? 'Link copied' : 'Select the link and copy it')}>Copy link</button>
      </div>
    </section>
  );
}

function TrackingSetup({ tracking, onSaved }) {
  const toast = useToast();
  const [f, setF] = useState({ meta_pixel_id: tracking.meta_pixel_id, ga4_measurement_id: tracking.ga4_measurement_id });
  const [fe, setFe] = useState({});
  const save = async (e) => {
    e.preventDefault();
    try { await api.put('/admin/settings/tracking', f); setFe({}); toast('Tracking IDs saved'); onSaved(); } catch (x) { setFe(x.fields || { _: x.message }); }
  };
  return (
    <form className="card form" onSubmit={save}>
      <h2>📡 Tracking setup</h2>
      <div className="form__grid">
        <Field label="Meta Pixel ID" id="tr-pixel" error={fe.meta_pixel_id} hint="Events Manager → Data sources → your Pixel (numbers only)"><input id="tr-pixel" value={f.meta_pixel_id} onChange={(e) => setF({ ...f, meta_pixel_id: e.target.value })} placeholder="123456789012345" /></Field>
        <Field label="GA4 Measurement ID" id="tr-ga" error={fe.ga4_measurement_id} hint="GA4 → Admin → Data streams → Web"><input id="tr-ga" value={f.ga4_measurement_id} onChange={(e) => setF({ ...f, ga4_measurement_id: e.target.value })} placeholder="G-XXXXXXXXXX" /></Field>
      </div>
      <ul className="status-list">
        <li><Pill tone={tracking.meta_pixel_id ? 'ok' : 'muted'}>{tracking.meta_pixel_id ? 'On' : 'Off'}</Pill> Meta Pixel in the browser: PageView, ViewContent, AddToCart, InitiateCheckout, AddPaymentInfo</li>
        <li><Pill tone={tracking.metaCapi ? 'ok' : 'warn'}>{tracking.metaCapi ? 'On' : 'Needs token'}</Pill> Meta Conversions API: Purchase sent from the server when you confirm payment {tracking.metaCapi ? '' : '(add META_CAPI_TOKEN to the server .env)'}</li>
        <li><Pill tone={tracking.ga4_measurement_id ? 'ok' : 'muted'}>{tracking.ga4_measurement_id ? 'On' : 'Off'}</Pill> Google Analytics 4 in the browser</li>
        <li><Pill tone={tracking.ga4 ? 'ok' : 'warn'}>{tracking.ga4 ? 'On' : 'Needs secret'}</Pill> GA4 purchase from the server {tracking.ga4 ? '' : '(add GA4_API_SECRET to the server .env)'}</li>
        <li><Pill tone="ok">On</Pill> Store's own funnel and UTM tracking (below), no setup needed</li>
      </ul>
      {fe._ && <p className="field__error">{fe._}</p>}
      <button className="btn btn--primary btn--sm">Save tracking IDs</button>
    </form>
  );
}

function AdSpend({ onChange }) {
  const [rows, reload] = useAdminData('/admin/ad-spend');
  const toast = useToast();
  const [f, setF] = useState({ month: new Date().toISOString().slice(0, 7), source: 'instagram', campaign: 'diwali-test', amount: '', notes: '' });
  const [fe, setFe] = useState({});
  const add = async (e) => {
    e.preventDefault();
    try { await api.post('/admin/ad-spend', { ...f, amount: Number(f.amount) }); setF({ ...f, amount: '', notes: '' }); setFe({}); reload(); onChange(); toast('Spend added'); }
    catch (x) { setFe(x.fields || { _: x.message }); }
  };
  return (
    <section className="card form">
      <h2>💸 Ad &amp; creator spend</h2>
      <p className="small muted">Enter what you spent per campaign each month (from Meta Ads Manager, creator invoices, Google Ads). Use the same source and campaign words as your tracked links so ROAS and profit line up.</p>
      <form className="spend-form" onSubmit={add}>
        <Field label="Month" id="sp-month" error={fe.month}><input id="sp-month" type="month" value={f.month} onChange={(e) => setF({ ...f, month: e.target.value })} /></Field>
        <Field label="Source" id="sp-src" error={fe.source}><input id="sp-src" value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })} /></Field>
        <Field label="Campaign" id="sp-camp"><input id="sp-camp" value={f.campaign} onChange={(e) => setF({ ...f, campaign: e.target.value })} /></Field>
        <Field label="Amount (₹)" id="sp-amt" error={fe.amount}><input id="sp-amt" type="number" min="0" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} required /></Field>
        <button className="btn btn--primary btn--sm">Add</button>
      </form>
      {fe._ && <p className="field__error">{fe._}</p>}
      {rows?.length > 0 && (
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Table">
          <table className="table">
            <thead><tr><th>Month</th><th>Source</th><th>Campaign</th><th className="num">Amount</th><th /></tr></thead>
            <tbody>{rows.map((r) => <tr key={r.id}><td>{r.month}</td><td>{r.source}</td><td>{r.campaign || '—'}</td><td className="num">{rupees(r.amount)}</td><td><button className="link-btn" onClick={async () => { await api.del(`/admin/ad-spend/${r.id}`); reload(); onChange(); }}>Remove</button></td></tr>)}</tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Abandoned() {
  const [rows, reload] = useAdminData('/admin/abandoned');
  const toast = useToast();
  if (!rows) return <Spinner />;
  const wa = (c) => {
    const d = String(c.phone || '').replace(/\D/g, '');
    const num = d.length === 10 ? `91${d}` : d;
    const text = `Namaste ${(c.name || '').split(' ')[0]}! Your Utsav Ghar cart is saved. Complete your order here: ${c.cart_url}`;
    return `https://wa.me/${num}?text=${encodeURIComponent(text)}`;
  };
  return (
    <section className="card">
      <h2>🛒 Unfinished checkouts</h2>
      <p className="small muted">People who filled in their details but didn't place the order. Customers who ticked the reminder box get an automatic reminder after an hour and a last one the next day (when email or WhatsApp is set up); subscribers also see their cart at the top of their next picks message. Message others only about their order if they ask.</p>
      {rows.length === 0 ? <Empty icon="🛒" title="No unfinished checkouts" /> : (
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Table">
          <table className="table">
            <thead><tr><th>When</th><th>Customer</th><th>Items</th><th className="num">Value</th><th>Source</th><th>Reminder</th><th /></tr></thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id}>
                  <td>{fmtDateTime(c.updated_at)}</td>
                  <td>{c.name || '—'}<br /><span className="muted small">{c.phone} {c.email ? `· ${c.email}` : ''}{c.country && c.country !== 'IN' ? ` · ${countryName(c.country)}` : ''}</span></td>
                  <td>{c.items.reduce((s, i) => s + i.qty, 0)}</td>
                  <td className="num">{rupees(c.value)}</td>
                  <td>{c.utm_source || 'direct'}{c.utm_campaign ? ` / ${c.utm_campaign}` : ''}</td>
                  <td>{c.reminded2_at ? <Pill tone="ok">2 sent · last {fmtDateTime(c.reminded2_at)}</Pill> : c.reminded_at ? <Pill tone="ok">Sent {fmtDateTime(c.reminded_at)}</Pill> : c.consent ? <Pill tone="info">Allowed</Pill> : <Pill tone="muted">No consent</Pill>}</td>
                  <td className="row gap-s">
                    {c.consent && !c.reminded_at && <button className="btn btn--ghost btn--sm" onClick={async () => { try { await api.post(`/admin/abandoned/${c.id}/remind`); toast('Reminder sent'); reload(); } catch (x) { toast(x.message, 'warn'); } }}>Send reminder</button>}
                    {c.consent && c.phone && <a className="btn btn--ghost btn--sm" href={wa(c)} target="_blank" rel="noreferrer">WhatsApp</a>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function Marketing() {
  const [days, setDays] = useState(30);
  const [d, reload] = useAdminData(`/admin/marketing?days=${days}`);
  if (!d) return <Spinner />;
  const t = d.totals;
  const x = (v, f) => (v == null ? '—' : f(v));
  return (
    <>
      <PageHead title="Marketing" sub="Where visitors come from, what they buy, and what your ads really earn after product costs.">
        <div className="tabs" role="tablist">
          {[7, 30, 90].map((n) => <button key={n} role="tab" aria-selected={days === n} className={days === n ? 'is-on' : ''} onClick={() => setDays(n)}>Last {n} days</button>)}
        </div>
      </PageHead>
      <div className="kpis">
        <div className="kpi"><span className="kpi__label">Visits</span><b className="kpi__value">{t.sessions.toLocaleString('en-IN')}</b><span className="kpi__sub">{t.paid} paid orders · {t.sessions ? Math.round((t.paid / t.sessions) * 1000) / 10 : 0}% conversion</span></div>
        <div className="kpi"><span className="kpi__label">Revenue (paid)</span><b className="kpi__value">{rupees(t.revenue)}</b><span className="kpi__sub">average order {rupees(t.aov)}</span></div>
        <div className="kpi"><span className="kpi__label">Ad &amp; creator spend</span><b className="kpi__value">{rupees(t.spend)}</b><span className="kpi__sub">ROAS {x(t.roas, (v) => `${v}×`)} · cost per order {x(t.cpa, rupees)}</span></div>
        <div className={`kpi ${t.profit_after_ads < 0 ? 'kpi--bad' : 'kpi--good'}`}><span className="kpi__label">Profit after ads</span><b className="kpi__value">{rupees(t.profit_after_ads)}</b><span className="kpi__sub">gross profit {rupees(t.gross_profit)} − spend</span></div>
      </div>

      <div className="adm-grid">
        <section className="card adm-grid__wide">
          <h2>Funnel</h2>
          <Funnel steps={d.funnel} />
          <p className="small muted">Visitors counted by browsing session. {d.abandoned.n > 0 ? `${d.abandoned.n} unfinished checkout${d.abandoned.n > 1 ? 's' : ''} worth ${rupees(d.abandoned.v)} in this period.` : ''}</p>
        </section>
        <section className="card">
          <h2>Rules of thumb</h2>
          <ul className="attn">
            <li>Add to cart under 4% of visits → fix product pages before buying traffic.</li>
            <li>Cost per order above your break-even (Profit page) for a week → pause and test new creatives.</li>
            <li>Raise a winning campaign's budget 20% every 2–3 days, not all at once.</li>
          </ul>
        </section>
      </div>

      <section className="card">
        <h2>By source and campaign</h2>
        {d.sources.length === 0 ? <Empty icon="📊" title="No visits recorded yet">Share your tracked links and the table fills in.</Empty> : (
          <div className="table-wrap" tabIndex={0} role="region" aria-label="Table">
            <table className="table">
              <thead><tr><th>Source</th><th>Campaign</th><th className="num">Visits</th><th className="num">Orders</th><th className="num">Paid</th><th className="num">Conv.</th><th className="num">Revenue</th><th className="num">Spend</th><th className="num">ROAS</th><th className="num">Cost / order</th><th className="num">Profit after ads</th></tr></thead>
              <tbody>
                {d.sources.map((r) => (
                  <tr key={`${r.source}|${r.campaign}`}>
                    <td><b>{r.source}</b></td><td>{r.campaign || '—'}</td>
                    <td className="num">{r.sessions}</td><td className="num">{r.orders}</td><td className="num">{r.paid}</td>
                    <td className="num">{x(r.conversion_pct, (v) => `${v}%`)}</td>
                    <td className="num">{rupees(r.revenue)}</td><td className="num">{r.spend ? rupees(r.spend) : '—'}</td>
                    <td className="num">{x(r.roas, (v) => `${v}×`)}</td><td className="num">{x(r.cpa, rupees)}</td>
                    <td className={`num ${r.profit_after_ads < 0 ? 'bad-text' : ''}`}><b>{rupees(r.profit_after_ads)}</b></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="adm-grid adm-grid--even">
        <AdSpend onChange={reload} />
        <LinkBuilder />
      </div>
      <TrackingSetup tracking={d.tracking} onSaved={reload} />
      <Abandoned />
    </>
  );
}
