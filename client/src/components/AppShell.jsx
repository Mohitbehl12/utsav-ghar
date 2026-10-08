/**
 * Shopping-app layout used inside the Utsav Ghar iPhone / Android app:
 * compact header with search, bottom tab bar, banner carousel, round category
 * icons and swipeable product rows. The website keeps its normal layout.
 */
import { VoiceBanner } from './VoiceShop.jsx';
import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { SEGMENTS } from '@shared/festivals.js';
import { BRAND } from '@shared/brand.js';
import { api } from '../lib/api.js';
import { isApp } from '../lib/native.js';
import { useCart, useStore, useWishlist, useAuth, useMoney, useMotion } from '../state/store.jsx';
import { useAddToCart } from './ProductCard.jsx';
import { Media, Stars, useSeo, RankBadge, BoughtLine } from './ui.jsx';
import ProductArt from './ProductArt.jsx';
import HeroScene from './HeroScene.jsx';
import { FestivalChip } from './Festive.jsx';
import { SearchBox } from './Layout.jsx';
import { PersonalRows } from './Recs.jsx';
import { HomeIcon, GridIcon, TagIcon, BagIcon, UserIcon, HeartIcon, BackIcon, LogoMark, PlusIcon } from './Icons.jsx';

export const useIsApp = () => isApp();

const TAB_ROOTS = ['/', '/categories', '/offers', '/cart', '/account', '/login'];
// Screens where the bottom tabs make way for their own sticky action bar.
const hideTabs = (path) => /^\/shop\/[^/]+\/[^/]+/.test(path) || path.startsWith('/checkout') || path.startsWith('/order');

export function AppHeader() {
  const loc = useLocation();
  const nav = useNavigate();
  const wish = useWishlist();
  const { settings } = useStore();
  const root = TAB_ROOTS.includes(loc.pathname);
  return (
    <header className="ahdr">
      <div className="ahdr__row">
        {root ? (
          <Link to="/" className="ahdr__brand" aria-label={`${BRAND.name} home`}>
            <LogoMark size={30} />
            <span><b>{BRAND.name}</b><small>{settings?.festival_emoji || '🪔'} {settings?.festival_name ? `${settings.festival_name} store` : 'Festive store'}</small></span>
          </Link>
        ) : (
          <button className="ahdr__back" onClick={() => (window.history.length > 1 ? nav(-1) : nav('/'))} aria-label="Back"><BackIcon /></button>
        )}
        {!root && <Link to="/" className="ahdr__title"><LogoMark size={24} /> {BRAND.name}</Link>}
        <Link to="/account/wishlist" className="ahdr__icon" aria-label={`Wishlist, ${wish.ids.length} items`}>
          <HeartIcon />{wish.ids.length > 0 && <span className="abadge">{wish.ids.length}</span>}
        </Link>
      </div>
      {!hideTabs(loc.pathname) && <div className="ahdr__search"><SearchBox /></div>}
    </header>
  );
}

