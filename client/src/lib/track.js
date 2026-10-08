/**
 * Marketing tracking.
 *  - Attribution: UTM tags, Meta click id (fbclid) and landing page are saved on
 *    arrival (last non-empty source wins, kept 30 days) and sent with the order.
 *  - Meta Pixel and GA4 load only when their IDs are set in Admin → Marketing.
 *  - First-party events go to /api/events for the admin funnel (anonymous
 *    session id, no personal data).
 * Purchases are NOT sent from the browser: the server reports them via the
 * Conversions API / GA4 Measurement Protocol once payment is confirmed.
 */
import { api } from './api.js';

const ls = {
  get(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } },
};
const cookie = (name) => {
  const m = typeof document !== 'undefined' && document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : '';
};

let cfg = { pixel: '', ga4: '', country: 'IN' };
let loaded = false;

export function sessionId() {
  const s = ls.get('sa_sid');
  if (s && Date.now() - s.at < 30 * 60e3) { ls.set('sa_sid', { ...s, at: Date.now() }); return s.id; }
  const id = (crypto.randomUUID?.() || `${Date.now()}${Math.random()}`).replace(/[^A-Za-z0-9]/g, '').slice(0, 32);
  ls.set('sa_sid', { id, at: Date.now() });
  return id;
}

/** Call once on load: remember where this visitor came from. */
export function captureAttribution() {
  try {
    const url = new URL(window.location.href);
    // Hash-router previews carry params after the '#'
    const hashQ = url.hash.includes('?') ? new URLSearchParams(url.hash.split('?')[1]) : null;
    const get = (k) => url.searchParams.get(k) || hashQ?.get(k) || '';
    const next = {};
    for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid', 'gclid']) if (get(k)) next[k] = get(k).slice(0, 200);
    const prev = ls.get('sa_attr');
    const fresh = prev && Date.now() - prev.at < 30 * 864e5 ? prev : null;
    if (next.utm_source || next.fbclid || next.gclid || !fresh) {
      if (next.fbclid && !next.utm_source) next.utm_source = 'facebook';
      if (next.gclid && !next.utm_source) { next.utm_source = 'google'; next.utm_medium = next.utm_medium || 'cpc'; }
      if (!next.utm_source && document.referrer && !document.referrer.includes(location.host)) {
        const host = new URL(document.referrer).hostname.replace(/^www\.|^l\.|^lm\.|^m\./, '');
        next.utm_source = /instagram/.test(host) ? 'instagram' : /facebook/.test(host) ? 'facebook' : /google\./.test(host) ? 'google' : host;
        next.utm_medium = next.utm_medium || 'referral';
      }
      ls.set('sa_attr', { ...next, landing_page: `${location.pathname}${location.search}`.slice(0, 300), referrer: document.referrer.slice(0, 300), at: Date.now() });
    }
  } catch { /* ignore */ }
}

/** Attribution to attach to an order / checkout session. */
export function attribution() {
  const a = ls.get('sa_attr') || {};
  let fbc = cookie('_fbc');
  if (!fbc && a.fbclid) fbc = `fb.1.${a.at || Date.now()}.${a.fbclid}`;
  const ga = cookie('_ga'); // GA1.1.123.456 → 123.456
  return {
    utm_source: a.utm_source, utm_medium: a.utm_medium, utm_campaign: a.utm_campaign, utm_content: a.utm_content, utm_term: a.utm_term,
    fbclid: a.fbclid, fbp: cookie('_fbp') || undefined, fbc: fbc || undefined,
    ga_client_id: ga ? ga.split('.').slice(-2).join('.') : undefined,
    landing_page: a.landing_page, referrer: a.referrer,
    crm_code: (() => { const c = ls.get('ug_crm'); return c && Date.now() - c.at < 7 * 864e5 ? c.code : undefined; })(),
  };
}

function inject(src, text) {
  const s = document.createElement('script');
  if (src) { s.async = true; s.src = src; }
  if (text) s.text = text;
  document.head.appendChild(s);
}

/** Load Meta Pixel / GA4 once, if configured (never in the preview build). */
export function initTracking({ pixel = '', ga4 = '', country = 'IN' } = {}) {
  cfg = { pixel, ga4, country };
  if (loaded || __DEMO__) return;
  loaded = true;
  if (pixel && /^\d+$/.test(pixel)) {
    inject(null, `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${pixel}');`);
  }
  if (ga4 && /^G-[A-Z0-9]+$/.test(ga4)) {
    inject(`https://www.googletagmanager.com/gtag/js?id=${ga4}`);
    inject(null, `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}window.gtag=gtag;gtag('js',new Date());gtag('config','${ga4}',{send_page_view:false});`);
  }
}
export const setTrackingCountry = (c) => { cfg.country = c; };

const META = { page_view: 'PageView', view_item: 'ViewContent', add_to_cart: 'AddToCart', begin_checkout: 'InitiateCheckout', add_payment_info: 'AddPaymentInfo' };

/**
 * @param {'page_view'|'view_item'|'add_to_cart'|'begin_checkout'|'add_payment_info'} type
 * @param {{productId?:number, name?:string, value?:number (paise), items?:{id:number, qty:number, price:number}[], orderNumber?:string}} [d]
 */
export function track(type, d = {}) {
  try {
    const value = d.value != null ? d.value / 100 : undefined;
    const ids = d.items ? d.items.map((i) => String(i.id)) : d.productId ? [String(d.productId)] : undefined;
    if (window.fbq && META[type]) {
      const params = type === 'page_view' ? undefined : { content_type: 'product', content_ids: ids, value, currency: 'INR', content_name: d.name };
      window.fbq('track', META[type], params, d.orderNumber ? { eventID: `${type}-${d.orderNumber}` } : undefined);
    }
    if (window.gtag) {
      if (type === 'page_view') window.gtag('event', 'page_view', { page_location: location.href, page_title: document.title });
      else window.gtag('event', type, { currency: 'INR', value, items: (d.items || (d.productId ? [{ id: d.productId, qty: 1, price: d.value }] : [])).map((i) => ({ item_id: String(i.id), item_name: i.name || d.name, quantity: i.qty, price: i.price != null ? i.price / 100 : undefined })) });
    }
    const a = ls.get('sa_attr') || {};
    api.post('/events', {
      type, sessionId: sessionId(), productId: d.productId, value: d.value != null ? Math.round(d.value) : undefined,
      country: cfg.country, utm_source: a.utm_source, utm_medium: a.utm_medium, utm_campaign: a.utm_campaign,
    }).catch(() => {});
  } catch { /* tracking must never break the store */ }
}
