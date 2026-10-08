/**
 * DEMO ONLY — an in-browser stand-in for the Express API so the storefront and
 * admin panel can be previewed as a single static page. It mirrors the real
 * endpoints and reuses the SAME pricing engine (shared/pricing.js).
 * Data is kept in this browser's localStorage. Never used in production builds.
 */
import { normalizeIndianPhone } from '@shared/phone.js';
import { TOPICS, topicOf, SOLUTIONS, TICKET_STATUS } from '@shared/support.js';
import { passwordProblem, verifyTotp, newTotpSecret, otpauthUrl, newBackupCodes } from '@shared/security.js';
import { facetsFor, materialsOf } from '@shared/facets.js';
import { categories as seedCats, products as seedProducts, offers as seedOffers, settings as seedSettings, sampleReviews, bundles as seedBundles, shippingZones as seedZones } from '@shared/seedData.js';
import { boughtTogether, alsoViewed, alsoBought, similar, forYou, forCart, dealOfTheDay } from '@shared/recommend.js';
import { DEFAULT_CALENDAR, festivalAlertDue, digestDue, buildMessage, renderEmail, renderWhatsApp, newCode, upcoming, istDay } from '@shared/crm.js';
import { completions, POPULAR_SEARCHES, search, tokens, relevance, behaviour, itemToItem, bestSellerRanks, choicePicks, boughtLabel, vocabulary } from '@shared/ranking.js';
import { assist } from '@shared/ml/assistant.js';
import { ZONES as SHIP_ZONES, ZONE_KEYS as SHIP_ZONE_KEYS, zoneFor as pinZone, chargeableKg, parseWeight, parseDims, rateCardCost, customerFee, unitEconomics, priceForTarget, validPin, DEFAULT_RATE_CARD, DEFAULT_ZONE_FEES } from '@shared/shipping.js';
import { calcSellingPrice, PRICING_DEFAULTS, INTERNAL_KEYS } from '@shared/dealerPricing.js';
import { pickDealer, parsePins, maskForDealer, DEALER_STATUS, DEALER_TIMELINE, NEXT_STEP, isOpen, REJECT_REASONS, newOtp, COURIER_UPDATES, minutesBetween } from '@shared/dealers.js';
import { summarizeReviews } from '@shared/ml/text.js';
import { buildDealerDashboard, assertDealerSafe } from '@shared/dealerDashboard.js';
import { DOC_KINDS, DOC_STATUS, CUSTOMER_KINDS, DEALER_KINDS, CUSTOMER_CONSENTS, DEALER_CHECKS, BUSINESS_TYPES, DOC_TYPES, ONBOARDING_STATUS, ONBOARDING_STEPS, COMMERCIAL_MODELS, DEFAULT_COMMERCIAL, COMPANY_DEFAULTS, AUDIT_ACTIONS,
  requiredDocs, optionalDocs, onboardingProgress, latestDocs, dealerProblems, normalizeIds, maskAccount, fillTemplate, commercialSchedule, refNo } from '@shared/legal.js';
import { DEFAULT_LEGAL_DOCS } from '@shared/legalTemplates.js';
import { STARTER_POLICIES } from '@shared/policyTemplates.js';
import { WORKFLOW, EDITABLE_STATUSES, IN_PROGRESS_STATUSES, parseLegalDoc } from '@shared/legal.js';
import { policyCatalog, policyState, setIntro, acceptanceStats, buildLegalCenter, computeDealerHealth, healthRules, legalCalendar, docExpiry, HEALTH_LEVELS, HEALTH_METRICS, DEFAULT_HEALTH_RULES, VIOLATION_TYPES, SEVERITY, VIOLATION_STATUS, VIOLATION_ACTIONS, DOC_EXPIRY } from '@shared/compliance.js';
import { buildAgreementPdf } from '@shared/legalPdf.js';
import { forecastDemand, segmentCustomers, orderRisk } from '@shared/ml/insights.js';
import { writeProduct } from '@shared/ml/writer.js';
import { RETURN_REASONS, returnRefundAmount } from '@shared/returns.js';
import { computeSettlement } from '@shared/settlement.js';
import { ADMIN_ROLES, ROLE_KEYS, PERMISSIONS, ACTIONS, can as roleCan } from '@shared/roles.js';
import { computeQuote, isOfferLive, isProductEligible, offerLabel, offerMaxPercent, offerTag, offerHeadline } from '@shared/pricing.js';

const KEY = 'ug_demo_db_v15';
const nowIso = () => new Date().toISOString();
const ok = (data, status = 200) => ({ status, data });
const fail = (status, error, extra = {}) => ({ status, data: { error, ...extra } });

function seed() {
  const categories = seedCats.map((c, i) => ({ id: i + 1, ...c, sort_order: i, is_active: true }));
  const catId = Object.fromEntries(categories.map((c) => [c.slug, c.id]));
  const products = seedProducts.map((p, i) => ({
    id: i + 1, slug: p.slug, name: p.name, category_id: catId[p.category_slug], short_description: p.short_description,
    description: p.description, specs: p.specs, price: p.price * 100, mrp: p.mrp * 100, cost_price: p.cost * 100, rating: p.rating, rating_count: p.rating_count,
    art: p.art, is_active: true, is_featured: p.is_featured, is_bestseller: p.is_bestseller, is_new: p.is_new, is_diwali: p.is_diwali,
    sort_order: i, stock: p.stock, low_stock_threshold: 10, images: [], created_at: nowIso(),
    ships_international: p.ships_international !== false, is_bundle: false, bundle_items: [],
  }));
  seedBundles.forEach((b, i) => {
    const parts = b.items.map(([slug, qty]) => ({ p: products.find((x) => x.slug === slug), qty }));
    products.push({
      id: products.length + 1, slug: b.slug, name: b.name, category_id: catId.combos, short_description: b.short,
      description: `${b.short}. Everything you need in one box, at a better price than buying each item separately.`,
      specs: { "What's included": parts.map((x) => `${x.qty} × ${x.p.name}`).join(', '), Delivery: 'Dispatched within 24–48 hours. Delivered in 3–6 business days across India.' },
      price: b.price * 100, mrp: parts.reduce((s, x) => s + x.p.price * x.qty, 0), cost_price: parts.reduce((s, x) => s + x.p.cost_price * x.qty, 0),
      rating: 4.8, rating_count: 40 + i * 17, art: b.art, is_active: true, is_featured: true, is_bestseller: i === 0, is_new: true, is_diwali: true,
      sort_order: 100 + i, stock: b.stock, low_stock_threshold: 10, images: [], created_at: nowIso(),
      ships_international: parts.every((x) => x.p.ships_international), is_bundle: true, bundle_items: parts.map((x) => ({ product_id: x.p.id, qty: x.qty })),
    });
  });
  const offers = seedOffers.map((o, i) => ({
    id: i + 1, name: o.name, description: o.description, discount_type: o.discount_type, discount_value: o.discount_value,
    min_qty: o.min_qty, max_discount: o.max_discount, starts_at: o.starts_at && new Date(o.starts_at).toISOString(),
    ends_at: o.ends_at && new Date(o.ends_at).toISOString(), coupon_code: o.coupon_code, is_active: o.is_active, tiers: o.tiers || null, first_order_only: !!o.first_order_only,
    product_ids: [], category_ids: o.category_slugs.map((s) => catId[s]),
  }));
  const pid = (slug) => products.find((p) => p.slug === slug).id;
  const reviews = sampleReviews.map((r, i) => ({
    id: i + 1, product_id: pid(r.product), author: r.name, city: r.city, rating: r.rating, body: r.text, status: 'approved',
    is_verified_purchase: true, created_at: new Date(Date.now() - i * 864e5 * 3).toISOString(),
  }));
  const db = {
    seq: { order: 10244, id: 1000 }, categories, products, offers, reviews,
    settings: { ...seedSettings, fx_rates: JSON.parse(seedSettings.fx_rates) },
    zones: seedZones.map((z, i) => ({ id: i + 1, ...z, is_active: true, sort_order: i })),
    users: [], orders: [], wishlist: {}, addresses: [], carts: {}, session: null, admin: null, audit: [], notifications: [], newsletter: [],
    events: [], adSpend: [], checkouts: [],
  };
  // DEMO dealers (fictional shops) so the dealer app & Admin → Dealers have something to show
  const allCats = categories.map((c) => c.id);
  db.dealers = [
    { id: 1, name: 'Mahesh Joshi', business_name: 'Shree Ganesh Traders', phone: '9810022222', email: '', password: 'Dealer@2026', address: 'Shop 4, Laxmi Road', city: 'Pune', state: 'Maharashtra', pincode: '411002', gstin: '',
      pincodes: ['4110', '4111', '4120'], all_india: false, category_ids: allCats, product_ids: [], priority: 2, is_active: true, must_change_password: false, last_login_at: null, created_at: nowIso() },
    { id: 2, name: 'Sunil Verma', business_name: 'Verma Home Store', phone: '9810033333', email: '', password: 'Dealer@2026', address: 'B-12, Lajpat Nagar Market', city: 'Delhi', state: 'Delhi', pincode: '110024', gstin: '',
      pincodes: ['1100', '2013', '1220'], all_india: false, category_ids: allCats, product_ids: [], priority: 1, is_active: true, must_change_password: false, last_login_at: null, created_at: nowIso() },
    { id: 3, name: 'Asha Patil', business_name: 'Patil Kitchenware', phone: '9810044444', email: '', password: 'Dealer@2026', address: 'Dadar West', city: 'Mumbai', state: 'Maharashtra', pincode: '400028', gstin: '',
      pincodes: ['4000'], all_india: true, category_ids: categories.filter((c) => ['dining', 'kitchen'].includes(c.segment)).map((c) => c.id), product_ids: [], priority: 0, is_active: true, must_change_password: false, last_login_at: null, created_at: nowIso() },
  ];
  for (const d of db.dealers) d.onboarding_status = 'approved'; // final demo states are set at the end of seed()
  db.dealerOrders = []; db.dealerSession = null; db.dealerSettings = { auto_assign: true, auto_reassign: true, accept_minutes: 120 };
  db.pricingDefaults = { ...PRICING_DEFAULTS, shipping: 6000, packaging: 2000, other: 2000, profit_value: 30000 }; db.reviewEmail = 'team@utsavghar.in';
  // DEMO ONLY: example dealer submissions (simple drawn photos)
  const art = (bg, body) => `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 300 300'><rect width='300' height='300' fill='${bg}'/>${body}</svg>`)}`;
  const peacock = art('#F6EFE4', "<ellipse cx='150' cy='215' rx='90' ry='26' fill='#B8860B'/><path d='M70 205 Q150 250 230 205 L215 190 Q150 225 85 190Z' fill='#D4A017'/><path d='M150 60 Q105 120 150 190 Q195 120 150 60Z' fill='#1F7A6B'/><circle cx='150' cy='120' r='18' fill='#2D5B9A'/><circle cx='150' cy='120' r='8' fill='#F2C14E'/><path d='M150 40 Q140 22 150 8 Q160 22 150 40Z' fill='#FF8C1A'/>");
  const urli = art('#EFE6F4', "<ellipse cx='150' cy='170' rx='120' ry='40' fill='#B8860B'/><ellipse cx='150' cy='160' rx='110' ry='28' fill='#E8B33A'/><circle cx='110' cy='155' r='14' fill='#FF6B6B'/><circle cx='150' cy='150' r='14' fill='#FFD166'/><circle cx='190' cy='156' r='14' fill='#FF8FAB'/>");
  const torans = art('#E9F4EE', "<path d='M20 70 Q150 120 280 70' stroke='#8B5E3C' stroke-width='6' fill='none'/>" + [40, 80, 120, 160, 200, 240].map((x, i) => `<path d='M${x} ${86 + (i % 3) * 6} q-10 50 0 90 q10 -40 0 -90z' fill='#2E8B57'/><circle cx='${x}' cy='${190 + (i % 3) * 6}' r='10' fill='#FF9F1C'/>`).join(''));
  db.dealerProducts = [
    { id: 1, dealer_id: 1, product_id: null, status: 'pending', name: 'Handmade Peacock Brass Diya', category_id: catId['diyas-candles'], short_description: 'Solid brass diya with a peacock back',
      description: 'Hand-cast in solid brass by artisans in Moradabad, with a peacock back and a deep oil bowl that burns for about 2 hours on one fill. Polished golden finish.',
      specs: { Material: 'Solid brass', Dimensions: '12 × 8 × 15 cm', Weight: '450 g', "What's included": '1 diya, 10 cotton wicks' }, dealer_price: 40000, quantity: 25, images: [peacock], dealer_sku: 'SGT-PD-01', hsn: '7418',
      admin_note: null, internal_note: null, pricing: null, approved_dealer_price: null, revision: 1, submitted_at: new Date(Date.now() - 50 * 6e4).toISOString(), reviewed_at: null, published_at: null, updated_at: new Date(Date.now() - 50 * 6e4).toISOString() },
    { id: 2, dealer_id: 1, product_id: null, status: 'changes_requested', name: 'Brass Flower Urli Bowl (10 inch)', category_id: catId['home-decor'] || catId['diyas-candles'], short_description: 'Floating flower & diya bowl',
      description: 'Wide brass urli for floating flowers and diyas at the entrance. Hand-beaten texture.', specs: { Material: 'Brass', Dimensions: '25 cm wide' }, dealer_price: 65000, quantity: 10, images: [urli], dealer_sku: '', hsn: '',
      admin_note: 'Please add the weight and a photo with flowers inside.', internal_note: null, pricing: null, approved_dealer_price: null, revision: 1, submitted_at: new Date(Date.now() - 2 * 864e5).toISOString(), reviewed_at: new Date(Date.now() - 864e5).toISOString(), published_at: null, updated_at: new Date(Date.now() - 864e5).toISOString() },
    { id: 3, dealer_id: 2, product_id: null, status: 'pending', name: 'Mango Leaf Fabric Toran (5 ft)', category_id: catId['torans-hangings'] || catId['diyas-candles'], short_description: 'Washable fabric toran with marigold tassels',
      description: 'Handmade fabric mango-leaf toran with marigold tassels. Reusable every festival, wipe clean. Comes with hooks.', specs: { Material: 'Felt fabric', Dimensions: '150 cm long', "What's included": 'Toran + 2 hooks' }, dealer_price: 18000, quantity: 60, images: [torans], dealer_sku: 'VHS-T5', hsn: '6307',
      admin_note: null, internal_note: null, pricing: null, approved_dealer_price: null, revision: 1, submitted_at: new Date(Date.now() - 3 * 36e5).toISOString(), reviewed_at: null, published_at: null, updated_at: new Date(Date.now() - 3 * 36e5).toISOString() },
  ];
  // a few example orders so the admin dashboard has something to show
  const addr = { line1: '12, Shanti Nagar, MG Road', line2: '', city: 'Pune', state: 'Maharashtra', pincode: '411001' };
  const mk = (name, phone, items, steps, daysAgo, ref, src, dsteps = [], address = addr) => {
    const o = createOrder(db, { items: items.map(([s, q]) => ({ productId: pid(s), qty: q })), customer: { name, phone, email: '' }, address,
      attribution: src ? { utm_source: src[0], utm_medium: src[1], utm_campaign: src[2] } : {} });
    const t = new Date(Date.now() - daysAgo * 864e5).toISOString();
    o.created_at = t;
    o.events[0].created_at = t;
    if (ref) { o.payment.customer_ref = ref; o.payment.status = 'verification_pending'; o.payment_status = 'verification_pending'; o.events.push({ status: 'payment_submitted', created_at: t }); }
    for (const s of steps) adminAction(db, o, s, {});
    for (const [a, body] of dsteps) {
      const row = mCurrent(db, o.id); if (!row) continue;
      if (a === 'track') mCourierUpdate(db, row, body, 'courier'); else mDealerStep(db, mDealer(db, row.dealer_id), o.order_number, a, body || {});
    }
    o.estimated_delivery = new Date(Date.parse(o.created_at) + 6 * 864e5).toISOString().slice(0, 10);
    return o;
  };
  // DEMO ONLY: spread each order's steps over realistic times (minutes after the order was placed)
  const age = (o, m) => {
    const r = mCurrent(db, o.id); if (!r) return;
    const T = (k) => (m[k] == null ? null : new Date(Date.parse(o.created_at) + m[k] * 6e4).toISOString());
    for (const k of ['sent', 'accepted', 'packed', 'ready', 'out', 'delivered']) { const f = `${k}_at`; if (r[f]) r[f] = T(k) || r[f]; }
    if (r.courier_out_at) r.courier_out_at = T('cout'); if (r.closed_at) r.closed_at = r.delivered_at || r.closed_at;
    const ev = { payment_confirmed: T('sent') && new Date(Date.parse(T('sent')) - Math.min(4, m.sent / 2) * 6e4).toISOString(), sent_to_dealer: T('sent'), dealer_accepted: T('accepted'), packed: T('packed'), ready_for_delivery: T('ready'),
      shipped: T('out'), out_for_delivery: r.delivery_mode === 'courier' ? T('cout') : T('out'), delivery_attempted: T('fail'), delivered: T('delivered') };
    for (const e of o.events) if (ev[e.status]) e.created_at = ev[e.status];
    const tk = { picked_up: T('out'), in_transit: T('transit'), out_for_delivery: T('cout'), attempt_failed: T('fail'), delivered: T('delivered') };
    for (const x of r.tracking || []) if (tk[x.status]) x.at = tk[x.status];
    r.updated_at = [r.sent_at, r.accepted_at, r.packed_at, r.ready_at, r.out_at, r.delivered_at, ...(r.tracking || []).map((x) => x.at)].filter(Boolean).sort().at(-1);
  };
  const META = ['facebook', 'paid_social', 'diwali_prospecting'];
  const BIO = ['instagram', 'bio', 'link_in_bio'];
  const oRahul = mk('Rahul Mehta', '9876500001', [['premium-brass-diya', 1], ['copper-fairy-lights-10m', 1], ['marigold-toran', 1]], ['confirm_payment'], 4, null, META,
    [['accept'], ['pack', { all: true }], ['ready'], ['dispatch', { mode: 'courier', courier_name: 'Delhivery', awb: 'DLV2026104521', tracking_url: 'https://www.delhivery.com/' }], ['deliver']]);
  const oPriya = mk('Priya Rao', '9876500003', [['brass-pooja-thali-set', 1]], ['confirm_payment'], 2, null, BIO, [['accept']]);
  const oArjun = mk('Arjun Nair', '9876500004', [['akash-kandil-lantern', 2], ['rangoli-colours-10', 1]], ['confirm_payment'], 1, null, META);
  const oKavya = mk('Kavya Iyer', '9876500005', [['diwali-decor-combo', 1], ['premium-brass-diya', 1]], ['confirm_payment'], 3, null, META, [['accept'], ['pack', { all: true }], ['ready']]);
  mk('Neha Kapoor', '9876500002', [['diwali-hamper-classic', 2], ['akash-kandil-lantern', 1]], [], 0, '412345678901', BIO);
  const DEL = (line1, city, state, pincode) => ({ line1, line2: '', city, state, pincode });
  const C = (courier_name, awb) => ['dispatch', { mode: 'courier', courier_name, awb, tracking_url: '' }];
  const SELF = (rider_name, rider_phone) => ['dispatch', { mode: 'self', rider_name, rider_phone }];
  const OTP = (o) => { const r = mCurrent(db, o.id); mDealerStep(db, mDealer(db, r.dealer_id), o.order_number, 'deliver', { otp: r.otp }); };
  const FLOW = [['accept'], ['pack', { all: true }], ['ready']];
  const oSanjay = mk('Sanjay Kulkarni', '9876500011', [['brass-pooja-thali-set', 1], ['copper-kalash', 1]], ['confirm_payment'], 6, null, META, [...FLOW, SELF('Ganesh Pawar', '9822011111')]); OTP(oSanjay);
  const oMeena = mk('Meena Joshi', '9876500012', [['terracotta-diya-set-12', 2], ['rangoli-colours-10', 1]], ['confirm_payment'], 4, null, BIO,
    [...FLOW, C('Blue Dart', 'BD77123409IN'), ['track', { status: 'in_transit', location: 'Pune hub' }], ['track', { status: 'out_for_delivery', location: 'Kothrud' }], ['track', { status: 'attempt_failed', note: 'Customer not at home' }]], DEL('Flat 9, Sai Residency, Kothrud', 'Pune', 'Maharashtra', '411038'));
  const oDeepak = mk('Deepak Sharma', '9876500013', [['premium-brass-diya', 4], ['marigold-garland-5', 1]], ['confirm_payment'], 8, null, META,
    [...FLOW, C('DTDC', 'D41233098761'), ['track', { status: 'in_transit', location: 'Delhi hub' }]], DEL('C-44, Defence Colony', 'New Delhi', 'Delhi', '110024'));
  const oAmit = mk('Amit Arora', '9876500014', [['lotus-tealight-holder', 2], ['scented-jar-candle-sandal', 2]], ['confirm_payment'], 3, null, BIO,
    [...FLOW, C('Delhivery', 'DLV2026104588'), ['track', { status: 'in_transit', location: 'Gurgaon hub' }], ['track', { status: 'out_for_delivery', location: 'Lajpat Nagar' }]], DEL('B-12, Lajpat Nagar II', 'New Delhi', 'Delhi', '110024'));
  const oPooja = mk('Pooja Bansal', '9876500015', [['brass-pooja-bell', 1], ['incense-gift-box', 2]], ['confirm_payment'], 10, null, META, [...FLOW, SELF('Ravi Yadav', '9811099999')], DEL('A-21, Sector 50', 'Noida', 'Uttar Pradesh', '201301')); OTP(oPooja);
  const oRohan = mk('Rohan Gupta', '9876500016', [['floating-diya-set-6', 2]], ['confirm_payment'], 0.1, null, BIO, [['accept'], ['pack', { all: true }]], DEL('H-7, Malviya Nagar', 'New Delhi', 'Delhi', '110017'));
  const oSneha = mk('Sneha Patil', '9876500017', [['ceramic-dinner-set-18', 1], ['brass-bhojan-thali', 1]], ['confirm_payment'], 5, null, META,
    [...FLOW, C('Xpressbees', 'XB1406223385'), ['track', { status: 'in_transit', location: 'Mumbai hub' }], ['track', { status: 'out_for_delivery', location: 'Dadar' }], ['track', { status: 'delivered', received_by: 'Sneha (self)' }]], DEL('12, Shivaji Park Road', 'Mumbai', 'Maharashtra', '400028'));
  const oKiran = mk('Kiran Desai', '9876500018', [['brass-pongal-pot', 1]], ['confirm_payment'], 0.05, null, BIO, [], DEL('5, Juhu Tara Road', 'Mumbai', 'Maharashtra', '400049'));
  age(oRahul, { sent: 6, accepted: 40, packed: 190, ready: 230, out: 300, transit: 900, cout: 2700, delivered: 2900 });
  age(oPriya, { sent: 5, accepted: 95 });
  age(oArjun, { sent: 8 });
  age(oKavya, { sent: 4, accepted: 30, packed: 160, ready: 200 });
  age(oSanjay, { sent: 5, accepted: 22, packed: 110, ready: 140, out: 200, delivered: 330 });
  age(oMeena, { sent: 7, accepted: 55, packed: 210, ready: 260, out: 320, transit: 1100, cout: 2650, fail: 2900 });
  age(oDeepak, { sent: 9, accepted: 70, packed: 300, ready: 380, out: 460, transit: 1500 });
  age(oAmit, { sent: 4, accepted: 18, packed: 95, ready: 130, out: 190, transit: 1400, cout: 2900 });
  age(oPooja, { sent: 6, accepted: 25, packed: 120, ready: 150, out: 240, delivered: 380 });
  age(oRohan, { sent: 3, accepted: 30, packed: 120 });
  age(oSneha, { sent: 5, accepted: 140, packed: 400, ready: 460, out: 600, transit: 1700, cout: 4100, delivered: 4300 });
  age(oKiran, { sent: 2 });
  // example traffic so the Marketing page isn't empty (demo only)
  const steps = ['page_view', 'view_item', 'add_to_cart', 'begin_checkout'];
  const mix = [[META, 180, [1, 0.62, 0.2, 0.09]], [BIO, 95, [1, 0.7, 0.26, 0.12]], [[null, null, null], 60, [1, 0.5, 0.15, 0.06]]];
  let sid = 0;
  for (const [src, n, rates] of mix) for (let i = 0; i < n; i++) {
    sid++; const t = new Date(Date.now() - ((i * 7) % 14) * 864e5 - (i % 23) * 36e5).toISOString();
    steps.forEach((type, k) => { if ((i % 100) / 100 < rates[k]) db.events.push({ session_id: `demo${sid}`, type, utm_source: src[0], utm_campaign: src[2], created_at: t }); });
  }
  // example product views so "also viewed" has data (demo only)
  for (let k = 1; k <= 140; k++) {
    const pool = products.filter((p) => p.category_id === categories[k % categories.length].id || p.category_id === categories[(k * 3) % categories.length].id);
    for (let j = 0; j < Math.min(3, pool.length); j++) db.events.push({ session_id: `demov${k}`, type: 'view_item', product_id: pool[(k + j * 2) % pool.length].id, created_at: nowIso() });
  }
  db.demoHistory = demoHistory(categories, products);
  // example subscribers & messages so Admin → Customer messages has something to show (demo only)
  db.subscribers = []; db.crmMessages = [];
  const subAgo = (d) => new Date(Date.now() - d * 864e5).toISOString();
  [['Anita Desai', 'anita@example.com', '9876500021', 'daily', ['pooja', 'festive-decor'], 'popup', 2],
    ['Rohit Malhotra', '', '9876500022', 'weekly', ['kitchen', 'dining'], 'checkout', 5],
    ['Farah Khan', 'farah@example.com', '', 'festivals', ['gifts'], 'footer', 9],
    ['Vikram Rao', 'vikram@example.com', '+971501112233', 'daily', [], 'popup', 1]].forEach(([name, email, phone, frequency, interests, source, d], i) => {
    db.subscribers.push({ id: i + 1, token: `demo-token-${i + 1}`, name, email: email || null, phone: phone || null, country: phone.startsWith('+971') ? 'AE' : 'IN',
      email_opt_in: email ? 1 : 0, whatsapp_opt_in: phone ? 1 : 0, frequency, interests, signals: { viewed: products.filter((p) => interests.includes(categories.find((c) => c.id === p.category_id)?.segment)).slice(0, 3).map((p) => p.id) },
      source, status: 'active', consent_at: subAgo(d), created_at: subAgo(d), last_digest_at: null, last_festival_at: null });
  });
  const month = new Date().toISOString().slice(0, 7);
  db.adSpend.push({ id: 1, month, source: 'facebook', campaign: 'diwali_prospecting', amount: 350000, notes: 'Example — replace with your real Ads Manager spend', created_at: nowIso() });
  const ago = (m) => new Date(Date.now() - m * 6e4).toISOString();
  db.checkouts.push(
    { id: 1, token: 'demo-restore-token-aaaa', name: 'Sneha Joshi', email: 'sneha@example.com', phone: '9876500011', country: 'IN', consent: true, items: [{ productId: pid('lakshmi-pooja-combo'), qty: 1 }], value: 149900, utm_source: 'facebook', utm_campaign: 'diwali_prospecting', reminded_at: null, order_id: null, created_at: ago(190), updated_at: ago(180) },
    { id: 2, token: 'demo-restore-token-bbbb', name: 'Aman Verma', email: '', phone: '+971501234567', country: 'AE', consent: false, items: [{ productId: pid('brass-pooja-thali-set'), qty: 1 }], value: 360000, utm_source: 'instagram', utm_campaign: 'link_in_bio', reminded_at: null, order_id: null, created_at: ago(400), updated_at: ago(390) },
  );
  // DEMO ONLY: a year of fictional history for the dealer dashboard (Shree Ganesh Traders, Pune; Verma Home Store, Delhi)
  db.dealerStockMoves = []; db.dealerArchive = [];
  {
    let r = 20261005; const rnd = () => { r = (r * 1103515245 + 12345) % 2147483648; return r / 2147483648; };
    const pickCats = { 1: ['diyas-candles', 'lanterns', 'pooja-essentials', 'door-wall-decor', 'flowers-rangoli', 'home-decor'], 2: ['diwali-lights', 'festive-decor', 'serveware'] };
    const cities = { 1: [['Pune', '411038'], ['Pune', '411001'], ['Pimpri', '411018'], ['Pune', '411045'], ['Chakan', '412105']], 2: [['Delhi', '110017'], ['Noida', '201301'], ['Gurugram', '122001'], ['Delhi', '110024']] };
    let nextDp = 100;
    for (const did of [1, 2]) {
      const d = db.dealers.find((x) => x.id === did);
      const mine = pickCats[did].map((slug) => products.find((p) => !p.is_bundle && p.category_id === catId[slug])).filter(Boolean);
      d.product_ids = mine.map((p) => p.id);
      mine.forEach((p, i) => {
        const at = new Date(Date.now() - (300 - i * 20) * 864e5).toISOString();
        if (did === 1 && i === 2) p.stock = 3;           // low stock example
        if (did === 1 && i === 5) p.stock = 0;           // out of stock example
        db.dealerProducts.push({ id: nextDp++, dealer_id: did, product_id: p.id, status: 'approved', name: p.name, category_id: p.category_id, short_description: p.short_description || '', description: p.description || '', specs: p.specs || {},
          dealer_price: p.cost_price, approved_dealer_price: p.cost_price, quantity: p.stock, images: [], dealer_sku: '', hsn: '', admin_note: i === 0 ? 'Looks great — live now.' : null, internal_note: null, pricing: null, revision: 1,
          submitted_at: at, reviewed_at: new Date(Date.parse(at) + 864e5).toISOString(), published_at: new Date(Date.parse(at) + 864e5).toISOString(), updated_at: i === 2 || i === 5 ? new Date(Date.now() - 5 * 36e5).toISOString() : new Date(Date.parse(at) + 864e5).toISOString() });
        db.dealerStockMoves.push({ dealer_id: did, product_name: p.name, delta: 40 + Math.round(rnd() * 40), at });
        for (let t = Date.parse(at) + 18 * 864e5; t < Date.now() - 2 * 864e5; t += (12 + rnd() * 14) * 864e5) db.dealerStockMoves.push({ dealer_id: did, product_name: p.name, delta: 15 + Math.round(rnd() * 35), at: new Date(t).toISOString() });
      });
      // orders: more in the festive months (Aug–Nov), fewer in the summer
      const season = [0.6, 0.5, 0.7, 0.5, 0.4, 0.5, 0.7, 1.1, 1.4, 2.4, 2.0, 0.9];
      let n = 1;
      for (let day = 364; day >= 2; day -= 1) {
        const t0 = Date.now() - day * 864e5; const m = new Date(t0).getMonth();
        const k = (did === 1 ? 1.1 : 0.7) * season[m] * (1 + (364 - day) / 700);
        let count = Math.floor(k) + (rnd() < k - Math.floor(k) ? 1 : 0);
        while (count-- > 0) {
          const sent = t0 + (9 + rnd() * 10) * 36e5;
          const lines = []; const nl = rnd() < 0.25 ? 2 : 1;
          for (let j = 0; j < nl; j++) { const p = mine[Math.floor(rnd() * rnd() * mine.length)]; const qty = rnd() < 0.2 ? 2 : 1; if (!lines.some((l) => l.product_id === p.id)) lines.push({ product_id: p.id, name: p.name, qty, value: p.cost_price * qty }); }
          const rejected = rnd() < 0.05; const [city, pin] = cities[did][Math.floor(rnd() * cities[did].length)];
          const acc = sent + (8 + rnd() * 70) * 6e4; const out = acc + (2 + rnd() * 20) * 36e5;
          db.dealerArchive.push({ dealer_id: did, order_number: `UG${did}${String(n++).padStart(5, '0')}`, status: rejected ? 'rejected' : 'delivered', sent_at: new Date(sent).toISOString(),
            accepted_at: rejected ? null : new Date(acc).toISOString(), out_at: rejected ? null : new Date(out).toISOString(), delivered_at: rejected ? null : new Date(out + (4 + rnd() * 40) * 36e5).toISOString(), city, pincode: pin, cancelled: false, lines });
        }
      }
    }
  }
  // legal documents (v1.0) + demo onboarding states: dealer 1 approved & signed, 2 in grace period, 3 signed and waiting for verification
  db.legalDocs = Object.entries(DEFAULT_LEGAL_DOCS).map(([kind, d], i) => ({ id: i + 1, kind, version: '1.0', title: d.title, body: d.body, status: 'published', material: true, legal_approved: false, change_note: 'First version (sample text)', effective_at: new Date(Date.now() - 400 * 864e5).toISOString(), published_at: new Date(Date.now() - 400 * 864e5).toISOString(), created_at: new Date(Date.now() - 400 * 864e5).toISOString(), updated_at: new Date(Date.now() - 400 * 864e5).toISOString() }));
  db.legalAcc = []; db.legalAudit = []; db.dealerDocs = []; db.legalCompany = {}; db.settings.guest_checkout = false;
  {
    const ago = (d) => new Date(Date.now() - d * 864e5).toISOString();
    const kyc = {
      1: { legal_name: 'Shree Ganesh Traders', business_type: 'proprietorship', registered_address: 'Shop 4, Laxmi Road, Pune', pan: 'AJKPJ1234K', gstin: '27AJKPJ1234K1Z3', bank_name: 'State Bank of India', bank_holder: 'Mahesh Joshi', bank_last4: '4321', bank_account_enc: btoa('enc:30214567894321'), ifsc: 'SBIN0001234', email: 'mahesh@shreeganesh.example' },
      3: { legal_name: 'Patil Kitchenware LLP', business_type: 'llp', registered_address: 'Dadar West, Mumbai', pan: 'AAKFP5678L', gstin: '27AAKFP5678L1Z9', cin: 'AAB-1234', bank_name: 'HDFC Bank', bank_holder: 'Patil Kitchenware LLP', bank_last4: '7788', bank_account_enc: btoa('enc:50100023457788'), ifsc: 'HDFC0000240', email: 'asha@patilkitchen.example' },
    };
    for (const d of db.dealers) Object.assign(d, { onboarding_status: 'draft', onboarding_deadline: new Date(Date.now() + (d.id === 3 ? 9 : 11) * 864e5).toISOString(), self_registered: false, country: 'India' }, kyc[d.id] || {});
    const pdfOrPng = (t) => (['address_proof', 'bank_proof'].includes(t) ? 'image/png' : 'application/pdf');
    for (const id of [1, 3]) {
      const d = db.dealers.find((x) => x.id === id);
      for (const t of requiredDocs(d)) db.dealerDocs.push({ id: db.dealerDocs.length + 1, dealer_id: id, doc_type: t, doc_number: t === 'pan_card' ? d.pan : t === 'gst_certificate' ? d.gstin : null, data: null, original_name: `${t.replace(/_/g, '-')}${pdfOrPng(t) === 'image/png' ? '.png' : '.pdf'}`, mime: pdfOrPng(t), size: 180000 + t.length * 900, status: id === 1 ? 'verified' : 'pending', reject_reason: null, expiry_date: null, uploaded_at: ago(id === 1 ? 200 : 2) });
      const sig = { typed_name: d.name, capacity: id === 1 ? 'Proprietor' : 'Designated Partner', otp_ref: `OTP-DEMO${id}`, checks: DEALER_CHECKS.map((c) => ({ key: c.key, label: c.label })) };
      lgAccept(db, 'dealer', d, DEALER_KINDS, { typed_name: d.name, signature: sig, consents: Object.fromEntries(DEALER_CHECKS.map((c) => [c.key, true])) }, () => lgDealerVars(db, d, sig));
      for (const a of db.legalAcc.filter((x) => x.subject_id === id && x.subject_type === 'dealer')) a.accepted_at = ago(id === 1 ? 199 : 1);
      d.submitted_at = ago(id === 1 ? 199 : 1);
      d.onboarding_status = id === 1 ? 'approved' : 'under_review';
      if (id === 1) { d.onboarding_deadline = null; d.approved_at = ago(198); }
      lgAudit(db, { actor_type: 'dealer', actor_id: id, subject_type: 'dealer', subject_id: id, action: 'dealer_signed', detail: { typed_name: d.name } });
      if (id === 1) lgAudit(db, { actor_type: 'admin', actor_id: 1, subject_type: 'dealer', subject_id: id, action: 'dealer_approved', detail: {} });
    }
    // Legal & Compliance Center demo: review dates on the live documents, the other policies as starter drafts (a few moving through review)
    const inDays = (n) => new Date(Date.now() + n * 864e5).toISOString();
    const review = { customer_terms: 21, privacy: -12, refund_cancellation: 75, dealer_agreement: 140, marketplace_policy: 140 };
    for (const r of db.legalDocs) Object.assign(r, { category: DOC_KINDS[r.kind].category, icon: DOC_KINDS[r.kind].icon, description: DOC_KINDS[r.kind].desc, applies_to: DOC_KINDS[r.kind].category === 'dealer' ? 'dealers' : 'customers', countries: 'India', owner_name: DOC_KINDS[r.kind].category === 'dealer' ? 'Operations team' : 'Mohit (Founder)', next_review_at: inDays(review[r.kind] ?? 90), created_by_name: 'System (sample text)' });
    const stage = { shipping_policy: ['internal_review', 6], payment_policy: ['legal_review', 4], listing_policy: ['changes_requested', 3], kyc_policy: ['approved', 1] };
    for (const [kind, d] of Object.entries(STARTER_POLICIES)) {
      const [st, dd] = stage[kind] || ['draft', 30];
      const m = DOC_KINDS[kind];
      db.legalDocs.push({ id: db.legalDocs.length + 1, kind, version: '1.0', title: d.title, body: d.body, status: st, material: false, legal_approved: false, change_note: 'First version', effective_at: null, published_at: null,
        created_at: ago(30), updated_at: ago(dd), category: m.category, icon: m.icon, description: m.desc, applies_to: m.category === 'dealer' ? 'dealers' : m.category === 'customer' ? 'customers' : 'everyone', countries: 'India',
        owner_name: m.category === 'dealer' ? 'Operations team' : null, created_by_name: 'System (starter template)', next_review_at: null,
        ...(st !== 'draft' ? { internal_submitted_at: ago(dd + 1) } : {}), ...(['legal_review', 'approved'].includes(st) ? { internal_reviewer: 'Store Owner', internal_reviewed_at: ago(dd), submitted_review_at: ago(dd) } : {}),
        ...(st === 'approved' ? { legal_reviewer: 'Demo reviewer (replace with your lawyer)', approved_at: ago(1), approved_by_name: 'Store Owner' } : {}),
        ...(st === 'changes_requested' ? { review_note: 'Add the photo size rules and the return of rejected stock' } : {}) });
    }
    db.violations = [
      { id: 1, dealer_id: 3, type: 'incorrect_info', severity: 'medium', title: VIOLATION_TYPES.incorrect_info, description: 'Steel Masala Dabba listing says 7 bowls; customers received 6.', policy_kind: 'listing_policy', status: 'open', due_at: inDays(5), product_id: null,
        history: [{ at: ago(2), by: 'Store Owner', action: 'opened', note: 'Steel Masala Dabba listing says 7 bowls; customers received 6.' }], created_by_name: 'Store Owner', created_at: ago(2), updated_at: ago(2) },
      { id: 2, dealer_id: 2, type: 'document_expired', severity: 'high', title: VIOLATION_TYPES.document_expired, description: 'Trade licence expired — upload the renewed licence.', policy_kind: 'kyc_policy', status: 'resolved', due_at: null, product_id: null,
        history: [{ at: ago(9), by: 'Store Owner', action: 'opened', note: 'Trade licence expired — upload the renewed licence.' }, { at: ago(6), by: 'Store Owner', action: 'resolve', note: 'Renewed licence received' }], created_by_name: 'Store Owner', created_at: ago(9), updated_at: ago(6), closed_at: ago(6) },
    ];
    db.dealerDocs.push({ id: db.dealerDocs.length + 1, dealer_id: 1, doc_type: 'trade_license', doc_number: 'PMC/SE/2024/0193', data: null, original_name: 'trade-licence.pdf', mime: 'application/pdf', size: 150000, status: 'verified', reject_reason: null, expiry_date: inDays(18).slice(0, 10), uploaded_at: ago(300) });
    db.legalNotices = [
      { id: 2, audience: 'admin', dealer_id: null, kind: 'ready', title: 'Dealer Registration & KYC Policy v1.0 is ready for publication.', body: 'Approved by the demo reviewer.', link: 'policy:kyc_policy', created_at: ago(1), read_at: null },
      { id: 1, audience: 'admin', dealer_id: null, kind: 'changes', title: 'Changes requested on Product Listing & Quality Policy v1.0', body: 'Add the photo size rules and the return of rejected stock', link: 'policy:listing_policy', created_at: ago(3), read_at: null },
    ];
    lgAudit(db, { actor_type: 'admin', actor_id: 1, action: 'version_returned', detail: { kind: 'listing_policy', version: '1.0', title: 'Product Listing & Quality Policy', note: 'Add the photo size rules and the return of rejected stock' } });
    lgAudit(db, { actor_type: 'admin', actor_id: 1, action: 'version_approved', detail: { kind: 'kyc_policy', version: '1.0', title: 'Dealer Registration & KYC Policy', reviewer: 'Demo reviewer (replace with your lawyer)' } });
  }
  return db;
}

/**
 * DEMO ONLY — simulated shopper history (past 30 days) so the ranking and
 * "customers also bought" maths has something to learn from in the preview.
 * Customers mostly shop within one section plus its natural add-ons. The real
 * store uses real orders and product views instead.
 */
function demoHistory(categories, products) {
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const segOf = new Map(categories.map((c) => [c.id, c.segment]));
  const bySeg = {};
  for (const p of products) (bySeg[segOf.get(p.category_id)] ||= []).push(p);
  const PAIR = { 'festive-decor': 'pooja', pooja: 'festive-decor', 'home-decor': 'festive-decor', dining: 'kitchen', kitchen: 'dining', gifts: 'festive-decor' };
  const pick = (list) => { const w = list.map((p) => (p.rating_count || 1) * (p.is_bestseller ? 2 : 1)); let r = rnd() * w.reduce((a, b) => a + b, 0); for (let i = 0; i < list.length; i++) { r -= w[i]; if (r <= 0) return list[i]; } return list[0]; };
  const segs = Object.keys(bySeg);
  const orders = [];
  for (let c = 0; c < 320; c++) {
    const seg = segs[Math.floor(rnd() * rnd() * segs.length)]; // some sections are busier
    const n = 1 + Math.floor(rnd() * 3);
    const items = new Map();
    for (let k = 0; k < n; k++) {
      const from = k > 0 && rnd() < 0.35 && bySeg[PAIR[seg]] ? bySeg[PAIR[seg]] : bySeg[seg];
      const p = pick(from);
      items.set(p.id, 1 + (rnd() < 0.2 ? 1 : 0));
    }
    const at = new Date(Date.now() - Math.floor(rnd() * rnd() * 30 * 864e5)).toISOString(); // more recent than old
    orders.push({ customer: `demo-c${c}`, at, items: [...items].map(([product_id, qty]) => ({ product_id, qty })) });
  }
  return orders;
}

let DB;
function load() {
  if (DB) return DB;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) DB = JSON.parse(raw);
  } catch { /* ignore */ }
  if (!DB) DB = seed();
  if (!DB.afterSalesSeeded) { try { mSeedAfterSales(DB); } catch (e) { console.warn('after-sales seed', e); } DB.afterSalesSeeded = true; }
  return DB;
}
/** Preview data: one paid settlement for dealer 1 and one open return, so those pages are not empty. */
function mSeedAfterSales(db) {
  const done = (db.dealerOrders || []).filter((r) => r.dealer_id === 1 && r.status === 'delivered').sort((a, b) => String(a.delivered_at).localeCompare(String(b.delivered_at)));
  if (done.length >= 2) {
    const take = done.slice(0, Math.max(1, Math.floor(done.length / 2)));
    const p = mPreview(db, 1);
    const pick = p.sales.filter((x) => take.some((t) => t.id === x.ref));
    const totals = computeSettlement({ model: p.model, sales: pick, returns: [], adjustments: [], terms: {} });
    if (totals.net > 0) {
      const s = { id: ++db.seq.id, number: 'STL-1001', dealer_id: 1, model: p.model, orders: totals.orders, gross: totals.gross, returns: 0, fees: 0, breakdown: totals, adjustments: [], net: totals.net, status: 'paid', utr: 'SBIN26278419305', paid_on: new Date(Date.now() - 3 * 864e5).toISOString().slice(0, 10), note: null, created_at: new Date(Date.now() - 4 * 864e5).toISOString() };
      db.settlements = [s]; db.settleItems = pick.map((x) => ({ settlement_id: s.id, kind: 'sale', ref_id: x.ref, label: x.order_number, amount: x.value, active: true }));
    }
  }
  const o = db.orders.find((x) => x.status === 'delivered' && x.payment_status === 'confirmed' && x.items.length);
  if (o) {
    const line = o.items[0];
    if (!o.events.some((e) => e.status === 'delivered')) o.events.push({ status: 'delivered', note: null, created_at: new Date(Date.now() - 864e5).toISOString() });
    db.returns = [{ id: ++db.seq.id, number: 'RET-1001', order_id: o.id, user_id: o.user_id, items: [{ order_item_id: 1, product_id: line.product_id, name: line.name, qty: 1, paid: Math.round((line.line_total - (line.discount_share || 0)) / line.qty) }], reason: 'damaged', details: 'One piece arrived cracked.', photo: null, status: 'requested', refund_amount: Math.round((line.line_total - (line.discount_share || 0)) / line.qty) + (o.totals.delivery || 0), includes_delivery: (o.totals.delivery || 0) > 0, created_at: new Date(Date.now() - 6 * 36e5).toISOString() }];
  }
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(DB)); } catch { /* storage full or blocked — keep in memory */ }
}

// ---- helpers mirroring server/src/lib/catalog.js ---------------------------
const cat = (db, id) => db.categories.find((c) => c.id === id);
const prod = (db, id) => db.products.find((p) => p.id === id);
const headline = (db) => db.offers.filter((o) => isOfferLive(o) && !o.coupon_code).sort((a, b) => offerMaxPercent(b) - offerMaxPercent(a))[0] || null;
const parts = (db, p) => (p.is_bundle ? (p.bundle_items || []).map((b) => ({ ...b, p: prod(db, b.product_id) })).filter((x) => x.p) : null);
function effStock(db, p) {
  const ps = parts(db, p);
  if (!ps?.length) return p.stock;
  return Math.max(0, Math.min(p.stock, ...ps.map((x) => (x.p.is_active ? Math.floor(x.p.stock / x.qty) : 0))));
}
function serialize(db, p, admin = false) {
  const c = cat(db, p.category_id) || {};
  const off = headline(db);
  const stock = effStock(db, p);
  const ps = parts(db, p);
  const out = {
    ...p, category_slug: c.slug, category_name: c.name,
    discount_pct: p.mrp > p.price ? Math.round(((p.mrp - p.price) / p.mrp) * 100) : 0,
    stock_status: stock <= 0 ? 'out_of_stock' : stock <= p.low_stock_threshold ? 'low_stock' : 'in_stock',
    stock_left: stock <= p.low_stock_threshold ? stock : undefined,
    offer_eligible: off ? isProductEligible(off, p) : false,
    is_bundle: !!p.is_bundle, ships_international: p.ships_international !== false, segment: c.segment,
    url: `/shop/${c.slug}/${p.slug}`,
    seo_title: p.seo_title || `${p.name} | Utsav Ghar`,
    seo_description: p.seo_description || p.short_description,
    bundle_items: undefined,
    ...(admin ? {} : { stock: undefined, cost_price: undefined }),
  };
  if (ps) {
    out.bundle_items = ps.map((x) => ({ product_id: x.product_id, name: x.p.name, slug: x.p.slug, qty: x.qty, price: x.p.price, url: `/shop/${cat(db, x.p.category_id)?.slug}/${x.p.slug}` }));
    out.bundle_worth = ps.reduce((s, x) => s + x.p.price * x.qty, 0);
    if (admin) out.bundle_cost = ps.reduce((s, x) => s + (x.p.cost_price || 0) * x.qty, 0);
  }
  return out;
}
const pubOffer = (o) => ({ ...o, label: offerLabel(o), tag: offerTag(o), headline: offerHeadline(o) });
const pubZone = (z) => ({ code: z.code, name: z.name, countries: z.countries, fee: z.fee, extra_item_fee: z.extra_item_fee, free_above: z.free_above, delivery_text: z.delivery_text, duties_note: z.duties_note });
const liveZones = (db) => db.zones.filter((z) => z.is_active).sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
function zoneFor(db, country = 'IN') {
  const c = String(country || 'IN').toUpperCase(); const zs = liveZones(db);
  return zs.find((z) => z.countries.includes(c)) || zs.find((z) => z.countries.includes('*')) || zs.find((z) => z.code === 'IN') || null;
}
function publicSettings(db) {
  const s = db.settings;
  const keys = ['store_name', 'support_phone', 'whatsapp_number', 'support_email', 'upi_id', 'upi_payee_name', 'upi_qr_url', 'festival_name', 'festival_date', 'festival_emoji', 'festival_headline', 'festival_subtitle', 'payment_mode', 'gateway_provider', 'gateway_key_id', 'delivery_fee', 'free_delivery_above', 'require_txn_ref', 'allow_screenshot', 'meta_pixel_id', 'ga4_measurement_id', 'fx_markup_pct'];
  return { ...Object.fromEntries(keys.map((k) => [k, s[k]])), guest_checkout: !!s.guest_checkout, app_store_url: s.app_store_url || '', play_store_url: s.play_store_url || '', international_enabled: !!s.international_enabled, fx_rates: s.fx_rates || {}, shipping_zones: liveZones(db).map(pubZone), signup_otp: true };
}
const digits = (x) => String(x || '').replace(/\D/g, '').slice(-10);
const isFirstOrder = (db, { phone, email } = {}) => {
  if (!phone && !email) return undefined;
  return !db.orders.some((o) => o.status !== 'cancelled' && ((phone && digits(o.customer.phone) === digits(phone)) || (email && o.customer.email && o.customer.email.toLowerCase() === String(email).toLowerCase())));
};
function quote(db, items, couponCode, { country = 'IN', firstOrder, pincode } = {}) {
  const products = new Map(db.products.map((p) => [p.id, { ...p, stock: effStock(db, p), ships_international: p.ships_international !== false }]));
  const zone = zoneFor(db, country);
  const international = String(country || 'IN').toUpperCase() !== 'IN';
  const ss = shipSettings(db);
  const dz = !international && ss.zone_delivery ? (() => { const o = shipOrigin(db, items, pincode); const zk = validPin(pincode) ? pinZone(o.pin, pincode) : 'national'; return { zone: zk, ...ss.zone_fees[zk], known: validPin(pincode) }; })() : null;
  const shipping = dz ? { delivery_fee: dz.fee, free_delivery_above: dz.free_above, international }
    : zone ? { delivery_fee: zone.fee, free_delivery_above: zone.free_above, extra_item_fee: zone.extra_item_fee, international }
      : { delivery_fee: db.settings.delivery_fee, free_delivery_above: db.settings.free_delivery_above, international };
  const q = computeQuote({ items, products, offers: db.offers, couponCode, settings: shipping, customer: { firstOrder } });
  q.country = String(country || 'IN').toUpperCase();
  q.zone = zone ? pubZone(zone) : null;
  q.delivery_zone = dz ? { key: dz.zone, label: SHIP_ZONES[dz.zone].label, known: dz.known, fee: dz.fee, free_above: dz.free_above } : null;
  if (international && !db.settings.international_enabled) q.errors.push({ code: 'NO_INTERNATIONAL', message: 'We are not shipping outside India yet.' });
  for (const l of q.lines) {
    const p = products.get(l.productId);
    l.art = p.art; l.image = p.images[0]?.url || null; l.category_slug = cat(db, p.category_id)?.slug; l.url = `/shop/${l.category_slug}/${p.slug}`; l.is_bundle = !!p.is_bundle;
  }
  return q;
}
const TIMELINE = [
  ['placed', 'Order Placed', '🛒'], ['payment_confirmed', 'Payment Confirmed', '💳'], ['processing', 'Processing', '📦'],
  ['shipped', 'Shipped', '🚚'], ['out_for_delivery', 'Out for Delivery', '🏠'], ['delivered', 'Delivered', '✅'],
];
function detail(o, admin = false) {
  const reached = new Set(o.events.map((e) => e.status));
  return {
    ...o, token: undefined, attribution: admin ? o.attribution : undefined,
    address: { ...o.address, country: o.address.country || 'IN' }, currency: o.currency || 'INR', payment_method: o.payment_method || 'upi',
    items: o.items.map((i) => (admin ? i : { ...i, unit_cost: undefined, discount_share: undefined })),
    events: admin ? o.events : o.events.filter((e) => e.status !== 'conversion_reported'),
    timeline: (reached.has('sent_to_dealer') ? DEALER_TIMELINE.map((x) => [x.key, x.label, x.icon]) : TIMELINE).map(([key, label, icon]) => ({ key, label, icon, done: reached.has(key), at: o.events.find((e) => e.status === key)?.created_at || null })),
    payment: { ...o.payment, has_screenshot: !!o.payment.screenshot, screenshot: admin ? o.payment.screenshot : undefined },
    delivery: reached.has('sent_to_dealer') && DB ? mDeliveryFor(DB, o, admin) : null,
    dealer: admin && DB ? mAdminPanel(DB, o) : undefined,
    economics: admin && DB ? orderEcon(DB, o) : undefined,
    after_sales: DB ? mAfterSales(DB, o) : null,
    ship_zone: undefined, ship_origin_pin: undefined, ship_kg: undefined, ship_cost_est: undefined, ship_cost_actual: undefined, ship_cost_source: undefined,
  };
}

// ---- dealers (same rules as server/src/lib/dealers.js via shared/dealers.js) ----
function mDealer(db, id) { return (db.dealers || []).find((d) => d.id === id); }
function mAllDealers(db) {
  return (db.dealers || []).map((d) => ({ ...d, can_receive_orders: mCanReceive(d), open_orders: db.dealerOrders.filter((r) => r.dealer_id === d.id && isOpen(r.status)).length }));
}
function mCurrent(db, orderId) { return [...(db.dealerOrders || [])].reverse().find((r) => r.order_id === orderId && !['rejected', 'reassigned'].includes(r.status)) || null; }
function mItems(db, o) { return o.items.map((i) => ({ product_id: i.product_id, category_id: prod(db, i.product_id)?.category_id })); }
function mPushEvent(o, status, note) { o.events.push({ status, note: note || null, created_at: nowIso() }); }
function mAssign(db, o, { dealerId = null, by = 'auto', note } = {}) {
  if (o.status === 'cancelled') throw fail(409, 'This order is cancelled.');
  if (o.payment_status !== 'confirmed') throw fail(409, 'Confirm the payment before sending the order to a dealer.');
  const cur = mCurrent(db, o.id);
  let dealer;
  if (dealerId) {
    dealer = mDealer(db, dealerId);
    if (!dealer) throw fail(404, 'Dealer not found');
    if (!dealer.is_active) throw fail(409, 'This dealer is switched off.');
    if (cur && cur.dealer_id === dealer.id && isOpen(cur.status)) throw fail(409, 'The order is already with this dealer.');
  } else {
    const tried = db.dealerOrders.filter((r) => r.order_id === o.id).map((r) => r.dealer_id);
    dealer = pickDealer({ dealers: mAllDealers(db).map((d) => ({ ...d, is_active: d.is_active && d.can_receive_orders })), items: mItems(db, o), pincode: o.address.pincode, exclude: tried }).dealer;
    if (!dealer) return null;
  }
  const t = nowIso();
  const moved = cur && isOpen(cur.status);
  if (moved) Object.assign(cur, { status: 'reassigned', reject_reason: cur.reject_reason || note || 'Moved by the store', closed_at: t, updated_at: t });
  const row = { id: ++db.seq.id, order_id: o.id, dealer_id: dealer.id, status: 'sent', assigned_by: by, reject_reason: null, packed_items: [], delivery_mode: null, rider_name: null, rider_phone: null,
    courier_name: null, awb: null, tracking_url: null, otp: null, otp_tries: 0, sent_at: t, accepted_at: null, packed_at: null, ready_at: null, out_at: null, delivered_at: null, closed_at: null, updated_at: t };
  db.dealerOrders.push(row);
  if (o.status === 'processing') o.status = 'payment_confirmed';
  mPushEvent(o, 'sent_to_dealer', moved ? 'Moved to another partner store' : 'Sent to our partner store for packing');
  return row;
}
function mAfterPaid(db, o) {
  try {
    if (!db.dealers || !db.dealerSettings?.auto_assign || mCurrent(db, o.id) || (o.address.country || 'IN') !== 'IN') return null;
    return mAssign(db, o);
  } catch { return null; }
}
function mSync(db, o, action) {
  const cur = db.dealerOrders && mCurrent(db, o.id);
  if (!cur || !isOpen(cur.status)) return;
  const t = nowIso();
  if (action === 'cancel') Object.assign(cur, { status: 'cancelled', closed_at: t, updated_at: t });
  if (action === 'deliver') Object.assign(cur, { status: 'delivered', delivered_at: t, closed_at: t, updated_at: t });
}
function mDeliveryFor(db, o, admin) {
  const r = mCurrent(db, o.id);
  if (!r) return null;
  const out = r.status === 'out_for_delivery';
  return { stage: r.status, mode: r.delivery_mode, rider_name: out ? r.rider_name : null, rider_phone: out ? r.rider_phone : null, courier_name: r.courier_name, awb: r.awb, tracking_url: r.tracking_url,
    otp: !admin && out && r.delivery_mode === 'self' ? r.otp : null,
    tracking: r.delivery_mode === 'courier' ? (r.tracking || []).map((x) => ({ at: x.at, status: x.status, label: COURIER_UPDATES[x.status]?.label, location: x.location })) : [],
    received_by: r.received_by || null, delivered_at: r.delivered_at };
}
function mLate(db, r) { return r.status === 'sent' && Date.now() - Date.parse(r.sent_at) > (db.dealerSettings?.accept_minutes || 120) * 6e4; }
function mAdminPanel(db, o) {
  const tried = db.dealerOrders.filter((r) => r.order_id === o.id && ['rejected', 'reassigned'].includes(r.status)).map((r) => r.dealer_id);
  const history = db.dealerOrders.filter((r) => r.order_id === o.id).reverse().map((r) => { const d = mDealer(db, r.dealer_id) || {}; return {
    id: r.id, dealer_id: r.dealer_id, business_name: d.business_name, city: d.city, phone: d.phone, status: r.status, label: DEALER_STATUS[r.status]?.label, assigned_by: r.assigned_by, reject_reason: r.reject_reason,
    sent_at: r.sent_at, accepted_at: r.accepted_at, packed_at: r.packed_at, ready_at: r.ready_at, out_at: r.out_at, delivered_at: r.delivered_at,
    delivery: r.delivery_mode ? { mode: r.delivery_mode, rider_name: r.rider_name, rider_phone: r.rider_phone, courier_name: r.courier_name, awb: r.awb, tracking_url: r.tracking_url } : null, late: mLate(db, r) }; });
  const cands = pickDealer({ dealers: mAllDealers(db), items: mItems(db, o), pincode: o.address.pincode }).candidates
    .map((c) => ({ id: c.dealer.id, business_name: c.dealer.business_name, city: c.dealer.city, ok: c.ok, reasons: c.reasons, open_orders: c.dealer.open_orders, tried: tried.includes(c.dealer.id), is_active: c.dealer.is_active }));
  return { current: history.find((h) => !['rejected', 'reassigned'].includes(h.status)) || null, history, candidates: cands };
}
function mDealerView(db, r, full = true) {
  const o = db.orders.find((x) => x.id === r.order_id);
  const items = o.items.map((i, k) => { const p = prod(db, i.product_id) || {}; return { id: k + 1, name: i.name, qty: i.qty, category: cat(db, p.category_id)?.name, material: p.specs?.Material || null, size: p.specs?.Dimensions || p.specs?.Size || null }; });
  const flat = { customer_name: o.customer.name, customer_phone: o.customer.phone, ship_line1: o.address.line1, ship_line2: o.address.line2, ship_city: o.address.city, ship_state: o.address.state, ship_pincode: o.address.pincode, delivered_at: r.delivered_at };
  const base = { order_number: o.order_number, status: r.status, status_label: DEALER_STATUS[r.status]?.label, sent_at: r.sent_at, accepted_at: r.accepted_at, packed_at: r.packed_at, ready_at: r.ready_at, out_at: r.out_at, delivered_at: r.delivered_at,
    city: o.address.city, pincode: o.address.pincode, items_count: items.reduce((s, i) => s + i.qty, 0), lines: items.length, deliver_by: o.estimated_delivery, paid: o.payment_status === 'confirmed', order_cancelled: o.status === 'cancelled', first_item: items[0]?.name || '' };
  if (!full) return base;
  return { ...base, customer: maskForDealer(flat, r.status), items, packed_items: r.packed_items,
    delivery: r.delivery_mode ? { mode: r.delivery_mode, rider_name: r.rider_name, rider_phone: r.rider_phone, courier_name: r.courier_name, awb: r.awb, tracking_url: r.tracking_url,
      tracking: (r.tracking || []).map((x) => ({ ...x, label: COURIER_UPDATES[x.status]?.label })), received_by: r.received_by } : null,
    note: o.status === 'cancelled' ? 'Order cancelled by the store — do not ship.' : null, next: NEXT_STEP[r.status] || null, otp_needed: r.status === 'out_for_delivery' && r.delivery_mode === 'self', reject_reason: r.reject_reason,
    returns: r.status === 'delivered' ? (db.returns || []).filter((x) => x.order_id === o.id && !['rejected', 'cancelled'].includes(x.status)).map((x) => ({ number: x.number, status: x.status, reason: x.reason, items: x.items.map((i) => ({ name: i.name, qty: i.qty })) })) : [] };
}
function mCourierUpdate(db, r, body, by = 'admin', when = null) {
  if (!r) throw fail(404, 'Shipment not found');
  if (r.delivery_mode !== 'courier') throw fail(409, 'Courier updates are only for orders sent by courier.');
  if (r.status !== 'out_for_delivery') throw fail(409, r.status === 'delivered' ? 'This parcel is already delivered.' : 'The parcel has not been handed to the courier yet.');
  const st = String(body.status || '');
  if (!COURIER_UPDATES[st]) throw fail(400, 'Unknown courier status.');
  const o = db.orders.find((x) => x.id === r.order_id);
  if (o.status === 'cancelled') throw fail(409, 'This order was cancelled.');
  const at = when || nowIso(); const cut = (v, n) => (v ? String(v).trim().slice(0, n) : null);
  r.tracking = [...(r.tracking || []), { at, status: st, location: cut(body.location, 80), note: cut(body.note, 200), by }];
  if (st === 'out_for_delivery' && !r.courier_out_at) { r.courier_out_at = at; if (o.status === 'shipped') o.status = 'out_for_delivery'; o.events.push({ status: 'out_for_delivery', note: `${r.courier_name}${body.location ? ` · ${cut(body.location, 80)}` : ''}`, created_at: at }); }
  if (st === 'attempt_failed') o.events.push({ status: 'delivery_attempted', note: cut(body.note, 200) || 'Courier could not deliver — they will try again', created_at: at });
  if (st === 'delivered') {
    Object.assign(r, { status: 'delivered', delivered_at: at, closed_at: at, received_by: cut(body.received_by, 60) }); o.status = 'delivered';
    if (!o.events.some((e) => e.status === 'out_for_delivery')) o.events.push({ status: 'out_for_delivery', note: 'Auto-recorded', created_at: at });
    o.events.push({ status: 'delivered', note: body.received_by ? `Received by ${cut(body.received_by, 60)}` : 'Delivered by courier', created_at: at });
  }
  r.updated_at = at;
  return r;
}
function mDealerStep(db, dealer, number, action, body = {}) {
  const o = db.orders.find((x) => x.order_number === String(number).toUpperCase());
  const r = o && [...db.dealerOrders].reverse().find((x) => x.order_id === o.id && x.dealer_id === dealer.id);
  if (!r) throw fail(404, 'Order not found');
  if (o.status === 'cancelled' || r.status === 'cancelled') throw fail(409, 'This order was cancelled. Please do not ship it.');
  if (['rejected', 'reassigned'].includes(r.status)) throw fail(409, 'This order is no longer assigned to you.');
  const t = nowIso();
  const need = (c, m) => { if (!c) throw fail(409, m); };
  const check = (c, field, m) => { if (!c) throw fail(400, m, { fields: { [field]: m } }); };
  switch (action) {
    case 'accept': need(r.status === 'sent', 'Already accepted.'); Object.assign(r, { status: 'accepted', accepted_at: t }); o.status = 'processing'; mPushEvent(o, 'dealer_accepted', 'Your order is being prepared'); break;
    case 'reject':
      need(['sent', 'accepted'].includes(r.status), 'You can only reject before packing.');
      Object.assign(r, { status: 'rejected', reject_reason: String(body.reason || 'Not available').slice(0, 200), closed_at: t });
      if (o.status === 'processing') o.status = 'payment_confirmed';
      if (db.dealerSettings.auto_reassign) { try { mAssign(db, o); } catch { /* none left */ } }
      break;
    case 'pack': {
      need(r.status === 'accepted', r.status === 'sent' ? 'Accept the order first.' : 'Already packed.');
      const ids = o.items.map((_, k) => k + 1);
      const ticked = body.all ? ids : (body.checked || []).map(Number).filter((x) => ids.includes(x));
      check(ticked.length === ids.length, 'checked', 'Tick every item as you pack it.');
      Object.assign(r, { status: 'packed', packed_at: t, packed_items: ticked }); mPushEvent(o, 'packed', 'Packed and sealed'); break;
    }
    case 'ready': need(r.status === 'packed', 'Pack the order first.'); Object.assign(r, { status: 'ready', ready_at: t }); mPushEvent(o, 'ready_for_delivery', 'Ready to be handed over for delivery'); break;
    case 'dispatch':
      need(r.status === 'ready', 'Mark the order ready first.');
      if (body.mode === 'self') {
        const rp = String(body.rider_phone || '').replace(/\D/g, '').slice(-10);
        check(String(body.rider_name || '').trim().length >= 2, 'rider_name', "Enter the delivery person's name.");
        check(/^[6-9]\d{9}$/.test(rp), 'rider_phone', 'Enter a valid 10-digit mobile number for the delivery person.');
        Object.assign(r, { status: 'out_for_delivery', out_at: t, delivery_mode: 'self', rider_name: String(body.rider_name).trim(), rider_phone: rp, otp: newOtp(), otp_tries: 0 });
        o.status = 'out_for_delivery'; mPushEvent(o, 'shipped', 'Handed to delivery');
        mPushEvent(o, 'out_for_delivery', `With ${String(body.rider_name).trim().split(' ')[0]} — share your delivery code only when you receive the parcel`);
      } else if (body.mode === 'courier') {
        check(String(body.courier_name || '').trim().length >= 2, 'courier_name', 'Enter the courier company.');
        check(/^[A-Za-z0-9-]{5,30}$/.test(String(body.awb || '').trim()), 'awb', 'Enter the AWB / tracking number (5–30 letters or digits).');
        const url = String(body.tracking_url || '').trim();
        check(!url || /^https:\/\/\S{4,300}$/.test(url), 'tracking_url', 'Tracking link must start with https://');
        Object.assign(r, { status: 'out_for_delivery', out_at: t, delivery_mode: 'courier', courier_name: String(body.courier_name).trim(), awb: String(body.awb).trim(), tracking_url: url || null });
        o.status = 'shipped'; o.tracking = { carrier: r.courier_name, number: r.awb };
        r.tracking = [{ at: t, status: 'picked_up', location: dealer.city || null, note: `Handed to ${r.courier_name} by the dealer`, by: 'dealer' }];
        mPushEvent(o, 'shipped', `Handed to ${r.courier_name} · AWB ${r.awb}`);
      } else throw fail(400, 'Choose how the order will be delivered.');
      break;
    case 'deliver':
      need(r.status === 'out_for_delivery', 'The order is not out for delivery yet.');
      if (r.delivery_mode === 'self') {
        need(r.otp_tries < 5, 'Too many wrong codes. Please ask the store to confirm delivery.');
        if (String(body.otp || '').trim() !== r.otp) { r.otp_tries++; throw fail(400, 'Wrong delivery code. Ask the customer for the 4-digit code on their order page / message.', { fields: { otp: 'Wrong code' } }); }
      }
      Object.assign(r, { status: 'delivered', delivered_at: t, closed_at: t }); o.status = 'delivered';
      if (r.delivery_mode === 'courier') r.tracking = [...(r.tracking || []), { at: t, status: 'delivered', location: o.address.city, note: 'Marked delivered by the dealer', by: 'dealer' }];
      if (!o.events.some((e) => e.status === 'out_for_delivery')) mPushEvent(o, 'out_for_delivery', 'Auto-recorded');
      mPushEvent(o, 'delivered', r.delivery_mode === 'self' ? 'Delivered — confirmed with your code' : 'Delivered'); break;
    default: throw fail(400, 'Unknown action');
  }
  r.updated_at = t;
  return r;
}
function adjustStock(db, productId, delta) {
  const p = prod(db, productId); if (!p) return;
  p.stock += delta;
  for (const x of parts(db, p) || []) x.p.stock += delta * x.qty;
}
function createOrder(db, { items, couponCode, customer, address, userId, country = 'IN', currency = 'INR', fxRate = null, attribution = {}, checkoutToken }) {
  const cc = String(country || 'IN').toUpperCase();
  const q = quote(db, items, couponCode, { country: cc, pincode: address?.pincode, firstOrder: isFirstOrder(db, customer) });
  if (!q.lines.length) throw fail(400, 'Your cart is empty or items are unavailable.');
  if (q.couponError) throw fail(409, q.couponError, { quote: q });
  if (q.errors.length) throw fail(409, q.errors[0].code === 'NO_INTERNATIONAL' || q.errors[0].code === 'DOMESTIC_ONLY' ? q.errors[0].message : 'Some items changed since you added them. Please review your cart.', { quote: q });
  for (const l of q.lines) adjustStock(db, l.productId, -l.qty);
  const n = ++db.seq.order;
  const token = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  const days = cc === 'IN' ? 6 : Number(String(q.zone?.delivery_text || '').match(/(\d+)\D*business/)?.[1]) || 15;
  const o = {
    id: n, order_number: `DIWALI${n}`, user_id: userId || null, token, created_at: nowIso(), status: 'placed', payment_status: 'awaiting_payment',
    customer, address: { ...address, country: cc }, currency: currency || 'INR', fx_rate: fxRate, payment_method: cc === 'IN' ? 'upi' : 'intl',
    attribution: { utm_source: attribution.utm_source || null, utm_medium: attribution.utm_medium || null, utm_campaign: attribution.utm_campaign || null, utm_content: attribution.utm_content || null, landing_page: attribution.landing_page || null, referrer: attribution.referrer || null, has_fbclid: !!attribution.fbclid },
    conversion_sent: false,
    items: q.lines.map((l) => {
      const p = prod(db, l.productId);
      const unitCost = p.is_bundle ? (parts(db, p) || []).reduce((s, x) => s + (x.p.cost_price || 0) * x.qty, 0) || p.cost_price : p.cost_price;
      return { product_id: l.productId, name: l.name, slug: l.slug, qty: l.qty, unit_price: l.unitPrice, mrp: l.mrp, line_total: l.lineTotal, offer_eligible: l.offerEligible, unit_cost: unitCost || 0, discount_share: l.discountShare || 0 };
    }),
    totals: { mrp_total: q.mrpTotal, subtotal: q.subtotal, discount: q.discount, delivery: q.delivery, total: q.total },
    offer_name: q.offer?.name || null, coupon_code: q.offer?.couponCode || null,
    estimated_delivery: new Date(Date.now() + days * 864e5).toISOString().slice(0, 10), tracking: null,
    events: [{ status: 'placed', note: 'Order placed', created_at: nowIso() }],
    payment: { id: n, method: cc === 'IN' ? 'upi_manual' : 'payment_link', amount: q.total, status: 'pending', customer_ref: null, screenshot: null, created_at: nowIso(), verified_at: null },
    transactions: [],
  };
  db.orders.unshift(o);
  if (cc === 'IN') shipRecord(db, o);
  if (checkoutToken) { const c = db.checkouts.find((x) => x.token === checkoutToken); if (c) c.order_id = o.id; }
  return o;
}
function adminAction(db, o, action, { note, carrier, trackingNumber }) {
  const t = nowIso();
  const ev = (status, n) => o.events.push({ status, note: n || note || null, created_at: t });
  const need = (c, m) => { if (!c) throw fail(409, m); };
  switch (action) {
    case 'confirm_payment':
      need(o.status !== 'cancelled' && o.payment_status !== 'confirmed', 'Payment is already confirmed or order cancelled.');
      o.payment_status = 'confirmed'; o.payment.status = 'confirmed'; o.payment.verified_at = t;
      if (o.status === 'placed') o.status = 'payment_confirmed';
      ev('payment_confirmed', 'Payment verified');
      if (!o.conversion_sent && (db.settings.meta_pixel_id || db.settings.ga4_measurement_id)) { o.conversion_sent = true; ev('conversion_reported', 'Demo: purchase would be sent to Meta CAPI / GA4 by the real server'); }
      mAfterPaid(db, o);
      break;
    case 'reject_payment':
      need(['awaiting_payment', 'verification_pending'].includes(o.payment_status), 'Only pending payments can be rejected.');
      o.payment_status = 'rejected'; o.payment.status = 'rejected'; ev('payment_rejected'); break;
    case 'process': need(o.status === 'payment_confirmed', 'Confirm payment before processing.'); o.status = 'processing'; ev('processing'); break;
    case 'ship': need(o.status === 'processing', 'Only processing orders can be shipped.'); o.status = 'shipped'; o.tracking = trackingNumber ? { carrier, number: trackingNumber } : null; ev('shipped'); break;
    case 'out_for_delivery': need(o.status === 'shipped', 'Only shipped orders can go out for delivery.'); o.status = 'out_for_delivery'; ev('out_for_delivery'); break;
    case 'deliver':
      need(['shipped', 'out_for_delivery'].includes(o.status), 'Order has not shipped yet.');
      if (o.status === 'shipped') ev('out_for_delivery', 'Auto-recorded');
      o.status = 'delivered'; ev('delivered'); mSync(db, o, 'deliver'); break;
    case 'cancel':
      need(!['delivered', 'cancelled'].includes(o.status), 'This order can no longer be cancelled.');
      mCancel(db, o, { by: 'admin', note }); break;
    case 'mark_refunded': {
      need(o.status === 'cancelled', 'Only cancelled orders can be refunded here. Use Returns & refunds for returns.');
      const f = (db.refunds || []).find((x) => x.order_id === o.id && x.kind === 'cancellation');
      need(f, 'There is no refund due on this order.'); need(f.status !== 'processed', 'This refund is already marked as paid.');
      mRefundAction(db, f, 'process', { reference: note && note.length >= 4 ? note : `MANUAL-${o.order_number}` }); break;
    }
    default: throw fail(400, 'Unknown action');
  }
}
const fileToDataUrl = (f) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); });
const formObj = (b) => (b instanceof FormData ? Object.fromEntries([...b.entries()].filter(([, v]) => typeof v === 'string')) : b || {});

// ---- router ----------------------------------------------------------------
const routes = [];
const on = (method, pattern, fn) => {
  const keys = [];
  const re = new RegExp(`^${pattern.replace(/:(\w+)/g, (_, k) => (keys.push(k), '([^/]+)'))}$`);
  routes.push({ method, re, keys, fn });
};

on('GET', '/health', () => ok({ ok: true }));
on('GET', '/settings/public', (db) => ok(publicSettings(db)));
on('GET', '/categories', (db) => ok(db.categories.filter((c) => c.is_active).map((c) => ({ ...c, product_count: db.products.filter((p) => p.category_id === c.id && p.is_active).length }))));
on('GET', '/offers/active', (db) => { const h = headline(db); return ok({ headline: h && pubOffer(h), offers: db.offers.filter((o) => isOfferLive(o) && !o.coupon_code).map(pubOffer) }); });
on('GET', '/products', (db, _p, _b, q) => {
  const d = recCached(db);
  let rows = db.products.filter((p) => p.is_active).map((p) => serialize(db, p, true));
  if (q.category) { const s = q.category.split(','); rows = rows.filter((p) => s.includes(p.category_slug)); }
  if (q.min) rows = rows.filter((p) => p.price >= q.min * 100);
  if (q.max) rows = rows.filter((p) => p.price <= q.max * 100);
  if (q.rating) rows = rows.filter((p) => p.rating >= +q.rating);
  if (q.discount) rows = rows.filter((p) => p.discount_pct >= +q.discount);
  if (q.inStock) rows = rows.filter((p) => p.stock > 0);
  if (q.flag) rows = rows.filter((p) => p[`is_${q.flag}`]);
  if (q.offer) rows = rows.filter((p) => p.offer_eligible);
  if (q.segment) rows = rows.filter((p) => p.segment === q.segment);
  if (q.intl) rows = rows.filter((p) => p.ships_international);
  const found = search({ products: rows, q: q.q || '', b: d.b, vocab: d.vocab });
  const facets = facetsFor(found.items);
  rows = found.items;
  if (q.material) { const want = new Set(q.material.split(',')); rows = rows.filter((p) => materialsOf(p).some((m) => want.has(m))); }
  const sorts = {
    price_asc: (a, b) => a.price - b.price, price_desc: (a, b) => b.price - a.price,
    rating: (a, b) => b.rating - a.rating || b.rating_count - a.rating_count, discount: (a, b) => b.discount_pct - a.discount_pct, newest: (a, b) => b.is_new - a.is_new || b.id - a.id,
    bestsellers: (a, b) => (d.b.get(b.id)?.velocity || 0) - (d.b.get(a.id)?.velocity || 0),
  };
  if (sorts[q.sort]) rows = [...rows].sort(sorts[q.sort]);
  const limit = +q.limit || 24; const page = +q.page || 1;
  return ok({ total: rows.length, page, pages: Math.max(1, Math.ceil(rows.length / limit)), corrected: found.corrected, relaxed: found.relaxed, facets, items: pub(db, rows.slice((page - 1) * limit, page * limit)) });
});
on('GET', '/stock', (db, _p, _b, q) => {
  const ids = String(q.ids || '').split(',').map(Number).filter(Boolean);
  const items = {};
  for (const id of ids) { const p = db.products.find((x) => x.id === id); if (p) { const s = serialize(db, p); items[id] = { stock_status: s.stock_status, stock_left: s.stock_left ?? null, price: p.price }; } }
  return ok({ items, at: nowIso() });
});
on('GET', '/products/suggest', (db, _p, _b, q) => {
  const s = String(q.q || '').trim();
  if (s.length < 1) return ok({ products: [], categories: [], completions: [], popular: POPULAR_SEARCHES });
  const d = recCached(db);
  const found = search({ products: d.rows, q: s, b: d.b, vocab: d.vocab, prefixLast: true });
  const words = tokens(found.corrected || found.relaxed || s);
  return ok({ products: pub(db, found.items.slice(0, 6)), corrected: found.corrected, completions: completions(s, d.rows), total: found.items.length, categories: db.categories.filter((c) => c.is_active && relevance({ name: c.name }, words, undefined, { prefixLast: true }) > 0).slice(0, 3) });
});
on('GET', '/products/:slug', (db, { slug }) => {
  const p = db.products.find((x) => x.slug === slug && x.is_active);
  if (!p) return fail(404, 'Product not found');
  return ok({
    product: pub(db, [serialize(db, p)])[0], offer: headline(db) && pubOffer(headline(db)),
    reviews: db.reviews.filter((r) => r.product_id === p.id && r.status === 'approved'),
    related: pub(db, db.products.filter((x) => x.category_id === p.category_id && x.id !== p.id && x.is_active).slice(0, 4).map((x) => serialize(db, x))),
  });
});
on('GET', '/reviews/featured', (db) => ok(db.reviews.filter((r) => r.status === 'approved' && r.rating >= 4).slice(0, 6).map((r) => {
  const p = db.products.find((x) => x.id === r.product_id);
  return { ...r, product_name: p.name, product_slug: p.slug, category_slug: cat(db, p.category_id).slug };
})));
on('POST', '/cart/quote', (db, _p, b) => { const u = me(db); return ok(quote(db, b.items || [], b.couponCode, { country: b.country || 'IN', pincode: b.pincode, firstOrder: u ? isFirstOrder(db, u) : undefined })); });
on('POST', '/newsletter', (db, _p, b) => {
  if (!/^\S+@\S+\.\S+$/.test(b.email || '')) return fail(400, 'Please check the highlighted fields.', { fields: { email: 'Enter a valid email' } });
  if (!db.newsletter.includes(b.email)) db.newsletter.push(b.email);
  upsertSub(db, { email: b.email, emailOptIn: true, frequency: 'weekly', source: 'footer' });
  const w = db.offers.find((o) => isOfferLive(o) && o.first_order_only && o.coupon_code);
  return ok({ ok: true, coupon: w ? { code: w.coupon_code, label: offerLabel(w), max_discount: w.max_discount } : null,
    message: w ? `Welcome! Use ${w.coupon_code} for ${offerLabel(w)} your first order.` : 'Thank you! Festive offers are on their way to your inbox.' });
});
// ---- recommendations (same engine as the server: shared/recommend.js) ----
function recData(db) {
  const rows = db.products.filter((p) => p.is_active).map((p) => serialize(db, p, true));
  const group = (pairs) => { const m = new Map(); for (const [k, v] of pairs) { if (!m.has(k)) m.set(k, new Set()); m.get(k).add(v); } return [...m.values()].map((x) => [...x]); };
  const real = db.orders.filter((o) => o.status !== 'cancelled').map((o) => ({ customer: o.user_id ? `u${o.user_id}` : `p${o.customer.phone}`, at: o.created_at, basket: o.id, items: o.items }));
  const hist = [...real, ...(db.demoHistory || []).map((o, i) => ({ ...o, basket: `d${i}` }))];
  const lines = hist.flatMap((o) => o.items.map((i) => ({ product_id: i.product_id, qty: i.qty, at: o.at, customer: o.customer, basket: o.basket })));
  const baskets = group(lines.map((l) => [l.basket, l.product_id])).filter((g) => g.length > 1);
  const customers = group(lines.map((l) => [l.customer, l.product_id]));
  const views = db.events.filter((e) => e.type === 'view_item' && e.product_id);
  const sessions = group(views.map((e) => [e.session_id, e.product_id])).filter((g) => g.length > 1);
  const b = behaviour({ sales: lines, views: views.map((e) => ({ product_id: e.product_id, at: e.created_at })) });
  return { rows, byId: new Map(rows.map((r) => [r.id, r])), baskets, sessions, b, i2i: itemToItem(customers), ranks: bestSellerRanks(rows, b), choice: choicePicks(rows, b), vocab: vocabulary(rows) };
}
let REC = { at: 0 };
const recCached = (db) => { if (Date.now() - REC.at > 30000) REC = { at: Date.now(), d: recData(db) }; return REC.d; };
const pub = (db, list) => {
  const d = recCached(db);
  return list.map((p) => ({ ...p, stock: undefined, cost_price: undefined,
    bsr: d.ranks.get(p.id) ? { rank: d.ranks.get(p.id), category: p.category_name } : null,
    is_choice: d.choice.has(p.id), bought_label: boughtLabel(d.b.get(p.id)?.units) }));
};
on('GET', '/products/:slug/recommendations', (db, { slug }) => {
  const d = recCached(db);
  const product = d.rows.find((x) => x.slug === slug);
  if (!product) return fail(404, 'Product not found');
  const together = boughtTogether({ product, products: d.rows, baskets: d.baskets, i2i: d.i2i, limit: 2 });
  const bought = alsoBought({ product, products: d.rows, i2i: d.i2i, limit: 12, exclude: together.map((x) => x.id) });
  return ok({ together: pub(db, together), similar: pub(db, similar({ product, products: d.rows, limit: 3 })), alsoBought: pub(db, bought),
    alsoViewed: pub(db, alsoViewed({ product, products: d.rows, sessions: d.sessions, limit: 12, exclude: [...together, ...bought].map((x) => x.id) })) });
});
on('POST', '/recommendations', (db, _p, b) => {
  const d = recCached(db);
  const u = me(db);
  const bought = u ? [...new Set(db.orders.filter((o) => o.user_id === u.id && o.payment_status === 'confirmed').flatMap((o) => o.items.map((i) => i.product_id)))] : [];
  const ids = (x) => (Array.isArray(x) ? x.map(Number).filter(Boolean).slice(0, 50) : []);
  const viewed = ids(b?.viewed); const cart = ids(b?.cart); const wish = ids(b?.wish);
  const deal = dealOfTheDay({ products: d.rows });
  return ok({
    forYou: pub(db, forYou({ products: d.rows, viewed, cart, wish, bought, sessions: d.sessions, i2i: d.i2i, limit: 16 })),
    recent: pub(db, viewed.map((id) => d.byId.get(id)).filter(Boolean).slice(0, 16)),
    buyAgain: pub(db, bought.map((id) => d.byId.get(id)).filter(Boolean)),
    deal: deal ? pub(db, [deal])[0] : null,
    personal: viewed.length + cart.length + wish.length + bought.length > 0,
  });
});
on('POST', '/cart/recommendations', (db, _p, b) => {
  const d = recCached(db);
  const items = (b?.items || []).filter((i) => i.productId);
  const ids = items.map((i) => Number(i.productId));
  const q = quote(db, items, '', {});
  const off = headline(db);
  const step = q.nudge || q.upsell;
  const unlock = off && step ? { message: step.message, needed: step.needed,
    items: pub(db, d.rows.filter((p) => !ids.includes(p.id) && !p.is_bundle && p.stock > 0 && isProductEligible(off, p)).sort((x, y) => x.price - y.price).slice(0, 8)) } : null;
  return ok({ alsoBought: pub(db, forCart({ products: d.rows, cartIds: ids, baskets: d.baskets, i2i: d.i2i, limit: 12 })), unlock });
});

// ---- customer messages (same engine as the server: shared/crm.js) ----
const crmSettings = (db) => ({
  enabled: db.settings.crm_enabled !== false, send_hour: db.settings.crm_send_hour ?? 10, wa_weekly_cap: db.settings.crm_wa_weekly_cap ?? 3,
  calendar: db.settings.festival_calendar || DEFAULT_CALENDAR, app_store_url: db.settings.app_store_url || '', play_store_url: db.settings.play_store_url || '',
});
const DEMO_BASE = 'https://www.utsavghar.in';
const maskV = (v, keep = 3) => (v ? `${String(v).slice(0, keep)}${'•'.repeat(Math.max(2, String(v).length - keep - 2))}${String(v).slice(-2)}` : null);
const prefsOf = (s) => ({ name: s.name, email: maskV(s.email), phone: maskV(s.phone, 2), email_opt_in: !!s.email_opt_in, whatsapp_opt_in: !!s.whatsapp_opt_in, frequency: s.frequency, interests: s.interests || [], status: s.status });
const crmIds = (a) => (Array.isArray(a) ? [...new Set(a.map(Number).filter(Boolean))].slice(0, 40) : []);
function upsertSub(db, b) {
  db.subscribers ||= []; db.crmMessages ||= [];
  const email = b.email ? String(b.email).trim().toLowerCase() : null;
  const phone = b.phone ? ((b.country || 'IN') === 'IN' ? normalizeIndianPhone(b.phone) : String(b.phone).replace(/[^\d+]/g, '')) : null;
  if (!email && !phone) return null;
  let s = db.subscribers.find((x) => (email && x.email === email) || (phone && x.phone === phone));
  const signals = b.signals ? { viewed: crmIds(b.signals.viewed), cart: crmIds(b.signals.cart), wish: crmIds(b.signals.wish) } : null;
  if (!s) {
    s = { id: ++db.seq.id, token: `t${newCode()}${newCode()}`, name: b.name || null, email, phone, country: b.country || 'IN', email_opt_in: 0, whatsapp_opt_in: 0,
      frequency: b.frequency || 'weekly', interests: b.interests || [], signals: signals || {}, source: b.source || 'popup', status: 'active', created_at: nowIso() };
    db.subscribers.unshift(s);
  } else {
    if (b.name) s.name = b.name; if (email && !s.email) s.email = email; if (phone && !s.phone) s.phone = phone;
    if (b.frequencyExplicit && b.frequency) s.frequency = b.frequency;
    if (b.interests?.length) s.interests = b.interests;
    if (signals) s.signals = signals;
    s.status = 'active';
  }
  if (b.emailOptIn && s.email) s.email_opt_in = 1;
  if (b.whatsappOptIn && s.phone) s.whatsapp_opt_in = 1;
  s.consent_at = nowIso(); if (!s.user_id && b.userId) s.user_id = b.userId;
  return s;
}
function composeMock(db, s, alert) {
  const d = recCached(db);
  const products = pub(db, d.rows);
  const bought = [...new Set(db.orders.filter((o) => o.payment_status === 'confirmed' && ((s.phone && digits(o.customer.phone) === digits(s.phone)) || (s.email && o.customer.email === s.email))).flatMap((o) => o.items.map((i) => i.product_id)))];
  const since = Date.now() - 7 * 864e5;
  const recent = (db.crmMessages || []).filter((m) => m.subscriber_id === s.id && Date.parse(m.created_at) >= since).flatMap((m) => m.product_ids);
  const off = headline(db);
  return buildMessage({ sub: s, products, signals: s.signals || {}, bought, sessions: d.sessions, i2i: d.i2i, recentSent: recent, alert,
    deal: dealOfTheDay({ products }), offer: off ? offerHeadline(off) : null });
}
function renderMock(db, s, m, code) {
  const st = crmSettings(db);
  return { email: renderEmail(m, { baseUrl: DEMO_BASE, code, token: s.token, appStoreUrl: st.app_store_url, playStoreUrl: st.play_store_url }), whatsapp: renderWhatsApp(m, { baseUrl: DEMO_BASE, code, token: s.token }) };
}
function sendMock(db, s, m, kind = m.kind) {
  const out = [];
  const ids = m.sections.flatMap((x) => x.items.map((p) => p.id));
  for (const ch of ['email', 'whatsapp']) {
    if (!(ch === 'email' ? s.email && s.email_opt_in : s.phone && s.whatsapp_opt_in)) continue;
    const code = newCode();
    db.crmMessages.unshift({ id: ++db.seq.id, code, subscriber_id: s.id, kind, festival: m.festival || null, channel: ch, subject: m.subject, product_ids: ids,
      status: 'skipped', error: 'Demo preview — nothing is actually sent', clicks: 0, order_id: null, created_at: nowIso() });
    out.push({ channel: ch, status: 'skipped', error: 'Demo preview — nothing is actually sent' });
  }
  return out;
}
function alertForMock(db, kind, slug) {
  if (kind !== 'festival') return null;
  const cal = crmSettings(db).calendar;
  const f = cal.find((x) => x.slug === slug) || upcoming(cal)[0] || cal[0];
  const d = Math.max(0, Math.round((Date.parse(`${f.date}T00:00:00Z`) - Date.now()) / 864e5));
  return { festival: f, stage: [5, 7, 10, 21].find((x) => d <= x) || 21, daysLeft: d };
}
on('POST', '/subscribe', (db, _p, b) => {
  if (b.website) return fail(400, 'Request blocked. Please try again.');
  const f = {};
  if (b.consent !== true) f.consent = 'Please tick the box to agree';
  if (!b.email_opt_in && !b.whatsapp_opt_in) f.channels = 'Choose WhatsApp, email or both';
  if (b.email_opt_in && !/^\S+@\S+\.\S+$/.test(b.email || '')) f.email = 'Enter a valid email';
  if (b.whatsapp_opt_in) { const dd = String(b.phone || '').replace(/\D/g, ''); if ((b.country || 'IN') === 'IN' ? !/^(91|0)?[6-9]\d{9}$/.test(dd) : dd.length < 8) f.phone = (b.country || 'IN') === 'IN' ? 'Enter a valid 10-digit mobile number' : 'Enter your WhatsApp number with country code'; }
  if (Object.keys(f).length) return fail(400, 'Please check the highlighted fields.', { fields: f });
  const s = upsertSub(db, { name: b.name, email: b.email, phone: b.phone, country: b.country, emailOptIn: b.email_opt_in, whatsappOptIn: b.whatsapp_opt_in,
    frequency: b.frequency || 'weekly', frequencyExplicit: true, interests: b.interests, source: b.source, signals: { viewed: b.viewed, cart: b.cart, wish: b.wish }, userId: me(db)?.id });
  const w = db.offers.find((o) => isOfferLive(o) && o.first_order_only && o.coupon_code);
  return ok({ token: s.token, prefs: prefsOf(s), coupon: w ? { code: w.coupon_code, label: offerLabel(w), max_discount: w.max_discount } : null,
    message: s.frequency === 'festivals' ? "Done! We'll alert you before every festival." : `Done! Your ${s.frequency} picks start ${s.frequency === 'daily' ? 'tomorrow' : 'this week'}.` }, 201);
});
on('POST', '/subscribe/signals', (db, _p, b) => { const s = (db.subscribers || []).find((x) => x.token === b.token); if (s) s.signals = { viewed: crmIds(b.viewed), cart: crmIds(b.cart), wish: crmIds(b.wish) }; return ok(null, 204); });
const subByToken = (db, t) => { const s = (db.subscribers || []).find((x) => x.token === t); if (!s) throw fail(404, 'This link has expired. Please subscribe again from our website.'); return s; };
on('GET', '/preferences/:token', (db, { token }) => ok(prefsOf(subByToken(db, token))));
on('PUT', '/preferences/:token', (db, { token }, b) => {
  const s = subByToken(db, token);
  s.email_opt_in = b.email_opt_in && s.email ? 1 : 0; s.whatsapp_opt_in = b.whatsapp_opt_in && s.phone ? 1 : 0; s.frequency = b.frequency; s.interests = b.interests || [];
  s.status = s.email_opt_in || s.whatsapp_opt_in ? 'active' : 'unsubscribed';
  return ok(prefsOf(s));
});
on('POST', '/preferences/:token/stop', (db, { token }, b, q) => {
  const s = subByToken(db, token);
  const ch = q.channel || b?.channel;
  if (ch !== 'whatsapp') s.email_opt_in = 0;
  if (ch !== 'email') s.whatsapp_opt_in = 0;
  if (!s.email_opt_in && !s.whatsapp_opt_in) { s.status = 'unsubscribed'; s.unsubscribed_at = nowIso(); }
  return ok(prefsOf(s));
});
on('GET', '/go/:code', (db, { code }) => {
  const m = (db.crmMessages || []).find((x) => x.code === code);
  if (!m) return fail(404, 'This offer link has expired.');
  m.clicks++; m.first_click_at ||= nowIso();
  const d = recCached(db);
  return ok({ kind: m.kind, festival: m.festival, subject: m.subject, products: pub(db, m.product_ids.map((id) => d.byId.get(id)).filter(Boolean)), token: db.subscribers.find((s) => s.id === m.subscriber_id)?.token });
});
on('GET', '/admin/crm/overview', (db) => {
  needAdmin(db);
  const S = db.subscribers || []; const A = S.filter((s) => s.status === 'active');
  const st = crmSettings(db);
  const since = Date.now() - 30 * 864e5;
  const M = (db.crmMessages || []).filter((m) => Date.parse(m.created_at) >= since && m.kind !== 'test');
  const last30 = ['email', 'whatsapp'].map((ch) => { const x = M.filter((m) => m.channel === ch); return { channel: ch, total: x.length, sent: x.filter((m) => m.status === 'sent').length, skipped: x.filter((m) => m.status === 'skipped').length, failed: 0, clicked: x.filter((m) => m.clicks > 0).length, orders: x.filter((m) => m.order_id).length }; }).filter((r) => r.total);
  const orderIds = new Set(M.map((m) => m.order_id).filter(Boolean));
  return ok({
    subscribers: { active: A.length, unsubscribed: S.length - A.length, email: A.filter((s) => s.email_opt_in).length, whatsapp: A.filter((s) => s.whatsapp_opt_in).length,
      daily: A.filter((s) => s.frequency === 'daily').length, weekly: A.filter((s) => s.frequency === 'weekly').length, festivals: A.filter((s) => s.frequency === 'festivals').length,
      new7: S.filter((s) => Date.parse(s.created_at) > Date.now() - 7 * 864e5).length },
    last30, revenue: db.orders.filter((o) => orderIds.has(o.id) && o.payment_status === 'confirmed').reduce((a, o) => a + o.totals.total, 0),
    settings: st, today: festivalAlertDue(st.calendar), upcoming: upcoming(st.calendar), lastRun: db.settings.crm_last_run || null,
    providers: { email: false, whatsapp: false, whatsappTemplate: '' },
  });
});
on('GET', '/admin/subscribers', (db, _p, _b, q) => {
  needAdmin(db);
  let rows = db.subscribers || [];
  if (q.q) { const t = q.q.toLowerCase(); rows = rows.filter((s) => `${s.name} ${s.email} ${s.phone}`.toLowerCase().includes(t)); }
  if (q.frequency) rows = rows.filter((s) => s.frequency === q.frequency);
  const M = db.crmMessages || [];
  return ok({ total: rows.length, items: rows.slice(0, 50).map((s) => ({ ...s, token: undefined, signals: undefined,
    sent: M.filter((m) => m.subscriber_id === s.id && m.status === 'sent').length, clicked: M.filter((m) => m.subscriber_id === s.id && m.clicks > 0).length, orders: M.filter((m) => m.subscriber_id === s.id && m.order_id).length })) });
});
on('DELETE', '/admin/subscribers/:id', (db, { id }) => { needAdmin(db); db.subscribers = db.subscribers.filter((s) => s.id !== +id); db.crmMessages = db.crmMessages.filter((m) => m.subscriber_id !== +id); return ok(null, 204); });
on('GET', '/admin/crm/preview', (db, _p, _b, q) => {
  needAdmin(db);
  const s = (q.subscriber && db.subscribers.find((x) => x.id === +q.subscriber)) || { id: 0, token: 'preview', name: 'Priya', email: 'preview@example.com', email_opt_in: 1, whatsapp_opt_in: 1, frequency: 'daily', interests: [], signals: {}, status: 'active' };
  const m = composeMock(db, s, alertForMock(db, q.kind, q.festival));
  const r = renderMock(db, s, m, 'preview00');
  return ok({ subject: m.subject, html: r.email.html, whatsapp: r.whatsapp.text, items: m.sections.flatMap((x) => x.items.map((p) => p.name)) });
});
on('POST', '/admin/crm/test', (db, _p, b) => {
  needAdmin(db);
  if (!b.email && !b.phone) return fail(400, 'Enter your email or WhatsApp number');
  const s = { id: null, token: 'preview', name: 'Admin', email: b.email || null, phone: b.phone || null, email_opt_in: b.email ? 1 : 0, whatsapp_opt_in: b.phone ? 1 : 0, frequency: 'daily', interests: [], signals: {}, status: 'active' };
  return ok({ results: sendMock(db, s, composeMock(db, s, alertForMock(db, b.kind, b.festival)), 'test') });
});
on('POST', '/admin/crm/run', (db, _p, b) => {
  needAdmin(db);
  const st = crmSettings(db);
  const alert = b?.only === 'picks' ? null : festivalAlertDue(st.calendar);
  const sum = { festival: alert ? `${alert.festival.name} (${alert.daysLeft} days)` : null, people: 0, sent: 0, skipped: 0, failed: 0 };
  for (const s of db.subscribers.filter((x) => x.status === 'active')) {
    let m = null;
    if (alert) m = composeMock(db, s, alert);
    else if (b?.only !== 'festival' && digestDue(s, Date.now())) m = composeMock(db, s, null);
    if (!m) continue;
    const r = sendMock(db, s, m); sum.people++; sum.skipped += r.length;
    s[m.kind === 'festival' ? 'last_festival_at' : 'last_digest_at'] = nowIso();
  }
  db.settings.crm_last_run = { at: nowIso(), day: istDay(), ...sum };
  return ok(sum);
});
on('PUT', '/admin/crm/settings', (db, _p, b) => {
  needAdmin(db);
  Object.assign(db.settings, { crm_enabled: !!b.enabled, crm_send_hour: +b.send_hour, crm_wa_weekly_cap: +b.wa_weekly_cap, app_store_url: b.app_store_url || '', play_store_url: b.play_store_url || '' });
  if (b.calendar) db.settings.festival_calendar = [...b.calendar].sort((x, y) => x.date.localeCompare(y.date));
  return ok(crmSettings(db));
});
on('GET', '/admin/crm/messages', (db) => { needAdmin(db); return ok((db.crmMessages || []).slice(0, 100).map((m) => { const s = db.subscribers.find((x) => x.id === m.subscriber_id) || {}; return { ...m, name: s.name, email: s.email, phone: s.phone }; })); });


// ---- support requests (same rules as server/src/routes/support.js) ----
const tkOut = (db, t, admin = false) => {
  const o = t.order_id ? db.orders.find((x) => x.id === t.order_id) : null;
  return { number: t.number, topic: t.topic, topic_label: topicOf(t.topic).label, priority: t.priority, status: t.status, status_label: TICKET_STATUS[t.status],
    name: t.name, created_at: t.created_at, updated_at: t.updated_at, rating: t.rating || null, source: t.source,
    order: o ? { order_number: o.order_number, status: o.status, payment_status: o.payment_status, total: o.totals.total } : null,
    messages: t.messages.map((m) => ({ id: m.id, author: m.author, body: m.body, created_at: m.created_at, image: m.image || null })),
    solution: SOLUTIONS[t.topic] || null, ...(admin ? { phone: t.phone, email: t.email } : {}) };
};
const tkAuth = (db, n, h, q) => {
  const t = (db.tickets || []).find((x) => x.number === String(n).toUpperCase());
  const u = me(db);
  if (!t || !((u && t.user_id === u.id) || (h['X-Ticket-Token'] || q?.token) === t.token)) throw fail(404, 'Request not found.');
  return t;
};
on('GET', '/support/topics', () => ok({ topics: TOPICS, solutions: SOLUTIONS }));
on('POST', '/support/tickets', async (db, _p, body) => {
  const b = formObj(body);
  if (b.website) return fail(400, 'Request blocked. Please try again.');
  db.tickets ||= [];
  const u = me(db);
  const f = {};
  if (!TOPICS.some((t) => t.key === b.topic)) f.topic = 'Choose a topic';
  if (!b.name || b.name.trim().length < 2) f.name = 'Enter your name';
  if (!b.message || b.message.trim().length < 5) f.message = 'Please tell us a little more (at least 5 characters)';
  const phone = b.phone ? normalizeIndianPhone(b.phone) : '';
  if (!phone && !b.email && !u) f.phone = 'Give us a mobile number or email so we can reply';
  let o = null;
  if (b.orderNumber) {
    o = db.orders.find((x) => x.order_number === b.orderNumber.replace(/^#/, '').toUpperCase());
    const mine = o && ((u && o.user_id === u.id) || (phone && digits(o.customer.phone) === digits(phone)) || (b.email && o.customer.email && o.customer.email.toLowerCase() === b.email.toLowerCase()));
    if (!mine) f.orderNumber = 'We could not find this order with your mobile number / email';
  } else if (topicOf(b.topic).needsOrder) f.orderNumber = 'Enter your order number (e.g. DIWALI10245)';
  if (Object.keys(f).length) return fail(400, 'Please check the highlighted fields.', { fields: f });
  if (o) { const dup = db.tickets.find((t) => t.order_id === o.id && t.topic === b.topic && !['resolved', 'closed'].includes(t.status)); if (dup) return fail(409, `You already have an open request (${dup.number}) for this order. We'll reply there.`, { number: dup.number }); }
  const file = body instanceof FormData ? body.get('photo') : null;
  const image = file && typeof file !== 'string' && file.size ? await fileToDataUrl(file) : null;
  const t0 = nowIso();
  const pri = topicOf(b.topic).priority;
  const t = { id: ++db.seq.id, number: `HELP-${1001 + db.tickets.length}`, token: `tk${newCode()}${newCode()}`, user_id: u?.id || null, order_id: o?.id || null, topic: b.topic, priority: pri, status: 'open',
    name: b.name.trim(), phone: phone || u?.phone || null, email: b.email || u?.email || null, source: b.source || 'help', created_at: t0, updated_at: t0,
    messages: [{ id: ++db.seq.id, author: 'customer', body: b.message.trim(), image, created_at: t0 },
      { id: ++db.seq.id, author: 'system', body: pri === 'high' ? "Thanks — we've marked this as priority. Our team replies within a few hours (10 am – 8 pm)." : "Thanks — we've got your request. Our team replies within one working day, usually much sooner.", created_at: t0 }] };
  db.tickets.unshift(t);
  return ok({ ticket: tkOut(db, t), token: t.token }, 201);
});
on('GET', '/support/tickets/:n', (db, { n }, _b, q, h) => ok(tkOut(db, tkAuth(db, n, h, q))));
on('POST', '/support/tickets/:n/messages', async (db, { n }, body, q, h) => {
  const t = tkAuth(db, n, h, q);
  if (t.status === 'closed') return fail(409, 'This request is closed. Please raise a new one.');
  const b = formObj(body);
  if (!b.message?.trim()) return fail(400, 'Write a message');
  const file = body instanceof FormData ? body.get('photo') : null;
  t.messages.push({ id: ++db.seq.id, author: 'customer', body: b.message.trim(), image: file && typeof file !== 'string' && file.size ? await fileToDataUrl(file) : null, created_at: nowIso() });
  if (['waiting', 'resolved'].includes(t.status)) t.status = 'open';
  t.updated_at = nowIso();
  return ok(tkOut(db, t));
});
on('POST', '/support/tickets/:n/rate', (db, { n }, b, q, h) => {
  const t = tkAuth(db, n, h, q);
  if (!['resolved', 'closed'].includes(t.status)) return fail(409, 'You can rate once the request is resolved.');
  t.rating = Math.min(5, Math.max(1, +b.rating || 5)); t.status = 'closed'; t.updated_at = nowIso();
  return ok(tkOut(db, t));
});
on('GET', '/account/tickets', (db) => { const u = needUser(db); return ok((db.tickets || []).filter((t) => t.user_id === u.id).map((t) => { const o = tkOut(db, t); return { ...o, last: o.messages.filter((m) => m.author !== 'system').at(-1)?.body.slice(0, 120) }; })); });
on('GET', '/admin/support/tickets', (db, _p, _b, q) => {
  needAdmin(db);
  let rows = db.tickets || [];
  const st = q.status || 'active';
  if (st === 'active') rows = rows.filter((t) => ['open', 'in_progress', 'waiting'].includes(t.status)); else if (st !== 'all') rows = rows.filter((t) => t.status === st);
  if (q.q) { const s = q.q.toLowerCase(); rows = rows.filter((t) => `${t.number} ${t.name} ${t.phone} ${t.email}`.toLowerCase().includes(s)); }
  const P = { urgent: 0, high: 1, normal: 2 };
  rows = [...rows].sort((a, b) => P[a.priority] - P[b.priority] || b.updated_at.localeCompare(a.updated_at));
  const counts = {}; for (const t of db.tickets || []) counts[t.status] = (counts[t.status] || 0) + 1;
  const rated = (db.tickets || []).filter((t) => t.rating);
  return ok({ counts, satisfaction: rated.length ? { avg: Math.round((rated.reduce((a, t) => a + t.rating, 0) / rated.length) * 10) / 10, n: rated.length } : null,
    items: rows.map((t) => { const last = t.messages.filter((m) => m.author !== 'system').at(-1); const o = t.order_id && db.orders.find((x) => x.id === t.order_id);
      return { number: t.number, topic: t.topic, topic_label: topicOf(t.topic).label, priority: t.priority, status: t.status, name: t.name, phone: t.phone, order_number: o?.order_number, updated_at: t.updated_at, created_at: t.created_at, last_body: (last?.body || '').slice(0, 140), awaiting_us: last?.author === 'customer' }; }) });
});
const tkAdmin = (db, n) => { needAdmin(db); const t = (db.tickets || []).find((x) => x.number === String(n).toUpperCase()); if (!t) throw fail(404, 'Not found'); return t; };
on('GET', '/admin/support/tickets/:n', (db, { n }) => ok(tkOut(db, tkAdmin(db, n), true)));
on('POST', '/admin/support/tickets/:n/reply', (db, { n }, b) => {
  const t = tkAdmin(db, n);
  if (!b.message?.trim()) return fail(400, 'Write a reply');
  t.messages.push({ id: ++db.seq.id, author: 'admin', body: b.message.trim(), created_at: nowIso() });
  t.status = b.status || 'waiting'; t.updated_at = nowIso();
  return ok(tkOut(db, t, true));
});
on('PATCH', '/admin/support/tickets/:n', (db, { n }, b) => {
  const t = tkAdmin(db, n);
  if (b.status) t.status = b.status; if (b.priority) t.priority = b.priority; t.updated_at = nowIso();
  if (b.status === 'resolved') t.messages.push({ id: ++db.seq.id, author: 'system', body: 'Marked as resolved. Not sorted? Just reply here and we will reopen it.', created_at: nowIso() });
  return ok(tkOut(db, t, true));
});

const EVENT_TYPES = ['page_view', 'view_item', 'add_to_cart', 'begin_checkout', 'add_payment_info'];
on('POST', '/events', (db, _p, b) => {
  if (!EVENT_TYPES.includes(b.type) || !b.sessionId) return fail(400, 'Bad event');
  db.events.push({ session_id: b.sessionId, type: b.type, product_id: b.productId ?? null, value: b.value ?? null, utm_source: b.utm_source?.toLowerCase() || null, utm_campaign: b.utm_campaign?.toLowerCase() || null, country: b.country || null, created_at: nowIso() });
  if (db.events.length > 5000) db.events.splice(0, db.events.length - 5000);
  return { status: 204, data: null };
});
on('POST', '/checkout/session', (db, _p, b) => {
  if (!b.items?.length) return fail(400, 'Cart is empty');
  const q = quote(db, b.items, b.couponCode, { country: b.country || 'IN' });
  let c = b.token && db.checkouts.find((x) => x.token === b.token && !x.order_id);
  if (!c) { c = { id: ++db.seq.id, token: Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2), created_at: nowIso(), reminded_at: null, order_id: null }; db.checkouts.unshift(c); }
  Object.assign(c, { name: b.name || null, email: b.email || null, phone: b.phone || null, country: b.country || 'IN', consent: !!b.consent, items: b.items, value: q.total,
    utm_source: c.utm_source ?? b.attribution?.utm_source ?? null, utm_campaign: c.utm_campaign ?? b.attribution?.utm_campaign ?? null, updated_at: nowIso() });
  return ok({ token: c.token });
});
on('GET', '/checkout/session/:token', (db, { token }) => {
  const c = db.checkouts.find((x) => x.token === token);
  if (!c || c.order_id) return fail(404, 'This cart link has expired.');
  return ok({ items: c.items });
});
on('POST', '/contact', () => ok({ ok: true, message: 'Thanks for reaching out — we reply within one business day.' }));

const me = (db) => db.users.find((u) => u.id === db.session) || null;
const pubUser = (u) => u && { id: u.id, name: u.name, email: u.email, phone: u.phone };
on('POST', '/orders', (db, _p, b) => {
  { // accounts only (unless guest checkout is switched on) and the current terms must be accepted
    const u = me(db);
    if (!u && !db.settings.guest_checkout) return fail(401, 'Please sign in or create an account to place your order.', { code: 'LOGIN_REQUIRED' });
    if (u && lgPending(db, 'customer', u.id, CUSTOMER_KINDS).length) return fail(409, 'Please review and accept our updated terms to place your order.', { code: 'TERMS_PENDING' });
    if (!u && b.acceptTerms !== true) return fail(400, 'Please accept the Terms & Conditions and Privacy Policy.', { fields: { acceptTerms: 'Required' } });
  }
  const f = {};
  if (!b.customer?.name || b.customer.name.trim().length < 2) f['customer.name'] = 'Enter your full name';
  const country = String(b.country || 'IN').toUpperCase();
  if (b.customer?.email && !/^\S+@\S+\.\S+$/.test(b.customer.email)) f['customer.email'] = 'Enter a valid email';
  if (!b.address?.line1 || b.address.line1.length < 5) f['address.line1'] = 'Enter house no., street';
  if (!b.address?.city || b.address.city.length < 2) f['address.city'] = 'Enter your city';
  if (country === 'IN') {
    if (b.customer) b.customer.phone = normalizeIndianPhone(b.customer.phone);
    if (!/^[6-9]\d{9}$/.test(b.customer?.phone || '')) f['customer.phone'] = 'Enter a valid 10-digit Indian mobile number';
    if (!/^[1-9]\d{5}$/.test(b.address?.pincode || '')) f['address.pincode'] = 'Enter a valid 6-digit PIN code';
    if (!b.address?.state || b.address.state.length < 2) f['address.state'] = 'Choose your state';
  } else {
    if (!/^\+?[0-9][0-9\s()-]{6,19}$/.test(b.customer?.phone || '')) f['customer.phone'] = 'Enter your phone number with country code, e.g. +971 50 123 4567';
    if (!/^[A-Za-z0-9][A-Za-z0-9 -]{1,11}$/.test(b.address?.pincode || '')) f['address.pincode'] = 'Enter your postal / ZIP code';
    if (!b.customer?.email) f['customer.email'] = 'We need your email to send the secure payment link';
  }
  if (Object.keys(f).length) return fail(400, 'Please check the highlighted fields.', { fields: f });
  const q = quote(db, b.items, b.couponCode, { country, firstOrder: isFirstOrder(db, b.customer), pincode: b.address?.pincode });
  if (b.expectedTotal != null && b.expectedTotal !== q.total) return fail(409, 'Prices or offers have changed. Please review the updated total.', { quote: q });
  const u = me(db);
  const cur = String(b.currency || 'INR').toUpperCase();
  const fxRate = cur !== 'INR' ? Number(db.settings.fx_rates?.[cur]) || null : null;
  const o = createOrder(db, { ...b, country, currency: fxRate ? cur : 'INR', fxRate, userId: u?.id, attribution: b.attribution || {}, checkoutToken: b.checkoutToken });
  if (u) db.carts[u.id] = { items: [], couponCode: '' };
  const cm = b.attribution?.crm_code && (db.crmMessages || []).find((m) => m.code === b.attribution.crm_code && !m.order_id);
  if (cm) cm.order_id = o.id;
  if (b.marketingOptIn) upsertSub(db, { name: b.customer.name, email: b.customer.email, phone: b.customer.phone, country, emailOptIn: !!b.customer.email, whatsappOptIn: true, frequency: 'weekly', source: 'checkout', userId: u?.id });
  if (u && b.saveAddress && country === 'IN' && !db.addresses.some((a) => a.user_id === u.id && a.line1 === b.address.line1)) {
    db.addresses.push({ id: ++db.seq.id, user_id: u.id, label: 'Home', name: b.customer.name, phone: b.customer.phone, ...b.address, is_default: !db.addresses.some((a) => a.user_id === u.id) });
  }
  return ok({ order: detail(o), accessToken: o.token }, 201);
});
const findOrder = (db, n, h) => {
  const o = db.orders.find((x) => x.order_number === String(n).replace('#', '').toUpperCase());
  const u = me(db);
  if (!o || !((u && o.user_id === u.id) || h['X-Order-Token'] === o.token)) throw fail(404, 'Order not found.');
  return o;
};
on('GET', '/orders/:n', (db, { n }, _b, _q, h) => ok(detail(findOrder(db, n, h))));
on('POST', '/orders/:n/payment', async (db, { n }, body, _q, h) => {
  const o = findOrder(db, n, h);
  const b = formObj(body);
  if (db.settings.require_txn_ref && !/^[A-Za-z0-9]{8,30}$/.test(b.txnRef || '')) return fail(400, 'Please check the highlighted fields.', { fields: { txnRef: 'Enter the 12-digit UPI reference / UTR number' } });
  if (!['awaiting_payment', 'rejected'].includes(o.payment_status)) return fail(409, 'Payment for this order has already been submitted.');
  if (b.txnRef && db.orders.some((x) => x !== o && x.payment.customer_ref === b.txnRef.toUpperCase())) return fail(409, 'This UPI reference has already been used for another order.');
  const file = body instanceof FormData ? body.get('screenshot') : null;
  if (file && typeof file !== 'string' && file.size) o.payment.screenshot = await fileToDataUrl(file);
  o.payment.customer_ref = b.txnRef ? b.txnRef.toUpperCase() : null;
  o.payment.status = 'verification_pending'; o.payment_status = 'verification_pending';
  o.events.push({ status: 'payment_submitted', note: 'Customer submitted UPI payment details', created_at: nowIso() });
  return ok(detail(o));
});
on('POST', '/orders/track', (db, _p, b) => {
  const o = db.orders.find((x) => x.order_number === String(b.orderNumber || '').replace('#', '').trim().toUpperCase());
  const d = (s) => String(s).replace(/\D/g, '').slice(-10);
  if (!o || d(o.customer.phone) !== d(b.phone || '')) return fail(404, 'We could not find an order with those details.');
  const r = detail(o);
  return ok({ ...r, customer: { name: o.customer.name.split(' ')[0] }, address: { city: o.address.city, pincode: o.address.pincode } });
});
// Preview only: a pretend gateway so card / netbanking / wallet / EMI flows can be tried. No card data is ever taken.
on('POST', '/payments/gateway/create', (db, _p, b, _q, h) => {
  const o = findOrder(db, b.orderNumber, h);
  if (o.payment_status === 'confirmed') return fail(409, 'Already paid.');
  return ok({ demo: true, amount: o.totals.total, method: b.method });
});
on('POST', '/payments/gateway/demo-confirm', (db, _p, b, _q, h) => {
  const o = findOrder(db, b.orderNumber, h);
  if (o.payment_status === 'confirmed') return ok(detail(o));
  const INS = { card: 'Visa credit •••• 4242 (test)', netbanking: 'Netbanking · HDFC Bank (test)', wallet: 'Wallet · Paytm (test)', emi: 'EMI · Mastercard •••• 5454 (test)', upi: 'UPI (test)' };
  const t = nowIso();
  o.payment.method = 'razorpay'; o.payment.instrument = INS[b.method] || 'Card (test)';
  o.payment_status = 'confirmed'; o.payment.status = 'confirmed'; o.payment.verified_at = t;
  if (o.status === 'placed') o.status = 'payment_confirmed';
  o.events.push({ status: 'payment_confirmed', note: `Paid online — ${o.payment.instrument}`, created_at: t });
  mAfterPaid(db, o);
  return ok(detail(o));
});

on('POST', '/auth/register', (db, _p, b) => {
  const f = {};
  const india = /^india$/i.test(b.country || 'India');
  if (!b.name || b.name.trim().length < 2) f.name = 'Enter your full name';
  if (!/^\S+@\S+\.\S+$/.test(b.email || '')) f.email = 'Enter a valid email';
  if (india) { b.phone = normalizeIndianPhone(b.phone); if (!/^[6-9]\d{9}$/.test(b.phone || '')) f.phone = 'Enter a valid 10-digit Indian mobile number'; } else if (!/^\+?[1-9][\d\s-]{6,18}$/.test(b.phone || '')) f.phone = 'Enter your phone with country code';
  if (b.website) return fail(400, 'Request blocked. Please try again.');
  { const weak = passwordProblem(b.password, { email: b.email, name: b.name }); if (weak) f.password = weak; }
  if (b.password !== b.confirm_password) f.confirm_password = 'Passwords do not match';
  if (String(b.address || '').trim().length < 5) f.address = 'Enter house no., street and area';
  if (String(b.city || '').trim().length < 2) f.city = 'Enter your city';
  if (String(b.state || '').trim().length < 2) f.state = 'Choose your state';
  if (india ? !/^[1-9]\d{5}$/.test(b.pincode || '') : !/^[A-Za-z0-9][A-Za-z0-9 -]{1,11}$/.test(b.pincode || '')) f.pincode = india ? 'Enter a valid 6-digit PIN code' : 'Enter your postal / ZIP code';
  for (const c of CUSTOMER_CONSENTS) if (b.consents?.[c.key] !== true) f[`consents.${c.key}`] = 'Please tick this box to continue';
  if (Object.keys(f).length) return fail(400, 'Please check the highlighted fields.', { fields: f });
  if (db.users.some((u) => u.email.toLowerCase() === b.email.toLowerCase())) return fail(409, 'An account with this email already exists.', { fields: { email: 'Already registered — sign in instead' } });
  if (db.users.some((u) => u.is_active !== false && digits(u.phone) === digits(b.phone))) return fail(409, 'This mobile number is already registered.', { fields: { phone: 'Already registered — sign in instead' } });
  const v = mOtpVerify(db, 'signup', digits(b.phone), b.otp);
  if (v.data?.email && v.data.email !== b.email.toLowerCase()) return fail(400, 'The code was sent for a different email. Ask for a new code.', { fields: { otp: 'Ask for a new code' } });
  const u = { id: ++db.seq.id, name: b.name.trim(), email: b.email.trim(), phone: b.phone, pw: b.password, address: b.address, city: b.city, state: b.state, pincode: b.pincode, country: b.country || 'India', dob: b.dob || null, created_at: nowIso() };
  db.users.push(u); db.session = u.id;
  if (india) db.addresses.push({ id: ++db.seq.id, user_id: u.id, label: 'Home', name: u.name, phone: u.phone, line1: b.address, line2: '', city: b.city, state: b.state, pincode: b.pincode, is_default: true });
  const refs = lgAccept(db, 'customer', u, CUSTOMER_KINDS, { consents: b.consents, verification: 'Accepted at sign-up by ticking all required boxes (email and mobile on the account)' });
  lgAudit(db, { actor_type: 'customer', actor_id: u.id, subject_type: 'customer', subject_id: u.id, action: 'customer_accepted', detail: { refs } });
  if (b.marketingOptIn) upsertSub(db, { name: b.name, email: b.email, phone: b.phone, emailOptIn: true, whatsappOptIn: true, frequency: 'weekly', source: 'register', userId: u.id });
  return ok({ user: pubUser(u) }, 201);
});
const secEv = (db, kind, actor) => { (db.secEvents ||= []).unshift({ kind, actor, ip: 'this device (preview)', user_agent: navigator.userAgent, created_at: nowIso() }); db.secEvents.length = Math.min(db.secEvents.length, 200); };
on('POST', '/auth/login', (db, _p, b) => {
  const key = `user:${String(b.email || '').toLowerCase()}`;
  db.locks ||= {};
  const L = db.locks[key];
  if (L?.until && Date.parse(L.until) > Date.now()) return fail(429, `Too many wrong attempts. For your safety, sign-in is paused for ${Math.ceil((Date.parse(L.until) - Date.now()) / 60000)} minutes.`);
  const u = db.users.find((x) => x.email.toLowerCase() === String(b.email || '').toLowerCase() && x.pw === b.password && !x.deleted);
  if (!u) {
    const n = (L?.fails || 0) + 1;
    db.locks[key] = { fails: n, until: n >= 5 ? new Date(Date.now() + 15 * 6e4).toISOString() : null };
    secEv(db, n >= 5 ? 'locked' : 'login_failed', key);
    return fail(n >= 5 ? 429 : 401, n >= 5 ? 'Too many wrong attempts. For your safety, sign-in is paused for 15 minutes.' : 'Incorrect email or password.');
  }
  delete db.locks[key];
  secEv(db, 'login_ok', `user:${u.id}`);
  db.session = u.id; return ok({ user: pubUser(u) });
});
on('PUT', '/account/password', (db, _p, b) => {
  const u = needUser(db);
  if (b.current !== u.pw) return fail(400, 'Please check the highlighted fields.', { fields: { current: 'Current password is incorrect' } });
  const weak = passwordProblem(b.next, { email: u.email, name: u.name });
  if (weak) return fail(400, 'Please check the highlighted fields.', { fields: { next: weak } });
  u.pw = b.next; secEv(db, 'password_changed', `user:${u.id}`); return ok({ ok: true });
});
on('POST', '/account/logout-all', (db) => { const u = needUser(db); secEv(db, 'logout_all', `user:${u.id}`); db.session = null; return ok({ ok: true }); });
on('GET', '/account/activity', (db) => { const u = needUser(db); return ok((db.secEvents || []).filter((e) => e.actor === `user:${u.id}`).slice(0, 15)); });
on('GET', '/account/export', (db) => {
  const u = needUser(db);
  secEv(db, 'data_exported', `user:${u.id}`);
  return ok({ exported_at: nowIso(), profile: pubUser(u), addresses: db.addresses.filter((a) => a.user_id === u.id),
    wishlist: (db.wishlist[u.id] || []).map((id) => db.products.find((p) => p.id === id)?.name).filter(Boolean),
    orders: db.orders.filter((o) => o.user_id === u.id).map((o) => ({ order_number: o.order_number, status: o.status, total: o.totals?.total / 100, created_at: o.created_at, items: o.items.map((i) => ({ name: i.name, qty: i.qty })) })),
    marketing: (db.subscribers || []).filter((x) => x.user_id === u.id || x.email === u.email.toLowerCase()) });
});
on('DELETE', '/account', (db, _p, b) => {
  const u = needUser(db);
  const f = {};
  if (b?.password !== u.pw) f.password = 'Password is incorrect';
  if (b?.confirm !== 'DELETE') f.confirm = 'Type DELETE to confirm';
  if (Object.keys(f).length) return fail(400, 'Please check the highlighted fields.', { fields: f });
  db.addresses = db.addresses.filter((a) => a.user_id !== u.id); delete db.wishlist[u.id];
  db.subscribers = (db.subscribers || []).filter((x) => x.user_id !== u.id && x.email !== u.email.toLowerCase());
  for (const o of db.orders) if (o.user_id === u.id) o.user_id = null;
  Object.assign(u, { name: 'Deleted user', email: `deleted-${u.id}@deleted.invalid`, phone: null, pw: Math.random().toString(36), deleted: true });
  secEv(db, 'account_deleted', `user:${u.id}`); db.session = null;
  return ok({ ok: true });
});
on('POST', '/auth/logout', (db) => { db.session = null; return ok({ ok: true }); });
on('GET', '/auth/me', (db) => ok({ user: pubUser(me(db)) }));
const needUser = (db) => { const u = me(db); if (!u) throw fail(401, 'Please sign in to continue.'); return u; };
on('PUT', '/account/profile', (db, _p, b) => { const u = needUser(db); Object.assign(u, { name: b.name, phone: b.phone }); return ok({ user: pubUser(u) }); });
on('GET', '/account/addresses', (db) => { const u = needUser(db); return ok(db.addresses.filter((a) => a.user_id === u.id)); });
on('POST', '/account/addresses', (db, _p, b) => {
  const u = needUser(db);
  if (!/^[1-9]\d{5}$/.test(b.pincode || '')) return fail(400, 'Please check the highlighted fields.', { fields: { pincode: 'Enter a valid 6-digit PIN code' } });
  const first = !db.addresses.some((a) => a.user_id === u.id);
  if (b.is_default) db.addresses.forEach((a) => { if (a.user_id === u.id) a.is_default = false; });
  const a = { id: ++db.seq.id, user_id: u.id, ...b, is_default: first || !!b.is_default }; db.addresses.push(a); return ok(a, 201);
});
on('DELETE', '/account/addresses/:id', (db, { id }) => {
  const u = needUser(db); const cur = db.addresses.find((a) => a.id === +id && a.user_id === u.id); if (!cur) return fail(404, 'Address not found.');
  db.addresses = db.addresses.filter((a) => a !== cur);
  if (cur.is_default) { const mine = db.addresses.filter((a) => a.user_id === u.id); if (mine.length) mine[mine.length - 1].is_default = true; }
  return ok({ ok: true });
});
on('PUT', '/account/addresses/:id', (db, { id }, b) => {
  const u = needUser(db); const cur = db.addresses.find((a) => a.id === +id && a.user_id === u.id); if (!cur) return fail(404, 'Address not found.');
  const f = {}; b.phone = normalizeIndianPhone(b.phone || '');
  if (!b.name || b.name.trim().length < 2) f.name = 'Enter the name'; if (!/^[6-9]\d{9}$/.test(b.phone)) f.phone = 'Enter a valid 10-digit Indian mobile number';
  if (!b.line1 || b.line1.trim().length < 5) f.line1 = 'Enter house no., street'; if (!b.city || b.city.length < 2) f.city = 'Enter the city'; if (!b.state) f.state = 'Choose the state'; if (!/^[1-9]\d{5}$/.test(b.pincode || '')) f.pincode = 'Enter a valid 6-digit PIN code';
  if (Object.keys(f).length) return fail(400, 'Please check the highlighted fields.', { fields: f });
  if (b.is_default) db.addresses.forEach((a) => { if (a.user_id === u.id) a.is_default = false; });
  Object.assign(cur, { label: b.label || 'Home', name: b.name, phone: b.phone, line1: b.line1, line2: b.line2 || '', city: b.city, state: b.state, pincode: b.pincode, is_default: b.is_default ? true : cur.is_default });
  return ok(cur);
});
on('POST', '/account/addresses/:id/default', (db, { id }) => {
  const u = needUser(db); const cur = db.addresses.find((a) => a.id === +id && a.user_id === u.id); if (!cur) return fail(404, 'Address not found.');
  db.addresses.forEach((a) => { if (a.user_id === u.id) a.is_default = a === cur; }); return ok({ ok: true });
});
on('GET', '/account/wishlist', (db) => { const u = needUser(db); return ok((db.wishlist[u.id] || []).map((id) => db.products.find((p) => p.id === id)).filter(Boolean).map((p) => serialize(db, p))); });
on('POST', '/account/wishlist', (db, _p, b) => { const u = needUser(db); const l = new Set(db.wishlist[u.id] || []); l.add(+b.productId); db.wishlist[u.id] = [...l]; return ok({ ok: true }); });
on('DELETE', '/account/wishlist/:id', (db, { id }) => { const u = needUser(db); db.wishlist[u.id] = (db.wishlist[u.id] || []).filter((x) => x !== +id); return ok({ ok: true }); });
on('GET', '/account/cart', (db) => { const u = needUser(db); return ok(db.carts[u.id] || { items: [], couponCode: '' }); });
on('PUT', '/account/cart', (db, _p, b) => { const u = needUser(db); db.carts[u.id] = { items: b.items, couponCode: b.couponCode || '' }; return ok({ ok: true }); });
on('GET', '/account/orders', (db) => { const u = needUser(db); return ok(db.orders.filter((o) => o.user_id === u.id).map((o) => detail(o))); });
on('GET', '/account/payments', (db) => { const u = needUser(db); return ok(db.orders.filter((o) => o.user_id === u.id).map((o) => ({ order_number: o.order_number, ...o.payment }))); });
on('GET', '/account/offers', (db) => ok(db.offers.filter((o) => isOfferLive(o)).map(pubOffer)));
on('POST', '/products/:id/reviews', (db, { id }, body) => {
  const u = needUser(db);
  const b = formObj(body);
  const bought = db.orders.some((o) => o.user_id === u.id && o.payment_status === 'confirmed' && o.items.some((i) => i.product_id === +id));
  if (!bought) return fail(403, 'You can review products after your order is confirmed.');
  if ((b.body || '').length < 10) return fail(400, 'Please check the highlighted fields.', { fields: { body: 'Please write at least 10 characters' } });
  db.reviews.push({ id: ++db.seq.id, product_id: +id, user_id: u.id, author: u.name, city: b.city, rating: +b.rating, body: b.body, status: 'pending', is_verified_purchase: true, created_at: nowIso() });
  return ok({ ok: true, message: 'Thank you! Your review will appear after moderation.' }, 201);
});

// ---- admin -----------------------------------------------------------------
const needAdmin = (db) => { if (!db.admin) throw fail(401, 'Admin sign-in required.'); };
const audit = (db, action, entity, entity_id) => db.audit.unshift({ id: ++db.seq.id, admin_name: 'Store Owner', action, entity, entity_id, created_at: nowIso() });
// Admin security (preview): same rules as the server — 2FA with an authenticator app, lockout, password policy.
const adminSec = (db) => (db.adminSec ||= { pw: 'ChangeMe@2026', totp_secret: null, totp_enabled: false, last_step: -1, backup: [] });
const adminOut = (db) => ({ ...db.admin, role_label: ADMIN_ROLES[db.admin.role]?.label, must_change_password: false, totp_enabled: !!adminSec(db).totp_enabled, perms: db.admin.role === 'owner' ? 'all' : PERMISSIONS[db.admin.role] || {}, actions: Object.keys(ACTIONS).filter((k) => roleCan(db.admin.role, k)) });
on('POST', '/admin/login/2fa', async (db, _p, b) => {
  const S = adminSec(db);
  if (b.ticket !== 'demo-2fa-ticket' || !db.pending2fa) return fail(401, 'Sign-in expired. Please enter your password again.');
  const step = await verifyTotp(S.totp_secret, b.code, { lastStep: S.last_step });
  const bi = S.backup.indexOf(String(b.code || '').toUpperCase().trim());
  if (step == null && bi < 0) { secEv(db, 'login_failed', 'admin:1'); return fail(401, 'That code is not correct. Check the time on your phone and try again.'); }
  if (step != null) S.last_step = step; else { S.backup.splice(bi, 1); secEv(db, 'backup_code_used', 'admin:1'); }
  db.admin = { id: 1, name: 'Store Owner', email: 'admin@utsavghar.in', role: 'owner' }; db.pending2fa = false;
  secEv(db, 'login_ok', 'admin:1'); audit(db, 'login', 'admin', 1);
  return ok({ admin: adminOut(db) });
});
on('POST', '/admin/me/2fa/setup', (db) => { needAdmin(db); const S = adminSec(db); S.totp_secret = newTotpSecret(); S.totp_enabled = false; return ok({ secret: S.totp_secret, otpauth: otpauthUrl({ secret: S.totp_secret, account: 'admin@utsavghar.in' }) }); });
on('POST', '/admin/me/2fa/enable', async (db, _p, b) => {
  needAdmin(db); const S = adminSec(db);
  const step = await verifyTotp(S.totp_secret, b.code);
  if (step == null) return fail(400, 'That code is not correct. Enter the 6-digit code shown in your authenticator app.');
  S.totp_enabled = true; S.last_step = step; S.backup = newBackupCodes(10); secEv(db, '2fa_enabled', 'admin:1');
  return ok({ ok: true, backupCodes: S.backup });
});
on('POST', '/admin/me/2fa/disable', async (db, _p, b) => {
  needAdmin(db); const S = adminSec(db);
  if (b.password !== S.pw) return fail(400, 'Password is incorrect.');
  if ((await verifyTotp(S.totp_secret, b.code, { lastStep: S.last_step })) == null) return fail(400, 'Authenticator code is not correct.');
  Object.assign(S, { totp_enabled: false, totp_secret: null, backup: [] }); secEv(db, '2fa_disabled', 'admin:1'); return ok({ ok: true });
});
on('POST', '/admin/me/logout-all', (db) => { needAdmin(db); secEv(db, 'logout_all', 'admin:1'); db.admin = null; return ok({ ok: true }); });
on('GET', '/admin/security', (db) => {
  needAdmin(db); const S = adminSec(db);
  const ev = (kinds) => (db.secEvents || []).filter((e) => kinds.includes(e.kind));
  return ok({
    checks: [
      { ok: false, label: 'Running in production mode (HTTPS redirect, secure cookies, HSTS)', fix: 'This is the preview. On your server set NODE_ENV=production.' },
      { ok: S.pw !== 'ChangeMe@2026', label: 'Default admin password changed', fix: 'Change it below.' },
      { ok: S.totp_enabled, label: 'Two-step login (authenticator app) on owner accounts', fix: 'Turn on two-step login below.' },
      { ok: true, label: 'Payment webhook signature secret set (if using Razorpay)', fix: '' },
      { ok: false, label: 'Database backed up in the last 2 days', fix: 'Backups run daily on the real server (npm run backup).' },
      { ok: false, label: 'Admin panel limited to your IP addresses (optional)', fix: 'Set ADMIN_ALLOWED_IPS in .env.', optional: true },
    ],
    admins: [{ id: 1, name: 'Store Owner', email: 'admin@utsavghar.in', role: 'owner', is_active: 1, totp_enabled: S.totp_enabled }],
    locked: Object.entries(db.locks || {}).filter(([, v]) => v.until && Date.parse(v.until) > Date.now()).map(([key, v]) => ({ key, fails: v.fails, locked_until: v.until })),
    logins: ev(['login_ok']).filter((e) => e.actor.startsWith('admin')), failures: ev(['login_failed', 'locked', 'backup_code_used', 'bot_blocked']),
    changes: ev(['password_changed', 'logout_all', '2fa_enabled', '2fa_disabled', 'account_deleted', 'data_exported']), lastBackup: null,
  });
});
on('POST', '/admin/security/unlock', (db, _p, b) => { needAdmin(db); if (db.locks) delete db.locks[b.key]; return ok({ ok: true }); });
on('POST', '/admin/login', (db, _p, b) => {
  const S = adminSec(db);
  if (String(b.email || '').trim().toLowerCase() === 'admin@utsavghar.in' && (b.password === S.pw || b.preview) && S.totp_enabled) { db.pending2fa = true; return ok({ twoFactor: true, ticket: 'demo-2fa-ticket' }); }
  if (String(b.email || '').trim().toLowerCase() !== 'admin@utsavghar.in' || (String(b.password || '').trim() !== S.pw && !b.preview)) return fail(401, 'Incorrect email or password. In this preview use admin@utsavghar.in / ChangeMe@2026, or tap "Enter admin (preview)".');
  db.admin = { id: 1, name: 'Store Owner', email: 'admin@utsavghar.in', role: 'owner' }; audit(db, 'login', 'admin', 1); secEv(db, 'login_ok', 'admin:1'); return ok({ admin: adminOut(db) });
});
on('POST', '/admin/logout', (db) => { db.admin = null; return ok({ ok: true }); });
on('GET', '/admin/me', (db) => { needAdmin(db); return ok({ admin: adminOut(db) }); });
on('GET', '/admin/stats', (db) => {
  needAdmin(db);
  const paid = db.orders.filter((o) => o.payment_status === 'confirmed' && o.status !== 'cancelled');
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const salesByDay = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(today.getTime() - (13 - i) * 864e5); const e = d.getTime() + 864e5;
    const inDay = paid.filter((o) => { const t = new Date(o.created_at).getTime(); return t >= d.getTime() && t < e; });
    return { date: d.toISOString().slice(0, 10), sales: inDay.reduce((s, o) => s + o.totals.total, 0), orders: inDay.length };
  });
  const top = {};
  for (const o of paid) for (const i of o.items) { top[i.name] ??= { name: i.name, qty: 0, revenue: 0 }; top[i.name].qty += i.qty; top[i.name].revenue += i.line_total; }
  const grossProfit = paid.reduce((a, o) => a + o.items.reduce((b, i) => b + i.line_total - (i.discount_share || 0) - (i.unit_cost || 0) * i.qty, 0), 0);
  return ok({
    grossProfit,
    totalSales: paid.reduce((s, o) => s + o.totals.total, 0),
    todaySales: paid.filter((o) => new Date(o.created_at) >= today).reduce((s, o) => s + o.totals.total, 0),
    orders: db.orders.length, todayOrders: db.orders.filter((o) => new Date(o.created_at) >= today).length,
    pendingPayments: db.orders.filter((o) => o.payment_status === 'verification_pending' && o.status !== 'cancelled').length,
    awaitingPayment: db.orders.filter((o) => o.payment_status === 'awaiting_payment' && o.status !== 'cancelled').length,
    toShip: db.orders.filter((o) => ['payment_confirmed', 'processing'].includes(o.status)).length,
    products: db.products.filter((p) => p.is_active).length, customers: db.users.length,
    lowStock: db.products.filter((p) => p.is_active && p.stock <= p.low_stock_threshold).map((p) => ({ id: p.id, name: p.name, stock: p.stock, low_stock_threshold: p.low_stock_threshold })),
    activeOffers: db.offers.filter((o) => isOfferLive(o)).length,
    pendingReviews: db.reviews.filter((r) => r.status === 'pending').length,
    salesByDay,
    recentOrders: db.orders.slice(0, 8).map((o) => ({ order_number: o.order_number, customer_name: o.customer.name, total: o.totals.total, payment_status: o.payment_status, status: o.status, created_at: o.created_at })),
    topProducts: Object.values(top).sort((a, b) => b.qty - a.qty).slice(0, 5),
  });
});
on('GET', '/admin/products', (db, _p, _b, q) => { needAdmin(db); const s = (q.q || '').toLowerCase(); return ok(db.products.filter((p) => !s || p.name.toLowerCase().includes(s)).map((p) => serialize(db, p, true))); });
on('GET', '/admin/products/:id', (db, { id }) => { needAdmin(db); const p = db.products.find((x) => x.id === +id); return p ? ok(serialize(db, p, true)) : fail(404, 'Not found'); });
const toProduct = (b) => ({
  name: b.name, slug: b.slug, category_id: +b.category_id, short_description: b.short_description, description: b.description, specs: b.specs || {},
  price: Math.round(b.price * 100), mrp: Math.round(b.mrp * 100), cost_price: Math.round((Number(b.cost_price) || 0) * 100), stock: +b.stock, low_stock_threshold: +b.low_stock_threshold || 10, art: b.art,
  is_active: !!b.is_active, is_featured: !!b.is_featured, is_bestseller: !!b.is_bestseller, is_new: !!b.is_new, is_diwali: !!b.is_diwali,
  sort_order: +b.sort_order || 0, seo_title: b.seo_title, seo_description: b.seo_description,
  ships_international: !!b.ships_international,
  is_bundle: !!(b.is_bundle && b.bundle_items?.length), bundle_items: b.is_bundle ? (b.bundle_items || []).map((x) => ({ product_id: +x.product_id, qty: +x.qty || 1 })) : [],
});
const cleanBundle = (db, p) => { p.bundle_items = p.bundle_items.filter((x) => x.product_id !== p.id && db.products.some((y) => y.id === x.product_id && !y.is_bundle)); p.is_bundle = p.bundle_items.length > 0; };
const validProduct = (db, b, id) => {
  const f = {};
  if (!b.name || b.name.length < 2) f.name = 'Required';
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(b.slug || '')) f.slug = 'Use lowercase letters, numbers and hyphens';
  else if (db.products.some((p) => p.slug === b.slug && p.id !== id)) f.slug = 'Already used by another product';
  if (+b.mrp < +b.price) f.mrp = 'MRP must be greater than or equal to the selling price';
  return Object.keys(f).length ? fail(400, 'Please check the highlighted fields.', { fields: f }) : null;
};
on('POST', '/admin/products', (db, _p, b) => { needAdmin(db); const e = validProduct(db, b); if (e) return e; const p = { id: ++db.seq.id, rating: 0, rating_count: 0, images: [], created_at: nowIso(), ...toProduct(b) }; cleanBundle(db, p); db.products.push(p); audit(db, 'create', 'product', p.id); return ok({ id: p.id }, 201); });
on('PUT', '/admin/products/:id', (db, { id }, b) => { needAdmin(db); const p = db.products.find((x) => x.id === +id); const e = validProduct(db, b, +id); if (e) return e; Object.assign(p, toProduct(b)); cleanBundle(db, p); audit(db, 'update', 'product', id); return ok({ id: +id }); });
on('PATCH', '/admin/products/:id/pricing', (db, { id }, b) => {
  needAdmin(db);
  if (Number(b.mrp) < Number(b.price)) return fail(400, 'Please check the highlighted fields.', { fields: { mrp: 'MRP must be greater than or equal to the selling price' } });
  const p = db.products.find((x) => x.id === +id);
  Object.assign(p, { price: Math.round(b.price * 100), mrp: Math.round(b.mrp * 100), cost_price: Math.round(b.cost_price * 100) });
  if (b.stock != null) p.stock = +b.stock;
  audit(db, 'update_pricing', 'product', id); return ok({ ok: true });
});
on('GET', '/admin/profit', (db) => {
  needAdmin(db);
  const offer = headline(db);
  const sold = {};
  for (const o of db.orders) {
    if (o.payment_status !== 'confirmed' || o.status === 'cancelled') continue;
    for (const i of o.items) {
      const s = (sold[i.product_id] ??= { units: 0, revenue: 0, cogs: 0 });
      s.units += i.qty; s.revenue += i.line_total - (i.discount_share || 0); s.cogs += (i.unit_cost || 0) * i.qty;
    }
  }
  const products = db.products.map((p) => {
    const c = cat(db, p.category_id) || {};
    const s = sold[p.id] || { units: 0, revenue: 0, cogs: 0 };
    const eligible = offer && isProductEligible(offer, p);
    const offerPrice = eligible && ['percent', 'tiered'].includes(offer.discount_type) ? Math.round(p.price * (1 - offerMaxPercent(offer) / 100)) : null;
    return {
      id: p.id, name: p.name, slug: p.slug, category_slug: c.slug, category_name: c.name, is_active: p.is_active, art: p.art, image: p.images[0]?.url || null,
      mrp: p.mrp, price: p.price, cost: p.cost_price || 0, stock: p.stock, unit_profit: p.price - (p.cost_price || 0),
      margin_pct: p.price ? Math.round(((p.price - (p.cost_price || 0)) / p.price) * 1000) / 10 : 0,
      offer_price: offerPrice, offer_unit_profit: offerPrice == null ? null : offerPrice - (p.cost_price || 0),
      units_sold: s.units, revenue: s.revenue, cogs: s.cogs, gross_profit: s.revenue - s.cogs, stock_value_at_cost: p.stock * (p.cost_price || 0),
    };
  });
  const sum = (k) => products.reduce((a, p) => a + (p[k] || 0), 0);
  const revenue = sum('revenue'); const cogs = sum('cogs');
  const paid = db.orders.filter((o) => o.payment_status === 'confirmed' && o.status !== 'cancelled');
  return ok({
    offer: offer && { name: offer.name, discount_type: offer.discount_type, discount_value: offer.discount_value, min_qty: offer.min_qty },
    totals: {
      orders: paid.length, revenue, cogs, gross_profit: revenue - cogs, margin_pct: revenue ? Math.round(((revenue - cogs) / revenue) * 1000) / 10 : 0,
      delivery_collected: paid.reduce((a, o) => a + o.totals.delivery, 0), units_sold: sum('units_sold'), stock_value_at_cost: sum('stock_value_at_cost'),
      missing_cost: products.filter((p) => !p.cost).length, loss_at_offer: products.filter((p) => p.offer_unit_profit != null && p.offer_unit_profit < 0).length,
    },
    products,
  });
});
on('DELETE', '/admin/products/:id', (db, { id }) => {
  needAdmin(db);
  if (db.orders.some((o) => o.items.some((i) => i.product_id === +id))) { db.products.find((x) => x.id === +id).is_active = false; audit(db, 'archive', 'product', id); return ok({ archived: true, message: 'Product has orders, so it was disabled instead of deleted.' }); }
  db.products = db.products.filter((x) => x.id !== +id); audit(db, 'delete', 'product', id); return ok({ deleted: true });
});
on('POST', '/admin/products/:id/images', async (db, { id }, body) => {
  needAdmin(db); const p = db.products.find((x) => x.id === +id);
  for (const f of body.getAll('images')) p.images.push({ id: ++db.seq.id, url: await fileToDataUrl(f), alt: p.name });
  return ok(p.images);
});
on('DELETE', '/admin/images/:id', (db, { id }) => { needAdmin(db); for (const p of db.products) p.images = p.images.filter((i) => i.id !== +id); return ok({ ok: true }); });
on('GET', '/admin/categories', (db) => { needAdmin(db); return ok(db.categories.map((c) => ({ ...c, product_count: db.products.filter((p) => p.category_id === c.id).length }))); });
on('POST', '/admin/categories', (db, _p, b) => { needAdmin(db); const c = { id: ++db.seq.id, ...b, segment: b.segment || 'festive-decor', art: b.art || { type: 'diya', tone: 'gold' } }; db.categories.push(c); audit(db, 'create', 'category', c.id); return ok({ id: c.id }, 201); });
on('PUT', '/admin/categories/:id', (db, { id }, b) => { needAdmin(db); Object.assign(db.categories.find((c) => c.id === +id), b); audit(db, 'update', 'category', id); return ok({ ok: true }); });
on('DELETE', '/admin/categories/:id', (db, { id }) => {
  needAdmin(db); const n = db.products.filter((p) => p.category_id === +id).length;
  if (n) return fail(409, `Move or delete the ${n} product(s) in this category first.`);
  db.categories = db.categories.filter((c) => c.id !== +id); return ok({ ok: true });
});
on('GET', '/admin/offers', (db) => { needAdmin(db); return ok(db.offers.map((o) => ({ ...o, live: isOfferLive(o) }))); });
const toOffer = (b) => {
  const tiers = b.discount_type === 'tiered' ? (b.tiers || []).map((t) => ({ min_qty: +t.min_qty, percent: +t.percent })).sort((x, y) => x.min_qty - y.min_qty) : null;
  return {
  name: b.name, description: b.description, discount_type: b.discount_type, tiers, first_order_only: !!b.first_order_only,
  discount_value: b.discount_type === 'flat' ? Math.round(b.discount_value * 100) : tiers ? Math.max(...tiers.map((t) => t.percent)) : +b.discount_value,
  min_qty: tiers ? tiers[0].min_qty : +b.min_qty, max_discount: b.max_discount === '' || b.max_discount == null ? null : Math.round(b.max_discount * 100),
  starts_at: b.starts_at || null, ends_at: b.ends_at || null, coupon_code: b.coupon_code ? b.coupon_code.toUpperCase() : null,
  is_active: !!b.is_active, product_ids: b.product_ids || [], category_ids: b.category_ids || [],
  };
};
const badOffer = (b) => {
  if (!b.name || b.name.length < 3) return fail(400, 'Please check the highlighted fields.', { fields: { name: 'At least 3 characters' } });
  if (b.discount_type === 'tiered') {
    const t = (b.tiers || []).map((x) => ({ q: +x.min_qty, p: +x.percent })).sort((x, y) => x.q - y.q);
    let m = !t.length ? 'Add at least one tier' : new Set(t.map((x) => x.q)).size !== t.length ? 'Each tier needs a different quantity' : null;
    for (let i = 1; !m && i < t.length; i++) if (t[i].p <= t[i - 1].p) m = 'Bigger quantities should give a bigger discount';
    if (!m && t.some((x) => x.p < 1 || x.p > 90 || x.q < 1)) m = 'Percent must be 1–90 and quantity at least 1';
    if (m) return fail(400, 'Please check the highlighted fields.', { fields: { tiers: m } });
  } else if (['percent', 'cheapest'].includes(b.discount_type) && (+b.discount_value <= 0 || +b.discount_value > 90)) return fail(400, 'Please check the highlighted fields.', { fields: { discount_value: 'Percentage must be between 1 and 90' } });
  return null;
};
on('POST', '/admin/offers', (db, _p, b) => { needAdmin(db); const e = badOffer(b); if (e) return e; const o = { id: ++db.seq.id, ...toOffer(b) }; db.offers.push(o); audit(db, 'create', 'offer', o.id); return ok({ id: o.id }, 201); });
on('PUT', '/admin/offers/:id', (db, { id }, b) => { needAdmin(db); const e = badOffer(b); if (e) return e; Object.assign(db.offers.find((o) => o.id === +id), toOffer(b)); audit(db, 'update', 'offer', id); return ok({ ok: true }); });
on('DELETE', '/admin/offers/:id', (db, { id }) => { needAdmin(db); db.offers = db.offers.filter((o) => o.id !== +id); return ok({ ok: true }); });
on('GET', '/admin/orders', (db, _p, _b, q) => {
  needAdmin(db);
  let rows = db.orders;
  if (q.status) rows = rows.filter((o) => o.status === q.status);
  if (q.payment) rows = rows.filter((o) => o.payment_status === q.payment);
  if (q.q) { const s = q.q.toLowerCase(); rows = rows.filter((o) => `${o.order_number} ${o.customer.name} ${o.customer.phone}`.toLowerCase().includes(s)); }
  return ok(rows.map((o) => detail(o, true)));
});
on('GET', '/admin/orders/:id', (db, { id }) => { needAdmin(db); const o = db.orders.find((x) => x.id === +id); return o ? ok(detail(o, true)) : fail(404, 'Not found'); });
on('POST', '/admin/orders/:id/action', (db, { id }, b) => { needAdmin(db); const o = db.orders.find((x) => x.id === +id); adminAction(db, o, b.action, b); audit(db, b.action, 'order', o.order_number); return ok(detail(o, true)); });
on('PUT', '/admin/orders/:id/note', (db, { id }, b) => { needAdmin(db); db.orders.find((x) => x.id === +id).admin_note = b.note; return ok({ ok: true }); });
on('GET', '/admin/payments', (db, _p, _b, q) => {
  needAdmin(db);
  return ok(db.orders.filter((o) => !q.status || o.payment.status === q.status).map((o) => ({
    ...o.payment, id: o.id, order_id: o.id, order_number: o.order_number, customer_name: o.customer.name, customer_phone: o.customer.phone,
    has_screenshot: !!o.payment.screenshot, screenshot_url: o.payment.screenshot, updated_at: o.created_at,
  })));
});
on('GET', '/admin/reviews', (db) => { needAdmin(db); return ok(db.reviews.map((r) => ({ ...r, product_name: db.products.find((p) => p.id === r.product_id)?.name })).sort((a, b) => (b.status === 'pending') - (a.status === 'pending'))); });
on('PUT', '/admin/reviews/:id', (db, { id }, b) => { needAdmin(db); db.reviews.find((r) => r.id === +id).status = b.status; audit(db, `review_${b.status}`, 'review', id); return ok({ ok: true }); });
on('GET', '/admin/customers', (db) => { needAdmin(db); return ok(db.users.map((u) => ({ ...pubUser(u), created_at: u.created_at, orders: db.orders.filter((o) => o.user_id === u.id).length, spent: db.orders.filter((o) => o.user_id === u.id && o.payment_status === 'confirmed').reduce((s, o) => s + o.totals.total, 0) }))); });
on('GET', '/admin/settings', (db) => { needAdmin(db); return ok(db.settings); });
on('PUT', '/admin/settings', (db, _p, b) => {
  needAdmin(db);
  if (!/^[a-zA-Z0-9._-]{2,256}@[a-zA-Z]{2,64}$/.test(b.upi_id || '')) return fail(400, 'Please check the highlighted fields.', { fields: { upi_id: 'Enter a valid UPI ID like yourname@okhdfcbank' } });
  const next = { ...b, delivery_fee: Math.round(b.delivery_fee * 100), free_delivery_above: Math.round(b.free_delivery_above * 100) };
  for (const k of Object.keys(next)) if (next[k] === undefined) delete next[k];
  if (next.fx_rates) next.fx_rates = Object.fromEntries(Object.entries(next.fx_rates).filter(([k, v]) => /^[A-Z]{3}$/.test(k) && +v > 0).map(([k, v]) => [k, +v]));
  if (next.fx_markup_pct != null) next.fx_markup_pct = Math.min(20, Math.max(0, +next.fx_markup_pct || 0));
  Object.assign(db.settings, next);
  audit(db, 'update', 'settings'); return ok(db.settings);
});
on('PUT', '/admin/settings/tracking', (db, _p, b) => {
  needAdmin(db);
  const f = {};
  const pixel = String(b.meta_pixel_id || '').trim(); const ga = String(b.ga4_measurement_id || '').trim().toUpperCase();
  if (!/^\d{0,20}$/.test(pixel)) f.meta_pixel_id = 'The Pixel ID is a number of up to 20 digits';
  if (!/^(G-[A-Z0-9]{4,16})?$/.test(ga)) f.ga4_measurement_id = 'Looks like G-XXXXXXXXXX';
  if (Object.keys(f).length) return fail(400, 'Please check the highlighted fields.', { fields: f });
  Object.assign(db.settings, { meta_pixel_id: pixel, ga4_measurement_id: ga }); audit(db, 'update', 'settings', 'tracking'); return ok({ ok: true });
});

// ---- marketing (mirrors GET /api/admin/marketing) -----------------------------
on('GET', '/admin/marketing', (db, _p, _b, q) => {
  needAdmin(db);
  const days = Math.min(365, Math.max(1, +q.days || 30));
  const since = new Date(Date.now() - days * 864e5).toISOString();
  const sinceMonth = since.slice(0, 7);
  const ev = db.events.filter((e) => e.created_at >= since);
  const sessionsOf = (type) => new Set(ev.filter((e) => e.type === type).map((e) => e.session_id)).size;
  const orders = db.orders.filter((o) => o.created_at >= since);
  const isPaid = (o) => o.payment_status === 'confirmed' && o.status !== 'cancelled';
  const funnel = [
    { key: 'visits', label: 'Visited the store', count: sessionsOf('page_view') },
    { key: 'view_item', label: 'Viewed a product', count: sessionsOf('view_item') },
    { key: 'add_to_cart', label: 'Added to cart', count: sessionsOf('add_to_cart') },
    { key: 'begin_checkout', label: 'Started checkout', count: sessionsOf('begin_checkout') },
    { key: 'orders', label: 'Placed an order', count: orders.length },
    { key: 'paid', label: 'Paid', count: orders.filter(isPaid).length },
  ];
  const rows = new Map();
  const row = (src, camp) => {
    const k = `${(src || 'direct').toLowerCase()}|${(camp || '').toLowerCase()}`;
    if (!rows.has(k)) rows.set(k, { source: (src || 'direct').toLowerCase(), campaign: (camp || '').toLowerCase(), sessions: 0, orders: 0, paid: 0, revenue: 0, gross_profit: 0, spend: 0, _s: new Set() });
    return rows.get(k);
  };
  for (const e of ev) if (e.type === 'page_view') row(e.utm_source, e.utm_campaign)._s.add(e.session_id);
  for (const o of orders) {
    const x = row(o.attribution?.utm_source, o.attribution?.utm_campaign); x.orders++;
    if (isPaid(o)) { x.paid++; x.revenue += o.totals.total; x.gross_profit += o.items.reduce((a, i) => a + i.line_total - (i.discount_share || 0) - (i.unit_cost || 0) * i.qty, 0); }
  }
  for (const a of db.adSpend) if (a.month >= sinceMonth) row(a.source, a.campaign).spend += a.amount;
  const list = [...rows.values()].map(({ _s, ...x }) => {
    x.sessions = _s.size;
    return { ...x, conversion_pct: x.sessions ? Math.round((x.paid / x.sessions) * 1000) / 10 : null, roas: x.spend ? Math.round((x.revenue / x.spend) * 100) / 100 : null,
      cpa: x.spend && x.paid ? Math.round(x.spend / x.paid) : null, profit_after_ads: x.gross_profit - x.spend };
  }).sort((a, b) => b.revenue - a.revenue || b.sessions - a.sessions);
  const sum = (k) => list.reduce((t, x) => t + (x[k] || 0), 0);
  const totals = { sessions: funnel[0].count, paid: sum('paid'), revenue: sum('revenue'), gross_profit: sum('gross_profit'), spend: sum('spend') };
  totals.roas = totals.spend ? Math.round((totals.revenue / totals.spend) * 100) / 100 : null;
  totals.cpa = totals.spend && totals.paid ? Math.round(totals.spend / totals.paid) : null;
  totals.profit_after_ads = totals.gross_profit - totals.spend;
  totals.aov = totals.paid ? Math.round(totals.revenue / totals.paid) : 0;
  const cutoff = new Date(Date.now() - 30 * 6e4).toISOString();
  const ab = db.checkouts.filter((c) => !c.order_id && c.updated_at >= since && c.updated_at < cutoff);
  return ok({
    days, since, funnel, sources: list, totals,
    tracking: { meta_pixel_id: db.settings.meta_pixel_id || '', ga4_measurement_id: db.settings.ga4_measurement_id || '', metaCapi: false, ga4: false },
    abandoned: { n: ab.length, v: ab.reduce((s, c) => s + (c.value || 0), 0) },
  });
});
on('GET', '/admin/ad-spend', (db) => { needAdmin(db); return ok([...db.adSpend].sort((a, b) => b.month.localeCompare(a.month) || b.id - a.id)); });
on('POST', '/admin/ad-spend', (db, _p, b) => {
  needAdmin(db);
  const f = {};
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(b.month || '')) f.month = 'Use YYYY-MM';
  if (!b.source || String(b.source).trim().length < 2) f.source = 'Required';
  if (!(+b.amount >= 0) || b.amount === '') f.amount = 'Enter an amount';
  if (Object.keys(f).length) return fail(400, 'Please check the highlighted fields.', { fields: f });
  const r = { id: ++db.seq.id, month: b.month, source: String(b.source).trim().toLowerCase(), campaign: String(b.campaign || '').trim().toLowerCase(), amount: Math.round(+b.amount * 100), notes: b.notes || '', created_at: nowIso() };
  db.adSpend.push(r); audit(db, 'create', 'ad_spend', r.id); return ok({ id: r.id }, 201);
});
on('DELETE', '/admin/ad-spend/:id', (db, { id }) => { needAdmin(db); db.adSpend = db.adSpend.filter((x) => x.id !== +id); audit(db, 'delete', 'ad_spend', id); return ok({ ok: true }); });
on('GET', '/admin/abandoned', (db) => {
  needAdmin(db);
  const cutoff = new Date(Date.now() - 30 * 6e4).toISOString();
  const base = `${location.origin}${location.pathname}#`;
  return ok(db.checkouts.filter((c) => !c.order_id && c.updated_at < cutoff).map((c) => ({ ...c, cart_url: `${base}/cart?restore=${c.token}` })));
});
on('POST', '/admin/abandoned/:id/remind', (db, { id }) => {
  needAdmin(db);
  const c = db.checkouts.find((x) => x.id === +id);
  if (!c || c.order_id) return fail(404, 'Not found');
  if (!c.consent) return fail(409, 'This customer did not agree to reminders. Contact them only about their order if they ask.');
  c.reminded_at = nowIso();
  db.notifications.unshift({ id: ++db.seq.id, channel: c.email ? 'email' : 'sms', recipient: c.email || c.phone, template: 'cart_reminder', status: 'demo', created_at: nowIso() });
  audit(db, 'remind', 'checkout_session', c.id); return ok({ ok: true });
});
const toZone = (b) => ({
  code: String(b.code || '').trim().toUpperCase(), name: String(b.name || '').trim(), countries: (b.countries || []).map((c) => String(c).trim().toUpperCase()),
  fee: Math.round((+b.fee || 0) * 100), extra_item_fee: Math.round((+b.extra_item_fee || 0) * 100), free_above: Math.round((+b.free_above || 0) * 100),
  delivery_text: b.delivery_text || '', duties_note: b.duties_note || '', is_active: b.is_active !== false, sort_order: +b.sort_order || 0,
});
const badZone = (z) => {
  const f = {};
  if (!/^[A-Z_]{2,12}$/.test(z.code)) f.code = '2–12 capital letters';
  if (z.name.length < 2) f.name = 'Required';
  if (!z.countries.length || z.countries.some((c) => !/^([A-Z]{2}|\*)$/.test(c))) f.countries = 'Two-letter country codes separated by commas, or *';
  return Object.keys(f).length ? fail(400, 'Please check the highlighted fields.', { fields: f }) : null;
};
on('GET', '/admin/zones', (db) => { needAdmin(db); return ok([...db.zones].sort((a, b) => a.sort_order - b.sort_order || a.id - b.id)); });
on('POST', '/admin/zones', (db, _p, b) => { needAdmin(db); const z = toZone(b); const e = badZone(z); if (e) return e; z.id = ++db.seq.id; db.zones.push(z); audit(db, 'create', 'zone', z.id); return ok({ id: z.id }, 201); });
on('PUT', '/admin/zones/:id', (db, { id }, b) => { needAdmin(db); const z = toZone(b); const e = badZone(z); if (e) return e; Object.assign(db.zones.find((x) => x.id === +id), z); audit(db, 'update', 'zone', id); return ok({ ok: true }); });
on('DELETE', '/admin/zones/:id', (db, { id }) => { needAdmin(db); db.zones = db.zones.filter((x) => x.id !== +id || x.code === 'IN'); audit(db, 'delete', 'zone', id); return ok({ ok: true }); });
on('POST', '/admin/settings/qr', async (db, _p, body) => { needAdmin(db); db.settings.upi_qr_url = await fileToDataUrl(body.get('qr')); return ok({ upi_qr_url: db.settings.upi_qr_url }); });
on('GET', '/admin/notifications', (db) => { needAdmin(db); return ok(db.notifications); });
on('GET', '/admin/audit', (db) => { needAdmin(db); return ok(db.audit.slice(0, 200)); });
on('PUT', '/admin/me/password', (db, _p, b) => {
  needAdmin(db); const S = adminSec(db);
  if (b.current !== S.pw) return fail(400, 'Current password is incorrect.', { fields: { current: 'Current password is incorrect' } });
  const weak = passwordProblem(b.next, { min: 10, email: 'admin@utsavghar.in', name: 'Store Owner', admin: true });
  if (weak) return fail(400, weak, { fields: { next: weak } });
  S.pw = b.next; secEv(db, 'password_changed', 'admin:1'); return ok({ ok: true });
});

// ---- built-in AI / ML (same shared/ml code as the server; free, no external AI) ----
on('POST', '/assistant', (db, _p, b) => {
  const q = String(b?.q || '').trim().slice(0, 300);
  if (!q) return fail(400, 'Ask a question');
  const d = recCached(db);
  const r = assist(q, d.rows);
  if (!r) return ok({ type: null });
  return ok({ ...r, items: r.items ? pub(db, r.items) : null, product: r.product ? pub(db, [r.product])[0] : null, others: r.others ? pub(db, r.others) : null });
});
on('GET', '/products/:slug/review-summary', (db, { slug }) => {
  const p = db.products.find((x) => x.slug === slug);
  if (!p) return fail(404, 'Not found');
  return ok({ summary: summarizeReviews(db.reviews.filter((r) => r.product_id === p.id && r.status === 'approved')) });
});
// DEMO ONLY: the simulated shopper history gets demo names so the screens have something to show.
const DEMO_NAMES = ['Priya S', 'Rahul M', 'Anjali K', 'Vikram R', 'Neha G', 'Arjun P', 'Sneha T', 'Karan J', 'Pooja D', 'Rohit B', 'Meera N', 'Aditya V'];
function demoSales(db) {
  const real = db.orders.filter((o) => o.status !== 'cancelled').map((o) => ({ customer: o.user_id ? `u${o.user_id}` : `p${o.customer.phone}`, name: o.customer.name, phone: o.customer.phone, email: o.customer.email, at: o.created_at, items: o.items, total: o.totals.total, paid: o.payment_status === 'confirmed' }));
  const fake = (db.demoHistory || []).map((o, i) => {
    const k = Number(o.customer.slice(6)) % 140; // repeat customers
    const total = o.items.reduce((s, it) => s + (prod(db, it.product_id)?.price || 0) * it.qty, 0);
    // spread demo history over 12 weeks so trends exist
    const at = new Date(Date.parse(o.at) - (i % 3) * 28 * 864e5).toISOString();
    return { customer: `demo${k}`, name: `${DEMO_NAMES[k % DEMO_NAMES.length]} (demo ${k})`, phone: `98${String(10000000 + k * 7919).slice(0, 8)}`, email: null, at, items: o.items, total, paid: true };
  });
  return [...real, ...fake];
}
on('GET', '/admin/ai/forecast', (db, _p, _b, q) => {
  needAdmin(db);
  const lead = Math.min(60, Math.max(1, Number(q.lead) || 10));
  const products = db.products.filter((p) => p.is_active && !p.is_bundle).map((p) => { const c = cat(db, p.category_id) || {}; return { id: p.id, name: p.name, price: p.price, cost_price: p.cost_price, is_diwali: !!p.is_diwali, category_slug: c.slug, category_name: c.name, segment: c.segment, stock: p.stock }; });
  const sales = [];
  for (const o of demoSales(db)) for (const it of o.items) {
    const p = prod(db, it.product_id);
    if (p?.is_bundle) for (const bi of p.bundle_items || []) sales.push({ product_id: bi.product_id, qty: bi.qty * it.qty, at: o.at });
    else sales.push({ product_id: it.product_id, qty: it.qty, at: o.at });
  }
  const rows = forecastDemand({ products, sales, calendar: crmSettings(db).calendar, leadTime: lead });
  return ok({ lead, demo: true, orders_90d: demoSales(db).length, rows, summary: {
    reorder_now: rows.filter((r) => r.status === 'reorder_now' || r.status === 'out').length,
    reorder_soon: rows.filter((r) => r.status === 'reorder_soon').length,
    overstock: rows.filter((r) => r.status === 'overstock').length,
    overstock_value: rows.filter((r) => r.status === 'overstock').reduce((s, r) => s + r.stock_value, 0),
  } });
});
on('GET', '/admin/ai/segments', (db) => {
  needAdmin(db);
  const r = segmentCustomers(demoSales(db).filter((o) => o.paid));
  const subs = new Set((db.subscribers || []).filter((x) => x.status === 'active').map((x) => x.phone));
  for (const g of r.groups) for (const c of g.customers) { c.subscribed = subs.has(c.phone); delete c.key; }
  return ok({ ...r, demo: true });
});
function mockRisk(db, o) {
  const t = Date.parse(o.created_at);
  const near = (x) => Math.abs(Date.parse(x.created_at) - t) < 864e5 && Date.parse(x.created_at) <= t;
  const paid = db.orders.filter((x) => x.payment_status === 'confirmed');
  const avg = paid.length ? paid.reduce((s, x) => s + x.totals.total, 0) / paid.length : 150000;
  const utr = o.payment?.customer_ref || null;
  return orderRisk({
    total: o.totals.total, max_line_qty: Math.max(0, ...o.items.map((i) => i.qty)),
    customer: o.customer, address: { state: o.address?.state, pincode: o.address?.pincode, line1: o.address?.line1, country: o.address?.country },
    utr, utr_reused: !!utr && db.orders.some((x) => x.id !== o.id && x.payment?.customer_ref === utr),
    first_order: !paid.some((x) => x.id !== o.id && x.customer.phone === o.customer.phone), avg_order: avg,
    same_phone_24h: db.orders.filter((x) => x.customer.phone === o.customer.phone && near(x)).length, same_ip_24h: 0,
    unpaid_same_phone: db.orders.filter((x) => x.id !== o.id && x.customer.phone === o.customer.phone && ['awaiting_payment', 'rejected'].includes(x.payment_status)).length,
    international: (o.address?.country || 'IN') !== 'IN',
  });
}
on('GET', '/admin/ai/risk', (db) => {
  needAdmin(db);
  const items = db.orders.filter((o) => o.status !== 'cancelled').slice(0, 300).map((o) => ({ id: o.id, order_number: o.order_number, name: o.customer.name, phone: o.customer.phone, total: o.totals.total, payment_status: o.payment_status, created_at: o.created_at, ...mockRisk(db, o) })).sort((a, b) => b.score - a.score);
  return ok({ items, flagged: items.filter((x) => x.level !== 'low').length });
});
on('GET', '/admin/ai/risk/:n', (db, { n }) => { needAdmin(db); const o = db.orders.find((x) => x.order_number === n.toUpperCase()); return o ? ok(mockRisk(db, o)) : fail(404, 'Not found'); });
on('POST', '/admin/ai/write', (db, _p, b) => {
  needAdmin(db);
  if (!b?.name || String(b.name).trim().length < 2) return fail(400, 'Add the product name first', { fields: { name: 'Required' } });
  const c = b.category_id ? cat(db, Number(b.category_id)) : null;
  return ok(writeProduct({ ...b, name: String(b.name).trim(), specs: b.specs || {}, price: Math.round((+b.price || 0) * 100), mrp: Math.round((+b.mrp || 0) * 100), category_name: c?.name, segment: c?.segment }, { festival: db.settings.festival_name || 'Diwali', variant: +b.variant || 0 }));
});

// ---- dealer app & admin dealers (demo) ----
const pubDealer = (d) => d && { ...d, password: undefined, bank_account_enc: undefined, can_receive_orders: mCanReceive(d) };
const needDealer = (db) => { const d = db.dealerSession && mDealer(db, db.dealerSession); if (!d || !d.is_active) throw fail(401, 'Please sign in to the dealer app.'); return d; };
const dealerReady = (d) => { if (d.must_change_password) throw fail(403, 'Please set your own password first.', { code: 'MUST_CHANGE_PASSWORD' }); };
on('POST', '/dealer/login', (db, _p, b) => {
  const phone = String(b?.phone || '').replace(/\D/g, '').slice(-10);
  const d = db.dealers.find((x) => x.phone === phone);
  if (!d || d.password !== b.password) return fail(401, 'Wrong mobile number or password.');
  if (!d.is_active) return fail(401, 'This dealer account is switched off. Please contact the store.');
  d.last_login_at = nowIso(); db.dealerSession = d.id;
  return ok({ dealer: pubDealer(d) });
});
on('POST', '/dealer/logout', (db) => { db.dealerSession = null; return ok({ ok: true }); });
on('GET', '/dealer/me', (db, _p, _b, q) => { if (q.soft && !(db.dealerSession && mDealer(db, db.dealerSession))) return ok({ dealer: null, reasons: REJECT_REASONS }); return ok({ dealer: pubDealer(needDealer(db)), reasons: REJECT_REASONS }); });
on('PUT', '/dealer/me/password', (db, _p, b) => {
  const d = needDealer(db);
  if (b.current !== d.password) return fail(400, 'Current password is wrong.', { fields: { current: 'Wrong password' } });
  const weak = passwordProblem(b.next, { min: 8, name: d.name });
  if (weak) return fail(400, weak, { fields: { next: weak } });
  d.password = b.next; d.must_change_password = false; return ok({ ok: true });
});
const DTABS = { new: ['sent'], active: ['accepted', 'packed', 'ready', 'out_for_delivery'], done: ['delivered', 'cancelled'] };
const myLatest = (db, d) => { const m = new Map(); for (const r of db.dealerOrders) if (r.dealer_id === d.id) m.set(r.order_id, r); return [...m.values()]; };
on('GET', '/dealer/summary', (db) => {
  const d = needDealer(db); const rows = myLatest(db, d);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const c = {}; for (const r of rows) c[r.status] = (c[r.status] || 0) + 1;
  return ok({ new: c.sent || 0, active: DTABS.active.reduce((s, k) => s + (c[k] || 0), 0), delivered_today: rows.filter((r) => r.status === 'delivered' && Date.parse(r.delivered_at) >= today.getTime()).length, by_status: c, accept_minutes: db.dealerSettings.accept_minutes });
});
on('GET', '/dealer/orders', (db, _p, _b, q) => {
  const d = needDealer(db); dealerReady(d);
  const tab = DTABS[q.tab] ? q.tab : 'new';
  const rows = myLatest(db, d).filter((r) => DTABS[tab].includes(r.status))
    .sort((a, b) => (tab === 'done' ? String(b.delivered_at || b.updated_at).localeCompare(String(a.delivered_at || a.updated_at)) : String(a.sent_at).localeCompare(String(b.sent_at))));
  return ok({ tab, items: rows.map((r) => mDealerView(db, r, false)) });
});
on('GET', '/dealer/orders/:n', (db, { n }) => {
  const d = needDealer(db); dealerReady(d);
  const o = db.orders.find((x) => x.order_number === n.toUpperCase());
  const r = o && myLatest(db, d).find((x) => x.order_id === o.id);
  return r ? ok(mDealerView(db, r)) : fail(404, 'Order not found');
});
on('POST', '/dealer/orders/:n/:action', (db, { n, action }, b) => {
  const d = needDealer(db); dealerReady(d);
  if (action === 'track') {
    const o = db.orders.find((x) => x.order_number === n.toUpperCase());
    const r = o && myLatest(db, d).find((x) => x.order_id === o.id);
    if (!r) return fail(404, 'Order not found');
    return ok(mDealerView(db, mCourierUpdate(db, r, b || {}, `dealer:${d.id}`)));
  }
  if (!['accept', 'reject', 'pack', 'ready', 'dispatch', 'deliver'].includes(action)) return fail(404, 'Not found');
  if (action === 'reject' && String(b?.reason || '').trim().length < 2) return fail(400, 'Choose a reason');
  return ok(mDealerView(db, mDealerStep(db, d, n, action, b || {})));
});

// ---- dealer business dashboard (same calculation as the server: shared/dealerDashboard.js)
const ddMove = (db, d, r, oldQ, newQ) => { const delta = newQ - (oldQ || 0); if (delta) (db.dealerStockMoves ||= []).push({ dealer_id: d.id, product_name: r.name, delta, at: nowIso() }); };
const ddStock = (db, r) => { const p = r.product_id ? db.products.find((x) => x.id === r.product_id) : null; return p ? p.stock : r.quantity; };
function ddData(db, d, range) {
  const mineDp = db.dealerProducts.filter((r) => r.dealer_id === d.id);
  const priceBy = new Map(mineDp.filter((r) => r.product_id).map((r) => [r.product_id, r.approved_dealer_price || r.dealer_price]));
  const products = mineDp.map((r) => { const p = r.product_id ? db.products.find((x) => x.id === r.product_id) : null; return { id: r.id, product_id: r.product_id, name: r.name, status: r.status, live: !!p?.is_active, stock: ddStock(db, r), dealer_price: r.approved_dealer_price || r.dealer_price, reviewed_at: r.reviewed_at, updated_at: r.updated_at, note: r.admin_note }; });
  const live = myLatest(db, d).map((r) => { const o = db.orders.find((x) => x.id === r.order_id); return o && {
    order_number: o.order_number, status: r.status, sent_at: r.sent_at, accepted_at: r.accepted_at, out_at: r.out_at, delivered_at: r.delivered_at, city: o.address.city, pincode: o.address.pincode, cancelled: o.status === 'cancelled',
    lines: o.items.map((i) => { const u = i.unit_cost > 0 ? i.unit_cost : priceBy.get(i.product_id) || null; return { product_id: i.product_id, name: i.name, qty: i.qty, value: u ? u * i.qty : null }; }) }; }).filter(Boolean);
  const orders = [...live, ...(db.dealerArchive || []).filter((x) => x.dealer_id === d.id).map(({ dealer_id, ...x }) => x)];
  const moves = (db.dealerStockMoves || []).filter((m) => m.dealer_id === d.id);
  const notices = (db.legalNotices || []).filter((n) => n.audience === 'dealer' && (n.dealer_id === d.id || (!n.dealer_id && n.created_at >= (d.created_at || '')))).slice(0, 20)
    .map((n) => ({ at: n.created_at, kind: ['violation', 'doc_expiry'].includes(n.kind) ? 'urgent' : 'warn', icon: n.kind === 'violation' ? '⚠️' : n.kind === 'doc_expiry' ? '🪪' : '📜', text: n.body ? `${n.title} — ${n.body}` : n.title, link: n.link || '/dealer/legal' }));
  const out = buildDealerDashboard({ products, orders, moves, range, now: Date.now(), seenAt: d.notif_seen_at || null, acceptMinutes: db.dealerSettings.accept_minutes, notices });
  const liveNums = new Set(live.map((o) => o.order_number));
  for (const o of out.recent_orders) if (!liveNums.has(o.order_number)) o.archived = true; // demo history has no detail page
  return assertDealerSafe(out);
}
on('GET', '/dealer/dashboard', (db, _p, _b, q) => { const d = needDealer(db); dealerReady(d); return ok(ddData(db, d, q.range || '30d')); });
on('POST', '/dealer/notifications/seen', (db) => { const d = needDealer(db); dealerReady(d); d.notif_seen_at = nowIso(); return ok({ ok: true }); });
const ddProfile = (db, d) => ({ name: d.name, business_name: d.business_name, phone: d.phone, email: d.email || null, address: d.address, city: d.city, state: d.state, pincode: d.pincode, gstin: d.gstin || null,
  serves: d.all_india ? 'All India' : d.pincodes.slice(0, 20), serves_count: d.all_india ? null : d.pincodes.length, member_since: d.created_at, last_login_at: d.last_login_at,
  categories: d.category_ids.map((id) => cat(db, id)?.name).filter(Boolean) });
on('GET', '/dealer/profile', (db) => { const d = needDealer(db); dealerReady(d); return ok(ddProfile(db, d)); });
on('PUT', '/dealer/profile', (db, _p, b) => {
  const d = needDealer(db); dealerReady(d); const e = String(b?.email || '').trim();
  if (e && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return fail(400, 'Enter a valid email', { fields: { email: 'Enter a valid email' } });
  d.email = e; return ok(ddProfile(db, d));
});

function mDealerStats(db, id) {
  const since = Date.now() - 30 * 864e5; const rows = db.dealerOrders.filter((r) => r.dealer_id === id);
  const acc = rows.filter((r) => r.accepted_at && Date.parse(r.sent_at) >= since).map((r) => (Date.parse(r.accepted_at) - Date.parse(r.sent_at)) / 6e4);
  return { open: rows.filter((r) => isOpen(r.status)).length, waiting: rows.filter((r) => r.status === 'sent').length,
    delivered_30d: rows.filter((r) => r.status === 'delivered' && Date.parse(r.delivered_at) >= since).length,
    declined_30d: rows.filter((r) => ['rejected', 'reassigned'].includes(r.status) && Date.parse(r.sent_at) >= since).length,
    avg_accept_min: acc.length ? Math.round(acc.reduce((a, x) => a + x, 0) / acc.length) : null };
}
const mUnassigned = (db) => db.orders.filter((o) => o.payment_status === 'confirmed' && o.status === 'payment_confirmed' && !mCurrent(db, o.id));
on('GET', '/admin/dealers', (db) => { needAdmin(db); return ok({ dealers: mAllDealers(db).map((d) => ({ ...pubDealer(d), stats: mDealerStats(db, d.id) })), settings: db.dealerSettings, unassigned: mUnassigned(db).length }); });
function dealerFields(db, b, id) {
  const f = {};
  const phone = String(b.phone || '').replace(/\D/g, '').slice(-10);
  if (String(b.name || '').trim().length < 2) f.name = 'Required';
  if (String(b.business_name || '').trim().length < 2) f.business_name = 'Required';
  if (!/^[6-9]\d{9}$/.test(phone)) f.phone = 'Enter a valid 10-digit mobile number';
  else if (db.dealers.some((d) => d.phone === phone && d.id !== id)) f.phone = 'Already used';
  if (b.pincode && !/^\d{6}$/.test(b.pincode)) f.pincode = 'PIN code is 6 digits';
  if (!(b.category_ids || []).length && !(b.product_ids || []).length) f.category_ids = 'Required';
  if (Object.keys(f).length) throw fail(f.phone === 'Already used' ? 409 : 400, f.phone === 'Already used' ? 'A dealer with this mobile number already exists.' : Object.values(f)[0] === 'Required' && f.category_ids ? 'Choose at least one category or product this dealer sells.' : 'Please check the highlighted fields.', { fields: f });
  return { name: b.name.trim(), business_name: b.business_name.trim(), phone, email: b.email || '', address: b.address || '', city: b.city || '', state: b.state || '', pincode: b.pincode || '', gstin: b.gstin || '',
    pincodes: parsePins(b.pincodes), all_india: !!b.all_india, category_ids: [...new Set((b.category_ids || []).map(Number))], product_ids: [...new Set((b.product_ids || []).map(Number))], priority: Math.max(0, Math.min(10, Number(b.priority) || 0)), is_active: b.is_active !== false };
}
const demoTempPw = () => `UG-${Math.random().toString(36).slice(2, 8)}-${Math.floor(10 + Math.random() * 89)}`;
on('POST', '/admin/dealers', (db, _p, b) => {
  needAdmin(db); const f = dealerFields(db, b || {}, 0); const pw = demoTempPw();
  const d = { id: Math.max(0, ...db.dealers.map((x) => x.id)) + 1, ...f, password: pw, must_change_password: true, last_login_at: null, created_at: nowIso(), onboarding_status: 'draft', onboarding_deadline: new Date(Date.now() + 14 * 864e5).toISOString(), self_registered: false };
  db.dealers.push(d); audit(db, 'create', 'dealer', d.id);
  return ok({ dealer: pubDealer(d), temp_password: pw }, 201);
});
on('PUT', '/admin/dealers/:id', (db, { id }, b) => {
  needAdmin(db); const d = mDealer(db, +id); if (!d) return fail(404, 'Not found');
  Object.assign(d, dealerFields(db, b || {}, d.id)); audit(db, 'update', 'dealer', d.id);
  if (!d.is_active && db.dealerSession === d.id) db.dealerSession = null;
  return ok({ dealer: pubDealer(d) });
});
on('POST', '/admin/dealers/:id/password', (db, { id }) => {
  needAdmin(db); const d = mDealer(db, +id); if (!d) return fail(404, 'Not found');
  d.password = demoTempPw(); d.must_change_password = true; if (db.dealerSession === d.id) db.dealerSession = null;
  return ok({ temp_password: d.password });
});
on('PUT', '/admin/dealers-settings', (db, _p, b) => {
  needAdmin(db);
  db.dealerSettings = { auto_assign: !!b.auto_assign, auto_reassign: !!b.auto_reassign, accept_minutes: Math.min(1440, Math.max(10, Number(b.accept_minutes) || 120)) };
  return ok(db.dealerSettings);
});
on('GET', '/admin/dealer-orders', (db, _p, _b, q) => {
  needAdmin(db);
  const st = q.status || 'open';
  let rows = [...db.dealerOrders].reverse().filter((r) => (st === 'open' ? isOpen(r.status) : st === 'late' ? r.status === 'sent' : r.status === st));
  if (st === 'late') rows = rows.filter((r) => mLate(db, r));
  const items = rows.map((r) => { const o = db.orders.find((x) => x.id === r.order_id); return { id: r.id, order_id: o.id, order_number: o.order_number, customer: o.customer.name, city: o.address.city, pincode: o.address.pincode, total: o.totals.total,
    dealer: mDealer(db, r.dealer_id)?.business_name, dealer_id: r.dealer_id, status: r.status, label: DEALER_STATUS[r.status]?.label, sent_at: r.sent_at, updated_at: r.updated_at, late: mLate(db, r), reject_reason: r.reject_reason }; });
  return ok({ items, unassigned: mUnassigned(db).map((o) => ({ order_id: o.id, order_number: o.order_number, customer: o.customer.name, city: o.address.city, pincode: o.address.pincode, total: o.totals.total, created_at: o.created_at })), accept_minutes: db.dealerSettings.accept_minutes });
});
on('POST', '/admin/orders/:id/dealer', (db, { id }, b) => {
  needAdmin(db); const o = db.orders.find((x) => x.id === +id); if (!o) return fail(404, 'Not found');
  const row = mAssign(db, o, { dealerId: b?.dealer_id || null, by: 'admin:1' });
  if (!row) return fail(409, 'No dealer sells all these products and delivers to this PIN code. Add a dealer or pick one by hand.');
  return ok(detail(o, true));
});

// ---- delivery tracking dashboard (demo; mirrors server/src/routes/tracking.js) ----
const trkAvg = (xs) => { const v = xs.filter((x) => x != null); return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null; };
const istDayOf = (iso) => (iso ? new Date(Date.parse(iso) + 5.5 * 36e5).toISOString().slice(0, 10) : null);
function trkSince(range) {
  if (range === 'all') return null;
  if (range === 'today') { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); }
  return Date.now() - ({ '7d': 7, '30d': 30, '90d': 90 }[range] || 30) * 864e5;
}
function trkRow(db, r) {
  const o = db.orders.find((x) => x.id === r.order_id); const d = mDealer(db, r.dealer_id) || {};
  const tracking = r.tracking || []; const last = tracking.at(-1) || null;
  const delivered = r.status === 'delivered'; const today = istDayOf(nowIso());
  const lateEta = o.estimated_delivery ? (delivered ? istDayOf(r.delivered_at) > o.estimated_delivery : today > o.estimated_delivery && isOpen(r.status)) : false;
  const paid = o.events.find((e) => e.status === 'payment_confirmed')?.created_at || null;
  return { id: r.id, order_id: o.id, order_number: o.order_number, status: r.status, label: DEALER_STATUS[r.status]?.label, dealer_id: r.dealer_id, dealer: d.business_name, dealer_city: d.city,
    customer: o.customer.name, phone: o.customer.phone, city: o.address.city, pincode: o.address.pincode, total: o.totals.total,
    products: o.items.map((i) => `${i.name} × ${i.qty}`), units: o.items.reduce((s, i) => s + i.qty, 0),
    ordered_at: o.created_at, paid_at: paid, sent_at: r.sent_at, accepted_at: r.accepted_at, packed_at: r.packed_at, ready_at: r.ready_at, out_at: r.out_at, courier_out_at: r.courier_out_at || null, delivered_at: r.delivered_at, estimated_delivery: o.estimated_delivery,
    mode: r.delivery_mode, courier_name: r.courier_name, awb: r.awb, tracking_url: r.tracking_url, rider_name: r.rider_name, rider_phone: r.rider_phone, received_by: r.received_by || null,
    last_update: last ? { ...last, label: COURIER_UPDATES[last.status]?.label } : null, attempts: tracking.filter((x) => x.status === 'attempt_failed').length,
    late_accept: mLate(db, r), late_eta: lateEta, on_time: delivered ? !lateEta : null,
    times: { to_dealer: minutesBetween(paid || o.created_at, r.sent_at), accept: minutesBetween(r.sent_at, r.accepted_at), pack: minutesBetween(r.accepted_at, r.packed_at), ready: minutesBetween(r.packed_at, r.ready_at),
      handover: minutesBetween(r.ready_at, r.out_at), deliver: minutesBetween(r.out_at, r.delivered_at), total: minutesBetween(o.created_at, r.delivered_at) },
    updated_at: r.updated_at };
}
function trkLoad(db, q) {
  const from = trkSince(q.range || '30d'); const s = String(q.q || '').trim().toLowerCase();
  return db.dealerOrders.filter((r) => !['rejected', 'reassigned'].includes(r.status) && (!from || Date.parse(r.sent_at) >= from)
    && (!q.dealer || r.dealer_id === Number(q.dealer)) && (!q.mode || (q.mode === 'none' ? !r.delivery_mode : r.delivery_mode === q.mode)) && (!q.courier || r.courier_name === q.courier))
    .map((r) => trkRow(db, r))
    .filter((x) => !s || [x.order_number, x.awb, x.phone, x.customer, x.pincode].some((v) => String(v || '').toLowerCase().includes(s)))
    .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
}
on('GET', '/admin/tracking', (db, _p, _b, q) => {
  needAdmin(db);
  const all = trkLoad(db, q); const by = (st) => all.filter((x) => x.status === st); const delivered = by('delivered');
  const kpis = { total: all.length, in_pipeline: all.filter((x) => isOpen(x.status)).length, waiting_accept: by('sent').length, late_accept: all.filter((x) => x.late_accept).length,
    out_for_delivery: by('out_for_delivery').length, delivered: delivered.length, on_time_pct: delivered.length ? Math.round((100 * delivered.filter((x) => x.on_time).length) / delivered.length) : null,
    overdue: all.filter((x) => isOpen(x.status) && x.late_eta).length, avg_total_min: trkAvg(delivered.map((x) => x.times.total)), failed_attempts: all.reduce((s2, x) => s2 + x.attempts, 0), cancelled: by('cancelled').length };
  const pipeline = ['sent', 'accepted', 'packed', 'ready', 'out_for_delivery', 'delivered'].map((st) => ({ status: st, label: DEALER_STATUS[st].label, count: by(st).length }));
  const stage_times = [['to_dealer', 'Payment → sent to dealer'], ['accept', 'Sent → accepted'], ['pack', 'Accepted → packed'], ['ready', 'Packed → ready'], ['handover', 'Ready → out for delivery'], ['deliver', 'Out → delivered']]
    .map(([k, label]) => ({ key: k, label, avg_min: trkAvg(all.map((x) => x.times[k])) }));
  const group = (list, key) => { const m = new Map(); for (const x of list) { const k = key(x); if (k == null) continue; if (!m.has(k)) m.set(k, []); m.get(k).push(x); } return [...m]; };
  const perf = (xs) => { const d = xs.filter((x) => x.status === 'delivered'); return { shipments: xs.length, open: xs.filter((x) => isOpen(x.status)).length, delivered: d.length, in_transit: xs.filter((x) => x.status === 'out_for_delivery').length,
    on_time_pct: d.length ? Math.round((100 * d.filter((x) => x.on_time).length) / d.length) : null, avg_deliver_min: trkAvg(d.map((x) => x.times.deliver)), attempts: xs.reduce((s2, x) => s2 + x.attempts, 0), overdue: xs.filter((x) => isOpen(x.status) && x.late_eta).length }; };
  const couriers = group(all.filter((x) => x.mode), (x) => (x.mode === 'self' ? '🛵 Own delivery (dealers)' : x.courier_name)).map(([name, xs]) => ({ name, mode: xs[0].mode, ...perf(xs) })).sort((a, b) => b.shipments - a.shipments);
  const from = trkSince(q.range || '30d');
  const dealers = group(all, (x) => x.dealer_id).map(([id, xs]) => ({ id, name: xs[0].dealer, city: xs[0].dealer_city, ...perf(xs), avg_accept_min: trkAvg(xs.map((x) => x.times.accept)),
    avg_ready_min: trkAvg(xs.map((x) => minutesBetween(x.sent_at, x.ready_at))), waiting: xs.filter((x) => x.status === 'sent').length,
    declined: db.dealerOrders.filter((r) => r.dealer_id === id && ['rejected', 'reassigned'].includes(r.status) && (!from || Date.parse(r.sent_at) >= from)).length })).sort((a, b) => b.shipments - a.shipments);
  let items = all;
  if (q.status) items = items.filter((x) => (q.status === 'open' ? isOpen(x.status) : x.status === q.status));
  if (q.flag === 'late_accept') items = items.filter((x) => x.late_accept);
  if (q.flag === 'late_eta') items = items.filter((x) => isOpen(x.status) && x.late_eta);
  if (q.flag === 'attempts') items = items.filter((x) => x.attempts > 0);
  return ok({ range: q.range || '30d', kpis, pipeline, stage_times, couriers, dealers, items: items.slice(0, 300), total_items: items.length, accept_minutes: db.dealerSettings.accept_minutes,
    options: { dealers: db.dealers.map((d) => ({ id: d.id, name: d.business_name })), couriers: [...new Set(db.dealerOrders.map((r) => r.courier_name).filter(Boolean))].sort() } });
});
on('GET', '/admin/tracking/export.csv', (db, _p, _b, q) => {
  needAdmin(db);
  const cols = [['Order', 'order_number'], ['Status', 'label'], ['Dealer', 'dealer'], ['Customer', 'customer'], ['City', 'city'], ['PIN', 'pincode'], ['Products', (x) => x.products.join('; ')],
    ['Ordered', 'ordered_at'], ['Sent to dealer', 'sent_at'], ['Accepted', 'accepted_at'], ['Packed', 'packed_at'], ['Ready', 'ready_at'], ['Out for delivery', 'out_at'], ['Delivered', 'delivered_at'],
    ['Delivery by', (x) => (x.mode === 'self' ? 'Own delivery' : x.mode === 'courier' ? 'Courier' : '')], ['Courier', 'courier_name'], ['AWB', 'awb'], ['Delivery person', 'rider_name'], ['Received by', 'received_by'],
    ['Promised date', 'estimated_delivery'], ['On time', (x) => (x.on_time == null ? '' : x.on_time ? 'Yes' : 'No')], ['Hours to deliver', (x) => (x.times.total == null ? '' : (x.times.total / 60).toFixed(1))]];
  const cell = (v) => { let c = v == null ? '' : String(v); if (/^[=+\-@]/.test(c)) c = `'${c}`; return /[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c; };
  return ok(`﻿${[cols.map((c) => c[0]).join(','), ...trkLoad(db, q).map((x) => cols.map(([, k]) => cell(typeof k === 'function' ? k(x) : x[k])).join(','))].join('\n')}`);
});
on('GET', '/admin/tracking/:id', (db, { id }) => {
  needAdmin(db);
  const r = db.dealerOrders.find((x) => x.id === +id); if (!r) return fail(404, 'Not found');
  const o = db.orders.find((x) => x.id === r.order_id);
  return ok({ ...trkRow(db, r), items: o.items.map((i) => ({ name: i.name, qty: i.qty, line_total: i.line_total })), events: o.events.filter((e) => e.status !== 'conversion_reported'),
    history: db.dealerOrders.filter((x) => x.order_id === o.id).map((x) => ({ status: x.status, reject_reason: x.reject_reason, sent_at: x.sent_at, business_name: mDealer(db, x.dealer_id)?.business_name })),
    tracking: (r.tracking || []).map((x) => ({ ...x, label: COURIER_UPDATES[x.status]?.label })) });
});
on('POST', '/admin/tracking/:id/update', (db, { id }, b) => {
  needAdmin(db);
  const r = mCourierUpdate(db, db.dealerOrders.find((x) => x.id === +id), b || {}, 'admin:1');
  return ok({ ok: true, status: r.status });
});

// ---- dealer products (demo; mirrors server/src/routes/dealerProducts.js) ----
const DP_LABEL = { pending: 'Under review', changes_requested: 'Changes needed', approved: 'Approved', rejected: 'Not accepted' };
const DP_SPECS = ['Material', 'Dimensions', 'Weight', "What's included", 'Colour', 'Care', 'Country of origin'];
function dpDealerView(db, r) {
  const p = r.product_id ? db.products.find((x) => x.id === r.product_id) : null;
  const out = { id: r.id, status: r.status, status_label: DP_LABEL[r.status], name: r.name, category_id: r.category_id, category: cat(db, r.category_id)?.name,
    short_description: r.short_description || '', description: r.description || '', specs: r.specs || {}, dealer_price: r.dealer_price, approved_dealer_price: r.approved_dealer_price, quantity: r.quantity,
    images: r.images.map((u, i) => ({ name: String(i), url: u })), dealer_sku: r.dealer_sku || '', hsn: r.hsn || '', note_from_team: r.admin_note || null,
    live: !!p?.is_active, store_stock: p ? p.stock : null, reserved_stock: p ? mQtyIn(db, p.id, ['placed', 'payment_confirmed', 'processing']) : 0, sold_stock: p ? mQtyIn(db, p.id, ['delivered']) : 0, revision: r.revision, submitted_at: r.submitted_at, reviewed_at: r.reviewed_at, published_at: r.published_at, updated_at: r.updated_at };
  for (const k of INTERNAL_KEYS) delete out[k];
  return out;
}
function dpAdminView(db, r, full = false) {
  const d = mDealer(db, r.dealer_id) || {}; const p = r.product_id ? db.products.find((x) => x.id === r.product_id) : null;
  const out = { id: r.id, status: r.status, status_label: DP_LABEL[r.status], dealer: { id: d.id, business_name: d.business_name, name: d.name, phone: d.phone, city: d.city }, name: r.name, category_id: r.category_id, category: cat(db, r.category_id)?.name,
    dealer_price: r.dealer_price, approved_dealer_price: r.approved_dealer_price, quantity: r.quantity, revision: r.revision, image_count: r.images.length, thumb: r.images[0] || null,
    submitted_at: r.submitted_at, reviewed_at: r.reviewed_at, published_at: r.published_at,
    live: p ? { id: p.id, price: p.price, mrp: p.mrp, is_active: !!p.is_active, url: `/shop/${cat(db, p.category_id)?.slug}/${p.slug}`, stock: p.stock } : null,
    price_changed: !!(r.approved_dealer_price && r.approved_dealer_price !== r.dealer_price) };
  if (!full) return out;
  return { ...out, short_description: r.short_description, description: r.description, specs: r.specs || {}, dealer_sku: r.dealer_sku, hsn: r.hsn, images: r.images.map((u, i) => ({ name: String(i), url: u })),
    admin_note: r.admin_note, internal_note: r.internal_note, pricing: r.pricing, defaults: db.pricingDefaults,
    live_full: p ? { name: p.name, short_description: p.short_description, description: p.description, specs: p.specs, category_id: p.category_id, cost_price: p.cost_price } : null };
}
const dpMine = (db, d, id) => { const r = db.dealerProducts.find((x) => x.id === +id && x.dealer_id === d.id); if (!r) throw fail(404, 'Not found'); return r; };
async function dpRead(db, b) {
  const g = (k) => (b instanceof FormData ? b.get(k) : b?.[k]);
  const f = {}; const name = String(g('name') || '').trim(); const desc = String(g('description') || '').trim();
  const price = Number(g('dealer_price')); const qty = Number(g('quantity'));
  if (name.length < 3) f.name = 'Enter the product name';
  if (!cat(db, Number(g('category_id')))) f.category_id = 'Choose a category';
  if (desc.length < 20) f.description = 'Describe the product in at least 20 characters';
  if (!(price > 0)) f.dealer_price = 'Enter your price';
  if (!(qty >= 0) || String(g('quantity') ?? '') === '') f.quantity = 'Enter the quantity';
  const specsIn = JSON.parse(g('specs') || '{}'); const specs = {};
  for (const k of DP_SPECS) if (specsIn[k] && String(specsIn[k]).trim()) specs[k] = String(specsIn[k]).trim().slice(0, 300);
  const files = b instanceof FormData ? b.getAll('images').filter((x) => x && typeof x !== 'string') : [];
  const urls = [];
  for (const file of files.slice(0, 6)) urls.push(await fileToDataUrl(file));
  return { f, data: { name, category_id: Number(g('category_id')), short_description: String(g('short_description') || '').trim().slice(0, 200), description: desc, specs,
    dealer_price: Math.round(price * 100), quantity: Math.round(qty), dealer_sku: String(g('dealer_sku') || '').slice(0, 40), hsn: String(g('hsn') || '').slice(0, 8) }, urls, keep: JSON.parse(g('keep_images') || 'null') };
}
const dpEmail = (db, r, d, kind) => db.notifications.push({ id: ++db.seq.id, channel: 'email', recipient: db.reviewEmail || 'team', template: `dealer_product_${kind}`, status: 'skipped', error: 'Demo — would email your team', created_at: nowIso(),
  payload: { subject: `[Review] ${kind === 'new' ? 'New' : 'Updated'} dealer product: ${r.name} — ${d.business_name}` } });
on('GET', '/dealer/products', (db) => { const d = needDealer(db); dealerReady(d); return ok({ items: db.dealerProducts.filter((r) => r.dealer_id === d.id).sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at))).map((r) => dpDealerView(db, r)), spec_keys: DP_SPECS }); });
on('GET', '/dealer/products/:id', (db, { id }) => { const d = needDealer(db); dealerReady(d); return ok(dpDealerView(db, dpMine(db, d, id))); });
on('POST', '/dealer/products', async (db, _p, b) => {
  const d = needDealer(db); dealerReady(d);
  if (!mCanReceive(d)) return fail(403, 'Complete your KYC and sign the dealer agreement first. Our team will then approve your account.', { code: 'ONBOARDING_REQUIRED' });
  const { f, data, urls } = await dpRead(db, b);
  if (!urls.length) f.images = 'Add a photo';
  if (Object.keys(f).length) return fail(400, f.images && Object.keys(f).length === 1 ? 'Add at least one clear photo of the product.' : 'Please check the highlighted fields.', { fields: f });
  const t = nowIso();
  const r = { id: Math.max(0, ...db.dealerProducts.map((x) => x.id)) + 1, dealer_id: d.id, product_id: null, status: 'pending', ...data, images: urls, admin_note: null, internal_note: null, pricing: null, approved_dealer_price: null, revision: 1, submitted_at: t, reviewed_at: null, published_at: null, updated_at: t };
  db.dealerProducts.push(r); dpEmail(db, r, d, 'new'); ddMove(db, d, r, 0, r.quantity);
  return ok(dpDealerView(db, r), 201);
});
on('PUT', '/dealer/products/:id', async (db, { id }, b) => {
  const d = needDealer(db); dealerReady(d); const r = dpMine(db, d, id);
  const { f, data, urls, keep } = await dpRead(db, b);
  const kept = (keep || r.images.map((_, i) => String(i))).map(Number).map((i) => r.images[i]).filter(Boolean);
  const images = [...kept, ...urls].slice(0, 8);
  if (!images.length) f.images = 'Add a photo';
  if (Object.keys(f).length) return fail(400, 'Please check the highlighted fields.', { fields: f });
  const before = ddStock(db, r); ddMove(db, d, r, before, data.quantity);
  Object.assign(r, data, { images, status: 'pending', revision: r.revision + 1, submitted_at: nowIso(), updated_at: nowIso() });
  if (r.product_id) { const p = db.products.find((x) => x.id === r.product_id); if (p) p.stock = r.quantity; }
  dpEmail(db, r, d, 'update');
  return ok(dpDealerView(db, r));
});
on('PATCH', '/dealer/products/:id/stock', (db, { id }, b) => {
  const d = needDealer(db); dealerReady(d); const r = dpMine(db, d, id);
  const q = Math.max(0, Math.round(Number(b?.quantity) || 0)); ddMove(db, d, r, ddStock(db, r), q); r.quantity = q; r.updated_at = nowIso();
  if (r.product_id) { const p = db.products.find((x) => x.id === r.product_id); if (p) p.stock = q; }
  return ok(dpDealerView(db, r));
});
on('DELETE', '/dealer/products/:id', (db, { id }) => {
  const d = needDealer(db); dealerReady(d); const r = dpMine(db, d, id);
  if (r.product_id) return fail(409, 'This product is already on the store. Set its quantity to 0 to stop orders, or ask our team to remove it.');
  db.dealerProducts = db.dealerProducts.filter((x) => x !== r); return ok({ deleted: true });
});
on('GET', '/admin/dealer-products', (db, _p, _b, q) => {
  needAdmin(db);
  const rank = { pending: 0, changes_requested: 1 };
  const items = db.dealerProducts.filter((r) => !q.status || r.status === q.status).sort((a, b) => ((rank[a.status] ?? 2) - (rank[b.status] ?? 2)) || String(b.submitted_at).localeCompare(String(a.submitted_at)));
  const counts = {}; for (const r of db.dealerProducts) counts[r.status] = (counts[r.status] || 0) + 1;
  return ok({ items: items.map((r) => dpAdminView(db, r)), counts, defaults: db.pricingDefaults, review_email: db.reviewEmail });
});
on('GET', '/admin/dealer-products/:id', (db, { id }) => { needAdmin(db); const r = db.dealerProducts.find((x) => x.id === +id); return r ? ok(dpAdminView(db, r, true)) : fail(404, 'Not found'); });
const dpPaise = (p) => ({ ...p, shipping: Math.round(p.shipping * 100), packaging: Math.round(p.packaging * 100), other: Math.round(p.other * 100), profit_value: p.profit_mode === 'amount' ? Math.round(p.profit_value * 100) : Number(p.profit_value) });
on('PUT', '/admin/dealer-products-defaults', (db, _p, b) => {
  needAdmin(db);
  if (b.review_email && !/^\S+@\S+\.\S+$/.test(b.review_email)) return fail(400, 'Enter a valid email', { fields: { review_email: 'Enter a valid email' } });
  const { review_email: email, ...p } = b; db.pricingDefaults = { ...PRICING_DEFAULTS, ...dpPaise({ ...PRICING_DEFAULTS, ...p, shipping: +p.shipping || 0, packaging: +p.packaging || 0, other: +p.other || 0, profit_value: +p.profit_value || 0 }) };
  if (email !== undefined) db.reviewEmail = email;
  return ok({ defaults: db.pricingDefaults, review_email: db.reviewEmail });
});
on('POST', '/admin/dealer-products-calc', (db, _p, b) => { needAdmin(db); return ok(calcSellingPrice({ ...dpPaise(b), cost: Math.round(b.cost * 100) })); });
on('POST', '/admin/dealer-products/:id/publish', (db, { id }, b) => {
  needAdmin(db);
  const r = db.dealerProducts.find((x) => x.id === +id); if (!r) return fail(404, 'Not found');
  const price = Math.round(Number(b.price) * 100); const mrp = Math.max(price, b.mrp ? Math.round(Number(b.mrp) * 100) : price);
  if (!(price > 0)) return fail(400, 'Enter the customer price', { fields: { price: 'Required' } });
  if (String(b.name || '').trim().length < 2) return fail(400, 'Enter the product name', { fields: { name: 'Required' } });
  if (price < r.dealer_price && !b.allow_below_cost) return fail(400, `The selling price is below the dealer price (₹${r.dealer_price / 100}). Tick "sell below cost" if you really mean it.`, { fields: { price: 'Below dealer cost' } });
  const calc = calcSellingPrice({ ...dpPaise(b.pricing || {}), cost: r.dealer_price });
  let p = r.product_id ? db.products.find((x) => x.id === r.product_id) : null;
  const base = String(b.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 70);
  if (!p) {
    let slug = base; let i = 2; while (db.products.some((x) => x.slug === slug)) slug = `${base}-${i++}`;
    p = { id: ++db.seq.id, slug, rating: 0, rating_count: 0, art: { type: 'giftbox', tone: 'gold' }, is_featured: false, is_bestseller: false, sort_order: 500, low_stock_threshold: 5, created_at: nowIso(), ships_international: true, is_bundle: false, bundle_items: [], images: [] };
    db.products.push(p);
  }
  Object.assign(p, { name: String(b.name).trim(), category_id: Number(b.category_id), short_description: b.short_description || '', description: b.description || '', specs: b.specs || {}, price, mrp, cost_price: r.dealer_price,
    is_active: b.is_active !== false, is_new: !!b.is_new, is_diwali: !!b.is_diwali, stock: r.quantity });
  for (const u of r.images) if (!p.images.some((im) => im.url === u)) p.images.push({ id: ++db.seq.id, url: u, alt: p.name });
  Object.assign(r, { status: 'approved', product_id: p.id, approved_dealer_price: r.dealer_price, admin_note: b.note_to_dealer || null, internal_note: b.internal_note || null,
    pricing: { ...calc, final_price: price, mrp, overridden: price !== calc.selling }, reviewed_at: nowIso(), published_at: r.published_at || (p.is_active ? nowIso() : null), updated_at: nowIso() });
  const dl = mDealer(db, r.dealer_id); if (dl && !dl.product_ids.includes(p.id)) dl.product_ids.push(p.id);
  REC.at = 0; audit(db, 'publish', 'dealer_product', r.id);
  return ok(dpAdminView(db, r, true));
});
on('POST', '/admin/dealer-products/:id/:decision', (db, { id, decision }, b) => {
  needAdmin(db);
  if (!['request-changes', 'reject'].includes(decision)) return fail(404, 'Not found');
  const r = db.dealerProducts.find((x) => x.id === +id); if (!r) return fail(404, 'Not found');
  if (String(b?.note || '').trim().length < 5) return fail(400, 'Tell the dealer what to change (5+ characters)', { fields: { note: 'Required' } });
  Object.assign(r, { status: decision === 'reject' ? 'rejected' : 'changes_requested', admin_note: String(b.note).trim(), reviewed_at: nowIso(), updated_at: nowIso() });
  return ok(dpAdminView(db, r, true));
});

// ---- delivery by PIN (demo; mirrors server/src/lib/shipping.js) ----
function shipSettings(db) {
  const india = (db.zones || []).find((z) => (z.countries || []).includes('IN'));
  const national = india ? { fee: india.fee, free_above: india.free_above } : DEFAULT_ZONE_FEES.national;
  const c = { ...PRICING_DEFAULTS, ...(db.pricingDefaults || {}) };
  return { zone_delivery: db.settings.zone_delivery !== false, pickup_pincode: db.settings.pickup_pincode ?? '411002',
    zone_fees: db.settings.zone_fees || { ...DEFAULT_ZONE_FEES, national }, rate_card: { ...DEFAULT_RATE_CARD, ...(db.settings.shipping_rate_card || {}) },
    costs: { packaging: c.packaging, other: c.other, platform_pct: c.platform_pct, gst_pct: c.gst_pct }, live: false };
}
function shipParcel(p) {
  const weight_g = p.ship_weight_g || parseWeight(p.specs?.Weight) || null;
  const dims = (p.ship_dims && parseDims(p.ship_dims)) || parseDims(p.specs?.Dimensions) || null;
  return { weight_g, dims, kg: chargeableKg({ weight_g, dims }), guessed: !p.ship_weight_g && !p.specs?.Weight };
}
function shipOrigin(db, items, pin) {
  const rows = (items || []).map((i) => prod(db, Number(i.productId ?? i.product_id))).filter(Boolean).map((p) => ({ product_id: p.id, category_id: p.category_id }));
  const d = db.dealers && rows.length && validPin(pin) ? pickDealer({ dealers: mAllDealers(db).map((d) => ({ ...d, is_active: d.is_active && d.can_receive_orders })), items: rows, pincode: pin }).dealer : null;
  if (d?.pincode && validPin(d.pincode)) return { pin: d.pincode, label: d.business_name };
  const ss = shipSettings(db); return { pin: ss.pickup_pincode, label: 'Your pickup address' };
}
function productOriginPin(db, p) {
  const d = (db.dealers || []).find((x) => x.is_active && (x.product_ids.includes(p.id) || x.category_ids.includes(p.category_id)));
  return d ? { pin: d.pincode, label: d.business_name } : { pin: shipSettings(db).pickup_pincode, label: 'Your pickup address' };
}
function shipRecord(db, o) {
  const grams = o.items.reduce((g, i) => g + (shipParcel(prod(db, i.product_id) || {}).weight_g || 500) * i.qty, 0);
  const single = o.items.length === 1 && o.items[0].qty === 1 ? shipParcel(prod(db, o.items[0].product_id) || {}).dims : null;
  const kg = chargeableKg({ weight_g: grams, dims: single });
  const origin = shipOrigin(db, o.items, o.address.pincode); const zone = pinZone(origin.pin, o.address.pincode);
  Object.assign(o, { ship_zone: zone, ship_origin_pin: origin.pin, ship_kg: kg, ship_cost_est: rateCardCost(shipSettings(db).rate_card, zone, kg), ship_cost_source: 'rate_card', ship_cost_actual: o.ship_cost_actual ?? null });
}
function orderEcon(db, o) {
  if ((o.address?.country || 'IN') !== 'IN') return { international: true };
  if (!o.ship_zone) shipRecord(db, o);
  const ss = shipSettings(db); const units = o.items.reduce((a, i) => a + i.qty, 0);
  const cost = o.items.reduce((a, i) => a + (i.unit_cost || 0) * i.qty, 0);
  const e = unitEconomics({ price: o.totals.subtotal - o.totals.discount, cost, packaging: ss.costs.packaging, other: ss.costs.other * units, platform_pct: ss.costs.platform_pct, gst_pct: ss.costs.gst_pct, courier: o.ship_cost_actual ?? o.ship_cost_est ?? 0, delivery_charged: o.totals.delivery });
  return { ...e, zone: o.ship_zone, zone_label: SHIP_ZONES[o.ship_zone]?.label, origin_pin: o.ship_origin_pin, kg: o.ship_kg, courier_est: o.ship_cost_est, courier_actual: o.ship_cost_actual, courier_source: o.ship_cost_actual != null ? 'actual' : 'rate_card', international: false };
}
function zoneRowsDemo(ss, { price, cost, kg, costs, overrides = {} }) {
  return SHIP_ZONE_KEYS.map((zone) => { const charged = customerFee(ss.zone_fees, zone, price); const courier = overrides[zone] != null ? overrides[zone] : rateCardCost(ss.rate_card, zone, kg);
    return { zone, label: SHIP_ZONES[zone].label, source: overrides[zone] != null ? 'manual' : 'rate_card', ...unitEconomics({ price, cost, ...costs, courier, delivery_charged: charged }) }; });
}
function pricingRowsDemo(db) {
  const ss = shipSettings(db);
  return db.products.filter((p) => !p.is_bundle).map((p) => {
    const parcel = shipParcel(p); const rows = zoneRowsDemo(ss, { price: p.price, cost: p.cost_price || 0, kg: parcel.kg, costs: ss.costs });
    const prof = rows.map((r) => r.profit);
    return { id: p.id, name: p.name, category: cat(db, p.category_id)?.name, is_active: !!p.is_active, price: p.price, cost: p.cost_price || 0, mrp: p.mrp, weight_g: parcel.weight_g, dims: parcel.dims, kg: parcel.kg, parcel_guessed: parcel.guessed,
      origin: productOriginPin(db, p), zones: Object.fromEntries(rows.map((r) => [r.zone, { profit: r.profit, margin_pct: r.margin_pct, courier: r.courier, charged: r.delivery_charged }])),
      min_profit: Math.min(...prof), max_profit: Math.max(...prof), loss_zones: rows.filter((r) => r.profit < 0).map((r) => r.zone), no_cost: !p.cost_price };
  });
}
on('GET', '/admin/pricing/settings', (db) => { needAdmin(db); return ok({ ...shipSettings(db), zones: SHIP_ZONES }); });
on('PUT', '/admin/pricing/settings', (db, _p, b) => {
  needAdmin(db);
  if (b.pickup_pincode && !validPin(b.pickup_pincode)) return fail(400, 'Enter a 6-digit PIN code', { fields: { pickup_pincode: 'Enter a 6-digit PIN code' } });
  const toP = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([a, x]) => [a, Math.round(Number(x) * 100)])) : Number(v)]));
  Object.assign(db.settings, { zone_delivery: !!b.zone_delivery, pickup_pincode: b.pickup_pincode || '', zone_fees: toP(b.zone_fees), shipping_rate_card: toP(b.rate_card) });
  REC.at = 0; return ok({ ...shipSettings(db), zones: SHIP_ZONES });
});
on('GET', '/admin/pricing/products', (db) => {
  needAdmin(db); const items = pricingRowsDemo(db);
  return ok({ items, settings: shipSettings(db), zones: SHIP_ZONES, summary: { products: items.length, with_loss: items.filter((x) => x.loss_zones.length).length, no_cost: items.filter((x) => x.no_cost).length, guessed: items.filter((x) => x.parcel_guessed).length } });
});
on('GET', '/admin/pricing/export.csv', (db) => {
  needAdmin(db); const items = pricingRowsDemo(db); const r2 = (p) => (p / 100).toFixed(2);
  const head = ['Product', 'Category', 'Price', 'Cost', 'Chargeable kg', ...SHIP_ZONE_KEYS.flatMap((z) => [`${SHIP_ZONES[z].label} delivery charged`, `${SHIP_ZONES[z].label} courier`, `${SHIP_ZONES[z].label} profit`])];
  const cell = (v) => { const c = v == null ? '' : String(v); return /[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c; };
  return ok(`﻿${[head.join(','), ...items.map((x) => [x.name, x.category, r2(x.price), r2(x.cost), x.kg, ...SHIP_ZONE_KEYS.flatMap((k) => [r2(x.zones[k].charged), r2(x.zones[k].courier), r2(x.zones[k].profit)])].map(cell).join(','))].join('\n')}`);
});
on('POST', '/admin/pricing/calc', (db, _p, b) => {
  needAdmin(db); const ss = shipSettings(db); const P = (v) => Math.round(Number(v) * 100); const has = (v) => v !== undefined && v !== null && v !== '';
  const p = b.product_id ? prod(db, Number(b.product_id)) : null;
  const parcel0 = p ? shipParcel(p) : { weight_g: null, dims: null }; const qty = Math.max(1, Number(b.qty) || 1);
  const weight_g = (has(b.weight_g) ? Number(b.weight_g) : parcel0.weight_g || 500) * qty;
  const dims = b.dims ? parseDims(b.dims) : parcel0.dims; const kg = chargeableKg({ weight_g, dims: qty === 1 ? dims : null });
  const price = (has(b.price) ? P(b.price) : p?.price || 0) * qty; const cost = (has(b.cost) ? P(b.cost) : p?.cost_price || 0) * qty;
  const costs = { packaging: has(b.packaging) ? P(b.packaging) : ss.costs.packaging, other: has(b.other) ? P(b.other) : ss.costs.other, platform_pct: has(b.platform_pct) ? Number(b.platform_pct) : ss.costs.platform_pct, gst_pct: has(b.gst_pct) ? Number(b.gst_pct) : ss.costs.gst_pct };
  const origin = b.origin_pin || (p ? productOriginPin(db, p).pin : ss.pickup_pincode);
  const overrides = Object.fromEntries(Object.entries(b.courier_overrides || {}).map(([k, v]) => [k, P(v)]));
  const zones = zoneRowsDemo(ss, { price, cost, kg, costs, overrides });
  const pins = (b.pins || []).filter(validPin).slice(0, 10).map((pin) => { const zone = pinZone(origin, pin); const manual = overrides[`pin:${pin}`];
    const courier = manual ?? rateCardCost(ss.rate_card, zone, kg);
    return { pin, zone, label: SHIP_ZONES[zone].label, source: manual != null ? 'manual' : 'rate_card', courier_name: null, etd: null, ...unitEconomics({ price, cost, ...costs, courier, delivery_charged: customerFee(ss.zone_fees, zone, price) }) }; });
  const target = has(b.target_profit) ? P(b.target_profit) : null;
  const suggestions = target == null ? null : Object.fromEntries(SHIP_ZONE_KEYS.map((zone) => [zone, priceForTarget({ target, cost, ...costs, courier: overrides[zone] ?? rateCardCost(ss.rate_card, zone, kg), fees: ss.zone_fees, zone })]));
  return ok({ product: p ? { id: p.id, name: p.name, price: p.price, cost: p.cost_price, mrp: p.mrp } : null, inputs: { price, cost, weight_g, dims, kg, qty, origin, ...costs }, zones, pins, suggestions, live: false, settings: { zone_fees: ss.zone_fees, rate_card: ss.rate_card } });
});
on('PUT', '/admin/pricing/products/:id/parcel', (db, { id }, b) => { needAdmin(db); const p = prod(db, +id); if (!p) return fail(404, 'Not found'); p.ship_weight_g = b.weight_g || null; p.ship_dims = b.dims || null; return ok({ ok: true }); });
on('PUT', '/admin/pricing/orders/:id/courier-cost', (db, { id }, b) => { needAdmin(db); const o = db.orders.find((x) => x.id === +id); if (!o) return fail(404, 'Not found'); o.ship_cost_actual = b.amount == null || b.amount === '' ? null : Math.round(Number(b.amount) * 100); return ok(orderEcon(db, o)); });

// ---- legal: customer terms, dealer onboarding/KYC/e-signature, versions & audit (mirrors server/src/routes/legal.js) ----
const LG_LOCKED = ['under_review', 'agreement_signed', 'approved', 'rejected', 'suspended', 'terminated'];
const lgCompany = (db) => ({ ...COMPANY_DEFAULTS, ...Object.fromEntries(Object.entries(db.legalCompany || {}).filter(([, v]) => v)) });
const lgCurrent = (db, kind) => [...(db.legalDocs || [])].filter((d) => d.kind === kind && d.status === 'published' && (!d.effective_at || d.effective_at <= nowIso())).sort((a, b) => String(b.published_at).localeCompare(String(a.published_at)) || b.id - a.id)[0] || null;
const lgPublic = (db, d, vars) => d && ({ id: d.id, kind: d.kind, version: d.version, title: d.title, body: fillTemplate(d.body, vars || lgCompany(db)), effective_at: d.effective_at, published_at: d.published_at, material: !!d.material, change_note: d.change_note });
const lgHash = (s) => { let h1 = 0x811c9dc5, h2 = 0; for (let i = 0; i < s.length; i++) { h1 = Math.imul(h1 ^ s.charCodeAt(i), 16777619) >>> 0; h2 = (h2 * 31 + s.charCodeAt(i)) >>> 0; } return (h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0')).repeat(4); };
function lgPending(db, type, id, kinds) {
  const out = [];
  for (const kind of kinds) {
    const cur = lgCurrent(db, kind); if (!cur) continue;
    const acc = [...db.legalAcc].reverse().find((a) => a.subject_type === type && a.subject_id === id && a.kind === kind);
    if (!acc) { out.push(cur); continue; }
    if (acc.document_id === cur.id) continue;
    const accDoc = db.legalDocs.find((d) => d.id === acc.document_id);
    if (db.legalDocs.some((d) => d.kind === kind && d.status !== 'draft' && d.material && d.published_at > (accDoc?.published_at || ''))) out.push(cur);
  }
  return out;
}
const lgAudit = (db, a) => { (db.legalAudit ||= []).unshift({ id: (db.legalAudit[0]?.id || 0) + 1, at: nowIso(), ip: 'this device (preview)', user_agent: navigator.userAgent.slice(0, 120), detail: {}, ...a }); db.legalAudit.length = Math.min(db.legalAudit.length, 500); };
const lgRef = (db, p) => `${refNo(p, (db.legalAcc.length || 0) + 1)}-${Math.random().toString(16).slice(2, 6).toUpperCase()}`;
function lgAccept(db, type, subj, kinds, extra = {}, varsFn) {
  const refs = [];
  for (const kind of kinds) {
    const d = lgCurrent(db, kind); if (!d) continue;
    const body = fillTemplate(d.body, varsFn ? varsFn() : lgCompany(db));
    const a = { id: (db.legalAcc.at(-1)?.id || 0) + 1, ref_no: lgRef(db, type === 'dealer' ? 'UGD' : 'UGC'), subject_type: type, subject_id: subj.id, kind, document_id: d.id, version: d.version, hash: lgHash(body), filled_body: body,
      name: extra.typed_name || subj.name, email: subj.email, phone: subj.phone, consents: extra.consents || {}, signature: extra.signature || null, signature_png: extra.signature_png || null,
      ip: 'this device (preview)', user_agent: navigator.userAgent.slice(0, 200), accepted_at: nowIso(),
      verification: extra.verification || (type === 'dealer' ? 'Mobile OTP verified · typed full name · drawn signature' : 'Accepted by ticking the required boxes while signed in to the account') };
    db.legalAcc.push(a); refs.push(a.ref_no);
  }
  return refs;
}
const lgView = (db, a) => ({ id: a.id, ref_no: a.ref_no, kind: a.kind, title: DOC_KINDS[a.kind]?.label, version: a.version, accepted_at: a.accepted_at, hash: a.hash, consents: a.consents,
  signature: a.signature ? { typed_name: a.signature.typed_name, capacity: a.signature.capacity, otp_ref: a.signature.otp_ref } : null, has_pdf: true, current: lgCurrent(db, a.kind)?.id === a.document_id, verification: a.verification || null });
const lgRep = (v) => [['Authorised signatory', v.authorised_signatory], ['Designation', v.signatory_designation], ['Company', `${v.company_legal_name}, ${v.company_address}`], ['Legal contact', v.legal_email]];
async function lgPdf(db, a) {
  const PDFLib = await import('pdf-lib'); const v = lgCompany(db); const s = a.signature || {};
  const png = a.signature_png ? Uint8Array.from(atob(a.signature_png.split(',')[1]), (c) => c.charCodeAt(0)) : null;
  const who = a.subject_type === 'dealer' ? 'Dealer' : 'Customer'; const label = DOC_KINDS[a.kind]?.label || a.kind;
  const checks = (a.subject_type === 'dealer' ? DEALER_CHECKS : CUSTOMER_CONSENTS).filter((x) => a.consents?.[x.key]).map((x) => x.label);
  const bytes = await buildAgreementPdf(PDFLib, {
    title: label, heading: label.toUpperCase(), company: v.company_name, company_legal: v.company_legal_name, ref_no: a.ref_no, version: a.version, effective: a.accepted_at.slice(0, 10),
    parties: [['Company', `${v.company_legal_name}, ${v.company_address}`], [`${who} name`, a.name], [`${who} ID`, `${a.subject_type === 'dealer' ? 'D' : 'C'}-${a.subject_id}`], ['Email', a.email], ['Mobile number', a.phone], ['Agreement number', a.ref_no]],
    body: a.filled_body, statement: `${a.name} accepted ${label} version ${a.version} electronically on ${new Date(a.accepted_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} (IST), confirming:`, checks,
    signature: { typed_name: s.typed_name || a.name, capacity: s.capacity, signed_at: a.accepted_at, ip: a.ip, user_agent: a.user_agent, otp_ref: s.otp_ref, verification: a.verification, image_png: png },
    company_rep: a.subject_type === 'dealer' ? lgRep(v) : null, hash: a.hash,
  });
  return ok({ __file: { bytes, type: 'application/pdf' } });
}
async function lgBlankPdf(db, docs, { who = [], ref = 'COPY', heading } = {}) {
  const PDFLib = await import('pdf-lib'); const v = lgCompany(db);
  const bytes = await buildAgreementPdf(PDFLib, { title: docs.map((x) => x.title).join(' + '), heading: heading || docs[0].title.toUpperCase(), company: v.company_name, company_legal: v.company_legal_name, ref_no: ref,
    version: docs.map((x) => x.version).join(' / '), effective: String(docs[0].effective_at || nowIso()).slice(0, 10), parties: [['Company', `${v.company_legal_name}, ${v.company_address}`], ...who],
    body: docs.map((x) => ({ title: x.title, body: x.body })), unsigned: true, signature: {}, hash: lgHash(docs.map((x) => x.body).join('\n')), footer: 'Copy of the current version. Generated automatically from the published document.' });
  return ok({ __file: { bytes, type: 'application/pdf' } });
}
const lgDealerVars = (db, d, sig = {}) => ({ ...lgCompany(db), effective_date: new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }),
  dealer_legal_name: d.legal_name || d.business_name, dealer_business_type: BUSINESS_TYPES[d.business_type] || 'Business', dealer_pan: d.pan || '-', dealer_gstin: d.gstin || 'Not registered',
  dealer_address: [d.registered_address || d.address, d.city, d.state, d.pincode].filter(Boolean).join(', '), signatory_name: sig.typed_name || d.name, signatory_capacity: sig.capacity || 'Authorised signatory',
  commercial_schedule: commercialSchedule({ ...DEFAULT_COMMERCIAL, ...(d.commercial || {}) }) });
const lgDocs = (db, id) => (db.dealerDocs || []).filter((x) => x.dealer_id === id);
const lgSigned = (db, id) => !lgPending(db, 'dealer', id, DEALER_KINDS).length && db.legalAcc.some((a) => a.subject_type === 'dealer' && a.subject_id === id && a.kind === 'dealer_agreement');
const mCanReceive = (d) => !!d && !!d.is_active && (d.onboarding_status === 'approved' || (!['rejected', 'suspended', 'terminated'].includes(d.onboarding_status) && !!d.onboarding_deadline && Date.parse(d.onboarding_deadline) > Date.now()));
function lgOnboardingView(db, d) {
  const docs = lgDocs(db, d.id); const signed = lgSigned(db, d.id); const prog = onboardingProgress({ dealer: d, docs, signed }); const latest = latestDocs(docs); const c = { ...DEFAULT_COMMERCIAL, ...(d.commercial || {}) };
  return {
    status: d.onboarding_status, status_label: ONBOARDING_STATUS[d.onboarding_status]?.label, status_reason: d.status_reason || null, deadline: d.onboarding_deadline || null, can_receive_orders: mCanReceive(d), self_registered: !!d.self_registered,
    editable: !LG_LOCKED.includes(d.onboarding_status) || d.onboarding_status === 'documents_rejected',
    business: { business_name: d.business_name, legal_name: d.legal_name || '', business_type: d.business_type || '', name: d.name, phone: d.phone, email: d.email || '', registered_address: d.registered_address || '', address: d.address || '', city: d.city || '', state: d.state || '', pincode: d.pincode || '', country: d.country || 'India', website: d.website || '' },
    kyc: { pan: d.pan || '', gstin: d.gstin || '', cin: d.cin || '', tan: d.tan || '', registration_no: d.registration_no || '', udyam: d.udyam || '', trade_license: d.trade_license || '', bank_name: d.bank_name || '', bank_holder: d.bank_holder || '', bank_account_masked: maskAccount(d.bank_last4), ifsc: d.ifsc || '', bank_branch: d.bank_branch || '' },
    documents: docs.map((x) => ({ id: x.id, doc_type: x.doc_type, label: DOC_TYPES[x.doc_type]?.label, doc_number: x.doc_number, original_name: x.original_name, mime: x.mime, size: x.size, uploaded_at: x.uploaded_at, status: x.status, reject_reason: x.reject_reason, expiry_date: x.expiry_date, latest: latest[x.doc_type]?.id === x.id })),
    required: requiredDocs(d), optional: optionalDocs(d), progress: prog, steps: ONBOARDING_STEPS, signed,
    pending_versions: lgPending(db, 'dealer', d.id, DEALER_KINDS).map((x) => ({ kind: x.kind, title: x.title, version: x.version })),
    commercial: { model: c.model, model_label: COMMERCIAL_MODELS[c.model]?.label }, doc_types: DOC_TYPES, business_types: BUSINESS_TYPES, checks: DEALER_CHECKS,
  };
}
const needDealerAny = (db) => { const d = db.dealerSession && mDealer(db, db.dealerSession); if (!d || !d.is_active) throw fail(401, 'Please sign in to the dealer app.'); return d; };
const lgFields = (f) => fail(400, 'Please check the highlighted fields.', { fields: f });

// customer
on('GET', '/legal/customer', (db) => ok({ consents: CUSTOMER_CONSENTS, docs: CUSTOMER_KINDS.map((k) => lgPublic(db, lgCurrent(db, k))).filter(Boolean) }));
on('GET', '/legal/doc/:kind', (db, { kind }) => (CUSTOMER_KINDS.includes(kind) ? ok(lgPublic(db, lgCurrent(db, kind))) : fail(404, 'Not found')));
on('GET', '/legal/customer/pdf', async (db) => { const docs = CUSTOMER_KINDS.map((k) => lgPublic(db, lgCurrent(db, k))).filter(Boolean); return lgBlankPdf(db, docs, { heading: 'CUSTOMER AGREEMENT', ref: `UGC-COPY-${docs.map((d) => d.version).join('-')}` }); });
on('GET', '/legal/doc/:kind/pdf', async (db, { kind }) => { if (!CUSTOMER_KINDS.includes(kind)) return fail(404, 'Not found'); const d = lgPublic(db, lgCurrent(db, kind)); return lgBlankPdf(db, [d], { ref: `${kind.toUpperCase()}-v${d.version}` }); });
on('GET', '/account/legal', (db) => { const u = needUser(db); return ok({ items: db.legalAcc.filter((a) => a.subject_type === 'customer' && a.subject_id === u.id).reverse().map((a) => lgView(db, a)), pending: lgPending(db, 'customer', u.id, CUSTOMER_KINDS).map((d) => lgPublic(db, d)), consents: CUSTOMER_CONSENTS }); });
on('GET', '/account/legal/:id', (db, { id }) => { const u = needUser(db); const a = db.legalAcc.find((x) => x.id === +id && x.subject_type === 'customer' && x.subject_id === u.id); return a ? ok({ ...lgView(db, a), body: a.filled_body }) : fail(404, 'Not found'); });
on('GET', '/account/legal/:id/pdf', async (db, { id }) => { const u = needUser(db); const a = db.legalAcc.find((x) => x.id === +id && x.subject_type === 'customer' && x.subject_id === u.id); return a ? lgPdf(db, a) : fail(404, 'Not found'); });
on('POST', '/account/legal/accept', (db, _p, b) => {
  const u = needUser(db); const pending = lgPending(db, 'customer', u.id, CUSTOMER_KINDS);
  if (!pending.length) return ok({ ok: true, accepted: [] });
  const need = CUSTOMER_CONSENTS.filter((c) => c.kinds.some((k) => pending.some((d) => d.kind === k)));
  const missing = need.filter((c) => b?.consents?.[c.key] !== true);
  if (missing.length) return fail(400, 'Please tick every box to continue.', { fields: Object.fromEntries(missing.map((c) => [`consents.${c.key}`, 'Required'])) });
  const refs = lgAccept(db, 'customer', u, pending.map((d) => d.kind), { consents: Object.fromEntries(need.map((c) => [c.key, true])) });
  lgAudit(db, { actor_type: 'customer', actor_id: u.id, subject_type: 'customer', subject_id: u.id, action: 'customer_reaccepted', detail: { refs } });
  return ok({ ok: true, accepted: refs });
});
on('PUT', '/admin/settings/checkout', (db, _p, b) => { needAdmin(db); db.settings.guest_checkout = !!b.guest_checkout; return ok({ guest_checkout: db.settings.guest_checkout }); });

// dealer self-registration & onboarding
on('POST', '/dealer/register', (db, _p, b) => {
  const f = {}; const phone = String(b?.phone || '').replace(/\D/g, '').slice(-10);
  if (String(b?.business_name || '').trim().length < 2) f.business_name = 'Enter your business name';
  if (String(b?.name || '').trim().length < 2) f.name = 'Enter the contact person';
  if (!/^[6-9]\d{9}$/.test(phone)) f.phone = 'Enter a valid 10-digit mobile number';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(b?.email || '')) f.email = 'Enter a valid email';
  const weak = passwordProblem(b?.password, { min: 8, email: b?.email, name: b?.name }); if (weak) f.password = weak;
  if (b?.password !== b?.confirm_password) f.confirm_password = 'Passwords do not match';
  if (Object.keys(f).length) return lgFields(f);
  if (db.dealers.some((d) => d.phone === phone)) return fail(409, 'This mobile number is already registered. Please sign in.', { fields: { phone: 'Already registered' } });
  const d = { id: Math.max(...db.dealers.map((x) => x.id)) + 1, name: b.name.trim(), business_name: b.business_name.trim(), phone, email: b.email.trim(), password: b.password, address: '', city: '', state: '', pincode: '', gstin: '',
    pincodes: [], all_india: false, category_ids: [], product_ids: [], priority: 0, is_active: true, must_change_password: false, last_login_at: nowIso(), created_at: nowIso(), onboarding_status: 'draft', onboarding_deadline: null, self_registered: true };
  db.dealers.push(d); db.dealerSession = d.id;
  lgAudit(db, { actor_type: 'dealer', actor_id: d.id, subject_type: 'dealer', subject_id: d.id, action: 'dealer_registered', detail: { business_name: d.business_name } });
  return ok({ dealer: { ...pubDealer(d), can_receive_orders: mCanReceive(d) } }, 201);
});
on('GET', '/dealer/onboarding', (db) => ok(lgOnboardingView(db, needDealerAny(db))));
const lgCanEdit = (d) => { if (LG_LOCKED.includes(d.onboarding_status) && d.onboarding_status !== 'approved') throw fail(409, d.onboarding_status === 'under_review' ? 'Your details are with our team for review. Contact us to change them.' : 'This account cannot be edited now.'); };
on('PUT', '/dealer/onboarding/business', (db, _p, b) => {
  const d = needDealerAny(db); lgCanEdit(d);
  const f = dealerProblems({ ...b, phone: d.phone }, 'business'); if (Object.keys(f).length) return lgFields(f);
  Object.assign(d, { business_name: b.business_name, legal_name: b.legal_name, business_type: b.business_type, name: b.name, email: b.email, registered_address: b.registered_address, country: b.country || 'India', website: b.website || '' },
    d.onboarding_status === 'approved' ? {} : { address: b.address, city: b.city, state: b.state, pincode: b.pincode });
  lgAudit(db, { actor_type: 'dealer', actor_id: d.id, subject_type: 'dealer', subject_id: d.id, action: 'dealer_saved', detail: { step: 'business' } });
  return ok(lgOnboardingView(db, d));
});
on('PUT', '/dealer/onboarding/kyc', (db, _p, raw) => {
  const d = needDealerAny(db); lgCanEdit(d); const b = normalizeIds(raw || {});
  const changing = !!String(b.bank_account || '').trim();
  const f = dealerProblems({ ...b, business_type: d.business_type, bank_account: changing || !d.bank_last4 ? b.bank_account || '' : undefined, bank_account_confirm: changing ? b.bank_account_confirm || '' : undefined }, 'kyc');
  if (Object.keys(f).length) return lgFields(f);
  Object.assign(d, { pan: b.pan, gstin: b.gstin, cin: b.cin, tan: b.tan, registration_no: b.registration_no, udyam: b.udyam, trade_license: b.trade_license, bank_name: b.bank_name, bank_holder: b.bank_holder, ifsc: b.ifsc, bank_branch: b.bank_branch });
  if (changing) { const acct = b.bank_account.replace(/\s/g, ''); d.bank_account_enc = btoa(`enc:${acct}`); d.bank_last4 = acct.slice(-4); }
  lgAudit(db, { actor_type: 'dealer', actor_id: d.id, subject_type: 'dealer', subject_id: d.id, action: 'dealer_saved', detail: { step: 'kyc', bank_changed: changing } });
  return ok(lgOnboardingView(db, d));
});
on('POST', '/dealer/onboarding/documents', async (db, _p, b) => {
  const d = needDealerAny(db);
  if (['rejected', 'suspended', 'terminated'].includes(d.onboarding_status)) return fail(409, 'This account cannot upload documents now.');
  const g = (k) => (b instanceof FormData ? b.get(k) : b?.[k]);
  const type = g('doc_type'); const file = b instanceof FormData ? b.get('file') : null;
  if (!DOC_TYPES[type]) return lgFields({ doc_type: 'Choose the document type' });
  if (!file || typeof file === 'string') return lgFields({ file: 'Choose a PDF, JPG or PNG file (max 5 MB)' });
  if (!/^(application\/pdf|image\/(jpeg|png))$/.test(file.type)) return fail(400, 'Upload a PDF, JPG or PNG file.');
  if (file.size > 5 * 1024 * 1024) return fail(413, 'File is too large (max 5 MB).');
  const exp = g('expiry_date') || ''; if (exp && Date.parse(exp) < Date.now()) return lgFields({ expiry_date: 'This document has expired' });
  const data = file.size <= 400 * 1024 ? await fileToDataUrl(file) : null; // the preview keeps small files only (browser storage)
  (db.dealerDocs ||= []).push({ id: (db.dealerDocs.at(-1)?.id || 0) + 1, dealer_id: d.id, doc_type: type, doc_number: g('doc_number') || null, data, original_name: String(file.name || '').slice(0, 120), mime: file.type, size: file.size, status: 'pending', reject_reason: null, expiry_date: exp || null, uploaded_at: nowIso() });
  if (['documents_rejected', 'documents_pending'].includes(d.onboarding_status)) d.onboarding_status = lgSigned(db, d.id) ? 'under_review' : 'draft';
  lgAudit(db, { actor_type: 'dealer', actor_id: d.id, subject_type: 'dealer', subject_id: d.id, action: 'dealer_doc_uploaded', detail: { doc_type: type } });
  return ok(lgOnboardingView(db, d), 201);
});
on('DELETE', '/dealer/onboarding/documents/:id', (db, { id }) => {
  const d = needDealerAny(db); const x = lgDocs(db, d.id).find((y) => y.id === +id); if (!x) return fail(404, 'Not found');
  if (x.status === 'verified') return fail(409, 'A verified document cannot be removed. Upload a newer one instead.');
  if (lgSigned(db, d.id)) return fail(409, 'Documents submitted with a signed agreement are kept on record. Upload a newer one instead.');
  db.dealerDocs = db.dealerDocs.filter((y) => y !== x); return ok(lgOnboardingView(db, d));
});
const lgFile = (x) => {
  if (x.data) { const [head, b64] = x.data.split(','); return ok({ __file: { bytes: Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)), type: head.slice(5, head.indexOf(';')) } }); }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="380"><rect width="600" height="380" fill="#f6f1ea"/><text x="300" y="170" font-family="Arial" font-size="22" text-anchor="middle" fill="#6b1b3a">${DOC_TYPES[x.doc_type]?.label.replace(/[<&]/g, '') || 'Document'}</text><text x="300" y="210" font-family="Arial" font-size="15" text-anchor="middle" fill="#555">Sample file in the preview (${x.original_name.replace(/[<&]/g, '') || 'file'})</text></svg>`;
  return ok({ __file: { bytes: new TextEncoder().encode(svg), type: 'image/svg+xml' } });
};
on('GET', '/dealer/onboarding/documents/:id/file', (db, { id }) => { const d = needDealerAny(db); const x = lgDocs(db, d.id).find((y) => y.id === +id); return x ? lgFile(x) : fail(404, 'Not found'); });
const lgAgreement = (db, d) => DEALER_KINDS.map((k) => { const doc = lgCurrent(db, k); const body = doc && fillTemplate(doc.body, lgDealerVars(db, d)); return doc && { kind: k, id: doc.id, title: doc.title, version: doc.version, effective_at: doc.effective_at, body, hash: lgHash(body) }; }).filter(Boolean);
on('GET', '/dealer/onboarding/agreement', (db) => { const d = needDealerAny(db); return ok({ docs: lgAgreement(db, d), checks: DEALER_CHECKS, signer_default: d.name, company: lgCompany(db).company_name, dealer_name: d.name, business_name: d.legal_name || d.business_name, agreement_date: nowIso() }); });
on('GET', '/dealer/onboarding/agreement/pdf', async (db) => { const d = needDealerAny(db); return lgBlankPdf(db, lgAgreement(db, d), { heading: 'DEALER AGREEMENT', ref: `D${d.id}-COPY`, who: [['Dealer name', d.name], ['Legal business name', d.legal_name || d.business_name], ['Dealer ID', `D-${d.id}`]] }); });
on('POST', '/dealer/onboarding/sign/otp', (db) => {
  const d = needDealerAny(db);
  if (db.signOtp?.[d.id] && Date.now() - Date.parse(db.signOtp[d.id].sent_at) < 30e3) return fail(429, 'Please wait 30 seconds before asking for a new code.');
  const code = String(Math.floor(Math.random() * 1e6)).padStart(6, '0'); const ref = `OTP-${Math.random().toString(16).slice(2, 10).toUpperCase()}`;
  (db.signOtp ||= {})[d.id] = { code, ref, tries: 0, expires_at: new Date(Date.now() + 10 * 6e4).toISOString(), sent_at: nowIso() };
  lgAudit(db, { actor_type: 'dealer', actor_id: d.id, subject_type: 'dealer', subject_id: d.id, action: 'dealer_otp_sent', detail: { ref } });
  return ok({ ok: true, ref, sent_to: `******${d.phone.slice(-4)}`, dev_otp: code });
});
on('POST', '/dealer/onboarding/sign', (db, _p, b) => {
  const d = needDealerAny(db);
  const pendingNew = lgPending(db, 'dealer', d.id, DEALER_KINDS).length > 0;
  if (['rejected', 'suspended', 'terminated'].includes(d.onboarding_status)) return fail(409, 'This account cannot sign now.');
  if (!pendingNew && d.onboarding_status !== 'agreement_pending') return fail(409, 'You have already signed the current agreement.');
  const f = {};
  if (String(b?.typed_name || '').trim().length < 3) f.typed_name = 'Type your full legal name';
  if (String(b?.capacity || '').trim().length < 2) f.capacity = 'Enter your role, e.g. Proprietor or Director';
  if (b?.authorised !== true) f.authorised = 'Confirm you are authorised to sign';
  for (const c of DEALER_CHECKS) if (b?.checks?.[c.key] !== true) f[`checks.${c.key}`] = 'Please tick this box';
  if (!/^data:image\/png;base64,/.test(b?.signature_png || '') || b.signature_png.length < 300) f.signature_png = 'Draw your signature in the box';
  if (!/^\d{6}$/.test(b?.otp || '')) f.otp = 'Enter the 6-digit code';
  if (Object.keys(f).length) return lgFields(f);
  const prog = onboardingProgress({ dealer: d, docs: lgDocs(db, d.id), signed: false });
  if (!prog.done.business || !prog.done.kyc) return fail(409, 'Complete your business and KYC details first.');
  if (!prog.done.documents) return fail(409, `Upload the required documents first: ${prog.missing.map((k) => DOC_TYPES[k]?.label).join(', ')}.`);
  const o = db.signOtp?.[d.id];
  if (!o || Date.parse(o.expires_at) < Date.now()) return lgFields({ otp: 'The code has expired. Ask for a new one.' });
  if (o.tries >= 5) return fail(429, 'Too many wrong codes. Ask for a new one.');
  if (o.code !== b.otp) { o.tries += 1; lgAudit(db, { actor_type: 'dealer', actor_id: d.id, subject_type: 'dealer', subject_id: d.id, action: 'dealer_otp_failed', detail: { ref: o.ref } }); return lgFields({ otp: 'Wrong code. Please check and try again.' }); }
  delete db.signOtp[d.id];
  const sig = { typed_name: b.typed_name.trim(), capacity: b.capacity.trim(), otp_ref: `${o.ref} (verified ${nowIso()})`, checks: DEALER_CHECKS.map((c) => ({ key: c.key, label: c.label })) };
  const refs = lgAccept(db, 'dealer', d, DEALER_KINDS, { typed_name: sig.typed_name, signature: sig, signature_png: b.signature_png, consents: Object.fromEntries(DEALER_CHECKS.map((c) => [c.key, true])) }, () => lgDealerVars(db, d, sig));
  if (d.onboarding_status !== 'approved') d.onboarding_status = 'under_review';
  d.submitted_at = nowIso();
  lgAudit(db, { actor_type: 'dealer', actor_id: d.id, subject_type: 'dealer', subject_id: d.id, action: 'dealer_signed', detail: { refs, typed_name: sig.typed_name, capacity: sig.capacity } });
  return ok({ ok: true, refs, ...lgOnboardingView(db, d) });
});
on('GET', '/dealer/legal', (db) => { const d = needDealerAny(db); return ok({ items: db.legalAcc.filter((a) => a.subject_type === 'dealer' && a.subject_id === d.id).reverse().map((a) => lgView(db, a)), pending: lgPending(db, 'dealer', d.id, DEALER_KINDS).map((x) => ({ kind: x.kind, title: x.title, version: x.version, change_note: x.change_note })),
  health: lgHealth(db, d), violations: lgViolations(db, d.id).map((v) => ({ id: v.id, title: v.title, severity: v.severity, status: v.status, description: v.description, due_at: v.due_at, created_at: v.created_at, updates: v.history.filter((h) => !['opened', 'note'].includes(h.action)).map((h) => ({ at: h.at, action: h.action, note: h.note })) })),
  severity: SEVERITY, violation_status: VIOLATION_STATUS, levels: HEALTH_LEVELS }); });
const lgDealerVisible = (db) => [...new Set(['dealer_agreement', 'marketplace_policy', ...policyCatalog(db.legalDocs).filter((k) => k.category === 'dealer').map((k) => k.kind), 'privacy', 'refund_cancellation'])].filter((k) => lgCurrent(db, k));
on('GET', '/dealer/legal/docs', (db) => {
  const d = needDealerAny(db); const vars = lgDealerVars(db, d);
  const docs = lgDealerVisible(db).map((k) => { const x = lgCurrent(db, k); return x && { kind: k, title: k === 'privacy' ? 'Privacy & Data Policy' : x.title, version: x.version, effective_at: x.effective_at, body: fillTemplate(x.body, vars) }; }).filter(Boolean);
  docs.splice(2, 0, { kind: 'commercial', title: 'Commercial Terms', version: 'current', effective_at: d.approved_at || d.created_at, body: `# Commercial Terms\n\n> Your fees, settlement cycle and return window. These are part of your Dealer Agreement.\n\n## Your commercial schedule\n> What this means: This is how and when you are paid, and what may be deducted.\n${commercialSchedule({ ...DEFAULT_COMMERCIAL, ...(d.commercial || {}) })}` });
  return ok({ docs });
});
on('GET', '/dealer/legal/doc/:kind/pdf', async (db, { kind }) => { const d = needDealerAny(db); if (!lgDealerVisible(db).includes(kind)) return fail(404, 'Not found'); const x = lgCurrent(db, kind); return lgBlankPdf(db, [{ ...x, body: fillTemplate(x.body, lgDealerVars(db, d)) }], { ref: `D${d.id}-${kind.toUpperCase()}-v${x.version}`, who: [['Dealer', d.legal_name || d.business_name], ['Dealer ID', `D-${d.id}`]] }); });
on('GET', '/dealer/legal/:id/pdf', async (db, { id }) => { const d = needDealerAny(db); const a = db.legalAcc.find((x) => x.id === +id && x.subject_type === 'dealer' && x.subject_id === d.id); return a ? lgPdf(db, a) : fail(404, 'Not found'); });

// admin: dealer verification
function lgSummary(db, d) {
  const docs = lgDocs(db, d.id); const signed = lgSigned(db, d.id); const p = onboardingProgress({ dealer: d, docs, signed }); const latest = latestDocs(docs);
  return { id: d.id, dealer_code: `D-${d.id}`, business_name: d.business_name, legal_name: d.legal_name, name: d.name, phone: d.phone, city: d.city, business_type: BUSINESS_TYPES[d.business_type] || '—', registered_at: d.created_at, submitted_at: d.submitted_at || null, deadline: d.onboarding_deadline || null,
    status: d.onboarding_status, status_label: ONBOARDING_STATUS[d.onboarding_status]?.label, tone: ONBOARDING_STATUS[d.onboarding_status]?.tone, kyc: p.done.business && p.done.kyc ? 'Complete' : 'Incomplete',
    documents: p.verified ? 'Verified' : p.rejected.length ? `${p.rejected.length} rejected` : p.missing.length ? `${p.missing.length} missing` : Object.values(latest).some((x) => x.status === 'pending') ? 'To check' : 'Uploaded',
    agreement: signed ? 'Signed' : 'Not signed', can_receive_orders: mCanReceive(d), self_registered: !!d.self_registered };
}
const lgDealer = (db, id) => { const d = mDealer(db, +id); if (!d) throw fail(404, 'Not found'); return d; };
on('GET', '/admin/dealer-verification', (db, _p, _b, q) => {
  needAdmin(db); const st = ONBOARDING_STATUS[q.status] ? q.status : null; const order = { under_review: 0, agreement_signed: 0, documents_rejected: 1, draft: 2 };
  const rows = db.dealers.filter((d) => !st || d.onboarding_status === st).sort((a, b) => (order[a.onboarding_status] ?? 3) - (order[b.onboarding_status] ?? 3));
  const counts = {}; for (const d of db.dealers) counts[d.onboarding_status] = (counts[d.onboarding_status] || 0) + 1;
  return ok({ items: rows.map((d) => lgSummary(db, d)), counts, statuses: ONBOARDING_STATUS });
});
on('GET', '/admin/dealer-verification/:id', (db, { id }) => {
  needAdmin(db); const d = lgDealer(db, id);
  return ok({ ...lgSummary(db, d), ...lgOnboardingView(db, d), acceptances: db.legalAcc.filter((a) => a.subject_type === 'dealer' && a.subject_id === d.id).reverse().map((a) => lgView(db, a)),
    audit: (db.legalAudit || []).filter((a) => a.subject_type === 'dealer' && a.subject_id === d.id).map((a) => ({ ...a, label: AUDIT_ACTIONS[a.action] || a.action })), commercial_full: { ...DEFAULT_COMMERCIAL, ...(d.commercial || {}) }, models: COMMERCIAL_MODELS });
});
on('POST', '/admin/dealer-verification/:id/bank/reveal', (db, { id }) => { needAdmin(db); const d = lgDealer(db, id); lgAudit(db, { actor_type: 'admin', actor_id: 1, subject_type: 'dealer', subject_id: d.id, action: 'bank_viewed' }); return ok({ bank_account: d.bank_account_enc ? atob(d.bank_account_enc).slice(4) : null }); });
on('GET', '/admin/dealer-verification/:id/documents/:docId/file', (db, { id, docId }) => { needAdmin(db); const x = lgDocs(db, +id).find((y) => y.id === +docId); if (!x) return fail(404, 'Not found'); lgAudit(db, { actor_type: 'admin', actor_id: 1, subject_type: 'dealer', subject_id: +id, action: 'doc_viewed', detail: { doc_type: x.doc_type } }); return lgFile(x); });
on('POST', '/admin/dealer-verification/:id/documents/:docId', (db, { id, docId }, b) => {
  needAdmin(db); const x = lgDocs(db, +id).find((y) => y.id === +docId); if (!x) return fail(404, 'Not found');
  if (b.action === 'reject' && String(b.reason || '').trim().length < 3) return lgFields({ reason: 'Tell the dealer what is wrong' });
  Object.assign(x, { status: b.action === 'verify' ? 'verified' : 'rejected', reject_reason: b.action === 'reject' ? b.reason.trim() : null, verified_at: nowIso() });
  const d = lgDealer(db, id);
  if (b.action === 'reject' && !['approved', 'suspended', 'terminated', 'rejected'].includes(d.onboarding_status)) { d.onboarding_status = 'documents_rejected'; d.status_reason = `${DOC_TYPES[x.doc_type]?.label}: ${b.reason.trim()}`; }
  lgAudit(db, { actor_type: 'admin', actor_id: 1, subject_type: 'dealer', subject_id: d.id, action: b.action === 'verify' ? 'doc_verified' : 'doc_rejected', detail: { doc_type: x.doc_type, reason: b.reason || null } });
  return ok({ ok: true });
});
const LG_STATUS_FOR = { approve: 'approved', reject: 'rejected', request_docs: 'documents_pending', request_correction: 'draft', suspend: 'suspended', terminate: 'terminated', reinstate: 'approved', request_signature: 'agreement_pending' };
on('POST', '/admin/dealer-verification/:id/action', (db, { id }, b) => {
  needAdmin(db); const d = lgDealer(db, id); const st = LG_STATUS_FOR[b?.action]; if (!st) return fail(400, 'Unknown action');
  const reason = String(b.reason || '').trim();
  if (!['approve', 'reinstate'].includes(b.action) && reason.length < 3) return lgFields({ reason: 'Add a short reason (the dealer will see it)' });
  if (b.action === 'approve' || b.action === 'reinstate') {
    const p = onboardingProgress({ dealer: d, docs: lgDocs(db, d.id), signed: lgSigned(db, d.id) });
    if (!p.done.business || !p.done.kyc) return fail(409, 'Business or KYC details are incomplete.');
    if (!p.verified) return fail(409, 'Verify every required document before approving.');
    if (!lgSigned(db, d.id)) return fail(409, 'The dealer has not signed the current agreement.');
    if (b.action === 'approve' && !(d.pincodes?.length || d.all_india)) return fail(409, 'Set the PIN codes this dealer delivers to (Dealers → Edit) before approving.');
  }
  if (b.action === 'reinstate' && d.onboarding_status !== 'suspended') return fail(409, 'Only a suspended dealer can be reinstated.');
  d.onboarding_status = st; d.status_reason = reason || null;
  if (st === 'approved') { d.approved_at = nowIso(); d.onboarding_deadline = null; }
  if (b.action === 'terminate') d.is_active = false;
  const action = { approve: 'dealer_approved', reject: 'dealer_rejected', request_docs: 'docs_requested', request_correction: 'docs_requested', suspend: 'dealer_suspended', terminate: 'dealer_terminated', reinstate: 'dealer_reinstated', request_signature: 'docs_requested' }[b.action];
  lgAudit(db, { actor_type: 'admin', actor_id: 1, subject_type: 'dealer', subject_id: d.id, action, detail: { reason: reason || null, docs: b.docs || [] } });
  return ok({ ok: true, ...lgSummary(db, d) });
});
on('PUT', '/admin/dealer-verification/:id/commercial', (db, { id }, b) => {
  needAdmin(db); const d = lgDealer(db, id); const before = { ...DEFAULT_COMMERCIAL, ...(d.commercial || {}) };
  const next = { model: b.model === 'commission' ? 'commission' : 'supply', commission_pct: +b.commission_pct || 0, platform_fee: +b.platform_fee || 0, payment_fee_pct: b.payment_fee_pct === '' || b.payment_fee_pct == null ? 2 : +b.payment_fee_pct, settlement_days: +b.settlement_days || 7, return_window_days: b.return_window_days === '' ? 7 : +b.return_window_days, late_dispatch_penalty: +b.late_dispatch_penalty || 0, logistics: b.logistics === 'platform' ? 'platform' : 'dealer' };
  const changed = JSON.stringify(next) !== JSON.stringify(before); d.commercial = next;
  const resign = changed && lgSigned(db, d.id);
  if (resign) { d.onboarding_status = 'agreement_pending'; d.status_reason = 'Commercial terms were updated. Please review and sign again.'; }
  lgAudit(db, { actor_type: 'admin', actor_id: 1, subject_type: 'dealer', subject_id: d.id, action: 'commercial_updated', detail: { resign } });
  return ok({ ok: true, resign, commercial_full: next });
});
on('GET', '/admin/dealer-verification/:id/acceptances/:accId/pdf', async (db, { id, accId }) => { needAdmin(db); const a = db.legalAcc.find((x) => x.id === +accId && x.subject_type === 'dealer' && x.subject_id === +id); return a ? lgPdf(db, a) : fail(404, 'Not found'); });

// admin: Legal & Compliance Center (mirrors server/src/routes/legal.js + lib/compliance.js)
const ADMIN_NAME = 'Store Owner';
const lgDocSummary = (db, r) => ({ id: r.id, kind: r.kind, version: r.version, title: r.title, status: r.status, status_label: DOC_STATUS[r.status]?.label, material: !!r.material, legal_reviewer: r.legal_reviewer || null, review_note: r.review_note || null, approved_at: r.approved_at || null, submitted_review_at: r.submitted_review_at || null, legal_approved: !!r.legal_approved, change_note: r.change_note, effective_at: r.effective_at, published_at: r.published_at, retired_at: r.retired_at, updated_at: r.updated_at, created_at: r.created_at,
  category: r.category || DOC_KINDS[r.kind]?.category || 'company', icon: r.icon || DOC_KINDS[r.kind]?.icon || '📄', description: r.description || DOC_KINDS[r.kind]?.desc || '', owner_name: r.owner_name || null, next_review_at: r.next_review_at || null, applies_to: r.applies_to || null, countries: r.countries || 'India', policy_type: r.policy_type || null,
  internal_submitted_at: r.internal_submitted_at || null, internal_reviewer: r.internal_reviewer || null, internal_reviewed_at: r.internal_reviewed_at || null, created_by_name: r.created_by_name || null, approved_by_name: r.approved_by_name || null, published_by_name: r.published_by_name || null,
  accepted: db.legalAcc.filter((a) => a.document_id === r.id).length });
const lgNotice = (db, n) => { (db.legalNotices ||= []).unshift({ id: (db.legalNotices[0]?.id || 0) + 1, dealer_id: null, body: '', link: null, created_at: nowIso(), read_at: null, ...n }); };
const lgAccStats = (db) => acceptanceStats({ docs: db.legalDocs, subjects: { customer: db.users.map((u) => u.id), dealer: db.dealers.filter((d) => !['rejected', 'terminated'].includes(d.onboarding_status)).map((d) => d.id) }, acceptances: db.legalAcc, now: Date.now() });
const lgAuditOut = (a) => ({ ...a, label: AUDIT_ACTIONS[a.action] || a.action, actor_name: a.actor_type === 'admin' ? ADMIN_NAME : null });
on('GET', '/admin/legal/center', (db) => {
  needAdmin(db); const accCount = {}; for (const a of db.legalAcc) accCount[a.document_id] = (accCount[a.document_id] || 0) + 1;
  return ok({ ...buildLegalCenter({ docs: db.legalDocs, accStats: lgAccStats(db), accCount, now: Date.now() }), company: lgCompany(db), unread: (db.legalNotices || []).filter((n) => n.audience === 'admin' && !n.read_at).length, recent: (db.legalAudit || []).slice(0, 12).map(lgAuditOut) });
});
on('GET', '/admin/legal/docs', (db) => { needAdmin(db); const kinds = policyCatalog(db.legalDocs).map((k) => ({ ...k, current: lgCurrent(db, k.kind)?.id || null, versions: db.legalDocs.filter((r) => r.kind === k.kind).sort((a, b) => b.id - a.id).map((r) => lgDocSummary(db, r)) }));
  return ok({ kinds, company: lgCompany(db), company_keys: Object.keys(COMPANY_DEFAULTS), statuses: DOC_STATUS, unreviewed_live: db.legalDocs.filter((r) => r.status === 'published' && !r.legal_approved && kinds.some((k) => k.current === r.id)).length }); });
on('GET', '/admin/legal/kinds/:kind', (db, { kind }) => {
  needAdmin(db); const rows = db.legalDocs.filter((r) => r.kind === kind).sort((a, b) => b.id - a.id); if (!rows.length && !DOC_KINDS[kind]) return fail(404, 'Not found');
  const cur = lgCurrent(db, kind);
  return ok({ kind, meta: DOC_KINDS[kind] || null, current: cur?.id || null, versions: rows.map((r) => ({ ...lgDocSummary(db, r), state: policyState(r, cur, Date.now()) })), audit: (db.legalAudit || []).filter((a) => a.detail?.kind === kind).map(lgAuditOut), acceptance: lgAccStats(db)[kind] || null });
});
const lgApproval = (r) => [['Document status', DOC_STATUS[r.status]?.label || r.status], ['Legal approval', r.legal_reviewer ? `${r.legal_reviewer}${r.approved_at ? ` - ${r.approved_at.slice(0, 10)}` : ''}` : 'Not yet approved by legal counsel'], ...(r.owner_name ? [['Policy owner', r.owner_name]] : []), ...(r.next_review_at ? [['Next review', r.next_review_at.slice(0, 10)]] : [])];
on('GET', '/admin/legal/docs/:id/pdf', async (db, { id }) => { needAdmin(db); const r = db.legalDocs.find((x) => x.id === +id); if (!r) return fail(404, 'Not found'); return lgBlankPdf(db, [{ ...r, body: fillTemplate(r.body, lgCompany(db)) }], { ref: `${r.kind.toUpperCase()}-v${r.version}-${r.status.toUpperCase()}`, who: lgApproval(r) }); });
const LG_FAIL = { submit: 'Only a draft can be sent for review.', internal_approve: 'Only a version in internal review can be passed to legal review.', approve: 'Only a version in legal review can be approved.', publish: 'Only a version approved in legal review can be published. Send the draft for review first.', retire: 'Only a published version can be archived.', return: 'Only a version in review or approved can be sent back for changes.' };
function lgStep(db, id, step, extra = {}) {
  needAdmin(db); const r = db.legalDocs.find((x) => x.id === +id); if (!r) throw fail(404, 'Not found');
  const w = WORKFLOW[step]; if (!w.from.includes(r.status)) throw fail(409, LG_FAIL[step]);
  const t = nowIso(); const set = { status: w.to, updated_at: t, ...extra };
  if (step === 'submit') { if (String(r.body).length < 50) throw fail(400, 'The document is too short.'); set.internal_submitted_at = t; set.review_note = null; }
  if (step === 'internal_approve') { set.internal_reviewer = ADMIN_NAME; set.internal_reviewed_at = t; set.submitted_review_at = t; }
  if (step === 'approve') { set.approved_by_name = ADMIN_NAME; set.approved_at = t; }
  if (step === 'publish') { set.legal_approved = true; set.published_at = t; set.published_by_name = ADMIN_NAME; }
  if (step === 'retire') { if (DOC_KINDS[r.kind]?.accept && !db.legalDocs.some((x) => x.kind === r.kind && x.status === 'published' && x.id !== r.id && x.effective_at <= t)) throw fail(409, 'Publish a newer version first — new customers or dealers must always have a version to accept.'); set.retired_at = t; }
  Object.assign(r, set);
  lgAudit(db, { actor_type: 'admin', actor_id: 1, action: w.action, detail: { kind: r.kind, version: r.version, title: r.title, note: extra.review_note || null, reviewer: extra.legal_reviewer || null } });
  if (step === 'approve') lgNotice(db, { audience: 'admin', kind: 'ready', title: `${r.title} v${r.version} is ready for publication.`, body: `Approved by ${r.legal_reviewer}.`, link: `policy:${r.kind}` });
  if (step === 'return') lgNotice(db, { audience: 'admin', kind: 'changes', title: `Changes requested on ${r.title} v${r.version}`, body: r.review_note || '', link: `policy:${r.kind}` });
  if (step === 'publish') {
    const m = DOC_KINDS[r.kind] || {}; const cat = r.category || m.category; const when = Date.parse(r.effective_at) > Date.now() ? `takes effect on ${r.effective_at.slice(0, 10)}` : 'now in effect';
    lgNotice(db, { audience: 'admin', kind: 'published', title: `${r.title} v${r.version} published (${when})`, body: r.change_note || '', link: `policy:${r.kind}` });
    if (cat === 'dealer') lgNotice(db, { audience: 'dealer', kind: 'policy_update', title: m.accept === 'dealer' && r.material ? `Your ${r.title} has been updated. Please review and accept the new version.` : `${r.title} v${r.version} is ${when}`, body: r.change_note || '', link: m.accept === 'dealer' && r.material ? '/dealer/onboarding' : '/dealer/legal' });
    else lgNotice(db, { audience: 'customer', kind: 'policy_update', title: m.accept === 'customer' && r.material ? `Our ${r.title} has been updated. Customers are asked to review and accept it before their next order.` : `${r.title} v${r.version} published`, body: r.change_note || '', link: '/policies' });
  }
  return ok(lgDocSummary(db, r));
}
on('POST', '/admin/legal/docs/:id/submit', (db, { id }) => lgStep(db, id, 'submit'));
on('POST', '/admin/legal/docs/:id/internal-approve', (db, { id }, b) => lgStep(db, id, 'internal_approve', { review_note: b?.note || null }));
on('POST', '/admin/legal/docs/:id/approve', (db, { id }, b) => { if (String(b?.reviewer || '').trim().length < 3) return lgFields({ reviewer: 'Name of the lawyer / firm who reviewed it' }); if (b?.confirm !== true) return lgFields({ confirm: 'Confirm the legal review' }); return lgStep(db, id, 'approve', { legal_reviewer: b.reviewer.trim(), review_note: b.note || null }); });
on('POST', '/admin/legal/docs/:id/return', (db, { id }, b) => lgStep(db, id, 'return', { review_note: String(b?.note || '').trim() || 'Changes requested' }));
const lgDate = (v) => (v ? new Date(`${String(v).slice(0, 10)}T00:00:00+05:30`).toISOString() : null);
on('POST', '/admin/legal/docs/:id/publish', (db, { id }, b) => {
  const r = db.legalDocs.find((x) => x.id === +id); if (!r) return fail(404, 'Not found');
  const eff = b?.effective_at ? lgDate(b.effective_at) : nowIso();
  return lgStep(db, id, 'publish', { effective_at: eff, next_review_at: b?.next_review_at ? lgDate(b.next_review_at) : r.next_review_at || new Date(Date.parse(eff) + 365 * 864e5).toISOString(), material: b?.material ?? r.material });
});
on('POST', '/admin/legal/docs/:id/retire', (db, { id }) => lgStep(db, id, 'retire'));
on('GET', '/admin/legal/docs/:id', (db, { id }) => { needAdmin(db); const r = db.legalDocs.find((x) => x.id === +id); return r ? ok({ ...lgDocSummary(db, r), body: r.body, preview: fillTemplate(r.body, lgCompany(db)), simple: parseLegalDoc(r.body).intro }) : fail(404, 'Not found'); });
const lgBump = (v) => { const [a, b = 0] = String(v).split('.').map(Number); return `${a}.${(b || 0) + 1}`; };
on('POST', '/admin/legal/docs', (db, _p, b = {}) => {
  needAdmin(db); let kind = b.kind;
  if (!kind) {
    const title = String(b.title || '').trim(); if (title.length < 3) return lgFields({ title: 'Enter the policy name' });
    kind = `custom_${title.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40)}`;
    if (DOC_KINDS[kind] || db.legalDocs.some((x) => x.kind === kind)) return lgFields({ title: 'A policy with this name already exists' });
  }
  if (DOC_KINDS[kind]?.legacy) return fail(400, 'This document is no longer used.');
  if (!DOC_KINDS[kind] && !/^custom_[a-z0-9_]{2,40}$/.test(kind)) return fail(400, 'Unknown policy');
  const busy = db.legalDocs.find((x) => x.kind === kind && IN_PROGRESS_STATUSES.includes(x.status));
  if (busy) return fail(409, 'A new version of this policy is already in progress. Open it from the library to continue.', { id: busy.id });
  if (b.version && !/^\d{1,3}\.\d{1,3}$/.test(b.version)) return lgFields({ version: 'Use a version like 1.2 or 2.0' });
  const base = db.legalDocs.filter((x) => x.kind === kind).sort((x, y) => y.id - x.id)[0];
  let version = b.version || (base ? lgBump(base.version) : '1.0');
  if (db.legalDocs.some((x) => x.kind === kind && x.version === version)) { if (b.version) return lgFields({ version: 'This version number is already used' }); while (db.legalDocs.some((x) => x.kind === kind && x.version === version)) version = lgBump(version); }
  const m = DOC_KINDS[kind] || {}; const title = String(b.title || '').trim() || base?.title || m.label;
  let body = b.start === 'blank' ? `# ${title}\n\n> \n\n## In simple words\n- \n\n## 1. Introduction\n> What this means: \n` : b.start === 'starter' ? (STARTER_POLICIES[kind]?.body || DEFAULT_LEGAL_DOCS[kind]?.body || '') : (base?.body || STARTER_POLICIES[kind]?.body || DEFAULT_LEGAL_DOCS[kind]?.body || `# ${title}\n\n> \n\n## 1. Introduction\n> What this means: \n`);
  if (b.simple != null) body = setIntro(body, b.simple);
  const cat = b.category || base?.category || m.category || 'company';
  const r = { id: Math.max(...db.legalDocs.map((x) => x.id)) + 1, kind, version, title, body, status: 'draft', material: false, change_note: b.change_note || null, effective_at: lgDate(b.planned_effective_at), published_at: null, created_at: nowIso(), updated_at: nowIso(),
    category: cat, icon: b.icon || base?.icon || m.icon || '📄', description: b.description ?? base?.description ?? m.desc ?? null, owner_name: b.owner_name ?? base?.owner_name ?? null, next_review_at: lgDate(b.next_review_at),
    applies_to: b.applies_to || base?.applies_to || (cat === 'dealer' ? 'dealers' : cat === 'customer' ? 'customers' : 'everyone'), countries: b.countries || base?.countries || 'India', policy_type: b.policy_type || cat, created_by_name: ADMIN_NAME };
  db.legalDocs.push(r); lgAudit(db, { actor_type: 'admin', actor_id: 1, action: base ? 'version_created' : 'policy_created', detail: { kind, version, title } });
  if (b.submit) lgStep(db, r.id, 'submit');
  return ok({ ...lgDocSummary(db, r), body: r.body, simple: parseLegalDoc(r.body).intro }, 201);
});
on('PUT', '/admin/legal/docs/:id', (db, { id }, b) => {
  needAdmin(db); const r = db.legalDocs.find((x) => x.id === +id); if (!r) return fail(404, 'Not found');
  if (!EDITABLE_STATUSES.includes(r.status)) return fail(409, ['published', 'retired'].includes(r.status) ? 'Published versions cannot be changed. Create a new version.' : 'This version is in review. Ask for changes to edit it again.');
  const f = {}; if (!/^\d{1,3}\.\d{1,3}$/.test(b.version || '')) f.version = 'Use a version like 1.2 or 2.0'; if (String(b.body || '').length < 50) f.body = 'The document is too short'; if (String(b.title || '').trim().length < 3) f.title = 'Enter a title';
  if (db.legalDocs.some((x) => x.kind === r.kind && x.version === b.version && x.id !== r.id)) f.version = 'This version number is already used';
  if (Object.keys(f).length) return lgFields(f);
  Object.assign(r, { title: b.title.trim(), body: b.simple != null ? setIntro(b.body, b.simple) : b.body, version: b.version, change_note: b.change_note || null, material: !!b.material, updated_at: nowIso(),
    ...(b.description != null ? { description: b.description } : {}), ...(b.owner_name != null ? { owner_name: b.owner_name } : {}), ...(b.next_review_at !== undefined ? { next_review_at: lgDate(b.next_review_at) } : {}),
    ...(b.planned_effective_at !== undefined ? { effective_at: lgDate(b.planned_effective_at) } : {}), ...(b.applies_to ? { applies_to: b.applies_to } : {}), ...(b.countries ? { countries: b.countries } : {}) });
  lgAudit(db, { actor_type: 'admin', actor_id: 1, action: 'version_edited', detail: { kind: r.kind, version: r.version, title: r.title } });
  return ok({ ...lgDocSummary(db, r), body: r.body, simple: parseLegalDoc(r.body).intro });
});
on('DELETE', '/admin/legal/docs/:id', (db, { id }) => { needAdmin(db); const r = db.legalDocs.find((x) => x.id === +id); if (!r) return fail(404, 'Not found'); if (!EDITABLE_STATUSES.includes(r.status)) return fail(409, 'Versions in review, published or archived are legal records and cannot be deleted.'); db.legalDocs = db.legalDocs.filter((x) => x !== r); return ok({ ok: true }); });
// acceptance
on('GET', '/admin/legal/acceptance', (db) => { needAdmin(db); return ok({ stats: Object.values(lgAccStats(db)).map((s) => ({ ...s, title: DOC_KINDS[s.kind]?.label })), by_version: [] }); });
on('GET', '/admin/legal/acceptance/report', (db) => { needAdmin(db); lgAudit(db, { actor_type: 'admin', actor_id: 1, action: 'report_exported', detail: { rows: db.legalAcc.length } });
  return ok({ rows: [['Agreement no.', 'Who', 'ID', 'Name', 'Email', 'Mobile', 'Document', 'Version', 'Accepted at', 'Verification', 'IP'], ...[...db.legalAcc].reverse().map((a) => [a.ref_no, a.subject_type, `${a.subject_type === 'dealer' ? 'D' : 'C'}-${a.subject_id}`, a.name, a.email, a.phone, DOC_KINDS[a.kind]?.label || a.kind, a.version, a.accepted_at, a.verification || '', a.ip || ''])] }); });
on('GET', '/admin/legal/acceptance/:kind/people', (db, { kind }, _b, q) => {
  needAdmin(db); const m = DOC_KINDS[kind]; if (!m?.accept) return fail(404, 'Not found');
  const want = ['accepted', 'pending', 'older'].includes(q.status) ? q.status : 'pending'; const cur = lgCurrent(db, kind);
  const people = m.accept === 'customer' ? db.users.map((u) => ({ id: u.id, name: u.name, email: u.email, phone: u.phone })) : db.dealers.filter((d) => !['rejected', 'terminated'].includes(d.onboarding_status)).map((d) => ({ id: d.id, name: d.business_name, email: d.email, phone: d.phone }));
  const rows = people.map((p) => { const a = [...db.legalAcc].reverse().find((x) => x.subject_type === m.accept && x.subject_id === p.id && x.kind === kind); const st = lgPending(db, m.accept, p.id, [kind]).length ? 'pending' : a?.document_id === cur?.id ? 'accepted' : 'older'; return { ...p, who: m.accept, status: st, version: a?.version || null, ref_no: a?.ref_no || null, accepted_at: a?.accepted_at || null }; });
  const list = rows.filter((r) => r.status === want); return ok({ items: list.slice(0, 500), total: list.length });
});
// dealer compliance
const lgDocRows = (db) => { const out = []; for (const d of db.dealers) { const mine = lgDocs(db, d.id); const latest = latestDocs(mine); const req = requiredDocs(d); for (const x of mine) out.push({ id: x.id, dealer_id: d.id, business_name: d.business_name, doc_type: x.doc_type, label: DOC_TYPES[x.doc_type]?.label || x.doc_type, doc_number: x.doc_number, status: x.status, expiry_date: x.expiry_date, uploaded_at: x.uploaded_at, latest: latest[x.doc_type]?.id === x.id, required: req.includes(x.doc_type), expiry: docExpiry(x.expiry_date), reminded_at: x.reminded_at || null }); } return out; };
const lgRules = (db) => healthRules(db.settings.legal_health_rules || null);
function lgHealth(db, d) {
  const rules = lgRules(db); const from = Date.now() - rules.window_days * 864e5;
  const live = db.dealerOrders.filter((r) => r.dealer_id === d.id).map((r) => { const o = db.orders.find((x) => x.id === r.order_id); return { status: r.status, sent_at: r.sent_at, accepted_at: r.accepted_at, out_at: r.out_at, delivered_at: r.delivered_at, refunded: o?.payment_status === 'refunded' && r.status === 'delivered', tickets: (db.tickets || []).filter((t) => o && t.order_id === o.id).map((t) => t.topic) }; });
  const arch = (db.dealerArchive || []).filter((x) => x.dealer_id === d.id).map((x) => ({ status: x.status, sent_at: x.sent_at, accepted_at: x.accepted_at, out_at: x.out_at, delivered_at: x.delivered_at, refunded: false, tickets: [] }));
  const pids = db.dealerProducts.filter((x) => x.dealer_id === d.id && x.product_id).map((x) => x.product_id);
  const lowReviews = db.reviews.filter((r) => r.status === 'approved' && r.rating <= 2 && pids.includes(r.product_id) && Date.parse(r.created_at) >= from).length;
  return computeDealerHealth({ orders: [...live, ...arch], violations: (db.violations || []).filter((v) => v.dealer_id === d.id), docs: lgDocRows(db).filter((x) => x.dealer_id === d.id), lowReviews, rules, now: Date.now() });
}
on('GET', '/admin/legal/dealers', (db) => {
  needAdmin(db); const cur = lgCurrent(db, 'dealer_agreement'); const docs = lgDocRows(db);
  return ok({ rules: lgRules(db), levels: HEALTH_LEVELS, items: [...db.dealers].sort((a, b) => a.business_name.localeCompare(b.business_name)).map((d) => {
    const a = [...db.legalAcc].reverse().find((x) => x.subject_type === 'dealer' && x.subject_id === d.id && x.kind === 'dealer_agreement'); const signed = lgSigned(db, d.id);
    const mine = docs.filter((x) => x.dealer_id === d.id && x.latest); const req = requiredDocs(d); const latest = Object.fromEntries(mine.map((x) => [x.doc_type, x])); const h = lgHealth(db, d);
    return { id: d.id, dealer_code: `D-${d.id}`, name: d.name, business_name: d.business_name, legal_name: d.legal_name, city: d.city, phone: d.phone, onboarding_status: d.onboarding_status, agreement_version: a?.version || null, agreement_ref: a?.ref_no || null, agreement_id: a?.id || null,
      agreement_status: !a ? 'not_signed' : signed ? (a.document_id === cur?.id ? 'signed_current' : 'signed_older') : 'resign_needed', signed_at: a?.accepted_at || null, signature: a ? a.verification || 'OTP + typed name + drawn signature' : null,
      kyc: d.pan && d.bank_last4 ? 'complete' : 'incomplete', documents: { required: req.length, missing: req.filter((k) => !latest[k] || latest[k].status === 'rejected').length, expired: mine.filter((x) => x.expiry === 'expired').length, expiring: mine.filter((x) => x.expiry === 'expiring').length, verified: req.filter((k) => latest[k]?.status === 'verified').length },
      health: { status: h.status, label: h.label, icon: h.icon, tone: h.tone, problems: h.problems, orders: h.orders }, open_violations: (db.violations || []).filter((v) => v.dealer_id === d.id && ['open', 'correction_requested'].includes(v.status)).length };
  }) });
});
on('GET', '/admin/legal/dealers/:id/health', (db, { id }) => { needAdmin(db); const d = lgDealer(db, id); return ok({ dealer: { id: d.id, business_name: d.business_name, name: d.name }, health: lgHealth(db, d), violations: lgViolations(db, d.id), acceptances: db.legalAcc.filter((a) => a.subject_type === 'dealer' && a.subject_id === d.id).reverse().map((a) => lgView(db, a)), documents: lgDocRows(db).filter((x) => x.dealer_id === d.id) }); });
on('GET', '/admin/legal/dealers/:id/listings', (db, { id }) => { needAdmin(db); return ok({ items: db.dealerProducts.filter((x) => x.dealer_id === +id && x.product_id).map((x) => ({ id: x.id, name: x.name, product_id: x.product_id, is_active: !!db.products.find((p) => p.id === x.product_id)?.is_active })) }); });
on('GET', '/admin/legal/health-rules', (db) => { needAdmin(db); return ok({ rules: lgRules(db), metrics: HEALTH_METRICS, levels: HEALTH_LEVELS, defaults: DEFAULT_HEALTH_RULES }); });
on('PUT', '/admin/legal/health-rules', (db, _p, b) => { needAdmin(db); db.settings.legal_health_rules = healthRules(b); lgAudit(db, { actor_type: 'admin', actor_id: 1, action: 'health_rules_updated', detail: { window_days: db.settings.legal_health_rules.window_days } }); return ok({ rules: db.settings.legal_health_rules }); });
// violations
const lgViolations = (db, dealerId) => (db.violations || []).filter((v) => !dealerId || v.dealer_id === dealerId).map((v) => ({ ...v, business_name: mDealer(db, v.dealer_id)?.business_name || `D-${v.dealer_id}` }))
  .sort((a, b) => ({ open: 0, correction_requested: 1 }[a.status] ?? 2) - ({ open: 0, correction_requested: 1 }[b.status] ?? 2) || b.id - a.id);
on('GET', '/admin/legal/violations', (db) => { needAdmin(db); const items = lgViolations(db); const counts = {}; for (const v of items) counts[v.status] = (counts[v.status] || 0) + 1;
  return ok({ items, counts, types: VIOLATION_TYPES, severity: SEVERITY, statuses: VIOLATION_STATUS, actions: VIOLATION_ACTIONS, dealers: db.dealers.filter((d) => !['rejected', 'terminated'].includes(d.onboarding_status)).map((d) => ({ id: d.id, business_name: d.business_name })) }); });
on('POST', '/admin/legal/violations', (db, _p, b) => {
  needAdmin(db); const d = mDealer(db, +b?.dealer_id); if (!d) return lgFields({ dealer_id: 'Choose a dealer' });
  if (!VIOLATION_TYPES[b.type] || !SEVERITY[b.severity]) return fail(400, 'Choose the violation and severity');
  const desc = String(b.description || '').trim(); if (desc.length < 5) return lgFields({ description: 'Describe what happened' });
  const t = nowIso(); const v = { id: Math.max(0, ...(db.violations ||= []).map((x) => x.id)) + 1, dealer_id: d.id, type: b.type, severity: b.severity, title: VIOLATION_TYPES[b.type], description: desc, policy_kind: b.policy_kind || null, status: 'open', due_at: +b.due_days ? new Date(Date.now() + b.due_days * 864e5).toISOString() : null, product_id: null, history: [{ at: t, by: ADMIN_NAME, action: 'opened', note: desc }], created_by_name: ADMIN_NAME, created_at: t, updated_at: t };
  db.violations.push(v);
  if (b.notify !== false) lgNotice(db, { audience: 'dealer', dealer_id: d.id, kind: 'violation', title: `Policy issue: ${v.title} (${SEVERITY[v.severity].label})`, body: desc, link: '/dealer/legal' });
  lgNotice(db, { audience: 'admin', kind: 'violation', title: `${SEVERITY[v.severity].label} violation opened for ${d.business_name}: ${v.title}`, link: `dealer:${d.id}` });
  lgAudit(db, { actor_type: 'admin', actor_id: 1, subject_type: 'dealer', subject_id: d.id, action: 'violation_opened', detail: { id: v.id, type: v.type, severity: v.severity } });
  return ok(lgViolations(db, d.id).find((x) => x.id === v.id), 201);
});
on('POST', '/admin/legal/violations/:id/action', (db, { id }, b) => {
  needAdmin(db); const v = (db.violations || []).find((x) => x.id === +id); if (!v) return fail(404, 'Not found');
  if (!VIOLATION_ACTIONS[b?.action]) return fail(400, 'Unknown action');
  const note = String(b.note || '').trim(); const d = mDealer(db, v.dealer_id); const t = nowIso(); let detail = note;
  if (v.status === 'closed' && b.action !== 'note') return fail(409, 'This violation is closed.');
  if (['contact', 'request_correction', 'suspend_dealer', 'close', 'resolve'].includes(b.action) && note.length < 3) return lgFields({ note: 'Add a short message or reason' });
  if (b.action === 'contact' || b.action === 'request_correction') { lgNotice(db, { audience: 'dealer', dealer_id: d.id, kind: 'violation', title: b.action === 'request_correction' ? `Correction needed: ${v.title}` : `Message about: ${v.title}`, body: note, link: '/dealer/legal' }); if (b.action === 'request_correction') v.status = 'correction_requested'; }
  if (b.action === 'suspend_listing') {
    const dp = db.dealerProducts.find((x) => x.id === +b.product_id && x.dealer_id === d.id); const p = dp && db.products.find((x) => x.id === dp.product_id);
    if (!p) return lgFields({ product_id: 'Choose a live listing of this dealer' });
    p.is_active = false; v.product_id = p.id; detail = `“${dp.name}” hidden from the store${note ? ` — ${note}` : ''}`;
    lgNotice(db, { audience: 'dealer', dealer_id: d.id, kind: 'violation', title: `Listing paused: “${dp.name}”`, body: note || v.title, link: '/dealer/products' });
    lgAudit(db, { actor_type: 'admin', actor_id: 1, subject_type: 'dealer', subject_id: d.id, action: 'listing_suspended', detail: { name: dp.name, violation: v.id } });
  }
  if (b.action === 'suspend_dealer') { if (['terminated', 'rejected'].includes(d.onboarding_status)) return fail(409, 'This dealer is not active.'); d.onboarding_status = 'suspended'; d.status_reason = `${v.title}: ${note}`; lgAudit(db, { actor_type: 'admin', actor_id: 1, subject_type: 'dealer', subject_id: d.id, action: 'dealer_suspended', detail: { reason: note, violation: v.id } }); lgNotice(db, { audience: 'dealer', dealer_id: d.id, kind: 'violation', title: 'Your dealer account is suspended', body: note, link: '/dealer/legal' }); }
  if (b.action === 'resolve') v.status = 'resolved';
  if (b.action === 'close') v.status = 'closed';
  if (['resolved', 'closed'].includes(v.status)) v.closed_at = t;
  v.history.push({ at: t, by: ADMIN_NAME, action: b.action, note: detail }); v.updated_at = t;
  lgAudit(db, { actor_type: 'admin', actor_id: 1, subject_type: 'dealer', subject_id: d.id, action: b.action === 'close' ? 'violation_closed' : 'violation_action', detail: { id: v.id, action: b.action, note: note || null } });
  return ok(lgViolations(db, d.id).find((x) => x.id === v.id));
});
// documents, calendar, notifications
on('GET', '/admin/legal/documents', (db) => {
  needAdmin(db); const rows = lgDocRows(db).filter((x) => x.latest); const summary = { valid: 0, expiring: 0, expired: 0, no_expiry: 0 }; for (const r of rows) summary[r.expiry] += 1;
  const missing = db.dealers.filter((d) => !['rejected', 'terminated'].includes(d.onboarding_status)).flatMap((d) => requiredDocs(d).filter((k) => !rows.some((x) => x.dealer_id === d.id && x.doc_type === k && x.status !== 'rejected')).map((k) => ({ dealer_id: d.id, business_name: d.business_name, doc_type: k, label: DOC_TYPES[k]?.label })));
  return ok({ items: rows, summary, missing, states: DOC_EXPIRY });
});
on('POST', '/admin/legal/documents/:id/remind', (db, { id }) => {
  needAdmin(db); const x = (db.dealerDocs || []).find((y) => y.id === +id); if (!x) return fail(404, 'Not found'); const d = mDealer(db, x.dealer_id); const label = DOC_TYPES[x.doc_type]?.label || x.doc_type; const st = docExpiry(x.expiry_date);
  lgNotice(db, { audience: 'dealer', dealer_id: d.id, kind: 'doc_expiry', title: st === 'expired' ? `${label} has expired` : x.expiry_date ? `${label} expires on ${x.expiry_date}` : `Please check your ${label}`, body: 'Upload the renewed document in Profile → KYC & documents.', link: '/dealer/onboarding' });
  x.reminded_at = nowIso(); lgAudit(db, { actor_type: 'admin', actor_id: 1, subject_type: 'dealer', subject_id: d.id, action: 'reminder_sent', detail: { doc_type: x.doc_type } });
  return ok({ ok: true });
});
on('GET', '/admin/legal/calendar', (db) => {
  needAdmin(db);
  const signed = db.dealers.map((d) => { const a = [...db.legalAcc].reverse().find((x) => x.subject_type === 'dealer' && x.subject_id === d.id && x.kind === 'dealer_agreement'); return a && { dealer_id: d.id, accepted_at: a.accepted_at, version: a.version, title: 'Dealer Agreement', business_name: d.business_name }; }).filter(Boolean);
  return ok({ items: legalCalendar({ docs: db.legalDocs, dealerDocs: lgDocRows(db), dealers: db.dealers, signed, now: Date.now() }) });
});
on('GET', '/admin/legal/notices', (db) => { needAdmin(db); return ok({ items: (db.legalNotices || []).slice(0, 150) }); });
on('POST', '/admin/legal/notices/read', (db) => { needAdmin(db); for (const n of db.legalNotices || []) if (n.audience === 'admin' && !n.read_at) n.read_at = nowIso(); return ok({ ok: true }); });
// public policies (customer + company)
const lgPublicKinds = (db) => policyCatalog(db.legalDocs).filter((k) => k.category !== 'dealer');
on('GET', '/legal/policies', (db) => ok({ items: lgPublicKinds(db).map((k) => { const d = lgCurrent(db, k.kind); return d && { kind: k.kind, title: d.title, icon: d.icon || k.icon, desc: d.description || k.desc, category: k.category, version: d.version, effective_at: d.effective_at, accept: k.accept || null }; }).filter(Boolean), company: { name: lgCompany(db).company_name, legal_name: lgCompany(db).company_legal_name } }));
on('GET', '/legal/policy/:kind', (db, { kind }) => { if (!lgPublicKinds(db).some((k) => k.kind === kind)) return fail(404, 'Not found'); const d = lgCurrent(db, kind); return d ? ok(lgPublic(db, d)) : fail(404, 'Not found'); });
on('GET', '/legal/policy/:kind/pdf', async (db, { kind }) => { if (!lgPublicKinds(db).some((k) => k.kind === kind)) return fail(404, 'Not found'); const d = lgPublic(db, lgCurrent(db, kind)); return d ? lgBlankPdf(db, [d], { ref: `${kind.toUpperCase()}-v${d.version}` }) : fail(404, 'Not found'); });
on('PUT', '/admin/legal/company', (db, _p, b) => { needAdmin(db); db.legalCompany = Object.fromEntries(Object.keys(COMPANY_DEFAULTS).map((k) => [k, String(b?.[k] || '').trim().slice(0, 300)])); lgAudit(db, { actor_type: 'admin', actor_id: 1, action: 'company_updated' }); return ok(lgCompany(db)); });
on('GET', '/admin/legal/stats', (db) => {
  needAdmin(db); const dealers = {}; for (const d of db.dealers) dealers[d.onboarding_status] = (dealers[d.onboarding_status] || 0) + 1;
  return ok({ customers: db.users.length, customers_pending: db.users.filter((u) => lgPending(db, 'customer', u.id, CUSTOMER_KINDS).length).length,
    by_doc: db.legalDocs.slice().sort((a, b) => a.kind.localeCompare(b.kind) || a.id - b.id).map((r) => ({ kind: r.kind, version: r.version, status: r.status, n: db.legalAcc.filter((a) => a.document_id === r.id).length })),
    dealers, docs_to_check: (db.dealerDocs || []).filter((x) => x.status === 'pending').length, grace: db.dealers.filter((d) => d.onboarding_status !== 'approved' && d.onboarding_deadline).map((d) => ({ id: d.id, business_name: d.business_name, onboarding_deadline: d.onboarding_deadline })), statuses: ONBOARDING_STATUS });
});
on('GET', '/admin/legal/audit', (db, _p, _b, q) => { needAdmin(db); return ok({ items: (db.legalAudit || []).filter((a) => (!q.subject_type || a.subject_type === q.subject_type) && (!q.action || a.action === q.action) && (!q.subject_id || a.subject_id === +q.subject_id)).slice(0, 300).map(lgAuditOut), actions: AUDIT_ACTIONS }); });
on('GET', '/admin/legal/acceptances', (db, _p, _b, q) => { needAdmin(db); const s = String(q.q || '').toLowerCase(); return ok({ items: db.legalAcc.filter((a) => !q.subject_type || a.subject_type === q.subject_type).filter((a) => !s || [a.ref_no, a.name, a.email, a.phone].some((v) => String(v || '').toLowerCase().includes(s))).reverse().slice(0, 200).map((a) => ({ ...lgView(db, a), subject_type: a.subject_type, subject_id: a.subject_id, name: a.name, email: a.email, phone: a.phone, ip: a.ip, user_agent: a.user_agent })) }); });
on('GET', '/admin/legal/acceptances/:id/pdf', async (db, { id }) => { needAdmin(db); const a = db.legalAcc.find((x) => x.id === +id); return a ? lgPdf(db, a) : fail(404, 'Not found'); });

// ---- one-time codes, cancel / returns / refunds, settlements, admin roles (demo; mirrors server) ----
function mOtpSend(db, purpose, target, data = null) {
  const o = (db.otps ||= {}); const k = `${purpose}:${target}`; const cur = o[k];
  if (cur && Date.now() - Date.parse(cur.sent_at) < 30e3) throw fail(429, `Please wait ${Math.ceil((30e3 - (Date.now() - Date.parse(cur.sent_at))) / 1000)} seconds before asking for a new code.`, { retry_after: 30 });
  const code = String(Math.floor(100000 + Math.random() * 900000));
  o[k] = { code, data, tries: 0, sent_at: nowIso(), expires_at: new Date(Date.now() + 10 * 6e4).toISOString(), ref: `OTP-${code.slice(0, 3)}X` };
  return { ref: o[k].ref, resend_in: 30, expires_in_min: 10, dev_otp: code };
}
function mOtpVerify(db, purpose, target, code, field = 'otp') {
  const bad = (m, st = 400) => fail(st, m, { fields: { [field]: m } });
  if (!/^\d{6}$/.test(String(code || ''))) throw bad('Enter the 6-digit code.');
  const k = `${purpose}:${target}`; const cur = (db.otps || {})[k];
  if (!cur) throw bad('Ask for a code first.');
  if (Date.parse(cur.expires_at) < Date.now()) throw bad('This code has expired. Ask for a new one.');
  if (cur.tries >= 5) throw bad('Too many wrong codes. Ask for a new one.', 429);
  if (cur.code !== String(code)) { cur.tries += 1; const left = 5 - cur.tries; throw bad(left > 0 ? `Wrong code. ${left} ${left === 1 ? 'try' : 'tries'} left.` : 'Too many wrong codes. Ask for a new one.', left > 0 ? 400 : 429); }
  delete db.otps[k];
  return { ref: cur.ref, data: cur.data };
}
const mask = (s) => (String(s).includes('@') ? String(s).replace(/^(.{2}).*(@.*)$/, '$1•••$2') : `******${String(s).slice(-4)}`);
on('POST', '/auth/register/otp', (db, _p, b) => {
  const india = /^india$/i.test(b.country || 'India'); const phone = india ? normalizeIndianPhone(b.phone || '') : String(b.phone || '');
  if (!/^\S+@\S+\.\S+$/.test(b.email || '')) return fail(400, 'Please check the highlighted fields.', { fields: { email: 'Enter a valid email' } });
  if (india ? !/^[6-9]\d{9}$/.test(phone) : phone.length < 7) return fail(400, 'Please check the highlighted fields.', { fields: { phone: 'Enter a valid 10-digit Indian mobile number' } });
  if (db.users.some((u) => u.email.toLowerCase() === b.email.toLowerCase())) return fail(409, 'An account with this email already exists.', { fields: { email: 'Already registered — sign in instead' } });
  if (db.users.some((u) => u.is_active !== false && digits(u.phone) === digits(phone))) return fail(409, 'This mobile number is already registered.', { fields: { phone: 'Already registered — sign in instead' } });
  return ok({ ok: true, ...mOtpSend(db, 'signup', digits(phone), { email: b.email.toLowerCase() }), sent_to: `${mask(phone)} and ${mask(b.email)}` });
});
on('POST', '/auth/password/forgot', (db, _p, b) => {
  const u = db.users.find((x) => x.email.toLowerCase() === String(b.email || '').toLowerCase() && x.is_active !== false);
  const out = u ? mOtpSend(db, 'reset_user', `user:${u.id}`) : {};
  return ok({ ok: true, message: 'If an account exists for this email, we have sent a 6-digit code to its email and mobile.', resend_in: 30, ...(out.dev_otp ? { dev_otp: out.dev_otp } : {}) });
});
on('POST', '/auth/password/reset', (db, _p, b) => {
  const u = db.users.find((x) => x.email.toLowerCase() === String(b.email || '').toLowerCase());
  if (!u) return fail(400, 'This code is not valid. Ask for a new one.', { fields: { otp: 'Ask for a new code' } });
  if (b.password !== b.confirm_password) return fail(400, 'Please check the highlighted fields.', { fields: { confirm_password: 'Passwords do not match' } });
  const weak = passwordProblem(b.password, { email: u.email, name: u.name }); if (weak) return fail(400, 'Please check the highlighted fields.', { fields: { password: weak } });
  mOtpVerify(db, 'reset_user', `user:${u.id}`, b.otp);
  u.pw = b.password; if (db.session === u.id) db.session = null; if (db.locks) delete db.locks[`user:${u.email.toLowerCase()}`];
  secEv(db, 'password_reset', `user:${u.id}`); return ok({ ok: true });
});
on('POST', '/account/email/otp', (db, _p, b) => {
  const u = needUser(db);
  if (b.password !== u.pw) return fail(400, 'Please check the highlighted fields.', { fields: { password: 'Password is incorrect' } });
  if (!/^\S+@\S+\.\S+$/.test(b.email || '')) return fail(400, 'Please check the highlighted fields.', { fields: { email: 'Enter a valid email' } });
  if (b.email.toLowerCase() === u.email.toLowerCase()) return fail(400, 'This is already your email.', { fields: { email: 'Same as now' } });
  if (db.users.some((x) => x.email.toLowerCase() === b.email.toLowerCase())) return fail(409, 'This email is used by another account.', { fields: { email: 'Used by another account' } });
  return ok({ ok: true, ...mOtpSend(db, 'email_change', `user:${u.id}`, { email: b.email }), sent_to: mask(b.email) });
});
on('POST', '/account/email', (db, _p, b) => { const u = needUser(db); const v = mOtpVerify(db, 'email_change', `user:${u.id}`, b.otp); u.email = v.data.email; return ok({ user: pubUser(u) }); });

const mQtyIn = (db, pid, statuses) => db.orders.filter((o) => statuses.includes(o.status)).reduce((s, o) => s + o.items.filter((i) => i.product_id === pid).reduce((a, i) => a + i.qty, 0), 0);
const mRefLeft = (db, o) => o.totals.total - (db.refunds || []).filter((f) => f.order_id === o.id).reduce((s, f) => s + f.amount, 0);
function mOpenRefund(db, o, kind, amount, returnId = null) {
  const left = mRefLeft(db, o); if (left <= 0) throw fail(409, 'Everything paid for this order has already been refunded.');
  const f = { id: ++db.seq.id, order_id: o.id, return_id: returnId, kind, amount: Math.min(amount, left), status: 'pending', reference: null, method: null, failure_reason: null, created_at: nowIso(), processed_at: null };
  (db.refunds ||= []).push(f); o.events.push({ status: 'refund_pending', note: `Refund of ₹${(f.amount / 100).toFixed(2)} opened (${kind})`, created_at: nowIso() }); return f;
}
function mCancelCheck(db, o) {
  if (o.status === 'cancelled') return { ok: false, reason: 'This order is already cancelled.' };
  if (!['placed', 'payment_confirmed'].includes(o.status)) return { ok: false, reason: 'This order is already being packed or on its way, so it cannot be cancelled here. You can refuse the delivery or request a return.' };
  const cur = mCurrent(db, o.id); if (cur && !['sent', 'accepted'].includes(cur.status)) return { ok: false, reason: 'Your order has been packed, so it cannot be cancelled here. You can refuse the delivery or request a return.' };
  return { ok: true };
}
function mCancel(db, o, { by = 'admin', reason = '', note = '' } = {}) {
  if (by === 'customer') { const c = mCancelCheck(db, o); if (!c.ok) throw fail(409, c.reason); }
  for (const i of o.items) adjustStock(db, i.product_id, i.qty);
  o.status = 'cancelled'; mSync(db, o, 'cancel');
  const paid = o.payment_status === 'confirmed';
  if (paid) mOpenRefund(db, o, 'cancellation', mRefLeft(db, o));
  o.events.push({ status: 'cancelled', note: [by === 'customer' ? 'Cancelled by customer' : 'Cancelled by the store', reason, note, paid ? 'refund due' : ''].filter(Boolean).join(' — '), created_at: nowIso() });
}
function mDeliveredAt(o) { return [...o.events].reverse().find((e) => e.status === 'delivered')?.created_at || null; }
function mReturnable(db, o) {
  const at = mDeliveredAt(o); const age = at ? Date.now() - Date.parse(at) : null;
  const used = new Map(); for (const r of (db.returns || []).filter((x) => x.order_id === o.id && !['rejected', 'cancelled'].includes(x.status))) for (const i of r.items) used.set(i.order_item_id, (used.get(i.order_item_id) || 0) + i.qty);
  return { delivered_at: at, window_days: 7, damage_hours: 48, window_ends: at ? new Date(Date.parse(at) + 7 * 864e5).toISOString() : null,
    can_return: o.status === 'delivered' && age != null && age <= 7 * 864e5, can_report_damage: o.status === 'delivered' && age != null && age <= 48 * 36e5,
    items: o.items.map((i, k) => ({ order_item_id: k + 1, product_id: i.product_id, name: i.name, qty: i.qty, left: Math.max(0, i.qty - (used.get(k + 1) || 0)) })) };
}
function mReturnView(db, r, admin = false) {
  const o = db.orders.find((x) => x.id === r.order_id) || {}; const f = (db.refunds || []).find((x) => x.return_id === r.id) || null;
  return { id: r.id, number: r.number, order_number: o.order_number, status: r.status, reason: r.reason, reason_label: RETURN_REASONS[r.reason]?.label, details: r.details, items: r.items, refund_amount: r.refund_amount, includes_delivery: !!r.includes_delivery, has_photo: !!r.photo,
    admin_note: r.admin_note, created_at: r.created_at, decided_at: r.decided_at, received_at: r.received_at, refunded_at: r.refunded_at, refund: f, ...(admin ? { order_id: r.order_id, customer: { name: o.customer?.name, phone: o.customer?.phone }, restocked: !!r.restocked } : {}) };
}
function mAfterSales(db, o) {
  const c = mCancelCheck(db, o);
  return { can_cancel: c.ok, cancel_note: c.ok ? 'You can cancel free of charge until the order is packed.' : c.reason,
    returns: (db.returns || []).filter((r) => r.order_id === o.id).reverse().map((r) => mReturnView(db, r)),
    refunds: (db.refunds || []).filter((f) => f.order_id === o.id).map((f) => ({ id: f.id, kind: f.kind, amount: f.amount, status: f.status, reference: f.status === 'processed' ? f.reference : null, processed_at: f.processed_at, created_at: f.created_at })),
    returnable: o.status === 'delivered' ? mReturnable(db, o) : null };
}
function mRefundAction(db, f, action, { reference, method, reason } = {}) {
  const o = db.orders.find((x) => x.id === f.order_id);
  if (action === 'process') {
    if (f.status === 'processed') throw fail(409, 'This refund is already marked as paid.');
    if (!reference || reference.length < 4) throw fail(400, 'Enter the refund reference (UTR / gateway refund ID).', { fields: { reference: 'Required' } });
    if ((db.refunds || []).some((x) => x !== f && x.status === 'processed' && x.reference === reference)) throw fail(409, 'This reference is already used for another refund.', { fields: { reference: 'Already used' } });
    Object.assign(f, { status: 'processed', reference, method: method || 'original', processed_at: nowIso(), failure_reason: null });
    const total = db.refunds.filter((x) => x.order_id === o.id && x.status === 'processed').reduce((s, x) => s + x.amount, 0);
    if (total >= o.totals.total) { o.payment_status = 'refunded'; o.payment.status = 'refunded'; }
    if (f.return_id) { const r = db.returns.find((x) => x.id === f.return_id); if (r) Object.assign(r, { status: 'refunded', refunded_at: nowIso() }); }
    o.events.push({ status: 'refunded', note: `₹${(f.amount / 100).toFixed(2)} refunded · ref ${reference}`, created_at: nowIso() });
  } else if (action === 'fail') {
    if (f.status === 'processed') throw fail(409, 'This refund is already paid.');
    if (!reason) throw fail(400, 'Write why the refund failed.', { fields: { reason: 'Required' } });
    Object.assign(f, { status: 'failed', failure_reason: reason }); o.events.push({ status: 'refund_failed', note: reason, created_at: nowIso() });
  } else throw fail(400, 'Unknown action.');
  return f;
}
on('POST', '/orders/:n/cancel', (db, { n }, b, _q, h) => {
  const o = findOrder(db, n, h); if (!b?.reason || String(b.reason).trim().length < 3) return fail(400, 'Tell us why you are cancelling', { fields: { reason: 'Tell us why you are cancelling' } });
  mCancel(db, o, { by: 'customer', reason: b.reason }); return ok(detail(o));
});
on('POST', '/orders/:n/returns', async (db, { n }, body, _q, h) => {
  const b = formObj(body); const o = findOrder(db, n, { ...h, 'X-Order-Token': h['X-Order-Token'] || b.token });
  let items = b.items; if (typeof items === 'string') { try { items = JSON.parse(items); } catch { items = []; } }
  const R0 = RETURN_REASONS[b.reason]; if (!R0) return fail(400, 'Choose a reason.', { fields: { reason: 'Choose a reason' } });
  if (o.status !== 'delivered') return fail(409, 'You can request a return after the order is delivered.');
  if (o.payment_status !== 'confirmed') return fail(409, 'This order has no confirmed payment to refund. Please contact support.');
  const R = mReturnable(db, o);
  if (R0.damage ? !R.can_report_damage && !R.can_return : !R.can_return) return fail(409, R0.damage ? 'Damaged, wrong or missing items must be reported within 48 hours of delivery. Please contact support.' : 'The return window (7 days from delivery) has ended.');
  const chosen = [];
  for (const it of items || []) {
    const r = R.items.find((x) => x.order_item_id === Number(it.order_item_id)); const qty = Number(it.qty);
    if (!r) return fail(400, 'One of the items is not in this order.'); if (!(qty >= 1)) return fail(400, 'Choose how many pieces to return.'); if (qty > r.left) return fail(409, `You can return at most ${r.left} of “${r.name}”.`);
    const line = o.items[r.order_item_id - 1]; chosen.push({ order_item_id: r.order_item_id, product_id: line.product_id, name: line.name, qty, paid: Math.round(((line.line_total - (line.discount_share || 0)) * qty) / line.qty) });
  }
  if (!chosen.length) return fail(400, 'Choose at least one item to return.', { fields: { items: 'Choose an item' } });
  const photo = body instanceof FormData && body.get('photo') instanceof Blob && body.get('photo').size ? await fileToDataUrl(body.get('photo')) : null;
  if (R0.photo && !photo) return fail(400, 'Please add a photo of the item and the box.', { fields: { photo: 'Photo needed' } });
  const open = (db.returns || []).find((x) => x.order_id === o.id && x.status === 'requested'); if (open) return fail(409, `You already have an open return request (${open.number}) for this order. We will reply soon.`);
  const dAlready = (db.returns || []).some((x) => x.order_id === o.id && x.includes_delivery && !['rejected', 'cancelled'].includes(x.status));
  const amt = returnRefundAmount({ items: chosen, reason: b.reason, deliveryFee: o.totals.delivery, deliveryAlreadyRefunded: dAlready });
  const r = { id: ++db.seq.id, number: `RET-${1000 + (db.returns || []).length + 1}`, order_id: o.id, user_id: me(db)?.id || null, items: chosen, reason: b.reason, details: b.details || '', photo, status: 'requested', refund_amount: amt.total, includes_delivery: amt.delivery > 0, created_at: nowIso() };
  (db.returns ||= []).push(r); o.events.push({ status: 'return_requested', note: `${r.number}: ${R0.label}`, created_at: nowIso() });
  return ok({ return: mReturnView(db, r), order: detail(o) }, 201);
});
const needRole = (db, action, msg) => { needAdmin(db); if (!roleCan(db.admin.role, action) && db.admin.role !== 'owner') throw fail(403, msg || 'Your role cannot do this.'); };
on('GET', '/admin/returns', (db, _p, _b, q) => { needAdmin(db); const all = db.returns || []; const counts = {}; for (const r of all) counts[r.status] = (counts[r.status] || 0) + 1; return ok({ items: all.filter((r) => !q.status || r.status === q.status).slice().reverse().map((r) => mReturnView(db, r, true)), counts }); });
on('GET', '/admin/returns/:id', (db, { id }) => { needAdmin(db); const r = (db.returns || []).find((x) => x.id === +id); return r ? ok(mReturnView(db, r, true)) : fail(404, 'Return not found.'); });
on('POST', '/admin/returns/:id/action', (db, { id }, b) => {
  needRole(db, 'approve_return', 'Your role cannot decide returns.'); const r = (db.returns || []).find((x) => x.id === +id); if (!r) return fail(404, 'Return not found.');
  const o = db.orders.find((x) => x.id === r.order_id); const t = nowIso(); const need = (c, m) => { if (!c) throw fail(409, m); };
  if (b.action === 'approve') { need(r.status === 'requested', 'Only new requests can be approved.'); if (b.amount != null) { const a = Math.round(Number(b.amount) * 100); need(a > 0 && a <= r.refund_amount, 'The refund can be lowered but not raised above the calculated amount.'); r.refund_amount = a; } Object.assign(r, { status: 'approved', decided_at: t, admin_note: b.note || r.admin_note }); o.events.push({ status: 'return_approved', note: `${r.number} approved`, created_at: t }); }
  else if (b.action === 'reject') { need(r.status === 'requested', 'Only new requests can be rejected.'); need(b.note && b.note.length >= 5, 'Write the reason the customer will see.'); Object.assign(r, { status: 'rejected', decided_at: t, admin_note: b.note }); o.events.push({ status: 'return_rejected', note: `${r.number}: ${b.note}`, created_at: t }); }
  else if (b.action === 'receive') { need(r.status === 'approved', 'Approve the return before marking it received.'); if (b.restock !== false) for (const i of r.items) adjustStock(db, i.product_id, i.qty); Object.assign(r, { status: 'received', received_at: t, restocked: b.restock !== false }); o.events.push({ status: 'return_received', note: r.number, created_at: t }); mOpenRefund(db, o, 'return', r.refund_amount, r.id); }
  else if (b.action === 'cancel') { need(['requested', 'approved'].includes(r.status), 'This return can no longer be cancelled.'); r.status = 'cancelled'; }
  else return fail(400, 'Unknown action.');
  audit(db, `return_${b.action}`, 'return', r.number); return ok(mReturnView(db, r, true));
});
on('GET', '/admin/refunds', (db, _p, _b, q) => {
  needAdmin(db); const all = db.refunds || []; const summary = {}; for (const f of all) { summary[f.status] ||= { n: 0, amount: 0 }; summary[f.status].n += 1; summary[f.status].amount += f.amount; }
  return ok({ summary, items: all.filter((f) => !q.status || f.status === q.status).slice().reverse().map((f) => { const o = db.orders.find((x) => x.id === f.order_id) || {}; return { ...f, order_number: o.order_number, customer_name: o.customer?.name, order_total: o.totals?.total, return_number: f.return_id ? db.returns.find((r) => r.id === f.return_id)?.number : null }; }) });
});
on('POST', '/admin/refunds/:id/action', (db, { id }, b) => { needRole(db, 'refund', 'Only the owner or Finance can mark refunds.'); const f = (db.refunds || []).find((x) => x.id === +id); if (!f) return fail(404, 'Refund not found.'); mRefundAction(db, f, b.action, b); audit(db, `refund_${b.action}`, 'refund', f.id); return ok(f); });

// settlements
function mDue(db, dealerId) {
  const d = mDealer(db, dealerId); if (!d) throw fail(404, 'Dealer not found.'); const c = { ...DEFAULT_COMMERCIAL, ...(d.commercial || {}) };
  const active = (db.settleItems || []).filter((i) => i.active);
  const price = (pid) => { const r = db.dealerProducts.find((x) => x.dealer_id === dealerId && x.product_id === pid); return r ? r.approved_dealer_price || r.dealer_price : 0; };
  const val = (o, only) => o.items.reduce((s, l, k) => { const q = only ? only.get(k + 1) || 0 : l.qty; if (!q) return s; return s + (c.model === 'commission' ? Math.round(((l.line_total - (l.discount_share || 0)) * q) / l.qty) : (l.unit_cost > 0 ? l.unit_cost : price(l.product_id)) * q); }, 0);
  const sales = db.dealerOrders.filter((r) => r.dealer_id === dealerId && r.status === 'delivered' && !active.some((i) => i.kind === 'sale' && i.ref_id === r.id)).map((r) => { const o = db.orders.find((x) => x.id === r.order_id); return o && o.status !== 'cancelled' ? { ref: r.id, order_number: o.order_number, delivered_at: r.delivered_at, value: val(o) } : null; }).filter(Boolean);
  const returns = (db.returns || []).filter((r) => ['received', 'refunded'].includes(r.status) && db.dealerOrders.some((x) => x.order_id === r.order_id && x.dealer_id === dealerId && x.status === 'delivered') && !active.some((i) => i.kind === 'return' && i.ref_id === r.id))
    .map((r) => { const o = db.orders.find((x) => x.id === r.order_id); return { ref: r.id, number: r.number, order_number: o.order_number, value: val(o, new Map(r.items.map((i) => [i.order_item_id, i.qty]))) }; });
  return { d, c, sales, returns };
}
function mPreview(db, dealerId, adjustments = []) {
  const { d, c, sales, returns } = mDue(db, dealerId); const totals = computeSettlement({ model: c.model, sales, returns, adjustments, terms: c });
  return { dealer_id: d.id, business_name: d.business_name, bank: d.bank_last4 ? `${d.bank_name || 'Bank'} ••••${d.bank_last4}` : null, model: c.model, settlement_days: c.settlement_days, sales, returns, adjustments, totals, warnings: d.bank_last4 ? [] : ['No bank account on file for this dealer.'] };
}
const mSetView = (db, s, items = true) => ({ ...s, utr: s.status === 'paid' ? s.utr : null, commission: s.breakdown.commission || 0, platform_fees: s.breakdown.platform_fees || 0, payment_fees: s.breakdown.payment_fees || 0, adjustments_total: s.breakdown.adjustments || 0, ...(items ? { items: (db.settleItems || []).filter((i) => i.settlement_id === s.id).map((i) => ({ kind: i.kind, label: i.label, amount: i.amount })) } : {}) });
on('GET', '/admin/settlements', (db) => {
  needAdmin(db);
  const due = db.dealers.filter((d) => d.is_active).map((d) => { const p = mPreview(db, d.id); return { dealer_id: d.id, business_name: d.business_name, orders: p.totals.orders, returns: p.returns.length, net: p.totals.net, bank: p.bank }; }).filter((x) => x.orders || x.returns);
  return ok({ items: (db.settlements || []).slice().reverse().map((s) => ({ ...mSetView(db, s, false), business_name: mDealer(db, s.dealer_id)?.business_name })), due });
});
on('GET', '/admin/settlements/preview', (db, _p, _b, q) => { needAdmin(db); let adj = []; try { adj = JSON.parse(q.adjustments || '[]'); } catch { adj = []; } return ok(mPreview(db, +q.dealer_id, adj)); });
on('POST', '/admin/settlements', (db, _p, b) => {
  needRole(db, 'settle_pay', 'Only the owner or Finance can create settlements.');
  const adjustments = (b.adjustments || []).filter((a) => a.label && Number(a.amount)).map((a) => ({ label: a.label, amount: Math.round(Number(a.amount) * 100) }));
  const p = mPreview(db, +b.dealer_id, adjustments);
  if (!p.sales.length && !p.returns.length && !adjustments.length) return fail(409, 'Nothing is due to this dealer right now.');
  if (p.totals.net <= 0) return fail(409, 'The net amount is zero or less. Nothing can be paid now — returns or adjustments are carried to the next settlement.');
  if (b.expect_net != null && Math.round(b.expect_net * 100) !== p.totals.net) return fail(409, 'The amount due changed while you were looking. Please check the new amount.');
  const s = { id: ++db.seq.id, number: `STL-${1001 + (db.settlements || []).length}`, dealer_id: +b.dealer_id, model: p.model, orders: p.totals.orders, gross: p.totals.gross, returns: p.totals.returns, fees: p.totals.fees, breakdown: p.totals, adjustments, net: p.totals.net, status: 'processing', note: b.note || null, created_at: nowIso() };
  (db.settlements ||= []).push(s); db.settleItems ||= [];
  for (const x of p.sales) db.settleItems.push({ settlement_id: s.id, kind: 'sale', ref_id: x.ref, label: x.order_number, amount: x.value, active: true });
  for (const x of p.returns) db.settleItems.push({ settlement_id: s.id, kind: 'return', ref_id: x.ref, label: `${x.number} (${x.order_number})`, amount: -x.value, active: true });
  audit(db, 'settlement_created', 'settlement', s.number); return ok(mSetView(db, s), 201);
});
on('GET', '/admin/settlements/:id', (db, { id }) => { needAdmin(db); const s = (db.settlements || []).find((x) => x.id === +id); return s ? ok({ ...mSetView(db, s), business_name: mDealer(db, s.dealer_id)?.business_name }) : fail(404, 'Settlement not found.'); });
on('POST', '/admin/settlements/:id/action', (db, { id }, b) => {
  needRole(db, 'settle_pay', 'Only the owner or Finance can do this.'); const s = (db.settlements || []).find((x) => x.id === +id); if (!s) return fail(404, 'Settlement not found.');
  if (b.action === 'pay') { if (s.status !== 'processing') return fail(409, s.status === 'paid' ? 'This settlement is already paid.' : 'Cancelled settlements cannot be paid.'); if (!/^[A-Za-z0-9-]{6,30}$/.test(b.utr || '')) return fail(400, 'Enter the bank UTR / reference.', { fields: { utr: 'Required' } }); if (db.settlements.some((x) => x !== s && x.status === 'paid' && x.utr === b.utr)) return fail(409, 'This UTR is already used for another settlement.'); Object.assign(s, { status: 'paid', utr: b.utr, paid_on: nowIso().slice(0, 10) }); }
  else if (b.action === 'cancel') { if (s.status !== 'processing') return fail(409, 'Only processing settlements can be cancelled.'); s.status = 'cancelled'; for (const i of db.settleItems) if (i.settlement_id === s.id) i.active = false; }
  else return fail(400, 'Unknown action.');
  audit(db, `settlement_${b.action}`, 'settlement', s.number); return ok(mSetView(db, s));
});
on('GET', '/dealer/payments', (db) => {
  const d = needDealer(db); dealerReady(d); const p = mPreview(db, d.id); const rows = (db.settlements || []).filter((s) => s.dealer_id === d.id).slice().reverse(); const paid = rows.filter((s) => s.status === 'paid');
  const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);
  return ok({ model: p.model, settlement_days: p.settlement_days, bank: p.bank,
    due: { orders: p.totals.orders, gross: p.totals.gross, returns: p.totals.returns, fees: p.totals.fees, net: p.totals.net, items: [...p.sales.map((x) => ({ kind: 'sale', label: x.order_number, amount: x.value, at: x.delivered_at })), ...p.returns.map((x) => ({ kind: 'return', label: `${x.number} (${x.order_number})`, amount: -x.value }))] },
    totals: { paid: sum(paid, (x) => x.net), processing: sum(rows.filter((x) => x.status === 'processing'), (x) => x.net), gross: sum(paid, (x) => x.gross), returns: sum(paid, (x) => x.returns), fees: sum(paid, (x) => x.fees), adjustments: sum(paid, (x) => x.breakdown.adjustments || 0) },
    settlements: rows.map((s) => mSetView(db, s)) });
});
on('POST', '/dealer/password/forgot', (db, _p, b) => {
  const d = db.dealers.find((x) => x.phone === digits(b.phone) && x.is_active); const out = d ? mOtpSend(db, 'reset_dealer', `dealer:${d.id}`) : {};
  return ok({ ok: true, message: 'If this number is registered, we have sent a 6-digit code to it.', resend_in: 30, ...(out.dev_otp ? { dev_otp: out.dev_otp } : {}) });
});
on('POST', '/dealer/password/reset', (db, _p, b) => {
  const d = db.dealers.find((x) => x.phone === digits(b.phone) && x.is_active); if (!d) return fail(400, 'This code is not valid. Ask for a new one.', { fields: { otp: 'Ask for a new code' } });
  if (b.password !== b.confirm_password) return fail(400, 'Passwords do not match.', { fields: { confirm_password: 'Passwords do not match' } });
  const weak = passwordProblem(b.password, { min: 8, email: d.email || '', name: d.name }); if (weak) return fail(400, weak, { fields: { password: weak } });
  mOtpVerify(db, 'reset_dealer', `dealer:${d.id}`, b.otp); d.password = b.password; d.must_change_password = false; if (db.dealerSession === d.id) db.dealerSession = null; return ok({ ok: true });
});
// admin users & roles
const mAdmins = (db) => (db.adminUsers ||= [{ id: 1, name: 'Store Owner', email: 'admin@utsavghar.in', role: 'owner', is_active: 1, totp_enabled: 0, must_change_password: 0, last_login_at: nowIso(), created_at: nowIso() }]);
on('GET', '/admin/admins', (db) => { needRole(db, 'manage_admins', 'Only the owner can manage admin users.'); return ok({ roles: ADMIN_ROLES, permissions: PERMISSIONS, actions: ACTIONS, items: mAdmins(db) }); });
on('POST', '/admin/admins', (db, _p, b) => {
  needRole(db, 'manage_admins', 'Only the owner can manage admin users.'); const f = {};
  if (!b.name || b.name.trim().length < 2) f.name = 'Enter the full name'; if (!/^\S+@\S+\.\S+$/.test(b.email || '')) f.email = 'Enter a valid email'; if (!ROLE_KEYS.includes(b.role)) f.role = 'Choose a role';
  if (Object.keys(f).length) return fail(400, 'Please check the highlighted fields.', { fields: f });
  if (mAdmins(db).some((a) => a.email.toLowerCase() === b.email.toLowerCase())) return fail(409, 'An admin with this email already exists.', { fields: { email: 'Already an admin' } });
  const a = { id: ++db.seq.id, name: b.name.trim(), email: b.email.trim(), role: b.role, is_active: 1, totp_enabled: 0, must_change_password: 1, last_login_at: null, created_at: nowIso() };
  db.adminUsers.push(a); audit(db, 'admin_created', 'admin', a.id); return ok({ admin: a, temporary_password: `Ug-${Math.random().toString(16).slice(2, 10)}-DEMO!` }, 201);
});
on('PUT', '/admin/admins/:id', (db, { id }, b) => {
  needRole(db, 'manage_admins', 'Only the owner can manage admin users.'); const a = mAdmins(db).find((x) => x.id === +id); if (!a) return fail(404, 'Admin not found.');
  if (a.id === db.admin.id && ((b.role && b.role !== a.role) || b.is_active === false)) return fail(400, 'You cannot change your own role or disable yourself. Ask another owner.');
  if (a.role === 'owner' && a.is_active && ((b.role && b.role !== 'owner') || b.is_active === false) && mAdmins(db).filter((x) => x.role === 'owner' && x.is_active).length <= 1) return fail(400, 'Keep at least one active owner.');
  if (b.role) a.role = b.role; if (b.is_active != null) a.is_active = b.is_active ? 1 : 0; if (b.name) a.name = b.name; audit(db, 'admin_updated', 'admin', a.id); return ok({ admin: a });
});
on('POST', '/admin/admins/:id/reset-password', (db, { id }) => { needRole(db, 'manage_admins', 'Only the owner can manage admin users.'); const a = mAdmins(db).find((x) => x.id === +id); if (!a) return fail(404, 'Admin not found.'); if (a.id === db.admin.id) return fail(400, 'Use Security → Change password for your own account.'); a.must_change_password = 1; return ok({ ok: true, temporary_password: `Ug-${Math.random().toString(16).slice(2, 10)}-DEMO!` }); });


export default {
  async handle(method, fullPath, body, headers = {}) {
    const db = load();
    const [path, qs] = fullPath.split('?');
    const query = Object.fromEntries(new URLSearchParams(qs || ''));
    await new Promise((r) => setTimeout(r, 120)); // feel like a network
    for (const r of routes) {
      if (r.method !== method) continue;
      const m = path.match(r.re);
      if (!m) continue;
      const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
      try {
        const res = await r.fn(db, params, body, query, headers);
        if (method !== 'GET') save();
        return res;
      } catch (e) {
        if (e && e.status) return e;
        console.error(e);
        return fail(500, 'Something went wrong.');
      }
    }
    return fail(404, 'Not found');
  },
  reset() { DB = seed(); save(); },
};
