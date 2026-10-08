/**
 * Admin → Dealer verification (KYC, documents, agreement, approval) and
 * Admin → Legal & Agreements (versioned documents, company details, compliance dashboard, audit trail).
 */
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, fetchFile, saveBlob } from '../lib/api.js';
import { fmtDateTime } from '../lib/format.js';
import { Field, Pill, Spinner, Empty, Modal } from '../components/ui.jsx';
import { useToast } from '../state/store.jsx';
import { DocViewer } from '../components/Legal.jsx';
import { PageHead } from './pages.jsx';
import { DOC_TYPES, COMMERCIAL_MODELS } from '@shared/legal.js';

const openBlob = async (path) => { try { const b = await fetchFile(path); window.open(URL.createObjectURL(b), '_blank', 'noopener'); } catch { /* */ } };
const download = async (path, name) => { try { saveBlob(await fetchFile(path), name); } catch { /* */ } };
const KIND_TABS = [['', 'All'], ['under_review', '🔎 To verify'], ['documents_rejected', '📄 Docs rejected'], ['draft', '📝 In progress'], ['agreement_pending', '✍️ To sign'], ['approved', '✅ Approved'], ['suspended', '⛔ Suspended'], ['rejected', '✖️ Rejected']];

// ---------------------------------------------------------------- Dealer verification
export function DealerVerification({ role }) {
  const { id } = useParams();
  return id ? <VerifyDetail id={id} role={role} /> : <VerifyList />;
}

