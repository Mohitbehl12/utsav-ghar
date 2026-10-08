import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { rupees } from '../lib/format.js';
import { useStore, useCart, useToast, useMoney } from '../state/store.jsx';
import FestiveSky from '../components/FestiveSky.jsx';
import { OfferTimer, Ticker, OccasionBanner, FestivalChip } from '../components/Festive.jsx';
import HeroScene from '../components/HeroScene.jsx';
import { ThemedHero, SegmentTiles } from '../components/Sections.jsx';
import { AppHome, useIsApp } from '../components/AppShell.jsx';
import { ZHome } from '../components/Storefront.jsx';
import { BRAND } from '@shared/brand.js';
import ProductArt from '../components/ProductArt.jsx';
import { ProductGrid } from '../components/ProductCard.jsx';
import { SectionHead, Stars, useSeo, Media, Divider } from '../components/ui.jsx';

function useProducts(query) {
  const [state, setState] = useState({ items: [], loading: true });
  useEffect(() => {
    let live = true;
    api.get(`/products?${query}`).then((r) => live && setState({ items: r.items, loading: false })).catch(() => live && setState({ items: [], loading: false }));
    return () => { live = false; };
  }, [query]);
  return state;
}

// Picture for the home hero, picked from the festival name (Diwali uses the full doorway scene).
const HERO_ART = [
  [/christmas|xmas/i, [{ type: 'xmas-tree', tone: 'green' }, { type: 'star', tone: 'gold' }]],
  [/new year/i, [{ type: 'party', tone: 'purple' }, { type: 'glassware', tone: 'navy' }]],
  [/holi/i, [{ type: 'gulal', tone: 'pink' }, { type: 'pichkari', tone: 'green' }]],
  [/rakhi|raksha|bhai dooj/i, [{ type: 'rakhi', tone: 'maroon' }, { type: 'giftbox', tone: 'pink' }]],
  [/eid|ramadan/i, [{ type: 'moon', tone: 'gold' }, { type: 'lantern', tone: 'gold' }]],
  [/karwa/i, [{ type: 'moon', tone: 'gold' }, { type: 'thali', tone: 'maroon' }]],
  [/navratri|durga|garba|dussehra/i, [{ type: 'dandiya', tone: 'orange' }, { type: 'kalash', tone: 'gold' }]],
  [/ganesh|ganpati/i, [{ type: 'modak', tone: 'orange' }, { type: 'toran', tone: 'orange' }]],
  [/janmashtami|krishna/i, [{ type: 'matki', tone: 'orange' }, { type: 'flute', tone: 'gold' }]],
  [/lohri|sankranti|pongal|uttarayan/i, [{ type: 'kite', tone: 'orange' }, { type: 'matki', tone: 'gold' }]],
  [/onam/i, [{ type: 'rangoli', tone: 'orange' }, { type: 'plate', tone: 'green' }]],
];
const heroArt = (name) => HERO_ART.find(([re]) => re.test(name))?.[1] || [{ type: 'diya', tone: 'orange' }, { type: 'giftbox', tone: 'maroon' }];

function Hero() {
  const { offer, settings } = useStore();
  const name = settings?.festival_name || 'Diwali';
  const diwali = /diwali|deepavali/i.test(name);
  return (
    <ThemedHero
      scene={diwali ? <HeroScene /> : null}
      art={heroArt(name)}
      chip={settings?.festival_date ? <FestivalChip name={name} date={settings.festival_date} emoji={settings.festival_emoji} /> : null}
      eyebrow={BRAND.tagline}
      title={settings?.festival_headline || `Celebrate ${name}`}
      subtitle={settings?.festival_subtitle}
      actions={<>
        <Link to="/shop?collection=festival" className="btn btn--gold btn--lg">{settings?.festival_emoji || '🪔'} Shop {name} Collection</Link>
        <Link to="/offers" className="btn btn--ghost-light btn--lg">🎁 View Offers</Link>
      </>}
      facts={[
        offer && [offer.discount_type === 'tiered' ? `Up to ${offer.discount_value}%` : offer.label, offer.discount_type === 'tiered' ? 'off when you buy more' : `when you buy ${offer.min_qty}`],
        ['UPI', 'scan & pay'],
        ['3–6 days', settings?.international_enabled ? 'India · we ship worldwide' : 'pan-India delivery'],
      ].filter(Boolean)}
    />
  );
}

