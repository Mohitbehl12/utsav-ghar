/**
 * Admin → Delivery tracking: every order's journey through the dealer and the courier.
 * Filters → KPI tiles → stage pipeline & stage times → shipments table (click for the full
 * journey) → courier and dealer performance. Auto-refreshes every minute.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { DEALER_STATUS, DEALER_FLOW, COURIER_UPDATES, fmtDuration } from '@shared/dealers.js';
import { api } from '../lib/api.js';
import { fmtDateTime, rupees, STATUS_LABEL } from '../lib/format.js';
import { Pill, Spinner, Empty, Modal } from '../components/ui.jsx';
import { useToast } from '../state/store.jsx';
import { PageHead } from './pages.jsx';

const RANGES = [['today', 'Today'], ['7d', '7 days'], ['30d', '30 days'], ['90d', '90 days'], ['all', 'All']];
const ago = (iso) => {
  if (!iso) return '';
  const m = Math.round((Date.now() - Date.parse(iso)) / 6e4);
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};
const qs = (o) => new URLSearchParams(Object.entries(o).filter(([, v]) => v !== '' && v != null)).toString();

function MiniSteps({ status }) {
  const i = DEALER_FLOW.indexOf(status);
  return (
    <span className="trk-mini" aria-label={`Step ${i + 1} of ${DEALER_FLOW.length}: ${DEALER_STATUS[status]?.label}`}>
      {DEALER_FLOW.map((k, n) => <i key={k} className={n < i ? 'done' : n === i ? 'now' : ''} title={DEALER_STATUS[k].label} />)}
    </span>
  );
}

/** Horizontal bars, one hue (magnitude); value labels in text ink; hover shows the exact value. */
function Bars({ rows, value, label, fmt = (v) => v, onPick, active }) {
  const max = Math.max(1, ...rows.map(value).filter((v) => v != null));
  return (
    <ul className="trk-bars">
      {rows.map((r) => {
        const v = value(r);
        const Tag = onPick ? 'button' : 'div';
        return (
          <li key={label(r)}>
            <Tag type={onPick ? 'button' : undefined} className={`trk-bars__row ${active === r.status ? 'is-on' : ''}`} onClick={onPick ? () => onPick(r) : undefined} title={`${label(r)}: ${fmt(v)}`}>
              <span className="trk-bars__label">{label(r)}</span>
              <span className="trk-bars__track"><span className="trk-bars__fill" style={{ width: v ? `${Math.max(2, (100 * v) / max)}%` : 0 }} /></span>
              <b className="trk-bars__val">{fmt(v)}</b>
            </Tag>
          </li>
        );
      })}
    </ul>
  );
}

function DeliveryCell({ x }) {
  if (x.mode === 'courier') {
    return (
      <div>
        <b>📮 {x.courier_name}</b>
        <div className="small">AWB {x.tracking_url ? <a className="link" href={x.tracking_url} target="_blank" rel="noreferrer">{x.awb} ↗</a> : x.awb}</div>
      </div>
    );
  }
  if (x.mode === 'self') return <div><b>🛵 {x.rider_name}</b><div className="small"><a className="link" href={`tel:+91${x.rider_phone}`}>{x.rider_phone}</a></div></div>;
  return <span className="muted small">Not handed over yet</span>;
}