export function AppTabBar() {
  const loc = useLocation();
  const cart = useCart();
  const { user } = useAuth();
  if (hideTabs(loc.pathname)) return null;
  const tabs = [
    { to: '/', label: 'Home', icon: HomeIcon, end: true },
    { to: '/categories', label: 'Categories', icon: GridIcon },
    { to: '/offers', label: 'Offers', icon: TagIcon },
    { to: '/cart', label: 'Cart', icon: BagIcon, badge: cart.count },
    { to: user ? '/account' : '/login', label: 'Account', icon: UserIcon },
  ];
  return (
    <nav className="atabs" aria-label="App">
      {tabs.map(({ to, label, icon: Icon, end, badge }) => (
        <NavLink key={label} to={to} end={end} className={({ isActive }) => `atabs__tab ${isActive ? 'is-on' : ''}`}>
          <span className="atabs__icon"><Icon width={22} height={22} />{badge > 0 && <span className="abadge" key={badge}>{badge}</span>}</span>
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

function useProducts(query) {
  const [s, set] = useState({ items: [], loading: true });
  useEffect(() => {
    let live = true;
    api.get(`/products?${query}`).then((r) => live && set({ items: r.items, loading: false })).catch(() => live && set({ items: [], loading: false }));
    return () => { live = false; };
  }, [query]);
  return s;
}

/** Compact product card for swipeable rows. */
export function AppCard({ p }) {
  const add = useAddToCart();
  const { fmt } = useMoney();
  const out = p.stock_status === 'out_of_stock';
  return (
    <article className="acard">
      <Link to={p.url} className="acard__media" aria-label={p.name}>
        <Media product={p} />
        {p.discount_pct > 0 && <span className="acard__off">{p.discount_pct}% OFF</span>}
      </Link>
      <div className="acard__body">
        <RankBadge p={p} />
        <Link to={p.url} className="acard__name">{p.name}</Link>
        {p.rating_count > 0 && <Stars value={p.rating} count={p.rating_count} size={11} />}
        <BoughtLine p={p} />
        <div className="acard__price">
          <b>{fmt(p.price)}</b>
          {p.mrp > p.price && <s>{fmt(p.mrp)}</s>}
        </div>
      </div>
      <button className="acard__add" disabled={out} onClick={() => add(p)} aria-label={`Add ${p.name} to cart`}>
        {out ? 'Sold out' : <><PlusIcon width={16} height={16} /> Add</>}
      </button>
    </article>
  );
}

function AppRail({ title, sub, query, link }) {
  const { items, loading } = useProducts(query);
  if (!loading && !items.length) return null;
  return (
    <section className="arail">
      <div className="arail__head">
        <div><h2>{title}</h2>{sub && <p>{sub}</p>}</div>
        <Link to={link} className="arail__all">See all</Link>
      </div>
      <div className="arail__row">
        {loading ? Array.from({ length: 4 }, (_, i) => <div key={i} className="acard acard--sk" />) : items.map((p) => <AppCard key={p.id} p={p} />)}
      </div>
    </section>
  );
}

/** Swipeable banners with dots; moves on by itself unless the visitor prefers less motion. */
function Banners() {
  const { settings, offer } = useStore();
  const { reduced } = useMotion();
  const ref = useRef(null);
  const [i, setI] = useState(0);
  const name = settings?.festival_name || 'Diwali';
  const slides = [
    { key: 'fest', to: '/shop?collection=festival', cls: 'aban--fest', kicker: settings?.festival_date ? <FestivalChip name={name} date={settings.festival_date} emoji={settings.festival_emoji} /> : null,
      title: settings?.festival_headline || `Celebrate ${name}`, cta: `Shop ${name}`, art: /diwali/i.test(name) ? <HeroScene /> : <ProductArt art={{ type: 'diya', tone: 'orange' }} bare /> },
    offer && { key: 'offer', to: '/shop?offer=1', cls: 'aban--offer', kicker: <span className="aban__tag">🔥 {offer.name}</span>,
      title: offer.discount_type === 'tiered' ? `Up to ${offer.discount_value}% OFF` : offer.label, sub: offer.headline, cta: 'Shop the offer', art: <ProductArt art={{ type: 'giftbox', tone: 'maroon' }} bare /> },
    { key: 'combo', to: '/shop/combos', cls: 'aban--combo', kicker: <span className="aban__tag">🧺 Combos</span>, title: 'Ready-made festive sets', sub: 'Everything in one box, for less', cta: 'See combos', art: <ProductArt art={{ type: 'hamper', tone: 'orange' }} bare /> },
    { key: 'dining', to: '/s/dining', cls: 'aban--dining', kicker: <span className="aban__tag">🍽️ Crockery</span>, title: 'Set the table for guests', sub: 'Dinner sets, bowls & tea cups', cta: 'Shop crockery', art: <ProductArt art={{ type: 'dinner-set', tone: 'cream' }} bare /> },
    { key: 'kitchen', to: '/s/kitchen', cls: 'aban--kitchen', kicker: <span className="aban__tag">🍳 Kitchen</span>, title: 'Festive cooking, sorted', sub: 'Kadhais, masala dabbas & jars', cta: 'Shop kitchen', art: <ProductArt art={{ type: 'kadhai', tone: 'navy' }} bare /> },
  ].filter(Boolean);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const onScroll = () => setI(Math.round(el.scrollLeft / el.clientWidth));
    el.addEventListener('scroll', onScroll, { passive: true });
    let paused = false;
    const pause = () => { paused = true; };
    el.addEventListener('touchstart', pause, { passive: true });
    const t = reduced ? null : setInterval(() => {
      if (paused || document.hidden) return;
      const next = (Math.round(el.scrollLeft / el.clientWidth) + 1) % slides.length;
      el.scrollTo({ left: next * el.clientWidth, behavior: 'smooth' });
    }, 4500);
    return () => { el.removeEventListener('scroll', onScroll); el.removeEventListener('touchstart', pause); if (t) clearInterval(t); };
  }, [slides.length, reduced]);
  return (
    <section className="abans" aria-roledescription="carousel" aria-label="Highlights">
      <div className="abans__track" ref={ref}>
        {slides.map((s) => (
          <Link key={s.key} to={s.to} className={`aban ${s.cls}`}>
            <div className="aban__copy">
              {s.kicker}
              <h2>{s.title}</h2>
              {s.sub && <p>{s.sub}</p>}
              <span className="aban__cta">{s.cta} →</span>
            </div>
            <div className="aban__art" aria-hidden="true">{s.art}</div>
          </Link>
        ))}
      </div>
      <div className="abans__dots" aria-hidden="true">{slides.map((s, k) => <span key={s.key} className={k === i ? 'is-on' : ''} />)}</div>
    </section>
  );
}

function CategoryCircles() {
  const { categories } = useStore();
  return (
    <section className="acircles" aria-label="Categories">
      <div className="acircles__row">
        <Link to="/shop?collection=festival" className="acircle acircle--fest"><span className="acircle__img">🪔</span><span>Festive picks</span></Link>
        {categories.map((c) => (
          <Link key={c.slug} to={`/shop/${c.slug}`} className="acircle">
            <span className="acircle__img">{c.image_url ? <img src={c.image_url} alt="" /> : <ProductArt art={c.art} bare />}</span>
            <span>{c.name}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function OfferMeter() {
  const { offer } = useStore();
  const cart = useCart();
  const { fmt } = useMoney();
  if (!offer || offer.discount_type !== 'tiered') return null;
  const tiers = [...(offer.tiers || [])].sort((a, b) => a.min_qty - b.min_qty);
  const have = cart.quote?.progress?.find((x) => x.offerId === offer.id)?.eligibleUnits || 0;
  const next = tiers.find((t) => have < t.min_qty);
  return (
    <Link to="/shop?offer=1" className="ameter">
      <div className="ameter__tiers">
        {tiers.map((t) => <span key={t.min_qty} className={have >= t.min_qty ? 'is-on' : ''}><b>{t.percent}%</b><small>Buy {t.min_qty}</small></span>)}
      </div>
      <p>{cart.quote?.offer && !next ? <>🎉 Top discount unlocked · saving <b>{fmt(cart.quote.discount)}</b></>
        : next ? <>Add <b>{next.min_qty - have}</b> more eligible item{next.min_qty - have === 1 ? '' : 's'} for <b>{next.percent}% OFF</b> →</> : null}</p>
    </Link>
  );
}

export function AppHome() {
  const { settings, categories } = useStore();
  const name = settings?.festival_name || 'Diwali';
  useSeo({ title: `${BRAND.name} – ${name} Décor, Pooja, Crockery & Kitchen` });
  const count = (seg) => categories.filter((c) => c.segment === seg).reduce((a, c) => a + (c.product_count || 0), 0);
  return (
    <div className="ahome">
      <Banners />
      <CategoryCircles />
      <OfferMeter />
      <VoiceBanner />
      <PersonalRows />
      <AppRail title={`${settings?.festival_emoji || '🪔'} ${name} picks`} sub="Handpicked for the festival" query="flag=diwali&sort=popular&limit=10" link="/shop?collection=festival" />
      <AppRail title="🧺 Combos" sub="Save more with ready-made sets" query="category=combos&limit=10" link="/shop/combos" />
      <section className="asegs" aria-label="Shop by section">
        <h2>Shop by section</h2>
        <div className="asegs__grid">
          {SEGMENTS.map((s) => (
            <Link key={s.slug} to={`/s/${s.slug}`} className="aseg" style={{ '--sc': s.theme.primary, '--sc-dark': s.theme.dark }}>
              <span className="aseg__art" aria-hidden="true"><ProductArt art={s.art[0]} bare /></span>
              <b>{s.name}</b><small>{count(s.slug)} items</small>
            </Link>
          ))}
        </div>
      </section>
      <AppRail title="⭐ Best sellers" query="sort=bestsellers&limit=10" link="/shop?sort=bestsellers" />
      <AppRail title="🍽️ Crockery & dining" query="segment=dining&sort=popular&limit=10" link="/s/dining" />
      <AppRail title="🍳 Kitchen" query="segment=kitchen&sort=popular&limit=10" link="/s/kitchen" />
      <AppRail title="🛕 Pooja essentials" query="segment=pooja&limit=10" link="/s/pooja" />
      <AppRail title="✨ New arrivals" query="flag=new&sort=newest&limit=10" link="/shop?sort=newest" />
      <ul className="atrust">
        <li><span>🔒</span>Secure UPI payment</li>
        <li><span>🚚</span>Delivery in 3–6 days</li>
        <li><span>↩️</span>7-day easy returns</li>
      </ul>
    </div>
  );
}

const HELP = [['/track', '📦', 'Track my order'], ['/faq', '❓', 'Help & FAQ'], ['/contact', '💬', 'Contact us'], ['/shipping', '🚚', 'Shipping'], ['/returns', '↩️', 'Returns & refunds'], ['/about', '🪔', `About ${BRAND.name}`], ['/privacy', '🔒', 'Privacy policy'], ['/terms', '📄', 'Terms & conditions'], ['/policies', '📚', 'All policies'], ['/admin', '🔐', 'Store admin']];

/** "Categories" tab: sections on the left, their categories on the right. Also works on the website. */
export function CategoriesPage() {
  const { categories } = useStore();
  const [seg, setSeg] = useState(SEGMENTS[0].slug);
  useSeo({ title: `Categories | ${BRAND.name}` });
  const s = SEGMENTS.find((x) => x.slug === seg);
  const cats = categories.filter((c) => c.segment === seg);
  return (
    <div className="acats">
      <div className="acats__body">
        <nav className="acats__side" aria-label="Sections">
          {SEGMENTS.map((x) => (
            <button key={x.slug} className={x.slug === seg ? 'is-on' : ''} onClick={() => setSeg(x.slug)} aria-pressed={x.slug === seg}>
              <span aria-hidden="true">{x.icon}</span>{x.name}
            </button>
          ))}
        </nav>
        <section className="acats__main" aria-label={s.name}>
          <Link to={`/s/${s.slug}`} className="acats__hero" style={{ '--sc': s.theme.primary, '--sc-dark': s.theme.dark }}>
            <span><b>{s.name}</b><small>{s.tagline}</small><em>View all →</em></span>
            <ProductArt art={s.art[0]} bare />
          </Link>
          <div className="acats__grid">
            {cats.map((c) => (
              <Link key={c.slug} to={`/shop/${c.slug}`} className="acircle">
                <span className="acircle__img">{c.image_url ? <img src={c.image_url} alt="" /> : <ProductArt art={c.art} bare />}</span>
                <span>{c.name}</span>
              </Link>
            ))}
          </div>
        </section>
      </div>
      <ul className="ahelp">
        {HELP.map(([to, icon, label]) => <li key={to}><Link to={to}><span aria-hidden="true">{icon}</span>{label}<i aria-hidden="true">›</i></Link></li>)}
      </ul>
    </div>
  );
}
