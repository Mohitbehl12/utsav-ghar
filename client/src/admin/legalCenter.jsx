/**
 * Admin → Legal & Compliance Center.
 * Overview (KPIs, workflow, categories, attention list, activity, launch checklist) · Policy library
 * (search, filters, cards/table, create wizard, editor, version history, review workflow) · Acceptance
 * tracking · Dealer compliance (legal profiles, account health, violations, KYC & document expiry) ·
 * Legal calendar · Notifications · Audit trail · Settings.
 * Policy wording is our own; every document goes Draft → Internal review → Legal review → Approved → Published.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, fetchFile, saveBlob } from '../lib/api.js';
import { fmtDate, fmtDateTime } from '../lib/format.js';
import { Field, Spinner, Empty, Modal } from '../components/ui.jsx';
import { useToast } from '../state/store.jsx';
import { DocViewer, LegalDocView } from '../components/Legal.jsx';
import { Company, Records } from './legal.jsx';
import { DOC_KINDS, DISPLAY_STATUS, POLICY_CATEGORIES, POLICY_TYPES, APPLIES_TO, FLOW_STEPS, AUDIT_ACTIONS } from '@shared/legal.js';
import { HEALTH_LEVELS, HEALTH_METRICS, SEVERITY, VIOLATION_TYPES, VIOLATION_STATUS, VIOLATION_ACTIONS, DOC_EXPIRY, toCsv, setIntro } from '@shared/compliance.js';
import '../styles/legalCenter.css';

const openBlob = async (path) => { try { const b = await fetchFile(path); window.open(URL.createObjectURL(b), '_blank', 'noopener'); } catch { /* */ } };
const download = async (path, name) => { try { saveBlob(await fetchFile(path), name); } catch { /* */ } };
const day = (t) => (t ? fmtDate(t) : '—');
const today = () => new Date().toISOString().slice(0, 10);
const plusDays = (n, from = Date.now()) => new Date(from + n * 864e5).toISOString().slice(0, 10);
const errText = (e) => (e?.fields ? Object.values(e.fields)[0] : e?.message || 'Something went wrong');

