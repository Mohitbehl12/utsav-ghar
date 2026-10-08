import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useCart, useStore, useWishlist, useAuth, useMotion, useMoney } from '../state/store.jsx';
import { CountryButton } from './Locale.jsx';
import { WelcomeCard, SubscribeSheet, openSubscribe, useSignalSync } from './Subscribe.jsx';
import { VoiceShop } from './VoiceShop.jsx';
import { ChatBot } from './ChatBot.jsx';
import { track } from '../lib/track.js';
import { isApp, openExternal } from '../lib/native.js';
import { api } from '../lib/api.js';
import { rupees } from '../lib/format.js';
import { computeQuote } from '@shared/pricing.js';
import { Media } from './ui.jsx';
import { AppHeader, AppTabBar, useIsApp } from './AppShell.jsx';
import { ZHeader, BackToTop } from './Storefront.jsx';
import { SEGMENTS } from '@shared/festivals.js';
import { BRAND } from '@shared/brand.js';
import {
  SearchIcon, HeartIcon, BagIcon, UserIcon, MenuIcon, CloseIcon, LogoMark, InstagramIcon, FacebookIcon, YoutubeIcon, SparkIcon,
} from './Icons.jsx';

// Main navigation: Home, the current festival's collection, the six store sections, offers.
export function useNav() {
  const { settings } = useStore();
  const name = settings?.festival_name || 'Festive';
  return [
    { to: '/', label: 'Home', icon: '🏠', end: true },
    { to: '/shop?collection=festival', label: `${name} Collection`, icon: settings?.festival_emoji || '🪔', festive: true },
    ...SEGMENTS.map((s) => ({ to: `/s/${s.slug}`, label: s.name, icon: s.icon })),
    { to: '/offers', label: 'Offers', icon: '🏷️' },
  ];
}

/** Worked example for the offer terms, computed with the real pricing engine. */
function offerExample(offer) {
  const prices = [49900, 69900, 39900];
  const products = new Map(prices.map((price, i) => [i + 1, { id: i + 1, name: `Item ${i + 1}`, slug: `x${i}`, price, mrp: price, category_id: 0, stock: 99, is_active: true }]));
  const q = computeQuote({ items: prices.map((_, i) => ({ productId: i + 1, qty: 1 })), products, offers: [{ ...offer, product_ids: [], category_ids: [], is_active: true, starts_at: null, ends_at: null, coupon_code: null }], settings: {} });
  return `Example: ₹499 + ₹699 + ₹399 = ₹1,597 → ${q.offer?.label || 'discount'} → you pay ${rupees(q.subtotal - q.discount)}.`;
}

export function OfferBar() {
  const { offer, settings } = useStore();
  const [open, setOpen] = useState(false);
  if (!offer) return null;
  const tiered = offer.discount_type === 'tiered';
  const cheapest = offer.discount_type === 'cheapest';
  return (
    <div className="offerbar">
      <div className="offerbar__inner container">
        <span className="offerbar__diya" aria-hidden="true">{settings?.festival_emoji || '🎁'}</span>
        <p>
          <span className="offerbar__kicker">{settings?.festival_name ? `${settings.festival_name} special offer` : 'Festive offer'}</span>
          <strong>{offer.headline}</strong>
        </p>
        <button className="offerbar__how" onClick={() => setOpen((o) => !o)} aria-expanded={open}>How it works</button>
        <Link to="/shop?offer=1" className="offerbar__cta">Shop the offer →</Link>
      </div>
      {open && (
        <div className="offerbar__terms container">
          <ol>
            <li>Add products marked <span className="tag tag--offer">{offer.tag}</span> to your cart. Quantities count, so 3 of the same diya counts as 3.</li>
            {tiered && <li>The more eligible items you add, the bigger the discount: <b>{offer.headline}</b>. It comes off the total of all eligible items.</li>}
            {cheapest && <li>For every {offer.min_qty} eligible items, the cheapest one is <b>{offer.discount_value}% off</b>.</li>}
            {!tiered && !cheapest && <li>{offer.label} is taken off the <b>total of all eligible items</b> once you have {offer.min_qty}.</li>}
            <li>{offer.max_discount ? `Maximum discount ${rupees(offer.max_discount)}. ` : ''}Items outside the offer are charged at their normal price. The discount appears automatically in your cart; it can't be combined with coupons, and you always get the better deal.</li>
            <li>{offer.ends_at ? `Valid until ${new Date(offer.ends_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long' })}. ` : ''}{offerExample(offer)}</li>
          </ol>
        </div>
      )}
    </div>
  );
}