function Detail({ id, onClose, onChanged }) {
  const [d, setD] = useState(null);
  const [f, setF] = useState({ status: 'in_transit', location: '', note: '', received_by: '' });
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const load = () => api.get(`/admin/tracking/${id}`).then(setD).catch((x) => toast(x.message, 'warn'));
  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!d) return <Spinner />;
  const steps = [
    ['ordered_at', 'Order placed'], ['paid_at', 'Payment confirmed'], ['sent_at', 'Sent to dealer'], ['accepted_at', 'Accepted by dealer'], ['packed_at', 'Packed'],
    ['ready_at', 'Ready for delivery'], ['out_at', d.mode === 'courier' ? 'Handed to courier' : 'Out for delivery'], ...(d.mode === 'courier' ? [['courier_out_at', 'Courier out for delivery']] : []), ['delivered_at', 'Delivered'],
  ];
  let prev = null;
  const add = async (e) => {
    e.preventDefault(); setBusy(true);
    try { await api.post(`/admin/tracking/${id}/update`, f); toast('Courier update added'); setF({ ...f, location: '', note: '' }); await load(); onChanged(); }
    catch (x) { toast(x.message, 'warn'); } finally { setBusy(false); }
  };
  return (
    <div className="trk-detail">
      <div className="row between wrap gap-s">
        <div>
          <h3>#{d.order_number} <Pill tone={DEALER_STATUS[d.status]?.tone}>{DEALER_STATUS[d.status]?.icon} {d.label}</Pill></h3>
          <p className="small muted">{d.customer} · {d.city} {d.pincode} · {rupees(d.total)} · promised by {d.estimated_delivery}{d.late_eta && <> · <b className="bad">late</b></>}</p>
        </div>
        <Link className="btn btn--sm" to={`/admin/orders/${d.order_id}`} onClick={onClose}>Open order</Link>
      </div>
      <div className="trk-detail__grid">
        <section>
          <h4>Journey</h4>
          <ol className="trk-journey">
            {steps.map(([k, l]) => {
              const at = d[k]; const gap = at && prev ? Math.round((Date.parse(at) - Date.parse(prev)) / 6e4) : null; if (at) prev = at;
              return <li key={k} className={at ? 'done' : ''}><b>{l}</b><span className="small muted">{at ? fmtDateTime(at) : 'Pending'}{gap != null ? ` · +${fmtDuration(gap)}` : ''}</span></li>;
            })}
          </ol>
          <p className="small"><b>Total time:</b> {fmtDuration(d.times.total)}</p>
        </section>
        <section>
          <h4>Delivery</h4>
          <p><b>{d.dealer}</b> ({d.dealer_city})</p>
          <DeliveryCell x={d} />
          {d.received_by && <p className="small">Received by <b>{d.received_by}</b></p>}
          {d.tracking.length > 0 && (
            <>
              <h4>Courier checkpoints</h4>
              <ul className="trk-cp">{[...d.tracking].reverse().map((t, i) => <li key={i}><span aria-hidden="true">{COURIER_UPDATES[t.status]?.icon}</span><div><b>{t.label}</b>{t.location ? ` · ${t.location}` : ''}<div className="small muted">{fmtDateTime(t.at)} · by {String(t.by).split(':')[0]}{t.note ? ` · ${t.note}` : ''}</div></div></li>)}</ul>
            </>
          )}
          {d.mode === 'courier' && d.status === 'out_for_delivery' && (
            <form className="trk-add" onSubmit={add}>
              <h4>Add courier update</h4>
              <select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} aria-label="Courier status">{Object.entries(COURIER_UPDATES).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}</select>
              <input placeholder="Location (e.g. Delhi hub)" value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} aria-label="Location" />
              {f.status === 'delivered' ? <input placeholder="Received by (name)" value={f.received_by} onChange={(e) => setF({ ...f, received_by: e.target.value })} aria-label="Received by" />
                : <input placeholder="Note (optional)" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} aria-label="Note" />}
              <button className="btn btn--sm btn--primary" disabled={busy}>Add update</button>
            </form>
          )}
        </section>
      </div>
      <section>
        <h4>Products</h4>
        <ul className="trk-products">{d.items.map((i, k) => <li key={k}>{i.name} × {i.qty} <span className="muted">{rupees(i.line_total)}</span></li>)}</ul>
      </section>
      {d.history.length > 1 && <p className="small muted">Dealer history: {d.history.map((h) => `${h.business_name} (${DEALER_STATUS[h.status]?.short}${h.reject_reason ? `: ${h.reject_reason}` : ''})`).join(' → ')}</p>}
      <details className="small"><summary>All order events ({d.events.length})</summary>
        <ul className="events">{d.events.map((e, i) => <li key={i}><b>{STATUS_LABEL[e.status] || e.status.replace(/_/g, ' ')}</b> <span className="muted">{fmtDateTime(e.created_at)}</span>{e.note ? ` · ${e.note}` : ''}</li>)}</ul>
      </details>
    </div>
  );
}

