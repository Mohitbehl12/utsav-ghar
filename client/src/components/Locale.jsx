import { useState } from 'react';
import { useLocale, useToast } from '../state/store.jsx';
import { COUNTRIES, countryFlag, countryName } from '../lib/countries.js';
import { Modal } from './ui.jsx';
import { rupees } from '../lib/format.js';

/** "🇦🇪 AED" button in the header; opens the delivery-country picker. */
export function CountryButton({ className = '' }) {
  const loc = useLocale();
  const [open, setOpen] = useState(false);
  if (!loc.intlEnabled) return null;
  return (
    <>
      <button className={`country-btn ${className}`} onClick={() => setOpen(true)} aria-label={`Delivering to ${countryName(loc.country)}, prices in ${loc.currency}. Change`}>
        <span aria-hidden="true">{countryFlag(loc.country)}</span> {loc.currency}
      </button>
      <CountryModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}

export function CountryModal({ open, onClose }) {
  const loc = useLocale();
  const toast = useToast();
  const [q, setQ] = useState('');
  const list = COUNTRIES.filter(([c, n]) => !q || n.toLowerCase().includes(q.toLowerCase()) || c.toLowerCase() === q.toLowerCase());
  const pick = (c) => {
    loc.setCountry(c);
    toast(`Delivering to ${countryName(c)}`);
    onClose();
  };
  return (
    <Modal open={open} onClose={onClose} title="Where should we deliver?">
      <div className="country-modal">
        <h2>Where should we deliver?</h2>
        <p className="small muted">We ship across India and to many countries. Prices abroad are shown in your currency as an estimate; you pay in Indian rupees and your bank converts it.</p>
        <input id="country-search" type="search" placeholder="Search country" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search country" />
        <ul className="country-list">
          {list.map(([c, n, f, cur]) => (
            <li key={c}>
              <button className={loc.chosen === c ? 'is-on' : ''} onClick={() => pick(c)}>
                <span aria-hidden="true">{f}</span><span>{n}</span><small>{c === 'IN' ? 'INR' : cur}</small>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  );
}

/** Delivery line for product pages and the cart. */
export function DeliveryNote({ product }) {
  const loc = useLocale();
  if (!loc.international) return null;
  if (product && product.ships_international === false) {
    return <p className="deliv deliv--no">🚫 Ships within India only. Choose another item for delivery to {countryName(loc.country)}.</p>;
  }
  const z = loc.zone;
  if (!z) return null;
  return (
    <p className="deliv">
      ✈️ Delivers to {countryName(loc.country)} in <b>{z.delivery_text}</b> · shipping from {loc.fmt(z.fee)}{loc.currency !== 'INR' ? ` (${rupees(z.fee)})` : ''}
      {z.free_above ? `, free above ${loc.fmt(z.free_above)}` : ''}.
      {z.duties_note && <span className="deliv__duty"> {z.duties_note}</span>}
    </p>
  );
}