const RECENT_KEY = 'ug_recent_q';
const recentGet = () => { try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch { return []; } };
const recentPut = (q) => { try { localStorage.setItem(RECENT_KEY, JSON.stringify([q, ...recentGet().filter((x) => x !== q)].slice(0, 6))); } catch { /* ignore */ } };
const recentClear = () => { try { localStorage.removeItem(RECENT_KEY); } catch { /* ignore */ } };
const POPULAR = ['diya', 'pooja thali', 'rangoli', 'fairy lights', 'toran', 'gift hamper', 'dinner set', 'kadhai', 'rakhi'];

/** Bold the part of `text` that matches what the shopper typed. */
function Hi({ text, q }) {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!words.length) return text;
  const parts = String(text).split(new RegExp(`(${words.join('|')})`, 'ig'));
  return parts.map((part, i) => (i % 2 ? <mark key={i}>{part}</mark> : part));
}


/**
 * Search with instant suggestions from the first letter: word completions,
 * matching departments and products, recent & popular searches, voice search.
 */
export function SearchBox({ onDone, autoFocus, category = '' }) {
  const [q, setQ] = useState('');
  const [res, setRes] = useState({ products: [], categories: [], completions: [] });
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [recent, setRecent] = useState(recentGet);
  const nav = useNavigate();
  const box = useRef(null);
  const input = useRef(null);
  const { fmt } = useMoney();
  const term = q.trim();

  useEffect(() => {
    if (!term) { setRes({ products: [], categories: [], completions: [] }); setLoading(false); return undefined; }
    setLoading(true);
    let live = true;
    const t = setTimeout(() => api.get(`/products/suggest?q=${encodeURIComponent(term)}`)
      .then((r) => { if (live) { setRes({ completions: [], ...r }); setLoading(false); } })
      .catch(() => live && setLoading(false)), 120);
    return () => { live = false; clearTimeout(t); };
  }, [term]);
  useEffect(() => {
    const off = (e) => !box.current?.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', off);
    document.addEventListener('touchstart', off, { passive: true });
    return () => { document.removeEventListener('mousedown', off); document.removeEventListener('touchstart', off); };
  }, []);

  const searchFor = (text) => {
    const t = String(text).trim();
    if (!t) return;
    recentPut(t); setRecent(recentGet());
    setOpen(false); setQ(''); onDone?.(); input.current?.blur();
    nav(`/shop?q=${encodeURIComponent(t)}${category ? `&category=${category}` : ''}`);
  };
  const go = (url) => { if (term) { recentPut(term); setRecent(recentGet()); } setOpen(false); setQ(''); onDone?.(); input.current?.blur(); nav(url); };

  // One list for keyboard navigation: completions first, then products.
  const comps = term ? (res.completions || []).slice(0, 5) : [];
  const options = [...comps.map((c) => ({ kind: 'q', c })), ...res.products.map((p) => ({ kind: 'p', p }))];
  const submit = (e) => {
    e.preventDefault();
    const o = options[active];
    if (o) return o.kind === 'q' ? searchFor(o.c) : go(o.p.url);
    if (term) searchFor(term);
    else if (category) go(`/shop/${category}`);
  };
  const show = open;
  return (
    <form className={`search ${show ? 'is-open' : ''}`} role="search" onSubmit={submit} ref={box}>
      <SearchIcon className="search__icon" width={18} height={18} />
      <button type="submit" className="search__go" aria-label="Search"><SearchIcon width={20} height={20} /></button>
      <input
        id="site-search" ref={input} type="text" inputMode="search" enterKeyHint="search" value={q} autoFocus={autoFocus} autoComplete="off" autoCorrect="off" spellCheck={false}
        placeholder="Search diyas, rangoli, pooja thali…" aria-label="Search products"
        onChange={(e) => { setQ(e.target.value); setOpen(true); setActive(-1); }}
        onFocus={() => { setOpen(true); setRecent(recentGet()); }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(options.length - 1, a + 1)); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(-1, a - 1)); }
          if (e.key === 'Escape') { setOpen(false); input.current?.blur(); }
        }}
        role="combobox" aria-expanded={show} aria-controls="search-list" aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `sopt-${active}` : undefined}
      />
      {q && <button type="button" className="search__clear" onClick={() => { setQ(''); input.current?.focus(); }} aria-label="Clear search">✕</button>}
      {!q && <button type="button" className="search__mic" onClick={() => { setOpen(false); window.dispatchEvent(new CustomEvent('ug:voice', { detail: { listen: true } })); }} aria-label="Shop by voice" title="Shop by voice">🎤</button>}
      {show && (
        <div className="search__panel" id="search-list" role="listbox" aria-label="Search suggestions">
          {!term ? (
            <>
              {recent.length > 0 && (
                <div className="search__sec">
                  <p className="search__h">Recent searches <button type="button" className="link-btn small" onClick={() => { recentClear(); setRecent([]); }}>Clear</button></p>
                  {recent.map((r) => <button type="button" key={r} className="search__q" onClick={() => searchFor(r)}><span aria-hidden="true">🕘</span> {r}</button>)}
                </div>
              )}
              <div className="search__sec">
                <p className="search__h">Popular right now</p>
                <div className="search__chips">{POPULAR.map((t) => <button type="button" key={t} className="chip" onClick={() => searchFor(t)}>{t}</button>)}</div>
              </div>
            </>
          ) : (
            <>
              {res.corrected && <p className="search__dym">Showing results for <b><i>{res.corrected}</i></b></p>}
              {comps.map((c, i) => (
                <button type="button" id={`sopt-${i}`} key={c} className={`search__q ${i === active ? 'is-active' : ''}`} onClick={() => searchFor(c)} role="option" aria-selected={i === active}>
                  <SearchIcon width={14} height={14} aria-hidden="true" /> <span><Hi text={c} q={term} /></span>
                </button>
              ))}
              {res.categories.length > 0 && (
                <div className="search__cats">
                  {res.categories.map((c) => <button type="button" key={c.slug} className="chip" onClick={() => go(`/shop/${c.slug}`)}>{c.icon} in {c.name}</button>)}
                </div>
              )}
              {res.products.map((p, j) => {
                const i = comps.length + j;
                return (
                  <button type="button" id={`sopt-${i}`} key={p.id} className={`search__item ${i === active ? 'is-active' : ''}`} onClick={() => go(p.url)} role="option" aria-selected={i === active}>
                    <span className="search__thumb"><Media product={p} /></span>
                    <span className="search__text"><b><Hi text={p.name} q={term} /></b><small>{p.category_name}{p.rating_count ? ` · ★ ${p.rating}` : ''}</small></span>
                    <span className="search__price">{fmt(p.price)}{p.discount_pct > 0 && <small>{p.discount_pct}% off</small>}</span>
                  </button>
                );
              })}
              {loading && !res.products.length && <p className="search__none">Searching…</p>}
              {!loading && !res.products.length && !comps.length && <p className="search__none">No matches for “{term}”. Try “diya”, “lights” or “gift”.</p>}
              <button className="search__all" type="submit">🔍 See all {res.total ? `${res.total} ` : ''}results for “{term}” →</button>
            </>
          )}
        </div>
      )}
    </form>
  );
}

