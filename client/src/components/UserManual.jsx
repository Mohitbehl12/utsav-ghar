/**
 * In-app User Manual reader (Customer / Dealer / Admin), English + हिंदी.
 * Same content as the PDFs: shared/manuals/*.js. Screenshots and PDFs are built by
 * `python3 manuals/build_pdf.py` into client/public/manuals (customer + dealer) and
 * manuals/web-admin (admin — served only to signed-in admins via /api/admin/manual/...).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import '../styles/manual.css';

const LOADERS = {
  customer: () => import('@shared/manuals/customer.js'),
  dealer: () => import('@shared/manuals/dealer.js'),
  admin: () => import('@shared/manuals/admin.js'),
};

/** Where the screenshots and PDFs live. */
export function manualBase(kind) {
  if (__DEMO__) return kind === 'admin' ? 'manuals/admin/' : 'manuals/';
  return kind === 'admin' ? '/api/admin/manual/' : '/manuals/';
}

const TABLE_HEAD = {
  problems: ['problem', 'solution'],
  suspension: ['status', 'meaning'],
  reports: [{ en: 'Where', hi: 'कहाँ' }, { en: 'What you get', hi: 'क्या मिलता है' }],
};

const store = {
  get: () => { try { return localStorage.getItem('ug_manual_lang') || 'en'; } catch { return 'en'; } },
  set: (v) => { try { localStorage.setItem('ug_manual_lang', v); } catch { /* private mode */ } },
};

function Md({ s }) {
  // **bold** only — the content is our own static text.
  const parts = String(s ?? '').split(/\*\*(.+?)\*\*/g);
  return parts.map((p, i) => (i % 2 ? <b key={i}>{p}</b> : p));
}

