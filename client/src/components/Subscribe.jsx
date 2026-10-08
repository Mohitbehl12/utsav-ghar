/**
 * "Deals & festival alerts" sign-up — the only way a visitor's contact details
 * reach the customer database: they type them in, choose WhatsApp and/or email,
 * choose how often, and tick the consent box (never pre-ticked).
 */
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { SEGMENTS } from '@shared/festivals.js';
import { FREQUENCIES } from '@shared/crm.js';
import { api } from '../lib/api.js';
import { viewedIds } from '../lib/history.js';
import { useCart, useToast, useWishlist, useAuth, useLocale } from '../state/store.jsx';
import { CloseIcon } from './Icons.jsx';
import { copyText } from '../lib/format.js';

const SUB_KEY = 'ug_sub';
const ls = {
  get(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } },
};
export const subscription = () => ls.get(SUB_KEY);
export const rememberSubscription = (token) => token && ls.set(SUB_KEY, { token, at: Date.now(), synced: 0 });
export const openSubscribe = () => window.dispatchEvent(new CustomEvent('ug:subscribe'));

/** Keeps a subscriber's picks fresh: sends recently viewed / cart / wishlist ids at most once a day. */
export function useSignalSync() {
  const cart = useCart();
  const wish = useWishlist();
  const key = `${cart.items.map((i) => i.productId).join(',')}|${wish.ids.join(',')}`;
  useEffect(() => {
    const s = subscription();
    if (!s?.token || Date.now() - (s.synced || 0) < 20 * 36e5) return;
    const t = setTimeout(() => {
      api.post('/subscribe/signals', { token: s.token, viewed: viewedIds().slice(0, 30), cart: cart.items.map((i) => i.productId), wish: wish.ids })
        .then(() => ls.set(SUB_KEY, { ...s, synced: Date.now() })).catch(() => {});
    }, 4000);
    return () => clearTimeout(t);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
}

export function SubscribeForm({ source = 'popup', onDone, compact = false }) {
  const { user } = useAuth();
  const loc = useLocale();
  const cart = useCart();
  const wish = useWishlist();
  const india = (loc.country || 'IN') === 'IN';
  const [f, setF] = useState({ name: user?.name || '', phone: user?.phone || '', email: user?.email || '', wa: true, em: !!user?.email, frequency: 'daily', interests: [], consent: false, website: '' });
  const [errs, setErrs] = useState({});
  const [busy, setBusy] = useState(false);
  const [more, setMore] = useState(!compact);
  const upd = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const toggleInt = (slug) => setF((x) => ({ ...x, interests: x.interests.includes(slug) ? x.interests.filter((s) => s !== slug) : [...x.interests, slug] }));
  const submit = async (e) => {
    e.preventDefault();
    setErrs({});
    const fe = {};
    if (!f.wa && !f.em) fe.channels = 'Choose WhatsApp, email or both';
    if (f.wa && !f.phone.trim()) fe.phone = 'Enter your WhatsApp number';
    if (f.em && !f.email.trim()) fe.email = 'Enter your email';
    if (!f.consent) fe.consent = 'Please tick the box to agree';
    if (Object.keys(fe).length) { setErrs(fe); return; }
    setBusy(true);
    try {
      const r = await api.post('/subscribe', {
        name: f.name, phone: f.wa ? f.phone : '', email: f.em ? f.email : '', country: loc.country || 'IN',
        whatsapp_opt_in: f.wa, email_opt_in: f.em, frequency: f.frequency, interests: f.interests, consent: true, source,
        viewed: viewedIds().slice(0, 30), cart: cart.items.map((i) => i.productId), wish: wish.ids, website: f.website,
      });
      rememberSubscription(r.token);
      onDone?.(r);
    } catch (x) {
      setErrs({ ...x.fields, form: Object.keys(x.fields || {}).length ? '' : x.message });
    } finally { setBusy(false); }
  };
  return (
    <form className="subf" onSubmit={submit} noValidate>
      <fieldset className="subf__ch">
        <legend>Send me deals on</legend>
        <label className={`subf__pill ${f.wa ? 'is-on' : ''}`}><input type="checkbox" checked={f.wa} onChange={upd('wa')} /> 💬 WhatsApp</label>
        <label className={`subf__pill ${f.em ? 'is-on' : ''}`}><input type="checkbox" checked={f.em} onChange={upd('em')} /> ✉️ Email</label>
      </fieldset>
      {errs.channels && <p className="field__error" role="alert">{errs.channels}</p>}
      {f.wa && (
        <label className="subf__field"><span>WhatsApp number</span>
          <input type="tel" inputMode="tel" autoComplete="tel" placeholder={india ? '98765 43210' : '+971 50 123 4567'} value={f.phone} onChange={upd('phone')} aria-invalid={!!errs.phone} />
          {errs.phone && <em className="field__error" role="alert">{errs.phone}</em>}
        </label>
      )}
      {f.em && (
        <label className="subf__field"><span>Email</span>
          <input type="email" autoComplete="email" placeholder="you@example.com" value={f.email} onChange={upd('email')} aria-invalid={!!errs.email} />
          {errs.email && <em className="field__error" role="alert">{errs.email}</em>}
        </label>
      )}
      {more ? (
        <>
          <label className="subf__field"><span>Your name <small className="muted">(optional)</small></span>
            <input autoComplete="given-name" value={f.name} onChange={upd('name')} placeholder="So we can say Namaste 🙏" />
          </label>
          <fieldset className="subf__freq">
            <legend>How often?</legend>
            {FREQUENCIES.map((o) => (
              <label key={o.value} className={`subf__radio ${f.frequency === o.value ? 'is-on' : ''}`}>
                <input type="radio" name={`freq-${source}`} value={o.value} checked={f.frequency === o.value} onChange={upd('frequency')} /> {o.label}
              </label>
            ))}
            <p className="small muted">Festival alerts come with every option.</p>
          </fieldset>
          <fieldset className="subf__int">
            <legend>I'm interested in <small className="muted">(optional)</small></legend>
            <div className="subf__chips">
              {SEGMENTS.map((s) => (
                <button type="button" key={s.slug} className={`chip ${f.interests.includes(s.slug) ? 'chip--on' : ''}`} aria-pressed={f.interests.includes(s.slug)} onClick={() => toggleInt(s.slug)}>{s.icon} {s.name}</button>
              ))}
            </div>
          </fieldset>
        </>
      ) : <button type="button" className="link-btn link small" onClick={() => setMore(true)}>Choose how often & what you like ›</button>}
      <input className="hp" type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" value={f.website} onChange={upd('website')} />
      <label className="check subf__consent">
        <input type="checkbox" checked={f.consent} onChange={upd('consent')} />
        <span>I agree to get offers, festival alerts and product picks from Utsav Ghar on the channels above. I can change how often or stop any time (reply STOP or tap "Unsubscribe").</span>
      </label>
      {errs.consent && <p className="field__error" role="alert">{errs.consent}</p>}
      {errs.form && <p className="field__error" role="alert">{errs.form}</p>}
      <button className="btn btn--gold btn--block" disabled={busy}>{busy ? 'Saving…' : '🔔 Get my deals'}</button>
    </form>
  );
}

function Done({ r, onClose }) {
  const cart = useCart();
  const toast = useToast();
  return (
    <div className="subdone">
      <p className="subdone__big">🎉</p>
      <p className="subdone__title">{r.message}</p>
      {r.coupon && (
        <>
          <p className="small">Your welcome gift: <b>{r.coupon.label}</b> your first order</p>
          <p className="welcome__code"><code>{r.coupon.code}</code></p>
          <div className="row gap-s center">
            <button className="btn btn--primary btn--sm" onClick={() => { cart.applyCoupon(r.coupon.code); toast(`${r.coupon.code} added to your cart`); onClose(); }}>Apply to my cart</button>
            <button className="btn btn--ghost btn--sm" onClick={async () => toast((await copyText(r.coupon.code)) ? 'Code copied' : r.coupon.code)}>Copy code</button>
          </div>
        </>
      )}
      <p className="small muted">Every message has a link to change how often or stop.</p>
    </div>
  );
}

/** Pop-up sheet opened by openSubscribe() (footer button, account page, banners). */
export function SubscribeSheet() {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(null);
  useEffect(() => {
    const h = () => { setDone(null); setOpen(true); };
    window.addEventListener('ug:subscribe', h);
    return () => window.removeEventListener('ug:subscribe', h);
  }, []);
  useEffect(() => {
    if (!open) return;
    const esc = (e) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [open]);
  if (!open) return null;
  return (
    <div className="subsheet" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
      <div className="subsheet__panel" role="dialog" aria-modal="true" aria-label="Get deals and festival alerts">
        <button className="icon-btn subsheet__close" onClick={() => setOpen(false)} aria-label="Close"><CloseIcon /></button>
        {done ? <Done r={done} onClose={() => setOpen(false)} /> : (
          <>
            <p className="welcome__kicker">🔔 Deals & festival alerts</p>
            <h2 className="subsheet__title">Picks for you, on WhatsApp or email</h2>
            <p className="small muted">Products chosen from what you like, today's best deal, and a reminder before every festival — with a link that opens our app or website so you can buy in one tap.</p>
            <SubscribeForm source="popup" onDone={setDone} />
          </>
        )}
      </div>
    </div>
  );
}

const KEY = 'sa_welcome_seen';
const seenRecently = () => { try { return Date.now() - Number(localStorage.getItem(KEY) || 0) < 14 * 864e5; } catch { return true; } };
const markSeen = () => { try { localStorage.setItem(KEY, String(Date.now())); } catch { /* ignore */ } };

/**
 * A small corner card (not a blocking pop-up) inviting sign-up. Appears once every
 * 14 days after 30 seconds (or after 2 product views), never on checkout, cart,
 * order, login or admin pages, and never for people already subscribed.
 */
export function WelcomeCard() {
  const [show, setShow] = useState(false);
  const { pathname } = useLocation();
  // phones: never over a product page (the card would cover "Add to Cart"), nor in account / dealer / help pages
  const small = typeof window !== 'undefined' && window.innerWidth < 760;
  const quiet = /^\/(checkout|cart|order|admin|login|register|forgot-password|preferences|go|account|dealer|help|track)/.test(pathname) || (small && /^\/shop\/[^/]+\/[^/]+/.test(pathname));
  useEffect(() => {
    if (quiet || seenRecently() || subscription()) return;
    const t = setTimeout(() => setShow(true), viewedIds().length >= 2 ? 4000 : 30000);
    return () => clearTimeout(t);
  }, [quiet, pathname]);
  if (!show || quiet) return null;
  const close = () => { markSeen(); setShow(false); };
  return (
    <aside className="welcome" role="dialog" aria-label="Get deals and festival alerts">
      <button className="icon-btn welcome__close" onClick={close} aria-label="Close"><CloseIcon width={18} height={18} /></button>
      <p className="welcome__kicker">🔔 Deals & festival alerts</p>
      <p className="welcome__title">Get picks for you + 10% off your first order</p>
      <p className="small muted">On WhatsApp or email. Daily, weekly or only before festivals — you choose.</p>
      <button className="btn btn--gold btn--block" onClick={() => { markSeen(); setShow(false); openSubscribe(); }}>Yes, send me deals</button>
      <button className="link-btn small muted welcome__no" onClick={close}>No thanks</button>
    </aside>
  );
}