export function Header() {
  const cart = useCart();
  const wish = useWishlist();
  const { user } = useAuth();
  const [menu, setMenu] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const NAV = useNav();
  const loc = useLocation();
  useEffect(() => { setMenu(false); setSearchOpen(false); }, [loc.pathname, loc.search]);
  const isActive = (to) => {
    const [p, s] = to.split('?');
    return loc.pathname === p && (s ? loc.search.includes(s) : !loc.search.includes('collection='));
  };

  return (
    <header className="header">
      <div className="header__top container">
        <button className="icon-btn header__menu" onClick={() => setMenu(true)} aria-label="Open menu"><MenuIcon /></button>
        <Link to="/" className="brand" aria-label={`${BRAND.name} home`}>
          <LogoMark />
          <span className="brand__text">
            <span className="brand__name">{BRAND.name}</span>
            <span className="brand__deva" lang="hi">{BRAND.name_hi}</span>
          </span>
        </Link>
        <div className="header__search"><SearchBox /></div>
        <nav className="header__icons" aria-label="Account">
          <CountryButton className="header__country" />
          <button className="icon-btn header__search-toggle" onClick={() => setSearchOpen((s) => !s)} aria-label="Search"><SearchIcon /></button>
          <Link to="/account/wishlist" className="icon-btn header__wish" aria-label={`Wishlist, ${wish.ids.length} items`}>
            <HeartIcon />{wish.ids.length > 0 && <span className="badge">{wish.ids.length}</span>}
          </Link>
          <Link to="/cart" className="icon-btn" aria-label={`Cart, ${cart.count} items`}>
            <BagIcon />{cart.count > 0 && <span className="badge badge--cart" key={cart.count}>{cart.count}</span>}
          </Link>
          <Link to={user ? '/account' : '/login'} className="icon-btn" aria-label={user ? 'My account' : 'Sign in'}><UserIcon /></Link>
        </nav>
      </div>
      {searchOpen && <div className="header__msearch container"><SearchBox autoFocus onDone={() => setSearchOpen(false)} /></div>}
      <nav className="header__nav" aria-label="Main">
        <ul className="container">
          {NAV.map((n) => (
            <li key={n.to}><NavLink to={n.to} end={n.end} className={() => `${isActive(n.to) ? 'active' : ''} ${n.festive ? 'navfeat' : ''}`}>{n.festive ? `${n.icon} ` : ''}{n.label}</NavLink></li>
          ))}
        </ul>
      </nav>
      {menu && createPortal(
        <div className="drawer" onMouseDown={(e) => e.target === e.currentTarget && setMenu(false)}>
          <div className="drawer__panel" role="dialog" aria-label="Menu">
            <div className="drawer__head">
              <span className="brand__name">{BRAND.name}</span>
              <button className="icon-btn" onClick={() => setMenu(false)} aria-label="Close menu"><CloseIcon /></button>
            </div>
            <ul className="drawer__nav">
              {NAV.map((n) => <li key={n.to}><Link to={n.to}><span aria-hidden="true">{n.icon}</span> {n.label}</Link></li>)}
            </ul>
            <ul className="drawer__nav drawer__nav--small">
              <li><Link to="/shop">Shop all products</Link></li>
              <li><Link to="/track">Track Order</Link></li>
              <li><Link to={user ? '/account' : '/login'}>{user ? 'My Account' : 'Sign in / Register'}</Link></li>
              <li><Link to="/admin">🔐 Store admin</Link></li>
            </ul>
          </div>
        </div>,
        document.body
      )}
    </header>
  );
}