export default function UserManual({ kind = 'customer', variant = 'site' }) {
  const [mods, setMods] = useState(null);
  const [lang, setLangState] = useState(store.get);
  const [cur, setCur] = useState(0);
  const [q, setQ] = useState('');
  const top = useRef(null);
  useEffect(() => {
    let live = true;
    Promise.all([LOADERS[kind](), import('@shared/manuals/common.js')]).then(([m, c]) => live && setMods({ m: m.default, c })).catch(() => live && setMods(false));
    return () => { live = false; };
  }, [kind]);
  const setLang = (v) => { setLangState(v); store.set(v); };
  const L = (x) => (x && typeof x === 'object' && 'en' in x ? (x[lang] || x.en) : x);
  const base = manualBase(kind);
  const sections = mods ? mods.m.sections : [];
  const list = useMemo(() => {
    const w = q.trim().toLowerCase();
    return sections.map((s, i) => ({ s, i })).filter(({ s }) => !w || `${s.title.en} ${s.title.hi}`.toLowerCase().includes(w));
  }, [q, sections]);

  if (mods === null) return <div className={`um um--${variant}`}><p className="um__loading">Loading manual…</p></div>;
  if (!mods) return <div className={`um um--${variant}`}><p className="um__loading">Could not load the manual. Please try again.</p></div>;
  const { m, c } = mods;
  const UI = (k) => L(c.UI[k]);
  const s = sections[cur];
  const go = (i) => { setCur(i); top.current?.scrollIntoView({ block: 'start' }); };
  const pdf = (hi) => `${base}${m.file}${hi ? '_Hindi' : ''}.pdf`;
  const phone = !!m.phone;

  const figure = (key, callouts, mock) => key && (
    <figure className={`um-fig${phone || key.startsWith('m_') ? ' um-fig--phone' : ''}`}>
      <div className="um-fig__img"><img src={`${base}img/${key}.webp`} alt={L(s.title)} loading="lazy" /></div>
      <figcaption>
        {mock ? <span className="um-tag um-tag--ill">{UI('illustrative')}</span> : <span className="um-tag um-tag--real">📷 {UI('realScreen')}</span>}
        {lang === 'hi' && <span className="um-small"> {UI('screenEnglish')}</span>}
        {callouts?.length > 0 && (
          <>
            <p className="um-legend__h">🔢 {UI('callouts')}</p>
            <ol className="um-legend">{callouts.map((co, n) => <li key={n}><i>{n + 1}</i><span><Md s={L(co[1])} /></span></li>)}</ol>
          </>
        )}
      </figcaption>
    </figure>
  );
  const bullets = (x, cls) => { const v = L(x); return Array.isArray(v) ? <ul className={cls}>{v.map((t, i) => <li key={i}><Md s={t} /></li>)}</ul> : <p><Md s={v} /></p>; };
  const flow = (name) => { const f = c.FLOWS[name]; return (
    <div className="um-flow"><h3>🔀 {L(f.title)}</h3><ol>{f.steps.map(([a, b], i) => <li key={i}><i>{i + 1}</i><b>{L(a)}</b><span>{L(b)}</span></li>)}</ol></div>
  ); };
  const table = (head, rows, cls = '') => (
    <div className="um-tablewrap"><table className={`um-table ${cls}`}><thead><tr>{head.map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
      <tbody>{rows.map((r, i) => <tr key={i}>{r.map((x, j) => <td key={j}><Md s={L(x)} /></td>)}</tr>)}</tbody></table></div>
  );

  return (
    <div className={`um um--${variant}`} ref={top}>
      <header className="um__hero">
        <div>
          <p className="um__kicker">📘 {L(m.audience)} · {UI('version')} {c.MANUAL_VERSION} · {L(c.MANUAL_DATE)}</p>
          <h1>{L(m.title)}</h1>
          <p className="um__sub">{L(m.subtitle)}</p>
        </div>
        <div className="um__actions">
          <div className="um__lang" role="group" aria-label="Language">
            <button type="button" aria-pressed={lang === 'en'} onClick={() => setLang('en')}>English</button>
            <button type="button" aria-pressed={lang === 'hi'} onClick={() => setLang('hi')}>हिंदी</button>
          </div>
          <a className="um__pdf" href={pdf(false)} target="_blank" rel="noreferrer" download>⬇️ PDF (English)</a>
          <a className="um__pdf" href={pdf(true)} target="_blank" rel="noreferrer" download>⬇️ PDF (हिंदी)</a>
        </div>
      </header>

      <p className="um__upd"><b>🔄 {UI('updates_h')}:</b> {UI('updates')}</p>

      <div className="um__body">
        <nav className="um__toc" aria-label={UI('contents')}>
          <input type="search" placeholder={lang === 'hi' ? 'अध्याय खोजें…' : 'Search chapters…'} value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="um__tocsel" value={cur} onChange={(e) => go(Number(e.target.value))} aria-label={UI('contents')}>
            {sections.map((x, i) => <option key={x.id} value={i}>{i + 1}. {L(x.title)}</option>)}
          </select>
          <ol>{list.map(({ s: x, i }) => <li key={x.id}><button type="button" aria-current={i === cur ? 'page' : undefined} onClick={() => go(i)}><span>{i + 1}</span>{L(x.title)}</button></li>)}</ol>
        </nav>

        <article className="um__sec" lang={lang}>
          <div className="um__sechead"><span className="um__num">{cur + 1}</span><h2>{L(s.title)}</h2></div>
          <div className="um-lead">
            {s.what && <div className="um-card"><h3>📄 {UI('what')}</h3><p><Md s={L(s.what)} /></p></div>}
            {s.why && <div className="um-card"><h3>🎯 {UI('why')}</h3><p><Md s={L(s.why)} /></p></div>}
          </div>
          {figure(s.shot, s.callouts, s.mock)}
          {s.can && <section className="um-blk"><h3>✅ {UI('can')}</h3>{bullets(s.can, 'um-ok')}</section>}
          {s.steps && <section className="um-blk"><h3>🪜 {UI('steps')}</h3><ol className="um-steps">{L(s.steps).map((t, i) => <li key={i}><Md s={t} /></li>)}</ol></section>}
          {s.shot2 && figure(s.shot2, s.callouts2, false)}
          {s.flow && flow(s.flow)}
          {s.after && <section className="um-note um-note--after"><h3>📬 {UI('after')}</h3>{bullets(s.after)}</section>}
          {s.statuses && <section className="um-blk"><h3>🏷️ {UI('statuses')}</h3>{table([UI('status'), UI('meaning')], s.statuses)}</section>}
          {s.table && <section className="um-blk">{table((TABLE_HEAD[s.id] || TABLE_HEAD.problems).map((h) => (typeof h === 'string' ? UI(h) : L(h))), s.table)}</section>}
          {s.matrix && <section className="um-blk">{table(s.matrix.head.map(L), s.matrix.rows, 'um-table--m')}<p className="um-small">{L(s.matrix.note)}</p></section>}
          {s.faq && <section className="um-blk">{table([UI('question'), UI('answer')], s.faq)}</section>}
          {s.important && <section className="um-note um-note--imp"><h3>⚠️ {UI('important')}</h3>{bullets(s.important)}</section>}
          {s.planned && <section className="um-note um-note--plan"><h3>🛠️ <span className="um-tag um-tag--plan">{UI('planned')}</span></h3>{bullets(s.planned)}<p className="um-small">{UI('plannedNote')}</p></section>}
          {s.mistakes && <section className="um-blk"><h3>❌ {UI('mistakes')}</h3>{bullets(s.mistakes, 'um-bad')}</section>}
          <section className="um-note um-note--help"><h3>💬 {UI('help')}</h3><p>{L(c.HELP[m.help])}</p></section>

          <div className="um__pager">
            <button type="button" disabled={cur === 0} onClick={() => go(cur - 1)}>← {cur > 0 ? L(sections[cur - 1].title) : ''}</button>
            <button type="button" disabled={cur === sections.length - 1} onClick={() => go(cur + 1)}>{cur < sections.length - 1 ? L(sections[cur + 1].title) : ''} →</button>
          </div>
        </article>
      </div>
    </div>
  );
}