function VerifyList() {
  const [tab, setTab] = useState('');
  const [d, setD] = useState(null);
  useEffect(() => { setD(null); api.get(`/admin/dealer-verification${tab ? `?status=${tab}` : ''}`).then(setD); }, [tab]);
  return (
    <>
      <PageHead title="🛡️ Dealer verification" sub="KYC, documents and signed agreements. A dealer gets orders only after you approve (existing dealers have a 14-day grace period)." />
      <div className="tabs" role="tablist">{KIND_TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'is-on' : ''} onClick={() => setTab(k)}>{l}{k && d?.counts?.[k] ? ` (${d.counts[k]})` : ''}</button>)}</div>
      {!d ? <Spinner /> : !d.items.length ? <Empty icon="🛡️" title="No dealers here" /> : (
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Table">
          <table className="table">
            <thead><tr><th>Dealer</th><th>ID</th><th>Registered</th><th>Business type</th><th>KYC</th><th>Documents</th><th>Agreement</th><th>Status</th><th>Orders</th></tr></thead>
            <tbody>{d.items.map((x) => (
              <tr key={x.id}>
                <td><Link className="link" to={`/admin/dealer-verification/${x.id}`}>{x.business_name}</Link><div className="small muted">{x.name} · {x.phone}{x.self_registered ? ' · self-registered' : ''}</div></td>
                <td className="small">{x.dealer_code}</td>
                <td className="small">{fmtDateTime(x.registered_at)}</td>
                <td className="small">{x.business_type}</td>
                <td><Pill tone={x.kyc === 'Complete' ? 'ok' : 'warn'}>{x.kyc}</Pill></td>
                <td><Pill tone={x.documents === 'Verified' ? 'ok' : /rejected|missing/.test(x.documents) ? 'bad' : 'info'}>{x.documents}</Pill></td>
                <td><Pill tone={x.agreement === 'Signed' ? 'ok' : 'warn'}>{x.agreement}</Pill></td>
                <td><Pill tone={x.tone}>{x.status_label}</Pill>{x.deadline && x.status !== 'approved' && <div className="small muted">grace till {fmtDateTime(x.deadline).split(',')[0]}</div>}</td>
                <td>{x.can_receive_orders ? '✅' : '⏸️'}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </>
  );
}

function VerifyDetail({ id, role }) {
  const [d, setD] = useState(null);
  const [bank, setBank] = useState('');
  const [reject, setReject] = useState(null); // doc being rejected
  const [act, setAct] = useState(null); // action dialog
  const [viewAcc, setViewAcc] = useState(null);
  const toast = useToast();
  const nav = useNavigate();
  const load = useCallback(() => api.get(`/admin/dealer-verification/${id}`).then(setD).catch(() => setD(false)), [id]);
  useEffect(() => { load(); }, [load]);
  if (d === null) return <Spinner />;
  if (!d) return <Empty icon="🛡️" title="Dealer not found" />;
  const reveal = async () => { try { setBank((await api.post(`/admin/dealer-verification/${id}/bank/reveal`)).bank_account); } catch (x) { toast(x.message, 'warn'); } };
  const docAct = async (doc, action, reason) => {
    try { await api.post(`/admin/dealer-verification/${id}/documents/${doc.id}`, { action, reason }); toast(action === 'verify' ? 'Document verified' : 'Document rejected — dealer notified'); setReject(null); load(); } catch (x) { toast(x.fields?.reason || x.message, 'warn'); }
  };
  const latest = d.documents.filter((x) => x.latest);
  const older = d.documents.filter((x) => !x.latest);
  const b = d.business; const k = d.kyc;
  const row = (l, v) => <tr><th>{l}</th><td>{v || <span className="muted">—</span>}</td></tr>;
  const canApprove = d.progress.done.business && d.progress.done.kyc && d.progress.verified && d.signed;
  return (
    <>
      <PageHead title={`🛡️ ${d.business_name}`} sub={`${d.dealer_code} · registered ${fmtDateTime(d.registered_at)}${d.submitted_at ? ` · signed ${fmtDateTime(d.submitted_at)}` : ''}`}>
        <button className="btn btn--sm btn--ghost" onClick={() => nav('/admin/dealer-verification')}>← All dealers</button>
      </PageHead>
      <div className="lgv-status">
        <Pill tone={d.tone}>{d.status_label}</Pill> <span className="small">{d.can_receive_orders ? '✅ Receives orders' : '⏸️ No new orders'}{d.deadline && d.status !== 'approved' ? ` · grace period ends ${fmtDateTime(d.deadline)}` : ''}</span>
        {d.status_reason && <p className="small muted">Last note: {d.status_reason}</p>}
      </div>
      <div className="lgv-steps">{d.steps.map((s, i) => <span key={s.key} className={d.progress.done[s.key] ? 'is-done' : ''}>{d.progress.done[s.key] ? '✓' : i + 1} {s.label}</span>)}</div>

      <div className="lgv-grid">
        <section className="card">
          <h2>Business</h2>
          <table className="kv"><tbody>
            {row('Legal name', b.legal_name)}{row('Business type', d.business_types[b.business_type])}{row('Contact', `${b.name} · ${b.phone} · ${b.email}`)}
            {row('Registered address', b.registered_address)}{row('Business address', [b.address, b.city, b.state, b.pincode].filter(Boolean).join(', '))}{row('Website', b.website)}
          </tbody></table>
        </section>
        <section className="card">
          <h2>KYC & bank</h2>
          <table className="kv"><tbody>
            {row('PAN', k.pan)}{row('GSTIN', k.gstin)}{row('CIN / LLPIN', k.cin)}{row('TAN', k.tan)}{row('Registration no.', k.registration_no)}{row('Udyam', k.udyam)}{row('Trade licence', k.trade_license)}
            {row('Bank', `${k.bank_name} · ${k.bank_holder}`)}
            {row('Account', <>{bank || k.bank_account_masked} {!bank && k.bank_account_masked && role === 'owner' && <button className="btn btn--ghost btn--sm" onClick={reveal}>Show (logged)</button>}</>)}
            {row('IFSC / branch', `${k.ifsc}${k.bank_branch ? ` · ${k.bank_branch}` : ''}`)}
          </tbody></table>
        </section>
      </div>

      <section className="card">
        <h2>Documents <span className="small muted">({d.required.length} required for this business type)</span></h2>
        {d.progress.missing.length > 0 && <p className="small warn-text">Missing: {d.progress.missing.map((t) => DOC_TYPES[t]?.label).join(', ')}</p>}
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Table"><table className="table">
          <thead><tr><th>Document</th><th>Status</th><th /><th>File</th><th>No. · expiry</th><th>Uploaded</th></tr></thead>
          <tbody>{latest.map((x) => (
            <tr key={x.id}>
              <td className="lgv-docname">{x.label}{d.required.includes(x.doc_type) ? ' *' : ''}</td>
              <td><Pill tone={{ pending: 'info', verified: 'ok', rejected: 'bad' }[x.status]}>{x.status}</Pill>{x.reject_reason && <div className="small muted">{x.reject_reason}</div>}</td>
              <td className="nowrap">{x.status !== 'verified' && <button className="btn btn--sm" onClick={() => docAct(x, 'verify')}>✓ Verify</button>} {x.status !== 'rejected' && <button className="btn btn--sm btn--ghost" onClick={() => setReject(x)}>✕ Reject</button>}</td>
              <td className="small nowrap"><button className="link-btn" onClick={() => openBlob(`/admin/dealer-verification/${id}/documents/${x.id}/file`)}>View</button> · <button className="link-btn" onClick={() => download(`/admin/dealer-verification/${id}/documents/${x.id}/file?download=1`, `D${id}-${x.doc_type}`)}>Download</button><div className="muted">{Math.round(x.size / 1024)} KB</div></td>
              <td className="small">{x.doc_number || '—'}{x.expiry_date ? ` · till ${x.expiry_date}` : ''}</td>
              <td className="small">{fmtDateTime(x.uploaded_at)}</td>
            </tr>
          ))}</tbody>
        </table></div>
        {older.length > 0 && <details className="small"><summary>Earlier uploads ({older.length})</summary><ul>{older.map((x) => <li key={x.id}>{x.label} · {fmtDateTime(x.uploaded_at)} · {x.status}{x.reject_reason ? ` (${x.reject_reason})` : ''} · <button className="link-btn" onClick={() => openBlob(`/admin/dealer-verification/${id}/documents/${x.id}/file`)}>View</button></li>)}</ul></details>}
      </section>

      <div className="lgv-grid">
        <section className="card">
          <h2>Signed agreements</h2>
          {!d.acceptances.length ? <p className="muted">Not signed yet.</p> : (
            <ul className="lgv-list">{d.acceptances.map((a) => (
              <li key={a.id}><b>{a.title} v{a.version}</b><div className="small muted">{fmtDateTime(a.accepted_at)} · {a.signature?.typed_name} ({a.signature?.capacity}) · {a.ref_no}</div>
                <button className="link-btn" onClick={() => openBlob(`/admin/dealer-verification/${id}/acceptances/${a.id}/pdf`)}>View PDF</button> · <button className="link-btn" onClick={() => download(`/admin/dealer-verification/${id}/acceptances/${a.id}/pdf`, `${a.ref_no}.pdf`)}>Download</button></li>
            ))}</ul>
          )}
          {viewAcc && <DocViewer docs={viewAcc} onClose={() => setViewAcc(null)} />}
        </section>
        <Commercial id={id} c={d.commercial_full} models={d.models} onSaved={(r) => { if (r.resign) toast('Saved. The dealer must sign the updated agreement before new orders.', 'warn'); else toast('Saved'); load(); }} />
      </div>

      <section className="card">
        <h2>Decision</h2>
        <div className="row wrap gap-s">
          {d.status !== 'approved' && <button className="btn btn--primary" disabled={!canApprove} title={canApprove ? '' : 'Needs: complete KYC, all required documents verified, agreement signed'} onClick={() => setAct('approve')}>✅ Approve dealer</button>}
          {d.status === 'suspended' && <button className="btn btn--primary" onClick={() => setAct('reinstate')}>↩️ Reinstate</button>}
          <button className="btn" onClick={() => setAct('request_docs')}>📄 Request documents</button>
          <button className="btn" onClick={() => setAct('request_correction')}>✏️ Request correction</button>
          {d.signed && <button className="btn" onClick={() => setAct('request_signature')}>✍️ Ask to sign again</button>}
          {!['rejected', 'terminated', 'approved', 'suspended'].includes(d.status) && <button className="btn btn--ghost" onClick={() => setAct('reject')}>✖️ Reject</button>}
          {d.status === 'approved' && <button className="btn btn--ghost" onClick={() => setAct('suspend')}>⛔ Suspend</button>}
          {!['terminated', 'rejected'].includes(d.status) && <button className="btn btn--ghost" onClick={() => setAct('terminate')}>🛑 Terminate</button>}
        </div>
        {!canApprove && d.status !== 'approved' && <p className="small muted">To approve: complete business + KYC, verify every required document, and the dealer must sign. Also set the dealer's delivery PIN codes in <Link className="link" to="/admin/dealers">Dealers</Link>.</p>}
      </section>

      <section className="card">
        <h2>Audit history</h2>
        <ul className="lgv-audit">{d.audit.map((a) => <li key={a.id}><span className="small muted">{fmtDateTime(a.at)}</span> <b>{a.label}</b> <span className="small muted">by {a.actor_type}{a.actor_id ? ` #${a.actor_id}` : ''}{a.ip ? ` · ${a.ip}` : ''}</span>{a.detail?.reason ? <div className="small">“{a.detail.reason}”</div> : null}</li>)}</ul>
      </section>

      {reject && <RejectDoc doc={reject} onClose={() => setReject(null)} onSubmit={(r) => docAct(reject, 'reject', r)} />}
      {act && <ActionDialog id={id} action={act} d={d} onClose={() => setAct(null)} onDone={() => { setAct(null); load(); }} />}
    </>
  );
}

function RejectDoc({ doc, onClose, onSubmit }) {
  const [r, setR] = useState('');
  const quick = ['Photo is blurred or cut off', 'Name does not match the business', 'Document has expired', 'Wrong document uploaded', 'Number does not match the details entered'];
  return (
    <Modal open onClose={onClose} title="Reject document">
      <h2>Reject: {doc.label}</h2>
      <p className="small muted">The dealer sees this reason and uploads again.</p>
      <div className="row wrap gap-s">{quick.map((q) => <button key={q} type="button" className="chip" onClick={() => setR(q)}>{q}</button>)}</div>
      <Field label="Reason" id="rj-r"><textarea id="rj-r" rows={3} value={r} onChange={(e) => setR(e.target.value)} /></Field>
      <button className="btn btn--primary" disabled={r.trim().length < 3} onClick={() => onSubmit(r.trim())}>Reject document</button>
    </Modal>
  );
}

const ACTION_LABEL = { approve: 'Approve dealer', reinstate: 'Reinstate dealer', reject: 'Reject application', request_docs: 'Request documents', request_correction: 'Request correction', suspend: 'Suspend dealer', terminate: 'Terminate agreement', request_signature: 'Ask to sign again' };
function ActionDialog({ id, action, d, onClose, onDone }) {
  const [reason, setReason] = useState('');
  const [docs, setDocs] = useState([]);
  const [err, setErr] = useState('');
  const toast = useToast();
  const go = async () => {
    try { await api.post(`/admin/dealer-verification/${id}/action`, { action, reason, docs }); toast(`${ACTION_LABEL[action]} — dealer notified`); onDone(); } catch (x) { setErr(x.fields?.reason || x.message); }
  };
  const needReason = !['approve', 'reinstate'].includes(action);
  return (
    <Modal open onClose={onClose} title={ACTION_LABEL[action]}>
      <h2>{ACTION_LABEL[action]}</h2>
      {action === 'approve' && <p>{d.business_name} will start receiving orders for its delivery area. Commercial model: <b>{COMMERCIAL_MODELS[d.commercial_full.model]?.label}</b>.</p>}
      {action === 'terminate' && <p className="warn-text">The dealer is signed out and switched off. Signed agreements and documents are kept on record.</p>}
      {action === 'request_docs' && (
        <fieldset className="lgv-docpick"><legend>Which documents?</legend>{Object.entries(DOC_TYPES).map(([k, t]) => <label key={k} className="check"><input type="checkbox" checked={docs.includes(k)} onChange={(e) => setDocs(e.target.checked ? [...docs, k] : docs.filter((x) => x !== k))} /><span>{t.label}</span></label>)}</fieldset>
      )}
      {needReason && <Field label="Message to the dealer" id="ac-r" error={err}><textarea id="ac-r" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>}
      {!needReason && err && <p className="field__error">{err}</p>}
      <button className={`btn ${['terminate', 'reject', 'suspend'].includes(action) ? 'btn--danger' : 'btn--primary'}`} disabled={needReason && reason.trim().length < 3} onClick={go}>{ACTION_LABEL[action]}</button>
    </Modal>
  );
}

function Commercial({ id, c, models, onSaved }) {
  const [f, setF] = useState(c);
  const toast = useToast();
  const n = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async (e) => { e.preventDefault(); try { onSaved(await api.put(`/admin/dealer-verification/${id}/commercial`, f)); } catch (x) { toast(x.message, 'warn'); } };
  return (
    <form className="card form" onSubmit={save}>
      <h2>Commercial terms</h2>
      <p className="small muted">Goes into this dealer's agreement schedule. Changing it after signing asks the dealer to sign again.</p>
      <Field label="Model" id="cm-m"><select id="cm-m" value={f.model} onChange={n('model')}>{Object.entries(models).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}</select></Field>
      <p className="small muted">{models[f.model]?.hint}</p>
      <div className="grid2">
        {f.model === 'commission' && <><Field label="Commission %" id="cm-c"><input id="cm-c" type="number" step="0.5" min="0" value={f.commission_pct} onChange={n('commission_pct')} /></Field>
          <Field label="Platform fee per order (₹)" id="cm-p"><input id="cm-p" type="number" min="0" value={f.platform_fee} onChange={n('platform_fee')} /></Field>
          <Field label="Payment fee %" id="cm-pf"><input id="cm-pf" type="number" step="0.1" min="0" value={f.payment_fee_pct} onChange={n('payment_fee_pct')} /></Field></>}
        <Field label="Settlement (days after delivery)" id="cm-s"><input id="cm-s" type="number" min="1" value={f.settlement_days} onChange={n('settlement_days')} /></Field>
        <Field label="Return window (days)" id="cm-r"><input id="cm-r" type="number" min="0" value={f.return_window_days} onChange={n('return_window_days')} /></Field>
        <Field label="Late dispatch penalty (₹)" id="cm-l"><input id="cm-l" type="number" min="0" value={f.late_dispatch_penalty} onChange={n('late_dispatch_penalty')} /></Field>
        <Field label="Logistics" id="cm-g"><select id="cm-g" value={f.logistics} onChange={n('logistics')}><option value="dealer">Dealer delivers / books courier</option><option value="platform">Platform arranges courier</option></select></Field>
      </div>
      <button className="btn btn--primary btn--sm">Save terms</button>
    </form>
  );
}

// ---------------------------------------------------------------- Legal & Compliance Center (admin/legalCenter.jsx) uses these two
export function Company({ role }) {
  const [f, setF] = useState(null);
  const [keys, setKeys] = useState([]);
  const toast = useToast();
  useEffect(() => { api.get('/admin/legal/docs').then((d) => { setF(d.company); setKeys(d.company_keys); }); }, []);
  if (!f) return <Spinner />;
  const LABEL = { company_name: 'Brand name', company_legal_name: 'Registered company name', company_address: 'Registered office address', support_email: 'Support email', support_phone: 'Support phone', grievance_officer: 'Grievance Officer (name & designation)', grievance_email: 'Grievance email', jurisdiction_city: 'Courts / arbitration city', website: 'Website' };
  const save = async (e) => { e.preventDefault(); try { setF(await api.put('/admin/legal/company', f)); toast('Saved — documents now show these details'); } catch (x) { toast(x.message, 'warn'); } };
  return (
    <form className="card form" onSubmit={save}>
      <h2>Company details used in documents</h2>
      <p className="small muted">The Consumer Protection (E-Commerce) Rules, 2020 require the legal name, address, customer care and Grievance Officer details to be shown. Fill these before going live.</p>
      <div className="grid2">{keys.map((k) => <Field key={k} label={LABEL[k] || k} id={`co-${k}`}><input id={`co-${k}`} value={f[k] || ''} onChange={(e) => setF({ ...f, [k]: e.target.value })} disabled={role !== 'owner'} /></Field>)}</div>
      {(role === 'owner' || role === 'legal') && <button className="btn btn--primary">Save</button>}
    </form>
  );
}

export function Records() {
  const [q, setQ] = useState('');
  const [who, setWho] = useState('');
  const [d, setD] = useState(null);
  const load = (s = q, w = who) => api.get(`/admin/legal/acceptances?${new URLSearchParams({ ...(s ? { q: s } : {}), ...(w ? { subject_type: w } : {}) })}`).then(setD);
  useEffect(() => { load(''); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <section className="card">
      <form className="row wrap gap-s" onSubmit={(e) => { e.preventDefault(); load(); }}><select value={who} onChange={(e) => { setWho(e.target.value); load(q, e.target.value); }}><option value="">Customers &amp; dealers</option><option value="customer">Customer acceptances</option><option value="dealer">Dealer signatures</option></select><input className="input" placeholder="Search name, email, mobile or agreement no." value={q} onChange={(e) => setQ(e.target.value)} /><button className="btn">Search</button></form>
      {!d ? <Spinner /> : (
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Table"><table className="table">
          <thead><tr><th>When</th><th>Who</th><th>Agreement</th><th>Agreement no.</th><th>Verification</th><th>IP / device</th><th /></tr></thead>
          <tbody>{d.items.map((a) => (
            <tr key={a.id}><td className="small">{fmtDateTime(a.accepted_at)}</td><td className="small">{a.subject_type === 'dealer' ? '🏪' : '👤'} {a.name}<div className="muted">{a.email} · {a.phone}</div></td><td>{a.title} v{a.version}</td><td className="small"><code>{a.ref_no}</code></td><td className="small">{a.verification || (a.subject_type === 'dealer' ? 'OTP + signature' : 'Checkbox acceptance')}</td>
              <td className="small muted">{a.ip}<div className="lgd-ua">{a.user_agent}</div></td><td><button className="link-btn" onClick={() => openBlob(`/admin/legal/acceptances/${a.id}/pdf`)}>PDF</button></td></tr>
          ))}</tbody>
        </table></div>
      )}
    </section>
  );
}
