/**
 * Recommendation blocks: frequently bought together, compare similar items,
 * swipeable product rows, deal of the day, and the personal-picks hook.
 */
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { viewedIds, clearViewed } from '../lib/history.js';
import { useCart, useMoney, useToast, useWishlist, useAuth } from '../state/store.jsx';
import { useCountdown } from './Festive.jsx';
import { useAddToCart } from './ProductCard.jsx';
import { Media, Stars } from './ui.jsx';
import { RowCard } from './Storefront.jsx';
import { AppCard, useIsApp } from './AppShell.jsx';
import { ChevronIcon } from './Icons.jsx';
import { haptic } from '../lib/native.js';

/** Personal picks for the home page, based on this visitor's views, cart, wishlist and orders. */
export function usePersonalRecs() {
  const cart = useCart();
  const wish = useWishlist();
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [nonce, setNonce] = useState(0);
  const cartKey = cart.items.map((i) => i.productId).join(',');
  const wishKey = wish.ids.join(',');
  useEffect(() => {
    let live = true;
    const t = setTimeout(() => {
      api.post('/recommendations', { viewed: viewedIds(), cart: cart.items.map((i) => i.productId), wish: wish.ids })
        .then((r) => live && setData(r)).catch(() => live && setData({ forYou: [], recent: [], buyAgain: [], deal: null }));
    }, 200);
    return () => { live = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartKey, wishKey, user?.id, nonce]);
  return { ...(data || {}), loading: !data, clearHistory: () => { clearViewed(); setNonce((n) => n + 1); } };
}

/** A swipeable row of products (website look or app look). */
export function ItemsRow({ title, sub, items, to, more = 'See all', deal, action }) {
  const app = useIsApp();
  const ref = useRef(null);
  if (!items?.length) return null;
  if (app) {
    return (
      <section className="arail">
        <div className="arail__head"><div><h2>{title}</h2>{sub && <p>{sub}</p>}</div>{action || (to && <Link to={to} className="arail__all">{more}</Link>)}</div>
        <div className="arail__row">{items.map((p) => <AppCard key={p.id} p={p} />)}</div>
      </section>
    );
  }
  const scroll = (d) => ref.current?.scrollBy({ left: d * ref.current.clientWidth * 0.85, behavior: 'smooth' });
  return (
    <section className="zrow">
      <div className="zrow__head"><h2>{title}</h2>{sub && <span className="zrow__sub">{sub}</span>}{action || (to && <Link to={to} className="link">{more}</Link>)}</div>
      <div className="zrow__wrap">
        <button className="zrow__arrow zrow__arrow--prev" onClick={() => scroll(-1)} aria-label="Scroll left"><ChevronIcon /></button>
        <div className="zrow__track" ref={ref}>{items.map((p) => <RowCard key={p.id} p={p} deal={deal} />)}</div>
        <button className="zrow__arrow" onClick={() => scroll(1)} aria-label="Scroll right"><ChevronIcon /></button>
      </div>
    </section>
  );
}

/** "Frequently bought together": this item + up to two others, tick and add all at once. */
export function FrequentlyBought({ product, items }) {
  const cart = useCart();
  const toast = useToast();
  const { fmt } = useMoney();
  const all = [product, ...(items || [])].filter((p) => p.stock_status !== 'out_of_stock');
  const [on, setOn] = useState(() => new Set(all.map((p) => p.id)));
  useEffect(() => { setOn(new Set(all.map((p) => p.id))); }, [product.id, items?.map((p) => p.id).join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!items?.length) return null;
  const picked = all.filter((p) => on.has(p.id));
  const total = picked.reduce((s, p) => s + p.price, 0);
  const mrp = picked.reduce((s, p) => s + (p.mrp || p.price), 0);
  const toggle = (id) => setOn((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const addAll = () => {
    picked.forEach((p) => cart.add(p.id, 1));
    haptic('MEDIUM');
    toast(`🛒 ${picked.length} item${picked.length > 1 ? 's' : ''} added to cart`);
  };
  return (
    <section className="fbt">
      <h2>Frequently bought together</h2>
      <div className="fbt__body">
        <div className="fbt__imgs">
          {all.map((p, i) => (
            <span key={p.id} className="fbt__imgwrap">
              {i > 0 && <span className="fbt__plus" aria-hidden="true">+</span>}
              <Link to={p.url} className={`fbt__img ${on.has(p.id) ? '' : 'is-off'}`} aria-label={p.name}><Media product={p} /></Link>
            </span>
          ))}
        </div>
        <div className="fbt__buy">
          <p>Total price: <b>{fmt(total)}</b>{mrp > total && <s>{fmt(mrp)}</s>}</p>
          <button className="btn btn--gold" disabled={!picked.length} onClick={addAll}>
            {picked.length === all.length ? `Add all ${picked.length} to cart` : `Add ${picked.length} to cart`}
          </button>
          <p className="small muted">Adding more also counts toward the Buy More, Save More offer.</p>
        </div>
      </div>
      <ul className="fbt__list">
        {all.map((p, i) => (
          <li key={p.id}>
            <label className="check">
              <input type="checkbox" checked={on.has(p.id)} onChange={() => toggle(p.id)} />
              <span>{i === 0 ? <b>This item: </b> : null}<Link to={p.url} className="link">{p.name}</Link> <b className="fbt__price">{fmt(p.price)}</b></span>
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** "Compare with similar items" table. */
export function CompareTable({ product, items }) {
  const add = useAddToCart();
  const { fmt } = useMoney();
  if (!items?.length) return null;
  const cols = [product, ...items];
  const spec = (p, k) => p.specs?.[k] || '—';
  return (
    <section className="cmp">
      <h2>Compare with similar items</h2>
      <div className="cmp__wrap">
        <table className="cmp__table">
          <thead>
            <tr>
              <th scope="row" className="sr-only">Product</th>
              {cols.map((p, i) => (
                <th key={p.id} scope="col">
                  <Link to={p.url} className="cmp__img"><Media product={p} /></Link>
                  {i === 0 ? <span className="cmp__this">This item</span> : null}
                  <Link to={p.url} className="cmp__name">{p.name}</Link>
                  {i > 0 && <button className="zrc__add" onClick={() => add(p)} disabled={p.stock_status === 'out_of_stock'}>Add to cart</button>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr><th scope="row">Customer rating</th>{cols.map((p) => <td key={p.id}><Stars value={p.rating} count={p.rating_count} size={12} /></td>)}</tr>
            <tr><th scope="row">Price</th>{cols.map((p) => <td key={p.id}><b className="cmp__price">{fmt(p.price)}</b>{p.discount_pct > 0 && <span className="muted small"> ({p.discount_pct}% off)</span>}</td>)}</tr>
            <tr><th scope="row">Material</th>{cols.map((p) => <td key={p.id}>{spec(p, 'Material')}</td>)}</tr>
            <tr><th scope="row">Size</th>{cols.map((p) => <td key={p.id}>{spec(p, 'Dimensions')}</td>)}</tr>
            <tr><th scope="row">In the box</th>{cols.map((p) => <td key={p.id}>{spec(p, "What's included")}</td>)}</tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Deal of the day with a countdown to midnight (IST). */
export function DealOfDay({ deal }) {
  const add = useAddToCart();
  const { fmt } = useMoney();
  const end = (() => { const n = new Date(Date.now() + 5.5 * 36e5); n.setUTCHours(24, 0, 0, 0); return new Date(n.getTime() - 5.5 * 36e5).toISOString(); })();
  const t = useCountdown(end, 1);
  if (!deal) return null;
  const pad = (n) => String(n).padStart(2, '0');
  return (
    <section className="dotd">
      <div className="dotd__head">
        <h2>⚡ Deal of the day</h2>
        {t && <span className="dotd__timer" aria-label="Ends in">Ends in <b>{pad(t.h + t.d * 24)}:{pad(t.m)}:{pad(t.s)}</b></span>}
      </div>
      <div className="dotd__body">
        <Link to={deal.url} className="dotd__img"><Media product={deal} /></Link>
        <div className="dotd__info">
          <p className="zrc__deal"><span>{deal.discount_pct}% off</span> <em>Deal of the day</em></p>
          <Link to={deal.url} className="dotd__name">{deal.name}</Link>
          <Stars value={deal.rating} count={deal.rating_count} />
          <p className="dotd__price"><b>{fmt(deal.price)}</b> <s>M.R.P. {fmt(deal.mrp)}</s></p>
          <p className="small muted">{deal.short_description}</p>
          <div className="row gap-s">
            <button className="btn btn--gold" onClick={() => add(deal)} disabled={deal.stock_status === 'out_of_stock'}>Add to cart</button>
            <Link to={deal.url} className="btn btn--ghost">See details</Link>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Home-page recommendation block (website and app). */
export function PersonalRows({ withDeal = false }) {
  const r = usePersonalRecs();
  if (r.loading) return null;
  return (
    <>
      {withDeal && <DealOfDay deal={r.deal} />}
      {r.buyAgain?.length > 0 && <ItemsRow title="🔁 Buy it again" items={r.buyAgain} to="/account/orders" more="Your orders" />}
      <ItemsRow title={r.personal ? '✨ Inspired by your browsing history' : '✨ Recommended for you'} sub={r.personal ? 'Picked from what you looked at' : 'Popular right now'} items={r.forYou} />
      {r.recent?.length > 0 && <ItemsRow title="👀 Your recently viewed items" items={r.recent} action={<button className="link-btn link" onClick={r.clearHistory}>Clear history</button>} />}
    </>
  );
}
