import { haptic } from '../lib/native.js';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCart, useWishlist, useToast, useStore } from '../state/store.jsx';
import { Media, Price, Stars, Modal, Qty, RankBadge, BoughtLine } from './ui.jsx';
import { HeartIcon, EyeIcon, BagIcon } from './Icons.jsx';
import { track } from '../lib/track.js';

export function stockLabel(p) {
  if (p.stock_status === 'out_of_stock') return ['Out of stock', 'bad'];
  if (p.stock_status === 'low_stock') return [`Only ${p.stock_left} left`, 'warn'];
  return ['In stock', 'ok'];
}

export function useAddToCart() {
  const cart = useCart();
  const toast = useToast();
  const nav = useNavigate();
  return (p, qty = 1) => {
    cart.add(p.id, qty);
    haptic();
    track('add_to_cart', { productId: p.id, name: p.name, value: p.price * qty, items: [{ id: p.id, qty, price: p.price, name: p.name }] });
    toast(`🪔 ${p.name} added to cart`, 'ok', <button className="toast__action" onClick={() => nav('/cart')}>View cart</button>);
  };
}

export default function ProductCard({ product: p, priority = false }) {
  const wish = useWishlist();
  const add = useAddToCart();
  const { offer } = useStore();
  const [quick, setQuick] = useState(false);
  const [label, tone] = stockLabel(p);
  const out = p.stock_status === 'out_of_stock';
  return (
    <article className="pcard">
      <div className="pcard__media">
        <Link to={p.url} aria-label={p.name} tabIndex={-1}>
          <Media product={p} eager={priority} />
        </Link>
        <div className="pcard__badges">
          <RankBadge p={p} />
          {p.bsr?.rank !== 1 && !p.is_choice && p.is_new && <span className="tag tag--plum">New</span>}
          {p.offer_eligible && offer && <span className="tag tag--offer">{offer.tag}</span>}
          {p.is_bundle && <span className="tag tag--gold">Combo · save {Math.round((1 - p.price / (p.bundle_worth || p.mrp)) * 100)}%</span>}
        </div>
        <button className={`pcard__wish icon-btn ${wish.has(p.id) ? 'is-on' : ''}`} onClick={() => wish.toggle(p.id, p.name)} aria-pressed={wish.has(p.id)} aria-label={wish.has(p.id) ? 'Remove from wishlist' : 'Add to wishlist'}>
          <HeartIcon width={18} height={18} />
        </button>
        <button className="pcard__quick" onClick={() => setQuick(true)}><EyeIcon width={16} height={16} /> Quick view</button>
      </div>
      <div className="pcard__body">
        <p className="pcard__cat">{p.category_name}</p>
        {p.offer_eligible && offer && <p className="pcard__offer">🎁 {offer.tag}</p>}
        <h3 className="pcard__name"><Link to={p.url}>{p.name}</Link></h3>
        <p className="pcard__desc">{p.short_description}</p>
        <Stars value={p.rating} count={p.rating_count} />
        <BoughtLine p={p} />
        <Price price={p.price} mrp={p.mrp} pct={p.discount_pct} />
        <p className={`stock stock--${tone}`}>{label}</p>
        <button className="btn btn--primary btn--block pcard__add" disabled={out} onClick={() => add(p)}>
          <BagIcon width={18} height={18} /> {out ? 'Sold out' : 'Add to Cart'}
        </button>
      </div>
      <QuickView product={p} open={quick} onClose={() => setQuick(false)} />
    </article>
  );
}

export function QuickView({ product: p, open, onClose }) {
  const [qty, setQty] = useState(1);
  const add = useAddToCart();
  const { offer } = useStore();
  const [label, tone] = stockLabel(p);
  return (
    <Modal open={open} onClose={onClose} title={p.name} wide>
      <div className="quick">
        <div className="quick__media"><Media product={p} /></div>
        <div className="quick__info">
          <p className="eyebrow">{p.category_name}</p>
          <h2>{p.name}</h2>
          <Stars value={p.rating} count={p.rating_count} />
          <Price price={p.price} mrp={p.mrp} pct={p.discount_pct} size="lg" />
          <p>{p.short_description}</p>
          <p className={`stock stock--${tone}`}>{label}</p>
          {p.offer_eligible && offer && <p className="offer-note">🎁 {offer.headline}</p>}
          <div className="row gap-s">
            <Qty value={qty} onChange={(v) => setQty(Math.max(1, v))} />
            <button className="btn btn--primary" disabled={p.stock_status === 'out_of_stock'} onClick={() => { add(p, qty); onClose(); }}>Add to Cart</button>
          </div>
          <Link className="link" to={p.url} onClick={onClose}>View full details →</Link>
        </div>
      </div>
    </Modal>
  );
}

export function ProductGrid({ products, loading, cols }) {
  if (loading) {
    return (
      <div className="pgrid" style={cols ? { '--cols': cols } : undefined}>
        {Array.from({ length: 8 }, (_, i) => <div key={i} className="pcard pcard--skeleton" aria-hidden="true"><div className="sk sk--media" /><div className="sk" /><div className="sk sk--short" /></div>)}
      </div>
    );
  }
  return (
    <div className="pgrid" style={cols ? { '--cols': cols } : undefined}>
      {products.map((p, i) => <ProductCard key={p.id} product={p} priority={i < 4} />)}
    </div>
  );
}
