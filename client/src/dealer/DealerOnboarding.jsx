/**
 * Dealer registration and onboarding: business details → KYC & bank → documents →
 * agreement review → digital signature (typed name + drawn signature + mobile OTP) →
 * admin verification → approval. Also "Legal & Compliance → My Agreements".
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, fetchFile, saveBlob } from '../lib/api.js';
import { Spinner, Strength } from '../components/ui.jsx';
import { LogoMark } from '../components/Icons.jsx';
import { DocViewer, LegalDocView, DocActions, downloadPdf, fmtDate, fmtTime } from '../components/Legal.jsx';
import { STATES } from '../pages/Checkout.jsx';
import { ONBOARDING_STATUS, dealerProblems } from '@shared/legal.js';
import { stateForPin } from '@shared/pincode.js';

const F = ({ label, error, hint, children, req }) => (
  <label className={`dl-field ${error ? 'is-err' : ''}`}>
    <span>{label}{req && <i aria-hidden="true"> *</i>}</span>
    {children}
    {hint && !error && <small className="dl-muted dl-small">{hint}</small>}
    {error && <small className="dl-err" role="alert">{error}</small>}
  </label>
);
const daysLeft = (iso) => Math.max(0, Math.ceil((Date.parse(iso) - Date.now()) / 864e5));

// ---------------------------------------------------------------- registration
export function DealerRegister({ onIn }) {
  const [f, setF] = useState({ business_name: '', name: '', phone: '', email: '', password: '', confirm_password: '' });
  const [st, setSt] = useState({});
  const nav = useNavigate();
  const u = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault(); setSt({ busy: true });
    try { const r = await api.post('/dealer/register', f); onIn(r.dealer); nav('/dealer/onboarding'); } catch (x) { setSt({ err: x.message, fields: x.fields }); }
  };
  const fe = st.fields || {};
  return (
    <div className="dl-auth">
      <form className="dl-auth__card" onSubmit={submit} noValidate>
        <div className="dl-brand"><LogoMark /><div><b>Utsav Ghar</b><small>Become a dealer</small></div></div>
        <h1>Register your business</h1>
        <p className="dl-muted">Takes 2 minutes. Next you add KYC, documents and sign the dealer agreement. Our team verifies and approves.</p>
        <F label="Business / shop name" req error={fe.business_name}><input value={f.business_name} onChange={u('business_name')} autoComplete="organization" /></F>
        <F label="Your name" req error={fe.name}><input value={f.name} onChange={u('name')} autoComplete="name" /></F>
        <F label="Mobile number" req error={fe.phone} hint="You sign in with this number. OTP for signing comes here."><input inputMode="numeric" value={f.phone} onChange={u('phone')} autoComplete="tel" placeholder="98xxxxxxxx" /></F>
        <F label="Email" req error={fe.email}><input type="email" value={f.email} onChange={u('email')} autoComplete="email" /></F>
        <F label="Password" req error={fe.password}><input type="password" value={f.password} onChange={u('password')} autoComplete="new-password" /></F>
        <Strength value={f.password} />
        <F label="Confirm password" req error={fe.confirm_password || (f.confirm_password && f.confirm_password !== f.password ? 'Passwords do not match' : '')}><input type="password" value={f.confirm_password} onChange={u('confirm_password')} autoComplete="new-password" /></F>
        <input type="text" name="website" tabIndex={-1} autoComplete="off" className="dl-hp" aria-hidden="true" />
        {st.err && !Object.keys(fe).length && <p className="dl-err" role="alert">{st.err}</p>}
        <button className="dl-btn dl-btn--primary dl-btn--block" disabled={st.busy}>{st.busy ? 'Creating…' : 'Create dealer account'}</button>
        <p className="dl-muted dl-small dl-center">Already registered? <Link to="/dealer">Sign in</Link></p>
        <Link to="/" className="dl-btn dl-btn--ghost dl-btn--block dl-tostore">← Back to Utsav Ghar store</Link>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------- onboarding home
export function useOnboarding() {
  const [d, setD] = useState(null);
  const load = useCallback(() => api.get('/dealer/onboarding').then(setD).catch(() => setD(false)), []);
  useEffect(() => { load(); }, [load]);
  return [d, load, setD];
}

export function OnboardingBanner({ dealer }) {
  if (!dealer || dealer.onboarding_status === 'approved') return null;
  if (dealer.can_receive_orders && dealer.onboarding_deadline) {
    const n = daysLeft(dealer.onboarding_deadline);
    return <Link to="/dealer/onboarding" className="dl-banner dl-banner--kyc">📝 Complete KYC & sign the dealer agreement — {n} day{n === 1 ? '' : 's'} left (by {fmtDate(dealer.onboarding_deadline)}). Orders pause after that. →</Link>;
  }
  return null;
}

const STEP_ICON = { business: '🏪', kyc: '🪪', documents: '📄', review: '📜', sign: '✍️', verification: '🔎', approval: '✅' };

export function Onboarding({ onChanged }) {
  const [d, load, setD] = useOnboarding();
  const [open, setOpen] = useState(null);
  const [justSigned, setJustSigned] = useState(null);
  useEffect(() => { if (d && open === null) setOpen(d.status === 'approved' && !d.pending_versions.length ? null : d.progress.current); }, [d]); // eslint-disable-line react-hooks/exhaustive-deps
  if (d === null) return <Spinner />;
  if (!d) return <p className="dl-err">Could not load your onboarding. Please refresh.</p>;
  const after = (x) => { setD(x); onChanged?.(); };
  const st = ONBOARDING_STATUS[d.status] || {};
  const resign = d.status === 'agreement_pending' || (d.status === 'approved' && d.pending_versions.length > 0);
  const canSign = ['draft', 'documents_pending', 'agreement_pending'].includes(d.status) || resign;
  const steps = d.steps.map((s) => ({ ...s, done: d.progress.done[s.key] && !(resign && (s.key === 'review' || s.key === 'sign')) }));
  const current = resign ? 'review' : d.progress.current;
  return (
    <div className="dl-page lg-onb">
      <div className="dl-head"><div><h1 className="dl-h1">Dealer onboarding</h1><p className="dl-muted dl-small">Status: <span className={`dl-pill dl-pill--${st.tone}`}>{st.label}</span></p></div></div>
      {d.status_reason && <p className="dl-note">💬 {d.status_reason}</p>}
      {d.deadline && d.can_receive_orders && d.status !== 'approved' && <p className="dl-note">⏳ You can keep receiving orders until {fmtDate(d.deadline)} ({daysLeft(d.deadline)} days). Finish all steps before then.</p>}
      {d.status === 'under_review' && <p className="dl-note dl-note--ok">🔎 Thank you! Your agreement is signed. Our team is checking your documents — usually within 2 working days. We will message you.</p>}
      {d.status === 'approved' && !resign && <p className="dl-note dl-note--ok">✅ Approved. Your signed agreements are in <Link to="/dealer/legal">Legal &amp; Agreements</Link>.</p>}
      <ol className="lg-steps dl-box">
        {steps.map((s, i) => (
          <li key={s.key} className={`${s.done ? 'is-done' : ''} ${s.key === current ? 'is-now' : ''}`}>
            <span className="lg-steps__dot">{s.done ? '✓' : i + 1}</span>
            <span>{STEP_ICON[s.key]} {s.label}{s.key === 'documents' && d.progress.rejected.length ? <small> · {d.progress.rejected.length} rejected</small> : null}</span>
            {['business', 'kyc', 'documents', 'review', 'sign'].includes(s.key) && (d.editable || s.key === 'documents' || ((s.key === 'review' || s.key === 'sign') && canSign))
              ? <button type="button" className="dl-btn dl-btn--ghost dl-small" onClick={() => setOpen(open === s.key ? null : s.key)} aria-expanded={open === s.key}>{open === s.key ? 'Close' : s.done ? 'View' : 'Open'}</button>
              : <small>{s.done ? 'Done' : s.key === 'verification' ? (d.status === 'under_review' ? 'In progress' : 'Waiting') : 'Waiting'}</small>}
          </li>
        ))}
      </ol>
      {open === 'business' && <BusinessStep d={d} onSaved={(x) => { after(x); setOpen('kyc'); }} />}
      {open === 'kyc' && <KycStep d={d} onSaved={(x) => { after(x); setOpen('documents'); }} />}
      {open === 'documents' && <DocumentsStep d={d} onSaved={after} onNext={() => setOpen('review')} />}
      {(open === 'review' || open === 'sign') && canSign && <AgreementStep d={d} stage={open} setStage={setOpen} onSigned={async (r) => { await load(); onChanged?.(); setOpen('done'); setJustSigned(r?.refs || []); }} />}
      {justSigned && <SignedNow refs={justSigned} />}
      <p className="dl-muted dl-small">Need help? Call or WhatsApp the Utsav Ghar dealer team. Your bank and KYC details are encrypted and seen only by our verification team.</p>
    </div>
  );
}

function BusinessStep({ d, onSaved }) {
  const [f, setF] = useState(d.business);
  const [st, setSt] = useState({});
  const u = (k) => (e) => { const v = e.target.value; const n = { ...f, [k]: v }; if (k === 'pincode' && /^\d{6}$/.test(v) && !f.state) n.state = stateForPin(v) || ''; setF(n); };
  const save = async (e) => {
    e.preventDefault();
    const local = dealerProblems(f, 'business'); if (Object.keys(local).length) { setSt({ fields: local }); return; }
    setSt({ busy: true });
    try { onSaved(await api.put('/dealer/onboarding/business', f)); } catch (x) { setSt({ err: x.message, fields: x.fields }); }
  };
  const fe = st.fields || {};
  return (
    <form className="dl-box" onSubmit={save} noValidate>
      <h2>1. Business information</h2>
      <F label="Business / shop name" req error={fe.business_name}><input value={f.business_name} onChange={u('business_name')} /></F>
      <F label="Legal entity name (as on PAN / GST)" req error={fe.legal_name}><input value={f.legal_name} onChange={u('legal_name')} /></F>
      <F label="Business type" req error={fe.business_type}><select value={f.business_type} onChange={u('business_type')}><option value="">Choose…</option>{Object.entries(d.business_types).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></F>
      <F label="Contact person" req error={fe.name}><input value={f.name} onChange={u('name')} /></F>
      <F label="Mobile number" hint="Registered number — contact us to change it"><input value={f.phone} disabled /></F>
      <F label="Email" req error={fe.email}><input type="email" value={f.email} onChange={u('email')} /></F>
      <F label="Registered address" req error={fe.registered_address}><textarea rows={2} value={f.registered_address} onChange={u('registered_address')} /></F>
      <label className="dl-tick"><input type="checkbox" checked={f.address && f.address === f.registered_address} onChange={(e) => setF({ ...f, address: e.target.checked ? f.registered_address : '' })} /> <span>Business / pickup address is the same</span></label>
      <F label="Business / pickup address" req error={fe.address}><textarea rows={2} value={f.address} onChange={u('address')} /></F>
      <div className="dl-grid3">
        <F label="PIN code" req error={fe.pincode}><input inputMode="numeric" maxLength={6} value={f.pincode} onChange={u('pincode')} /></F>
        <F label="City" req error={fe.city}><input value={f.city} onChange={u('city')} /></F>
        <F label="State" req error={fe.state}><select value={f.state} onChange={u('state')}><option value="">Choose…</option>{STATES.map((x) => <option key={x}>{x}</option>)}</select></F>
      </div>
      <F label="Country"><input value={f.country} onChange={u('country')} /></F>
      <F label="Website (optional)" error={fe.website}><input value={f.website} onChange={u('website')} placeholder="https://" /></F>
      {st.err && <p className="dl-err" role="alert">{st.err}</p>}
      <button className="dl-btn dl-btn--primary dl-btn--block" disabled={st.busy}>{st.busy ? 'Saving…' : 'Save & continue'}</button>
    </form>
  );
}

function KycStep({ d, onSaved }) {
  const [f, setF] = useState({ ...d.kyc, bank_account: '', bank_account_confirm: '' });
  const [st, setSt] = useState({});
  const u = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const company = ['private_limited', 'public_limited', 'llp'].includes(d.business.business_type);
  const save = async (e) => {
    e.preventDefault(); setSt({ busy: true });
    const body = { ...f }; if (!body.bank_account) { delete body.bank_account; delete body.bank_account_confirm; }
    try { onSaved(await api.put('/dealer/onboarding/kyc', body)); } catch (x) { setSt({ err: x.message, fields: x.fields }); }
  };
  const fe = st.fields || {};
  return (
    <form className="dl-box" onSubmit={save} noValidate>
      <h2>2. Tax, registration & bank</h2>
      <div className="dl-grid2">
        <F label="PAN" req error={fe.pan}><input value={f.pan} onChange={u('pan')} maxLength={10} placeholder="ABCDE1234F" autoCapitalize="characters" /></F>
        <F label="GSTIN" error={fe.gstin} hint="If registered for GST"><input value={f.gstin} onChange={u('gstin')} maxLength={15} autoCapitalize="characters" /></F>
        <F label={d.business.business_type === 'llp' ? 'LLPIN' : 'CIN'} req={company} error={fe.cin} hint={company ? '' : 'Companies / LLPs only'}><input value={f.cin} onChange={u('cin')} maxLength={21} autoCapitalize="characters" /></F>
        <F label="TAN (optional)" error={fe.tan}><input value={f.tan} onChange={u('tan')} maxLength={10} autoCapitalize="characters" /></F>
        <F label="Business registration no. (optional)" error={fe.registration_no}><input value={f.registration_no} onChange={u('registration_no')} /></F>
        <F label="Udyam / MSME no. (optional)" error={fe.udyam}><input value={f.udyam} onChange={u('udyam')} placeholder="UDYAM-MH-00-0000000" autoCapitalize="characters" /></F>
        <F label="Trade / shop licence no. (optional)" error={fe.trade_license}><input value={f.trade_license} onChange={u('trade_license')} /></F>
      </div>
      <h3 className="dl-sub">Bank account for payments</h3>
      <F label="Bank name" req error={fe.bank_name}><input value={f.bank_name} onChange={u('bank_name')} /></F>
      <F label="Account holder name" req error={fe.bank_holder} hint="Must match the business or proprietor name"><input value={f.bank_holder} onChange={u('bank_holder')} /></F>
      {d.kyc.bank_account_masked && <p className="dl-muted dl-small">Saved account: <b>{d.kyc.bank_account_masked}</b>. Fill below only to change it.</p>}
      <div className="dl-grid2">
        <F label="Account number" req={!d.kyc.bank_account_masked} error={fe.bank_account}><input inputMode="numeric" autoComplete="off" value={f.bank_account} onChange={u('bank_account')} /></F>
        <F label="Re-enter account number" req={!d.kyc.bank_account_masked} error={fe.bank_account_confirm}><input inputMode="numeric" autoComplete="off" value={f.bank_account_confirm} onChange={u('bank_account_confirm')} onPaste={(e) => e.preventDefault()} /></F>
        <F label="IFSC" req error={fe.ifsc}><input value={f.ifsc} onChange={u('ifsc')} maxLength={11} placeholder="HDFC0001234" autoCapitalize="characters" /></F>
        <F label="Branch (optional)" error={fe.bank_branch}><input value={f.bank_branch} onChange={u('bank_branch')} /></F>
      </div>
      <p className="dl-muted dl-small">🔒 Bank details are encrypted. Upload a cancelled cheque in the next step.</p>
      {st.err && <p className="dl-err" role="alert">{st.err}</p>}
      <button className="dl-btn dl-btn--primary dl-btn--block" disabled={st.busy}>{st.busy ? 'Saving…' : 'Save & continue'}</button>
    </form>
  );
}

const DOC_STATE = {
  none: { label: 'Pending', tone: 'warn' },
  pending: { label: 'Under review', tone: 'info' },
  verified: { label: 'Approved', tone: 'ok' },
  rejected: { label: 'Rejected', tone: 'bad' },
};
function DocumentsStep({ d, onSaved, onNext }) {
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState({});
  const [openUp, setOpenUp] = useState(null);
  const latest = {}; for (const x of d.documents) if (x.latest) latest[x.doc_type] = x;
  const types = [...d.required.map((k) => [k, true]), ...d.optional.map((k) => [k, false])];
  const upload = async (type, form) => {
    const file = form.file.files[0];
    if (!file) { setErr({ ...err, [type]: 'Choose a file' }); return; }
    if (file.size > 5 * 1024 * 1024) { setErr({ ...err, [type]: 'File is larger than 5 MB' }); return; }
    if (!/^(application\/pdf|image\/(jpeg|png))$/.test(file.type)) { setErr({ ...err, [type]: 'Use a PDF, JPG or PNG file' }); return; }
    const fd = new FormData(); fd.append('doc_type', type); fd.append('doc_number', form.doc_number?.value || ''); fd.append('expiry_date', form.expiry_date?.value || ''); fd.append('file', file);
    setBusy(type); setErr({ ...err, [type]: '' });
    try { onSaved(await api.post('/dealer/onboarding/documents', fd)); setOpenUp(null); } catch (x) { setErr({ ...err, [type]: x.fields?.file || x.fields?.expiry_date || x.message }); } finally { setBusy(''); }
  };
  const view = async (x) => { try { const bl = await fetchFile(`/dealer/onboarding/documents/${x.id}/file`); window.open(URL.createObjectURL(bl), '_blank', 'noopener'); } catch { /* */ } };
  const remove = async (x) => { try { onSaved(await api.del(`/dealer/onboarding/documents/${x.id}`)); } catch (e) { setErr({ ...err, [x.doc_type]: e.message }); } };
  const locked = ['rejected', 'suspended', 'terminated'].includes(d.status);
  const done = d.required.filter((k) => latest[k] && latest[k].status !== 'rejected').length;
  return (
    <div className="dl-box">
      <h2>3. Dealer Documents</h2>
      <p className="dl-muted dl-small">Upload clear copies (PDF, JPG or PNG, up to 5 MB). Our team reviews each document. <b>{done} of {d.required.length}</b> required documents uploaded.</p>
      <div className="dl-doctable" role="table" aria-label="Document checklist">
        <div className="dl-doctable__head" role="row"><span role="columnheader">Document · required?</span><span role="columnheader">Status</span></div>
        {types.map(([k, req]) => {
          const t = d.doc_types[k]; const cur = latest[k]; const st = DOC_STATE[cur ? cur.status : 'none'];
          const canUpload = !locked && (!cur || cur.status === 'rejected' || (cur.status === 'pending' && !d.signed));
          return (
            <div key={k} className={`dl-docrow ${cur?.status === 'rejected' ? 'is-bad' : ''}`} role="row">
              <span role="cell" className="dl-docrow__name">{t.label}<small className={req ? 'is-req' : ''}>{req ? 'Required' : 'If applicable'}</small></span>
              <span role="cell">{cur || req ? <span className={`dl-pill dl-pill--${st.tone}`}>{cur?.status === 'pending' ? 'Uploaded ✓ · Under review' : st.label}</span> : <span className="dl-small dl-muted">—</span>}</span>
              <div className="dl-docrow__more">
                {cur && <p className="dl-small dl-muted">{cur.original_name || 'file'} · {fmtDate(cur.uploaded_at)}{cur.doc_number ? ` · No. ${cur.doc_number}` : ''}{cur.expiry_date ? ` · valid till ${fmtDate(cur.expiry_date)}` : ''} · <button type="button" className="dl-linkbtn" onClick={() => view(cur)}>View</button>{cur.status === 'pending' && !d.signed && <> · <button type="button" className="dl-linkbtn" onClick={() => remove(cur)}>Remove</button></>}</p>}
                {cur?.reject_reason && <p className="dl-err">Rejected: {cur.reject_reason}. Please upload again.</p>}
                {canUpload && (openUp === k || !cur || cur.status === 'rejected'
                  ? (
                    <form className="dl-upload" onSubmit={(e) => { e.preventDefault(); upload(k, e.currentTarget); }}>
                      {t.number && <input name="doc_number" placeholder="Document number (optional)" maxLength={60} />}
                      {t.expires && <input name="expiry_date" type="date" aria-label="Valid until" />}
                      <input name="file" type="file" accept="application/pdf,image/jpeg,image/png" aria-label={`Upload ${t.label}`} />
                      <button className="dl-btn" disabled={busy === k}>{busy === k ? 'Uploading…' : cur ? 'Upload again' : 'Upload Document'}</button>
                    </form>
                  ) : <button type="button" className="dl-linkbtn" onClick={() => setOpenUp(k)}>Replace file</button>)}
                {err[k] && <p className="dl-err" role="alert">{err[k]}</p>}
              </div>
            </div>
          );
        })}
      </div>
      {d.progress.done.documents && !d.signed && <button className="dl-btn dl-btn--primary dl-btn--block" onClick={onNext}>Continue: read the Dealer Agreement →</button>}
    </div>
  );
}