function MegaOffer() {
  const { offer } = useStore();
  const cart = useCart();
  const toast = useToast();
  const { fmt } = useMoney();
  const { items } = useProducts('offer=1&flag=bestseller&inStock=1&limit=3');
  const [example, setExample] = useState(null);
  useEffect(() => {
    if (items.length >= 3) api.post('/cart/quote', { items: items.slice(0, 3).map((p) => ({ productId: p.id, qty: 1 })) }).then(setExample).catch(() => {});
  }, [items]);
  if (!offer) return null;
  const q = cart.quote;
  const tiers = offer.discount_type === 'tiered' ? [...(offer.tiers || [])].sort((a, b) => a.min_qty - b.min_qty) : [{ min_qty: offer.min_qty, percent: offer.discount_value }];
  const top = tiers.at(-1)?.min_qty || offer.min_qty;
  const have = q?.progress?.find((x) => x.offerId === offer.id)?.eligibleUnits || 0;
  const pct = Math.min(100, (have / top) * 100);
  const next = tiers.find((t) => have < t.min_qty);
  return (
    <section className="mega" id="festive-offer" aria-labelledby="mega-h">
      <FestiveSky density={0.6} fireworks={false} />
      <div className="container mega__grid">
        <div className="mega__copy">
          <p className="eyebrow eyebrow--light">🔥 {offer.name}</p>
          {offer.discount_type === 'tiered' ? (
            <h2 id="mega-h"><span className="mega__big">Buy More, Save More</span><span className="mega__gold">Up to {offer.discount_value}% OFF<sup>*</sup></span></h2>
          ) : (
            <h2 id="mega-h"><span className="mega__big">Buy {offer.min_qty} Products</span><span className="mega__gold">Get {offer.label}<sup>*</sup></span></h2>
          )}
          <p>{offer.headline}. The discount comes off your eligible items automatically in the cart.</p>
          <div className="meter" role="progressbar" aria-valuemin={0} aria-valuemax={top} aria-valuenow={Math.min(have, top)} aria-label="Eligible items in your cart">
            <div className="meter__track meter__track--tiers">
              <div className="meter__fill" style={{ width: `${pct}%` }} />
              {tiers.map((t) => <span key={t.min_qty} className={`meter__tick ${have >= t.min_qty ? 'is-on' : ''}`} style={{ left: `${(t.min_qty / top) * 100}%` }}><b>{t.percent}%</b><small>{t.min_qty} items</small></span>)}
            </div>
            <p className="meter__label">
              {q?.offer && !next ? <>🎉 Top discount unlocked! You're saving <b>{fmt(q.discount)}</b></>
                : q?.offer ? <>🎉 {q.offer.label} unlocked ({fmt(q.discount)} off) · add {next.min_qty - have} more for <b>{next.percent}% OFF</b></>
                : <>You have <b>{have}</b> eligible item{have === 1 ? '' : 's'} · add {(next?.min_qty || top) - have} more for <b>{next?.percent || tiers[0].percent}% OFF</b></>}
            </p>
          </div>
          <Link to="/shop?offer=1" className="btn btn--gold btn--lg">Shop Eligible Products →</Link>
          <OfferTimer endsAt={offer.ends_at} />
          <p className="mega__fine">*On eligible items only{offer.max_discount ? `, max ${rupees(offer.max_discount)}` : ''}. Not combinable with coupons.{offer.ends_at ? ` Ends ${new Date(offer.ends_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}.` : ''}</p>
        </div>
        {example && (
          <div className="bill" aria-label="Worked example">
            <p className="bill__title">How it adds up</p>
            <ul>
              {example.lines.map((l) => {
                const p = items.find((x) => x.id === l.productId);
                return (
                  <li key={l.productId}>
                    <span className="bill__thumb"><Media product={p} /></span>
                    <span className="bill__name">{l.name}</span>
                    <span className="bill__amt">{fmt(l.lineTotal)}</span>
                  </li>
                );
              })}
            </ul>
            <dl>
              <div><dt>Original total</dt><dd>{fmt(example.subtotal)}</dd></div>
              <div className="bill__disc"><dt>{example.offer?.label} discount</dt><dd>−{fmt(example.discount)}</dd></div>
              <div className="bill__pay"><dt>You pay</dt><dd>{fmt(example.subtotal - example.discount)}</dd></div>
            </dl>
            <button className="btn btn--primary btn--block" onClick={() => { items.slice(0, 3).forEach((p) => cart.add(p.id, 1)); toast(`🎉 3 products added — ${example.offer?.label || 'offer'} unlocked!`); }}>Add these 3 to cart</button>
          </div>
        )}
      </div>
    </section>
  );
}

