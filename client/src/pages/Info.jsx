import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useStore } from '../state/store.jsx';
import { Field, Empty, useSeo, Spinner } from '../components/ui.jsx';
import { LegalDocView, DocActions, DocViewer } from '../components/Legal.jsx';
import ProductArt from '../components/ProductArt.jsx';

// Store policies are placeholders the owner should review with their own terms.
const PAGES = {
  about: {
    title: 'About Utsav Ghar',
    lede: 'Utsav means celebration and ghar means home. We started Utsav Ghar so every Indian festival — and everything a home needs for it — is in one place.',
    body: [
      ['What we sell', 'Festival décor and essentials for Navratri, Diwali, Christmas, New Year, Holi, Raksha Bandhan, Onam and more, plus pooja items, home décor, crockery and kitchenware. Most pieces come directly from artisan clusters: brass from Moradabad, terracotta from Kutch and Bengal, gota-patti from Jaipur.'],
      ['How we choose', 'We handle and use every product before it goes on the site. If a brass diya is too thin or a light string flickers, it does not make the cut.'],
      ['A new collection each festival', 'Our home page always features the festival coming up next, with everything you need for it. Pooja, home décor, crockery and kitchen sections are there all year.'],
    ],
  },
  faq: {
    title: 'Frequently Asked Questions',
    body: [
      ['How does the Buy More, Save More offer work?', 'Buy 2 eligible products and get 10% off, 3 and get 20% off, 5 or more and get 30% off those items. Quantities count, so 3 of the same diya qualifies. The discount appears automatically in your cart, which also shows how many more items unlock the next level.'],
      ['Do you have a first-order discount?', 'Yes. Sign up for our festive letters and use code WELCOME10 for 10% off your first order (up to ₹300). It cannot be combined with other offers; your cart applies whichever saves you more.'],
      ['What are combos?', 'Ready-made sets, such as the Diwali Decor Combo, priced lower than buying each item separately. The product page lists everything inside.'],
      ['Do you ship outside India?', 'Yes, to the UAE and Gulf, UK and Europe, USA and Canada, Australia, Singapore and more. Choose your country at the top of the page to see prices in your currency and the delivery charge. You pay in Indian rupees by card or PayPal (we email a secure payment link), or by UPI. Import duties, if any, are paid on delivery. Rangoli powder, incense and battery lights ship within India only.'],
      ['How do I pay?', 'Scan our UPI QR code or pay to our UPI ID from any UPI app (Google Pay, PhonePe, Paytm, BHIM or your bank app). Then enter the 12-digit UPI reference number (UTR) and tap “I have paid”.'],
      ['When is my payment confirmed?', 'We match your UTR with our bank statement, usually within a few hours during business hours. Your order shows “Payment Verification Pending” until then, and “Payment Confirmed” after.'],
      ['Where do I find the UTR number?', 'Open the payment in your UPI app’s history. It is labelled UPI Ref No., UTR or Transaction ID and is usually 12 digits.'],
      ['Do you offer cash on delivery?', 'Not at the moment. UPI keeps prices low and lets us ship faster.'],
      ['Can I change my address after ordering?', 'Yes, until the order ships. Contact us with your order ID.'],
    ],
  },
  shipping: {
    title: 'Shipping Policy',
    body: [
      ['Dispatch', 'Orders are packed within 24–48 hours of payment confirmation.'],
      ['Delivery time', 'Metro cities: 3–4 business days. Rest of India: 4–6 business days. Remote areas may take longer. International delivery times are listed below.'],
      ['Charges', 'Delivery is free above the threshold shown in your cart; below it a flat delivery fee applies.'],
      ['Tracking', 'You receive the courier name and tracking number when your order ships. You can also track it on our Track Order page.'],
    ],
  },
  returns: {
    title: 'Returns & Refunds',
    body: [
      ['Damaged or wrong item', 'Tell us within 7 days of delivery with photos of the product and packaging. We will send a replacement or refund.'],
      ['Change of mind', 'Unused items in original packaging can be returned within 7 days. Return shipping is paid by the customer. Rangoli colours, incense and candles cannot be returned once opened.'],
      ['Refunds', 'Approved refunds are sent to the original UPI account within 5–7 business days.'],
      ['Cancelled orders', 'If you cancel before dispatch, any payment received is refunded in full.'],
    ],
  },
  privacy: {
    title: 'Privacy Policy',
    body: [
      ['What we collect', 'Your name, mobile number, email, delivery address, order history and payment reference numbers.'],
      ['Why', 'To deliver your order, confirm your payment, send order updates and, if you opt in, festive offers.'],
      ['Deals & festival alerts', 'Only if you sign up and tick the consent box: we keep your name, WhatsApp number and/or email, how often you want messages, the sections you like, and the products you recently viewed, added to cart or wishlist on this device, so we can pick products for you. Every message has a link to change how often or unsubscribe, or reply STOP on WhatsApp. We count which messages you open links from, to improve them.'],
      ['Sharing', 'We share only what is needed with our courier partners and payment providers. We never sell your data.'],
      ['Security', 'Passwords are hashed, connections are encrypted with HTTPS and payment screenshots are visible only to authorised staff.'],
      ['Your choices', 'You can update your profile, delete saved addresses, unsubscribe from messages, or ask us to delete your account and all your data at any time.'],
    ],
  },
  terms: {
    title: 'Terms & Conditions',
    body: [
      ['Orders', 'An order is confirmed once payment is verified. We may cancel orders affected by pricing errors or stock issues and refund any payment in full.'],
      ['Prices', 'All prices are in Indian Rupees and include applicable taxes. Final prices and discounts are those shown at checkout.'],
      ['Offers', 'Promotions are valid for the dates shown, cannot be combined unless stated, and may be changed or withdrawn.'],
      ['Product images', 'Handmade products vary slightly in colour, finish and size. These variations are part of their character.'],
    ],
  },
};