// ---------------------------------------------------------------- agreement + signature
function SignaturePad({ onChange }) {
  const ref = useRef(null); const drawing = useRef(false); const has = useRef(false);
  useEffect(() => {
    const c = ref.current; const r = c.getBoundingClientRect(); const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = r.width * dpr; c.height = r.height * dpr;
    const ctx = c.getContext('2d'); ctx.scale(dpr, dpr); ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#1B1464';
  }, []);
  const pos = (e) => { const r = ref.current.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const down = (e) => { e.preventDefault(); ref.current.setPointerCapture(e.pointerId); drawing.current = true; const ctx = ref.current.getContext('2d'); ctx.beginPath(); ctx.moveTo(...pos(e)); };
  const move = (e) => { if (!drawing.current) return; const ctx = ref.current.getContext('2d'); ctx.lineTo(...pos(e)); ctx.stroke(); has.current = true; };
  const up = () => { if (!drawing.current) return; drawing.current = false; if (has.current) onChange(ref.current.toDataURL('image/png')); };
  const clear = () => { const c = ref.current; c.getContext('2d').clearRect(0, 0, c.width, c.height); has.current = false; onChange(''); };
  return (
    <div className="lg-sign">
      <canvas ref={ref} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up} aria-label="Signature box: sign with your finger or mouse" role="img" />
      <div className="lg-sign__row"><span>Sign above with your finger or mouse</span><button type="button" onClick={clear}>Clear</button></div>
    </div>
  );
}

