import { stateForPin } from '@shared/pincode.js';
import { normalizeIndianPhone, isIndianMobile } from '@shared/phone.js';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, saveOrderToken } from '../lib/api.js';
import { rupees } from '../lib/format.js';
import { useAuth, useCart, useToast, useLocale, useStore } from '../state/store.jsx';
import { TermsUpdate, ConsentBoxes, useCustomerLegal } from '../components/Legal.jsx';
import { CountryModal } from '../components/Locale.jsx';
import { countryFlag, countryName } from '../lib/countries.js';
import { track, attribution } from '../lib/track.js';
import { Field, Media, Empty, useSeo } from '../components/ui.jsx';
import PaymentPanel from '../components/PaymentPanel.jsx';
import { Summary } from './Cart.jsx';

export const STATES = ['Andaman and Nicobar Islands', 'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chandigarh', 'Chhattisgarh', 'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jammu and Kashmir', 'Jharkhand', 'Karnataka', 'Kerala', 'Ladakh', 'Lakshadweep', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Puducherry', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal'];

const STEPS = ['Your details', 'Order summary', 'Payment'];
// Faster repeat checkout: details are kept on this device only (never sent anywhere else).
const ME_KEY = 'ug_checkout_me';
const remembered = () => { try { return JSON.parse(localStorage.getItem(ME_KEY) || '{}'); } catch { return {}; } };
const remember = (f) => { try { localStorage.setItem(ME_KEY, JSON.stringify({ name: f.name, phone: f.phone, email: f.email, line1: f.line1, line2: f.line2, city: f.city, state: f.state, pincode: f.pincode })); } catch { /* ignore */ } };
const forget = () => { try { localStorage.removeItem(ME_KEY); } catch { /* ignore */ } };

function Steps({ step }) {
  return (
    <ol className="steps">
      {STEPS.map((s, i) => (
        <li key={s} className={i < step ? 'done' : i === step ? 'on' : ''} aria-current={i === step ? 'step' : undefined}>
          <span>{i < step ? '✓' : i + 1}</span>{s}
        </li>
      ))}
    </ol>
  );
}

const blank = { name: '', phone: '', email: '', line1: '', line2: '', city: '', state: '', pincode: '' };

function validate(f, country) {
  const e = {};
  const india = country === 'IN';
  if (f.name.trim().length < 2) e.name = 'Enter your full name';
  if (india && !isIndianMobile(f.phone)) e.phone = 'Enter a valid 10-digit mobile number';
  if (!india && !/^\+?[0-9][0-9\s()-]{6,19}$/.test(f.phone.trim())) e.phone = 'Enter your phone with country code, e.g. +971 50 123 4567';
  if (f.email && !/^\S+@\S+\.\S+$/.test(f.email)) e.email = 'Enter a valid email';
  if (!india && !f.email) e.email = 'We need your email to send the secure payment link';
  if (f.line1.trim().length < 5) e.line1 = 'Enter house no., building and street';
  if (f.city.trim().length < 2) e.city = 'Enter your city';
  if (india && !f.state) e.state = 'Choose your state';
  if (india && !/^[1-9]\d{5}$/.test(f.pincode.trim())) e.pincode = 'Enter a valid 6-digit PIN code';
  if (!india && !/^[A-Za-z0-9][A-Za-z0-9 -]{1,11}$/.test(f.pincode.trim())) e.pincode = 'Enter your postal / ZIP code';
  return e;
}

