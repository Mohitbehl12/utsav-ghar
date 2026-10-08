import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { rupees } from '../lib/format.js';
import { Spinner, Media } from '../components/ui.jsx';
import { useToast } from '../state/store.jsx';
import { PageHead, useAdminData } from './pages.jsx';

const pct = (v, max) => `${Math.max(0, Math.min(100, (v / max) * 100))}%`;
const r0 = (paise) => rupees(Math.round(paise / 100) * 100);

/**
 * One product = one bar whose full length is the MRP (original price):
 *   [ cost | profit | discount given off MRP ]
 * If the selling price is below cost, the gap is drawn as a hatched LOSS segment.
 * A dashed tick marks the price the customer effectively pays under the Buy-3 offer.
 */
export function PriceLadder({ p, max, showOffer, compact }) {
  const loss = p.price < p.cost;
  const offerLoss = p.offer_price != null && p.offer_price < p.cost;
  return (
    <div className={`ladder ${compact ? 'ladder--compact' : ''}`} role="img"
      aria-label={`${p.name}: MRP ${rupees(p.mrp)}, selling ${rupees(p.price)}, cost ${rupees(p.cost)}, ${loss ? 'loss' : 'profit'} ${rupees(Math.abs(p.price - p.cost))} per unit`}>
      <div className="ladder__track" style={{ width: pct(p.mrp || Math.max(p.price, p.cost), max) }}>
        {loss ? (
          <>
            <span className="seg seg--cost" style={{ width: pct(p.price, p.mrp || p.cost) }} />
            <span className="seg seg--loss" style={{ width: pct(p.cost - p.price, p.mrp || p.cost) }} />
          </>
        ) : (
          <>
            <span className="seg seg--cost" style={{ width: pct(p.cost, p.mrp) }} />
            <span className="seg seg--profit" style={{ width: pct(p.price - p.cost, p.mrp) }} />
          </>
        )}
        <span className="seg seg--disc" style={{ flex: 1 }} />
      </div>
      {showOffer && p.offer_price != null && (
        <span className={`ladder__offer ${offerLoss ? 'is-loss' : ''}`} style={{ left: pct(p.offer_price, max) }} title={`At the offer the customer pays ${rupees(p.offer_price)}`} />
      )}
    </div>
  );
}

function Tip({ p, offer }) {
  return (
    <div className="ladder-tip" role="tooltip">
      <b>{p.name}</b>
      <dl>
        <div><dt>Original price (MRP)</dt><dd>{rupees(p.mrp)}</dd></div>
        <div><dt>Selling price</dt><dd>{rupees(p.price)}</dd></div>
        <div><dt>Your cost</dt><dd>{rupees(p.cost)}</dd></div>
        <div className={p.unit_profit < 0 ? 'bad' : 'good'}><dt>Profit per unit</dt><dd>{rupees(p.unit_profit)} · {p.margin_pct}%</dd></div>
        {p.offer_price != null && <div className={p.offer_unit_profit < 0 ? 'bad' : ''}><dt>At {offer?.discount_value}% offer</dt><dd>pays {rupees(p.offer_price)} → {p.offer_unit_profit < 0 ? 'loss' : 'profit'} {rupees(Math.abs(p.offer_unit_profit))}</dd></div>}
      </dl>
    </div>
  );
}

