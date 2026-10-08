import { useEffect, useRef, useState } from 'react';
import { useLiveStock } from '../lib/liveStock.js';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { fmtDate } from '../lib/format.js';
import { useAuth, useCart, useWishlist, useStore, useMoney, useToast } from '../state/store.jsx';
import { DeliveryNote } from '../components/Locale.jsx';
import { track } from '../lib/track.js';
import { recordView } from '../lib/history.js';
import { FrequentlyBought, CompareTable, ItemsRow } from '../components/Recs.jsx';
import { shareLink } from '../lib/native.js';
import { useAddToCart, stockLabel, ProductGrid } from '../components/ProductCard.jsx';
import { Media, Price, Stars, Qty, SectionHead, Empty, Spinner, useSeo, Field, RankBadge, BoughtLine } from '../components/ui.jsx';
import { HeartIcon, TruckIcon, ShieldIcon, StarIcon, ShareIcon } from '../components/Icons.jsx';

function Gallery({ product }) {
  const n = product.images.length ? product.images.length : 4;
  const [i, setI] = useState(0);
  useEffect(() => setI(0), [product.id]);
  return (
    <div className="gallery">
      <div className="gallery__main"><Media product={product} variant={i} eager /></div>
      <div className="gallery__thumbs" role="tablist" aria-label="Product images">
        {Array.from({ length: n }, (_, k) => (
          <button key={k} role="tab" aria-selected={k === i} className={k === i ? 'is-on' : ''} onClick={() => setI(k)} aria-label={`Image ${k + 1}`}>
            <Media product={product} variant={k} />
          </button>
        ))}
      </div>
    </div>
  );
}

/** Built-in ML: summarises approved reviews (sentiment per topic). Shown only with 2+ written reviews. */
function ReviewHighlights({ slug, count }) {
  const [s, setS] = useState(null);
  useEffect(() => { setS(null); if (count >= 2) api.get(`/products/${slug}/review-summary`).then((r) => setS(r.summary)).catch(() => {}); }, [slug, count]);
  if (!s) return null;
  return (
    <div className="rhl card" aria-label="Review highlights">
      <h3 className="rhl__h">✨ Review highlights</h3>
      <p>{s.text}</p>
      <div className="rhl__tags">
        {s.pros.map((x) => <span key={x.aspect} className="rhl__tag rhl__tag--pos">👍 {x.aspect} <small>({x.n})</small></span>)}
        {s.cons.map((x) => <span key={x.aspect} className="rhl__tag rhl__tag--neg">👎 {x.aspect} <small>({x.n})</small></span>)}
      </div>
      <p className="small muted">Generated automatically from {s.based_on} customer reviews.</p>
    </div>
  );
}

function ReviewForm({ product, onDone }) {
  const [rating, setRating] = useState(5);
  const [body, setBody] = useState('');
  const [file, setFile] = useState(null);
  const [state, setState] = useState({});
  const submit = async (e) => {
    e.preventDefault();
    setState({ busy: true });
    const fd = new FormData();
    fd.set('rating', String(rating));
    fd.set('body', body);
    if (file) fd.set('image', file);
    try {
      const r = await api.post(`/products/${product.id}/reviews`, fd);
      setState({ ok: r.message });
      onDone?.();
    } catch (err) {
      setState({ err: err.fields?.body || err.message });
    }
  };
  if (state.ok) return <p className="notice notice--ok">{state.ok}</p>;
  return (
    <form className="review-form card" onSubmit={submit}>
      <h3>Write a review</h3>
      <div className="rate-pick" role="radiogroup" aria-label="Your rating">
        {[1, 2, 3, 4, 5].map((n) => (
          <button type="button" key={n} role="radio" aria-checked={rating === n} className={n <= rating ? 'on' : ''} onClick={() => setRating(n)} aria-label={`${n} star${n > 1 ? 's' : ''}`}>
            <StarIcon width={26} height={26} />
          </button>
        ))}
      </div>
      <Field label="Your review" id="rv-body" error={state.err}>
        <textarea id="rv-body" rows={4} value={body} onChange={(e) => setBody(e.target.value)} placeholder="How did it look in your home? How was the quality?" />
      </Field>
      <Field label="Add a photo (optional)" id="rv-img" hint="JPG, PNG or WebP up to 5 MB">
        <input id="rv-img" type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setFile(e.target.files[0] || null)} />
      </Field>
      <button className="btn btn--primary" disabled={state.busy}>Submit review</button>
    </form>
  );
}

