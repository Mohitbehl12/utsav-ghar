/**
 * Admin → Customer messages: who signed up, what they'll receive (preview), the
 * festival calendar, sending settings, and results (sent, clicked, ordered).
 */
import { useState } from 'react';
import { api } from '../lib/api.js';
import { rupees, fmtDate, fmtDateTime } from '../lib/format.js';
import { Pill, Spinner, Empty, Field } from '../components/ui.jsx';
import { useToast } from '../state/store.jsx';
import { SEGMENTS } from '@shared/festivals.js';
import { PageHead, useAdminData } from './pages.jsx';

const FREQ = { daily: 'Daily', weekly: 'Weekly', festivals: 'Festivals only' };
const seg = (s) => SEGMENTS.find((x) => x.slug === s);

function Preview({ subscriberId }) {
  const [kind, setKind] = useState('picks');
  const [fest, setFest] = useState('');
  const [channel, setChannel] = useState('email');
  const q = `/admin/crm/preview?kind=${kind}${fest ? `&festival=${fest}` : ''}${subscriberId ? `&subscriber=${subscriberId}` : ''}`;
  const [p] = useAdminData(q);
  const [o] = useAdminData('/admin/crm/overview');
  return (
    <section className="card">
      <div className="row between wrap gap-s">
        <h2>👀 Message preview {subscriberId ? '(for this customer)' : '(sample customer)'}</h2>
        <div className="row gap-s wrap">
          <div className="tabs" role="tablist">
            <button role="tab" aria-selected={kind === 'picks'} className={kind === 'picks' ? 'is-on' : ''} onClick={() => setKind('picks')}>Daily / weekly picks</button>
            <button role="tab" aria-selected={kind === 'festival'} className={kind === 'festival' ? 'is-on' : ''} onClick={() => setKind('festival')}>Festival alert</button>
          </div>
          {kind === 'festival' && o && (
            <select value={fest} onChange={(e) => setFest(e.target.value)} aria-label="Festival">
              <option value="">Next festival</option>
              {o.settings.calendar.map((f) => <option key={f.slug} value={f.slug}>{f.emoji} {f.name} · {fmtDate(f.date)}</option>)}
            </select>
          )}
          <div className="tabs" role="tablist">
            <button role="tab" aria-selected={channel === 'email'} className={channel === 'email' ? 'is-on' : ''} onClick={() => setChannel('email')}>✉️ Email</button>
            <button role="tab" aria-selected={channel === 'whatsapp'} className={channel === 'whatsapp' ? 'is-on' : ''} onClick={() => setChannel('whatsapp')}>💬 WhatsApp</button>
          </div>
        </div>
      </div>
      {!p ? <Spinner /> : (
        <>
          <p className="small"><b>Subject:</b> {p.subject}</p>
          {channel === 'email'
            ? <iframe title="Email preview" className="crm-email" srcDoc={p.html} sandbox="" />
            : <div className="crm-wa"><div className="crm-wa__bubble">{p.whatsapp.split('\n').map((l, i) => <p key={i}>{l || ' '}</p>)}</div><div className="crm-wa__btn">🔗 Shop now</div></div>}
          <p className="small muted">Links open the Utsav Ghar app when it's installed on the phone, otherwise the website — straight to these products.</p>
        </>
      )}
    </section>
  );
}

function TestSend() {
  const toast = useToast();
  const [f, setF] = useState({ email: '', phone: '', kind: 'picks' });
  const [busy, setBusy] = useState(false);
  const send = async (e) => {
    e.preventDefault(); setBusy(true);
    try {
      const r = await api.post('/admin/crm/test', f);
      toast(r.results.map((x) => `${x.channel}: ${x.status}${x.error ? ` (${x.error})` : ''}`).join(' · ') || 'Nothing to send', r.results.every((x) => x.status === 'sent') ? 'ok' : 'warn');
    } catch (x) { toast(x.message, 'warn'); } finally { setBusy(false); }
  };
  return (
    <form className="card form" onSubmit={send}>
      <h2>📨 Send a test to yourself</h2>
      <Field label="Your email" id="t-email"><input id="t-email" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
      <Field label="Your WhatsApp number" id="t-phone"><input id="t-phone" type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="98765 43210" /></Field>
      <select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })} aria-label="Message type"><option value="picks">Picks</option><option value="festival">Next festival alert</option></select>
      <button className="btn btn--primary" disabled={busy}>{busy ? 'Sending…' : 'Send test'}</button>
    </form>
  );
}