export default function Checkout() {
  const cart = useCart();
  const { user } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const [step, setStep] = useState(0);
  const [f, setF] = useState(() => ({ ...blank, ...remembered() }));
  const [rememberMe, setRememberMe] = useState(true);
  const [errors, setErrors] = useState({});
  const [addresses, setAddresses] = useState([]);
  const [saveAddress, setSaveAddress] = useState(true);
  const [placing, setPlacing] = useState(false);
  const [placed, setPlaced] = useState(null); // { order, token }
  const [consent, setConsent] = useState(false);
  const [offers, setOffers] = useState(false);
  const [showCountry, setShowCountry] = useState(false);
  const loc = useLocale();
  const india = loc.country === 'IN';
  const { settings } = useStore();
  const guestOk = !!settings?.guest_checkout;
  const [termsKey, setTermsKey] = useState(0); // remount the "updated terms" box after a refused order
  const [guestTerms, setGuestTerms] = useState({});
  const legal = useCustomerLegal();
  useSeo({ title: 'Checkout | Utsav Ghar' });
  useEffect(() => {
    if (cart.quote?.lines?.length) track('begin_checkout', { value: cart.quote.total, items: cart.quote.lines.map((l) => ({ id: l.productId, qty: l.qty, price: l.unitPrice, name: l.name })) });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!user) return;
    setF((cur) => ({ ...cur, name: cur.name || user.name, phone: cur.phone || user.phone || '', email: cur.email || user.email }));
    api.get('/account/addresses').then((list) => {
      setAddresses(list);
      const d = list.find((a) => a.is_default) || list[0];
      if (d) pickAddress(d);
    }).catch(() => {});
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  // delivery charge follows the PIN code (Local / Regional / Metro / Rest of India / Special)
  useEffect(() => { if (india && /^[1-9]\d{5}$/.test(String(f.pincode || '').trim())) cart.setPincode(String(f.pincode).trim()); }, [f.pincode, india]); // eslint-disable-line react-hooks/exhaustive-deps

  function pickAddress(a) {
    setF((cur) => ({ ...cur, name: a.name, phone: a.phone, line1: a.line1, line2: a.line2 || '', city: a.city, state: a.state, pincode: a.pincode }));
  }
  const upd = (k) => (e) => {
    const v = e.target.value;
    const n = { ...f, [k]: v };
    // PIN code → pick the state automatically (customer can still change it)
    if (k === 'pincode' && india && !f.state) { const st = stateForPin(v); if (st) n.state = st; }
    setF(n);
    if (errors[k]) setErrors({ ...errors, [k]: undefined });
  };

  if (!placed && !cart.items.length) {
    return <div className="container"><Empty heading="h1" icon="🛒" title="Your cart is empty" action={<Link to="/shop" className="btn btn--primary">Continue shopping</Link>} /></div>;
  }

  const next = (e) => {
    e.preventDefault();
    const v = validate(f, loc.country);
    setErrors(v);
    if (Object.keys(v).length) { document.getElementById(`co-${Object.keys(v)[0]}`)?.focus(); return; }
    // Save the checkout so a reminder can be sent if it isn't finished (only with consent).
    let tokenKey = '';
    try { tokenKey = localStorage.getItem('sa_checkout_token') || ''; } catch { /* ignore */ }
    api.post('/checkout/session', { token: tokenKey || undefined, name: f.name.trim(), email: f.email.trim(), phone: india ? normalizeIndianPhone(f.phone) : f.phone.trim(), country: loc.country, consent, items: cart.items, couponCode: cart.couponCode, attribution: attribution() })
      .then((r) => { try { localStorage.setItem('sa_checkout_token', r.token); } catch { /* ignore */ } }).catch(() => {});
    setStep(1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // One key per attempt: a double tap or a retry after a dropped connection returns the same order
  const idemKey = useRef(null);
  const placeOrder = async () => {
    if (placing) return;
    setPlacing(true);
    if (!idemKey.current) idemKey.current = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
    try {
      let checkoutToken;
      try { checkoutToken = localStorage.getItem('sa_checkout_token') || undefined; } catch { /* ignore */ }
      const r = await api.post('/orders', {
        items: cart.items, couponCode: cart.couponCode, expectedTotal: cart.quote?.total, saveAddress: !!user && saveAddress,
        country: loc.country, currency: loc.currency, consent, marketingOptIn: offers, checkoutToken, attribution: attribution(),
        ...(user ? {} : { acceptTerms: (legal?.consents || []).every((c) => guestTerms[c.key]) }),
        customer: { name: f.name.trim(), phone: india ? normalizeIndianPhone(f.phone) : f.phone.trim(), email: f.email.trim() },
        address: { line1: f.line1.trim(), line2: f.line2.trim(), city: f.city.trim(), state: f.state, pincode: f.pincode.trim() },
      }, { headers: { 'Idempotency-Key': idemKey.current } });
      idemKey.current = null;
      try { localStorage.removeItem('sa_checkout_token'); } catch { /* ignore */ }
      saveOrderToken(r.order.order_number, r.accessToken);
      setPlaced({ order: r.order, token: r.accessToken });
      if (rememberMe) remember(f); else forget();
      cart.clear();
      setStep(2);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      if (err.status) idemKey.current = null; // the server answered: a new attempt may differ (fixed fields, new total)
      if (err.data?.code === 'TERMS_PENDING') { setTermsKey((k) => k + 1); toast(err.message, 'warn'); window.scrollTo({ top: 0, behavior: 'smooth' }); }
      else if (err.data?.code === 'LOGIN_REQUIRED') { nav('/login?next=/checkout'); }
      else if (err.status === 409) { await cart.refresh(); toast(err.message, 'warn'); }
      else if (err.status === 400) {
        const fe = {};
        for (const [k, v] of Object.entries(err.fields)) fe[k.split('.').pop()] = v;
        setErrors(fe); setStep(0); toast(err.message, 'warn');
      } else toast(err.message, 'warn');
    } finally {
      setPlacing(false);
    }
  };

  const q = cart.quote;
  // accounts only (guest checkout is switched off by the store) — sign in or create an account first
  if (user === null && !guestOk && step < 2) {
    return (
      <div className="container checkout">
        <h1>Checkout</h1>
        <div className="card checkout-login">
          <h2>Sign in to place your order</h2>
          <p className="muted">An account keeps your order, invoice, tracking and returns in one place, and records the terms you agreed to.</p>
          <Link className="btn btn--primary btn--lg" to="/login?next=/checkout">Sign in</Link>
          <Link className="btn btn--ghost btn--lg" to="/register?next=/checkout">Create an account</Link>
          <p className="small muted">Your cart is saved.</p>
        </div>
      </div>
    );
  }
  return (
    <div className="container checkout">
      <h1>Checkout</h1>
      <Steps step={step} />
      {user && step < 2 && <TermsUpdate key={termsKey} compact />}
      {step === 0 && (
        <div className="checkout__grid">
          <form className="card form" onSubmit={next} noValidate>
            <h2>Customer details</h2>
            {loc.intlEnabled && (
              <div className="ship-to">
                <span>Delivering to <b>{countryFlag(loc.country)} {countryName(loc.country)}</b>{!india && loc.zone ? ` · ${loc.zone.delivery_text}` : ''}</span>
                <button type="button" className="link-btn" onClick={() => setShowCountry(true)}>Change country</button>
                <CountryModal open={showCountry} onClose={() => setShowCountry(false)} />
              </div>
            )}
            {!user && <p className="small muted">Have an account? <Link className="link" to="/login?next=/checkout">Sign in</Link> for saved addresses. Or continue as a guest.</p>}
            {!user && legal && <ConsentBoxes consents={legal.consents} docs={legal.docs} value={guestTerms} onChange={setGuestTerms} errors={errors.acceptTerms ? Object.fromEntries(legal.consents.filter((c) => !guestTerms[c.key]).map((c) => [`consents.${c.key}`, 'Please tick this box'])) : {}} />}
            {addresses.length > 0 && (
              <div className="saved-addr">
                {addresses.map((a) => (
                  <button type="button" key={a.id} className={`saved-addr__item ${f.line1 === a.line1 && f.pincode === a.pincode ? 'is-on' : ''}`} onClick={() => pickAddress(a)}>
                    <b>{a.label || 'Address'}</b><span>{a.line1}, {a.city} {a.pincode}</span>
                  </button>
                ))}
              </div>
            )}
            <div className="form__grid">
              <Field label="Full name" id="co-name" error={errors.name}><input id="co-name" autoComplete="name" value={f.name} onChange={upd('name')} /></Field>
              <Field label="Mobile number" id="co-phone" error={errors.phone} hint={india ? 'For delivery updates' : 'With country code, for the courier'}><input id="co-phone" type="tel" inputMode="tel" autoComplete="tel" value={f.phone} onChange={upd('phone')} placeholder={india ? '98765 43210' : '+971 50 123 4567'} /></Field>
              <Field label={india ? 'Email (optional)' : 'Email'} id="co-email" error={errors.email} hint={india ? "We'll send your order confirmation" : "We'll email your secure payment link"}><input id="co-email" type="email" autoComplete="email" value={f.email} onChange={upd('email')} /></Field>
              <Field label="Address" id="co-line1" error={errors.line1}><input id="co-line1" autoComplete="address-line1" value={f.line1} onChange={upd('line1')} placeholder="House no., building, street" /></Field>
              <Field label="Landmark / area (optional)" id="co-line2"><input id="co-line2" autoComplete="address-line2" value={f.line2} onChange={upd('line2')} /></Field>
              <Field label={india ? 'PIN code' : 'Postal / ZIP code'} id="co-pincode" error={errors.pincode}><input id="co-pincode" inputMode={india ? 'numeric' : 'text'} maxLength={india ? 6 : 12} autoComplete="postal-code" value={f.pincode} onChange={upd('pincode')} /></Field>
              <Field label="City" id="co-city" error={errors.city}><input id="co-city" autoComplete="address-level2" value={f.city} onChange={upd('city')} /></Field>
              {india ? (
                <Field label="State" id="co-state" error={errors.state}>
                  <select id="co-state" autoComplete="address-level1" value={f.state} onChange={upd('state')}>
                    <option value="">Select state</option>
                    {STATES.map((s) => <option key={s}>{s}</option>)}
                  </select>
                </Field>
              ) : (
                <Field label="State / region (optional)" id="co-state" error={errors.state}><input id="co-state" autoComplete="address-level1" value={f.state} onChange={upd('state')} /></Field>
              )}
            </div>
            <label className="check"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} /><span>Send me order updates, and a reminder (at most two) if I don't finish this order (email / WhatsApp)</span></label>
            <label className="check"><input type="checkbox" checked={offers} onChange={(e) => setOffers(e.target.checked)} /><span>Also send me weekly picks and festival alerts on WhatsApp / email (you can stop any time)</span></label>
            {user && <label className="check"><input type="checkbox" checked={saveAddress} onChange={(e) => setSaveAddress(e.target.checked)} /><span>Save this address to my account</span></label>}
            <label className="check"><input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} /><span>Remember my details on this device for faster checkout</span></label>
            <button className="btn btn--primary btn--lg btn--block">Continue to Order Summary →</button>
          </form>
          <aside><Summary quote={q} compact /></aside>
        </div>
      )}

      {step === 1 && (
        <div className="checkout__grid">
          <div className="card">
            <div className="row between"><h2>Delivering to</h2><button className="link-btn" onClick={() => setStep(0)}>Change</button></div>
            <p><b>{f.name}</b> · {f.phone}<br />{f.line1}{f.line2 ? `, ${f.line2}` : ''}, {f.city}, {f.state} {f.pincode}</p>
            <h2>Products</h2>
            <ul className="mini-lines">
              {q?.lines.map((l) => (
                <li key={l.productId}>
                  <span className="mini-lines__img"><Media product={{ art: l.art, image: l.image, name: l.name }} /></span>
                  <span>{l.name} <span className="muted">× {l.qty}</span>{l.offerEligible && <span className="tag tag--offer">Offer</span>}</span>
                  <b>{rupees(l.lineTotal)}</b>
                </li>
              ))}
            </ul>
            {q?.nudge && <p className="notice notice--warn">🪔 {q.nudge.message} <Link to="/shop?offer=1" className="link">Add more</Link></p>}
          </div>
          <aside>
            <Summary quote={q}>
              <button className="btn btn--primary btn--lg btn--block" onClick={placeOrder} disabled={placing || !q}>{placing ? 'Placing order…' : `Place Order & Pay ${q ? rupees(q.total) : ''}`}</button>
              <button className="btn btn--ghost btn--block" onClick={() => setStep(0)}>← Back</button>
            </Summary>
          </aside>
        </div>
      )}

      {step === 2 && placed && (
        <div className="checkout__pay card">
          <p className="notice notice--ok">✓ Order <b>#{placed.order.order_number}</b> is reserved for you. Complete the payment below.</p>
          <PaymentPanel order={placed.order} token={placed.token} onSubmitted={(o) => nav(`/order/${o.order_number}?placed=1`, { replace: true })} />
        </div>
      )}
    </div>
  );
}