export function Footer() {
  const { settings } = useStore();
  const motion = useMotion();
  return (
    <footer className="footer">
      <div className="footer__mandala" aria-hidden="true" />
      <div className="container footer__grid">
        <div className="footer__brand">
          <Link to="/" className="brand brand--light"><LogoMark /><span className="brand__text"><span className="brand__name">{BRAND.name}</span><span className="brand__deva" lang="hi">{BRAND.name_hi}</span></span></Link>
          <p>Décor, pooja essentials, crockery and kitchenware for every Indian festival, delivered across India.</p>
          <button className="btn btn--gold btn--sm footer__sub" onClick={openSubscribe}>🔔 Get deals on WhatsApp / email</button>
          {(settings?.app_store_url || settings?.play_store_url) && (
            <p className="footer__apps small">Get the app: {settings.app_store_url && <a href={settings.app_store_url} target="_blank" rel="noreferrer">iPhone</a>}{settings.app_store_url && settings.play_store_url && ' · '}{settings.play_store_url && <a href={settings.play_store_url} target="_blank" rel="noreferrer">Android</a>}</p>
          )}
          <div className="footer__social">
            <a href="https://instagram.com" target="_blank" rel="noreferrer" aria-label="Instagram"><InstagramIcon /></a>
            <a href="https://facebook.com" target="_blank" rel="noreferrer" aria-label="Facebook"><FacebookIcon /></a>
            <a href="https://youtube.com" target="_blank" rel="noreferrer" aria-label="YouTube"><YoutubeIcon /></a>
          </div>
        </div>
        <div>
          <h2 className="footer__h">Shop</h2>
          <ul>
            {SEGMENTS.map((x) => <li key={x.slug}><Link to={`/s/${x.slug}`}>{x.name}</Link></li>)}
            <li><Link to="/offers">Offers</Link></li>
          </ul>
        </div>
        <div>
          <h2 className="footer__h">Customer Service</h2>
          <ul>
            <li><Link to="/help">Help Center</Link></li>
            <li><Link to="/contact">Contact Us</Link></li>
            <li><Link to="/faq">FAQ</Link></li>
            <li><Link to="/shipping">Shipping</Link></li>
            <li><Link to="/returns">Returns &amp; Refunds</Link></li>
            <li><Link to="/track">Track Order</Link></li>
          </ul>
        </div>
        <div>
          <h2 className="footer__h">Company</h2>
          <ul>
            <li><Link to="/about">About Us</Link></li>
            <li><Link to="/privacy">Privacy Policy</Link></li>
            <li><Link to="/terms">Terms &amp; Conditions</Link></li>
            <li><Link to="/policies">All Policies</Link></li>
            <li><Link to="/help/manual">User Manual (English / हिंदी)</Link></li>
            <li><Link to="/admin" className="footer__admin">🔐 Admin login</Link></li>
            <li><Link to="/dealer" className="footer__admin">🏪 Dealer login</Link></li>
          </ul>
          {(settings?.support_phone || settings?.support_email) && (
            <p className="footer__contact">
              {settings.support_phone && <><a href={`tel:${settings.support_phone.replace(/[^\d+]/g, '')}`}>📞 {settings.support_phone}</a><br /></>}
              {(settings.whatsapp_number || settings.support_phone) && !(isSampleNumber(settings.whatsapp_number || settings.support_phone) && !__DEMO__) && <><a href={waLink(settings.whatsapp_number || settings.support_phone, 'Namaste! I have a question about Utsav Ghar.')} target="_blank" rel="noreferrer">💬 WhatsApp us</a><br /></>}
              {settings.support_email && <a href={`mailto:${settings.support_email}`}>✉️ {settings.support_email}</a>}
            </p>
          )}
        </div>
        <div>
          <h2 className="footer__h">We accept</h2>
          <div className="payicons" aria-label="Supported payment methods">
            {['UPI', 'Visa', 'Mastercard', 'RuPay', 'Amex', 'Net Banking', 'Wallets', 'EMI'].map((p) => <span key={p} className="payicon">{p}</span>)}
          </div>
          <p className="footer__secure">🔒 SSL-encrypted site · payments verified before dispatch</p>
        </div>
      </div>
      <div className="container footer__bottom">
        <span>© {new Date().getFullYear()} {BRAND.name}. Made with ❤️ in India.</span>
        <button className="link-btn" onClick={motion.toggle} aria-pressed={motion.reduced}>
          <SparkIcon width={16} height={16} /> {motion.reduced ? 'Turn animations on' : 'Reduce animations'}
        </button>
      </div>
    </footer>
  );
}

