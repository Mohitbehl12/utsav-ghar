/**
 * Admin → Dealers: dealer order board, dealer accounts (areas & categories they serve),
 * routing settings, and the dealer panel shown inside an order.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { DEALER_STATUS } from '@shared/dealers.js';
import { api } from '../lib/api.js';
import { fmtDateTime, rupees } from '../lib/format.js';
import { Field, Pill, Spinner, Empty, Modal } from '../components/ui.jsx';
import { useToast, useStore } from '../state/store.jsx';
import { PageHead, useAdminData } from './pages.jsx';

const BOARD = [['open', 'In progress'], ['late', '⏰ Late to accept'], ['sent', 'New'], ['accepted', 'Accepted'], ['packed', 'Packed'], ['ready', 'Ready'], ['out_for_delivery', 'Out for delivery'], ['delivered', 'Delivered'], ['rejected', 'Rejected']];

function Board() {
  const [st, setSt] = useState('open');
  const [d, reload] = useAdminData(`/admin/dealer-orders?status=${st}`);
  const toast = useToast();
  const auto = async (orderId) => { try { await api.post(`/admin/orders/${orderId}/dealer`, { dealer_id: null }); toast('Sent to the best dealer'); reload(); } catch (x) { toast(x.message, 'warn'); } };
  if (!d) return <Spinner />;
  return (
    <>
      {d.unassigned.length > 0 && (
        <div className="notice notice--warn">
          <b>{d.unassigned.length} paid order{d.unassigned.length > 1 ? 's' : ''} without a dealer.</b> No dealer sells all the items and delivers to that PIN, or auto-routing is off.
          <ul className="dlr-unassigned">{d.unassigned.map((o) => (
            <li key={o.order_id}><Link className="link" to={`/admin/orders/${o.order_id}`}>#{o.order_number}</Link> · {o.customer} · {o.city} {o.pincode} · {rupees(o.total)} <button className="btn btn--sm" onClick={() => auto(o.order_id)}>Find dealer</button></li>
          ))}</ul>
        </div>
      )}
      <div className="tabs" role="tablist">{BOARD.map(([k, l]) => <button key={k} role="tab" aria-selected={st === k} className={st === k ? 'is-on' : ''} onClick={() => setSt(k)}>{l}</button>)}</div>
      {!d.items.length ? <Empty icon="📦" title="Nothing here" /> : (
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Table">
          <table className="table">
            <thead><tr><th>Order</th><th>Dealer</th><th>Status</th><th>Customer area</th><th className="num">Value</th><th>Sent</th></tr></thead>
            <tbody>{d.items.map((r) => (
              <tr key={r.id}>
                <td><Link className="link" to={`/admin/orders/${r.order_id}`}>#{r.order_number}</Link></td>
                <td>{r.dealer}</td>
                <td><Pill tone={DEALER_STATUS[r.status]?.tone}>{DEALER_STATUS[r.status]?.icon} {r.label}</Pill>{r.late && <div><Pill tone="bad">⏰ late ({d.accept_minutes}+ min)</Pill></div>}{r.reject_reason && <div className="small muted">{r.reject_reason}</div>}</td>
                <td>{r.customer}<div className="small muted">{r.city} {r.pincode}</div></td>
                <td className="num">{rupees(r.total)}</td>
                <td className="small">{fmtDateTime(r.sent_at)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </>
  );
}

const EMPTY = { name: '', business_name: '', phone: '', email: '', address: '', city: '', state: '', pincode: '', gstin: '', pincodes: '', all_india: false, category_ids: [], product_ids: [], priority: 0, is_active: true };

function DealerForm({ dealer, onClose, onSaved }) {
  const { categories } = useStore();
  const [f, setF] = useState(dealer ? { ...EMPTY, ...dealer, email: dealer.email || '', gstin: dealer.gstin || '', pincodes: (dealer.pincodes || []).join(', ') } : EMPTY);
  const [fe, setFe] = useState({});
  const [busy, setBusy] = useState(false);
  const [pw, setPw] = useState(null);
  const toast = useToast();
  const upd = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const toggleCat = (id) => setF({ ...f, category_ids: f.category_ids.includes(id) ? f.category_ids.filter((x) => x !== id) : [...f.category_ids, id] });
  const save = async (e) => {
    e.preventDefault(); setBusy(true); setFe({});
    try {
      const body = { ...f, priority: Number(f.priority) || 0 };
      const r = dealer ? await api.put(`/admin/dealers/${dealer.id}`, body) : await api.post('/admin/dealers', body);
      onSaved();
      if (r.temp_password) setPw(r.temp_password); else { toast('Dealer saved'); onClose(); }
    } catch (x) { setFe(x.fields || {}); toast(x.message, 'warn'); } finally { setBusy(false); }
  };
  const reset = async () => {
    try { setPw((await api.post(`/admin/dealers/${dealer.id}/password`)).temp_password); } catch (x) { toast(x.message, 'warn'); }
  };
  if (pw) {
    const msg = `Namaste ${f.name}! Your Utsav Ghar dealer app is ready.\nOpen: ${/^https?:/.test(location.origin) ? location.origin : 'https://utsavghar.in'}/dealer\nMobile: ${String(f.phone).replace(/\D/g, '').slice(-10)}\nOne-time password: ${pw}\nYou will set your own password after signing in.`;
    return (
      <div className="dlr-pw">
        <p>✅ Share these sign-in details with <b>{f.business_name}</b>. The password is shown only once.</p>
        <pre className="dlr-pw__box">{msg}</pre>
        <div className="row gap-s wrap">
          <button className="btn" onClick={() => navigator.clipboard?.writeText(msg).then(() => toast('Copied'))}>Copy</button>
          <a className="btn" href={`https://wa.me/91${String(f.phone).replace(/\D/g, '').slice(-10)}?text=${encodeURIComponent(msg)}`} target="_blank" rel="noreferrer">Send on WhatsApp</a>
          <button className="btn btn--primary" onClick={onClose}>Done</button>
        </div>
      </div>
    );
  }
  return (
    <form className="dlr-form" onSubmit={save}>
      <div className="grid-2">
        <Field label="Shop / business name" id="d-bn" error={fe.business_name}><input id="d-bn" value={f.business_name} onChange={upd('business_name')} required /></Field>
        <Field label="Contact person" id="d-n" error={fe.name}><input id="d-n" value={f.name} onChange={upd('name')} required /></Field>
        <Field label="Mobile (used to sign in)" id="d-p" error={fe.phone}><input id="d-p" inputMode="numeric" value={f.phone} onChange={upd('phone')} required /></Field>
        <Field label="Email (optional)" id="d-e" error={fe.email}><input id="d-e" type="email" value={f.email} onChange={upd('email')} /></Field>
        <Field label="Shop address" id="d-a"><input id="d-a" value={f.address} onChange={upd('address')} /></Field>
        <Field label="City" id="d-c"><input id="d-c" value={f.city} onChange={upd('city')} /></Field>
        <Field label="State" id="d-s"><input id="d-s" value={f.state} onChange={upd('state')} /></Field>
        <Field label="Shop PIN code" id="d-pin" error={fe.pincode} hint="Used to find the nearest dealer"><input id="d-pin" inputMode="numeric" maxLength={6} value={f.pincode} onChange={upd('pincode')} /></Field>
        <Field label="GSTIN (optional)" id="d-g" error={fe.gstin}><input id="d-g" value={f.gstin} onChange={upd('gstin')} /></Field>
        <Field label="Priority (0–10)" id="d-pr" hint="Higher gets orders first when two dealers fit"><input id="d-pr" type="number" min={0} max={10} value={f.priority} onChange={upd('priority')} /></Field>
      </div>
      <Field label="Delivers to these PIN codes" id="d-pins" error={fe.pincodes} hint='Exact "110017", start "1100" (all 1100xx), or range "400001-400099". Comma or new line between.'>
        <textarea id="d-pins" rows={3} value={f.pincodes} onChange={upd('pincodes')} disabled={f.all_india} />
      </Field>
      <label className="check"><input type="checkbox" checked={f.all_india} onChange={upd('all_india')} /> Ships anywhere in India (by courier)</label>
      <fieldset className="pickset">
        <legend>Sells these categories {fe.category_ids && <span className="field__error">Choose at least one</span>}</legend>
        <div className="pickset__grid">{(categories || []).map((c) => <label key={c.id} className="check"><input type="checkbox" checked={f.category_ids.includes(c.id)} onChange={() => toggleCat(c.id)} /> {c.icon} {c.name}</label>)}</div>
      </fieldset>
      <label className="check"><input type="checkbox" checked={f.is_active} onChange={upd('is_active')} /> Active (receives orders)</label>
      <div className="row between wrap gap-s">
        {dealer ? <button type="button" className="btn btn--ghost" onClick={reset}>Reset password</button> : <span />}
        <div className="row gap-s"><button type="button" className="btn btn--ghost" onClick={onClose}>Cancel</button><button className="btn btn--primary" disabled={busy}>{dealer ? 'Save' : 'Add dealer'}</button></div>
      </div>
    </form>
  );
}

function DealerList() {
  const [d, reload] = useAdminData('/admin/dealers');
  const [edit, setEdit] = useState(null);
  const { categories } = useStore();
  const catName = (id) => categories?.find((c) => c.id === id)?.name;
  if (!d) return <Spinner />;
  return (
    <>
      <div className="row between wrap gap-s"><p className="muted">Orders go to one dealer who sells every item in the order and delivers to the customer's PIN code (nearest & highest priority first).</p><button className="btn btn--primary" onClick={() => setEdit({})}>+ Add dealer</button></div>
      {!d.dealers.length ? <Empty icon="🏪" title="No dealers yet">Add your first dealer to start sending orders automatically.</Empty> : (
        <div className="dlr-grid">
          {d.dealers.map((x) => (
            <article key={x.id} className={`card dlr-card ${x.is_active ? '' : 'is-off'}`}>
              <div className="row between"><h3>{x.business_name}</h3>{x.is_active ? <Pill tone="ok">Active</Pill> : <Pill>Off</Pill>}</div>
              <p className="small">{x.name} · {x.phone}{x.city ? ` · ${x.city}` : ''}</p>
              <p className="small muted">📍 {x.all_india ? 'All India' : (x.pincodes.slice(0, 6).join(', ') || 'no PIN codes yet')}{x.pincodes.length > 6 ? ` +${x.pincodes.length - 6}` : ''}</p>
              <p className="small muted">🛍️ {x.category_ids.map(catName).filter(Boolean).slice(0, 4).join(', ')}{x.category_ids.length > 4 ? ` +${x.category_ids.length - 4}` : ''}</p>
              <div className="dlr-stats">
                <span><b>{x.stats.open}</b> open</span>
                <span className={x.stats.waiting ? 'warn' : ''}><b>{x.stats.waiting}</b> waiting</span>
                <span><b>{x.stats.delivered_30d}</b> delivered (30d)</span>
                <span><b>{x.stats.avg_accept_min ?? '–'}</b> min to accept</span>
                <span><b>{x.stats.declined_30d}</b> declined</span>
              </div>
              <p className="small muted">{x.last_login_at ? `Last signed in ${fmtDateTime(x.last_login_at)}` : 'Not signed in yet'}{x.must_change_password ? ' · one-time password not changed' : ''}</p>
              <button className="btn btn--sm" onClick={() => setEdit(x)}>Edit</button>
            </article>
          ))}
        </div>
      )}
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? `Edit ${edit.business_name}` : 'Add dealer'} wide>
        {edit && <DealerForm dealer={edit.id ? edit : null} onClose={() => setEdit(null)} onSaved={reload} />}
      </Modal>
    </>
  );
}

function RoutingSettings() {
  const [d, reload] = useAdminData('/admin/dealers');
  const [f, setF] = useState(null);
  const toast = useToast();
  if (!d) return <Spinner />;
  const s = f || d.settings;
  const save = async () => { try { await api.put('/admin/dealers-settings', s); toast('Saved'); setF(null); reload(); } catch (x) { toast(x.message, 'warn'); } };
  return (
    <div className="card dlr-settings">
      <label className="check"><input type="checkbox" checked={s.auto_assign} onChange={(e) => setF({ ...s, auto_assign: e.target.checked })} /> Send paid orders to a dealer automatically</label>
      <label className="check"><input type="checkbox" checked={s.auto_reassign} onChange={(e) => setF({ ...s, auto_reassign: e.target.checked })} /> If a dealer rejects or does not accept in time, move the order to the next dealer</label>
      <Field label="Time a dealer has to accept (minutes)" id="d-am" hint="A reminder goes at half this time"><input id="d-am" type="number" min={10} max={1440} value={s.accept_minutes} onChange={(e) => setF({ ...s, accept_minutes: Number(e.target.value) })} /></Field>
      <button className="btn btn--primary" disabled={!f} onClick={save}>Save</button>
      <p className="small muted">Dealer app link to share: <code>{/^https?:/.test(location.origin) ? location.origin : 'https://your-store.in'}/dealer</code>. Dealers see products, quantity and area first; customer phone & address appear only after they accept. They never see payment details or the customer's email.</p>
    </div>
  );
}

export function Dealers() {
  const [tab, setTab] = useState('board');
  return (
    <>
      <PageHead title="🏪 Dealers" sub="Orders flow from the website to your dealers — they accept, pack and deliver; you see every step." />
      <div className="tabs" role="tablist">
        {[['board', '📦 Dealer orders'], ['list', '🏪 Dealers'], ['settings', '⚙️ Routing']].map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'is-on' : ''} onClick={() => setTab(k)}>{l}</button>)}
      </div>
      {tab === 'board' && <Board />}
      {tab === 'list' && <DealerList />}
      {tab === 'settings' && <RoutingSettings />}
    </>
  );
}

/** Inside an order: who has it, progress, move it to another dealer. */
export function DealerPanel({ order, onChange }) {
  const [pick, setPick] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const d = order.dealer;
  if (!d) return null;
  const assign = async (dealerId) => {
    setBusy(true);
    try { onChange(await api.post(`/admin/orders/${order.id}/dealer`, { dealer_id: dealerId || null })); toast('Sent to dealer'); setPick(''); } catch (x) { toast(x.message, 'warn'); } finally { setBusy(false); }
  };
  const canAssign = order.payment_status === 'confirmed' && !['cancelled', 'delivered'].includes(order.status);
  const c = d.current;
  return (
    <section className="dlr-panel">
      <h3>🏪 Dealer</h3>
      {c ? (
        <div>
          <p><b>{c.business_name}</b>{c.city ? ` · ${c.city}` : ''} · <a className="link" href={`tel:${c.phone}`}>{c.phone}</a></p>
          <p><Pill tone={DEALER_STATUS[c.status]?.tone}>{DEALER_STATUS[c.status]?.icon} {c.label}</Pill> {c.late && <Pill tone="bad">⏰ not accepted yet</Pill>}</p>
          <p className="small muted">Sent {fmtDateTime(c.sent_at)}{c.accepted_at ? ` · accepted ${fmtDateTime(c.accepted_at)}` : ''}{c.packed_at ? ` · packed ${fmtDateTime(c.packed_at)}` : ''}{c.out_at ? ` · out ${fmtDateTime(c.out_at)}` : ''}{c.delivered_at ? ` · delivered ${fmtDateTime(c.delivered_at)}` : ''}</p>
          {c.delivery && <p className="small">{c.delivery.mode === 'self' ? `🛵 ${c.delivery.rider_name} (${c.delivery.rider_phone}) — customer confirms with a code` : `📮 ${c.delivery.courier_name} · AWB ${c.delivery.awb}`}</p>}
        </div>
      ) : <p className="muted small">{order.payment_status === 'confirmed' ? 'Not with any dealer yet.' : 'Sent to a dealer automatically once payment is confirmed.'}</p>}
      {canAssign && (
        <div className="row gap-s wrap">
          <select value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Choose dealer">
            <option value="">{c ? 'Move to another dealer…' : 'Choose a dealer…'}</option>
            {d.candidates.filter((x) => x.is_active && x.id !== c?.dealer_id).map((x) => <option key={x.id} value={x.id}>{x.ok ? '✓' : '⚠️'} {x.business_name}{x.city ? ` (${x.city})` : ''}{x.reasons.length ? ` — ${x.reasons.join(', ')}` : ''}{x.tried ? ' · tried' : ''}</option>)}
          </select>
          <button className="btn btn--sm" disabled={busy || !pick} onClick={() => assign(Number(pick))}>Send</button>
          {!c && <button className="btn btn--sm btn--ghost" disabled={busy} onClick={() => assign(null)}>Auto-pick best</button>}
        </div>
      )}
      {d.history.length > 1 && (
        <details className="small"><summary>History ({d.history.length})</summary>
          <ul className="events">{d.history.map((h) => <li key={h.id}><b>{h.business_name}</b> — {h.label}{h.reject_reason ? ` (${h.reject_reason})` : ''} <span className="muted">{fmtDateTime(h.sent_at)}</span></li>)}</ul>
        </details>
      )}
    </section>
  );
}
