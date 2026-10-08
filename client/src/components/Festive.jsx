import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../state/store.jsx';

/** A hanging marigold-and-mango-leaf toran that tiles across any width (drawn in CSS: .garland). */
export const Garland = ({ className = '' }) => <div className={`garland ${className}`} aria-hidden="true" />;

function diff(target) {
  const ms = Math.max(0, new Date(target).getTime() - Date.now());
  return { ms, d: Math.floor(ms / 864e5), h: Math.floor((ms / 36e5) % 24), m: Math.floor((ms / 6e4) % 60), s: Math.floor((ms / 1e3) % 60) };
}

export function useCountdown(target, everySec = 1) {
  const [t, setT] = useState(() => (target ? diff(target) : null));
  useEffect(() => {
    if (!target) return;
    setT(diff(target));
    const id = setInterval(() => setT(diff(target)), everySec * 1000);
    return () => clearInterval(id);
  }, [target, everySec]);
  return t;
}

/** "Diwali in 43 days" chip. Name, emoji and date come from Admin → Payment & Store → Current festival. */
export function FestivalChip({ name = 'Diwali', date, emoji = '🪔' }) {
  const t = useCountdown(date ? `${date}T18:00:00+05:30` : null, 60);
  if (!t) return null;
  const when = new Date(`${date}T12:00:00+05:30`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
  if (t.ms === 0) return <p className="fest-chip"><span aria-hidden="true">{emoji}</span> Happy {name}! Wishing your home joy and light</p>;
  return (
    <p className="fest-chip">
      <span aria-hidden="true">{emoji}</span>
      <b>{name} in {t.d} day{t.d === 1 ? '' : 's'}</b>
      <span className="fest-chip__date">{when}</span>
    </p>
  );
}

/** Live "ends in" timer for an offer. */
export function OfferTimer({ endsAt }) {
  const t = useCountdown(endsAt);
  if (!t || !endsAt) return null;
  const cells = [[t.d, 'days'], [t.h, 'hrs'], [t.m, 'min'], [t.s, 'sec']];
  return (
    <div className="timer" aria-label={`Offer ends in ${t.d} days ${t.h} hours`}>
      <span className="timer__label">Offer ends in</span>
      <div className="timer__cells">
        {cells.map(([v, l]) => <span key={l} className="timer__cell"><b>{String(v).padStart(2, '0')}</b><small>{l}</small></span>)}
      </div>
    </div>
  );
}

const TICKER_REST = [ '🙏 Handmade by Indian artisans', '💳 Pay by UPI: GPay, PhonePe, Paytm', '🎁 Ready-to-gift hampers for every festival', '🍽️ Crockery & kitchen for festive cooking', '📦 Dispatched within 48 hours'];

export function Ticker() {
  const { offer, settings } = useStore();
  const free = settings?.free_delivery_above ? `🚚 Free delivery in India above ₹${(settings.free_delivery_above / 100).toLocaleString('en-IN')}` : null;
  const TICKER = [offer?.headline && `🪔 ${offer.headline}`, free, settings?.international_enabled && '✈️ We ship worldwide', ...TICKER_REST].filter(Boolean);
  const row = [...TICKER, ...TICKER];
  return (
    <div className="ticker" aria-label="Store highlights">
      <div className="ticker__track">
        {row.map((t, i) => <span key={i} aria-hidden={i >= TICKER.length || undefined}>{t}<i aria-hidden="true">✦</i></span>)}
      </div>
    </div>
  );
}

export function OccasionBanner({ to, eyebrow, title, text, cta, tone, style, children }) {
  return (
    <Link to={to} className={`occasion occasion--${tone}`} style={style}>
      <div className="occasion__copy">
        <p className="eyebrow">{eyebrow}</p>
        <h3>{title}</h3>
        <p>{text}</p>
        <span className="occasion__cta">{cta} →</span>
      </div>
      <div className="occasion__art" aria-hidden="true">{children}</div>
    </Link>
  );
}

/** Instagram / Facebook in-app browsers often block UPI app links; detect them to show a hint. */
export const isInAppBrowser = () => typeof navigator !== 'undefined' && /Instagram|FBAN|FBAV|FB_IAB|Line\/|Snapchat/i.test(navigator.userAgent);