function AgreementStep({ d, stage, setStage, onSigned }) {
  const [ag, setAg] = useState(null);
  const [viewing, setViewing] = useState(false);
  const [checks, setChecks] = useState({});
  const [f, setF] = useState({ typed_name: '', capacity: '', authorised: false, signature_png: '', otp: '' });
  const [otp, setOtp] = useState(null);
  const [st, setSt] = useState({});
  useEffect(() => { api.get('/dealer/onboarding/agreement').then((x) => { setAg(x); setF((c) => ({ ...c, typed_name: c.typed_name || x.signer_default || '' })); }).catch(() => setAg(false)); }, []);
  if (ag === null) return <Spinner />;
  if (!ag) return <p className="dl-err">Could not load the agreement.</p>;
  const ready = d.progress.done.business && d.progress.done.kyc && d.progress.done.documents;
  const allChecked = ag.checks.every((c) => checks[c.key]);
  const main = ag.docs.find((x) => x.kind === 'dealer_agreement') || ag.docs[0];
  const sendOtp = async () => { setSt({ ...st, otpBusy: true, err: '' }); try { setOtp(await api.post('/dealer/onboarding/sign/otp')); setSt({}); } catch (x) { setSt({ err: x.message }); } };
  const sign = async (e) => {
    e.preventDefault(); setSt({ busy: true });
    try { const r = await api.post('/dealer/onboarding/sign', { ...f, checks }); await onSigned(r); } catch (x) { setSt({ err: x.message, fields: x.fields }); }
  };
  const fe = st.fields || {};
  const actions = <DocActions doc={ag.docs} pdfPath="/dealer/onboarding/agreement/pdf" pdfName="utsav-ghar-dealer-agreement.pdf" onView={() => setViewing(true)} />;
  return (
    <div className="dl-box">
      {stage === 'review' ? (
        <>
          <h2>4. Dealer Agreement</h2>
          {!ready && <p className="dl-note">Finish business details, KYC and the required documents first.</p>}
          {actions}
          <div className="dl-agscroll"><LegalDocView body={main.body} compact /></div>
          {ag.docs.filter((x) => x !== main).map((x) => <p key={x.kind} className="dl-small">Also part of your agreement: <button type="button" className="dl-linkbtn" onClick={() => setViewing([x])}>{x.title} v{x.version}</button></p>)}
          <button type="button" className="dl-btn dl-btn--primary dl-btn--block" disabled={!ready} onClick={() => setStage('sign')}>I have read it — continue to sign →</button>
        </>
      ) : (
        <form onSubmit={sign} noValidate className="dl-signform">
          <h2>5. Sign Dealer Agreement</h2>
          <dl className="dl-signinfo">
            <div><dt>Dealer name</dt><dd>{ag.dealer_name}</dd></div>
            <div><dt>Business name</dt><dd>{ag.business_name}</dd></div>
            <div><dt>Agreement version</dt><dd>{ag.docs.map((x) => `${x.title} v${x.version}`).join(' · ')}</dd></div>
            <div><dt>Agreement date</dt><dd>{fmtDate(ag.agreement_date)}</dd></div>
          </dl>
          {actions}
          <fieldset className="lg-consents">
            <legend>Please confirm *</legend>
            {ag.checks.map((c) => (
              <div key={c.key} className={`lg-consent ${fe[`checks.${c.key}`] ? 'is-err' : ''}`}>
                <label><input type="checkbox" checked={!!checks[c.key]} onChange={(e) => setChecks({ ...checks, [c.key]: e.target.checked })} /> <span>{c.label}</span></label>
              </div>
            ))}
          </fieldset>
          <h3 className="dl-sub">Digital signature</h3>
          <F label="Type your full name" req error={fe.typed_name}><input value={f.typed_name} onChange={(e) => setF({ ...f, typed_name: e.target.value })} autoComplete="name" /></F>
          <F label="Capacity / designation" req error={fe.capacity} hint="e.g. Proprietor, Partner, Director, Authorised signatory"><input value={f.capacity} onChange={(e) => setF({ ...f, capacity: e.target.value })} list="dl-cap" /></F>
          <datalist id="dl-cap"><option>Proprietor</option><option>Partner</option><option>Designated Partner</option><option>Director</option><option>Authorised Signatory</option></datalist>
          <label className={`dl-tick ${fe.authorised ? 'is-err' : ''}`}><input type="checkbox" checked={f.authorised} onChange={(e) => setF({ ...f, authorised: e.target.checked })} /> <span>I am authorised to sign for {ag.business_name}.</span></label>
          <div className={`dl-field ${fe.signature_png ? 'is-err' : ''}`}><span>Draw your signature *</span><SignaturePad onChange={(v) => setF((c) => ({ ...c, signature_png: v }))} />{fe.signature_png && <small className="dl-err">{fe.signature_png}</small>}</div>
          <div className="dl-otp-row">
            <button type="button" className="dl-btn" onClick={sendOtp} disabled={st.otpBusy || !allChecked || !f.signature_png}>{otp ? 'Resend code' : 'Verify with mobile OTP'}</button>
            {otp && <span className="dl-small dl-muted">Code sent to {otp.sent_to}{otp.dev_otp ? ` · preview code: ${otp.dev_otp}` : ''}</span>}
          </div>
          {otp && <F label="6-digit code" req error={fe.otp}><input inputMode="numeric" maxLength={6} value={f.otp} onChange={(e) => setF({ ...f, otp: e.target.value.replace(/\D/g, '') })} autoComplete="one-time-code" className="dl-otp" /></F>}
          {st.err && !Object.keys(fe).length && <p className="dl-err" role="alert">{st.err}</p>}
          <button className="dl-btn dl-btn--primary dl-btn--big dl-btn--block" disabled={st.busy || !otp || f.otp.length !== 6 || !allChecked || !f.signature_png || !f.authorised}>{st.busy ? 'Signing…' : '✍️ Sign & Submit Agreement'}</button>
          <p className="dl-muted dl-small">Signed electronically under the IT Act, 2000. We record the date, time, IP address, device and OTP reference with your signature.</p>
        </form>
      )}
      {viewing && <DocViewer docs={viewing === true ? ag.docs : viewing} onClose={() => setViewing(false)} pdfPath="/dealer/onboarding/agreement/pdf" pdfName="utsav-ghar-dealer-agreement.pdf" />}
    </div>
  );
}