function Row({ p, onSaved }) {
  const [f, setF] = useState({ mrp: p.mrp / 100, price: p.price / 100, cost_price: p.cost / 100 });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const toast = useToast();
  const dirty = f.mrp * 100 !== p.mrp || f.price * 100 !== p.price || f.cost_price * 100 !== p.cost;
  const live = { price: Math.round(f.price * 100), cost: Math.round(f.cost_price * 100) };
  const unit = live.price - live.cost;
  const margin = live.price ? Math.round((unit / live.price) * 1000) / 10 : 0;
  const save = async () => {
    setBusy(true); setErr('');
    try { await api.patch(`/admin/products/${p.id}/pricing`, { mrp: Number(f.mrp), price: Number(f.price), cost_price: Number(f.cost_price) }); toast(`${p.name}: prices saved`); onSaved(); }
    catch (e) { setErr(e.fields?.mrp || e.message); } finally { setBusy(false); }
  };
  const inp = (k, label) => (
    <input type="number" min="0" step="1" inputMode="decimal" aria-label={`${label} for ${p.name}`} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })}
      onKeyDown={(e) => e.key === 'Enter' && dirty && save()} className={k === 'cost_price' && !p.cost ? 'needs' : ''} />
  );
  return (
    <tr className={dirty ? 'is-dirty' : ''}>
      <td className="pt-name"><Link to={`/admin/products/${p.id}`} className="link">{p.name}</Link><br /><span className="muted small">{p.category_name}</span>{err && <p className="field__error">{err}</p>}</td>
      <td className="num">{inp('mrp', 'MRP')}</td>
      <td className="num">{inp('price', 'Selling price')}</td>
      <td className="num">{inp('cost_price', 'Cost')}</td>
      <td className={`num ${unit < 0 ? 'bad-text' : ''}`}><b>{rupees(unit)}</b></td>
      <td className={`num ${unit < 0 ? 'bad-text' : ''}`}>{margin}%</td>
      <td className="num">{p.offer_unit_profit == null ? <span className="muted">—</span> : <span className={p.offer_unit_profit < 0 ? 'bad-text' : ''}>{p.offer_unit_profit < 0 ? '⚠ ' : ''}{rupees(p.offer_unit_profit)}</span>}</td>
      <td className="num">{p.units_sold}</td>
      <td className="num"><b className={p.gross_profit < 0 ? 'bad-text' : ''}>{rupees(p.gross_profit)}</b></td>
      <td>{dirty && <button className="btn btn--primary btn--sm" onClick={save} disabled={busy}>Save</button>}</td>
    </tr>
  );
}