export const waLink = (phone, text) => {
  const d = String(phone || '').replace(/\D/g, '');
  return `https://wa.me/${d.length === 10 ? `91${d}` : d}?text=${encodeURIComponent(text)}`;
};

// The seeded example number is not a real WhatsApp account.
const SAMPLE_NUMBERS = new Set(['9876543210', '919876543210']);
export const isSampleNumber = (n) => SAMPLE_NUMBERS.has(String(n || '').replace(/\D/g, ''));

/**
 * Always-visible WhatsApp help button (bottom corner), hidden in checkout & admin.
 * Opens WhatsApp (app on phones, WhatsApp Web on computers). If the browser blocks
 * the new window, a small card shows the number and a direct link instead.
 */
export function ContactFab() {
  const { settings } = useStore();
  const { pathname } = useLocation();
  const [card, setCard] = useState(null);
  const number = settings?.whatsapp_number || settings?.support_phone;
  if (!number || /^\/(checkout|admin|order)/.test(pathname)) return null;
  const sample = isSampleNumber(number);
  if (sample && !__DEMO__) return null; // never send real customers to the example number
  const onPdp = /^\/shop\/[^/]+\/[^/]+/.test(pathname);
  const text = onPdp ? `Namaste! I have a question about this product: ${window.location.origin}${pathname}` : 'Namaste! I need help with Utsav Ghar.';
  const url = waLink(number, text);
  const open = async () => {
    if (sample) { setCard('sample'); return; }
    if (isApp()) { openExternal(url); return; }
    let w = null;
    try { w = window.open(url, '_blank'); } catch { /* blocked */ }
    if (w) { try { w.opener = null; } catch { /* ignore */ } } else setCard('blocked');
  };
  return (
    <>
      <button type="button" className="wafab" onClick={open} aria-label="Chat with us on WhatsApp">
        <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true"><path fill="currentColor" d="M16 3a13 13 0 0 0-11.2 19.6L3 29l6.6-1.7A13 13 0 1 0 16 3zm0 23.6a10.6 10.6 0 0 1-5.4-1.5l-.4-.2-3.9 1 1-3.8-.2-.4A10.6 10.6 0 1 1 16 26.6zm5.8-7.9c-.3-.2-1.9-.9-2.2-1s-.5-.2-.7.2-.8 1-1 1.2-.4.2-.7.1a8.7 8.7 0 0 1-4.3-3.8c-.3-.6.3-.5.9-1.7.1-.2 0-.4 0-.5l-1-2.4c-.3-.6-.5-.5-.7-.5h-.6a1.2 1.2 0 0 0-.9.4 3.6 3.6 0 0 0-1.1 2.7 6.3 6.3 0 0 0 1.3 3.3 14.4 14.4 0 0 0 5.5 4.9c2 .9 2.8.9 3.8.8a3.2 3.2 0 0 0 2.1-1.5 2.6 2.6 0 0 0 .2-1.5c-.1-.2-.3-.3-.6-.4z"/></svg>
        <span className="wafab__txt">Help</span>
      </button>
      {card && (
        <div className="wacard" role="dialog" aria-label="WhatsApp help">
          <button className="icon-btn wacard__x" onClick={() => setCard(null)} aria-label="Close"><CloseIcon width={16} height={16} /></button>
          {card === 'sample' ? (
            <>
              <p className="wacard__t">💬 WhatsApp Help (preview)</p>
              <p className="small">This preview uses an example number, so WhatsApp can't open a chat. Add your real WhatsApp number in <b>Admin → Payment &amp; Store → WhatsApp number for customer help</b> and this button will open a chat with you, with the product link already typed.</p>
            </>
          ) : (
            <>
              <p className="wacard__t">💬 Chat with us on WhatsApp</p>
              <p className="small">Your browser blocked the new window. Tap the link below, or message us on <b>{number}</b>.</p>
              <a className="btn btn--primary btn--sm" href={url} target="_top" rel="noreferrer">Open WhatsApp</a>
            </>
          )}
        </div>
      )}
    </>
  );
}

