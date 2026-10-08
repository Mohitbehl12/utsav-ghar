import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { formatRupees } from '@shared/pricing.js';
import { guessCountry, currencyFor } from '../lib/countries.js';
import { captureAttribution, initTracking, setTrackingCountry } from '../lib/track.js';

const ls = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } },
};

// ---- Toasts -----------------------------------------------------------------
const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);
function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((msg, kind = 'ok', action) => {
    const id = Math.random();
    setToasts((t) => [...t.slice(-2), { id, msg, kind, action }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3800);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast--${t.kind}`}>
            <span>{t.msg}</span>
            {t.action}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

// ---- Store (settings, categories, headline offer) ---------------------------
const StoreCtx = createContext(null);
export const useStore = () => useContext(StoreCtx);
function StoreProvider({ children }) {
  const [state, setState] = useState({ settings: null, categories: [], offer: null, ready: false });
  const load = useCallback(async () => {
    const [settings, categories, offers] = await Promise.all([
      api.get('/settings/public').catch(() => ({})),
      api.get('/categories').catch(() => []),
      api.get('/offers/active').catch(() => ({})),
    ]);
    setState({ settings, categories, offer: offers.headline || null, ready: true });
  }, []);
  useEffect(() => { captureAttribution(); load(); }, [load]);
  return <StoreCtx.Provider value={{ ...state, reload: load }}>{children}</StoreCtx.Provider>;
}

// ---- Locale: delivery country + display currency --------------------------------
// Prices are always charged in INR; other currencies are shown as approximations
// using the rates set in Admin → Payment & Store.
const LocaleCtx = createContext(null);
export const useLocale = () => useContext(LocaleCtx);
function LocaleProvider({ children }) {
  const { settings } = useStore();
  const [country, setCountryState] = useState(() => ls.get('sa_country', null) || guessCountry());
  const intlOn = !!settings?.international_enabled;
  const effective = intlOn ? country : 'IN';
  const currency = effective === 'IN' ? 'INR' : currencyFor(effective);
  const rate = Number(settings?.fx_rates?.[currency]) || 0;
  const markup = 1 + (Number(settings?.fx_markup_pct) || 0) / 100;
  const showForeign = currency !== 'INR' && rate > 0;
  useEffect(() => { setTrackingCountry(effective); }, [effective]);
  useEffect(() => {
    if (settings) initTracking({ pixel: settings.meta_pixel_id, ga4: settings.ga4_measurement_id, country: effective });
  }, [settings]); // eslint-disable-line react-hooks/exhaustive-deps
  const value = useMemo(() => {
    const foreign = (paise) => new Intl.NumberFormat('en', { style: 'currency', currency, maximumFractionDigits: 2 }).format((paise / 100 / rate) * markup);
    const zones = settings?.shipping_zones || [];
    const zone = zones.find((z) => z.countries.includes(effective)) || zones.find((z) => z.countries.includes('*')) || null;
    return {
      country: effective,
      chosen: country,
      currency: showForeign ? currency : 'INR',
      international: effective !== 'IN',
      intlEnabled: intlOn,
      zone,
      fxRate: showForeign ? rate : null,
      setCountry(c) { setCountryState(c); ls.set('sa_country', c); },
      /** Main price display: local currency abroad, rupees in India. */
      fmt: (paise) => (showForeign ? foreign(paise) : formatRupees(paise)),
      /** For totals: "₹1,440 (≈ AED 57.31)" abroad. */
      fmtBoth: (paise) => (showForeign ? `${formatRupees(paise)} (≈ ${foreign(paise)})` : formatRupees(paise)),
      approx: (paise) => (showForeign ? foreign(paise) : null),
    };
  }, [country, effective, currency, rate, markup, showForeign, intlOn, settings]);
  return <LocaleCtx.Provider value={value}>{children}</LocaleCtx.Provider>;
}
export const useMoney = () => useLocale();

// ---- Auth ---------------------------------------------------------------------
const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);
function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined); // undefined = loading
  useEffect(() => { api.get('/auth/me').then((r) => setUser(r.user)).catch(() => setUser(null)); }, []);
  const value = useMemo(() => ({
    user,
    setUser,
    async login(email, password) { const r = await api.post('/auth/login', { email, password }); setUser(r.user); return r.user; },
    async register(body) { const r = await api.post('/auth/register', body); setUser(r.user); return r.user; },
    async logout() { await api.post('/auth/logout'); setUser(null); },
  }), [user]);
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

// ---- Cart -----------------------------------------------------------------------
// The browser stores only {productId, qty}. Every price, discount and total
// comes from POST /cart/quote, calculated by the server.
const CartCtx = createContext(null);
export const useCart = () => useContext(CartCtx);
function CartProvider({ children }) {
  const { user } = useAuth();
  const { country } = useLocale();
  const [items, setItems] = useState(() => ls.get('sa_cart', []));
  const [couponCode, setCouponCode] = useState(() => ls.get('sa_coupon', ''));
  const [pincode, setPincodeState] = useState(() => ls.get('sa_pin', ''));
  const [quote, setQuote] = useState(null);
  const [quoting, setQuoting] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const syncedFor = useRef(null);
  const seq = useRef(0);

  useEffect(() => { ls.set('sa_cart', items); ls.set('sa_coupon', couponCode); }, [items, couponCode]);

  // Merge guest cart with the saved server cart once per sign-in.
  useEffect(() => {
    if (!user || syncedFor.current === user.id) return;
    syncedFor.current = user.id;
    api.get('/account/cart').then((saved) => {
      setItems((local) => {
        const m = new Map(saved.items.map((i) => [i.productId, i.qty]));
        for (const i of local) m.set(i.productId, Math.max(m.get(i.productId) || 0, i.qty));
        return [...m].map(([productId, qty]) => ({ productId, qty }));
      });
      if (!couponCode && saved.couponCode) setCouponCode(saved.couponCode);
    }).catch(() => {});
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (user && syncedFor.current === user.id) {
      const t = setTimeout(() => api.put('/account/cart', { items, couponCode }).catch(() => {}), 600);
      return () => clearTimeout(t);
    }
  }, [items, couponCode, user]);

  const refresh = useCallback(async () => {
    const my = ++seq.current;
    setQuoting(true);
    try {
      const q = await api.post('/cart/quote', { items, couponCode, country, ...(country === 'IN' && /^[1-9]\d{5}$/.test(pincode) ? { pincode } : {}) });
      if (my !== seq.current) return;
      setQuote(q);
      // drop lines the server says are gone; clamp reduced quantities
      if (q.errors?.length) {
        setItems((cur) => {
          // India-only items stay in the cart (shown with a warning) so switching back to India keeps them
          const keep = new Set(q.errors.filter((e) => e.code === 'DOMESTIC_ONLY').map((e) => e.productId));
          const next = cur.filter((i) => keep.has(i.productId) || q.lines.some((l) => l.productId === i.productId)).map((i) => {
            const l = q.lines.find((x) => x.productId === i.productId);
            if (!l) return i;
            return l.qty !== i.qty ? { ...i, qty: l.qty } : i;
          });
          return JSON.stringify(next) === JSON.stringify(cur) ? cur : next;
        });
      }
    } catch {
      /* keep last quote */
    } finally {
      if (my === seq.current) setQuoting(false);
    }
  }, [items, couponCode, country, pincode]);

  useEffect(() => { const t = setTimeout(refresh, 150); return () => clearTimeout(t); }, [refresh]);
  // Live stock & prices: re-check the cart every 45 s while the tab is open, and when the shopper comes back to it.
  useEffect(() => {
    if (!items.length) return undefined;
    const tick = () => { if (!document.hidden) refresh(); };
    const t = setInterval(tick, 45000);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', tick); };
  }, [items.length, refresh]);

  // Restore a cart from an abandoned-cart reminder link: /cart?restore=<token>
  useEffect(() => {
    const m = (window.location.search + window.location.hash).match(/[?&]restore=([A-Za-z0-9_-]{16,64})/);
    if (!m) return;
    api.get(`/checkout/session/${m[1]}`).then((r) => { if (r.items?.length) setItems(r.items); }).catch(() => {});
  }, []);

  const value = useMemo(() => ({
    items, quote, quoting, couponCode, drawer, setDrawer, pincode,
    // delivery charge depends on the PIN code (zone)
    setPincode(p) { const v = String(p || '').replace(/\D/g, '').slice(0, 6); if (v === pincode) return; if (v.length === 6 || v === '') { setPincodeState(v); ls.set('sa_pin', v); } },
    count: items.reduce((s, i) => s + i.qty, 0),
    qtyOf: (id) => items.find((i) => i.productId === id)?.qty || 0,
    add(productId, qty = 1) {
      setItems((cur) => {
        const f = cur.find((i) => i.productId === productId);
        return f ? cur.map((i) => (i.productId === productId ? { ...i, qty: Math.min(99, i.qty + qty) } : i)) : [...cur, { productId, qty }];
      });
    },
    setQty(productId, qty) {
      setItems((cur) => (qty <= 0 ? cur.filter((i) => i.productId !== productId) : cur.map((i) => (i.productId === productId ? { ...i, qty: Math.min(99, qty) } : i))));
    },
    remove(productId) { setItems((cur) => cur.filter((i) => i.productId !== productId)); },
    clear() { setItems([]); setCouponCode(''); setQuote(null); },
    applyCoupon: setCouponCode,
    refresh,
  }), [items, quote, quoting, couponCode, drawer, refresh, pincode]);
  return <CartCtx.Provider value={value}>{children}</CartCtx.Provider>;
}

// ---- Wishlist ----------------------------------------------------------------------
const WishCtx = createContext(null);
export const useWishlist = () => useContext(WishCtx);
function WishlistProvider({ children }) {
  const { user } = useAuth();
  const [ids, setIds] = useState(() => ls.get('sa_wish', []));
  const toast = useToast();
  useEffect(() => {
    if (!user) return;
    // push guest hearts to the account, then load the account list
    const local = ls.get('sa_wish', []);
    Promise.all(local.map((productId) => api.post('/account/wishlist', { productId }).catch(() => {})))
      .then(() => api.get('/account/wishlist'))
      .then((list) => { setIds(list.map((p) => p.id)); ls.set('sa_wish', []); })
      .catch(() => {});
  }, [user]);
  useEffect(() => { if (!user) ls.set('sa_wish', ids); }, [ids, user]);
  const value = useMemo(() => ({
    ids,
    has: (id) => ids.includes(id),
    async toggle(id, name) {
      const on = ids.includes(id);
      setIds((cur) => (on ? cur.filter((x) => x !== id) : [...cur, id]));
      toast(on ? 'Removed from wishlist' : `❤️ ${name || 'Saved'} added to wishlist`);
      if (user) {
        try { on ? await api.del(`/account/wishlist/${id}`) : await api.post('/account/wishlist', { productId: id }); }
        catch { setIds((cur) => (on ? [...cur, id] : cur.filter((x) => x !== id))); }
      }
    },
  }), [ids, user, toast]);
  return <WishCtx.Provider value={value}>{children}</WishCtx.Provider>;
}

// ---- Motion preference (respects OS + user toggle) ----------------------------------
const MotionCtx = createContext({ reduced: false, toggle() {} });
export const useMotion = () => useContext(MotionCtx);
function MotionProvider({ children }) {
  const os = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Inside an embedded preview (e.g. the Claude viewer) start with animations off so the page stays light.
  const embedded = (() => { try { return window.self !== window.top; } catch { return true; } })();
  const [reduced, setReduced] = useState(() => ls.get('sa_reduce_motion', os || (__DEMO__ && embedded)));
  useEffect(() => { document.documentElement.dataset.motion = reduced ? 'reduced' : 'full'; ls.set('sa_reduce_motion', reduced); }, [reduced]);
  return <MotionCtx.Provider value={{ reduced, toggle: () => setReduced((r) => !r) }}>{children}</MotionCtx.Provider>;
}

export function AppProviders({ children }) {
  return (
    <MotionProvider>
      <ToastProvider>
        <StoreProvider>
          <LocaleProvider>
            <AuthProvider>
              <CartProvider>
                <WishlistProvider>{children}</WishlistProvider>
              </CartProvider>
            </AuthProvider>
          </LocaleProvider>
        </StoreProvider>
      </ToastProvider>
    </MotionProvider>
  );
}
