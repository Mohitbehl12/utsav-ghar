/**
 * Admin → Security: password, two-step login (authenticator app), sign out
 * everywhere, a health checklist, recent sign-ins and blocked attempts.
 */
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { api } from '../lib/api.js';
import { fmtDateTime } from '../lib/format.js';
import { Field, Pill, Spinner, Empty, Strength } from '../components/ui.jsx';
import { useToast } from '../state/store.jsx';
import { passwordProblem } from '@shared/security.js';
import { PageHead, useAdminData } from './pages.jsx';

/** Password change form (also used as the forced first-login screen). */
export function ChangePassword({ admin, onDone, forced = false }) {
  const toast = useToast();
  const [f, setF] = useState({ current: '', next: '', again: '' });
  const [err, setErr] = useState({});
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    const p = passwordProblem(f.next, { min: 10, email: admin.email, name: admin.name, admin: true });
    if (p) return setErr({ next: p });
    if (f.next !== f.again) return setErr({ again: "Passwords don't match" });
    setBusy(true); setErr({});
    try { await api.put('/admin/me/password', { current: f.current, next: f.next }); toast('Password changed. Other devices were signed out.'); setF({ current: '', next: '', again: '' }); onDone?.(); }
    catch (x) { setErr({ ...x.fields, form: Object.keys(x.fields || {}).length ? '' : x.message }); }
    finally { setBusy(false); }
  };
  return (
    <form className="card form" onSubmit={submit}>
      <h2>{forced ? '🔐 Set your own password to continue' : '🔑 Change password'}</h2>
      {forced && <p className="notice notice--warn small">You signed in with the starting password. Anyone who has seen the setup guide knows it, so choose your own now. The admin panel unlocks after this.</p>}
      <Field label="Current password" id="pw-cur" error={err.current}><input id="pw-cur" type="password" autoComplete="current-password" value={f.current} onChange={(e) => setF({ ...f, current: e.target.value })} required /></Field>
      <Field label="New password" id="pw-new" error={err.next} hint="10+ characters with letters and a number. A short sentence works well, e.g. Diya-on-the-roof-2026">
        <input id="pw-new" type="password" autoComplete="new-password" value={f.next} onChange={(e) => setF({ ...f, next: e.target.value })} required />
      </Field>
      <Strength value={f.next} />
      <Field label="Repeat new password" id="pw-again" error={err.again}><input id="pw-again" type="password" autoComplete="new-password" value={f.again} onChange={(e) => setF({ ...f, again: e.target.value })} required /></Field>
      {err.form && <p className="field__error" role="alert">{err.form}</p>}
      <button className="btn btn--primary" disabled={busy}>{busy ? 'Saving…' : 'Save new password'}</button>
    </form>
  );
}

function TwoStep({ admin, onChange }) {
  const toast = useToast();
  const [setup, setSetup] = useState(null);
  const [qr, setQr] = useState('');
  const [code, setCode] = useState('');
  const [codes, setCodes] = useState(null);
  const [off, setOff] = useState({ password: '', code: '' });
  const [err, setErr] = useState('');
  useEffect(() => { if (setup?.otpauth) QRCode.toDataURL(setup.otpauth, { margin: 1, width: 200 }).then(setQr).catch(() => setQr('')); }, [setup]);
  const start = async () => { setErr(''); setSetup(await api.post('/admin/me/2fa/setup', {})); };
  const enable = async (e) => {
    e.preventDefault(); setErr('');
    try { const r = await api.post('/admin/me/2fa/enable', { code }); setCodes(r.backupCodes); setSetup(null); onChange(); toast('Two-step login is on'); }
    catch (x) { setErr(x.message); }
  };
  const disable = async (e) => {
    e.preventDefault(); setErr('');
    try { await api.post('/admin/me/2fa/disable', off); onChange(); toast('Two-step login turned off', 'warn'); setOff({ password: '', code: '' }); }
    catch (x) { setErr(x.message); }
  };
  return (
    <section className="card form">
      <h2>📱 Two-step login {admin.totp_enabled ? <Pill tone="ok">On</Pill> : <Pill tone="warn">Off</Pill>}</h2>
      <p className="small muted">Even if someone learns your password, they can't sign in without the 6-digit code from your phone. Works with Google Authenticator, Microsoft Authenticator or Authy.</p>
      {codes && (
        <div className="notice notice--ok">
          <b>Save these backup codes</b> somewhere safe (not on this computer). Each works once if you lose your phone.
          <ul className="codes">{codes.map((c) => <li key={c}><code>{c}</code></li>)}</ul>
        </div>
      )}
      {!admin.totp_enabled && !setup && <button className="btn btn--primary" onClick={start}>Turn on two-step login</button>}
      {setup && (
        <form onSubmit={enable} className="twofa">
          <ol className="small">
            <li>Open your authenticator app and tap <b>+</b> → <b>Scan a QR code</b>.</li>
            <li>Scan this code (or type the key below).</li>
            <li>Enter the 6-digit code the app shows.</li>
          </ol>
          {qr ? <img src={qr} alt="QR code for your authenticator app" width="200" height="200" className="twofa__qr" /> : null}
          <p className="small">Key: <code className="twofa__key">{setup.secret.match(/.{1,4}/g).join(' ')}</code></p>
          <Field label="6-digit code" id="tf-code" error={err}><input id="tf-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} required /></Field>
          <button className="btn btn--primary">Confirm and turn on</button>
        </form>
      )}
      {admin.totp_enabled && (
        <form onSubmit={disable} className="twofa">
          <p className="small">To turn it off, enter your password and a current code.</p>
          <div className="grid-2">
            <Field label="Password" id="tf-pw"><input id="tf-pw" type="password" value={off.password} onChange={(e) => setOff({ ...off, password: e.target.value })} required /></Field>
            <Field label="6-digit code" id="tf-off"><input id="tf-off" inputMode="numeric" maxLength={6} value={off.code} onChange={(e) => setOff({ ...off, code: e.target.value })} required /></Field>
          </div>
          {err && <p className="field__error">{err}</p>}
          <button className="btn btn--ghost">Turn off two-step login</button>
        </form>
      )}
    </section>
  );
}

