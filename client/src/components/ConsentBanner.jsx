import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../state/store.jsx';
import { setTrackingConsent, trackingConsent } from '../lib/track.js';

// Opt-in for ads measurement (Meta Pixel, Google Analytics). Shown only when the store has set those up and the
// visitor hasn't chosen yet. Both buttons are equal — no pre-ticked choice, no nagging after "No thanks".
// Essential storage (cart, sign-in, security) doesn't need consent and is always on.
export const openCookieChoices = () => window.dispatchEvent(new Event('ug:cookie-choices'));

export function ConsentBanner() {
  const { settings } = useStore();
  const configured = !!(settings?.meta_pixel_id || settings?.ga4_measurement_id);
  const [open, setOpen] = useState(false);
  useEffect(() => { if (configured && trackingConsent() === null) setOpen(true); }, [configured]);
  useEffect(() => { const h = () => setOpen(true); window.addEventListener('ug:cookie-choices', h); return () => window.removeEventListener('ug:cookie-choices', h); }, []);
  if (!open || !configured) return null;
  const choose = (v) => { setTrackingConsent(v); setOpen(false); };
  return (
    <div className="consent" role="dialog" aria-live="polite" aria-label="Cookie choices">
      <p className="consent__text">
        May we use Meta and Google cookies to measure our ads? This helps us show fewer, better ads. Essential cookies for your cart, sign-in and security are always on.{' '}
        <Link to="/privacy">Privacy Policy</Link>
      </p>
      <div className="consent__actions">
        <button type="button" className="btn btn--sm btn--ghost" onClick={() => choose(false)}>No thanks</button>
        <button type="button" className="btn btn--sm btn--primary" onClick={() => choose(true)}>Allow</button>
      </div>
    </div>
  );
}