export function MobileCartBar() {
  const cart = useCart();
  const { fmt } = useMoney();
  const loc = useLocation();
  if (!cart.count || ['/cart', '/checkout'].includes(loc.pathname) || loc.pathname.startsWith('/order') || /^\/shop\/[^/]+\/[^/]+/.test(loc.pathname)) return null;
  return (
    <Link to="/cart" className="mcart">
      <span className="mcart__count"><BagIcon width={18} height={18} /> {cart.count} item{cart.count > 1 ? 's' : ''}</span>
      <span className="mcart__msg">{cart.quote?.upsell ? `🎉 ${cart.quote.offer.label} applied · ${cart.quote.upsell.message}` : cart.quote?.offer ? `🎉 ${cart.quote.offer.label} applied` : cart.quote?.nudge ? cart.quote.nudge.message : ''}</span>
      <span className="mcart__total">{cart.quote ? fmt(cart.quote.total) : ''} · View Cart →</span>
    </Link>
  );
}

export default function Layout() {
  const { pathname, search } = useLocation();
  const app = useIsApp();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  useSignalSync();
  useEffect(() => { const t = setTimeout(() => track('page_view'), 300); return () => clearTimeout(t); }, [pathname, search]);
  return (
    <>
      <a href="#main" className="skip">Skip to content</a>
      {app ? <AppHeader /> : <ZHeader />}
      <main id="main" className={app ? 'amain' : undefined}><Outlet /></main>
      {app ? <><AppTabBar /><WelcomeCard /></> : <><BackToTop /><Footer /><MobileCartBar /><WelcomeCard /></>}
      <SubscribeSheet />
      <VoiceShop />
      <ChatBot />
    </>
  );
}
