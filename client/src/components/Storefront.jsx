/**
 * Marketplace-style website layout (big-store look): dark header with
 * delivery location, category search, account / orders / cart; a category
 * bar; a wide banner with a grid of cards over it; and swipeable deal rows.
 * Utsav Ghar's own name, logo and colours are used throughout.
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation } from 'react-router-dom';
import { SEGMENTS } from '@shared/festivals.js';
import { BRAND } from '@shared/brand.js';
import { api } from '../lib/api.js';
import { VoiceBanner } from './VoiceShop.jsx';
import { countryName } from '../lib/countries.js';
import { useAuth, useCart, useLocale, useMoney, useMotion, useStore, useWishlist } from '../state/store.jsx';
import { useAddToCart } from './ProductCard.jsx';
import { Media, Stars, useSeo, RankBadge, BoughtLine, LazyMount } from './ui.jsx';
import ProductArt from './ProductArt.jsx';
import HeroScene from './HeroScene.jsx';
import { FestivalChip } from './Festive.jsx';
import { CountryModal } from './Locale.jsx';
import { SearchBox, useNav } from './Layout.jsx';
import { PersonalRows } from './Recs.jsx';
import { BagIcon, BoxIcon, CloseIcon, LogoMark, MenuIcon, UserIcon, HeartIcon, ChevronIcon, ShieldIcon, TruckIcon, SparkIcon } from './Icons.jsx';
import FireworksVideo from './FireworksVideo.jsx';

/* ------------------------------------------------------------------ header */
export function ZHeader() {
  const { user } = useAuth();
  const cart = useCart();
  const wish = useWishlist();
  const loc = useLocale();
  const { categories, settings, offer } = useStore();
  const NAV = useNav();
  const where = useLocation();
  const [cat, setCat] = useState('');
  const [menu, setMenu] = useState(false);
  const [country, setCountry] = useState(false);
  const compact = useCompactOnScroll();
  useEffect(() => { setMenu(false); }, [where.pathname, where.search]);
  const first = user?.name?.split(' ')[0];
  return (
    <header className={`zh ${compact ? 'zh--compact' : ''}`}>
      <div className="zh__top">
        <button className="zh__icon zh__menu" onClick={() => setMenu(true)} aria-label="Open menu"><MenuIcon /></button>
        <Link to="/" className="zh__brand">
          <LogoMark size={34} />
          <span><b>{BRAND.name}</b><small>{BRAND.name_hi}</small></span>
        </Link>
        <button className="zh__box zh__loc" onClick={() => loc.intlEnabled && setCountry(true)} aria-label="Change delivery country">
          <span className="zh__pin" aria-hidden="true">📍</span>
          <span><small>Deliver to</small><b>{countryName(loc.country)}</b></span>
        </button>
        <div className="zh__search">
          <select aria-label="Search in" value={cat} onChange={(e) => setCat(e.target.value)}>
            <option value="">All</option>
            {categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
          </select>
          <SearchBox category={cat} />
        </div>
        <Link to={user ? '/account' : '/login'} className="zh__box zh__acct">
          <UserIcon /><span><small>{first ? `Hello, ${first}` : 'Sign in'}</small><b>Account</b></span>
        </Link>
        <Link to={user ? '/account/orders' : '/track'} className="zh__box zh__orders">
          <BoxIcon /><span><small>Track &amp; return</small><b>Orders</b></span>
        </Link>
        <Link to="/account/wishlist" className="zh__box zh__wish" aria-label={`Wishlist, ${wish.ids.length} items`}>
          <HeartIcon /><span className="zh__count">{wish.ids.length || ''}</span>
        </Link>
        <Link to="/cart" className="zh__box zh__cart" aria-label={`Cart, ${cart.count} items`}>
          <span className="zh__cartic"><BagIcon width={30} height={30} /><span className="zh__cartn" key={cart.count}>{cart.count}</span></span>
          <b>Cart</b>
        </Link>
        <Link to={user ? '/account' : '/login'} className="zh__icon zh__macct" aria-label="Account"><UserIcon /></Link>
        <button className="zh__mloc" onClick={() => loc.intlEnabled && setCountry(true)}>
          <span aria-hidden="true">📍</span><span>Deliver to <b>{countryName(loc.country)}</b></span>{loc.intlEnabled && <span aria-hidden="true">Change ›</span>}
        </button>
      </div>
      <nav className="zh__nav" aria-label="Main">
        <button className="zh__all" onClick={() => setMenu(true)}><MenuIcon width={18} height={18} /> All categories</button>
        {NAV.filter((n) => n.to !== '/').map((n) => (
          <Link key={n.to} to={n.to} className={n.festive ? 'is-fest' : ''}>{n.festive ? `${n.icon} ` : ''}{n.label}</Link>
        ))}
        <Link to="/track">Track Order</Link>
        <Link to="/help">Help</Link>
      </nav>
      {offer && (
        <Link to="/offers" className="zh__promo">
          <span aria-hidden="true">{settings?.festival_emoji || '🎁'}</span> <span className="zh__promo-t">{offer.headline}</span> <b>See offers ›</b>
        </Link>
      )}
      <CountryModal open={country} onClose={() => setCountry(false)} />
      {menu && createPortal(<AllMenu onClose={() => setMenu(false)} user={user} />, document.body)}
    </header>
  );
}

/** On phones the header shrinks to logo + search while scrolling down, and comes back on scroll up. */
function useCompactOnScroll() {
  const [c, setC] = useState(false);
  useEffect(() => {
    let last = window.scrollY; let raf = 0; let lock = 0; let cur = false;
    const flip = (v) => { if (v !== cur) { cur = v; lock = Date.now() + 250; setC(v); } };
    const on = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const y = window.scrollY;
        if (Date.now() < lock) { last = y; return; } // ignore the jump caused by the header itself resizing
        if (y < 140) flip(false);
        else if (y > last + 8) flip(true);
        else if (y < last - 8) flip(false);
        last = y;
      });
    };
    window.addEventListener('scroll', on, { passive: true });
    return () => { window.removeEventListener('scroll', on); cancelAnimationFrame(raf); };
  }, []);
  return c;
}

