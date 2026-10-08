import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { api } from '../lib/api.js';
import { copyText } from '../lib/format.js';
import { useCart, useToast } from '../state/store.jsx';
import { CloseIcon } from './Icons.jsx';

const KEY = 'sa_welcome_seen';
const seenRecently = () => { try { return Date.now() - Number(localStorage.getItem(KEY) || 0) < 14 * 864e5; } catch { return true; } };
const markSeen = () => { try { localStorage.setItem(KEY, String(Date.now())); } catch { /* ignore */ } };

/**
 * A small corner card (not a blocking pop-up): email sign-up in exchange for the
 * first-order coupon. Appears once every 14 days, after 25 seconds, never on
 * checkout, cart, order or admin pages.
 */
export function WelcomeCard() {
  const [show, setShow] = useState(false);
  const [email, setEmail] = useState('');
  const [coupon, setCoupon] = useState(null);
  const [err, setErr] = useState('');
  const { pathname } = useLocation();
  const cart = useCart();
  const toast = useToast();
  const quiet = /^\/(checkout|cart|order|admin|login|register)/.test(pathname);

  useEffect(() => {
    if (quiet || seenRecently()) return;
    const t = setTimeout(() => setShow(true), 60000);
    return () => clearTimeout(t);
  }, [quiet]);

  if (!show || quiet) return null;
  const close = () => { markSeen(); setShow(false); };
  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    try {
      const r = await api.post('/newsletter', { email });
      markSeen();
      if (r.coupon) setCoupon(r.coupon); else { toast(r.message); setShow(false); }
    } catch (x) {
      setErr(x.fields?.email || x.message);
    }
  };
  return (
    <aside className="welcome" role="dialog" aria-label="Get 10% off your first order">
      <button className="icon-btn welcome__close" onClick={close} aria-label="Close"><CloseIcon width={18} height={18} /></button>
      {coupon ? (
        <>
          <p className="welcome__kicker">Your welcome gift</p>
          <p className="welcome__code"><code>{coupon.code}</code></p>
          <p className="small">{coupon.label} your first order{coupon.max_discount ? ` (up to ₹${coupon.max_discount / 100})` : ''}.</p>
          <div className="row gap-s">
            <button className="btn btn--primary btn--sm" onClick={() => { cart.applyCoupon(coupon.code); toast(`${coupon.code} added to your cart`); close(); }}>Apply to my cart</button>
            <button className="btn btn--ghost btn--sm" onClick={async () => toast((await copyText(coupon.code)) ? 'Code copied' : coupon.code)}>Copy code</button>
          </div>
        </>
      ) : (
        <form onSubmit={submit}>
          <p className="welcome__kicker">🪔 Festive letters</p>
          <p className="welcome__title">Get 10% off your first order</p>
          <p className="small muted">A reminder before each festival and early access to new collections. One or two emails a month.</p>
          <label htmlFor="welcome-email" className="sr-only">Email address</label>
          <div className="row gap-s">
            <input id="welcome-email" type="email" required placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            <button className="btn btn--gold btn--sm">Get code</button>
          </div>
          {err && <p className="field__error">{err}</p>}
        </form>
      )}
    </aside>
  );
}
