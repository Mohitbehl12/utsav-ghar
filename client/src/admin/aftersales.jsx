/** Admin: Returns & refunds, Dealer settlements, Admin users & roles. */
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { rupees, fmtDate, fmtDateTime } from '../lib/format.js';
import { Pill, Spinner, Modal, Field, Empty } from '../components/ui.jsx';
import { useToast } from '../state/store.jsx';
import { useAdminData, PageHead } from './pages.jsx';
import { RETURN_STATUS, REFUND_STATUS } from '@shared/returns.js';
import { SETTLEMENT_STATUS } from '@shared/settlement.js';
import { ADMIN_ROLES, AREAS, PERMISSIONS, ACTIONS } from '@shared/roles.js';

const canDo = (admin, action) => admin?.role === 'owner' || (admin?.actions || []).includes(action);

// ---------------------------------------------------------------- Returns & refunds
export function Returns({ admin }) {
  const [sp, setSp] = useSearchParams();
  const view = sp.get('view') || 'returns';
  return (
    <>
      <PageHead title="Returns & refunds" sub="Approve or reject return requests, mark items received, and record every refund with its reference. A refund can never be more than the amount paid." />
      <div className="tabs" role="tablist">
        {[['returns', '↩️ Returns'], ['refunds', '💸 Refunds']].map(([k, l]) => <button key={k} role="tab" aria-selected={view === k} className={view === k ? 'is-on' : ''} onClick={() => setSp(k === 'returns' ? {} : { view: k })}>{l}</button>)}
      </div>
      {view === 'returns' ? <ReturnList admin={admin} /> : <RefundList admin={admin} />}
    </>
  );
}

