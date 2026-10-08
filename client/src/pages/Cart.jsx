import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { savedItems, setSavedItems } from '../lib/history.js';
import { ItemsRow } from '../components/Recs.jsx';
import { Link, useNavigate } from 'react-router-dom';
import { useCart, useStore, useMoney } from '../state/store.jsx';
import { DeliveryNote } from '../components/Locale.jsx';
import { countryName } from '../lib/countries.js';
import { formatRupees } from '@shared/pricing.js';
import { isProductEligible } from '@shared/pricing.js';
import { Media, Qty, Empty, useSeo, Spinner } from '../components/ui.jsx';
import { TrashIcon } from '../components/Icons.jsx';

export function Summary({ quote, children, compact }) {
  const m = useMoney();
  const rupees = m.fmt;
  if (!quote) return <div className="summary card center"><Spinner /></div>;
  return (
    <div className="summary card">
      <h2 className="summary__title">Order Summary</h2>
      <dl>
        <div><dt>Subtotal ({quote.itemCount} item{quote.itemCount === 1 ? '' : 's'})</dt><dd>{rupees(quote.subtotal)}</dd></div>
        {quote.productSavings > 0 && !compact && <div className="muted"><dt>You already save vs MRP</dt><dd>{rupees(quote.productSavings)}</dd></div>}
        <div className={quote.offer ? 'summary__offer' : ''}>
          <dt>{quote.offer ? `🪔 ${quote.offer.couponCode ? `Coupon ${quote.offer.couponCode}` : quote.offer.name} (${quote.offer.label})` : 'Discount'}</dt>
          <dd>{quote.discount ? `−${rupees(quote.discount)}` : '—'}</dd>
        </div>
        <div><dt>Delivery{quote.country && quote.country !== 'IN' ? ` to ${countryName(quote.country)}` : quote.delivery_zone?.known ? ` (${quote.delivery_zone.label})` : ''}</dt><dd>{quote.delivery ? rupees(quote.delivery) : <span className="ok">FREE</span>}</dd></div>
        <div className="summary__total"><dt>TOTAL</dt><dd>{rupees(quote.total)}</dd></div>
      </dl>
      {m.fxRate && <p className="small muted">You'll pay <b>{formatRupees(quote.total)}</b> in Indian rupees; {m.currency} amounts are estimates at today's rate.</p>}
      {quote.zone && quote.country !== 'IN' && <p className="small muted">✈️ {quote.zone.delivery_text}. {quote.zone.duties_note}</p>}
      {quote.delivery > 0 && quote.freeDeliveryAbove > 0 && (
        <p className="small muted">Add {rupees(quote.freeDeliveryAbove - (quote.subtotal - quote.discount))} more for free delivery.</p>
      )}
      {quote.discount > 0 && <p className="summary__saved">🎉 You save {rupees(quote.discount + quote.productSavings)} on this order</p>}
      {children}
    </div>
  );
}

function Coupon() {
  const cart = useCart();
  const [code, setCode] = useState(cart.couponCode);
  const err = cart.quote?.couponError;
  return (
    <form className="coupon" onSubmit={(e) => { e.preventDefault(); cart.applyCoupon(code.trim().toUpperCase()); }}>
      <label htmlFor="coupon" className="small">Have a coupon code?</label>
      <div className="row gap-s">
        <input id="coupon" value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. WELCOME10" autoComplete="off" />
        {cart.couponCode ? <button type="button" className="btn btn--ghost" onClick={() => { setCode(''); cart.applyCoupon(''); }}>Remove</button> : <button className="btn btn--ghost">Apply</button>}
      </div>
      {cart.couponCode && (err ? <p className="field__error">{err}</p> : cart.quote?.offer?.couponCode ? <p className="ok small">✓ {cart.quote.offer.couponCode} applied</p> : null)}
    </form>
  );
}