function Settings({ o, onSaved }) {
  const toast = useToast();
  const [s, setS] = useState(() => ({ ...o.settings }));
  const [cal, setCal] = useState(() => o.settings.calendar.map((f) => ({ ...f })));
  const save = async (e) => {
    e.preventDefault();
    try { await api.put('/admin/crm/settings', { enabled: s.enabled, send_hour: s.send_hour, wa_weekly_cap: s.wa_weekly_cap, app_store_url: s.app_store_url, play_store_url: s.play_store_url, calendar: cal }); toast('Saved'); onSaved(); } catch (x) { toast(x.message, 'warn'); }
  };
  const upd = (i, k, v) => setCal((c) => c.map((f, j) => (j === i ? { ...f, [k]: v } : f)));
  return (
    <form className="card form" onSubmit={save}>
      <h2>⚙️ Sending settings & festival calendar</h2>
      <label className="check"><input type="checkbox" checked={s.enabled} onChange={(e) => setS({ ...s, enabled: e.target.checked })} /><span>Send messages automatically every day</span></label>
      <div className="grid-2">
        <Field label="Send time (India)" id="c-hour"><select id="c-hour" value={s.send_hour} onChange={(e) => setS({ ...s, send_hour: Number(e.target.value) })}>{[8, 9, 10, 11, 12, 17, 18, 19].map((h) => <option key={h} value={h}>{h > 12 ? h - 12 : h}:00 {h >= 12 ? 'PM' : 'AM'}</option>)}</select></Field>
        <Field label="WhatsApp messages per person per week (max)" id="c-cap" hint="Meta limits marketing messages; 2–3 a week keeps your number safe."><input id="c-cap" type="number" min={0} max={7} value={s.wa_weekly_cap} onChange={(e) => setS({ ...s, wa_weekly_cap: Number(e.target.value) })} /></Field>
        <Field label="App Store link (iPhone app)" id="c-ios"><input id="c-ios" value={s.app_store_url} onChange={(e) => setS({ ...s, app_store_url: e.target.value })} placeholder="https://apps.apple.com/…" /></Field>
        <Field label="Play Store link (Android app)" id="c-and"><input id="c-and" value={s.play_store_url} onChange={(e) => setS({ ...s, play_store_url: e.target.value })} placeholder="https://play.google.com/store/apps/details?id=in.utsavghar.app" /></Field>
      </div>
      <div className="table-wrap" tabIndex={0} role="region" aria-label="Table">
        <table className="table">
          <thead><tr><th>On</th><th>Festival</th><th>Date</th><th>Alerts</th><th>Products from</th></tr></thead>
          <tbody>
            {cal.map((f, i) => (
              <tr key={f.slug}>
                <td><input type="checkbox" checked={f.enabled !== false} onChange={(e) => upd(i, 'enabled', e.target.checked)} aria-label={`Send alerts for ${f.name}`} /></td>
                <td>{f.emoji} <b>{f.name}</b>{f.verify && <><br /><Pill tone="warn">Check date</Pill></>}</td>
                <td><input type="date" value={f.date} onChange={(e) => upd(i, 'date', e.target.value)} /></td>
                <td><select value={f.major ? 'major' : 'minor'} onChange={(e) => upd(i, 'major', e.target.value === 'major')}><option value="major">3 alerts (21, 10, 5 days before)</option><option value="minor">1 alert (7 days before)</option></select></td>
                <td className="small">{f.collection ? 'Festival collection (products you ticked)' : (f.categories || []).join(', ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="small muted">If two alerts fall on the same day, the bigger festival goes out. Nobody gets more than one message a day.</p>
      <button className="btn btn--primary">Save settings</button>
    </form>
  );
}

export function Messages() {
  const [o, reload] = useAdminData('/admin/crm/overview');
  const [q, setQ] = useState('');
  const [freq, setFreq] = useState('');
  const [list, reloadList] = useAdminData(`/admin/subscribers?${new URLSearchParams({ ...(q ? { q } : {}), ...(freq ? { frequency: freq } : {}) })}`);
  const [msgs] = useAdminData('/admin/crm/messages');
  const [pick, setPick] = useState(null);
  const toast = useToast();
  if (!o) return <Spinner />;
  const s = o.subscribers;
  const tot = o.last30.reduce((a, r) => ({ sent: a.sent + (r.sent || 0), clicked: a.clicked + (r.clicked || 0), orders: a.orders + (r.orders || 0), skipped: a.skipped + (r.skipped || 0) }), { sent: 0, clicked: 0, orders: 0, skipped: 0 });
  const runNow = async (only) => {
    if (!window.confirm(only === 'festival' ? 'Send today\'s festival alert to everyone who opted in?' : 'Send picks now to everyone whose daily / weekly turn it is?')) return;
    try { const r = await api.post('/admin/crm/run', { only }); toast(`${r.people} people · ${r.sent} sent · ${r.skipped} skipped · ${r.failed} failed`); reload(); reloadList(); } catch (x) { toast(x.message, 'warn'); }
  };
  const remove = async (row) => {
    if (!window.confirm(`Delete ${row.name || row.email || row.phone} and their message history? Use this when a customer asks you to delete their data.`)) return;
    try { await api.del(`/admin/subscribers/${row.id}`); toast('Deleted'); reloadList(); reload(); } catch (x) { toast(x.message, 'warn'); }
  };
  const nextF = o.upcoming[0];
  return (
    <>
      <PageHead title="Customer messages" sub="People who asked for deals get picks based on what they browse and buy, plus an alert before every festival — by WhatsApp and email, with a link that opens your app or website." />
      {(!o.providers.email || !o.providers.whatsapp || !o.providers.whatsappTemplate) && (
        <div className="notice notice--warn">
          <b>To start sending:</b>{' '}
          {!o.providers.email && <>add SMTP details (email) in the server <code>.env</code>. </>}
          {!o.providers.whatsapp && <>Add your WhatsApp Business API token. </>}
          {o.providers.whatsapp && !o.providers.whatsappTemplate && <>Get the marketing template approved by Meta and set <code>WHATSAPP_MARKETING_TEMPLATE</code>. </>}
          Until then messages are prepared and logged as “skipped”. See README → Customer messages.
        </div>
      )}
      <div className="kpis">
        <div className="kpi"><span className="kpi__label">Subscribers</span><b className="kpi__value">{s.active}</b><span className="kpi__sub">+{s.new7} this week · {s.unsubscribed} unsubscribed</span></div>
        <div className="kpi"><span className="kpi__label">On WhatsApp / email</span><b className="kpi__value">{s.whatsapp} / {s.email}</b><span className="kpi__sub">daily {s.daily} · weekly {s.weekly} · festivals {s.festivals}</span></div>
        <div className="kpi"><span className="kpi__label">Sent (30 days)</span><b className="kpi__value">{tot.sent}</b><span className="kpi__sub">{tot.clicked} clicked{tot.sent ? ` (${Math.round((tot.clicked / tot.sent) * 100)}%)` : ''} · {tot.skipped} skipped</span></div>
        <div className="kpi kpi--good"><span className="kpi__label">Orders from messages</span><b className="kpi__value">{tot.orders}</b><span className="kpi__sub">{rupees(o.revenue)} paid revenue</span></div>
      </div>

      <div className="adm-grid">
        <section className="card adm-grid__wide">
          <h2>📅 Coming up</h2>
          {o.today && <p className="notice">Today: <b>{o.today.festival.emoji} {o.today.festival.name}</b> alert ({o.today.daysLeft} days before).</p>}
          <ul className="crm-up">
            {o.upcoming.slice(0, 6).map((f) => (
              <li key={f.slug}><span className="crm-up__emoji">{f.emoji}</span><div><b>{f.name}</b> · {fmtDate(f.date)} <span className="muted">({f.daysLeft} days)</span><br /><span className="small muted">Alerts: {f.alerts.length ? f.alerts.map((a) => fmtDate(a.on)).join(', ') : 'all sent'}</span></div></li>
            ))}
          </ul>
          <p className="small muted">Last automatic run: {o.lastRun ? `${fmtDateTime(o.lastRun.at)} — ${o.lastRun.people} people, ${o.lastRun.sent} sent, ${o.lastRun.skipped} skipped${o.lastRun.festival ? ` (${o.lastRun.festival})` : ''}` : 'not yet'} · sends daily around {o.settings.send_hour > 12 ? o.settings.send_hour - 12 : o.settings.send_hour}:00 {o.settings.send_hour >= 12 ? 'PM' : 'AM'} India time{o.settings.enabled ? '' : ' (automatic sending is OFF)'}.</p>
          <div className="row gap-s wrap">
            <button className="btn btn--ghost btn--sm" onClick={() => runNow('picks')}>Send picks now</button>
            {nextF && <button className="btn btn--ghost btn--sm" onClick={() => runNow('festival')} disabled={!o.today}>Send festival alert now</button>}
          </div>
        </section>
        <TestSend />
      </div>

      <Preview subscriberId={pick} />

      <section className="card">
        <div className="row between wrap gap-s">
          <h2>👥 Subscribers</h2>
          <div className="row gap-s wrap">
            <input type="search" placeholder="Search name, email, phone" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search subscribers" />
            <select value={freq} onChange={(e) => setFreq(e.target.value)} aria-label="Frequency"><option value="">All</option>{Object.entries(FREQ).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            {!__DEMO__ && <a className="btn btn--ghost btn--sm" href="/api/admin/subscribers/export.csv">Export CSV</a>}
          </div>
        </div>
        {!list ? <Spinner /> : list.items.length === 0 ? <Empty icon="🔔" title="No subscribers yet">They sign up from the “Get deals” card, the footer button, checkout or registration.</Empty> : (
          <div className="table-wrap" tabIndex={0} role="region" aria-label="Table">
            <table className="table">
              <thead><tr><th>Customer</th><th>Channels</th><th>How often</th><th>Likes</th><th>From</th><th className="num">Sent</th><th className="num">Clicked</th><th className="num">Orders</th><th>Status</th><th /></tr></thead>
              <tbody>
                {list.items.map((r) => (
                  <tr key={r.id} className={pick === r.id ? 'is-picked' : ''}>
                    <td><b>{r.name || '—'}</b><br /><span className="small muted">{r.phone}{r.phone && r.email ? ' · ' : ''}{r.email}</span></td>
                    <td>{r.whatsapp_opt_in ? '💬 ' : ''}{r.email_opt_in ? '✉️' : ''}</td>
                    <td>{FREQ[r.frequency]}</td>
                    <td className="small">{r.interests.map((x) => seg(x)?.icon).join(' ') || '—'}</td>
                    <td className="small">{r.source}<br /><span className="muted">{fmtDate(r.created_at)}</span></td>
                    <td className="num">{r.sent}</td><td className="num">{r.clicked}</td><td className="num">{r.orders}</td>
                    <td>{r.status === 'active' ? <Pill tone="ok">Active</Pill> : <Pill tone="muted">Unsubscribed</Pill>}</td>
                    <td className="row gap-s"><button className="btn btn--ghost btn--sm" onClick={() => setPick(r.id)}>Preview</button><button className="btn btn--ghost btn--sm" onClick={() => remove(r)} aria-label="Delete subscriber">🗑</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="small muted">Only people who ticked the consent box are here. Each message has a one-tap unsubscribe; unsubscribed people are never messaged. Delete a person when they ask you to remove their data.</p>
      </section>

      <section className="card">
        <h2>📬 Recent messages</h2>
        {!msgs ? <Spinner /> : msgs.length === 0 ? <Empty icon="📬" title="Nothing sent yet" /> : (
          <div className="table-wrap" tabIndex={0} role="region" aria-label="Table">
            <table className="table">
              <thead><tr><th>When</th><th>To</th><th>Type</th><th>Subject</th><th>Status</th><th className="num">Clicks</th><th>Order</th></tr></thead>
              <tbody>
                {msgs.slice(0, 30).map((m) => (
                  <tr key={m.id}>
                    <td className="small">{fmtDateTime(m.created_at)}</td>
                    <td className="small">{m.channel === 'whatsapp' ? '💬' : '✉️'} {m.name || m.email || m.phone || 'test'}</td>
                    <td>{m.kind}</td><td className="small">{m.subject}</td>
                    <td><Pill tone={m.status === 'sent' ? 'ok' : m.status === 'failed' ? 'bad' : 'muted'}>{m.status}</Pill>{m.error && <><br /><span className="small muted">{m.error}</span></>}</td>
                    <td className="num">{m.clicks}</td><td>{m.order_id ? '✅' : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Settings o={o} onSaved={reload} />
    </>
  );
}