export function Profit() {
  const [data, reload] = useAdminData('/admin/profit');
  const [cat, setCat] = useState('');
  const [sort, setSort] = useState('unit_profit');
  const [showOffer, setShowOffer] = useState(true);
  const [hover, setHover] = useState(null);

  const rows = useMemo(() => {
    if (!data) return [];
    const list = data.products.filter((p) => !cat || p.category_slug === cat);
    const by = {
      unit_profit: (a, b) => b.unit_profit - a.unit_profit,
      margin_asc: (a, b) => a.margin_pct - b.margin_pct,
      offer_risk: (a, b) => (a.offer_unit_profit ?? 1e12) - (b.offer_unit_profit ?? 1e12),
      realised: (a, b) => b.gross_profit - a.gross_profit,
      name: (a, b) => a.name.localeCompare(b.name),
    }[sort];
    return [...list].sort(by);
  }, [data, cat, sort]);

  if (!data) return <Spinner />;
  const t = data.totals;
  const cats = [...new Map(data.products.map((p) => [p.category_slug, p.category_name])).entries()];
  const max = Math.max(1, ...rows.map((p) => Math.max(p.mrp, p.cost)));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  const offerLabel = data.offer?.discount_type === 'percent' ? `${data.offer.discount_value}% offer price` : data.offer?.discount_type === 'tiered' ? `Price at the top ${data.offer.discount_value}% tier` : 'offer price';

  return (
    <>
      <PageHead title="Profit & pricing" sub="Original price (MRP), selling price and your cost for every product, and the profit you actually made from paid orders." />

      <div className="kpis">
        <div className="kpi"><span className="kpi__label">Revenue (after discounts)</span><b className="kpi__value">{rupees(t.revenue)}</b><span className="kpi__sub">{t.units_sold} units · {t.orders} paid orders</span></div>
        <div className="kpi"><span className="kpi__label">Cost of goods sold</span><b className="kpi__value">{rupees(t.cogs)}</b><span className="kpi__sub">at the cost saved on each order</span></div>
        <div className={`kpi ${t.gross_profit < 0 ? 'kpi--bad' : 'kpi--good'}`}><span className="kpi__label">Gross profit</span><b className="kpi__value">{rupees(t.gross_profit)}</b><span className="kpi__sub">{t.margin_pct}% margin{t.delivery_collected ? ` · + ${rupees(t.delivery_collected)} delivery fees` : ''}</span></div>
        <div className="kpi"><span className="kpi__label">Stock value at cost</span><b className="kpi__value">{r0(t.stock_value_at_cost)}</b><span className="kpi__sub">money tied up in inventory</span></div>
      </div>

      {(t.loss_at_offer > 0 || t.missing_cost > 0) && (
        <div className="alerts">
          {t.loss_at_offer > 0 && (
            <p className="notice notice--warn">⚠️ <b>{t.loss_at_offer} product{t.loss_at_offer > 1 ? 's' : ''} sell below cost</b> when the {data.offer?.name || 'offer'} applies. Raise their price or cost-negotiate, or remove them from the offer in <Link className="link" to="/admin/offers">Offers</Link>. <button className="link-btn" onClick={() => setSort('offer_risk')}>Show them first</button></p>
          )}
          {t.missing_cost > 0 && <p className="notice notice--info">ℹ️ {t.missing_cost} product{t.missing_cost > 1 ? 's have' : ' has'} no cost entered, so their profit shows as 100%.</p>}
        </div>
      )}

      <section className="card profit-chart">
        <div className="row between wrap">
          <h2>Price breakdown per product</h2>
          <div className="row gap-s wrap">
            <select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Category"><option value="">All categories</option>{cats.map(([s, n]) => <option key={s} value={s}>{n}</option>)}</select>
            <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort">
              <option value="unit_profit">Most profit per unit</option><option value="margin_asc">Lowest margin first</option>
              <option value="offer_risk">Riskiest at offer price</option><option value="realised">Most profit earned</option><option value="name">Name</option>
            </select>
            {data.offer && <label className="check"><input type="checkbox" checked={showOffer} onChange={(e) => setShowOffer(e.target.checked)} /><span>Show offer price</span></label>}
          </div>
        </div>
        <ul className="legend" aria-label="Legend">
          <li><i className="sw sw--cost" />Your cost</li>
          <li><i className="sw sw--profit" />Profit (selling − cost)</li>
          <li><i className="sw sw--disc" />Discount off MRP</li>
          <li><i className="sw sw--loss" />Loss (selling below cost)</li>
          {showOffer && data.offer && <li><i className="sw sw--offer" />{offerLabel}</li>}
        </ul>
        <div className="ladders" onMouseLeave={() => setHover(null)}>
          <div className="ladders__axis" aria-hidden="true">
            <span />
            <div className="ladders__ticks">{ticks.map((v, i) => <span key={i} style={{ left: pct(v, max) }}>{r0(v)}</span>)}</div>
            <span />
          </div>
          {rows.map((p) => (
            <div key={p.id} className={`ladders__row ${hover === p.id ? 'is-hover' : ''}`} onMouseEnter={() => setHover(p.id)} onFocus={() => setHover(p.id)} tabIndex={0}>
              <span className="ladders__name"><span className="thumb thumb--xs"><Media product={p} /></span><span>{p.name}</span></span>
              <div className="ladders__plot" style={{ '--g1': pct(ticks[1], max), '--g2': pct(ticks[2], max), '--g3': pct(ticks[3], max) }}>
                <PriceLadder p={p} max={max} showOffer={showOffer} />
                {hover === p.id && <Tip p={p} offer={data.offer} />}
              </div>
              <span className={`ladders__val ${p.unit_profit < 0 ? 'bad-text' : ''}`}><b>{rupees(p.unit_profit)}</b><small>{p.margin_pct}%</small></span>
            </div>
          ))}
        </div>
        <p className="small muted">Bar length = original price (MRP). Hover a row for exact figures. Values on the right are profit per unit and margin at the selling price.</p>
      </section>

      <section className="card">
        <div className="row between wrap"><h2>Edit prices &amp; costs</h2><span className="small muted">Type new values, press Enter or Save. Customers see the new price immediately.</span></div>
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Table">
          <table className="table profit-table">
            <thead><tr><th>Product</th><th className="num">MRP ₹</th><th className="num">Selling ₹</th><th className="num">Cost ₹</th><th className="num">Profit / unit</th><th className="num">Margin</th><th className="num">At offer</th><th className="num">Sold</th><th className="num">Profit earned</th><th /></tr></thead>
            <tbody>{rows.map((p) => <Row key={`${p.id}-${p.mrp}-${p.price}-${p.cost}`} p={p} onSaved={reload} />)}</tbody>
          </table>
        </div>
      </section>
    </>
  );
}