// ---------------------------------------------------------------- small pieces
export function StatusBadge({ s, label }) {
  const d = DISPLAY_STATUS[s] || { label: s, icon: '•', tone: 'muted' };
  return <span className={`lc-st lc-st--${d.tone}`}><span aria-hidden="true">{d.icon}</span> {label || d.label}</span>;
}
const Tone = ({ tone, children }) => <span className={`lc-st lc-st--${tone}`}>{children}</span>;
function Ring({ pct, size = 64, stroke = 8, tone = 'ok', label }) {
  const r = (size - stroke) / 2; const c = 2 * Math.PI * r; const v = Math.max(0, Math.min(100, pct ?? 0));
  return (
    <svg className={`lc-ring lc-ring--${tone}`} width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label || `${v}%`}>
      <circle cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} className="lc-ring__bg" />
      <circle cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} className="lc-ring__fg" strokeDasharray={`${(v / 100) * c} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle">{pct == null ? '—' : `${Math.round(v)}%`}</text>
    </svg>
  );
}
function Stack({ parts }) {
  const total = parts.reduce((a, p) => a + p.v, 0) || 1;
  return (
    <div className="lc-stack" role="img" aria-label={parts.map((p) => `${p.label} ${p.v}`).join(', ')}>
      {parts.filter((p) => p.v).map((p) => <span key={p.label} className={`lc-stack__p lc-stack__p--${p.tone}`} style={{ width: `${(p.v / total) * 100}%` }} title={`${p.label}: ${p.v}`} />)}
    </div>
  );
}
function SubTabs({ tabs, value, onChange }) {
  return <div className="lc-subtabs" role="tablist">{tabs.map(([k, l, n]) => <button key={k} role="tab" aria-selected={value === k} className={value === k ? 'is-on' : ''} onClick={() => onChange(k)}>{l}{n ? <span className="lc-count">{n}</span> : null}</button>)}</div>;
}

// ---------------------------------------------------------------- page
const TABS = [['overview', '🏠', 'Overview'], ['library', '📚', 'Policy library'], ['acceptance', '✅', 'Acceptance'], ['dealers', '🏪', 'Dealer compliance'], ['calendar', '🗓️', 'Calendar'], ['notices', '🔔', 'Notifications'], ['audit', '🧾', 'Audit trail'], ['settings', '⚙️', 'Settings']];

export function LegalCenter({ role }) {
  const owner = role === 'owner' || role === 'legal'; // can change legal documents (server checks too)
  const [tab, setTab] = useState('overview');
  const [c, setC] = useState(null);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const [editId, setEditId] = useState(null);
  const [wizard, setWizard] = useState(false);
  const [history, setHistory] = useState(null);
  const [dealerSub, setDealerSub] = useState('profiles');
  const nav = useNavigate();
  const load = useCallback(() => api.get('/admin/legal/center').then(setC).catch(() => setC(false)), []);
  useEffect(() => { load(); }, [load]);
  const go = (t, f) => { setTab(t); if (f) setFilter(f); window.scrollTo?.({ top: 0, behavior: 'smooth' }); };
  const openLink = (link) => {
    if (!link) return;
    if (link.startsWith('policy:')) setHistory(link.slice(7));
    else if (link.startsWith('dealer:')) nav(`/admin/dealer-verification/${link.slice(7)}`);
  };
  if (c === false) return <Empty icon="⚖️" title="Could not load the Legal & Compliance Center" />;
  if (editId) return <Editor id={editId} owner={owner} onClose={() => { setEditId(null); load(); }} />;
  return (
    <div className="lc">
      <header className="lc-hero">
        <div className="lc-hero__txt">
          <span className="lc-hero__eyebrow">Utsav Ghar · Legal</span>
          <h1>⚖️ Legal &amp; Compliance Center</h1>
          <p>Manage all customer, dealer and company policies from one place — create, review, approve, publish, track acceptance and audit.</p>
        </div>
        <div className="lc-hero__tools">
          <form className="lc-search" role="search" onSubmit={(e) => { e.preventDefault(); go('library'); }}>
            <span aria-hidden="true">🔎</span>
            <input aria-label="Search policies, agreements or compliance rules" placeholder="Search policies, agreements or compliance rules…" value={q} onChange={(e) => { setQ(e.target.value); if (e.target.value && tab !== 'library') setTab('library'); }} />
            {q && <button type="button" className="lc-search__x" aria-label="Clear search" onClick={() => setQ('')}>✕</button>}
          </form>
          <div className="row gap-s">
            {owner && <button className="lc-btn lc-btn--gold" onClick={() => setWizard(true)}>＋ Create New Policy</button>}
            <button className="lc-bell" aria-label={`Notifications${c?.unread ? `, ${c.unread} new` : ''}`} onClick={() => go('notices')}>🔔{c?.unread ? <span>{c.unread}</span> : null}</button>
          </div>
        </div>
      </header>
      <nav className="lc-tabs" role="tablist" aria-label="Legal & Compliance sections">
        {TABS.map(([k, i, l]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'is-on' : ''} onClick={() => go(k)}><span aria-hidden="true">{i}</span> {l}{k === 'notices' && c?.unread ? <span className="lc-count">{c.unread}</span> : null}</button>)}
      </nav>
      {!c ? <Spinner /> : (
        <>
          {tab === 'overview' && <Overview c={c} go={go} openHistory={setHistory} openLink={openLink} owner={owner} onCreate={() => setWizard(true)} setDealerSub={setDealerSub} />}
          {tab === 'library' && <Library c={c} q={q} setQ={setQ} filter={filter} setFilter={setFilter} owner={owner} reload={load} openEdit={setEditId} openHistory={setHistory} />}
          {tab === 'acceptance' && <Acceptance go={go} setDealerSub={setDealerSub} />}
          {tab === 'dealers' && <DealerCompliance owner={owner} sub={dealerSub} setSub={setDealerSub} />}
          {tab === 'calendar' && <Calendar openLink={openLink} />}
          {tab === 'notices' && <Notices openLink={openLink} onRead={load} />}
          {tab === 'audit' && <Audit />}
          {tab === 'settings' && <Settings role={role} />}
        </>
      )}
      {wizard && c && <Wizard cards={c.cards} onClose={() => setWizard(false)} onOpen={(id) => { setWizard(false); setEditId(id); }} />}
      {history && <History kind={history} owner={owner} onClose={() => setHistory(null)} onChanged={load} openEdit={(id) => { setHistory(null); setEditId(id); }} />}
    </div>
  );
}

// ---------------------------------------------------------------- overview
function Overview({ c, go, openHistory, openLink, owner, onCreate, setDealerSub }) {
  const k = c.kpis;
  const count = (s) => c.cards.filter((x) => x.state === s).length;
  const stages = [
    ['draft', count('draft')], ['internal_review', k.internal], ['legal_review', k.legal], ['approved', k.ready_to_publish],
    ['scheduled', count('scheduled')], ['published', k.active], ['acceptance', k.acceptance_rate == null ? '—' : `${k.acceptance_rate}%`],
  ];
  const attention = [
    ...c.review_queue.map((r) => ({ icon: '🔵', text: `${r.title} v${r.version}`, sub: `${r.label} since ${day(r.since)}`, act: () => openHistory(r.kind) })),
    ...c.cards.filter((x) => x.working?.status === 'approved').map((x) => ({ icon: '✅', text: `${x.label} v${x.working.version}`, sub: 'Approved — ready to publish', act: () => openHistory(x.kind) })),
    ...c.cards.filter((x) => x.working?.status === 'changes_requested').map((x) => ({ icon: '🟠', text: `${x.label} v${x.working.version}`, sub: `Changes requested${x.working.review_note ? `: ${x.working.review_note}` : ''}`, act: () => openHistory(x.kind) })),
    ...c.cards.filter((x) => x.state === 'expired').map((x) => ({ icon: '🔴', text: x.label, sub: `Review was due ${day(x.next_review_at)}`, act: () => openHistory(x.kind) })),
    ...c.cards.filter((x) => x.current_id && x.legal_approved === false).slice(0, 6).map((x) => ({ icon: '⚠️', text: x.label, sub: 'Live text is a sample — not reviewed by a lawyer', act: () => openHistory(x.kind) })),
  ];
  return (
    <div className="lc-stackv">
      <section className="lc-kpis" aria-label="Summary">
        <button className="lc-kpi lc-kpi--green" onClick={() => go('library', 'published')}>
          <span className="lc-kpi__ic" aria-hidden="true">📗</span>
          <span className="lc-kpi__lbl">Active Policies</span>
          <b className="lc-kpi__num">{k.active}</b>
          <span className="lc-kpi__meta">of {k.total} policies · <span className="up">+{k.published_30d}</span> published in 30 days</span>
          <span className="lc-kpi__bar"><span style={{ width: `${(k.active / Math.max(1, k.total)) * 100}%` }} /></span>
        </button>
        <button className="lc-kpi lc-kpi--blue" onClick={() => go('library', 'review')}>
          <span className="lc-kpi__ic" aria-hidden="true">🔍</span>
          <span className="lc-kpi__lbl">Pending Review</span>
          <b className="lc-kpi__num">{k.pending_review}</b>
          <span className="lc-kpi__meta">{k.internal} internal · {k.legal} with legal · {k.ready_to_publish} ready to publish</span>
          <span className="lc-kpi__chips">{k.changes_requested ? <Tone tone="orange">🟠 {k.changes_requested} changes requested</Tone> : <Tone tone="muted">No changes requested</Tone>}</span>
        </button>
        <button className="lc-kpi lc-kpi--amber" onClick={() => go('calendar')}>
          <span className="lc-kpi__ic" aria-hidden="true">⏳</span>
          <span className="lc-kpi__lbl">Expiring Soon</span>
          <b className="lc-kpi__num">{k.expiring}</b>
          <span className="lc-kpi__meta">review due within 30 days{k.overdue ? <> · <span className="down">{k.overdue} overdue</span></> : ''}</span>
          <span className="lc-kpi__chips">{k.no_review_date ? <Tone tone="warn">{k.no_review_date} live without a review date</Tone> : <Tone tone="ok">All live policies have a review date</Tone>}</span>
        </button>
        <button className="lc-kpi lc-kpi--plum" onClick={() => go('acceptance')}>
          <span className="lc-kpi__ic" aria-hidden="true">🤝</span>
          <span className="lc-kpi__lbl">User Acceptance</span>
          <span className="lc-kpi__ringrow"><Ring pct={k.acceptance_rate} tone={k.acceptance_rate >= 95 ? 'ok' : k.acceptance_rate >= 80 ? 'warn' : 'bad'} /><span className="lc-kpi__meta">{k.acceptance_ok} of {k.acceptance_required} required acceptances<br />{k.acceptance_pending} still pending</span></span>
        </button>
      </section>

      {k.unreviewed_live > 0 && (
        <div className="lc-alert" role="note">
          <span aria-hidden="true">⚠️</span>
          <div><b>{k.unreviewed_live} live document{k.unreviewed_live > 1 ? 's are' : ' is'} still sample text.</b> Create a new version, pass internal and legal review, and publish it before launch. Nothing here is legal advice; a qualified lawyer must approve every document.</div>
          <button className="lc-btn lc-btn--ghost" onClick={() => go('library', 'published')}>Review them</button>
        </div>
      )}

      <section className="lc-card">
        <div className="lc-card__head"><h2>Approval workflow</h2><span className="muted small">Nothing becomes active without approval</span></div>
        <ol className="lc-flow">
          {FLOW_STEPS.map(([key, label], i) => {
            const n = stages[i][1];
            return <li key={key} className={`lc-flow__s lc-flow__s--${key}`}><span className="lc-flow__n">{n}</span><span className="lc-flow__l">{label}</span>{i < FLOW_STEPS.length - 1 && <span className="lc-flow__arrow" aria-hidden="true">→</span>}</li>;
          })}
        </ol>
      </section>

      <section className="lc-cats">
        {c.categories.map((cat) => {
          const list = c.cards.filter((x) => x.category === cat.key);
          return (
            <article key={cat.key} className={`lc-cat lc-cat--${cat.key}`}>
              <div className="lc-cat__top"><span className="lc-cat__ic" aria-hidden="true">{cat.icon}</span><div><h3>{cat.label}</h3><p className="small muted">{cat.hint}</p></div></div>
              <div className="lc-cat__nums"><b>{cat.live}</b><span>live of {cat.total}</span><b>{cat.in_progress}</b><span>in progress</span></div>
              <Stack parts={[{ v: cat.live, tone: 'ok', label: 'Live' }, { v: cat.in_progress, tone: 'info', label: 'In progress' }, { v: Math.max(0, cat.total - cat.live - cat.in_progress), tone: 'muted', label: 'Other' }]} />
              <ul className="lc-cat__list">{list.slice(0, 7).map((x) => <li key={x.kind}><button className="link-btn" onClick={() => openHistory(x.kind)}><span aria-hidden="true">{x.icon}</span> {x.label}</button><span className={`lc-dot lc-dot--${x.tone}`} title={x.state_label} /></li>)}</ul>
              <button className="lc-btn lc-btn--ghost lc-btn--sm" onClick={() => go('library', cat.key)}>See all {list.length} →</button>
            </article>
          );
        })}
      </section>

      <div className="lc-two">
        <section className="lc-card">
          <div className="lc-card__head"><h2>Needs your attention</h2><span className="lc-count">{attention.length}</span></div>
          {!attention.length ? <p className="muted">All clear 🎉</p> : <ul className="lc-attn">{attention.slice(0, 10).map((a, i) => <li key={i}><button onClick={a.act}><span aria-hidden="true">{a.icon}</span><span><b>{a.text}</b><small>{a.sub}</small></span><span aria-hidden="true">›</span></button></li>)}</ul>}
          <div className="row wrap gap-s"><button className="lc-btn lc-btn--ghost lc-btn--sm" onClick={() => { setDealerSub('violations'); go('dealers'); }}>🚩 Policy violations</button><button className="lc-btn lc-btn--ghost lc-btn--sm" onClick={() => { setDealerSub('documents'); go('dealers'); }}>🪪 Expiring documents</button>{owner && <button className="lc-btn lc-btn--ghost lc-btn--sm" onClick={onCreate}>＋ New policy</button>}</div>
        </section>
        <section className="lc-card">
          <div className="lc-card__head"><h2>Recent legal activity</h2><button className="link-btn small" onClick={() => go('audit')}>Full audit trail →</button></div>
          <ol className="lc-timeline">{c.recent.map((a) => <li key={a.id}><span className="lc-timeline__dot" /><div><b>{a.actor_type === 'admin' ? a.actor_name || 'Admin' : a.actor_type === 'dealer' ? `Dealer D-${a.actor_id}` : a.actor_type === 'customer' ? `Customer C-${a.actor_id}` : a.actor_type}</b> {a.label.toLowerCase()}{a.detail?.title ? <> · {a.detail.title}{a.detail.version ? ` v${a.detail.version}` : ''}</> : a.detail?.kind ? <> · {DOC_KINDS[a.detail.kind]?.label || a.detail.kind}{a.detail.version ? ` v${a.detail.version}` : ''}</> : null}<small>{fmtDateTime(a.at)}</small></div></li>)}</ol>
        </section>
      </div>

      <div className="lc-two">
        <section className="lc-card">
          <div className="lc-card__head"><h2>Policies by status</h2></div>
          <Stack parts={Object.entries(c.states).map(([s, v]) => ({ v, tone: DISPLAY_STATUS[s]?.tone || 'muted', label: DISPLAY_STATUS[s]?.label || s }))} />
          <ul className="lc-legend">{Object.entries(c.states).map(([s, v]) => <li key={s}><StatusBadge s={s} /> <b>{v}</b></li>)}</ul>
        </section>
        <section className="lc-card">
          <div className="lc-card__head"><h2>Acceptance of agreements</h2></div>
          <ul className="lc-accbars">{c.cards.filter((x) => x.acceptance).map((x) => { const a = x.acceptance; return (
            <li key={x.kind}><span className="lc-accbars__l">{x.icon} {x.label} <small className="muted">v{a.version || '—'} · {a.who === 'dealer' ? 'dealers' : 'customers'}</small></span>
              <Stack parts={[{ v: a.accepted, tone: 'ok', label: 'Accepted' }, { v: a.older, tone: 'info', label: 'Earlier version' }, { v: a.pending, tone: 'bad', label: 'Pending' }]} />
              <span className="small">{a.rate == null ? '—' : `${a.rate}%`} <span className="muted">· {a.pending} pending</span></span></li>); })}</ul>
        </section>
      </div>

      <section className="lc-card">
        <div className="lc-card__head"><h2>Marketplace policy checklist</h2><span className="muted small">Areas a marketplace needs covered before launch · our own wording, reviewed by a lawyer</span></div>
        <div className="lc-check">
          {c.checklist.map((g) => (
            <div key={g.area} className="lc-check__col">
              <h3>{POLICY_CATEGORIES[g.area].icon} {g.label} <small className="muted">{g.items.filter((i) => i.status === 'ready').length}/{g.items.length} ready</small></h3>
              <ul>{g.items.map((i) => <li key={i.label} className={`is-${i.status}`}><button className="link-btn" onClick={() => openHistory(i.kind)}><span aria-hidden="true">{{ ready: '✅', live_unreviewed: '🟡', in_progress: '🔵', missing: '⬜' }[i.status]}</span> {i.label}</button><small>{i.policy}</small></li>)}</ul>
            </div>
          ))}
        </div>
        <p className="small muted lc-legendline">✅ live & legally approved · 🟡 live sample text, needs legal review · 🔵 draft or in review · ⬜ not created</p>
      </section>
      <p className="small muted">Tip: click any notification or calendar item to jump to the policy or dealer. <button className="link-btn" onClick={() => openLink('policy:dealer_agreement')}>Open Dealer Agreement history</button></p>
    </div>
  );
}

// ---------------------------------------------------------------- library
const FILTERS = [['all', 'All'], ['customer', 'Customer'], ['dealer', 'Dealer'], ['company', 'Company'], ['published', 'Published'], ['draft', 'Draft'], ['review', 'Review'], ['scheduled', 'Scheduled'], ['expired', 'Expired'], ['archived', 'Archived']];
const matchFilter = (x, f) => {
  if (f === 'all') return true;
  if (['customer', 'dealer', 'company'].includes(f)) return x.category === f;
  if (f === 'published') return !!x.current_id;
  if (f === 'draft') return ['draft', 'changes_requested'].includes(x.working?.status) || x.state === 'draft';
  if (f === 'review') return ['internal_review', 'legal_review', 'approved'].includes(x.working?.status);
  if (f === 'scheduled') return !!x.scheduled;
  if (f === 'expired') return x.state === 'expired';
  if (f === 'archived') return x.state === 'archived';
  return true;
};
function Library({ c, q, setQ, filter, setFilter, owner, reload, openEdit, openHistory }) {
  const [view, setView] = useState('cards');
  const [doc, setDoc] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [people, setPeople] = useState(null);
  const toast = useToast();
  const terms = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const list = c.cards.filter((x) => matchFilter(x, filter) && terms.every((t) => x.search.includes(t)));
  useEffect(() => {
    if (q.trim().length < 2) { setPeople(null); return undefined; }
    const t = setTimeout(() => api.get(`/admin/legal/acceptances?q=${encodeURIComponent(q.trim())}`).then((d) => setPeople(d.items.slice(0, 8))).catch(() => setPeople(null)), 300);
    return () => clearTimeout(t);
  }, [q]);
  const step = async (id, path, body, msg) => { try { await api.post(`/admin/legal/docs/${id}/${path}`, body || {}); toast(msg); reload(); } catch (e) { toast(errText(e), 'warn'); } };
  const newVersion = async (kind) => { try { const x = await api.post('/admin/legal/docs', { kind }); openEdit(x.id); } catch (e) { if (e.data?.id) openEdit(e.data?.id); else toast(errText(e), 'warn'); } };
  const view1 = async (id, mode) => { const x = await api.get(`/admin/legal/docs/${id}`); setDoc({ ...x, mode }); };
  return (
    <div className="lc-stackv">
      <div className="lc-libbar">
        <div className="lc-filters" role="tablist" aria-label="Filter policies">{FILTERS.map(([k, l]) => <button key={k} role="tab" aria-selected={filter === k} className={filter === k ? 'is-on' : ''} onClick={() => setFilter(k)}>{l} <span className="lc-count">{c.cards.filter((x) => matchFilter(x, k)).length}</span></button>)}</div>
        <div className="lc-view" role="group" aria-label="View"><button className={view === 'cards' ? 'is-on' : ''} onClick={() => setView('cards')}>▦ Cards</button><button className={view === 'table' ? 'is-on' : ''} onClick={() => setView('table')}>☰ Table</button></div>
      </div>
      {q && <p className="small">Showing <b>{list.length}</b> polic{list.length === 1 ? 'y' : 'ies'} for “{q}” <button className="link-btn" onClick={() => setQ('')}>clear</button></p>}
      {!list.length ? <Empty icon="📚" title="No policies match" /> : view === 'cards' ? (
        <div className="lc-grid">
          {list.map((x) => (
            <article key={x.kind} className={`lc-pol lc-pol--${x.category}`}>
              <div className="lc-pol__top">
                <span className="lc-pol__ic" aria-hidden="true">{x.icon}</span>
                <div className="lc-pol__t"><h3>{x.label}</h3><p>{x.desc}</p></div>
              </div>
              <div className="lc-pol__badges"><StatusBadge s={x.state} />{x.working && x.state !== x.working.status && <StatusBadge s={x.working.status} label={`v${x.working.version} ${DISPLAY_STATUS[x.working.status]?.label.toLowerCase()}`} />}{x.scheduled && x.state !== 'scheduled' && <StatusBadge s="scheduled" label={`v${x.scheduled.version} from ${day(x.scheduled.effective_at)}`} />}{x.current_id && x.legal_approved === false && <Tone tone="warn">Sample · not reviewed</Tone>}{x.custom && <Tone tone="muted">Custom</Tone>}</div>
              <dl className="lc-pol__meta">
                <div><dt>Version</dt><dd>{x.version ? `v${x.version}` : '—'}</dd></div>
                <div><dt>Effective</dt><dd>{day(x.effective_at)}</dd></div>
                <div><dt>Last updated</dt><dd>{day(x.updated_at)}</dd></div>
                <div><dt>Next review</dt><dd className={x.state === 'expired' ? 'down' : ''}>{day(x.next_review_at)}</dd></div>
                <div className="lc-pol__acc"><dt>Accepted by</dt><dd>{x.acceptance ? <><b>{(x.acceptance.accepted + x.acceptance.older).toLocaleString('en-IN')}</b> {x.acceptance.who === 'dealer' ? 'dealers' : 'customers'}{x.acceptance.pending ? <span className="muted"> · {x.acceptance.pending} pending</span> : null}</> : x.current_id ? <span className="muted">Part of the accepted terms</span> : '—'}</dd></div>
              </dl>
              <div className="lc-pol__acts">
                {(x.current_id || x.scheduled) && <button className="lc-btn lc-btn--sm" onClick={() => view1(x.current_id || x.scheduled.id, 'full')}>👁 View</button>}
                {owner && x.working && ['draft', 'changes_requested'].includes(x.working.status) && <button className="lc-btn lc-btn--sm" onClick={() => openEdit(x.working.id)}>✏️ Edit</button>}
                {owner && !x.working && <button className="lc-btn lc-btn--sm" onClick={() => newVersion(x.kind)}>✏️ {x.state === 'missing' ? 'Create' : 'New version'}</button>}
                {x.working && <button className="lc-btn lc-btn--sm" onClick={() => view1(x.working.id, 'simple')}>🔍 Preview</button>}
                {(x.current_id || x.working) && <button className="lc-btn lc-btn--sm" onClick={() => openBlob(`/admin/legal/docs/${x.current_id || x.working.id}/pdf`)}>📄 PDF</button>}
                <button className="lc-btn lc-btn--sm" onClick={() => openHistory(x.kind)}>🕘 History</button>
              </div>
              {owner && x.working && (
                <div className="lc-pol__wf">
                  <span className="small muted">v{x.working.version}: {x.working.state_label}{x.working.review_note ? ` — “${x.working.review_note}”` : ''}</span>
                  <span className="row gap-s wrap">
                    {['draft', 'changes_requested'].includes(x.working.status) && <button className="lc-btn lc-btn--primary lc-btn--sm" onClick={() => step(x.working.id, 'submit', {}, 'Sent for internal review')}>Send for internal review →</button>}
                    {x.working.status === 'internal_review' && <button className="lc-btn lc-btn--primary lc-btn--sm" onClick={() => step(x.working.id, 'internal-approve', {}, 'Internal review passed — now with legal')}>✓ Pass internal review</button>}
                    {x.working.status === 'legal_review' && <button className="lc-btn lc-btn--primary lc-btn--sm" onClick={() => setDialog({ type: 'approve', v: { id: x.working.id, title: x.label, version: x.working.version } })}>⚖️ Record legal approval</button>}
                    {x.working.status === 'approved' && <button className="lc-btn lc-btn--gold lc-btn--sm" onClick={() => setDialog({ type: 'publish', v: { id: x.working.id, title: x.label, version: x.working.version, accept: x.accept } })}>🚀 Publish…</button>}
                    {['internal_review', 'legal_review', 'approved'].includes(x.working.status) && <button className="lc-btn lc-btn--ghost lc-btn--sm" onClick={() => setDialog({ type: 'return', v: { id: x.working.id, title: x.label, version: x.working.version } })}>↩ Request changes</button>}
                  </span>
                </div>
              )}
            </article>
          ))}
        </div>
      ) : (
        <div className="table-wrap lc-tablecard"><table className="table lc-table">
          <thead><tr><th>Policy</th><th>Category</th><th>Version</th><th>Status</th><th>Effective</th><th>Last updated</th><th>Next review</th><th className="num">Accepted</th><th /></tr></thead>
          <tbody>{list.map((x) => (
            <tr key={x.kind}>
              <td><button className="link-btn" onClick={() => openHistory(x.kind)}>{x.icon} {x.label}</button>{x.working && <div className="small muted">v{x.working.version} · {x.working.state_label}</div>}</td>
              <td className="small">{POLICY_CATEGORIES[x.category]?.label.replace(' policies', '')}</td>
              <td>{x.version ? `v${x.version}` : '—'}</td><td><StatusBadge s={x.state} /></td><td className="small">{day(x.effective_at)}</td><td className="small">{day(x.updated_at)}</td><td className="small">{day(x.next_review_at)}</td>
              <td className="num">{x.acceptance ? (x.acceptance.accepted + x.acceptance.older).toLocaleString('en-IN') : '—'}</td>
              <td className="nowrap">{(x.current_id || x.working) && <button className="link-btn" onClick={() => openBlob(`/admin/legal/docs/${x.current_id || x.working.id}/pdf`)}>PDF</button>}</td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
      {people?.length > 0 && (
        <section className="lc-card">
          <div className="lc-card__head"><h2>Agreements & people matching “{q}”</h2></div>
          <ul className="lc-people">{people.map((a) => <li key={a.id}><span>{a.subject_type === 'dealer' ? '🏪' : '👤'} <b>{a.name}</b> <span className="muted small">{a.email}</span></span><span className="small">{a.title} v{a.version} · <code>{a.ref_no}</code> · {day(a.accepted_at)}</span><button className="link-btn" onClick={() => openBlob(`/admin/legal/acceptances/${a.id}/pdf`)}>PDF</button></li>)}</ul>
        </section>
      )}
      {doc && <DocViewer docs={[{ ...doc, body: doc.preview }]} mode={doc.mode} onClose={() => setDoc(null)} pdfPath={`/admin/legal/docs/${doc.id}/pdf`} pdfName={`${doc.kind}-v${doc.version}.pdf`} />}
      {dialog && <WorkflowDialog d={dialog} onClose={() => setDialog(null)} onDone={() => { setDialog(null); reload(); }} />}
    </div>
  );
}

/** Legal approval · Publish · Request changes. */
function WorkflowDialog({ d, onClose, onDone }) {
  const [f, setF] = useState({ reviewer: '', note: '', confirm: false, effective_at: '', next_review_at: plusDays(365), material: !!d.v.accept });
  const [err, setErr] = useState({});
  const toast = useToast();
  const v = d.v;
  const go = async () => {
    try {
      if (d.type === 'approve') await api.post(`/admin/legal/docs/${v.id}/approve`, { reviewer: f.reviewer, note: f.note, confirm: f.confirm });
      if (d.type === 'publish') await api.post(`/admin/legal/docs/${v.id}/publish`, { effective_at: f.effective_at, next_review_at: f.next_review_at, material: f.material });
      if (d.type === 'return') await api.post(`/admin/legal/docs/${v.id}/return`, { note: f.note });
      toast({ approve: 'Approved — ready to publish', publish: f.effective_at && f.effective_at > today() ? `Scheduled for ${fmtDate(f.effective_at)}` : `Version ${v.version} published`, return: 'Sent back for changes' }[d.type]);
      onDone();
    } catch (e) { setErr(e.fields || { reviewer: e.message }); }
  };
  const future = f.effective_at && f.effective_at > today();
  return (
    <Modal open onClose={onClose} title={{ approve: 'Legal approval', publish: 'Publish version', return: 'Request changes' }[d.type]}>
      <h2>{{ approve: '⚖️ Legal approval', publish: '🚀 Publish', return: '↩ Request changes' }[d.type]} · {v.title} v{v.version}</h2>
      {d.type === 'approve' && <>
        <p className="small muted">Record who reviewed this exact version. Only an approved version can be published.</p>
        <Field label="Reviewed by (lawyer / firm)" id="wf-r" error={err.reviewer}><input id="wf-r" value={f.reviewer} onChange={(e) => setF({ ...f, reviewer: e.target.value })} placeholder="e.g. Adv. A. Sharma, Sharma & Co." /></Field>
        <Field label="Review note (optional)" id="wf-n"><textarea id="wf-n" rows={2} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
        <label className="check"><input type="checkbox" checked={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.checked })} /><span>I confirm this exact version was reviewed and approved by qualified legal counsel.</span></label>
        <button className="lc-btn lc-btn--primary" disabled={!f.confirm || f.reviewer.trim().length < 3} onClick={go}>Approve version</button>
      </>}
      {d.type === 'publish' && <>
        <p>Once published, this version can never be edited or deleted. Earlier signed versions stay on record.</p>
        <div className="grid2">
          <Field label="Effective from" id="wf-e" hint="Empty = now. A future date shows as Scheduled."><input id="wf-e" type="date" min={today()} value={f.effective_at} onChange={(e) => setF({ ...f, effective_at: e.target.value })} /></Field>
          <Field label="Next review date" id="wf-rv"><input id="wf-rv" type="date" min={today()} value={f.next_review_at} onChange={(e) => setF({ ...f, next_review_at: e.target.value })} /></Field>
        </div>
        <label className="check"><input type="checkbox" checked={f.material} onChange={(e) => setF({ ...f, material: e.target.checked })} /><span><b>Important change</b> — {v.accept ? `existing ${v.accept === 'dealer' ? 'dealers' : 'customers'} must accept this version before their next ${v.accept === 'dealer' ? 'order' : 'order'}` : 'notify people about the change'}</span></label>
        <p className="small muted">Notifications: {v.accept === 'dealer' ? 'dealers get an in-app message asking them to review and accept' : v.accept === 'customer' ? 'customers are asked to accept at their next sign-in or order' : 'the policy page shows the new version'}; admins get a confirmation.</p>
        <button className="lc-btn lc-btn--gold" onClick={go}>{future ? `🗓️ Schedule for ${fmtDate(f.effective_at)}` : '🚀 Publish now'}</button>
      </>}
      {d.type === 'return' && <>
        <Field label="What needs to change?" id="wf-c" error={err.note}><textarea id="wf-c" rows={3} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="e.g. Clarify the damaged-product claim window" /></Field>
        <button className="lc-btn lc-btn--primary" disabled={f.note.trim().length < 3} onClick={go}>Send back for changes</button>
      </>}
    </Modal>
  );
}

// ---------------------------------------------------------------- version history
function History({ kind, owner, onClose, onChanged, openEdit }) {
  const [d, setD] = useState(null);
  const [doc, setDoc] = useState(null);
  const toast = useToast();
  useEffect(() => { api.get(`/admin/legal/kinds/${kind}`).then(setD).catch(() => setD(false)); }, [kind]);
  const meta = DOC_KINDS[kind];
  const newVersion = async () => { try { const x = await api.post('/admin/legal/docs', { kind }); onChanged(); openEdit(x.id); } catch (e) { if (e.data?.id) openEdit(e.data?.id); else toast(errText(e), 'warn'); } };
  const title = d?.versions?.[0]?.title || meta?.label || kind;
  return (
    <Modal open onClose={onClose} title={`Version history · ${title}`} wide>
      {d === null ? <Spinner /> : !d ? <p>Not found.</p> : (
        <div className="lc-hist">
          <div className="lc-hist__head">
            <span className="lc-pol__ic" aria-hidden="true">{d.versions[0]?.icon || meta?.icon || '📄'}</span>
            <div><h2>{title}</h2><p className="small muted">{d.versions[0]?.description || meta?.desc}</p></div>
            {owner && !d.versions.some((v) => ['draft', 'internal_review', 'legal_review', 'changes_requested', 'approved'].includes(v.status)) && <button className="lc-btn lc-btn--primary lc-btn--sm" onClick={newVersion}>＋ New version</button>}
          </div>
          {d.acceptance && <p className="small">Acceptance of the live version: <b>{d.acceptance.accepted}</b> accepted · <b>{d.acceptance.older}</b> on an earlier version · <b>{d.acceptance.pending}</b> pending ({d.acceptance.rate ?? '—'}%)</p>}
          {!d.versions.length ? <Empty icon="📄" title="No versions yet">{owner ? <button className="lc-btn lc-btn--primary" onClick={newVersion}>Create the first version</button> : null}</Empty> : (
            <ol className="lc-vtl">{d.versions.map((v) => (
              <li key={v.id} className={v.id === d.current ? 'is-current' : ''}>
                <div className="lc-vtl__head"><b>v{v.version}</b> <StatusBadge s={v.state} label={v.id === d.current ? 'Live now' : undefined} />{v.material && v.status !== 'draft' ? <Tone tone="info">Re-acceptance required</Tone> : null}{v.status === 'published' && !v.legal_approved ? <Tone tone="warn">Sample · not reviewed</Tone> : null}</div>
                <dl className="lc-vtl__grid">
                  <div><dt>Created</dt><dd>{day(v.created_at)}{v.created_by_name ? ` · ${v.created_by_name}` : ''}</dd></div>
                  <div><dt>Internal review</dt><dd>{v.internal_reviewed_at ? `${day(v.internal_reviewed_at)} · ${v.internal_reviewer}` : '—'}</dd></div>
                  <div><dt>Approved by</dt><dd>{v.legal_reviewer ? `${v.legal_reviewer}${v.approved_at ? ` · ${day(v.approved_at)}` : ''}` : '—'}</dd></div>
                  <div><dt>Effective</dt><dd>{day(v.effective_at)}{v.published_by_name ? ` · published by ${v.published_by_name}` : ''}</dd></div>
                  <div className="lc-vtl__wide"><dt>Change summary</dt><dd>{v.change_note || '—'}</dd></div>
                  {v.review_note && <div className="lc-vtl__wide"><dt>Review note</dt><dd>{v.review_note}</dd></div>}
                </dl>
                <div className="row gap-s wrap"><button className="lc-btn lc-btn--sm" onClick={async () => setDoc(await api.get(`/admin/legal/docs/${v.id}`))}>👁 View</button><button className="lc-btn lc-btn--sm" onClick={() => openBlob(`/admin/legal/docs/${v.id}/pdf`)}>📄 PDF</button>{owner && ['draft', 'changes_requested'].includes(v.status) && <button className="lc-btn lc-btn--sm" onClick={() => openEdit(v.id)}>✏️ Edit</button>}<span className="small muted">{v.accepted} acceptance record{v.accepted === 1 ? '' : 's'}</span></div>
              </li>
            ))}</ol>
          )}
          {d.audit.length > 0 && <details className="lc-details"><summary>Audit for this policy ({d.audit.length})</summary><ul className="lc-auditmini">{d.audit.map((a) => <li key={a.id}><small>{fmtDateTime(a.at)}</small> <b>{a.actor_name || a.actor_type}</b> — {a.label}{a.detail?.version ? ` v${a.detail.version}` : ''}{a.detail?.reviewer ? ` (${a.detail.reviewer})` : ''}{a.detail?.note ? ` · “${a.detail.note}”` : ''}</li>)}</ul></details>}
          {doc && <DocViewer docs={[{ ...doc, body: doc.preview }]} mode="full" onClose={() => setDoc(null)} pdfPath={`/admin/legal/docs/${doc.id}/pdf`} pdfName={`${doc.kind}-v${doc.version}.pdf`} />}
        </div>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------- create wizard
const TYPE_INFO = {
  customer: ['👤', 'Rules shoppers rely on', 'customer'], dealer: ['🏪', 'Rules for dealers', 'dealer'], company: ['🏢', 'Platform-wide documents', 'company'],
  legal_agreement: ['📜', 'Signed / accepted agreement', 'customer'], commercial_agreement: ['💼', 'Fees, settlement, models', 'dealer'], privacy: ['🔐', 'Personal data & cookies', 'company'], compliance: ['🛡️', 'Safety, KYC, fraud, security', 'dealer'],
};
const COUNTRY_OPTS = ['India', 'India + international shipping'];
function Wizard({ cards, onClose, onOpen }) {
  const [s, setS] = useState(1);
  const [type, setType] = useState('customer');
  const [pick, setPick] = useState('');
  const [f, setF] = useState({ title: '', category: 'customer', description: '', owner_name: '', version: '', planned_effective_at: '', next_review_at: plusDays(365), applies_to: 'customers', countries: 'India', submit: false, simple: '', start: 'starter' });
  const [err, setErr] = useState({});
  const toast = useToast();
  const cat = f.category;
  const options = cards.filter((x) => x.category === cat);
  const chosen = cards.find((x) => x.kind === pick) || null;
  const setType2 = (t) => { setType(t); const c = TYPE_INFO[t][2]; setF((p) => ({ ...p, category: c, applies_to: c === 'dealer' ? 'dealers' : c === 'customer' ? 'customers' : 'everyone' })); setPick(''); };
  const choose = (k) => {
    setPick(k);
    const x = cards.find((y) => y.kind === k);
    if (x) setF((p) => ({ ...p, title: x.label, description: x.desc || '', start: x.current_id ? 'current' : 'starter', version: '' }));
    else setF((p) => ({ ...p, title: '', description: '', start: 'blank' }));
  };
  const next = () => {
    if (s === 1 && chosen?.working) { onOpen(chosen.working.id); toast(`Opened the ${chosen.working.state_label.toLowerCase()} v${chosen.working.version}`); return; }
    if (s === 2 && f.title.trim().length < 3) { setErr({ title: 'Enter the policy name' }); return; }
    setErr({}); setS(s + 1);
  };
  const create = async () => {
    try {
      const body = { ...f, policy_type: type, kind: pick || undefined, version: f.version || undefined };
      const x = await api.post('/admin/legal/docs', body);
      toast(f.submit ? 'Policy created and sent for internal review' : 'Draft created');
      onOpen(x.id);
    } catch (e) { if (e.data?.id) { onOpen(e.data?.id); return; } setErr(e.fields || {}); toast(errText(e), 'warn'); if (e.fields?.title) setS(2); }
  };
  const steps = ['Policy type', 'Basic information', 'Simple explanation', 'Content'];
  return (
    <Modal open onClose={onClose} title="Create new policy" wide>
      <div className="lc-wiz">
        <ol className="lc-wiz__steps">{steps.map((l, i) => <li key={l} className={s === i + 1 ? 'is-on' : s > i + 1 ? 'is-done' : ''}><span>{s > i + 1 ? '✓' : i + 1}</span>{l}</li>)}</ol>
        {s === 1 && <>
          <h2>What kind of policy?</h2>
          <div className="lc-types">{Object.entries(POLICY_TYPES).map(([k, l]) => <button key={k} type="button" className={type === k ? 'is-on' : ''} onClick={() => setType2(k)}><span aria-hidden="true">{TYPE_INFO[k][0]}</span><b>{l}</b><small>{TYPE_INFO[k][1]}</small></button>)}</div>
          <Field label="Category" id="wz-c"><select id="wz-c" value={f.category} onChange={(e) => { setF({ ...f, category: e.target.value }); setPick(''); }}>{Object.entries(POLICY_CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></Field>
          <h3 className="lc-wiz__sub">Which policy?</h3>
          <div className="lc-picks">
            <button type="button" className={pick === '' ? 'is-on' : ''} onClick={() => choose('')}><span aria-hidden="true">✨</span><b>A new custom policy</b><small>Start from a blank page</small></button>
            {options.map((x) => <button key={x.kind} type="button" className={pick === x.kind ? 'is-on' : ''} onClick={() => choose(x.kind)}><span aria-hidden="true">{x.icon}</span><b>{x.label}</b><small><StatusBadge s={x.working?.status || x.state} label={x.working ? `v${x.working.version} ${x.working.state_label.toLowerCase()}` : undefined} /></small></button>)}
          </div>
          {chosen?.working && <p className="lc-hint">ℹ️ {chosen.label} already has v{chosen.working.version} in progress — “Next” opens it.</p>}
          {chosen?.current_id && !chosen.working && <p className="lc-hint">ℹ️ v{chosen.current_version} is live. This creates the next version; the live one stays until you publish the new one.</p>}
        </>}
        {s === 2 && <>
          <h2>Basic information</h2>
          <div className="grid2">
            <Field label="Policy name" id="wz-t" error={err.title}><input id="wz-t" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} disabled={!!pick && !!chosen?.versions} /></Field>
            <Field label="Policy owner" id="wz-o" hint="Person or team responsible"><input id="wz-o" value={f.owner_name} onChange={(e) => setF({ ...f, owner_name: e.target.value })} placeholder="e.g. Mohit (Founder) / Operations team" /></Field>
          </div>
          <Field label="Policy description" id="wz-d"><input id="wz-d" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="One line shown on the policy card" /></Field>
          <div className="grid3">
            <Field label="Version" id="wz-v" error={err.version} hint="Empty = automatic"><input id="wz-v" value={f.version} onChange={(e) => setF({ ...f, version: e.target.value })} placeholder={chosen?.current_version ? 'next' : '1.0'} /></Field>
            <Field label="Planned effective date" id="wz-e"><input id="wz-e" type="date" min={today()} value={f.planned_effective_at} onChange={(e) => setF({ ...f, planned_effective_at: e.target.value })} /></Field>
            <Field label="Review date" id="wz-r"><input id="wz-r" type="date" min={today()} value={f.next_review_at} onChange={(e) => setF({ ...f, next_review_at: e.target.value })} /></Field>
          </div>
          <div className="grid3">
            <Field label="Applicable users" id="wz-a"><select id="wz-a" value={f.applies_to} onChange={(e) => setF({ ...f, applies_to: e.target.value })}>{Object.entries(APPLIES_TO).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
            <Field label="Applicable countries" id="wz-n"><select id="wz-n" value={f.countries} onChange={(e) => setF({ ...f, countries: e.target.value })}>{COUNTRY_OPTS.map((x) => <option key={x}>{x}</option>)}</select></Field>
            <Field label="Status after creating" id="wz-s"><select id="wz-s" value={f.submit ? 'review' : 'draft'} onChange={(e) => setF({ ...f, submit: e.target.value === 'review' })}><option value="draft">🟡 Draft</option><option value="review">🔵 Send for internal review</option></select></Field>
          </div>
        </>}
        {s === 3 && <>
          <h2>Explain this policy in simple language</h2>
          <p className="small muted">Shown to customers and dealers first, before the detailed legal terms. One or two short sentences.</p>
          <Field label="Simple explanation" id="wz-x"><textarea id="wz-x" rows={3} value={f.simple} onChange={(e) => setF({ ...f, simple: e.target.value })} placeholder="This policy explains how dealers should list products, maintain correct inventory and handle customer orders." /></Field>
          <div className="lc-wiz__preview"><span className="small muted">How it appears:</span><h3>{f.title || 'Policy name'}</h3><p className="lg-doc__intro">{f.simple || 'Your simple explanation appears here.'}</p></div>
        </>}
        {s === 4 && <>
          <h2>Start the full legal content from…</h2>
          <div className="lc-types lc-types--3">
            {chosen && chosen.state !== 'missing' && chosen.current_id && <button type="button" className={f.start === 'current' ? 'is-on' : ''} onClick={() => setF({ ...f, start: 'current' })}><span aria-hidden="true">📄</span><b>Copy the live version</b><small>v{chosen.current_version} — edit what changed</small></button>}
            {chosen && <button type="button" className={f.start === 'starter' ? 'is-on' : ''} onClick={() => setF({ ...f, start: 'starter' })}><span aria-hidden="true">🧩</span><b>Starter template</b><small>Our own plain-language structure with sections</small></button>}
            <button type="button" className={f.start === 'blank' ? 'is-on' : ''} onClick={() => setF({ ...f, start: 'blank' })}><span aria-hidden="true">📝</span><b>Blank page</b><small>Headings to fill in</small></button>
          </div>
          <p className="small muted">You can edit everything in the next screen with headings, lists, tables, notices, definitions and links, with a live “as users see it” preview.</p>
          <div className="lc-wiz__sum">
            <div><span>Policy</span><b>{f.title}</b></div><div><span>Category</span><b>{POLICY_CATEGORIES[f.category].label}</b></div><div><span>Owner</span><b>{f.owner_name || '—'}</b></div>
            <div><span>Review</span><b>{f.next_review_at ? fmtDate(f.next_review_at) : '—'}</b></div><div><span>Applies to</span><b>{APPLIES_TO[f.applies_to]}</b></div><div><span>Status</span><b>{f.submit ? 'Internal review' : 'Draft'}</b></div>
          </div>
        </>}
        <div className="lc-wiz__nav">
          {s > 1 ? <button className="lc-btn lc-btn--ghost" onClick={() => setS(s - 1)}>← Back</button> : <span />}
          {s < 4 ? <button className="lc-btn lc-btn--primary" onClick={next}>{s === 1 && chosen?.working ? 'Open draft →' : 'Next →'}</button> : <button className="lc-btn lc-btn--gold" onClick={create}>✓ Create policy</button>}
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------- editor
const SNIPPETS = [
  ['§ Section', '\n## N. Section title\n> What this means: one line in plain language.\nThe detailed legal terms for this section.\n'],
  ['H Subheading', '\n### Subheading\n'],
  ['💬 Simple line', '> What this means: '],
  ['• Bullets', '\n- First point\n- Second point\n'],
  ['1. Numbered', '\n1. First step\n2. Second step\n'],
  ['▦ Table', '\n| Item | Detail |\n|---|---|\n| Example | Value |\n'],
  ['⚠️ Notice', '\n> **Important:** Write the important notice here.\n'],
  ['📖 Definition', '\n- **Term** — what the term means in this policy.\n'],
  ['🔗 Link', '[link text](https://www.utsavghar.in/policies)'],
  ['B Bold', '**bold text**'],
];
function Editor({ id, owner, onClose }) {
  const [doc, setDoc] = useState(null);
  const [f, setF] = useState(null);
  const [err, setErr] = useState({});
  const [mode, setMode] = useState('split');
  const [busy, setBusy] = useState(false);
  const ta = useRef(null);
  const touched = useRef(false);
  const toast = useToast();
  useEffect(() => { api.get(`/admin/legal/docs/${id}`).then((d) => { setDoc(d); setF({ title: d.title, version: d.version, change_note: d.change_note || '', material: !!d.material, body: d.body, simple: d.simple || '', description: d.description || '', owner_name: d.owner_name || '', next_review_at: d.next_review_at ? d.next_review_at.slice(0, 10) : '', planned_effective_at: d.effective_at ? d.effective_at.slice(0, 10) : '', applies_to: d.applies_to || 'everyone', countries: d.countries || 'India' }); }); }, [id]);
  const insert = (snip) => {
    const el = ta.current; if (!el) { setF({ ...f, body: f.body + snip }); return; }
    // cursor position (end of the text if the editor was never clicked)
    const a = touched.current ? el.selectionStart : f.body.length; const b = touched.current ? el.selectionEnd : f.body.length; const sel = f.body.slice(a, b);
    let text = snip;
    if (sel && /\*\*bold text\*\*/.test(snip)) text = `**${sel}**`;
    if (sel && /\[link text\]/.test(snip)) text = `[${sel}](https://)`;
    const n = (f.body.match(/^## \d+\./gm) || []).length + 1; text = text.replace('## N.', `## ${n}.`);
    const body = f.body.slice(0, a) + text + f.body.slice(b);
    setF({ ...f, body });
    touched.current = true;
    requestAnimationFrame(() => { el.focus(); el.selectionStart = el.selectionEnd = a + text.length; });
  };
  if (!f) return <Spinner />;
  const editable = owner && ['draft', 'changes_requested'].includes(doc.status);
  const save = async (quiet) => {
    setBusy(true);
    try { const x = await api.put(`/admin/legal/docs/${id}`, f); setDoc({ ...doc, ...x }); setErr({}); if (!quiet) toast('Draft saved'); return true; } catch (e) { setErr(e.fields || {}); toast(errText(e), 'warn'); return false; } finally { setBusy(false); }
  };
  const submit = async () => { if (!(await save(true))) return; try { await api.post(`/admin/legal/docs/${id}/submit`); toast('Sent for internal review'); onClose(); } catch (e) { toast(errText(e), 'warn'); } };
  const words = f.body.split(/\s+/).filter(Boolean).length; const sections = (f.body.match(/^## \d+\./gm) || []).length;
  return (
    <div className="lc lc-ed">
      <header className="lc-ed__bar">
        <button className="lc-btn lc-btn--ghost lc-btn--sm" onClick={onClose}>← Library</button>
        <div className="lc-ed__ttl"><span aria-hidden="true">{doc.icon}</span><div><b>{f.title || 'Untitled policy'}</b><small>v{f.version} · <StatusBadge s={doc.status} /> · {sections} sections · {words.toLocaleString('en-IN')} words</small></div></div>
        <div className="row gap-s">{editable && <><button className="lc-btn lc-btn--sm" disabled={busy} onClick={() => save()}>💾 Save draft</button><button className="lc-btn lc-btn--primary lc-btn--sm" disabled={busy} onClick={submit}>Send for internal review →</button></>}</div>
      </header>
      <ol className="lc-flow lc-flow--mini">{FLOW_STEPS.slice(0, 6).map(([k, l]) => <li key={k} className={`lc-flow__s ${k === doc.status || (doc.status === 'changes_requested' && k === 'draft') ? 'is-on' : ''}`}><span className="lc-flow__l">{l}</span></li>)}</ol>
      {doc.review_note && doc.status === 'changes_requested' && <div className="lc-alert lc-alert--orange"><span aria-hidden="true">🟠</span><div><b>Changes requested:</b> {doc.review_note}</div></div>}
      {!editable && <div className="lc-alert"><span aria-hidden="true">🔒</span><div>This version is {doc.status_label?.toLowerCase()} and cannot be edited. {owner ? 'Request changes to edit it again, or create a new version.' : 'Only the owner can edit policies.'}</div></div>}
      <fieldset className="lc-ed__meta" disabled={!editable}>
        <div className="grid3">
          <Field label="Title" id="ed-t" error={err.title}><input id="ed-t" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
          <Field label="Version" id="ed-v" error={err.version} hint="1.1 small edit · 2.0 big change"><input id="ed-v" value={f.version} onChange={(e) => setF({ ...f, version: e.target.value })} /></Field>
          <Field label="Policy owner" id="ed-o"><input id="ed-o" value={f.owner_name} onChange={(e) => setF({ ...f, owner_name: e.target.value })} /></Field>
        </div>
        <Field label="Description (shown on the policy card)" id="ed-d"><input id="ed-d" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <div className="grid3">
          <Field label="Applicable users" id="ed-a"><select id="ed-a" value={f.applies_to} onChange={(e) => setF({ ...f, applies_to: e.target.value })}>{Object.entries(APPLIES_TO).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
          <Field label="Planned effective date" id="ed-e" hint="Final date is set when publishing"><input id="ed-e" type="date" value={f.planned_effective_at} onChange={(e) => setF({ ...f, planned_effective_at: e.target.value })} /></Field>
          <Field label="Next review date" id="ed-r"><input id="ed-r" type="date" value={f.next_review_at} onChange={(e) => setF({ ...f, next_review_at: e.target.value })} /></Field>
        </div>
        <Field label="What changed? (shown to people asked to accept this version)" id="ed-n" hint="e.g. Updated return policy to clarify damaged-product claims."><input id="ed-n" value={f.change_note} onChange={(e) => setF({ ...f, change_note: e.target.value })} /></Field>
        <label className="check"><input type="checkbox" checked={f.material} onChange={(e) => setF({ ...f, material: e.target.checked })} /><span><b>Important change</b> — people must accept this version before their next order</span></label>
        <Field label="Explain this policy in simple language" id="ed-x" hint="Appears first, above the detailed legal terms"><textarea id="ed-x" rows={2} value={f.simple} onChange={(e) => setF({ ...f, simple: e.target.value })} /></Field>
      </fieldset>
      <div className="lc-ed__modes" role="tablist" aria-label="Editor layout">{[['write', '✍️ Write'], ['split', '◫ Side by side'], ['preview', '👁 Preview']].map(([k, l]) => <button key={k} role="tab" aria-selected={mode === k} className={mode === k ? 'is-on' : ''} onClick={() => setMode(k)}>{l}</button>)}</div>
      <div className={`lc-ed__work lc-ed__work--${mode}`}>
        {mode !== 'preview' && (
          <div className="lc-ed__pane">
            {editable && <div className="lc-ed__tools" role="toolbar" aria-label="Insert">{SNIPPETS.map(([l, sn]) => <button key={l} type="button" onClick={() => insert(sn)}>{l}</button>)}</div>}
            <textarea ref={ta} onSelect={() => { touched.current = true; }} aria-label="Full legal content" className="lc-ed__text" value={f.body} readOnly={!editable} onChange={(e) => setF({ ...f, body: e.target.value })} spellCheck />
            {err.body && <p className="field__error">{err.body}</p>}
            <p className="small muted">Format: <code>## 1. Section</code> then <code>&gt; What this means: …</code> (simple line) then the legal terms. <code>## In simple words</code> + bullets for the summary. Placeholders like <code>{'{{company_legal_name}}'}</code> are filled from Company details.</p>
          </div>
        )}
        {mode !== 'write' && <div className="lc-ed__pane lc-ed__preview" aria-label="Preview as users see it"><span className="lc-ed__tag">Preview · as users see it</span><LegalDocView body={setIntro(f.body, f.simple)} /></div>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- acceptance tracking
function Acceptance({ go, setDealerSub }) {
  const [d, setD] = useState(null);
  const [who, setWho] = useState(null);
  const toast = useToast();
  useEffect(() => { api.get('/admin/legal/acceptance').then(setD); }, []);
  const exportCsv = async () => {
    try { const r = await api.get('/admin/legal/acceptance/report'); saveBlob(new Blob([`﻿${toCsv(r.rows)}`], { type: 'text/csv;charset=utf-8' }), `acceptance-report-${today()}.csv`); toast(`Report with ${r.rows.length - 1} records ready`); } catch (e) { toast(errText(e), 'warn'); }
  };
  if (!d) return <Spinner />;
  return (
    <div className="lc-stackv">
      <div className="lc-card__head"><h2>Agreement acceptance</h2><button className="lc-btn lc-btn--sm" onClick={exportCsv}>⬇️ Export report (CSV)</button></div>
      <div className="lc-accgrid">
        {d.stats.map((s) => (
          <article key={s.kind} className="lc-acc">
            <div className="lc-acc__top"><Ring pct={s.rate} size={78} tone={s.rate >= 95 ? 'ok' : s.rate >= 80 ? 'warn' : 'bad'} /><div><h3>{DOC_KINDS[s.kind]?.icon} {s.title} {s.version && <span className="muted">v{s.version}</span>}</h3><p className="small muted">Required for all {s.who === 'dealer' ? 'active dealers' : 'customers'} · {s.required.toLocaleString('en-IN')}</p></div></div>
            <div className="lc-acc__nums">
              <div><b className="up">{s.accepted.toLocaleString('en-IN')}</b><span>Accepted</span></div>
              <div><b>{s.older.toLocaleString('en-IN')}</b><span>Earlier version (still valid)</span></div>
              <div><b className="down">{s.pending.toLocaleString('en-IN')}</b><span>Pending</span></div>
            </div>
            <div className="row gap-s wrap">
              <button className="lc-btn lc-btn--sm" onClick={() => setWho({ ...s, status: 'accepted' })}>👁 View acceptance</button>
              <button className="lc-btn lc-btn--sm" onClick={() => setWho({ ...s, status: 'pending' })}>⏳ Pending ({s.pending})</button>
              {s.who === 'dealer' && <button className="lc-btn lc-btn--sm" onClick={() => { setDealerSub('profiles'); go('dealers'); }}>✍️ Signed agreements</button>}
            </div>
          </article>
        ))}
      </div>
      <section className="lc-card">
        <div className="lc-card__head"><h2>Search acceptance records</h2><span className="small muted">Customer, dealer, agreement, version, date or agreement number</span></div>
        <Records />
      </section>
      {who && <People s={who} onClose={() => setWho(null)} />}
    </div>
  );
}
function People({ s, onClose }) {
  const [st, setSt] = useState(s.status);
  const [d, setD] = useState(null);
  useEffect(() => { setD(null); api.get(`/admin/legal/acceptance/${s.kind}/people?status=${st}`).then(setD); }, [s.kind, st]);
  return (
    <Modal open onClose={onClose} title={`${s.title} · acceptance`} wide>
      <h2>{s.title} v{s.version}</h2>
      <SubTabs value={st} onChange={setSt} tabs={[['accepted', '✅ Accepted', s.accepted], ['older', '🔵 Earlier version', s.older], ['pending', '⏳ Pending', s.pending]]} />
      {!d ? <Spinner /> : !d.items.length ? <Empty icon="📭" title="Nobody here" /> : (
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Table"><table className="table lc-table"><thead><tr><th>{s.who === 'dealer' ? 'Dealer' : 'Customer'}</th><th>Contact</th><th>Version</th><th>Accepted</th><th>Agreement no.</th></tr></thead>
          <tbody>{d.items.map((p) => <tr key={p.id}><td>{p.name} <span className="muted small">{s.who === 'dealer' ? 'D' : 'C'}-{p.id}</span></td><td className="small">{p.email}<div className="muted">{p.phone}</div></td><td>{p.version ? `v${p.version}` : '—'}</td><td className="small">{p.accepted_at ? fmtDateTime(p.accepted_at) : '—'}</td><td className="small"><code>{p.ref_no || '—'}</code></td></tr>)}</tbody></table>
          {d.total > d.items.length && <p className="small muted">Showing {d.items.length} of {d.total}. Export the report for the full list.</p>}</div>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------- dealer compliance
function DealerCompliance({ owner, sub, setSub }) {
  return (
    <div className="lc-stackv">
      <SubTabs value={sub} onChange={setSub} tabs={[['profiles', '📇 Dealer legal profiles'], ['health', '🩺 Account health'], ['violations', '🚩 Policy violations'], ['documents', '🪪 KYC & documents']]} />
      {sub === 'profiles' && <Profiles />}
      {sub === 'health' && <Health owner={owner} />}
      {sub === 'violations' && <Violations owner={owner} />}
      {sub === 'documents' && <Documents owner={owner} />}
    </div>
  );
}
const AG_STATUS = { signed_current: ['ok', '✓ Signed · current'], signed_older: ['info', 'Signed · earlier version'], resign_needed: ['warn', 'Must sign new version'], not_signed: ['bad', 'Not signed'] };
function Profiles() {
  const [d, setD] = useState(null);
  const [hist, setHist] = useState(null);
  const [q, setQ] = useState('');
  useEffect(() => { api.get('/admin/legal/dealers').then(setD); }, []);
  if (!d) return <Spinner />;
  const list = d.items.filter((x) => !q || `${x.business_name} ${x.name} ${x.dealer_code} ${x.city}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <section className="lc-card">
      <div className="lc-card__head"><h2>Dealer legal profiles</h2><input className="input lc-mini" placeholder="Search dealer…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search dealers" /></div>
      <div className="lc-profiles">
        {list.map((x) => (
          <article key={x.id} className="lc-prof">
            <div className="lc-prof__top"><div><h3>{x.business_name}</h3><p className="small muted">{x.dealer_code} · {x.name} · {x.city || '—'}</p></div><Tone tone={HEALTH_LEVELS[x.health.status].tone}>{x.health.icon} {x.health.label}</Tone></div>
            <dl className="lc-prof__grid">
              <div><dt>Agreement</dt><dd>{x.agreement_version ? `v${x.agreement_version}` : '—'} <Tone tone={AG_STATUS[x.agreement_status][0]}>{AG_STATUS[x.agreement_status][1]}</Tone></dd></div>
              <div><dt>Signed</dt><dd>{x.signed_at ? fmtDateTime(x.signed_at) : '—'}</dd></div>
              <div><dt>Signature</dt><dd className="small">{x.signature || '—'}</dd></div>
              <div><dt>KYC</dt><dd><Tone tone={x.kyc === 'complete' ? 'ok' : 'warn'}>{x.kyc === 'complete' ? 'Complete' : 'Incomplete'}</Tone></dd></div>
              <div><dt>Documents</dt><dd>{x.documents.verified}/{x.documents.required} verified{x.documents.missing ? <span className="down"> · {x.documents.missing} missing</span> : ''}{x.documents.expired ? <span className="down"> · {x.documents.expired} expired</span> : ''}{x.documents.expiring ? <span className="warn-text"> · {x.documents.expiring} expiring</span> : ''}</dd></div>
              <div><dt>Status</dt><dd className="small">{x.onboarding_status.replace(/_/g, ' ')}{x.open_violations ? <span className="down"> · {x.open_violations} open violation{x.open_violations > 1 ? 's' : ''}</span> : ''}</dd></div>
            </dl>
            <div className="row gap-s wrap">
              {x.agreement_id && <><button className="lc-btn lc-btn--sm" onClick={() => openBlob(`/admin/legal/acceptances/${x.agreement_id}/pdf`)}>👁 View agreement</button><button className="lc-btn lc-btn--sm" onClick={() => download(`/admin/legal/acceptances/${x.agreement_id}/pdf`, `${x.agreement_ref}.pdf`)}>⬇️ Signed PDF</button></>}
              <Link className="lc-btn lc-btn--sm" to={`/admin/dealer-verification/${x.id}`}>🪪 Documents</Link>
              <button className="lc-btn lc-btn--sm" onClick={() => setHist(x)}>🕘 Acceptance history</button>
            </div>
          </article>
        ))}
      </div>
      {hist && <DealerHealthModal id={hist.id} name={hist.business_name} onClose={() => setHist(null)} focus="history" />}
    </section>
  );
}
function DealerHealthModal({ id, name, onClose, focus }) {
  const [d, setD] = useState(null);
  useEffect(() => { api.get(`/admin/legal/dealers/${id}/health`).then(setD); }, [id]);
  return (
    <Modal open onClose={onClose} title={name} wide>
      {!d ? <Spinner /> : (
        <div className="lc-stackv">
          <div className="lc-hist__head"><span className="lc-pol__ic" aria-hidden="true">🏪</span><div><h2>{name}</h2><p className="small muted">Account health over the last {d.health.window_days} days · {d.health.orders} orders{d.health.enough_orders ? '' : ' (rates shown once there are enough orders)'}</p></div><Tone tone={d.health.tone}>{d.health.icon} {d.health.label}</Tone></div>
          {focus !== 'history' && <HealthTable metrics={d.health.metrics} />}
          <section><h3>Signed agreements & acceptance history</h3>{!d.acceptances.length ? <p className="muted">Nothing signed yet.</p> : <ul className="lc-auditmini">{d.acceptances.map((a) => <li key={a.id}><b>{a.title} v{a.version}</b> · {fmtDateTime(a.accepted_at)} · {a.signature?.typed_name} ({a.signature?.capacity}) · <code>{a.ref_no}</code> · <button className="link-btn" onClick={() => openBlob(`/admin/legal/acceptances/${a.id}/pdf`)}>PDF</button></li>)}</ul>}</section>
          {focus === 'history' && <HealthTable metrics={d.health.metrics} />}
          {d.violations.length > 0 && <section><h3>Violations</h3><ul className="lc-auditmini">{d.violations.map((v) => <li key={v.id}>{SEVERITY[v.severity].icon} <b>{v.title}</b> · {VIOLATION_STATUS[v.status].label} · {day(v.created_at)}</li>)}</ul></section>}
        </div>
      )}
    </Modal>
  );
}
function HealthTable({ metrics }) {
  return (
    <div className="table-wrap" tabIndex={0} role="region" aria-label="Table"><table className="table lc-table"><thead><tr><th>Measure</th><th>Value</th><th>Needs attention / Warning / Restricted at</th><th>Level</th></tr></thead>
      <tbody>{metrics.map((m) => <tr key={m.key}><td>{m.label}<div className="small muted">{m.hint}</div></td><td><b>{m.display}</b><div className="small muted">{m.detail}</div></td><td className="small">{m.thresholds.map((t) => (t == null ? '—' : `${t}${m.key.endsWith('rate') ? '%' : ''}`)).join(' / ')}</td><td><Tone tone={HEALTH_LEVELS[m.level].tone}>{HEALTH_LEVELS[m.level].icon} {HEALTH_LEVELS[m.level].label}</Tone></td></tr>)}</tbody></table></div>
  );
}
function Health({ owner }) {
  const [d, setD] = useState(null);
  const [open, setOpen] = useState(null);
  const [rules, setRules] = useState(false);
  const [lvl, setLvl] = useState('');
  const load = () => api.get('/admin/legal/dealers').then(setD);
  useEffect(() => { load(); }, []);
  if (!d) return <Spinner />;
  const counts = Object.fromEntries(Object.keys(HEALTH_LEVELS).map((k) => [k, d.items.filter((x) => x.health.status === k).length]));
  const list = d.items.filter((x) => !lvl || x.health.status === lvl).sort((a, b) => HEALTH_LEVELS[b.health.status].rank - HEALTH_LEVELS[a.health.status].rank);
  return (
    <div className="lc-stackv">
      <div className="lc-hlevels">{Object.entries(HEALTH_LEVELS).map(([k, v]) => <button key={k} className={`lc-hlevel lc-hlevel--${v.tone} ${lvl === k ? 'is-on' : ''}`} onClick={() => setLvl(lvl === k ? '' : k)}><span aria-hidden="true">{v.icon}</span><b>{counts[k]}</b><span>{v.label}</span></button>)}</div>
      <div className="lc-card__head"><p className="small muted">Measured over the last {d.rules.window_days} days · rates need at least {d.rules.min_orders} orders · dispatch within {d.rules.ship_hours} h of accepting. Inspired by marketplace account-health practice; the targets are yours to set.</p>{owner && <button className="lc-btn lc-btn--sm" onClick={() => setRules(true)}>⚙️ Configure rules</button>}</div>
      <div className="lc-profiles">{list.map((x) => (
        <button key={x.id} className={`lc-hcard lc-hcard--${HEALTH_LEVELS[x.health.status].tone}`} onClick={() => setOpen(x)}>
          <span className="lc-hcard__lvl">{x.health.icon} {x.health.label}</span>
          <b>{x.business_name}</b><small className="muted">{x.dealer_code} · {x.health.orders} orders</small>
          <span className="small">{x.health.problems.length ? x.health.problems.join(' · ') : 'All measures within target'}</span>
        </button>
      ))}</div>
      {open && <DealerHealthModal id={open.id} name={open.business_name} onClose={() => setOpen(null)} />}
      {rules && <Modal open onClose={() => setRules(false)} title="Account health rules" wide><RulesForm onSaved={() => { setRules(false); load(); }} /></Modal>}
    </div>
  );
}
function RulesForm({ onSaved }) {
  const [d, setD] = useState(null);
  const toast = useToast();
  useEffect(() => { api.get('/admin/legal/health-rules').then((x) => setD(x.rules)); }, []);
  if (!d) return <Spinner />;
  const setT = (k, i, v) => setD({ ...d, thresholds: { ...d.thresholds, [k]: d.thresholds[k].map((x, j) => (j === i ? (v === '' ? null : v) : x)) } });
  const save = async (e) => { e.preventDefault(); try { await api.put('/admin/legal/health-rules', d); toast('Rules saved'); onSaved?.(); } catch (x) { toast(errText(x), 'warn'); } };
  return (
    <form className="form lc-rules" onSubmit={save}>
      <h2>🩺 Dealer account health rules</h2>
      <div className="grid3">
        <Field label="Measure over (days)" id="hr-w"><input id="hr-w" type="number" min="7" max="365" value={d.window_days} onChange={(e) => setD({ ...d, window_days: e.target.value })} /></Field>
        <Field label="Minimum orders before rates count" id="hr-m"><input id="hr-m" type="number" min="1" value={d.min_orders} onChange={(e) => setD({ ...d, min_orders: e.target.value })} /></Field>
        <Field label="Dispatch within (hours of accepting)" id="hr-s"><input id="hr-s" type="number" min="1" value={d.ship_hours} onChange={(e) => setD({ ...d, ship_hours: e.target.value })} /></Field>
      </div>
      <div className="table-wrap" tabIndex={0} role="region" aria-label="Table"><table className="table lc-table"><thead><tr><th>Measure</th><th>🟡 Needs attention at</th><th>🟠 Warning at</th><th>🔴 Restricted at</th></tr></thead>
        <tbody>{HEALTH_METRICS.map((m) => <tr key={m.key}><td>{m.label}{m.unit && <span className="muted"> ({m.unit})</span>}<div className="small muted">{m.hint}</div></td>{[0, 1, 2].map((i) => <td key={i}><input className="input lc-num" type="number" min="0" step="0.5" aria-label={`${m.label} level ${i + 1}`} value={d.thresholds[m.key][i] ?? ''} placeholder="off" onChange={(e) => setT(m.key, i, e.target.value)} /></td>)}</tr>)}</tbody></table></div>
      <button className="lc-btn lc-btn--primary">Save rules</button>
    </form>
  );
}

function Violations({ owner }) {
  const [d, setD] = useState(null);
  const [st, setSt] = useState('active');
  const [add, setAdd] = useState(false);
  const [act, setAct] = useState(null);
  const [view, setView] = useState(null);
  const load = () => api.get('/admin/legal/violations').then(setD);
  useEffect(() => { load(); }, []);
  if (!d) return <Spinner />;
  const list = d.items.filter((v) => (st === 'active' ? ['open', 'correction_requested'].includes(v.status) : st === 'all' ? true : v.status === st));
  return (
    <div className="lc-stackv">
      <div className="lc-card__head">
        <SubTabs value={st} onChange={setSt} tabs={[['active', 'Active', (d.counts.open || 0) + (d.counts.correction_requested || 0)], ['open', 'Open', d.counts.open], ['correction_requested', 'Correction requested', d.counts.correction_requested], ['resolved', 'Resolved', d.counts.resolved], ['closed', 'Closed', d.counts.closed], ['all', 'All']]} />
        {owner && <button className="lc-btn lc-btn--primary lc-btn--sm" onClick={() => setAdd(true)}>＋ Record violation</button>}
      </div>
      <p className="small muted">Severity: {Object.values(SEVERITY).map((s) => `${s.icon} ${s.label}`).join(' · ')}</p>
      {!list.length ? <Empty icon="🚩" title="No violations here" /> : (
        <div className="table-wrap lc-tablecard"><table className="table lc-table">
          <thead><tr><th>Dealer</th><th>Violation</th><th>Severity</th><th>Date</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>{list.map((v) => (
            <tr key={v.id}>
              <td><Link className="link" to={`/admin/dealer-verification/${v.dealer_id}`}>{v.business_name}</Link><div className="small muted">D-{v.dealer_id}</div></td>
              <td><b>{v.title}</b><div className="small muted lc-clip">{v.description}</div></td>
              <td><Tone tone={SEVERITY[v.severity].tone}>{SEVERITY[v.severity].icon} {SEVERITY[v.severity].label}</Tone></td>
              <td className="small">{day(v.created_at)}{v.due_at && ['open', 'correction_requested'].includes(v.status) ? <div className={Date.parse(v.due_at) < Date.now() ? 'down' : 'muted'}>due {day(v.due_at)}</div> : null}</td>
              <td><Tone tone={VIOLATION_STATUS[v.status].tone}>{VIOLATION_STATUS[v.status].label}</Tone></td>
              <td><div className="lc-actmenu">
                <button className="lc-btn lc-btn--sm" onClick={() => setView(v)}>View</button>
                {owner && v.status !== 'closed' && <select className="lc-actsel" aria-label={`Actions for ${v.business_name}`} value="" onChange={(e) => e.target.value && setAct({ v, action: e.target.value })}><option value="">Actions ▾</option>{['contact', 'request_correction', 'suspend_listing', 'suspend_dealer', 'resolve', 'close'].map((a) => <option key={a} value={a}>{VIOLATION_ACTIONS[a]}</option>)}</select>}
              </div></td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
      {add && <NewViolation d={d} onClose={() => setAdd(false)} onDone={() => { setAdd(false); load(); }} />}
      {act && <ViolationAction a={act} onClose={() => setAct(null)} onDone={() => { setAct(null); load(); }} />}
      {view && (
        <Modal open onClose={() => setView(null)} title={view.title}>
          <h2>{SEVERITY[view.severity].icon} {view.title}</h2>
          <p className="small muted">{view.business_name} · opened {fmtDateTime(view.created_at)} by {view.created_by_name || 'admin'} · <Tone tone={VIOLATION_STATUS[view.status].tone}>{VIOLATION_STATUS[view.status].label}</Tone></p>
          <p>{view.description}</p>
          {view.policy_kind && <p className="small">Policy: {DOC_KINDS[view.policy_kind]?.label || view.policy_kind}</p>}
          <ol className="lc-timeline">{view.history.map((h, i) => <li key={i}><span className="lc-timeline__dot" /><div><b>{h.by}</b> — {VIOLATION_ACTIONS[h.action] || h.action}{h.note ? `: ${h.note}` : ''}<small>{fmtDateTime(h.at)}</small></div></li>)}</ol>
        </Modal>
      )}
    </div>
  );
}
function NewViolation({ d, onClose, onDone }) {
  const [f, setF] = useState({ dealer_id: d.dealers[0]?.id || '', type: 'incorrect_info', severity: 'medium', description: '', policy_kind: 'listing_policy', due_days: 7, notify: true });
  const [err, setErr] = useState({});
  const toast = useToast();
  const go = async () => { try { await api.post('/admin/legal/violations', f); toast('Violation recorded — dealer notified'); onDone(); } catch (e) { setErr(e.fields || {}); toast(errText(e), 'warn'); } };
  const DEALER_POLICIES = Object.entries(DOC_KINDS).filter(([, v]) => v.category === 'dealer' && !v.legacy);
  return (
    <Modal open onClose={onClose} title="Record a policy violation">
      <h2>🚩 Record a policy violation</h2>
      <Field label="Dealer" id="nv-d" error={err.dealer_id}><select id="nv-d" value={f.dealer_id} onChange={(e) => setF({ ...f, dealer_id: e.target.value })}>{d.dealers.map((x) => <option key={x.id} value={x.id}>{x.business_name}</option>)}</select></Field>
      <div className="grid2">
        <Field label="Violation" id="nv-t"><select id="nv-t" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>{Object.entries(VIOLATION_TYPES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        <Field label="Severity" id="nv-s"><select id="nv-s" value={f.severity} onChange={(e) => setF({ ...f, severity: e.target.value })}>{Object.entries(SEVERITY).map(([k, s]) => <option key={k} value={k}>{s.icon} {s.label}</option>)}</select></Field>
        <Field label="Policy" id="nv-p"><select id="nv-p" value={f.policy_kind} onChange={(e) => setF({ ...f, policy_kind: e.target.value })}>{DEALER_POLICIES.map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></Field>
        <Field label="Respond within (days)" id="nv-due"><input id="nv-due" type="number" min="0" max="90" value={f.due_days} onChange={(e) => setF({ ...f, due_days: e.target.value })} /></Field>
      </div>
      <Field label="What happened? (the dealer sees this)" id="nv-x" error={err.description}><textarea id="nv-x" rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
      <label className="check"><input type="checkbox" checked={f.notify} onChange={(e) => setF({ ...f, notify: e.target.checked })} /><span>Notify the dealer now (app + email/SMS)</span></label>
      <button className="lc-btn lc-btn--primary" disabled={f.description.trim().length < 5} onClick={go}>Record violation</button>
    </Modal>
  );
}
function ViolationAction({ a, onClose, onDone }) {
  const { v, action } = a;
  const [note, setNote] = useState('');
  const [pid, setPid] = useState('');
  const [listings, setListings] = useState(null);
  const [err, setErr] = useState('');
  const toast = useToast();
  useEffect(() => { if (action === 'suspend_listing') api.get(`/admin/legal/dealers/${v.dealer_id}/listings`).then((d) => { setListings(d.items); setPid(d.items.find((x) => x.is_active)?.id || ''); }); }, [action, v.dealer_id]);
  const go = async () => { try { await api.post(`/admin/legal/violations/${v.id}/action`, { action, note, product_id: pid || undefined }); toast(`${VIOLATION_ACTIONS[action]} — done`); onDone(); } catch (e) { setErr(errText(e)); } };
  const hint = { resolve: 'Marks the issue as fixed by the dealer; it stops counting towards account health.', contact: 'The dealer gets this message in the app and by email/SMS.', request_correction: 'The dealer is asked to fix the issue; status becomes “Correction requested”.', suspend_listing: 'The chosen product is hidden from the store until you switch it back on in Products.', suspend_dealer: 'The dealer stops receiving new orders until reinstated in Dealer verification.', close: 'Closes the violation and stops it counting towards account health.' }[action];
  return (
    <Modal open onClose={onClose} title={VIOLATION_ACTIONS[action]}>
      <h2>{VIOLATION_ACTIONS[action]} · {v.business_name}</h2>
      <p className="small muted">{v.title} — {hint}</p>
      {action === 'suspend_listing' && (!listings ? <Spinner /> : !listings.length ? <p className="warn-text">This dealer has no live listings.</p> : <Field label="Listing" id="va-p"><select id="va-p" value={pid} onChange={(e) => setPid(e.target.value)}>{listings.map((x) => <option key={x.id} value={x.id}>{x.name}{x.is_active ? '' : ' (already hidden)'}</option>)}</select></Field>)}
      <Field label={action === 'close' ? 'Resolution' : action === 'suspend_dealer' ? 'Reason (the dealer sees it)' : 'Message'} id="va-n" error={err}><textarea id="va-n" rows={3} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      <button className={`lc-btn ${action.startsWith('suspend') ? 'lc-btn--danger' : 'lc-btn--primary'}`} disabled={action === 'suspend_listing' ? !pid : note.trim().length < 3} onClick={go}>{VIOLATION_ACTIONS[action]}</button>
    </Modal>
  );
}

function Documents({ owner }) {
  const [d, setD] = useState(null);
  const [f, setF] = useState('attention');
  const toast = useToast();
  const load = () => api.get('/admin/legal/documents').then(setD);
  useEffect(() => { load(); }, []);
  if (!d) return <Spinner />;
  const remind = async (x) => { try { await api.post(`/admin/legal/documents/${x.id}/remind`); toast(`Reminder sent to ${x.business_name}`); load(); } catch (e) { toast(errText(e), 'warn'); } };
  const list = d.items.filter((x) => (f === 'attention' ? ['expired', 'expiring'].includes(x.expiry) : f === 'all' ? true : x.expiry === f)).sort((a, b) => String(a.expiry_date || '9').localeCompare(String(b.expiry_date || '9')));
  return (
    <div className="lc-stackv">
      <div className="lc-hlevels">{['valid', 'expiring', 'expired', 'no_expiry'].map((k) => <button key={k} className={`lc-hlevel lc-hlevel--${DOC_EXPIRY[k].tone} ${f === k ? 'is-on' : ''}`} onClick={() => setF(f === k ? 'attention' : k)}><span aria-hidden="true">{DOC_EXPIRY[k].icon}</span><b>{d.summary[k]}</b><span>{DOC_EXPIRY[k].label}</span></button>)}</div>
      <p className="small muted">Dealers get automatic reminders 30 days before a document expires and when it expires. Expired documents show in their account health.</p>
      <section className="lc-card">
        <div className="lc-card__head"><h2>{f === 'attention' ? 'Expired & expiring soon' : DOC_EXPIRY[f]?.label || 'All documents'}</h2><button className="link-btn small" onClick={() => setF(f === 'all' ? 'attention' : 'all')}>{f === 'all' ? 'Show only expiring' : 'Show all'}</button></div>
        {!list.length ? <p className="muted">Nothing here 🎉</p> : (
          <div className="table-wrap" tabIndex={0} role="region" aria-label="Table"><table className="table lc-table"><thead><tr><th>Dealer</th><th>Document</th><th>Number</th><th>Expiry</th><th>Status</th><th>Verification</th><th /></tr></thead>
            <tbody>{list.map((x) => <tr key={x.id}><td><Link className="link" to={`/admin/dealer-verification/${x.dealer_id}`}>{x.business_name}</Link></td><td>{x.label}{x.required ? ' *' : ''}</td><td className="small">{x.doc_number || '—'}</td><td className="small">{x.expiry_date ? fmtDate(x.expiry_date) : '—'}</td><td><Tone tone={DOC_EXPIRY[x.expiry].tone}>{DOC_EXPIRY[x.expiry].icon} {DOC_EXPIRY[x.expiry].label}</Tone></td><td className="small">{x.status}</td><td>{owner && <button className="lc-btn lc-btn--sm" onClick={() => remind(x)}>🔔 Remind{x.reminded_at ? 'ed' : ''}</button>}{x.reminded_at && <div className="small muted">{day(x.reminded_at)}</div>}</td></tr>)}</tbody></table></div>
        )}
      </section>
      {d.missing.length > 0 && <section className="lc-card"><div className="lc-card__head"><h2>Required documents not uploaded</h2><span className="lc-count">{d.missing.length}</span></div><ul className="lc-auditmini">{d.missing.slice(0, 40).map((m, i) => <li key={i}><Link className="link" to={`/admin/dealer-verification/${m.dealer_id}`}>{m.business_name}</Link> — {m.label}</li>)}</ul></section>}
    </div>
  );
}

// ---------------------------------------------------------------- calendar
const EV_ICON = { review: '🔁', publish: '🚀', published: '✅', doc_expiry: '🪪', grace: '⏳', renewal: '📜' };
function Calendar({ openLink }) {
  const [d, setD] = useState(null);
  const [m, setM] = useState(() => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), 1); });
  useEffect(() => { api.get('/admin/legal/calendar').then(setD); }, []);
  const byDay = useMemo(() => { const out = {}; for (const e of d?.items || []) { const k = new Date(e.at).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); (out[k] ||= []).push(e); } return out; }, [d]);
  if (!d) return <Spinner />;
  const first = new Date(m); const start = (first.getDay() + 6) % 7; const days = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
  const cells = [...Array(start).fill(null), ...Array.from({ length: days }, (_, i) => new Date(m.getFullYear(), m.getMonth(), i + 1))];
  const key = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  const now = Date.now();
  const upcoming = d.items.filter((e) => e.tone !== 'done' && Date.parse(e.at) > now - 120 * 864e5).slice(0, 30);
  const groups = {}; for (const e of upcoming) (groups[new Date(e.at).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })] ||= []).push(e);
  return (
    <div className="lc-two lc-two--cal">
      <section className="lc-card">
        <div className="lc-card__head"><button className="lc-btn lc-btn--ghost lc-btn--sm" aria-label="Previous month" onClick={() => setM(new Date(m.getFullYear(), m.getMonth() - 1, 1))}>‹</button><h2>{m.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</h2><button className="lc-btn lc-btn--ghost lc-btn--sm" aria-label="Next month" onClick={() => setM(new Date(m.getFullYear(), m.getMonth() + 1, 1))}>›</button></div>
        <div className="lc-cal">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((w) => <span key={w} className="lc-cal__w">{w}</span>)}
          {cells.map((dt, i) => {
            if (!dt) return <span key={`e${i}`} className="lc-cal__d lc-cal__d--empty" />;
            const ev = byDay[key(dt)] || []; const isToday = key(dt) === key(new Date());
            return <span key={i} className={`lc-cal__d ${isToday ? 'is-today' : ''}`}><b>{dt.getDate()}</b><span className="lc-cal__ev">{ev.slice(0, 3).map((e, j) => <button key={j} className={`lc-cal__pill lc-cal__pill--${e.tone}`} title={`${e.title} — ${e.detail || ''}`} onClick={() => openLink(e.link)}>{EV_ICON[e.type]} <span>{e.title.replace(/^[^:]+: /, '')}</span></button>)}{ev.length > 3 && <small>+{ev.length - 3}</small>}</span></span>;
          })}
        </div>
        <p className="small muted lc-legendline">🟢 completed · 🟡 upcoming · 🔴 overdue — 🔁 policy review · 🚀 scheduled publication · 🪪 document expiry · ⏳ onboarding deadline · 📜 yearly agreement review</p>
      </section>
      <section className="lc-card">
        <div className="lc-card__head"><h2>Upcoming & overdue</h2></div>
        {!upcoming.length ? <p className="muted">Nothing scheduled.</p> : Object.entries(groups).map(([g, list]) => (
          <div key={g} className="lc-agenda"><h3>{g}</h3><ul>{list.map((e, i) => <li key={i} className={`is-${e.tone}`}><button onClick={() => openLink(e.link)}><span className="lc-agenda__date"><b>{new Date(e.at).getDate()}</b><small>{new Date(e.at).toLocaleDateString('en-IN', { weekday: 'short' })}</small></span><span><b>{EV_ICON[e.type]} {e.title}</b><small>{e.detail}</small><Tone tone={e.tone === 'overdue' ? 'bad' : e.tone === 'done' ? 'ok' : 'warn'}>{e.tone === 'overdue' ? '🔴 Overdue' : e.tone === 'done' ? '🟢 Done' : '🟡 Upcoming'}</Tone></span></button></li>)}</ul></div>
        ))}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------- notifications
const AUD = { admin: ['🛡️', 'Admin', 'info'], dealer: ['🏪', 'Dealers', 'orange'], customer: ['👤', 'Customers', 'ok'] };
function Notices({ openLink, onRead }) {
  const [d, setD] = useState(null);
  const [aud, setAud] = useState('');
  useEffect(() => { api.get('/admin/legal/notices').then(setD); }, []);
  if (!d) return <Spinner />;
  const read = async () => { await api.post('/admin/legal/notices/read'); setD({ items: d.items.map((n) => ({ ...n, read_at: n.read_at || new Date().toISOString() })) }); onRead(); };
  const list = d.items.filter((n) => !aud || n.audience === aud);
  return (
    <div className="lc-stackv">
      <div className="lc-card__head"><SubTabs value={aud} onChange={setAud} tabs={[['', 'All'], ['admin', '🛡️ Admin'], ['dealer', '🏪 Sent to dealers'], ['customer', '👤 Customers']]} /><button className="lc-btn lc-btn--sm" onClick={read}>✓ Mark all read</button></div>
      <div className="lc-noticeinfo">
        <div><b>🛡️ Admin</b><span>“Dealer Agreement v2.0 is ready for publication.” — after legal approval, changes requested, reviews due, expiring documents, new violations.</span></div>
        <div><b>🏪 Dealers</b><span>“Your Dealer Agreement has been updated. Please review and accept the new version.” — in the dealer app notifications, plus email/SMS for violations and expiring documents.</span></div>
        <div><b>👤 Customers</b><span>“Our Terms & Conditions have been updated.” — customers must accept an important change before their next order.</span></div>
      </div>
      {!list.length ? <Empty icon="🔔" title="No notifications yet" /> : (
        <ul className="lc-notices">{list.map((n) => (
          <li key={n.id} className={n.audience === 'admin' && !n.read_at ? 'is-new' : ''}>
            <Tone tone={AUD[n.audience][2]}>{AUD[n.audience][0]} {AUD[n.audience][1]}{n.dealer_id ? ` · D-${n.dealer_id}` : ''}</Tone>
            <div><b>{n.title}</b>{n.body && <p className="small muted">{n.body}</p>}<small className="muted">{fmtDateTime(n.created_at)}</small></div>
            {n.link && (n.link.startsWith('policy:') || n.link.startsWith('dealer:')) && <button className="lc-btn lc-btn--sm" onClick={() => openLink(n.link)}>Open</button>}
          </li>
        ))}</ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- audit trail
function Audit() {
  const [d, setD] = useState(null);
  const [f, setF] = useState({ subject_type: '', action: '' });
  const [q, setQ] = useState('');
  useEffect(() => { const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString(); api.get(`/admin/legal/audit${qs ? `?${qs}` : ''}`).then(setD); }, [f]);
  const who = (a) => (a.actor_type === 'admin' ? a.actor_name || `Admin #${a.actor_id}` : a.actor_type === 'dealer' ? `Dealer D-${a.actor_id}` : a.actor_type === 'customer' ? `Customer C-${a.actor_id}` : a.actor_type);
  const what = (a) => [a.detail?.title || (a.detail?.kind ? DOC_KINDS[a.detail.kind]?.label || a.detail.kind : ''), a.detail?.version ? `v${a.detail.version}` : ''].filter(Boolean).join(' ');
  const list = (d?.items || []).filter((a) => !q || `${who(a)} ${a.label} ${what(a)} ${JSON.stringify(a.detail)}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <section className="lc-card">
      <div className="lc-card__head">
        <h2>Legal audit trail</h2>
        <div className="row wrap gap-s">
          <input className="input lc-mini" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search audit trail" />
          <select value={f.subject_type} onChange={(e) => setF({ ...f, subject_type: e.target.value })} aria-label="Who"><option value="">Everyone</option><option value="customer">Customers</option><option value="dealer">Dealers</option></select>
          <select value={f.action} onChange={(e) => setF({ ...f, action: e.target.value })} aria-label="Action"><option value="">All actions</option>{Object.entries(AUDIT_ACTIONS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        </div>
      </div>
      {!d ? <Spinner /> : !list.length ? <Empty icon="🧾" title="No entries" /> : (
        <ol className="lc-audit">{list.map((a) => (
          <li key={a.id}>
            <span className={`lc-audit__ic lc-audit__ic--${a.actor_type}`} aria-hidden="true">{a.actor_type === 'admin' ? '🛡️' : a.actor_type === 'dealer' ? '🏪' : '👤'}</span>
            <div>
              <b>{who(a)}</b> <span>{a.label}</span> {what(a) && <b className="lc-audit__what">{what(a)}</b>}
              {a.subject_type && <span className="small"> · {a.subject_type === 'dealer' ? <Link className="link" to={`/admin/dealer-verification/${a.subject_id}`}>Dealer D-{a.subject_id}</Link> : `Customer C-${a.subject_id}`}</span>}
              <small>{fmtDateTime(a.at)}{a.ip ? ` · ${a.ip}` : ''}{a.detail?.reviewer ? ` · reviewer: ${a.detail.reviewer}` : ''}{a.detail?.note ? ` · “${a.detail.note}”` : ''}{a.detail?.reason ? ` · “${a.detail.reason}”` : ''}</small>
            </div>
          </li>
        ))}</ol>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- settings
function Settings({ role }) {
  return (
    <div className="lc-stackv">
      <Company role={role} />
      {role === 'owner' || role === 'legal' ? <section className="lc-card"><RulesForm /></section> : null}
      <section className="lc-card lc-note">
        <h2>About these policies</h2>
        <p>The policy framework follows the areas a marketplace commonly needs — customer, dealer and company policies, account health and violations. All wording is written for Utsav Ghar; no other company’s legal text, branding or design is copied.</p>
        <p><b>Before going live:</b> have every document reviewed and approved by a qualified lawyer, record that approval in the workflow, and fill in the company details above. This system records acceptances and signatures; it does not by itself make any document legally valid.</p>
      </section>
    </div>
  );
}