export function Tracking() {
  const [f, setF] = useState({ range: '30d', dealer: '', mode: '', courier: '', status: '', flag: '', q: '' });
  const [search, setSearch] = useState('');
  const [d, setD] = useState(null);
  const [open, setOpen] = useState(null);
  const [tick, setTick] = useState(0);
  const toast = useToast();
  const query = useMemo(() => qs(f), [f]);
  useEffect(() => { api.get(`/admin/tracking?${query}`).then(setD).catch((x) => toast(x.message, 'warn')); }, [query, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const t = setInterval(() => { if (!document.hidden) setTick((x) => x + 1); }, 60000); return () => clearInterval(t); }, []);
  useEffect(() => { const t = setTimeout(() => setF((x) => (x.q === search ? x : { ...x, q: search })), 300); return () => clearTimeout(t); }, [search]);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const pick = (patch) => setF({ ...f, status: '', flag: '', ...patch });
  const exportCsv = async () => {
    const q = qs({ ...f, status: '', flag: '' });
    try {
      let blob;
      if (__DEMO__) blob = new Blob([await api.get(`/admin/tracking/export.csv?${q}`)], { type: 'text/csv' });
      else { const r = await fetch(`/api/admin/tracking/export.csv?${q}`, { credentials: 'include' }); if (!r.ok) throw new Error('Export failed'); blob = await r.blob(); }
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `delivery-tracking-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    } catch (x) { toast(x.message, 'warn'); }
  };
  const k = d?.kpis;
  const tiles = k && [
    ['In pipeline', k.in_pipeline, 'with dealers right now', { status: 'open' }, ''],
    ['Waiting to accept', k.waiting_accept, k.late_accept ? `⏰ ${k.late_accept} late (> ${d.accept_minutes} min)` : 'none late', k.late_accept ? { flag: 'late_accept' } : { status: 'sent' }, k.late_accept ? 'bad' : ''],
    ['Out for delivery', k.out_for_delivery, 'with courier / delivery person', { status: 'out_for_delivery' }, ''],
    ['Delivered', k.delivered, k.on_time_pct == null ? 'in this period' : `${k.on_time_pct}% on time`, { status: 'delivered' }, 'good'],
    ['Overdue', k.overdue, 'past promised date, not delivered', { flag: 'late_eta' }, k.overdue ? 'bad' : ''],
    ['Avg. order → delivered', fmtDuration(k.avg_total_min), `${k.failed_attempts} failed courier attempt${k.failed_attempts === 1 ? '' : 's'}`, k.failed_attempts ? { flag: 'attempts' } : null, k.failed_attempts ? 'warn' : ''],
  ];
  return (
    <>
      <PageHead title="📍 Delivery tracking" sub="Every order from dealer to doorstep — stages, courier, delivery person and time taken. Refreshes every minute." />
      <div className="trk-filters">
        <div className="tabs trk-range" role="tablist" aria-label="Period">{RANGES.map(([v, l]) => <button key={v} role="tab" aria-selected={f.range === v} className={f.range === v ? 'is-on' : ''} onClick={() => setF({ ...f, range: v })}>{l}</button>)}</div>
        <select value={f.dealer} onChange={set('dealer')} aria-label="Dealer"><option value="">All dealers</option>{d?.options.dealers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
        <select value={f.mode} onChange={set('mode')} aria-label="Delivery by"><option value="">Courier + own delivery</option><option value="courier">Courier only</option><option value="self">Own delivery only</option><option value="none">Not handed over yet</option></select>
        <select value={f.courier} onChange={set('courier')} aria-label="Courier"><option value="">All couriers</option>{d?.options.couriers.map((c) => <option key={c} value={c}>{c}</option>)}</select>
        <input type="search" placeholder="Order, AWB, phone, PIN…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search shipments" />
        <button className="btn btn--sm" onClick={exportCsv}>⬇ Export CSV</button>
      </div>
      {!d ? <Spinner /> : (
        <>
          <div className="trk-kpis">
            {tiles.map(([label, value, sub, patch, tone]) => (
              <button key={label} type="button" className={`kpi trk-kpi ${tone ? `kpi--${tone}` : ''}`} disabled={!patch} onClick={() => patch && pick(patch)}>
                <span className="kpi__label">{label}</span><b className="kpi__value">{value ?? '—'}</b><span className="kpi__sub">{sub}</span>
              </button>
            ))}
          </div>
          <div className="trk-row">
            <section className="card trk-card">
              <h3>Where orders are now</h3>
              <Bars rows={d.pipeline} value={(r) => r.count} label={(r) => `${DEALER_STATUS[r.status].icon} ${r.label}`} onPick={(r) => pick({ status: f.status === r.status ? '' : r.status })} active={f.status} />
              <p className="small muted">Tap a stage to filter the list.</p>
            </section>
            <section className="card trk-card">
              <h3>Average time per stage</h3>
              <Bars rows={d.stage_times} value={(r) => r.avg_min} label={(r) => r.label} fmt={fmtDuration} />
              <p className="small muted">Slowest stage = where to follow up with dealers or couriers.</p>
            </section>
          </div>

          <section className="card trk-card">
            <div className="row between wrap gap-s">
              <h3>Shipments <span className="muted small">({d.total_items}{d.total_items > d.items.length ? `, showing ${d.items.length}` : ''})</span></h3>
              {(f.status || f.flag) && <button className="btn btn--sm btn--ghost" onClick={() => pick({})}>✕ Clear “{f.flag ? { late_accept: 'late to accept', late_eta: 'overdue', attempts: 'failed attempts' }[f.flag] : f.status === 'open' ? 'in pipeline' : DEALER_STATUS[f.status]?.label}”</button>}
            </div>
            {!d.items.length ? <Empty icon="📦" title="No shipments match">Try another period or filter.</Empty> : (
              <div className="table-wrap" tabIndex={0} role="region" aria-label="Table">
                <table className="table trk-table">
                  <thead><tr><th>Order</th><th>Products</th><th>Dealer</th><th>Stage</th><th>Delivery by</th><th>Latest update</th><th>Promised</th><th className="num">Time taken</th></tr></thead>
                  <tbody>{d.items.map((x) => (
                    <tr key={x.id}>
                      <td><button className="link-btn link" onClick={() => setOpen(x.id)}>#{x.order_number}</button><div className="small muted">{x.customer} · {x.city} {x.pincode}</div></td>
                      <td className="small trk-prod">{x.products.slice(0, 2).join(', ')}{x.products.length > 2 ? ` +${x.products.length - 2}` : ''}</td>
                      <td className="small">{x.dealer}</td>
                      <td>
                        <MiniSteps status={x.status} />
                        <div className="small"><b>{x.label}</b></div>
                        {x.late_accept && <Pill tone="bad">⏰ not accepted</Pill>}
                        {x.attempts > 0 && <Pill tone="warn">⚠️ {x.attempts} attempt{x.attempts > 1 ? 's' : ''} failed</Pill>}
                      </td>
                      <td className="small"><DeliveryCell x={x} /></td>
                      <td className="small">
                        {x.last_update ? <>{COURIER_UPDATES[x.last_update.status]?.icon} {x.last_update.label}{x.last_update.location ? ` · ${x.last_update.location}` : ''}<div className="muted">{ago(x.last_update.at)}</div></>
                          : <>{DEALER_STATUS[x.status]?.label}<div className="muted">{ago(x.updated_at)}</div></>}
                      </td>
                      <td className="small">{x.estimated_delivery}{x.late_eta && <div><Pill tone="bad">{x.status === 'delivered' ? 'delivered late' : 'overdue'}</Pill></div>}{x.on_time && <div><Pill tone="ok">on time</Pill></div>}</td>
                      <td className="num small">{x.status === 'delivered' ? fmtDuration(x.times.total) : <span className="muted">{fmtDuration(Math.round((Date.now() - Date.parse(x.ordered_at)) / 6e4))} so far</span>}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </section>

          <div className="trk-row trk-row--full">
            <section className="card trk-card">
              <h3>Couriers & delivery people</h3>
              {!d.couriers.length ? <p className="muted small">No parcels handed over in this period.</p> : (
                <div className="table-wrap" tabIndex={0} role="region" aria-label="Table"><table className="table table--compact">
                  <thead><tr><th>Delivered by</th><th className="num">Parcels</th><th className="num">In transit</th><th className="num">Delivered</th><th className="num">On time</th><th className="num">Avg. out → delivered</th><th className="num">Failed attempts</th></tr></thead>
                  <tbody>{d.couriers.map((c) => (
                    <tr key={c.name}><td><button className="link-btn link" onClick={() => setF({ ...f, mode: c.mode, courier: c.mode === 'courier' ? c.name : '' })}>{c.mode === 'courier' ? `📮 ${c.name}` : c.name}</button></td>
                      <td className="num">{c.shipments}</td><td className="num">{c.in_transit}</td><td className="num">{c.delivered}</td><td className="num">{c.on_time_pct == null ? '—' : `${c.on_time_pct}%`}</td><td className="num">{fmtDuration(c.avg_deliver_min)}</td><td className="num">{c.attempts || '—'}</td></tr>
                  ))}</tbody>
                </table></div>
              )}
            </section>
            <section className="card trk-card">
              <h3>Dealers</h3>
              {!d.dealers.length ? <p className="muted small">No dealer orders in this period.</p> : (
                <div className="table-wrap" tabIndex={0} role="region" aria-label="Table"><table className="table table--compact">
                  <thead><tr><th>Dealer</th><th className="num">Orders</th><th className="num">Waiting</th><th className="num">Avg. accept</th><th className="num">Sent → ready</th><th className="num">Delivered</th><th className="num">On time</th><th className="num">Declined</th></tr></thead>
                  <tbody>{d.dealers.map((x) => (
                    <tr key={x.id}><td><button className="link-btn link" onClick={() => setF({ ...f, dealer: String(x.id) })}>{x.name}</button><div className="small muted">{x.city}</div></td>
                      <td className="num">{x.shipments}</td><td className="num">{x.waiting || '—'}</td><td className="num">{fmtDuration(x.avg_accept_min)}</td><td className="num">{fmtDuration(x.avg_ready_min)}</td>
                      <td className="num">{x.delivered}</td><td className="num">{x.on_time_pct == null ? '—' : `${x.on_time_pct}%`}</td><td className="num">{x.declined || '—'}</td></tr>
                  ))}</tbody>
                </table></div>
              )}
            </section>
          </div>
        </>
      )}
      <Modal open={!!open} onClose={() => setOpen(null)} title="Shipment journey" wide>
        {open && <Detail id={open} onClose={() => setOpen(null)} onChanged={() => setTick((x) => x + 1)} />}
      </Modal>
    </>
  );
}