/** "Save for later" list (kept in this browser) and cart-based suggestions. */
function useSavedForLater() {
  const [saved, setSaved] = useState(savedItems);
  const update = (list) => { setSavedItems(list); setSaved(list); };
  return { saved, update };
}
function useCartRecs(items) {
  const [r, setR] = useState(null);
  const key = items.map((i) => `${i.productId}x${i.qty}`).join(',');
  useEffect(() => {
    if (!items.length) { setR(null); return undefined; }
    const t = setTimeout(() => api.post('/cart/recommendations', { items }).then(setR).catch(() => setR(null)), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return r;
}

function SavedList({ saved, update, cart }) {
  const [products, setProducts] = useState({});
  const { fmt } = useMoney();
  const key = saved.map((s) => s.productId).join(',');
  useEffect(() => {
    if (!saved.length) return;
    // prices/images of saved products (the quote engine gives authoritative, current prices)
    api.post('/cart/quote', { items: saved.map((s) => ({ productId: s.productId, qty: 1 })) }).then((q) => setProducts(Object.fromEntries(q.lines.map((l) => [l.productId, l])))).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  if (!saved.length) return null;
  return (
    <section className="saved card">
      <h2>Saved for later ({saved.length} item{saved.length > 1 ? 's' : ''})</h2>
      <ul className="saved__list">
        {saved.map((s) => {
          const l = products[s.productId];
          return (
            <li key={s.productId} className="saved__item">
              {l ? <Link to={l.url} className="saved__img"><Media product={{ art: l.art, image: l.image, name: l.name }} /></Link> : <span className="saved__img" />}
              <div>
                {l ? <Link to={l.url} className="line__name">{l.name}</Link> : <span className="muted">Loading…</span>}
                {l && <p className="small"><b>{fmt(l.unitPrice)}</b> {l.mrp > l.unitPrice && <s className="muted">{fmt(l.mrp)}</s>}</p>}
                <div className="row gap-s">
                  <button className="btn btn--ghost btn--sm" onClick={() => { cart.add(s.productId, s.qty); update(saved.filter((x) => x.productId !== s.productId)); }}>Move to cart</button>
                  <button className="link-btn link" onClick={() => update(saved.filter((x) => x.productId !== s.productId))}>Delete</button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default function Cart() {
  const cart = useCart();
  const { fmt: rupees } = useMoney();
  const { offer } = useStore();
  const nav = useNavigate();
  const q = cart.quote;
  const { saved, update } = useSavedForLater();
  const recs = useCartRecs(cart.items);
  useSeo({ title: 'Your Cart | Utsav Ghar' });
  const saveForLater = (id) => {
    const qty = cart.qtyOf(id) || 1;
    update([{ productId: id, qty }, ...saved.filter((x) => x.productId !== id)]);
    cart.remove(id);
  };

  if (!cart.items.length) {
    return (
      <div className="container">
        <Empty heading="h1" icon="🛒" title="Your cart is empty" action={<Link to="/shop?collection=festival" className="btn btn--primary">🪔 Shop the festive collection</Link>}>
          {offer ? `${offer.headline}.` : 'Find something beautiful for your home.'}
        </Empty>
        <SavedList saved={saved} update={update} cart={cart} />
      </div>
    );
  }
  const lines = q?.lines || [];
  return (
    <div className="container cart">
      <h1>Your Cart <span aria-hidden="true">🛒</span></h1>
      {q?.errors?.map((e) => (
        <p key={e.productId + e.code} className="notice notice--warn">
          {e.message}{' '}
          {e.code === 'DOMESTIC_ONLY' && <button type="button" className="link" onClick={() => cart.remove(e.productId)}>Remove</button>}
        </p>
      ))}
      {q?.nudge && (
        <div className="nudge">
          <span className="nudge__diya" aria-hidden="true">🪔</span>
          <div>
            <b>{q.nudge.message}</b>
            <div className="meter__track"><div className="meter__fill" style={{ width: `${Math.max(8, 100 - (q.nudge.needed / ((q.progress?.find((x) => x.offerId === q.nudge.offerId)?.eligibleUnits || 0) + q.nudge.needed)) * 100)}%` }} /></div>
          </div>
          <Link to="/shop?offer=1" className="btn btn--gold">Add more →</Link>
        </div>
      )}
      {q?.offer && (
        <div className="nudge nudge--ok">
          <span aria-hidden="true">🎉</span>
          <b>{q.offer.label} unlocked — you save {rupees(q.discount)}!</b>
          {q.upsell && <span className="nudge__up">{q.upsell.message} <Link className="link" to="/shop?offer=1">Add more →</Link></span>}
        </div>
      )}
      <DeliveryNote />
      <div className="cart__grid">
        <ul className="cart__lines" aria-busy={cart.quoting}>
          {lines.map((l) => (
            <li key={l.productId} className="line">
              <Link to={l.url} className="line__img"><Media product={{ art: l.art, image: l.image, name: l.name }} /></Link>
              <div className="line__info">
                <Link to={l.url} className="line__name">{l.name}</Link>
                <p className="small muted">{rupees(l.unitPrice)} each {l.mrp > l.unitPrice && <s>{rupees(l.mrp)}</s>}</p>
                {l.offerEligible && <span className="tag tag--offer">Offer applied</span>}
                {!q?.offer && offer && isProductEligible(offer, { id: l.productId, category_id: l.category_id }) && <span className="tag tag--muted">Counts toward offer</span>}
              </div>
              <Qty small value={cart.qtyOf(l.productId)} onChange={(v) => cart.setQty(l.productId, v)} />
              <b className="line__total">{rupees(l.lineTotal)}</b>
              <button className="icon-btn" onClick={() => cart.remove(l.productId)} aria-label={`Remove ${l.name}`}><TrashIcon width={18} height={18} /></button>
              <button className="link-btn link line__save" onClick={() => saveForLater(l.productId)}>Save for later</button>
            </li>
          ))}
        </ul>
        <aside>
          <Summary quote={q}>
            <Coupon />
            <button className="btn btn--primary btn--lg btn--block" onClick={() => nav('/checkout')} disabled={!q || !q.lines.length || q.errors?.some((e) => e.code === 'DOMESTIC_ONLY')}>Proceed to Checkout →</button>
            <Link to="/shop" className="btn btn--ghost btn--block">Continue Shopping</Link>
            <p className="small muted center">🔒 Prices and offers are confirmed securely on our server.</p>
          </Summary>
        </aside>
      </div>
      <SavedList saved={saved} update={update} cart={cart} />
      {recs?.unlock?.items?.length > 0 && <ItemsRow title={`🎁 ${recs.unlock.message}`} sub="Easy add-ons that count toward the offer" items={recs.unlock.items} deal />}
      <ItemsRow title="Customers who bought items in your cart also bought" items={recs?.alsoBought} />
    </div>
  );
}
