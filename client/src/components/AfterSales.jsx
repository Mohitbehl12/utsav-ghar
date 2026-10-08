/**
 * Order page: cancel (free until packed), return request (after delivery) and the
 * status of returns and refunds. Works for signed-in customers and guests (order token).
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { rupees, fmtDate, fmtDateTime } from '../lib/format.js';
import { Field, Pill } from './ui.jsx';
import { RETURN_REASONS, RETURN_STATUS, REFUND_STATUS } from '@shared/returns.js';

const CANCEL_REASONS = ['Ordered by mistake', 'Found a better price', 'Delivery date is too late', 'Want to change items or address', 'Other'];

export default function AfterSales({ order, token, onChange }) {
  const a = order.after_sales;
  const [mode, setMode] = useState(null); // 'cancel' | 'return'
  const [msg, setMsg] = useState('');
  if (!a) return null;
  const hdr = { headers: { 'X-Order-Token': token || '' } };
  const done = (o, text) => { onChange(o); setMode(null); setMsg(text); };
  const hasHistory = a.returns.length > 0 || a.refunds.length > 0;
  const R = a.returnable;
  const anyLeft = R?.items?.some((i) => i.left > 0);
  if (!a.can_cancel && !R && !hasHistory && order.status !== 'cancelled') return null;
  return (
    <section className="card aftersales" id="returns">
      <h2>Cancel, return &amp; refund</h2>
      {msg && <p className="notice notice--ok" role="status">{msg}</p>}
      {a.can_cancel && mode !== 'cancel' && (
        <div className="row between wrap gap-s"><p className="small muted">{a.cancel_note}</p><button className="btn btn--ghost btn--sm" onClick={() => { setMode('cancel'); setMsg(''); }}>Cancel order</button></div>
      )}
      {!a.can_cancel && order.status !== 'cancelled' && order.status !== 'delivered' && <p className="small muted">{a.cancel_note}</p>}
      {mode === 'cancel' && <CancelForm order={order} hdr={hdr} onDone={(o) => done(o, o.payment_status === 'confirmed' ? 'Order cancelled. Your full refund has been started — it reaches your original payment method in 5–7 working days.' : 'Order cancelled.')} onClose={() => setMode(null)} />}

      {R && (
        <div className="aftersales__ret">
          {R.can_return || R.can_report_damage ? (
            <p className="small">Return window: until <b>{fmtDate(R.window_ends, { day: 'numeric', month: 'short' })}</b> ({R.window_days} days from delivery). Damaged, wrong or missing items: tell us within {R.damage_hours} hours with photos.</p>
          ) : <p className="small muted">The return window for this order has ended ({R.window_days} days from delivery). For help, <Link className="link" to={`/help?raise=1&topic=return&order=${order.order_number}`}>contact us</Link>.</p>}
          {(R.can_return || R.can_report_damage) && anyLeft && mode !== 'return' && order.payment_status === 'confirmed' && <button className="btn btn--primary btn--sm" onClick={() => { setMode('return'); setMsg(''); }}>Request a return</button>}
          {mode === 'return' && <ReturnForm order={order} R={R} hdr={hdr} token={token} onDone={(o, rr) => done(o, `Return request ${rr.number} sent. We will reply within 1 working day.`)} onClose={() => setMode(null)} />}
        </div>
      )}

      {a.returns.length > 0 && (
        <div className="aftersales__list">
          <h3>Your returns</h3>
          <ul className="ret-list">
            {a.returns.map((r) => (
              <li key={r.number}>
                <div className="row between wrap gap-s"><b>{r.number}</b><Pill tone={RETURN_STATUS[r.status]?.tone}>{RETURN_STATUS[r.status]?.label || r.status}</Pill></div>
                <p className="small">{r.items.map((i) => `${i.qty} × ${i.name}`).join(', ')} · {r.reason_label}</p>
                <p className="small muted">{RETURN_STATUS[r.status]?.help} Refund: <b>{rupees(r.refund_amount)}</b>{r.includes_delivery ? ' (incl. delivery charge)' : ''}</p>
                {r.status === 'rejected' && r.admin_note && <p className="small">Reason: {r.admin_note}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {a.refunds.length > 0 && (
        <div className="aftersales__list">
          <h3>Refunds</h3>
          <ul className="ret-list">
            {a.refunds.map((f) => (
              <li key={f.id} className="row between wrap gap-s">
                <span>{f.kind === 'cancellation' ? 'Cancelled order' : 'Return'} · <b>{rupees(f.amount)}</b>{f.reference ? <span className="small muted"> · ref {f.reference} · {fmtDateTime(f.processed_at)}</span> : null}</span>
                <Pill tone={REFUND_STATUS[f.status]?.tone}>{REFUND_STATUS[f.status]?.label}</Pill>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function CancelForm({ order, hdr, onDone, onClose }) {
  const [reason, setReason] = useState('');
  const [other, setOther] = useState('');
  const [st, setSt] = useState({});
  const go = async () => {
    setSt({ busy: true });
    try { onDone(await api.post(`/orders/${order.order_number}/cancel`, { reason: reason === 'Other' ? other : reason }, hdr)); }
    catch (e) { setSt({ err: e.fields?.reason || e.message }); }
  };
  const text = reason === 'Other' ? other.trim() : reason;
  return (
    <div className="subcard">
      <h3>Cancel this order?</h3>
      <p className="small">{order.payment_status === 'confirmed' ? `You paid ${rupees(order.totals.total)}. The full amount is refunded to your original payment method within 5–7 working days.` : 'Nothing has been charged, so there is nothing to refund.'}</p>
      <Field label="Why are you cancelling?" id="cx-reason"><select id="cx-reason" value={reason} onChange={(e) => setReason(e.target.value)}><option value="">Choose…</option>{CANCEL_REASONS.map((r) => <option key={r}>{r}</option>)}</select></Field>
      {reason === 'Other' && <Field label="Tell us more" id="cx-other"><input id="cx-other" maxLength={300} value={other} onChange={(e) => setOther(e.target.value)} /></Field>}
      {st.err && <p className="field__error" role="alert">{st.err}</p>}
      <div className="row gap-s"><button className="btn btn--danger btn--sm" disabled={st.busy || text.length < 3} onClick={go}>{st.busy ? 'Cancelling…' : 'Yes, cancel order'}</button><button className="btn btn--ghost btn--sm" onClick={onClose}>Keep my order</button></div>
    </div>
  );
}

function ReturnForm({ order, R, hdr, token, onDone, onClose }) {
  const [qty, setQty] = useState({});
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [photo, setPhoto] = useState(null);
  const [st, setSt] = useState({});
  const reasons = Object.entries(RETURN_REASONS).filter(([, v]) => (R.can_return ? true : v.damage));
  const items = Object.entries(qty).filter(([, q]) => q > 0).map(([id, q]) => ({ order_item_id: Number(id), qty: q }));
  const needPhoto = RETURN_REASONS[reason]?.photo;
  const go = async () => {
    setSt({ busy: true });
    try {
      const fd = new FormData();
      fd.append('reason', reason); fd.append('details', details); fd.append('items', JSON.stringify(items));
      if (token) fd.append('token', token);
      if (photo) fd.append('photo', photo);
      const r = await api.post(`/orders/${order.order_number}/returns`, fd, hdr);
      onDone(r.order, r.return);
    } catch (e) { setSt({ err: e.message, fields: e.fields }); }
  };
  return (
    <div className="subcard">
      <h3>Request a return</h3>
      <p className="small muted">Choose the items and how many. Items must be unused and in original packing unless damaged or wrong.</p>
      <ul className="ret-pick">
        {R.items.map((i) => (
          <li key={i.order_item_id} className="row between gap-s">
            <span>{i.name} <span className="muted small">({i.left} of {i.qty} can be returned)</span></span>
            <select aria-label={`Quantity to return of ${i.name}`} value={qty[i.order_item_id] || 0} disabled={!i.left} onChange={(e) => setQty({ ...qty, [i.order_item_id]: Number(e.target.value) })}>
              {Array.from({ length: i.left + 1 }, (_, n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </li>
        ))}
      </ul>
      <Field label="Reason" id="rt-reason" error={st.fields?.reason}><select id="rt-reason" value={reason} onChange={(e) => setReason(e.target.value)}><option value="">Choose…</option>{reasons.map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></Field>
      <Field label="What happened? (optional)" id="rt-details"><textarea id="rt-details" rows={3} maxLength={1000} value={details} onChange={(e) => setDetails(e.target.value)} /></Field>
      <Field label={needPhoto ? 'Photo of the item and box *' : 'Photo (optional)'} id="rt-photo" error={st.fields?.photo} hint="JPG or PNG, up to 5 MB"><input id="rt-photo" type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setPhoto(e.target.files?.[0] || null)} /></Field>
      {st.err && <p className="field__error" role="alert">{st.err}</p>}
      <div className="row gap-s"><button className="btn btn--primary btn--sm" disabled={st.busy || !items.length || !reason || (needPhoto && !photo)} onClick={go}>{st.busy ? 'Sending…' : 'Send return request'}</button><button className="btn btn--ghost btn--sm" onClick={onClose}>Close</button></div>
    </div>
  );
}
