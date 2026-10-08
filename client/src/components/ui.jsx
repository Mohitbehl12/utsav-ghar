import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { passwordScore } from '@shared/security.js';
import { StarIcon, CloseIcon, MinusIcon, PlusIcon } from './Icons.jsx';
import ProductArt from './ProductArt.jsx';
import { useMoney } from '../state/store.jsx';

export function Stars({ value = 0, count, size = 14 }) {
  return (
    <span className="stars" aria-label={`Rated ${value} out of 5`}>
      <span className="stars__row" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((i) => (
          <StarIcon key={i} width={size} height={size} className={value >= i - 0.25 ? 'on' : value >= i - 0.75 ? 'half' : ''} />
        ))}
      </span>
      <b>{Number(value).toFixed(1)}</b>
      {count != null && <span className="muted">({count.toLocaleString('en-IN')})</span>}
    </span>
  );
}

export function Price({ price, mrp, pct, size = 'md' }) {
  const { fmt } = useMoney();
  return (
    <span className={`price price--${size}`}>
      <b className="price__now">{fmt(price)}</b>
      {mrp > price && <s className="price__mrp">{fmt(mrp)}</s>}
      {pct > 0 && <span className="price__off">{pct}% OFF</span>}
    </span>
  );
}

/** Uploaded photo if present, otherwise the built-in illustration. */
export function Media({ product, variant = 0, eager = false, className = '' }) {
  const img = product?.images?.[variant] || (variant === 0 ? product?.images?.[0] : null) || (product?.image ? { url: product.image } : null);
  if (img?.url) {
    return <img className={`media ${className}`} src={img.url} alt={img.alt || product.name} loading={eager ? 'eager' : 'lazy'} decoding="async" />;
  }
  return <ProductArt art={product?.art} variant={variant} className={`media ${className}`} title={product?.name} />;
}

export function Pill({ tone = 'muted', children }) {
  return <span className={`pill pill--${tone}`}>{children}</span>;
}

export function Field({ label, error, hint, children, id }) {
  return (
    <label className={`field ${error ? 'field--err' : ''}`} htmlFor={id}>
      <span className="field__label">{label}</span>
      {children}
      {error ? <span className="field__error" role="alert">{error}</span> : hint ? <span className="field__hint">{hint}</span> : null}
    </label>
  );
}

export function Qty({ value, onChange, max = 99, small }) {
  return (
    <div className={`qty ${small ? 'qty--sm' : ''}`} role="group" aria-label="Quantity">
      <button type="button" onClick={() => onChange(value - 1)} aria-label="Decrease quantity"><MinusIcon width={16} height={16} /></button>
      <output aria-live="polite">{value}</output>
      <button type="button" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label="Increase quantity"><PlusIcon width={16} height={16} /></button>
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement;
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    ref.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      prev?.focus?.();
    };
  }, [open, onClose]);
  if (!open) return null;
  // Portal to <body>: parents with transforms/backdrop-filter (the sticky header) would otherwise trap position:fixed.
  return createPortal(
    <div className="modal" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal__panel ${wide ? 'modal__panel--wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}>
        <button className="modal__close icon-btn" onClick={onClose} aria-label="Close"><CloseIcon /></button>
        {children}
      </div>
    </div>,
    document.body
  );
}

export const Spinner = ({ label = 'Loading' }) => <span className="spinner" role="status" aria-label={label} />;

export function Empty({ icon = '🪔', title, children, action, heading = 'h3' }) {
  const H = heading;
  return (
    <div className="empty">
      <div className="empty__icon" aria-hidden="true">{icon}</div>
      <H className="empty__title">{title}</H>
      {children && <p className="muted">{children}</p>}
      {action}
    </div>
  );
}

export function SectionHead({ eyebrow, title, action, sub }) {
  return (
    <div className="section-head">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h2>{title}</h2>
        {sub && <p className="muted section-head__sub">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

/** Updates <title>, meta description, canonical and JSON-LD for client-side navigation. */
export function useSeo({ title, description, schema, image }) {
  useEffect(() => {
    if (title) document.title = title;
    const set = (sel, attr, key, val) => {
      if (!val) return;
      let el = document.head.querySelector(sel);
      if (!el) { el = document.createElement('meta'); el.setAttribute(attr, key); document.head.appendChild(el); }
      el.setAttribute('content', val);
    };
    set('meta[name="description"]', 'name', 'description', description);
    set('meta[property="og:title"]', 'property', 'og:title', title);
    set('meta[property="og:description"]', 'property', 'og:description', description);
    if (image) set('meta[property="og:image"]', 'property', 'og:image', image);
    let ld = document.getElementById('ld-page');
    if (schema) {
      if (!ld) { ld = document.createElement('script'); ld.type = 'application/ld+json'; ld.id = 'ld-page'; document.head.appendChild(ld); }
      ld.textContent = JSON.stringify(schema);
    } else if (ld) ld.remove();
  }, [title, description, schema, image]);
}

/** A thin toran-bead rule used between major sections. */
export const Divider = () => (
  <div className="toran-rule" aria-hidden="true">
    <span /><i /><span />
  </div>
);

/** Marketplace-style ranking badge: "#1 Best Seller" (by recent sales in its category) or "Utsav's Choice". */
export function RankBadge({ p, withCategory = false }) {
  if (p?.bsr?.rank === 1) {
    return <span className="rb rb--best" title={`#1 in ${p.bsr.category} by recent sales`}>#1 Best Seller{withCategory && <em> in {p.bsr.category}</em>}</span>;
  }
  if (p?.is_choice) return <span className="rb rb--choice" title="Highly rated, well priced and ready to ship">Utsav's <b>Choice</b></span>;
  return null;
}

/** "50+ bought in past month" — shown only when real orders support it. */
export function BoughtLine({ p }) {
  return p?.bought_label ? <p className="bought">{p.bought_label}</p> : null;
}

/**
 * Renders its children only when they come near the screen (saves work and
 * network on long pages, especially phones). Reserve `minHeight` to avoid jumps.
 */
export function LazyMount({ children, minHeight = 320, margin = '700px 0px' }) {
  const ref = useRef(null);
  const [on, setOn] = useState(() => typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    if (on || !ref.current) return undefined;
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { setOn(true); io.disconnect(); } }, { rootMargin: margin });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [on, margin]);
  return on ? children : <div ref={ref} className="lazy-slot" style={{ minHeight }} aria-hidden="true" />;
}

/** Password strength meter (0–4). */
export function Strength({ value }) {
  if (!value) return null;
  const s = passwordScore(value);
  const label = ['Very weak', 'Weak', 'Okay', 'Strong', 'Very strong'][s];
  return <span className={`pwmeter pwmeter--${s}`} aria-live="polite"><i style={{ width: `${(s + 1) * 20}%` }} />{label}</span>;
}
