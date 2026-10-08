/**
 * Admin → Support: customer requests inbox, conversation, quick replies,
 * status & priority, linked order.
 */
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { QUICK_REPLIES, TICKET_STATUS } from '@shared/support.js';
import { api } from '../lib/api.js';
import { fmtDateTime, rupees, STATUS_LABEL, PAYMENT_LABEL } from '../lib/format.js';
import { Pill, Spinner, Empty } from '../components/ui.jsx';
import { useToast } from '../state/store.jsx';
import { PageHead, useAdminData } from './pages.jsx';

const TONE = { open: 'info', in_progress: 'info', waiting: 'warn', resolved: 'ok', closed: 'muted' };
const PRI = { urgent: 'bad', high: 'warn', normal: 'muted' };

function Thread({ number, onChange }) {
  const [t, setT] = useState(null);
  const [msg, setMsg] = useState('');
  const [status, setStatus] = useState('waiting');
  const toast = useToast();
  useEffect(() => { setT(null); api.get(`/admin/support/tickets/${number}`).then(setT).catch((e) => toast(e.message, 'warn')); }, [number]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!t) return <Spinner />;
  const reply = async (e) => {
    e.preventDefault();
    try { setT(await api.post(`/admin/support/tickets/${number}/reply`, { message: msg, status })); setMsg(''); toast('Reply sent — customer notified'); onChange(); } catch (x) { toast(x.message, 'warn'); }
  };
  const patch = async (b) => { try { setT(await api.patch(`/admin/support/tickets/${number}`, b)); onChange(); } catch (x) { toast(x.message, 'warn'); } };
  return (
    <div className="sthread">
      <header className="sthread__head">
        <div>
          <h2>{t.number} · {t.topic_label}</h2>
          <p className="small"><b>{t.name}</b>{t.phone ? ` · ${t.phone}` : ''}{t.email ? ` · ${t.email}` : ''} · via {t.source} · {fmtDateTime(t.created_at)}</p>
          {t.order && <p className="small">Order <Link className="link" to={`/admin/orders?q=${t.order.order_number}`}>#{t.order.order_number}</Link> · {STATUS_LABEL[t.order.status]} · {PAYMENT_LABEL[t.order.payment_status]} · {rupees(t.order.total)}</p>}
          {t.rating && <p className="small">Customer rating: {'★'.repeat(t.rating)}{'☆'.repeat(5 - t.rating)}</p>}
        </div>
        <div className="row gap-s wrap">
          <select value={t.status} onChange={(e) => patch({ status: e.target.value })} aria-label="Status">{Object.entries(TICKET_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <select value={t.priority} onChange={(e) => patch({ priority: e.target.value })} aria-label="Priority"><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select>
        </div>
      </header>
      <ul className="thread">
        {t.messages.map((m) => (
          <li key={m.id} className={`msg msg--${m.author === 'customer' ? 'admin' : m.author === 'admin' ? 'customer' : 'system'}`}>
            <span className="msg__who">{m.author === 'customer' ? t.name : m.author === 'admin' ? 'You (team)' : 'ℹ️ Auto'}</span>
            <p>{m.body}</p>
            {(m.image || m.has_image) && <a href={m.image || `/api/admin/support/tickets/${t.number}/messages/${m.id}/image`} target="_blank" rel="noreferrer"><img className="msg__img" src={m.image || `/api/admin/support/tickets/${t.number}/messages/${m.id}/image`} alt="Customer photo" /></a>}
            <time className="small muted">{fmtDateTime(m.created_at)}</time>
          </li>
        ))}
      </ul>
      {t.status !== 'closed' && (
        <form className="reply" onSubmit={reply}>
          <div className="qr">{QUICK_REPLIES.map(([label, text]) => <button key={label} type="button" className="chip" onClick={() => setMsg(text)}>{label}</button>)}</div>
          <textarea rows={4} value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Write a reply… the customer gets it on WhatsApp / email" aria-label="Reply" />
          <div className="row between wrap gap-s">
            <label className="small">After sending: <select value={status} onChange={(e) => setStatus(e.target.value)}><option value="waiting">Wait for customer</option><option value="in_progress">Keep working on it</option><option value="resolved">Mark resolved</option></select></label>
            <button className="btn btn--primary" disabled={!msg.trim()}>Send reply</button>
          </div>
        </form>
      )}
    </div>
  );
}

export function Support() {
  const { number } = useParams();
  const nav = useNavigate();
  const [status, setStatus] = useState('active');
  const [q, setQ] = useState('');
  const [d, reload] = useAdminData(`/admin/support/tickets?status=${status}${q ? `&q=${encodeURIComponent(q)}` : ''}`);
  const c = d?.counts || {};
  return (
    <>
      <PageHead title="Customer support" sub="Problems customers raised from the Help Center, chat and order pages. Reply here — they get it on WhatsApp / email." />
      <div className="kpis">
        <div className="kpi kpi--bad"><span className="kpi__label">Open</span><b className="kpi__value">{(c.open || 0) + (c.in_progress || 0)}</b><span className="kpi__sub">need a reply from us</span></div>
        <div className="kpi"><span className="kpi__label">Waiting for customer</span><b className="kpi__value">{c.waiting || 0}</b></div>
        <div className="kpi kpi--good"><span className="kpi__label">Resolved</span><b className="kpi__value">{(c.resolved || 0) + (c.closed || 0)}</b></div>
        <div className="kpi"><span className="kpi__label">Satisfaction</span><b className="kpi__value">{d?.satisfaction ? `${d.satisfaction.avg}★` : '—'}</b><span className="kpi__sub">{d?.satisfaction ? `${d.satisfaction.n} ratings` : 'no ratings yet'}</span></div>
      </div>
      <div className="support">
        <section className="card support__list">
          <div className="row gap-s wrap">
            <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter"><option value="active">Needs attention</option><option value="open">Open</option><option value="waiting">Waiting for customer</option><option value="resolved">Resolved</option><option value="closed">Closed</option><option value="all">All</option></select>
            <input type="search" placeholder="Search name, phone, order, HELP-…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search requests" />
          </div>
          {!d ? <Spinner /> : d.items.length === 0 ? <Empty icon="🎉" title="No requests here">Nothing waiting. Customers raise requests from the Help Center and chat.</Empty> : (
            <ul className="tickets">
              {d.items.map((t) => (
                <li key={t.number}>
                  <button className={`tk ${number === t.number ? 'is-on' : ''}`} onClick={() => nav(`/admin/support/${t.number}`)}>
                    <span className="tk__top"><b>{t.number}</b> <Pill tone={PRI[t.priority]}>{t.priority}</Pill> <Pill tone={TONE[t.status]}>{TICKET_STATUS[t.status]}</Pill>{t.awaiting_us && <span className="tk__dot" title="Customer is waiting for us">●</span>}</span>
                    <span className="tk__topic">{t.topic_label}{t.order_number ? ` · #${t.order_number}` : ''}</span>
                    <span className="tk__who small">{t.name} · {fmtDateTime(t.updated_at)}</span>
                    <span className="tk__last small muted">{t.last_body}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="card support__thread">
          {number ? <Thread number={number} onChange={reload} /> : <Empty icon="💬" title="Pick a request">Open a request on the left to read and reply.</Empty>}
        </section>
      </div>
    </>
  );
}
