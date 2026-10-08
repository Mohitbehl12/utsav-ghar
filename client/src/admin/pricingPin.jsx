/**
 * Admin → Pricing by PIN: price stays the same everywhere; delivery charge and courier cost
 * change with the zone, so profit is shown per zone (and per PIN code) with every rupee explained.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { rupees } from '../lib/format.js';
import { Field, Pill, Spinner, Empty } from '../components/ui.jsx';
import { useToast } from '../state/store.jsx';
import { PageHead } from './pages.jsx';

const ZONE_KEYS = ['local', 'regional', 'metro', 'national', 'special'];
const rs = (p) => (p == null ? '' : Math.round(p) / 100);
const pct = (n) => `${n}%`;

function Explain({ r, inputs }) {
  const rows = [
    ['Product price', r.price, '+'],
    [`Delivery charged to customer${r.delivery_charged ? '' : ' (free for this order)'}`, r.delivery_charged, '+'],
    ['Customer pays', r.paid, '='],
    ...(r.gst ? [[`GST inside the price (${inputs.gst_pct}%)`, -r.gst, '−']] : []),
    ['Dealer / product cost', -r.cost, '−'],
    ['Packaging', -r.packaging, '−'],
    ['Other expenses', -r.other, '−'],
    ...(r.platform ? [[`Platform / payment fee (${inputs.platform_pct}%)`, -r.platform, '−']] : []),
    [`Courier (${r.label}${r.pin ? ` · ${r.pin}` : ''}, ${inputs.kg} kg${r.source === 'shiprocket' ? ` · ${r.courier_name || 'Shiprocket'} live` : r.source === 'manual' ? ' · entered by you' : ' · rate card'})`, -r.courier, '−'],
  ];
  return (
    <div className="pz-explain">
      <h4>How the profit for {r.pin ? `PIN ${r.pin}` : r.label} is calculated</h4>
      <table><tbody>
        {rows.map(([l, v, op]) => <tr key={l} className={op === '=' ? 'is-sum' : ''}><th scope="row"><span className="pz-op">{op}</span>{l}</th><td className="num">{rupees(Math.abs(v))}</td></tr>)}
        <tr className={`is-total ${r.profit < 0 ? 'is-loss' : ''}`}><th scope="row"><span className="pz-op">=</span>Your profit ({pct(r.margin_pct)} of price without GST)</th><td className="num">{rupees(r.profit)}</td></tr>
      </tbody></table>
      <p className="small muted">{r.delivery_gap >= 0 ? `Delivery: customer pays ${rupees(r.delivery_charged)}, courier costs ${rupees(r.courier)} → you keep ${rupees(r.delivery_gap)}.` : `Delivery: customer pays ${rupees(r.delivery_charged)}, courier costs ${rupees(r.courier)} → you pay ${rupees(-r.delivery_gap)} of it from your margin.`}</p>
    </div>
  );
}

function Calculator({ products, settings }) {
  const toast = useToast();
  const [f, setF] = useState({ product_id: products.find((p) => p.cost)?.id || '', price: '', cost: '', qty: 1, weight_g: '', dims: '', packaging: rs(settings.costs.packaging), other: rs(settings.costs.other), platform_pct: settings.costs.platform_pct, gst_pct: settings.costs.gst_pct, origin_pin: '', pins: '', target_profit: '' });
  const [over, setOver] = useState({});
  const [r, setR] = useState(null);
  const [pick, setPick] = useState('national');
  const [busy, setBusy] = useState(false);
  const t = useRef(0);
  const prod = products.find((p) => String(p.id) === String(f.product_id));
  // when a product is chosen, fill its numbers (still editable)
  useEffect(() => {
    if (!prod) return;
    setF((x) => ({ ...x, price: rs(prod.price), cost: rs(prod.cost), weight_g: prod.weight_g || '', dims: prod.dims ? prod.dims.map((d) => Math.round(d)).join(' x ') + ' cm' : '', origin_pin: prod.origin.pin || x.origin_pin }));
    setOver({});
  }, [f.product_id]); // eslint-disable-line react-hooks/exhaustive-deps
  const body = useMemo(() => {
    const n = (v) => (v === '' || v == null ? undefined : Number(v));
    return {
      product_id: f.product_id ? Number(f.product_id) : undefined, price: n(f.price), cost: n(f.cost), qty: n(f.qty) || 1, weight_g: n(f.weight_g), dims: f.dims || undefined,
      packaging: n(f.packaging), other: n(f.other), platform_pct: n(f.platform_pct), gst_pct: n(f.gst_pct), origin_pin: f.origin_pin || undefined,
      pins: f.pins.split(/[\s,]+/).filter((x) => /^[1-9]\d{5}$/.test(x)).slice(0, 10), target_profit: n(f.target_profit), courier_overrides: over,
    };
  }, [f, over]);
  useEffect(() => {
    clearTimeout(t.current);
    t.current = setTimeout(() => { setBusy(true); api.post('/admin/pricing/calc', body).then(setR).catch((x) => toast(x.message, 'warn')).finally(() => setBusy(false)); }, 350);
    return () => clearTimeout(t.current);
  }, [body]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const rows = r ? [...r.zones, ...r.pins.map((p) => ({ ...p, key: `pin:${p.pin}` }))] : [];
  const sel = rows.find((x) => (x.key || x.zone) === pick) || rows[3];
  const setOverride = (key, v) => setOver((o) => { const n = { ...o }; if (v === '' || v == null) delete n[key]; else n[key] = Number(v); return n; });
  const usePrice = async (paise) => {
    if (!prod) return;
    try { await api.patch(`/admin/products/${prod.id}/pricing`, { price: paise / 100, mrp: Math.max(paise, prod.price, prod.mrp || 0) / 100, cost_price: Number(f.cost || 0) }); toast(`Price set to ${rupees(paise)}`); setF({ ...f, price: paise / 100 }); }
    catch (x) { toast(x.message, 'warn'); }
  };
  const saveParcel = async () => {
    try { await api.put(`/admin/pricing/products/${prod.id}/parcel`, { weight_g: f.weight_g ? Number(f.weight_g) : null, dims: f.dims || null }); toast('Weight & box size saved for this product'); }
    catch (x) { toast(x.message, 'warn'); }
  };
  return (
    <div className="pz-calc">
      <section className="card pz-in">
        <Field label="Product" id="pz-p"><select id="pz-p" value={f.product_id} onChange={set('product_id')}><option value="">Custom (type the numbers)</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
        <div className="grid-2">
          <Field label="Selling price (₹)" id="pz-price"><input id="pz-price" type="number" min={0} step="1" value={f.price} onChange={set('price')} /></Field>
          <Field label="Dealer / cost price (₹)" id="pz-cost"><input id="pz-cost" type="number" min={0} step="0.01" value={f.cost} onChange={set('cost')} /></Field>
          <Field label="Pieces in the order" id="pz-q"><input id="pz-q" type="number" min={1} max={50} value={f.qty} onChange={set('qty')} /></Field>
          <Field label="Weight per piece (g)" id="pz-w" hint={prod?.parcel_guessed ? 'Not in product details — 500 g assumed' : 'Packed weight'}><input id="pz-w" type="number" min={1} value={f.weight_g} onChange={set('weight_g')} /></Field>
          <Field label="Box size (cm)" id="pz-d" hint="L x W x H — couriers bill the bigger of weight and size"><input id="pz-d" value={f.dims} onChange={set('dims')} placeholder="e.g. 20 x 15 x 10 cm" /></Field>
          <Field label="Ships from PIN" id="pz-o" hint={prod ? prod.origin.label : 'Dealer or your warehouse'}><input id="pz-o" inputMode="numeric" maxLength={6} value={f.origin_pin} onChange={set('origin_pin')} /></Field>
          <Field label="Packaging (₹)" id="pz-pk"><input id="pz-pk" type="number" min={0} step="0.01" value={f.packaging} onChange={set('packaging')} /></Field>
          <Field label="Other expenses (₹)" id="pz-ot" hint="Marketing, returns, staff…"><input id="pz-ot" type="number" min={0} step="0.01" value={f.other} onChange={set('other')} /></Field>
          <Field label="Platform / payment fee (%)" id="pz-pf"><input id="pz-pf" type="number" min={0} max={50} step="0.1" value={f.platform_pct} onChange={set('platform_pct')} /></Field>
          <Field label="GST inside the price (%)" id="pz-g"><input id="pz-g" type="number" min={0} max={40} step="0.1" value={f.gst_pct} onChange={set('gst_pct')} /></Field>
        </div>
        <Field label="Check these PIN codes" id="pz-pins" hint={settings.live ? 'Live courier rate from Shiprocket' : 'Up to 10, comma separated'}><input id="pz-pins" value={f.pins} onChange={set('pins')} placeholder="e.g. 411038, 110024, 781001" /></Field>
        <Field label="Profit you want per order (₹)" id="pz-t" hint="We suggest a price for each zone"><input id="pz-t" type="number" min={0} value={f.target_profit} onChange={set('target_profit')} placeholder="e.g. 300" /></Field>
        {prod && <button type="button" className="btn btn--sm btn--ghost" onClick={saveParcel}>Save weight & box size to this product</button>}
      </section>

      <section className="pz-out">
        {!r ? <Spinner /> : (
          <>
            <div className={`card pz-card ${busy ? 'is-busy' : ''}`}>
              <div className="row between wrap gap-s">
                <h3>Profit by delivery area</h3>
                <span className="small muted">Chargeable weight <b>{r.inputs.kg} kg</b> · ships from {r.inputs.origin || 'PIN not set'}</span>
              </div>
              <div className="table-wrap" tabIndex={0} role="region" aria-label="Table">
                <table className="table table--compact pz-table">
                  <thead><tr><th>Area</th><th className="num">Customer pays</th><th className="num">Delivery charged</th><th className="num">Courier cost</th><th className="num">GST + fees</th><th className="num">Cost + packing + other</th><th className="num">Profit</th></tr></thead>
                  <tbody>{rows.map((x) => {
                    const key = x.key || x.zone;
                    return (
                      <tr key={key} className={`${pick === key ? 'is-on' : ''} ${x.profit < 0 ? 'is-loss' : ''}`} onClick={() => setPick(key)}>
                        <td><button type="button" className="link-btn" onClick={() => setPick(key)}>{x.pin ? <>PIN {x.pin}<div className="small muted">{x.label}{x.etd ? ` · ${x.etd}` : ''}</div></> : x.label}</button></td>
                        <td className="num">{rupees(x.paid)}</td>
                        <td className="num">{x.delivery_charged ? rupees(x.delivery_charged) : <span className="ok">Free</span>}</td>
                        <td className="num">
                          <input className="pz-cour" aria-label={`Courier cost for ${x.pin || x.label}`} type="number" min={0} step="1" placeholder={rs(x.courier)} value={over[key] ?? ''} onClick={(e) => e.stopPropagation()} onChange={(e) => setOverride(key, e.target.value)} />
                          <div className="small muted">{x.source === 'shiprocket' ? `${x.courier_name || 'Shiprocket'} live` : x.source === 'manual' ? 'your number' : 'rate card'}</div>
                        </td>
                        <td className="num">{rupees(x.gst + x.platform)}</td>
                        <td className="num">{rupees(x.cost + x.packaging + x.other)}</td>
                        <td className="num"><b>{rupees(x.profit)}</b><div className="small muted">{pct(x.margin_pct)}</div></td>
                      </tr>
                    );
                  })}</tbody>
                </table>
              </div>
              <p className="small muted">Type a number in “Courier cost” to use your real courier bill instead. Click a row to see the full calculation.</p>
            </div>
            {sel && <div className="card pz-card"><Explain r={sel} inputs={r.inputs} /></div>}
            {r.suggestions && (
              <div className="card pz-card">
                <h3>Price for {rupees(Number(f.target_profit) * 100)} profit per order</h3>
                <div className="pz-sugg">{ZONE_KEYS.map((z) => (
                  <div key={z}><span>{r.zones.find((x) => x.zone === z).label}</span><b>{rupees(r.suggestions[z])}</b>
                    {prod && <button type="button" className="btn btn--sm btn--ghost" onClick={() => usePrice(r.suggestions[z])}>Use</button>}</div>
                ))}</div>
                <p className="small muted">The price is the same for all customers, so pick the zone most of your orders go to, or the farthest one to be safe everywhere.</p>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}

function AllProducts({ data }) {
  const [q, setQ] = useState('');
  const [onlyLoss, setOnlyLoss] = useState(false);
  const toast = useToast();
  const items = data.items.filter((x) => (!q || x.name.toLowerCase().includes(q.toLowerCase())) && (!onlyLoss || x.loss_zones.length));
  const exportCsv = async () => {
    try {
      const blob = __DEMO__ ? new Blob([await api.get('/admin/pricing/export.csv')], { type: 'text/csv' }) : await (await fetch('/api/admin/pricing/export.csv', { credentials: 'include' })).blob();
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `pricing-by-zone-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    } catch (x) { toast(x.message, 'warn'); }
  };
  return (
    <>
      <div className="kpis">
        <div className="kpi"><span className="kpi__label">Products</span><b className="kpi__value">{data.summary.products}</b></div>
        <div className={`kpi ${data.summary.with_loss ? 'kpi--bad' : ''}`}><span className="kpi__label">Lose money somewhere</span><b className="kpi__value">{data.summary.with_loss}</b><span className="kpi__sub">a 1-piece order to that zone</span></div>
        <div className={`kpi ${data.summary.no_cost ? 'kpi--warn' : ''}`}><span className="kpi__label">No cost price</span><b className="kpi__value">{data.summary.no_cost}</b><span className="kpi__sub">profit looks higher than it is</span></div>
        <div className={`kpi ${data.summary.guessed ? 'kpi--warn' : ''}`}><span className="kpi__label">Weight not known</span><b className="kpi__value">{data.summary.guessed}</b><span className="kpi__sub">500 g assumed</span></div>
      </div>
      <div className="row gap-s wrap pz-tools">
        <input type="search" placeholder="Search products" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search products" />
        <label className="check"><input type="checkbox" checked={onlyLoss} onChange={(e) => setOnlyLoss(e.target.checked)} /> Only products that lose money in a zone</label>
        <button className="btn btn--sm" onClick={exportCsv}>⬇ Export CSV</button>
      </div>
      {!items.length ? <Empty icon="🧮" title="No products match" /> : (
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Table">
          <table className="table table--compact pz-all">
            <thead><tr><th>Product</th><th className="num">Price</th><th className="num">Cost</th><th className="num">Kg</th>{ZONE_KEYS.map((z) => <th key={z} className="num">{data.zones[z].label}</th>)}</tr></thead>
            <tbody>{items.map((x) => (
              <tr key={x.id}>
                <td>{x.name}<div className="small muted">{x.category}{!x.is_active ? ' · hidden' : ''} · from {x.origin.pin || '—'}</div></td>
                <td className="num">{rupees(x.price)}</td>
                <td className="num">{x.no_cost ? <Pill tone="warn">missing</Pill> : rupees(x.cost)}</td>
                <td className="num">{x.kg}{x.parcel_guessed ? '*' : ''}</td>
                {ZONE_KEYS.map((z) => <td key={z} className={`num ${x.zones[z].profit < 0 ? 'pz-neg' : ''}`} title={`Customer pays delivery ${rupees(x.zones[z].charged)}, courier ${rupees(x.zones[z].courier)}`}>{rupees(x.zones[z].profit)}<div className="small muted">{pct(x.zones[z].margin_pct)}</div></td>)}
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      <p className="small muted">Profit for one piece sent alone to each zone, after GST, platform fee, packaging, other expenses and courier. * weight assumed. Hover a number to see delivery charged vs courier cost.</p>
    </>
  );
}

function Settings({ settings, onSaved }) {
  const toast = useToast();
  const conv = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([a, x]) => [a, rs(x)])) : v]));
  const [f, setF] = useState(() => ({ zone_delivery: settings.zone_delivery, pickup_pincode: settings.pickup_pincode || '', zone_fees: conv(settings.zone_fees), rate_card: conv(settings.rate_card) }));
  const [err, setErr] = useState({});
  const setZ = (grp, z, k) => (e) => setF({ ...f, [grp]: { ...f[grp], [z]: { ...f[grp][z], [k]: e.target.value } } });
  const save = async (e) => {
    e.preventDefault();
    try { onSaved(await api.put('/admin/pricing/settings', { ...f, rate_card: { ...f.rate_card, fuel_pct: Number(f.rate_card.fuel_pct || 0) } })); toast('Saved — customers see the new delivery charges now'); setErr({}); }
    catch (x) { setErr(x.fields || {}); toast(x.message, 'warn'); }
  };
  return (
    <form className="card pz-settings" onSubmit={save}>
      <label className="check"><input type="checkbox" checked={f.zone_delivery} onChange={(e) => setF({ ...f, zone_delivery: e.target.checked })} /> Charge delivery by the customer's PIN code zone</label>
      <Field label="Your pickup / warehouse PIN" id="pz-pick" error={err.pickup_pincode} hint="Used when no dealer ships the order"><input id="pz-pick" inputMode="numeric" maxLength={6} value={f.pickup_pincode} onChange={(e) => setF({ ...f, pickup_pincode: e.target.value })} /></Field>
      <div className="table-wrap" tabIndex={0} role="region" aria-label="Table">
        <table className="table table--compact pz-set">
          <thead><tr><th>Zone</th><th>Customer pays (₹)</th><th>Free delivery above (₹)</th><th>Courier: first 0.5 kg (₹)</th><th>Courier: each extra 0.5 kg (₹)</th></tr></thead>
          <tbody>{ZONE_KEYS.map((z) => (
            <tr key={z}>
              <td><b>{settings.zones[z].label}</b><div className="small muted">{settings.zones[z].hint}</div></td>
              <td><input type="number" min={0} aria-label={`${z} delivery charge`} value={f.zone_fees[z].fee} onChange={setZ('zone_fees', z, 'fee')} /></td>
              <td><input type="number" min={0} aria-label={`${z} free above`} value={f.zone_fees[z].free_above} onChange={setZ('zone_fees', z, 'free_above')} /></td>
              <td><input type="number" min={0} aria-label={`${z} courier first`} value={f.rate_card[z].first} onChange={setZ('rate_card', z, 'first')} /></td>
              <td><input type="number" min={0} aria-label={`${z} courier extra`} value={f.rate_card[z].extra} onChange={setZ('rate_card', z, 'extra')} /></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <Field label="Courier fuel surcharge (%)" id="pz-fuel"><input id="pz-fuel" type="number" min={0} max={50} step="0.1" value={f.rate_card.fuel_pct} onChange={(e) => setF({ ...f, rate_card: { ...f.rate_card, fuel_pct: e.target.value } })} /></Field>
      <p className={`notice small ${settings.live ? 'notice--ok' : ''}`}>{settings.live ? '✅ Shiprocket connected: PIN checks and new orders use live courier rates; this rate card is the backup.' : 'Shiprocket is not connected yet, so courier cost comes from this rate card. Add SHIPROCKET_EMAIL and SHIPROCKET_PASSWORD to the server .env to use live rates.'}</p>
      <p className="small muted">Packaging, other expenses, platform fee and GST defaults are shared with Dealer products → ⚙️ Default costs.</p>
      <button className="btn btn--primary">Save delivery charges & courier rates</button>
    </form>
  );
}

export function PricingByPin() {
  const [tab, setTab] = useState('calc');
  const [data, setData] = useState(null);
  const load = () => api.get('/admin/pricing/products').then(setData);
  useEffect(() => { load(); }, []);
  return (
    <>
      <PageHead title="🧮 Pricing by PIN" sub="Same price everywhere; delivery charge and courier cost change by area. See your profit and every expense for each zone and PIN code." />
      <div className="tabs" role="tablist">
        {[['calc', '🧮 Calculator'], ['all', '📋 All products'], ['settings', '🚚 Delivery charges & courier rates']].map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'is-on' : ''} onClick={() => setTab(k)}>{l}</button>)}
      </div>
      {!data ? <Spinner /> : (
        <>
          {tab === 'calc' && <Calculator products={data.items} settings={data.settings} />}
          {tab === 'all' && <AllProducts data={data} />}
          {tab === 'settings' && <Settings settings={{ ...data.settings, zones: data.zones }} onSaved={() => load()} />}
        </>
      )}
    </>
  );
}

/** Inside an order: zone, delivery charged vs courier, actual courier bill, order profit. */
export function OrderEconomics({ order, onChange }) {
  const e = order.economics;
  const [v, setV] = useState(e?.courier_actual != null ? rs(e.courier_actual) : '');
  const toast = useToast();
  if (!e || e.international) return null;
  const save = async () => {
    try { const r = await api.put(`/admin/pricing/orders/${order.id}/courier-cost`, { amount: v === '' ? null : Number(v) }); onChange({ ...order, economics: r }); toast('Courier cost saved'); }
    catch (x) { toast(x.message, 'warn'); }
  };
  return (
    <section className="pz-order">
      <h3>💰 Delivery & profit</h3>
      <p className="small">{e.zone_label ? <>Zone <b>{e.zone_label}</b> · from {e.origin_pin || '—'} · {e.kg} kg</> : 'Zone not recorded'}</p>
      <table className="pz-mini"><tbody>
        <tr><th scope="row">Customer paid (products + delivery)</th><td className="num">{rupees(e.paid)}</td></tr>
        <tr><th scope="row">Delivery charged</th><td className="num">{rupees(e.delivery_charged)}</td></tr>
        <tr><th scope="row">Courier cost ({e.courier_source === 'actual' ? 'courier bill' : e.courier_source === 'shiprocket' ? 'Shiprocket estimate' : 'rate card estimate'})</th><td className="num">{rupees(e.courier)}</td></tr>
        <tr><th scope="row">GST + platform fee</th><td className="num">{rupees(e.gst + e.platform)}</td></tr>
        <tr><th scope="row">Product cost + packaging + other</th><td className="num">{rupees(e.cost + e.packaging + e.other)}</td></tr>
        <tr className={e.profit < 0 ? 'is-loss' : ''}><th scope="row"><b>Profit on this order</b></th><td className="num"><b>{rupees(e.profit)}</b></td></tr>
      </tbody></table>
      <div className="row gap-s wrap"><input type="number" min={0} step="1" placeholder="Actual courier bill (₹)" value={v} onChange={(ev) => setV(ev.target.value)} aria-label="Actual courier bill" /><button type="button" className="btn btn--sm" onClick={save}>Save</button></div>
    </section>
  );
}