// the legal pages show the CURRENT published version from Admin → Legal & Agreements
const LEGAL_PAGE = { terms: 'customer_terms', privacy: 'privacy', returns: 'refund_cancellation' };
function LegalInfo({ kind, fallback }) {
  const [d, setD] = useState(null);
  const [full, setFull] = useState(false);
  useEffect(() => { api.get(`/legal/doc/${kind}`).then(setD).catch(() => setD(false)); }, [kind]);
  useSeo({ title: `${d?.title || fallback.title} | Utsav Ghar` });
  if (d === null) return <div className="container narrow info"><Spinner /></div>;
  if (!d) return null;
  return (
    <div className="container narrow info">
      <p className="lg-meta">Version {d.version} · effective {new Date(d.effective_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
      <DocActions doc={d} pdfPath={kind === 'customer_terms' ? '/legal/customer/pdf' : `/legal/doc/${kind}/pdf`} pdfName={`utsav-ghar-${kind}-v${d.version}.pdf`} onView={() => setFull(true)} />
      <LegalDocView body={d.body} />
      {full && <DocViewer docs={[d]} mode="full" onClose={() => setFull(false)} pdfPath={kind === 'customer_terms' ? '/legal/customer/pdf' : `/legal/doc/${kind}/pdf`} pdfName={`utsav-ghar-${kind}.pdf`} />}
      <p className="muted small">Signed in? See every version you accepted in <Link to="/account/legal" className="link">My Account → Legal Documents</Link>. Questions? <Link to="/contact" className="link">Contact us</Link>.</p>
    </div>
  );
}

export function InfoPage({ page }) {
  if (LEGAL_PAGE[page]) return <LegalInfo kind={LEGAL_PAGE[page]} fallback={PAGES[page]} />;
  return <StaticInfo page={page} />;
}
function StaticInfo({ page }) {
  const p = PAGES[page];
  useSeo({ title: `${p.title} | Utsav Ghar`, description: p.lede || p.body[0][1] });
  return (
    <div className="container narrow info">
      <h1>{p.title}</h1>
      {p.lede && <p className="lede">{p.lede}</p>}
      {page === 'faq' ? (
        <div className="faq">
          {p.body.map(([q, a]) => <details key={q} className="acc"><summary>{q}</summary><p>{a}</p></details>)}
        </div>
      ) : (
        p.body.map(([h, t]) => <section key={h}><h2>{h}</h2><p>{t}</p></section>)
      )}
      {page === 'shipping' && <ZonesTable />}
      {page === 'about' && (
        <div className="about-art" aria-hidden="true">
          {['diya', 'xmas-tree', 'gulal', 'dinner-set'].map((t, i) => <ProductArt key={t} art={{ type: t, tone: ['orange', 'green', 'pink', 'cream'][i] }} />)}
        </div>
      )}
      <p className="muted small">Questions? <Link to="/contact" className="link">Contact us</Link>.</p>
    </div>
  );
}

function ZonesTable() {
  const { settings } = useStore();
  const zones = settings?.shipping_zones || [];
  if (!settings?.international_enabled || !zones.length) return null;
  const r = (p) => `₹${(p / 100).toLocaleString('en-IN')}`;
  return (
    <section>
      <h2>Delivery charges and times by country</h2>
      <div className="table-wrap" tabIndex={0} role="region" aria-label="Table">
        <table className="table">
          <thead><tr><th>Where</th><th>Delivery time</th><th className="num">First item</th><th className="num">Each extra item</th><th className="num">Free above</th></tr></thead>
          <tbody>
            {zones.map((z) => (
              <tr key={z.code}><td>{z.name}</td><td>{z.delivery_text}</td><td className="num">{r(z.fee)}</td><td className="num">{z.extra_item_fee ? r(z.extra_item_fee) : '—'}</td><td className="num">{z.free_above ? r(z.free_above) : '—'}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="small muted">International orders: import duties and taxes, if any, are charged by customs in your country and paid by the receiver. Some items (rangoli powder, incense, battery-powered lights) ship within India only.</p>
    </section>
  );
}

export function Contact() {
  const { settings } = useStore();
  const [f, setF] = useState({ name: '', email: '', phone: '', message: '' });
  const [state, setState] = useState({});
  useSeo({ title: 'Contact Us | Utsav Ghar' });
  const submit = async (e) => {
    e.preventDefault();
    setState({ busy: true });
    try { setState({ ok: (await api.post('/contact', f)).message }); setF({ name: '', email: '', phone: '', message: '' }); }
    catch (err) { setState({ fields: err.fields || {}, err: err.message }); }
  };
  const upd = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <div className="container contact">
      <div>
        <h1>Contact Us</h1>
        <p className="lede">Questions about an order, bulk gifting or a product? We're happy to help.</p>
        <ul className="contact__list">
          <li><span>Phone / WhatsApp</span><b>{settings?.support_phone}</b></li>
          <li><span>Email</span><b>{settings?.support_email}</b></li>
          <li><span>Hours</span><b>Mon–Sat, 10am–7pm IST</b></li>
        </ul>
      </div>
      <form className="card form" onSubmit={submit}>
        {state.ok ? <p className="notice notice--ok">{state.ok}</p> : (
          <>
            <Field label="Name" id="ct-name" error={state.fields?.name}><input id="ct-name" value={f.name} onChange={upd('name')} required /></Field>
            <Field label="Email" id="ct-email" error={state.fields?.email}><input id="ct-email" type="email" value={f.email} onChange={upd('email')} required /></Field>
            <Field label="Phone (optional)" id="ct-phone"><input id="ct-phone" type="tel" value={f.phone} onChange={upd('phone')} /></Field>
            <Field label="Message" id="ct-msg" error={state.fields?.message}><textarea id="ct-msg" rows={5} value={f.message} onChange={upd('message')} required /></Field>
            <input className="hp" type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" value={f.website || ''} onChange={upd('website')} />
            <button className="btn btn--primary" disabled={state.busy}>Send message</button>
          </>
        )}
      </form>
    </div>
  );
}

export function NotFound() {
  useSeo({ title: 'Page not found | Utsav Ghar' });
  return <div className="container"><Empty icon="🪔" title="This page has wandered off" action={<Link to="/" className="btn btn--primary">Back to home</Link>}>The link may be old or mistyped.</Empty></div>;
}

// ---------------------------------------------------------------- all published policies (Admin → Legal & Compliance publishes them)
const CAT_LABEL = { customer: ['👤', 'For customers'], company: ['🏢', 'About the platform'] };
export function PoliciesPage() {
  const [d, setD] = useState(null);
  useSeo({ title: 'Policies | Utsav Ghar', description: 'All current Utsav Ghar terms and policies in simple words, with the full legal terms.' });
  useEffect(() => { api.get('/legal/policies').then(setD).catch(() => setD({ items: [] })); }, []);
  if (!d) return <div className="container narrow info"><Spinner /></div>;
  return (
    <div className="container info lg-policies">
      <h1>Our policies</h1>
      <p className="lede">Every policy starts with a short explanation in simple words, followed by the full legal terms. Each one shows its version and the date it took effect.</p>
      {['customer', 'company'].map((c) => {
        const list = d.items.filter((x) => x.category === c);
        if (!list.length) return null;
        return (
          <section key={c}>
            <h2>{CAT_LABEL[c][0]} {CAT_LABEL[c][1]}</h2>
            <ul className="lg-polgrid">{list.map((x) => (
              <li key={x.kind}><Link to={x.kind === 'customer_terms' ? '/terms' : x.kind === 'privacy' ? '/privacy' : x.kind === 'refund_cancellation' ? '/returns' : `/policies/${x.kind}`}>
                <span className="lg-polgrid__ic" aria-hidden="true">{x.icon}</span><b>{x.title}</b><small>{x.desc}</small><small className="muted">Version {x.version} · effective {new Date(x.effective_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}{x.accept ? ' · accepted at sign-up' : ''}</small>
              </Link></li>
            ))}</ul>
          </section>
        );
      })}
      <p className="muted small">Questions about a policy? <Link to="/contact" className="link">Contact us</Link> or write to our Grievance Officer (see the Complaints &amp; Grievance Policy).</p>
    </div>
  );
}
export function PolicyPage() {
  const { kind } = useParams();
  const [d, setD] = useState(null);
  const [full, setFull] = useState(false);
  useEffect(() => { setD(null); api.get(`/legal/policy/${kind}`).then(setD).catch(() => setD(false)); }, [kind]);
  useSeo({ title: `${d?.title || 'Policy'} | Utsav Ghar` });
  if (d === null) return <div className="container narrow info"><Spinner /></div>;
  if (!d) return <div className="container narrow info"><Empty icon="📄" title="This policy is not published yet"><Link to="/policies" className="link">See all policies</Link></Empty></div>;
  const pdf = `/legal/policy/${kind}/pdf`;
  return (
    <div className="container narrow info">
      <p className="small"><Link to="/policies" className="link">← All policies</Link></p>
      <h1 className="sr-only">{d.title}</h1>
      <p className="lg-meta">Version {d.version} · effective {new Date(d.effective_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
      <DocActions doc={d} pdfPath={pdf} pdfName={`utsav-ghar-${kind}-v${d.version}.pdf`} onView={() => setFull(true)} />
      <LegalDocView body={d.body} />
      {full && <DocViewer docs={[d]} mode="full" onClose={() => setFull(false)} pdfPath={pdf} pdfName={`utsav-ghar-${kind}.pdf`} />}
    </div>
  );
}
