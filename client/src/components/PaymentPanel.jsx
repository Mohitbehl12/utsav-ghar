import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { api } from '../lib/api.js';
import { rupees, upiLink, copyText } from '../lib/format.js';
import { useStore, useToast } from '../state/store.jsx';
import { Field } from './ui.jsx';
import { CopyIcon, UploadIcon, ShieldIcon } from './Icons.jsx';
import { isInAppBrowser } from './Festive.jsx';
import { track } from '../lib/track.js';
import { isApp, isIOS, openExternal, upiAppLinks } from '../lib/native.js';

const isMobile = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

function loadRazorpay() {
  return new Promise((res, rej) => {
    if (window.Razorpay) return res();
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = res; s.onerror = () => rej(new Error('Could not load the payment window.'));
    document.body.appendChild(s);
  });
}

/** Ways to pay. Everything except UPI QR goes through the payment gateway's own secure window. */
export const PAY_METHODS = [
  { key: 'upi', label: 'UPI', icon: '📱', sub: 'Google Pay, PhonePe, Paytm, BHIM & bank apps' },
  { key: 'card', label: 'Credit / Debit card', icon: '💳', sub: 'Visa, Mastercard, RuPay, American Express, Diners, Maestro' },
  { key: 'netbanking', label: 'Net Banking', icon: '🏦', sub: 'SBI, HDFC, ICICI, Axis, Kotak and 50+ banks' },
  { key: 'wallet', label: 'Wallets', icon: '👛', sub: 'Paytm, PhonePe, Amazon Pay, Mobikwik, Freecharge' },
  { key: 'emi', label: 'EMI / Pay Later', icon: '🗓️', sub: 'Credit & debit card EMI, cardless EMI, Simpl, LazyPay' },
];
export const CARD_NETWORKS = ['Visa', 'Mastercard', 'RuPay', 'Amex', 'Diners', 'Maestro'];
export function CardBadges({ small }) {
  return <span className={`cardbadges ${small ? 'cardbadges--sm' : ''}`} aria-label="Accepted cards">{CARD_NETWORKS.map((n) => <span key={n} className={`cardbadge cardbadge--${n.toLowerCase()}`}>{n}</span>)}</span>;
}

/**
 * Preview only: stands in for the gateway's window so the flow can be tried.
 * It never asks for card numbers — in the live store customers type card details
 * only inside the gateway's PCI-DSS certified window, never on our pages.
 */