/** True once `ref` has scrolled out of view (used for the sticky buy bar on phones). */
function useOffscreen(ref) {
  const [off, setOff] = useState(false);
  useEffect(() => {
    if (!ref.current || typeof IntersectionObserver === 'undefined') return undefined;
    const io = new IntersectionObserver(([e]) => setOff(!e.isIntersecting && e.boundingClientRect.top < 0));
    io.observe(ref.current);
    return () => io.disconnect();
  });
  return off;
}

export default function Product() {
  const { slug } = useParams();
  const [data, setData] = useState(null);
  const [recs, setRecs] = useState(null);
  const [err, setErr] = useState(null);
  const [qty, setQty] = useState(1);
  const add = useAddToCart();
  const buyRef = useRef(null);
  const live = useLiveStock([data?.product?.id]);
  const showBar = useOffscreen(buyRef);
  const cart = useCart();
  const wish = useWishlist();
  const { user } = useAuth();
  const { settings } = useStore();
  const nav = useNavigate();
  const { fmt } = useMoney();
  const toast = useToast();

  useEffect(() => {
    setData(null); setErr(null); setQty(1);
    api.get(`/products/${slug}`).then((d) => { setData(d); recordView(d.product.id); track('view_item', { productId: d.product.id, name: d.product.name, value: d.product.price }); }).catch((e) => setErr(e));
    setRecs(null);
    api.get(`/products/${slug}/recommendations`).then(setRecs).catch(() => setRecs({}));
  }, [slug]);

  let p = data?.product;
  useSeo({
    title: p ? p.seo_title : 'Utsav Ghar',
    description: p?.seo_description,
    schema: p && {
      '@context': 'https://schema.org', '@type': 'Product', name: p.name, description: p.short_description, sku: `SA-${p.id}`,
      brand: { '@type': 'Brand', name: 'Utsav Ghar' }, category: p.category_name,
      aggregateRating: p.rating_count ? { '@type': 'AggregateRating', ratingValue: p.rating, reviewCount: p.rating_count } : undefined,
      offers: { '@type': 'Offer', priceCurrency: 'INR', price: (p.price / 100).toFixed(2), availability: p.stock_status === 'out_of_stock' ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock' },
    },
  });

  if (err) return <div className="container"><Empty icon="🪔" title="We couldn't find that product" action={<Link to="/shop" className="btn btn--primary">Browse the shop</Link>}>It may have been moved or is no longer available.</Empty></div>;
  if (!p) return <div className="container center pad"><Spinner /></div>;

  if (live[p.id] && (live[p.id].stock_status !== p.stock_status || live[p.id].stock_left !== (p.stock_left ?? null))) {
    p = { ...p, stock_status: live[p.id].stock_status, stock_left: live[p.id].stock_left ?? undefined };
  }
  const [label, tone] = stockLabel(p);
  const out = p.stock_status === 'out_of_stock';
  const offer = data.offer;
  const specs = Object.entries(p.specs || {}).filter(([k]) => k !== 'Delivery');
  const q = cart.quote;

  return (
    <div className="container pdp">
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link to="/">Home</Link><span>/</span><Link to={`/shop/${p.category_slug}`}>{p.category_name}</Link><span>/</span><span aria-current="page">{p.name}</span>
      </nav>
      <div className="pdp__grid">
        <Gallery product={p} />
        <div className="pdp__info">
          <p className="eyebrow">{p.category_name}</p>
          <h1>{p.name}</h1>
          <a href="#reviews" className="pdp__rating"><Stars value={p.rating} count={p.rating_count} /> <span className="muted">reviews</span></a>
          <div className="pdp__rank"><RankBadge p={p} withCategory /><BoughtLine p={p} /></div>
          {p.discount_pct > 0 && <p className="pdp__dealtag">Festive deal · {p.discount_pct}% off</p>}
          <p className="pdp__short">{p.short_description}</p>

          {p.offer_eligible && offer && (
            <div className="offer-box">
              <p className="offer-box__title">🎁 {offer.name}</p>
              <p><b>{offer.headline}</b> on eligible items.</p>
              {q?.offer ? <p className="offer-box__state ok">✓ {q.offer.label} unlocked in your cart{q.upsell ? ` · ${q.upsell.message}` : ''}</p> : q?.nudge ? <p className="offer-box__state">{q.nudge.message}</p> : null}
            </div>
          )}

          {p.is_bundle && p.bundle_items?.length > 0 && (
            <div className="combo-box">
              <p className="combo-box__title">🧺 What's in this combo</p>
              <ul>
                {p.bundle_items.map((b) => (
                  <li key={b.product_id}><Link className="link" to={b.url}>{b.name}</Link>{b.qty > 1 ? ` × ${b.qty}` : ''} <span className="muted">{fmt(b.price * b.qty)}</span></li>
                ))}
              </ul>
              <p className="combo-box__save">Worth {fmt(p.bundle_worth)} separately · <b>you save {fmt(p.bundle_worth - p.price)}</b></p>
            </div>
          )}
        </div>
        <aside className="buybox" aria-label="Buy">
            <Price price={p.price} mrp={p.mrp} pct={p.discount_pct} size="xl" />
            <p className="muted small">Inclusive of all taxes</p>
            <p className={`stock stock--${tone}`}>● {label}</p>
            <p className="buybox__eta">🚚 {(settings?.free_delivery_above && p.price >= settings.free_delivery_above) ? <b>FREE delivery</b> : <b>Delivery</b>} by <b>{new Date(Date.now() + 5 * 864e5).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</b></p>
            <DeliveryNote product={p} />

            <div className="pdp__buy" ref={buyRef}>
              <Qty value={qty} onChange={(v) => setQty(Math.max(1, v))} max={Math.min(10, p.stock_left ?? 10)} />
              <button className="btn btn--primary btn--lg" disabled={out} onClick={() => add(p, qty)}>Add to Cart</button>
              <button className="btn btn--gold btn--lg" disabled={out} onClick={() => { add(p, qty); nav('/checkout'); }}>Buy Now</button>
              <button className={`icon-btn icon-btn--outline ${wish.has(p.id) ? 'is-on' : ''}`} onClick={() => wish.toggle(p.id, p.name)} aria-pressed={wish.has(p.id)} aria-label="Wishlist"><HeartIcon /></button>
              <button className="icon-btn icon-btn--outline" aria-label="Share this product" onClick={async () => {
                const url = `${window.location.origin}${p.url}`;
                const r = await shareLink({ title: p.name, text: `${p.name} – ${fmt(p.price)} at Utsav Ghar`, url });
                if (r === 'copied') toast('Link copied — paste it in WhatsApp or Instagram');
              }}><ShareIcon /></button>
            </div>

            <ul className="pdp__assure">
              <li><TruckIcon /> <span><b>India: delivery in 3–6 days.</b> Free above ₹{((settings?.free_delivery_above || 0) / 100).toLocaleString('en-IN')}.{settings?.international_enabled ? ' We also ship worldwide.' : ''}</span></li>
              <li><ShieldIcon /> <span><b>Pay securely via UPI.</b> Dispatched after payment verification.</span></li>
            </ul>

            <dl className="buybox__meta"><div><dt>Ships from</dt><dd>Utsav Ghar</dd></div><div><dt>Sold by</dt><dd>Utsav Ghar</dd></div><div><dt>Payment</dt><dd>🔒 Secure UPI</dd></div></dl>
        </aside>
        <div className="pdp__more">
          <details className="acc" open>
            <summary>Product details</summary>
            <p>{p.description}</p>
          </details>
          <details className="acc" open>
            <summary>Specifications</summary>
            <table className="specs"><tbody>
              {specs.map(([k, v]) => <tr key={k}><th scope="row">{k}</th><td>{v}</td></tr>)}
              {p.bsr && <tr><th scope="row">Best Sellers Rank</th><td>#{p.bsr.rank} in <Link className="link" to={`/shop/${p.category_slug}?sort=bestsellers`}>{p.bsr.category}</Link></td></tr>}
              {p.rating_count > 0 && <tr><th scope="row">Customer reviews</th><td>{p.rating.toFixed(1)} out of 5 ({p.rating_count.toLocaleString('en-IN')} ratings)</td></tr>}
            </tbody></table>
          </details>
          <details className="acc">
            <summary>Delivery &amp; returns</summary>
            <p>{p.specs?.Delivery || 'Dispatched within 24–48 hours.'} Damaged or incorrect items can be returned within 7 days of delivery — see our <Link to="/returns">returns policy</Link>.</p>
          </details>
        </div>
      </div>

      {showBar && !out && (
        <div className="pdpbar" role="region" aria-label="Quick buy">
          <div className="pdpbar__info"><b>{fmt(p.price)}</b>{p.discount_pct > 0 && <span className="pdpbar__off">{p.discount_pct}% off</span>}<span className="pdpbar__name">{p.name}</span></div>
          <button className="btn btn--primary" onClick={() => add(p, qty)}>Add to Cart</button>
          <button className="btn btn--gold" onClick={() => { add(p, qty); nav('/checkout'); }}>Buy Now</button>
        </div>
      )}
      {recs && (
        <div className="pdp__recs">
          <FrequentlyBought product={p} items={recs.together} />
          <ItemsRow title="Customers who bought this item also bought" items={recs.alsoBought} />
          <ItemsRow title="Customers who viewed this item also viewed" items={recs.alsoViewed} />
          <CompareTable product={p} items={recs.similar} />
        </div>
      )}

      <section id="reviews" className="section">
        <SectionHead eyebrow="Reviews" title={`What customers say about the ${p.name}`} />
        <div className="pdp__reviews">
          <div className="pdp__score card">
            <b className="pdp__score-num">{Number(p.rating).toFixed(1)}</b>
            <Stars value={p.rating} />
            <p className="muted">{p.rating_count.toLocaleString('en-IN')} ratings</p>
            {user ? <ReviewForm product={p} /> : <p className="small"><Link to="/login" className="link">Sign in</Link> to review a product you've bought.</p>}
          </div>
          <div className="review-list">
            <ReviewHighlights slug={p.slug} count={data.reviews.length} />
            {data.reviews.length === 0 && <p className="muted">No written reviews yet.</p>}
            {data.reviews.map((r) => (
              <article key={r.id} className="review review--flat">
                <Stars value={r.rating} />
                <p>{r.body}</p>
                {r.image_url && <img src={r.image_url} alt={`Photo from ${r.author}`} className="review__img" loading="lazy" />}
                <p className="small muted"><b>{r.author}</b>{r.city ? `, ${r.city}` : ''} · {fmtDate(r.created_at)} {r.is_verified_purchase ? <span className="verified">✓ Verified purchase</span> : null}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {data.related.length > 0 && !recs?.alsoViewed?.length && (
        <section className="section">
          <SectionHead eyebrow="You may also like" title="From the same collection" />
          <ProductGrid products={data.related} />
        </section>
      )}
    </div>
  );
}