/** Shown right after signing. */
function SignedNow({ refs }) {
  const [items, setItems] = useState(null);
  useEffect(() => { api.get('/dealer/legal').then((x) => setItems(x.items.filter((a) => refs.includes(a.ref_no)))).catch(() => setItems([])); }, [refs]);
  return (
    <div className="dl-box dl-signed">
      <h2>✅ Agreement signed</h2>
      <p>Thank you! Your signed agreement is saved. Our team will now verify your documents and approve your account.</p>
      {(items || []).map((a) => <button key={a.id} type="button" className="dl-btn dl-btn--primary dl-btn--block" onClick={() => downloadPdf(`/dealer/legal/${a.id}/pdf`, `${a.ref_no}.pdf`)}>⬇️ Download Signed {a.title} PDF</button>)}
      <Link to="/dealer/legal" className="dl-btn dl-btn--block">📜 Open Legal &amp; Agreements</Link>
    </div>
  );
}

// ---------------------------------------------------------------- Dealer Dashboard → Legal & Agreements
export function MyAgreements() {
  const [d, setD] = useState(null);
  const [docs, setDocs] = useState(null);
  const [view, setView] = useState(null);
  useEffect(() => {
    api.get('/dealer/legal').then(setD).catch(() => setD({ items: [], pending: [] }));
    api.get('/dealer/legal/docs').then((x) => setDocs(x.docs)).catch(() => setDocs([]));
  }, []);
  if (!d || !docs) return <Spinner />;
  const current = d.items.filter((x) => x.current); const old = d.items.filter((x) => !x.current);
  const Row = ({ a }) => (
    <li className="dl-agrow">
      <div><b>{a.title}</b> <span className="dl-muted dl-small">v{a.version}</span><br /><span className="dl-small dl-muted">Signed {fmtTime(a.accepted_at)} by {a.signature?.typed_name} ({a.signature?.capacity}) · Agreement no. {a.ref_no}{a.verification ? ` · ${a.verification}` : ''}</span></div>
      <button type="button" className="dl-btn" onClick={() => downloadPdf(`/dealer/legal/${a.id}/pdf`, `${a.ref_no}.pdf`)}>⬇️ PDF</button>
    </li>
  );
  return (
    <div className="dl-page">
      <div className="dl-head"><Link to="/dealer/profile" className="dl-back" aria-label="Back">←</Link><div><h1 className="dl-h1">Legal &amp; Agreements</h1><p className="dl-muted dl-small">Your documents in simple words, and every agreement you signed.</p></div></div>
      {d.pending.length > 0 && <Link to="/dealer/onboarding" className="dl-note">✍️ A new version needs your signature: {d.pending.map((p) => `${p.title} v${p.version}`).join(', ')} →</Link>}
      {d.health && (
        <section className="dl-box">
          <h2>Account health <span className={`dl-health dl-health--${d.health.tone}`}>{d.health.icon} {d.health.label}</span></h2>
          <p className="dl-muted dl-small">Last {d.health.window_days} days · {d.health.orders} orders. Targets are explained in the Dealer Performance &amp; Account Health Policy.</p>
          <ul className="dl-hlist">{d.health.metrics.map((m) => <li key={m.key} className={`is-${m.level}`}><span>{d.levels?.[m.level]?.icon} {m.label}</span><b>{m.display}</b></li>)}</ul>
        </section>
      )}
      {d.violations?.length > 0 && (
        <section className="dl-box">
          <h2>Policy issues</h2>
          <ul className="dl-aglist">{d.violations.map((v) => (
            <li key={v.id} className="dl-viol">
              <div><b>{d.severity?.[v.severity]?.icon} {v.title}</b> <span className="dl-small dl-muted">· {d.violation_status?.[v.status]?.label} · {fmtTime(v.created_at)}{v.due_at && ['open', 'correction_requested'].includes(v.status) ? ` · respond by ${fmtTime(v.due_at)}` : ''}</span></div>
              <p className="dl-small">{v.description}</p>
              {v.updates.map((u, i) => <p key={i} className="dl-small dl-muted">↳ {u.note} ({fmtTime(u.at)})</p>)}
            </li>
          ))}</ul>
          <p className="dl-small dl-muted">To respond or appeal, reply to our email or contact the Utsav Ghar team. See the Dealer Violation, Suspension &amp; Termination Policy.</p>
        </section>
      )}
      <section className="dl-box"><h2>Signed agreement</h2>{current.length ? <ul className="dl-aglist">{current.map((a) => <Row key={a.id} a={a} />)}</ul> : <p className="dl-muted">Not signed yet. <Link to="/dealer/onboarding">Complete onboarding →</Link></p>}</section>
      <section className="dl-box">
        <h2>Documents</h2>
        <ul className="dl-aglist">
          {docs.map((x) => (
            <li key={x.kind} className="dl-docitem">
              <div><b>{x.title}</b> <span className="dl-muted dl-small">{x.version === 'current' ? 'your current terms' : `v${x.version}`}</span></div>
              <DocActions doc={x} pdfPath={x.kind === 'commercial' ? null : `/dealer/legal/doc/${x.kind}/pdf`} pdfName={`utsav-ghar-${x.kind}-v${x.version}.pdf`} onView={() => setView(x)} />
            </li>
          ))}
        </ul>
      </section>
      {old.length > 0 && <section className="dl-box"><h2>Previous agreements</h2><ul className="dl-aglist">{old.map((a) => <Row key={a.id} a={a} />)}</ul></section>}
      <Link to="/dealer/onboarding" className="dl-btn dl-btn--block">📝 My onboarding, KYC &amp; documents</Link>
      {view && <DocViewer docs={[view]} onClose={() => setView(null)} pdfPath={view.kind === 'commercial' ? null : `/dealer/legal/doc/${view.kind}/pdf`} pdfName={`utsav-ghar-${view.kind}.pdf`} />}
    </div>
  );
}