function DemoGateway({ method, amount, onDone, onClose }) {
  const m = PAY_METHODS.find((x) => x.key === method) || PAY_METHODS[1];
  return (
    <div className="demogw" role="dialog" aria-modal="true" aria-label="Preview payment window">
      <div className="demogw__panel">
        <p className="welcome__kicker">Preview · test payment</p>
        <h3>{m.icon} {m.label}</h3>
        <p className="demogw__amt">{rupees(amount)}</p>
        <p className="small">In your live store this opens the secure Razorpay window, where the customer enters card details, picks a bank or wallet, and confirms with OTP / 3-D Secure. Card numbers never reach Utsav Ghar.</p>
        <p className="small muted">This preview takes no card details and moves no money.</p>
        <button className="btn btn--gold btn--block" onClick={() => onDone(true)}>✅ Simulate successful payment</button>
        <button className="btn btn--ghost btn--block" onClick={() => onDone(false)}>Simulate a failed payment</button>
        <button className="link-btn small center" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

/**
 * Payment step. Shows the store's QR (uploaded by the owner) or, if none is
 * uploaded, a QR generated for the exact order amount. The customer then enters
 * the UPI reference (UTR). That moves the order to "Payment Verification Pending";
 * only an admin (or a verified gateway callback) can confirm payment.
 */
export default function PaymentPanel({ order, token, onSubmitted }) {
  const { settings } = useStore();
  const toast = useToast();
  const [qr, setQr] = useState('');
  const [txnRef, setTxnRef] = useState('');
  const [file, setFile] = useState(null);
  const [state, setState] = useState({});
  const amount = order.totals.total;
  const link = settings?.upi_id ? upiLink({ upiId: settings.upi_id, payee: settings.upi_payee_name, amountPaise: amount, note: `Order ${order.order_number}`, ref: order.order_number }) : '';

  useEffect(() => {
    if (settings?.upi_qr_url || !link) return;
    QRCode.toDataURL(link, { margin: 1, width: 320, color: { dark: '#2B1A1E', light: '#FFFFFF' } }).then(setQr).catch(() => {});
  }, [link, settings?.upi_qr_url]);

  const copy = async () => {
    const ok = await copyText(settings.upi_id);
    toast(ok ? `UPI ID copied: ${settings.upi_id}` : 'Copy failed — please select the UPI ID and copy it manually', ok ? 'ok' : 'warn');
  };

  const submit = async (e) => {
    e.preventDefault();
    setState({ busy: true });
    const fd = new FormData();
    fd.set('txnRef', txnRef.trim());
    if (file) fd.set('screenshot', file);
    try {
      const o = await api.post(`/orders/${order.order_number}/payment`, fd, { headers: { 'X-Order-Token': token } });
      track('add_payment_info', { value: amount, orderNumber: order.order_number });
      onSubmitted(o);
    } catch (err) {
      setState({ err: err.fields?.txnRef || err.message });
    }
  };

  const [method, setMethod] = useState('upi');
  const [demo, setDemo] = useState(null);
  const online = __DEMO__ || (settings?.payment_mode === 'gateway' && !!settings?.gateway_key_id);
  const payOnline = async (m = method) => {
    setState({ busy: true });
    try {
      const g = await api.post('/payments/gateway/create', { orderNumber: order.order_number, method: m }, { headers: { 'X-Order-Token': token } });
      track('add_payment_info', { value: amount, orderNumber: order.order_number });
      if (g.demo) { setDemo(m); return; }
      await loadRazorpay();
      const rz = new window.Razorpay({
        key: g.key, order_id: g.gatewayOrderId, amount: g.amount, currency: 'INR', name: settings.store_name,
        description: `Order ${order.order_number}`,
        prefill: { name: g.name, email: g.email, contact: g.contact, ...(m && m !== 'upi' ? { method: m } : {}) },
        theme: { color: '#5C0F22' }, retry: { enabled: true, max_count: 3 },
        handler: async (resp) => {
          try {
            await api.post('/payments/gateway/verify', resp);
            onSubmitted(await api.get(`/orders/${order.order_number}`, { headers: { 'X-Order-Token': token } }));
          } catch (e) { setState({ err: `${e.message} If money was deducted, it is safe — contact us with order #${order.order_number}.` }); }
        },
        modal: { ondismiss: () => setState({}) },
      });
      rz.on('payment.failed', (r) => setState({ err: `Payment failed: ${r?.error?.description || 'declined by the bank'}. No money is taken for a failed payment — try again or choose another method.` }));
      rz.open();
    } catch (err) {
      setState({ err: err.message });
    }
  };
  const demoDone = async (success) => {
    const m = demo; setDemo(null);
    if (!success) { setState({ err: 'Payment failed: declined by the bank (test). No money is taken for a failed payment — try again or choose another method.' }); return; }
    try { onSubmitted(await api.post('/payments/gateway/demo-confirm', { orderNumber: order.order_number, method: m }, { headers: { 'X-Order-Token': token } })); }
    catch (e) { setState({ err: e.message }); }
  };

  const [nriUpi, setNriUpi] = useState(false);
  if (!settings) return null;
  const abroad = order.address?.country && order.address.country !== 'IN';
  if (abroad && !nriUpi) {
    return (
      <div className="pay">
        <div className="pay__head">
          <h2>💳 Payment for your international order</h2>
          <p className="pay__amount">Amount <b>{rupees(amount)}</b>{order.fx_rate ? <span className="muted small"> ≈ {new Intl.NumberFormat('en', { style: 'currency', currency: order.currency }).format((amount / 100 / order.fx_rate) * (1 + (Number(settings?.fx_markup_pct) || 0) / 100))}</span> : null}</p>
          {order.fx_rate ? <p className="small muted">You're charged in Indian rupees; your bank sets the final {order.currency} amount.</p> : null}
        </div>
        {online ? (
          <div className="pay__gateway">
            <button className="btn btn--gold btn--lg btn--block" onClick={() => payOnline('card')} disabled={state.busy}>💳 Pay by card now</button>
            <CardBadges small />
            <p className="small muted center">International Visa, Mastercard and Amex accepted. Your bank converts from Indian rupees.</p>
            {demo && <DemoGateway method={demo} amount={amount} onDone={demoDone} onClose={() => { setDemo(null); setState({}); }} />}
          </div>
        ) : (
          <div className="notice notice--info">
            <b>Your order is reserved.</b> Within 12 hours we'll email a secure card / PayPal payment link to <b>{order.customer.email}</b> for {rupees(amount)}. We pack your order as soon as it's paid.
          </div>
        )}
        {state.err && <p className="field__error">{state.err}</p>}
        <p className="small muted">Have an Indian bank account or UPI app? <button className="link-btn" onClick={() => setNriUpi(true)}>Pay by UPI instead</button></p>
      </div>
    );
  }
  return (
    <div className="pay">
      <div className="pay__head">
        <h2>💳 Choose how to pay</h2>
        <p className="pay__amount">Amount to pay <b>{rupees(amount)}</b></p>
        <p className="small muted">Order <b>#{order.order_number}</b></p>
      </div>

      <div className="paym" role="tablist" aria-label="Payment method">
        {PAY_METHODS.map((m) => (
          <button key={m.key} type="button" role="tab" aria-selected={method === m.key} className={`paym__opt ${method === m.key ? 'is-on' : ''}`} onClick={() => { setMethod(m.key); setState({}); }}>
            <span className="paym__icon" aria-hidden="true">{m.icon}</span>
            <span className="paym__txt"><b>{m.label}</b><small>{m.sub}</small></span>
          </button>
        ))}
      </div>

      {method !== 'upi' && (
        <div className="pay__gateway paym__panel" role="tabpanel">
          {method === 'card' && <CardBadges />}
          {online ? (
            <>
              <button className="btn btn--gold btn--lg btn--block" onClick={() => payOnline(method)} disabled={state.busy}>🔒 Pay {rupees(amount)} securely</button>
              <ul className="paysafe">
                <li>🔐 Card details are entered only in our payment partner's <b>PCI-DSS certified</b> window — never stored by Utsav Ghar.</li>
                <li>📲 Your bank confirms with OTP / 3-D Secure.</li>
                <li>⚡ Payment is confirmed instantly and your order is packed straight away.</li>
                {method === 'emi' && <li>🗓️ EMI on orders above ₹3,000 with most credit cards; no-cost EMI where your bank offers it.</li>}
              </ul>
            </>
          ) : (
            <div className="notice notice--info">
              <b>{PAY_METHODS.find((m) => m.key === method).label} is coming soon.</b> Please pay by UPI for now — it takes a minute and is just as safe.
              <div><button type="button" className="btn btn--primary btn--sm" onClick={() => setMethod('upi')}>Pay by UPI</button></div>
            </div>
          )}
          {state.err && <p className="field__error" role="alert">{state.err}</p>}
          {demo && <DemoGateway method={demo} amount={amount} onDone={demoDone} onClose={() => { setDemo(null); setState({}); }} />}
        </div>
      )}

      {method === 'upi' && <>
      <div className="pay__grid">
        <div className="pay__qr">
          <p className="pay__step"><span>1</span> 📱 Scan QR &amp; Pay</p>
          <div className="qrframe">
            {settings.upi_qr_url ? <img src={settings.upi_qr_url} alt={`UPI QR code for ${settings.upi_payee_name}`} /> : qr ? <img src={qr} alt={`UPI QR code to pay ${rupees(amount)} to ${settings.upi_payee_name}`} /> : <div className="qrframe__ph" />}
          </div>
          <p className="small muted center">Works with Google Pay, PhonePe, Paytm, BHIM &amp; all bank UPI apps</p>
          {settings.upi_qr_url && <p className="small center"><b>Enter {rupees(amount)} as the amount.</b></p>}
        </div>
        <div className="pay__alt">
          <p className="pay__step"><span>2</span> 🔗 Or pay to our UPI ID</p>
          <div className="upi-id">
            <code className="upi-id__value" tabIndex={0}>{settings.upi_id}</code>
            <button type="button" className="btn btn--ghost" onClick={copy}><CopyIcon width={16} height={16} /> Copy UPI ID</button>
          </div>
          <p className="small muted">Payee name: <b>{settings.upi_payee_name}</b></p>
          {isMobile() ? (
            <>
              {isIOS() ? (
                <div className="upi-apps" role="group" aria-label="Pay with a UPI app">
                  <p className="small"><b>Pay {rupees(amount)} with:</b></p>
                  {upiAppLinks(link).map((a) => (
                    <button key={a.name} type="button" className="btn btn--ghost btn--block" onClick={() => openExternal(a.url)}>{a.name} →</button>
                  ))}
                </div>
              ) : (
                <a className="btn btn--primary btn--block" href={link} onClick={(e) => { if (isApp()) { e.preventDefault(); openExternal(link); } }}>Pay using UPI app →</a>
              )}
              {isInAppBrowser() && (
                <p className="notice notice--info small">Opened from Instagram? If your UPI app doesn't open, tap <b>⋯</b> (top right) → <b>Open in browser</b>, or copy the UPI ID above and pay from your UPI app. Your order is saved either way.</p>
              )}
            </>
          ) : (
            <p className="small muted">On your phone? Open this page there to launch your UPI app directly.</p>
          )}
        </div>
      </div>

      <form className="pay__confirm" onSubmit={submit}>
        <p className="pay__step"><span>3</span> Tell us you've paid</p>
        <Field label="UPI transaction / reference ID (UTR)" id="utr" error={state.err} hint="12-digit number shown in your UPI app after payment, e.g. 412345678901">
          <input id="utr" inputMode="text" autoComplete="off" value={txnRef} onChange={(e) => setTxnRef(e.target.value.replace(/\s/g, ''))} placeholder="412345678901" required={settings.require_txn_ref} maxLength={30} />
        </Field>
        {settings.allow_screenshot && (
          <label className="upload" htmlFor="shot">
            <UploadIcon width={18} height={18} />
            <span>{file ? file.name : 'Upload payment screenshot (optional)'}</span>
            <input id="shot" type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setFile(e.target.files[0] || null)} />
          </label>
        )}
        <button className="btn btn--primary btn--lg btn--block" disabled={state.busy}>✅ I HAVE PAID</button>
        <p className="pay__note"><ShieldIcon width={16} height={16} /> <span>We match every payment with our bank statement before dispatch. Your order stays <b>Payment Verification Pending</b> until then, usually for a few hours.</span></p>
      </form>
      </>}
    </div>
  );
}