function Rail({ eyebrow, title, query, link, sub }) {
  const { items, loading } = useProducts(query);
  if (!loading && items.length === 0) return null;
  return (
    <section className="section container">
      <SectionHead eyebrow={eyebrow} title={title} sub={sub} action={<Link to={link} className="link">View all →</Link>} />
      <ProductGrid products={items} loading={loading} />
    </section>
  );
}

const TRUST = [
  ['🛍️', 'Carefully selected products', 'Every item is checked by our team before it leaves the warehouse.'],
  ['🔒', 'Secure payments', 'Pay by UPI. Your order ships only after the payment is verified.'],
  ['🚚', 'Reliable delivery', 'Tracked shipping across India in 3–6 business days.'],
  ['💯', 'Quality products', 'Solid brass, real copper, artisan clay and kitchen-safe materials. No flimsy shortcuts.'],
  ['❤️', 'Customer support', 'Talk to a real person on phone or WhatsApp when you need help.'],
  ['🎊', 'For every festival', 'Our collection changes with each festival: Diwali, Christmas, Holi, Rakhi and more.'],
];

function Trust() {
  return (
    <section className="section trust" aria-labelledby="trust-h">
      <div className="container">
        <SectionHead eyebrow="Why shop with us" title={<span id="trust-h">A Store You Can Trust, Every Festival</span>} />
        <ul className="trust__grid">
          {TRUST.map(([i, t, d]) => (
            <li key={t}><span className="trust__icon" aria-hidden="true">{i}</span><h3>{t}</h3><p>{d}</p></li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Reviews() {
  const [rows, setRows] = useState([]);
  useEffect(() => { api.get('/reviews/featured').then(setRows).catch(() => {}); }, []);
  if (!rows.length) return null;
  return (
    <section className="section container" aria-labelledby="rev-h">
      <SectionHead eyebrow="Customer reviews" title={<span id="rev-h">Homes We've Helped Celebrate</span>} />
      <div className="reviews">
        {rows.map((r) => (
          <figure key={r.id} className="review">
            <Stars value={r.rating} />
            <blockquote>“{r.body}”</blockquote>
            <figcaption>
              <b>{r.author}</b>{r.city ? `, ${r.city}` : ''}
              {r.is_verified_purchase ? <span className="verified">✓ Verified purchase</span> : null}
              <Link to={`/shop/${r.category_slug}/${r.product_slug}`} className="review__product">{r.product_name}</Link>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}

function Newsletter() {
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try { setMsg({ ok: true, text: (await api.post('/newsletter', { email })).message }); setEmail(''); }
    catch (err) { setMsg({ ok: false, text: err.fields?.email || err.message }); }
    finally { setBusy(false); }
  };
  return (
    <section className="newsletter">
      <div className="container newsletter__inner">
        <div>
          <p className="eyebrow eyebrow--light">Festive letters</p>
          <h2>Never Miss a Festival</h2>
          <p>A reminder before each festival, early access to new collections and members-only offers. One or two emails a month.</p>
        </div>
        <form onSubmit={submit} className="newsletter__form">
          <label htmlFor="nl-email" className="sr-only">Email address</label>
          <input id="nl-email" type="email" required placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          <button className="btn btn--gold" disabled={busy}>Subscribe</button>
          {msg && <p className={`newsletter__msg ${msg.ok ? '' : 'is-err'}`} role="status">{msg.text}</p>}
        </form>
      </div>
    </section>
  );
}

export default function Home() {
  const { settings } = useStore();
  const app = useIsApp();
  const name = settings?.festival_name || 'Diwali';
  useSeo({
    title: `${BRAND.name} – ${name} Décor, Pooja, Crockery & Kitchen Online`,
    description: `Shop ${name} décor, diyas, pooja essentials, gifts, crockery and kitchenware. Pay securely with UPI, delivered across India.`,
    schema: { '@context': 'https://schema.org', '@type': 'Store', name: BRAND.name, description: BRAND.tagline },
  });
  if (app) return <AppHome />;
  return <ZHome />;
  return (
    <>
      <Hero />
      <Ticker />
      <SegmentTiles />
      <Rail eyebrow={`${settings?.festival_emoji || '🪔'} ${name} collection`} title={`Shop for ${name}`} query="flag=diwali&sort=popular&limit=8" link="/shop?collection=festival" />
      <section className="container occasions" aria-label="Shop by occasion">
        <OccasionBanner to="/s/pooja" tone="maroon" eyebrow="Pooja ready" title="Everything for the evening aarti" text="Brass thalis, kalash, ghanti and temple incense, packed to arrive on time." cta="Shop pooja essentials">
          <ProductArt art={{ type: 'thali', tone: 'gold' }} bare />
          <ProductArt art={{ type: 'kalash', tone: 'orange' }} bare />
        </OccasionBanner>
        <OccasionBanner to="/s/dining" tone="plum" eyebrow="Guests coming over?" title="Crockery & serveware for the festive table" text="Dinner sets, serving bowls, tea cups and dry-fruit boxes." cta="Shop crockery">
          <ProductArt art={{ type: 'dinner-set', tone: 'cream' }} bare />
          <ProductArt art={{ type: 'cup-saucer', tone: 'teal' }} bare />
        </OccasionBanner>
      </section>
      <MegaOffer />
      <Rail eyebrow="Combos & bundles" title="Ready-Made Festive Sets" query="category=combos&limit=4" link="/shop/combos" sub="Everything in one box, for less than buying each item separately." />
      <Rail eyebrow="Loved by thousands" title="Best Sellers" query="flag=bestseller&limit=8" link="/shop?sort=popular" />
      <Divider />
      <Rail eyebrow="Crockery & dining" title="Set the Table for Guests" query="segment=dining&sort=popular&limit=4" link="/s/dining" sub="Dinner sets, serving bowls, tea cups and glassware." />
      <Rail eyebrow="Kitchen" title="Festive Cooking, Sorted" query="segment=kitchen&sort=popular&limit=4" link="/s/kitchen" sub="Kadhais, cookware, masala dabbas and storage." />
      <Rail eyebrow="Pooja & spiritual" title="Everything for the Pooja" query="segment=pooja&limit=4" link="/s/pooja" />
      <Rail eyebrow="Just arrived" title="New Arrivals" query="flag=new&sort=newest&limit=4" link="/shop?sort=newest" />
      <Rail eyebrow="Gifts & combos" title="Gifts for Every Occasion" query="segment=gifts&sort=rating&limit=4" link="/s/gifts" sub="Hampers, rakhis and ready-to-give sets." />
      <Trust />
      <Reviews />
      <Newsletter />
    </>
  );
}