/** Left slide-in "All" menu, like a department list. */
function AllMenu({ onClose, user }) {
  const { categories, settings } = useStore();
  return (
    <div className="zall" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="zall__panel" role="dialog" aria-label="All departments">
        <div className="zall__head"><UserIcon /> Hello, {user?.name?.split(' ')[0] || <Link to="/login">sign in</Link>}</div>
        <button className="zall__close" onClick={onClose} aria-label="Close menu"><CloseIcon /></button>
        <div className="zall__body">
          <h3>Trending</h3>
          <Link to="/shop?collection=festival">{settings?.festival_emoji || '🪔'} {settings?.festival_name || 'Festive'} Collection</Link>
          <Link to="/shop?sort=bestsellers">Best Sellers</Link>
          <Link to="/shop?sort=newest">New Arrivals</Link>
          <Link to="/offers">Offers &amp; Coupons</Link>
          {SEGMENTS.map((s) => (
            <div key={s.slug}>
              <h3><Link to={`/s/${s.slug}`} className="zall__seg">{s.icon} {s.name} <span aria-hidden="true">›</span></Link></h3>
              {categories.filter((c) => c.segment === s.slug).map((c) => <Link key={c.slug} to={`/shop/${c.slug}`}>{c.name}</Link>)}
            </div>
          ))}
          <h3>Help &amp; Settings</h3>
          <Link to={user ? '/account' : '/login'}>Your Account</Link>
          <Link to="/track">Track Order</Link>
          <Link to="/returns">Returns &amp; Refunds</Link>
          <Link to="/help">Help Center</Link>
          <Link to="/admin">🔐 Store admin</Link>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ home */
function useProducts(query) {
  const [s, set] = useState({ items: [], loading: true });
  useEffect(() => {
    let live = true;
    api.get(`/products?${query}`).then((r) => live && set({ items: r.items, loading: false })).catch(() => live && set({ items: [], loading: false }));
    return () => { live = false; };
  }, [query]);
  return s;
}

function HeroCarousel() {
  const { settings, offer } = useStore();
  const { reduced } = useMotion();
  const [i, setI] = useState(0);
  const [seen, setSeen] = useState(() => new Set([0]));
  useEffect(() => { setSeen((x) => (x.has(i) ? x : new Set([...x, i]))); }, [i]);
  const name = settings?.festival_name || 'Diwali';
  const slides = [
    { key: 'fest', to: '/shop?collection=festival', cls: 'zs--fest', kicker: settings?.festival_date ? <FestivalChip name={name} date={settings.festival_date} emoji={settings.festival_emoji} /> : <span className="zs__kph" aria-hidden="true" />,
      title: settings?.festival_headline || `Celebrate ${name}`, sub: settings?.festival_subtitle, cta: `Shop ${name} Collection`, art: /diwali/i.test(name) ? <HeroScene /> : <ProductArt art={{ type: 'diya', tone: 'orange' }} bare /> },
    offer && { key: 'offer', to: '/shop?offer=1', cls: 'zs--offer', kicker: <span className="zs__tag">🔥 {offer.name}</span>,
      title: offer.discount_type === 'tiered' ? `Buy more, save up to ${offer.discount_value}%` : offer.label, sub: offer.headline, cta: 'Shop the offer',
      art: <div className="zs__duo"><ProductArt art={{ type: 'giftbox', tone: 'maroon' }} bare /><ProductArt art={{ type: 'hamper', tone: 'orange' }} bare /></div> },
    { key: 'dining', to: '/s/dining', cls: 'zs--dining', kicker: <span className="zs__tag">🍽️ Crockery &amp; Dining</span>, title: 'Set a beautiful table for guests', sub: 'Dinner sets, serving bowls, tea cups and glassware.', cta: 'Shop crockery',
      art: <div className="zs__duo"><ProductArt art={{ type: 'dinner-set', tone: 'cream' }} bare /><ProductArt art={{ type: 'cup-saucer', tone: 'teal' }} bare /></div> },
    { key: 'kitchen', to: '/s/kitchen', cls: 'zs--kitchen', kicker: <span className="zs__tag">🍳 Kitchen</span>, title: 'Festive cooking, sorted', sub: 'Kadhais, cookware, masala dabbas and storage jars.', cta: 'Shop kitchen',
      art: <div className="zs__duo"><ProductArt art={{ type: 'kadhai', tone: 'navy' }} bare /><ProductArt art={{ type: 'masala', tone: 'cream' }} bare /></div> },
  ].filter(Boolean);
  useEffect(() => {
    if (reduced) return undefined;
    const t = setInterval(() => { if (!document.hidden) setI((x) => (x + 1) % slides.length); }, 6000);
    return () => clearInterval(t);
  }, [slides.length, reduced, i]);
  const go = (d) => setI((x) => (x + d + slides.length) % slides.length);
  return (
    <section className="zhero" aria-roledescription="carousel" aria-label="Highlights">
      {slides.map((s, k) => (
        <Link key={s.key} to={s.to} className={`zs ${s.cls} ${k === i ? 'is-on' : ''}`} aria-hidden={k !== i} tabIndex={k === i ? 0 : -1}>
          <div className="zs__inner">
            <div className="zs__copy">
              {s.kicker}
              {k === 0 ? <h1>{s.title}</h1> : <p className="zs__h">{s.title}</p>}
              {s.sub && <p>{s.sub}</p>}
              <span className="zs__cta">{s.cta} →</span>
            </div>
            <div className="zs__art" aria-hidden="true">{seen.has(k) ? s.art : null}</div>
          </div>
        </Link>
      ))}
      <button className="zhero__arrow zhero__arrow--prev" onClick={() => go(-1)} aria-label="Previous slide"><ChevronIcon /></button>
      <button className="zhero__arrow zhero__arrow--next" onClick={() => go(1)} aria-label="Next slide"><ChevronIcon /></button>
      <div className="zhero__dots">{slides.map((s, k) => <button key={s.key} className={k === i ? 'is-on' : ''} onClick={() => setI(k)} aria-label={`Slide ${k + 1}`} aria-current={k === i} />)}</div>
    </section>
  );
}

/** Section heading used across the home page: small gold eyebrow, serif title, quiet "view all" link. */
function LuxHead({ eyebrow, title, to, more = 'View all', id }) {
  return (
    <div className="lhead">
      <div>
        {eyebrow && <p className="lhead__eyebrow">{eyebrow}</p>}
        <h2 id={id}>{title}</h2>
      </div>
      {to && <Link to={to} className="lhead__more">{more} <span aria-hidden="true">→</span></Link>}
    </div>
  );
}

/** Round category medallions — the quickest way into the store. */
function CategoryMedallions() {
  const { categories } = useStore();
  if (!categories.length) return null;
  return (
    <section className="lcats" aria-labelledby="lcats-h">
      <LuxHead eyebrow="Explore the store" title="Shop by category" to="/categories" more="All categories" id="lcats-h" />
      <div className="lcats__row">
        {categories.slice(0, 12).map((c) => (
          <Link key={c.slug} to={`/shop/${c.slug}`} className="lcat">
            <span className="lcat__img">{c.image_url ? <img src={c.image_url} alt="" loading="lazy" /> : <ProductArt art={c.art} bare />}</span>
            <span className="lcat__name">{c.name}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

const COLLECTIONS = [
  { key: 'pooja', to: '/s/pooja', eyebrow: 'The pooja room', title: 'Rituals, beautifully kept', text: 'Brass thalis, kalash, bells and temple incense for the evening aarti.', art: [{ type: 'thali', tone: 'gold' }, { type: 'kalash', tone: 'orange' }], tone: 'maroon' },
  { key: 'dining', to: '/s/dining', eyebrow: 'The festive table', title: 'Set a table to remember', text: 'Dinner sets, serveware and glassware for guests.', art: [{ type: 'dinner-set', tone: 'cream' }], tone: 'teal' },
  { key: 'gifts', to: '/s/gifts', eyebrow: 'The art of gifting', title: 'Hampers made to impress', text: 'Ready-to-give sets, dry-fruit boxes and combos.', art: [{ type: 'hamper', tone: 'orange' }], tone: 'plum' },
];

/** Three editorial collection tiles (one large, two stacked). */
function Collections() {
  return (
    <section className="lcoll" aria-labelledby="lcoll-h">
      <LuxHead eyebrow="Curated collections" title="Made for the moments that matter" id="lcoll-h" />
      <div className="lcoll__grid">
        {COLLECTIONS.map((c, k) => (
          <Link key={c.key} to={c.to} className={`lcol lcol--${c.tone} ${k === 0 ? 'lcol--big' : ''}`}>
            <span className="lcol__art" aria-hidden="true">{c.art.map((a, i) => <ProductArt key={i} art={a} bare />)}</span>
            <span className="lcol__copy">
              <span className="lcol__eyebrow">{c.eyebrow}</span>
              <span className="lcol__title">{c.title}</span>
              <span className="lcol__text">{c.text}</span>
              <span className="lcol__cta">Explore <span aria-hidden="true">→</span></span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

/** Slim row of promises right under the hero. */
function Promises() {
  const { settings } = useStore();
  const free = (settings?.free_delivery_above || 0) / 100;
  return (
    <ul className="ztrust" aria-label="Why shop with us">
      <li><ShieldIcon /><b>Secure UPI payment</b><small>GPay, PhonePe, Paytm</small></li>
      <li><TruckIcon /><b>Delivery in 3–6 days</b><small>{free ? `Free above ₹${free.toLocaleString('en-IN')}` : 'Tracked across India'}</small></li>
      <li><BoxIcon /><b>7-day returns</b><small>Damaged or wrong item? We fix it</small></li>
      <li><SparkIcon /><b>Artisan-made</b><small>Brass, copper and clay from across India</small></li>
    </ul>
  );
}

export function RowCard({ p, deal }) {
  const add = useAddToCart();
  const { fmt } = useMoney();
  const [whole] = fmt(p.price).split('.');
  return (
    <div className="zrc">
      <Link to={p.url} className="zrc__img"><Media product={p} /></Link>
      {deal && p.discount_pct > 0 && <p className="zrc__deal"><span>{p.discount_pct}% off</span> <em>Festive deal</em></p>}
      <RankBadge p={p} />
      <Link to={p.url} className="zrc__name">{p.name}</Link>
      {p.rating_count > 0 && <Stars value={p.rating} count={p.rating_count} size={12} />}
      <BoughtLine p={p} />
      <p className="zrc__price"><b>{whole}</b>{p.mrp > p.price && <> <s>M.R.P. {fmt(p.mrp)}</s></>}</p>
      <button className="zrc__add" onClick={() => add(p)} disabled={p.stock_status === 'out_of_stock'}>{p.stock_status === 'out_of_stock' ? 'Sold out' : 'Add to cart'}</button>
    </div>
  );
}

function Row({ eyebrow, title, query, to, deal, more = 'View all' }) {
  const { items, loading } = useProducts(query);
  const ref = useRef(null);
  const scroll = (d) => ref.current?.scrollBy({ left: d * ref.current.clientWidth * 0.85, behavior: 'smooth' });
  if (!loading && !items.length) return null;
  return (
    <section className="zrow">
      <LuxHead eyebrow={eyebrow} title={title} to={to} more={more} />
      <div className="zrow__wrap">
        <button className="zrow__arrow zrow__arrow--prev" onClick={() => scroll(-1)} aria-label="Scroll left"><ChevronIcon /></button>
        <div className="zrow__track" ref={ref}>
          {loading ? Array.from({ length: 6 }, (_, k) => <div key={k} className="zrc zrc--sk" />) : items.map((p) => <RowCard key={p.id} p={p} deal={deal} />)}
        </div>
        <button className="zrow__arrow" onClick={() => scroll(1)} aria-label="Scroll right"><ChevronIcon /></button>
      </div>
    </section>
  );
}

/** Social proof: real, approved customer reviews (hidden until there are some). */
function HomeReviews() {
  const [list, setList] = useState(null);
  useEffect(() => { api.get('/reviews/featured').then(setList).catch(() => setList([])); }, []);
  if (!list?.length) return null;
  const avg = list.reduce((a, r) => a + r.rating, 0) / list.length;
  return (
    <section className="zrev" aria-labelledby="zrev-h">
      <div className="zrev__head">
        <p className="lhead__eyebrow">Loved by our customers</p><h2 id="zrev-h">Homes we have helped celebrate</h2>
        <p className="zrev__sum"><Stars value={avg} size={14} /> <b>{avg.toFixed(1)} out of 5</b> from verified buyers</p>
      </div>
      <div className="zrev__track">
        {list.map((r) => (
          <figure key={r.id} className="zrev__card">
            <Stars value={r.rating} size={13} />
            <blockquote>“{r.body}”</blockquote>
            <figcaption><span><b>{r.author}</b>{r.city ? `, ${r.city}` : ''}</span>{r.is_verified_purchase ? <span className="zrev__ver">✔ Verified purchase</span> : null}
              <Link to={`/shop/${r.category_slug}/${r.product_slug}`} className="link small">{r.product_name}</Link></figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}

function FestNight({ name }) {
  return (
    <section className="zfest" aria-label={`${name} night`}>
      <FireworksVideo title={`${name} night`} />
      <div>
        <p className="lhead__eyebrow">The {name} night</p><h2>Roshni se bhar do iss {name}</h2>
        <p>Diyas, string lights, rangoli and lanterns: everything to make your home sparkle on the big night.</p>
        <div className="zfest__ctas">
          <Link to="/shop/diwali-lights" className="btn btn--gold">Shop festive lights</Link>
          <Link to="/shop/diyas-candles" className="btn btn--ghost-light">Diyas &amp; candles</Link>
        </div>
        <p className="zfest__note">Celebrate safely: keep water nearby and choose green crackers where allowed.</p>
      </div>
    </section>
  );
}

export function ZHome() {
  const { settings } = useStore();
  const name = settings?.festival_name || 'Diwali';
  useSeo({
    title: `${BRAND.name} – ${name} Décor, Pooja, Crockery & Kitchen Online`,
    description: `Shop ${name} décor, diyas, pooja essentials, gifts, crockery and kitchenware. Pay securely with UPI, delivered across India.`,
    schema: { '@context': 'https://schema.org', '@type': 'Store', name: BRAND.name, description: BRAND.tagline },
  });
  return (
    <div className="zhome">
      <HeroCarousel />
      <Promises />
      <div className="zhome__body">
        <CategoryMedallions />
        <Collections />
        <PersonalRows withDeal />
        <FestNight name={name} />
        <LazyMount minHeight={380}><Row eyebrow="Limited time" title="Today's festive deals" query="sort=discount&inStock=1&limit=16" to="/shop?sort=discount" deal more="All deals" /></LazyMount>
        <LazyMount minHeight={380}><Row eyebrow={`The ${name} edit`} title={`Best sellers for ${name}`} query="flag=diwali&sort=bestsellers&limit=16" to="/shop?collection=festival" /></LazyMount>
        <VoiceBanner />
        <LazyMount minHeight={380}><Row eyebrow="More for less" title="Combos & ready sets" query="category=combos&limit=12" to="/shop/combos" deal /></LazyMount>
        <LazyMount minHeight={380}><Row eyebrow="Crockery & dining" title="For the festive table" query="segment=dining&sort=rating&limit=16" to="/s/dining" /></LazyMount>
        <LazyMount minHeight={380}><Row eyebrow="Kitchen" title="Kitchen best sellers" query="segment=kitchen&sort=bestsellers&limit=16" to="/s/kitchen" /></LazyMount>
        <LazyMount minHeight={380}><Row eyebrow="Just arrived" title="New arrivals" query="flag=new&sort=newest&limit=16" to="/shop?sort=newest" /></LazyMount>
        <LazyMount minHeight={360}><HomeReviews /></LazyMount>
      </div>
    </div>
  );
}

export function BackToTop() {
  return <button className="zbtt" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>Back to top</button>;
}