function ReturnList({ admin }) {
  const [status, setStatus] = useState('requested');
  const [d, reload] = useAdminData(`/admin/returns${status ? `?status=${status}` : ''}`);
  const [open, setOpen] = useState(null);
  const tabs = [['requested', 'New'], ['approved', 'Approved'], ['received', 'Received'], ['refunded', 'Refunded'], ['rejected', 'Rejected'], ['', 'All']];
  return (
    <>
      <div className="chips" role="group" aria-label="Return status">
        {tabs.map(([k, l]) => <button key={k} className={`chip ${status === k ? 'is-on' : ''}`} onClick={() => setStatus(k)}>{l}{k && d?.counts?.[k] ? ` (${d.counts[k]})` : ''}</button>)}
      </div>
      {!d ? <Spinner /> : d.items.length === 0 ? <Empty icon="↩️" title="No returns here" /> : (
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Table">
          <table className="table">
            <thead><tr><th>Return</th><th>Order</th><th>Customer</th><th>Items</th><th>Reason</th><th className="num">Refund</th><th>Status</th><th /></tr></thead>
            <tbody>{d.items.map((r) => (
              <tr key={r.id}>
                <td><b>{r.number}</b><div className="small muted">{fmtDate(r.created_at)}</div></td>
                <td><Link className="link" to={`/admin/orders/${r.order_id}`}>#{r.order_number}</Link></td>
                <td>{r.customer?.name}<div className="small muted">{r.customer?.phone}</div></td>
                <td className="small">{r.items.map((i) => `${i.qty} × ${i.name}`).join(', ')}</td>
                <td className="small">{r.reason_label}{r.has_photo && <> · <a className="link" href={`/api/admin/returns/${r.id}/photo`} target="_blank" rel="noreferrer">Photo ↗</a></>}</td>
                <td className="num"><b>{rupees(r.refund_amount)}</b>{r.includes_delivery && <div className="small muted">incl. delivery</div>}</td>
                <td><Pill tone={RETURN_STATUS[r.status]?.tone}>{RETURN_STATUS[r.status]?.label}</Pill></td>
                <td>{['requested', 'approved'].includes(r.status) && canDo(admin, 'approve_return') && <button className="btn btn--sm btn--primary" onClick={() => setOpen(r)}>{r.status === 'requested' ? 'Decide' : 'Mark received'}</button>}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {open && <ReturnDecision r={open} onClose={() => setOpen(null)} onDone={() => { setOpen(null); reload(); }} />}
    </>
  );
}

function ReturnDecision({ r, onClose, onDone }) {
  const toast = useToast();
  const [note, setNote] = useState('');
  const [amount, setAmount] = useState((r.refund_amount / 100).toFixed(2));
  const [restock, setRestock] = useState(true);
  const [busy, setBusy] = useState(false);
  const act = async (action) => {
    setBusy(true);
    try {
      const body = { action, note: note || undefined, ...(action === 'approve' ? { amount: Number(amount) } : {}), ...(action === 'receive' ? { restock } : {}) };
      await api.post(`/admin/returns/${r.id}/action`, body);
      toast(`${r.number}: ${action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : action === 'receive' ? 'received — refund opened for finance' : 'cancelled'}`); onDone();
    } catch (e) { toast(e.message, 'warn'); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title={`${r.number} · order #${r.order_number}`}>
      <p className="small">{r.items.map((i) => `${i.qty} × ${i.name}`).join(', ')}<br /><b>{r.reason_label}</b>{r.details ? ` — “${r.details}”` : ''}</p>
      {r.status === 'requested' ? (
        <>
          <Field label="Refund amount (₹)" id="rd-amt" hint={`Calculated: ${rupees(r.refund_amount)}. You can lower it (e.g. a part refund) but not raise it.`}><input id="rd-amt" type="number" step="0.01" min="1" max={r.refund_amount / 100} value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
          <Field label="Note to the customer (required to reject)" id="rd-note"><textarea id="rd-note" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          <div className="row gap-s wrap"><button className="btn btn--primary" disabled={busy || !(Number(amount) > 0)} onClick={() => act('approve')}>Approve return</button><button className="btn btn--danger" disabled={busy || note.trim().length < 5} onClick={() => act('reject')}>Reject</button></div>
        </>
      ) : (
        <>
          <label className="check"><input type="checkbox" checked={restock} onChange={(e) => setRestock(e.target.checked)} /><span>Item is resaleable — put it back in stock</span></label>
          <p className="small muted">Marking received opens the refund of {rupees(r.refund_amount)} in the Refunds tab for finance.</p>
          <div className="row gap-s wrap"><button className="btn btn--primary" disabled={busy} onClick={() => act('receive')}>Mark received</button><button className="btn btn--ghost" disabled={busy} onClick={() => act('cancel')}>Cancel return</button></div>
        </>
      )}
    </Modal>
  );
}

function RefundList({ admin }) {
  const [status, setStatus] = useState('pending');
  const [d, reload] = useAdminData(`/admin/refunds${status ? `?status=${status}` : ''}`);
  const [open, setOpen] = useState(null);
  return (
    <>
      <div className="kpis">
        {['pending', 'failed', 'processed'].map((k) => <div key={k} className="kpi"><span>{REFUND_STATUS[k].label}</span><b>{rupees(d?.summary?.[k]?.amount || 0)}</b><small>{d?.summary?.[k]?.n || 0} refunds</small></div>)}
      </div>
      <div className="chips">{[['pending', 'To pay'], ['failed', 'Failed'], ['processed', 'Paid'], ['', 'All']].map(([k, l]) => <button key={k} className={`chip ${status === k ? 'is-on' : ''}`} onClick={() => setStatus(k)}>{l}</button>)}</div>
      {!d ? <Spinner /> : d.items.length === 0 ? <Empty icon="💸" title="Nothing here" /> : (
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Table"><table className="table">
          <thead><tr><th>Order</th><th>For</th><th className="num">Amount</th><th>Status</th><th>Reference</th><th /></tr></thead>
          <tbody>{d.items.map((f) => (
            <tr key={f.id}>
              <td><Link className="link" to={`/admin/orders/${f.order_id}`}>#{f.order_number}</Link><div className="small muted">{f.customer_name}</div></td>
              <td>{f.kind === 'cancellation' ? 'Cancelled order' : `Return ${f.return_number}`}<div className="small muted">opened {fmtDate(f.created_at)}</div></td>
              <td className="num"><b>{rupees(f.amount)}</b><div className="small muted">paid {rupees(f.order_total)}</div></td>
              <td><Pill tone={REFUND_STATUS[f.status]?.tone}>{REFUND_STATUS[f.status]?.label}</Pill>{f.failure_reason && <div className="small">{f.failure_reason}</div>}</td>
              <td>{f.reference ? <code>{f.reference}</code> : '—'}{f.processed_at && <div className="small muted">{fmtDateTime(f.processed_at)}</div>}</td>
              <td>{f.status !== 'processed' && canDo(admin, 'refund') && <button className="btn btn--sm btn--primary" onClick={() => setOpen(f)}>Record refund</button>}</td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
      {open && <RefundRecord f={open} onClose={() => setOpen(null)} onDone={() => { setOpen(null); reload(); }} />}
    </>
  );
}

function RefundRecord({ f, onClose, onDone }) {
  const toast = useToast();
  const [x, setX] = useState({ reference: '', method: 'original', reason: '' });
  const [busy, setBusy] = useState(false);
  const act = async (action) => {
    setBusy(true);
    try { await api.post(`/admin/refunds/${f.id}/action`, { action, ...x }); toast(action === 'process' ? 'Refund recorded — customer notified' : 'Marked failed'); onDone(); }
    catch (e) { toast(e.message, 'warn'); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title={`Refund ${rupees(f.amount)} · #${f.order_number}`}>
      <p className="small muted">Send the money first (gateway refund or bank/UPI transfer), then record the reference here. Each reference can be used once.</p>
      <Field label="Refund reference (UTR / gateway refund ID)" id="rf-ref"><input id="rf-ref" maxLength={60} value={x.reference} onChange={(e) => setX({ ...x, reference: e.target.value.trim() })} /></Field>
      <Field label="Paid by" id="rf-m"><select id="rf-m" value={x.method} onChange={(e) => setX({ ...x, method: e.target.value })}><option value="original">Original payment method</option><option value="gateway">Payment gateway refund</option><option value="upi">UPI transfer</option><option value="bank">Bank transfer</option></select></Field>
      <div className="row gap-s wrap"><button className="btn btn--primary" disabled={busy || x.reference.length < 4} onClick={() => act('process')}>Mark refunded</button></div>
      <hr />
      <Field label="If the refund failed — why?" id="rf-why"><input id="rf-why" maxLength={300} value={x.reason} onChange={(e) => setX({ ...x, reason: e.target.value })} /></Field>
      <button className="btn btn--ghost btn--sm" disabled={busy || x.reason.trim().length < 3} onClick={() => act('fail')}>Mark failed (retry later)</button>
    </Modal>
  );
}

// ---------------------------------------------------------------- Dealer settlements
export function Settlements({ admin }) {
  const [d, reload] = useAdminData('/admin/settlements');
  const [dealer, setDealer] = useState(null);
  const [view, setView] = useState(null);
  const may = canDo(admin, 'settle_pay');
  return (
    <>
      <PageHead title="Dealer settlements" sub="What each dealer is owed for delivered orders, less returns and fees. Create a batch, pay it from the bank, then record the UTR. An order is never paid twice." />
      <section className="card">
        <h2>Due now</h2>
        {!d ? <Spinner /> : d.due.length === 0 ? <p className="muted">Nothing is due to any dealer right now.</p> : (
          <div className="table-wrap" tabIndex={0} role="region" aria-label="Table"><table className="table">
            <thead><tr><th>Dealer</th><th className="num">Orders</th><th className="num">Returns</th><th className="num">Net due</th><th>Bank</th><th /></tr></thead>
            <tbody>{d.due.map((x) => (
              <tr key={x.dealer_id}><td>{x.business_name}</td><td className="num">{x.orders}</td><td className="num">{x.returns}</td><td className="num"><b className={x.net <= 0 ? "bad-text" : ""}>{rupees(x.net)}</b></td><td className="small">{x.bank || <Pill tone="warn">No bank on file</Pill>}</td>
                <td><button className="btn btn--sm btn--ghost" onClick={() => setDealer(x.dealer_id)}>{may ? 'Review & create' : 'Review'}</button></td></tr>
            ))}</tbody>
          </table></div>
        )}
      </section>
      <section className="card">
        <h2>Settlement batches</h2>
        {!d ? <Spinner /> : d.items.length === 0 ? <Empty icon="🧾" title="No settlements yet" /> : (
          <div className="table-wrap" tabIndex={0} role="region" aria-label="Table"><table className="table">
            <thead><tr><th>Number</th><th>Dealer</th><th>Created</th><th className="num">Orders</th><th className="num">Sales</th><th className="num">Returns</th><th className="num">Fees</th><th className="num">Net</th><th>Status</th><th /></tr></thead>
            <tbody>{d.items.map((s) => (
              <tr key={s.id}><td><b>{s.number}</b></td><td>{s.business_name}</td><td>{fmtDate(s.created_at)}</td><td className="num">{s.orders}</td><td className="num">{rupees(s.gross)}</td><td className="num">−{rupees(s.returns)}</td><td className="num">−{rupees(s.fees)}</td><td className="num"><b>{rupees(s.net)}</b></td>
                <td><Pill tone={SETTLEMENT_STATUS[s.status]?.tone}>{SETTLEMENT_STATUS[s.status]?.label}</Pill>{s.utr && <div className="small muted">UTR {s.utr}</div>}</td>
                <td><button className="btn btn--sm btn--ghost" onClick={() => setView(s.id)}>Open</button></td></tr>
            ))}</tbody>
          </table></div>
        )}
      </section>
      {dealer && <SettlementCreate dealerId={dealer} may={may} onClose={() => setDealer(null)} onDone={() => { setDealer(null); reload(); }} />}
      {view && <SettlementView id={view} may={may} onClose={() => setView(null)} onDone={() => { setView(null); reload(); }} />}
    </>
  );
}

function SettlementCreate({ dealerId, may, onClose, onDone }) {
  const toast = useToast();
  const [adj, setAdj] = useState([]);
  const [note, setNote] = useState('');
  const q = encodeURIComponent(JSON.stringify(adj.filter((a) => a.label && Number(a.amount)).map((a) => ({ label: a.label, amount: Math.round(Number(a.amount) * 100) }))));
  const [p] = useAdminData(`/admin/settlements/preview?dealer_id=${dealerId}&adjustments=${q}`);
  const [busy, setBusy] = useState(false);
  const create = async () => {
    setBusy(true);
    try { const s = await api.post('/admin/settlements', { dealer_id: dealerId, adjustments: adj.filter((a) => a.label && Number(a.amount)), note, expect_net: p.totals.net / 100 }); toast(`${s.number} created for ${rupees(s.net)}`); onDone(); }
    catch (e) { toast(e.message, 'warn'); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title={p ? `Settlement · ${p.business_name}` : 'Settlement'} wide>
      {!p ? <Spinner /> : (
        <>
          <p className="small muted">Model: <b>{p.model === 'supply' ? 'Supply (dealer price × quantity, no commission)' : 'Commission'}</b> · settle within {p.settlement_days} days of delivery · {p.bank || 'no bank on file'}</p>
          {p.warnings.map((w) => <p key={w} className="notice notice--warn small">{w}</p>)}
          <div className="table-wrap" tabIndex={0} role="region" aria-label="Table"><table className="table">
            <thead><tr><th>Line</th><th className="num">Amount</th></tr></thead>
            <tbody>
              {p.sales.map((s) => <tr key={`s${s.ref}`}><td>📦 {s.order_number} <span className="small muted">delivered {fmtDate(s.delivered_at)}</span>{s.missing_price && <Pill tone="warn">no dealer price</Pill>}</td><td className="num">{rupees(s.value)}</td></tr>)}
              {p.returns.map((r) => <tr key={`r${r.ref}`}><td>↩️ {r.number} ({r.order_number})</td><td className="num">−{rupees(r.value)}</td></tr>)}
            </tbody>
          </table></div>
          <dl className="totals">
            <div><dt>Sales</dt><dd>{rupees(p.totals.gross)}</dd></div>
            <div><dt>Returns</dt><dd>−{rupees(p.totals.returns)}</dd></div>
            {p.totals.fees > 0 && <div><dt>Commission & fees</dt><dd>−{rupees(p.totals.fees)}</dd></div>}
            <div><dt>Adjustments</dt><dd>{rupees(p.totals.adjustments)}</dd></div>
            <div className="totals__grand"><dt>Net to pay</dt><dd className={p.totals.net <= 0 ? "bad-text" : ""}>{rupees(p.totals.net)}</dd></div>
          </dl>
          {may && (
            <>
              <h3>Adjustments (optional)</h3>
              {adj.map((a, i) => (
                <div key={i} className="row gap-s">
                  <input aria-label="Adjustment description" placeholder="e.g. Late dispatch penalty" value={a.label} onChange={(e) => setAdj(adj.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
                  <input aria-label="Adjustment amount in rupees, minus to deduct" type="number" step="0.01" placeholder="₹ (− to deduct)" value={a.amount} onChange={(e) => setAdj(adj.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} />
                  <button className="icon-btn" aria-label="Remove adjustment" onClick={() => setAdj(adj.filter((_, j) => j !== i))}>✕</button>
                </div>
              ))}
              <button className="btn btn--ghost btn--sm" onClick={() => setAdj([...adj, { label: '', amount: '' }])}>+ Add adjustment</button>
              <Field label="Note (optional)" id="st-note"><input id="st-note" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
              <button className="btn btn--primary" disabled={busy || p.totals.net <= 0} onClick={create}>Create settlement for {rupees(Math.max(0, p.totals.net))}</button>
              {p.totals.net <= 0 && <p className="small muted">Net is zero or less — nothing to pay. Returns carry over to the next settlement.</p>}
            </>
          )}
        </>
      )}
    </Modal>
  );
}

function SettlementView({ id, may, onClose, onDone }) {
  const toast = useToast();
  const [s] = useAdminData(`/admin/settlements/${id}`);
  const [utr, setUtr] = useState('');
  const [busy, setBusy] = useState(false);
  const act = async (action) => {
    setBusy(true);
    try { await api.post(`/admin/settlements/${id}/action`, { action, utr: utr || undefined }); toast(action === 'pay' ? 'Marked paid — dealer notified' : 'Settlement cancelled'); onDone(); }
    catch (e) { toast(e.message, 'warn'); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title={s ? `${s.number} · ${s.business_name}` : 'Settlement'} wide>
      {!s ? <Spinner /> : (
        <>
          <p><Pill tone={SETTLEMENT_STATUS[s.status]?.tone}>{SETTLEMENT_STATUS[s.status]?.label}</Pill> {s.utr && <span className="small">UTR <code>{s.utr}</code> · {fmtDate(s.paid_on)}</span>}</p>
          <div className="table-wrap" tabIndex={0} role="region" aria-label="Table"><table className="table"><tbody>{s.items.map((x, i) => <tr key={i}><td>{x.kind === 'sale' ? '📦' : '↩️'} {x.label}</td><td className="num">{x.amount < 0 ? `−${rupees(-x.amount)}` : rupees(x.amount)}</td></tr>)}
            {s.adjustments.map((a, i) => <tr key={`a${i}`}><td>⚖️ {a.label}</td><td className="num">{a.amount < 0 ? `−${rupees(-a.amount)}` : rupees(a.amount)}</td></tr>)}</tbody></table></div>
          <dl className="totals"><div><dt>Sales</dt><dd>{rupees(s.gross)}</dd></div><div><dt>Returns</dt><dd>−{rupees(s.returns)}</dd></div>{s.fees > 0 && <div><dt>Fees</dt><dd>−{rupees(s.fees)}</dd></div>}<div><dt>Adjustments</dt><dd>{rupees(s.adjustments_total)}</dd></div><div className="totals__grand"><dt>Net</dt><dd>{rupees(s.net)}</dd></div></dl>
          {may && s.status === 'processing' && (
            <>
              <Field label="Bank UTR / reference" id="sv-utr" hint="After the bank transfer is done"><input id="sv-utr" maxLength={30} value={utr} onChange={(e) => setUtr(e.target.value.trim())} /></Field>
              <div className="row gap-s wrap"><button className="btn btn--primary" disabled={busy || utr.length < 6} onClick={() => act('pay')}>Mark paid</button><button className="btn btn--ghost" disabled={busy} onClick={() => act('cancel')}>Cancel batch</button></div>
            </>
          )}
        </>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------- Admin users & roles
export function AdminUsers({ admin }) {
  const [d, reload] = useAdminData('/admin/admins');
  const toast = useToast();
  const [f, setF] = useState({ name: '', email: '', role: 'support' });
  const [pw, setPw] = useState(null);
  const [fe, setFe] = useState({});
  const add = async (e) => {
    e.preventDefault();
    try { const r = await api.post('/admin/admins', f); setPw({ email: r.admin.email, password: r.temporary_password }); setF({ name: '', email: '', role: 'support' }); setFe({}); reload(); }
    catch (x) { setFe(x.fields || {}); toast(x.message, 'warn'); }
  };
  const update = async (a, body) => { try { await api.put(`/admin/admins/${a.id}`, body); toast('Saved'); reload(); } catch (x) { toast(x.message, 'warn'); } };
  const reset = async (a) => { try { const r = await api.post(`/admin/admins/${a.id}/reset-password`); setPw({ email: a.email, password: r.temporary_password }); } catch (x) { toast(x.message, 'warn'); } };
  const mark = (v) => (v === 'edit' ? '✅' : v === 'view' ? '👁' : '—');
  return (
    <>
      <PageHead title="Admin users & roles" sub="Give each person only the access they need. Every change is recorded in the audit log; a role change signs that person out." />
      <section className="card">
        <h2>Team</h2>
        {!d ? <Spinner /> : (
          <div className="table-wrap" tabIndex={0} role="region" aria-label="Table"><table className="table">
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Two-step</th><th>Last sign-in</th><th>Status</th><th /></tr></thead>
            <tbody>{d.items.map((a) => (
              <tr key={a.id}>
                <td>{a.name}{a.id === admin.id && <Pill tone="info">you</Pill>}</td><td>{a.email}</td>
                <td><select aria-label={`Role for ${a.name}`} value={a.role} disabled={a.id === admin.id} onChange={(e) => update(a, { role: e.target.value })}>{Object.entries(ADMIN_ROLES).map(([k, r]) => <option key={k} value={k}>{r.label}</option>)}</select></td>
                <td>{a.totp_enabled ? '✅' : '—'}</td><td className="small">{a.last_login_at ? fmtDateTime(a.last_login_at) : 'never'}{a.must_change_password ? <div><Pill tone="warn">must set password</Pill></div> : null}</td>
                <td>{a.is_active ? <Pill tone="ok">Active</Pill> : <Pill tone="muted">Disabled</Pill>}</td>
                <td className="row gap-s">{a.id !== admin.id && <><button className="btn btn--sm btn--ghost" onClick={() => update(a, { is_active: !a.is_active })}>{a.is_active ? 'Disable' : 'Enable'}</button><button className="btn btn--sm btn--ghost" onClick={() => reset(a)}>Reset password</button></>}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </section>
      <form className="card form" onSubmit={add} noValidate>
        <h2>Add an admin</h2>
        <div className="form__grid">
          <Field label="Full name" id="na-name" error={fe.name}><input id="na-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Work email" id="na-email" error={fe.email}><input id="na-email" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
          <Field label="Role" id="na-role" hint={ADMIN_ROLES[f.role]?.desc}><select id="na-role" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>{Object.entries(ADMIN_ROLES).map(([k, r]) => <option key={k} value={k}>{r.label}</option>)}</select></Field>
        </div>
        <button className="btn btn--primary">Add admin</button>
        <p className="small muted">They get a one-time password (shown once) and must set their own at first sign-in.</p>
      </form>
      <section className="card">
        <h2>Permission matrix</h2>
        <p className="small muted">✅ can change · 👁 can view only · — no access. Money and legal actions have extra checks: {Object.entries(ACTIONS).map(([k, v]) => `${k.replace(/_/g, ' ')} (${v.map((r) => ADMIN_ROLES[r].short).join(', ')})`).join(' · ')}.</p>
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Table"><table className="table table--matrix">
          <thead><tr><th>Area</th>{Object.values(ADMIN_ROLES).map((r) => <th key={r.short}>{r.short}</th>)}</tr></thead>
          <tbody>{Object.entries(AREAS).map(([k, a]) => <tr key={k}><td>{a.label}</td>{Object.keys(ADMIN_ROLES).map((r) => <td key={r} className="center">{r === 'owner' ? '✅' : mark(PERMISSIONS[r]?.[k])}</td>)}</tr>)}</tbody>
        </table></div>
      </section>
      {pw && (
        <Modal open onClose={() => setPw(null)} title="One-time password">
          <p>Give this password to <b>{pw.email}</b> privately (not by email). It works once; they must set their own after signing in.</p>
          <p className="center"><code className="utr" style={{ fontSize: '1.2rem' }}>{pw.password}</code></p>
          <button className="btn btn--primary" onClick={() => { navigator.clipboard?.writeText(pw.password); toast('Copied'); }}>Copy</button>
        </Modal>
      )}
    </>
  );
}