const KIND = { login_ok: 'Signed in', login_failed: 'Wrong password', locked: 'Account locked', backup_code_used: 'Backup code used', password_changed: 'Password changed', logout_all: 'Signed out everywhere', '2fa_enabled': 'Two-step on', '2fa_disabled': 'Two-step off', account_deleted: 'Customer deleted account', data_exported: 'Customer downloaded data', bot_blocked: 'Bot blocked' };

export function Security({ admin, onAdmin }) {
  const [d, reload] = useAdminData('/admin/security');
  const toast = useToast();
  const refreshMe = async () => { const r = await api.get('/admin/me'); onAdmin(r.admin); reload(); };
  const outAll = async () => {
    if (!window.confirm('Sign out of the admin panel on every device, including this one?')) return;
    await api.post('/admin/me/logout-all', {}); onAdmin(null);
  };
  const unlock = async (key) => { await api.post('/admin/security/unlock', { key }); toast('Unlocked'); reload(); };
  return (
    <>
      <PageHead title="Security" sub="Keep the admin panel, payments and customer accounts safe." />
      {d && (
        <section className="card">
          <h2>✅ Security checklist</h2>
          <ul className="seccheck">
            {d.checks.map((c) => (
              <li key={c.label} className={c.ok ? 'is-ok' : c.optional ? 'is-opt' : 'is-bad'}>
                <span aria-hidden="true">{c.ok ? '✅' : c.optional ? '➖' : '⚠️'}</span>
                <div><b>{c.label}</b>{!c.ok && <small>{c.fix}</small>}</div>
              </li>
            ))}
          </ul>
        </section>
      )}
      <div className="adm-grid adm-grid--even">
        <ChangePassword admin={admin} onDone={refreshMe} />
        <TwoStep admin={admin} onChange={refreshMe} />
      </div>
      <section className="card">
        <div className="row between wrap gap-s"><h2>💻 Sessions</h2><button className="btn btn--ghost btn--sm" onClick={outAll}>Sign out everywhere</button></div>
        <p className="small muted">Admin sign-ins last 12 hours. If you used a shared or lost computer, sign out everywhere and change your password.</p>
      </section>
      {!d ? <Spinner /> : (
        <>
          {d.locked.length > 0 && (
            <section className="card">
              <h2>🔒 Locked accounts</h2>
              <p className="small muted">Locked automatically after repeated wrong passwords. They unlock by themselves; unlock early only if you know it was the real person.</p>
              <div className="table-wrap" tabIndex={0} role="region" aria-label="Table"><table className="table"><tbody>{d.locked.map((l) => <tr key={l.key}><td>{l.key.replace(/^(user|admin):/, '$1 · ')}</td><td>{l.fails} tries</td><td>until {fmtDateTime(l.locked_until)}</td><td><button className="btn btn--ghost btn--sm" onClick={() => unlock(l.key)}>Unlock</button></td></tr>)}</tbody></table></div>
            </section>
          )}
          <div className="adm-grid adm-grid--even">
            <section className="card">
              <h2>👤 Recent admin sign-ins</h2>
              {d.logins.length === 0 ? <Empty icon="👤" title="No sign-ins yet" /> : (
                <div className="table-wrap" tabIndex={0} role="region" aria-label="Table"><table className="table"><tbody>{d.logins.slice(0, 12).map((e, i) => <tr key={i}><td className="small">{fmtDateTime(e.created_at)}</td><td className="small">{e.ip}</td><td className="small muted">{(e.user_agent || '').slice(0, 40)}</td></tr>)}</tbody></table></div>
              )}
              <p className="small muted">Don't recognise one? Sign out everywhere and change your password.</p>
            </section>
            <section className="card">
              <h2>🚫 Blocked & failed attempts (30 days)</h2>
              {d.failures.length === 0 ? <Empty icon="🛡️" title="Nothing suspicious" /> : (
                <div className="table-wrap" tabIndex={0} role="region" aria-label="Table"><table className="table"><tbody>{d.failures.slice(0, 15).map((e, i) => <tr key={i}><td className="small">{fmtDateTime(e.created_at)}</td><td><Pill tone={e.kind === 'locked' ? 'bad' : 'warn'}>{KIND[e.kind] || e.kind}</Pill></td><td className="small">{e.actor.replace(/^(user|admin|ip):/, '')}</td><td className="small muted">{e.ip}</td></tr>)}</tbody></table></div>
              )}
            </section>
          </div>
          <section className="card">
            <h2>📝 Account changes</h2>
            {d.changes.length === 0 ? <p className="small muted">None yet.</p> : (
              <div className="table-wrap" tabIndex={0} role="region" aria-label="Table"><table className="table"><tbody>{d.changes.map((e, i) => <tr key={i}><td className="small">{fmtDateTime(e.created_at)}</td><td>{KIND[e.kind] || e.kind}</td><td className="small">{e.actor}</td><td className="small muted">{e.ip}</td></tr>)}</tbody></table></div>
            )}
          </section>
        </>
      )}
    </>
  );
}
