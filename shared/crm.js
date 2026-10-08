/**
 * Customer messages: personalised picks (daily / weekly) and festival alerts,
 * rendered for email and WhatsApp. Pure functions shared by the server and the demo.
 *
 * Rules built in:
 *  - Only people who opted in are messaged (see subscribers table), and every
 *    message carries a one-tap "stop" / preferences link.
 *  - Frequency is the customer's choice: daily, weekly, or festival alerts only.
 *  - WhatsApp is capped per week (admin setting) because Meta limits marketing
 *    messages and blocks numbers that customers report as spam.
 *  - Products sent in the last 7 days are not repeated.
 */
import { forYou } from './recommend.js';
import { SEGMENTS } from './festivals.js';

export const FREQUENCIES = [
  { value: 'daily', label: 'Daily deals & picks' },
  { value: 'weekly', label: 'Weekly picks' },
  { value: 'festivals', label: 'Only festival alerts' },
];

/**
 * Festival calendar (admin can edit it). `categories` are category slugs whose
 * products are suggested in the alert; `collection: true` uses the products
 * ticked "In the festival collection". Dates from 2027 are approximate — check
 * them against a panchang in Admin → Messages → Festival calendar.
 */
export const DEFAULT_CALENDAR = [
  { major: true, slug: 'navratri', name: 'Navratri', emoji: '🪔', date: '2026-10-11', categories: ['pooja-essentials', 'diyas-candles', 'flowers-rangoli', 'spiritual-decor'] },
  { slug: 'dussehra', name: 'Dussehra', emoji: '🏹', date: '2026-10-20', categories: ['pooja-essentials', 'door-wall-decor', 'diwali-gifts'] },
  { slug: 'karwa-chauth', name: 'Karwa Chauth', emoji: '🌙', date: '2026-10-28', categories: ['pooja-essentials', 'diyas-candles', 'diwali-gifts'] },
  { slug: 'dhanteras', name: 'Dhanteras', emoji: '🪙', date: '2026-11-06', categories: ['pooja-essentials', 'serveware', 'cookware', 'spiritual-decor'] },
  { major: true, slug: 'diwali', name: 'Diwali', emoji: '🪔', date: '2026-11-08', collection: true },
  { slug: 'bhai-dooj', name: 'Bhai Dooj', emoji: '🎁', date: '2026-11-10', categories: ['diwali-gifts', 'pooja-essentials'] },
  { slug: 'chhath', name: 'Chhath Puja', emoji: '🌅', date: '2026-11-15', categories: ['pooja-essentials', 'diyas-candles'] },
  { major: true, slug: 'christmas', name: 'Christmas', emoji: '🎄', date: '2026-12-25', categories: ['christmas-decor', 'diwali-lights', 'diwali-gifts', 'drinkware'] },
  { slug: 'new-year', name: "New Year's Eve", emoji: '🎉', date: '2026-12-31', categories: ['party-decor', 'diwali-lights', 'drinkware', 'serveware'] },
  { slug: 'lohri-sankranti', name: 'Lohri & Makar Sankranti', emoji: '🪁', date: '2027-01-13', categories: ['pooja-essentials', 'serveware', 'diwali-gifts'] },
  { major: true, slug: 'holi', name: 'Holi', emoji: '🎨', date: '2027-03-22', categories: ['holi-colours', 'serveware', 'drinkware', 'party-decor'], verify: true },
  { major: true, slug: 'raksha-bandhan', name: 'Raksha Bandhan', emoji: '🧵', date: '2027-08-17', categories: ['rakhi', 'diwali-gifts'], verify: true },
  { slug: 'ganesh-chaturthi', name: 'Ganesh Chaturthi', emoji: '🐘', date: '2027-09-04', categories: ['pooja-essentials', 'flowers-rangoli', 'spiritual-decor'], verify: true },
  { major: true, slug: 'diwali-2027', name: 'Diwali', emoji: '🪔', date: '2027-10-28', collection: true, verify: true },
];

/** Alerts go out this many days before a festival (in time for delivery): big festivals get three, others one. */
export const ALERT_DAYS = [21, 10, 5];
export const MINOR_ALERT_DAYS = [7];
const stagesOf = (f) => f.alert_days || (f.major ? ALERT_DAYS : MINOR_ALERT_DAYS);
const STAGE_COPY = {
  21: (f) => ({ subject: `${f.emoji} ${f.name} is 3 weeks away — plan early and save`, intro: `${f.name} is on ${fmtDate(f.date)}. Here are this year's favourites, section by section, so you can shop calmly before the rush.` }),
  7: (f) => ({ subject: `${f.emoji} ${f.name} is next week — everything you need`, intro: `${f.name} is on ${fmtDate(f.date)}. Order in the next few days for delivery in time.` }),
  10: (f) => ({ subject: `${f.emoji} 10 days to ${f.name}: your shopping list is ready`, intro: `${f.name} is on ${fmtDate(f.date)}. We've picked what customers are buying most, grouped by section.` }),
  5: (f) => ({ subject: `${f.emoji} Last days to get it before ${f.name}`, intro: `Order in the next 1–2 days for delivery before ${f.name} (${fmtDate(f.date)}).` }),
};

// ---------- dates (IST) ----------
const IST = 5.5 * 36e5;
export const istDay = (t = Date.now()) => new Date(new Date(t).getTime() + IST).toISOString().slice(0, 10);
const dayNum = (iso) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / 864e5);
export const daysUntil = (dateIso, now = Date.now()) => dayNum(dateIso) - dayNum(istDay(now));
function fmtDate(iso) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

/** The festival alert due today, if any: {festival, stage, daysLeft}. */
export function festivalAlertDue(calendar = DEFAULT_CALENDAR, now = Date.now()) {
  // If two alerts fall on the same day, the bigger / nearer festival wins (one message a day at most).
  const due = calendar.filter((f) => f.enabled !== false).map((f) => ({ f, d: daysUntil(f.date, now) }))
    .filter(({ f, d }) => stagesOf(f).includes(d)).sort((a, b) => (b.f.major ? 1 : 0) - (a.f.major ? 1 : 0) || a.d - b.d);
  return due[0] ? { festival: due[0].f, stage: due[0].d, daysLeft: due[0].d } : null;
}
/** Upcoming festivals (next 120 days) with the dates their alerts will go out. */
export function upcoming(calendar = DEFAULT_CALENDAR, now = Date.now()) {
  return calendar
    .map((f) => ({ ...f, daysLeft: daysUntil(f.date, now) }))
    .filter((f) => f.daysLeft >= 0 && f.daysLeft <= 120)
    .sort((a, b) => a.daysLeft - b.daysLeft)
    .map((f) => ({ ...f, alerts: stagesOf(f).map((d) => ({ days: d, on: istDay(Date.parse(`${f.date}T06:30:00Z`) - d * 864e5) })).filter((a) => a.on >= istDay(now)) }));
}

/** Is a picks message due for this subscriber today? */
export function digestDue(sub, now = Date.now()) {
  if (sub.status !== 'active') return false;
  if (!sub.email_opt_in && !sub.whatsapp_opt_in) return false;
  const last = sub.last_digest_at ? Date.parse(sub.last_digest_at) : 0;
  if (sub.frequency === 'daily') return istDay(last) !== istDay(now);
  if (sub.frequency === 'weekly') return now - last >= 6.5 * 864e5;
  return false;
}

// ---------- picks ----------
const available = (p) => p && p.is_active !== false && p.stock_status !== 'out_of_stock' && !(typeof p.stock === 'number' && p.stock <= 0);

/** Up to `limit` products for this person: their browsing, cart, wishlist, orders and chosen interests; no repeats from the last week; max 2 per category. */
export function personalPicks({ products, sub, signals = {}, bought = [], sessions = [], i2i, recentSent = [], limit = 4 }) {
  const interests = new Set(sub.interests || []);
  const skip = new Set([...recentSent, ...bought].map(Number));
  const list = forYou({ products, viewed: signals.viewed || [], cart: signals.cart || [], wish: signals.wish || [], bought, sessions, i2i, limit: 80 });
  const out = [];
  const perCat = new Map();
  const take = (p) => {
    if (out.includes(p) || skip.has(p.id) || !available(p) || (p.is_bundle && out.some((x) => x.is_bundle))) return;
    if ((perCat.get(p.category_id) || 0) >= 2) return;
    perCat.set(p.category_id, (perCat.get(p.category_id) || 0) + 1);
    out.push(p);
  };
  // At least half the picks come from the sections they said they like; the rest follow their browsing.
  if (interests.size) for (const p of list) { if (out.length >= Math.ceil(limit / 2)) break; if (interests.has(p.segment)) take(p); }
  for (const p of list) { if (out.length >= limit) break; take(p); }
  const rankOf = new Map(list.map((p, i) => [p.id, i]));
  return out.sort((x, y) => rankOf.get(x.id) - rankOf.get(y.id));
}

/** Festival products grouped by section ("category-wise"), best first; the person's interests come first. */
export function festivalSections({ products, festival, sub, recentSent = [], perSection = 2, maxSections = 3 }) {
  const cats = new Set(festival.categories || []);
  const pool = products.filter((p) => available(p) && (festival.collection ? p.is_diwali : cats.has(p.category_slug)));
  const skip = new Set(recentSent.map(Number));
  const bySeg = new Map();
  const q = (p) => (p.rating || 0) + Math.log10((p.rating_count || 0) + 1) + (p.is_bestseller ? 0.5 : 0) + (p.discount_pct || 0) / 100;
  for (const p of [...pool].sort((a, b) => q(b) - q(a))) {
    if (skip.has(p.id) && pool.length > perSection * maxSections) continue;
    if (!bySeg.has(p.segment)) bySeg.set(p.segment, []);
    if (bySeg.get(p.segment).length < perSection) bySeg.get(p.segment).push(p);
  }
  const interests = sub?.interests || [];
  const segs = [...bySeg.keys()].sort((a, b) => (interests.includes(b) ? 1 : 0) - (interests.includes(a) ? 1 : 0));
  return segs.slice(0, maxSections).map((slug) => {
    const s = SEGMENTS.find((x) => x.slug === slug);
    return { slug, title: s ? `${s.icon} ${s.name}` : slug, items: bySeg.get(slug) };
  });
}

/**
 * Build the message for one person.
 * kind 'festival' when an alert is due; otherwise 'picks'.
 */
export function buildMessage({ sub, products, signals, bought, sessions, i2i, recentSent, alert, deal, offer }) {
  const first = (sub.name || '').trim().split(/\s+/)[0] || '';
  const hello = first ? `Namaste ${first}` : 'Namaste';
  if (alert) {
    const copy = (STAGE_COPY[alert.stage] || STAGE_COPY[7])(alert.festival);
    const sections = festivalSections({ products, festival: alert.festival, sub, recentSent });
    return {
      kind: 'festival', festival: alert.festival.slug, subject: copy.subject, hello, intro: copy.intro,
      preheader: `${alert.daysLeft} days to ${alert.festival.name}`, sections, offer,
      landing: `/shop?${alert.festival.collection ? 'collection=festival' : `category=${(alert.festival.categories || []).join(',')}`}`,
    };
  }
  // Abandoned-cart recovery for subscribers: things still sitting in their cart come first.
  const byId = new Map(products.map((p) => [p.id, p]));
  const inCart = (signals?.cart || []).map((id) => byId.get(Number(id))).filter((p) => available(p) && !bought.includes(p.id)).slice(0, 2);
  const items = personalPicks({ products, sub, signals, bought, sessions, i2i, recentSent: [...recentSent, ...inCart.map((p) => p.id)], limit: inCart.length ? 2 : 4 });
  const personal = (signals?.viewed?.length || 0) + (signals?.cart?.length || 0) + bought.length > 0;
  const sections = [{ slug: 'picks', title: personal ? '✨ Picked from what you looked at' : '✨ Popular picks for you', items }];
  if (deal && !inCart.length && !items.some((p) => p.id === deal.id) && !recentSent.includes(deal.id)) sections.unshift({ slug: 'deal', title: `⚡ Deal of the day · ${deal.discount_pct}% off`, items: [deal] });
  if (inCart.length) sections.unshift({ slug: 'cart', title: '🛒 Still in your cart', items: inCart });
  const top = items[0];
  if (inCart.length) {
    return { kind: 'picks', cart: true, subject: `🛒 ${first ? `${first}, your` : 'Your'} cart is waiting: ${inCart[0].name}${inCart.length > 1 ? ' and more' : ''}`, hello,
      intro: 'You left these in your cart. They are still available — complete your order in a tap, your offer applies automatically.',
      preheader: inCart.map((p) => p.name).join(' · '), sections, offer, landing: '/cart' };
  }
  return {
    kind: 'picks', subject: sub.frequency === 'weekly' ? `${first ? `${first}, your` : 'Your'} weekly picks from Utsav Ghar ✨` : deal ? `⚡ Today's deal: ${deal.name} at ${deal.discount_pct}% off` : `✨ ${top ? top.name : 'New picks'} and more, picked for you`,
    hello, intro: personal ? 'Based on what you viewed and bought, we think you will like these.' : 'Here is what shoppers are loving right now.',
    preheader: sections.flatMap((s) => s.items).slice(0, 3).map((p) => p.name).join(' · '), sections, offer, landing: '/',
  };
}

// ---------- rendering ----------
const money = (paise) => `₹${Math.round(paise / 100).toLocaleString('en-IN')}`;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * Links: every link is https://<site>/go/<code>[/<product-slug>]. On a phone with
 * the app installed that same link opens the app (universal / app links); otherwise
 * it opens the website. The /go page logs the click and shows the products.
 */
export function links({ baseUrl, code, channel, kind }) {
  const utm = `utm_source=${channel}&utm_medium=crm&utm_campaign=${kind}`;
  return {
    all: `${baseUrl}/go/${code}?${utm}`,
    item: (p) => `${baseUrl}/go/${code}/${p.slug}?${utm}`,
    prefs: (token) => `${baseUrl}/preferences/${token}`,
    stop: (token) => `${baseUrl}/preferences/${token}?stop=${channel}`,
  };
}

export function renderEmail(m, { baseUrl, code, token, appStoreUrl, playStoreUrl, brand = 'Utsav Ghar', imageFor = () => '' }) {
  const L = links({ baseUrl, code, channel: 'email', kind: m.kind });
  const card = (p) => {
    const img = imageFor(p);
    return `<td width="50%" valign="top" style="padding:6px">
      <a href="${esc(L.item(p))}" style="display:block;text-decoration:none;color:#1a0b13;border:1px solid #eee3d6;border-radius:10px;overflow:hidden;background:#fff">
        ${img ? `<img src="${esc(img)}" alt="${esc(p.name)}" width="260" style="display:block;width:100%;height:auto;border:0">` : `<div style="height:110px;background:#f7efe3;text-align:center;font-size:44px;line-height:110px">🪔</div>`}
        <div style="padding:10px 12px 12px;font-family:Arial,sans-serif">
          <div style="font-size:14px;font-weight:bold;line-height:1.3">${esc(p.name)}</div>
          ${p.rating_count ? `<div style="font-size:12px;color:#b7791f;margin-top:4px">★ ${Number(p.rating).toFixed(1)} <span style="color:#777">(${p.rating_count})</span></div>` : ''}
          <div style="margin-top:6px;font-size:16px;font-weight:bold">${money(p.price)} ${p.mrp > p.price ? `<s style="font-size:12px;color:#888;font-weight:normal">${money(p.mrp)}</s> <span style="font-size:12px;color:#15803d">${p.discount_pct}% off</span>` : ''}</div>
          <div style="margin-top:10px;background:#d9a441;border-radius:20px;text-align:center;padding:8px;font-size:13px;font-weight:bold;color:#1a0b13">Buy now</div>
        </div></a></td>`;
  };
  const rows = (items) => {
    let h = '';
    for (let i = 0; i < items.length; i += 2) h += `<tr>${card(items[i])}${items[i + 1] ? card(items[i + 1]) : '<td width="50%"></td>'}</tr>`;
    return h;
  };
  const sections = m.sections.filter((s) => s.items.length).map((s) => `
    <tr><td style="padding:18px 16px 4px;font-family:Arial,sans-serif;font-size:17px;font-weight:bold;color:#3a0715">${esc(s.title)}</td></tr>
    <tr><td style="padding:0 10px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows(s.items)}</table></td></tr>`).join('');
  const apps = appStoreUrl || playStoreUrl
    ? `<p style="margin:10px 0 0">Shop faster in our app: ${appStoreUrl ? `<a href="${esc(appStoreUrl)}" style="color:#9a3412">iPhone app</a>` : ''}${appStoreUrl && playStoreUrl ? ' · ' : ''}${playStoreUrl ? `<a href="${esc(playStoreUrl)}" style="color:#9a3412">Android app</a>` : ''}</p>` : '';
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(m.subject)}</title></head>
<body style="margin:0;background:#f4eee6">
<span style="display:none;max-height:0;overflow:hidden">${esc(m.preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4eee6"><tr><td align="center" style="padding:16px 8px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fffaf3;border-radius:14px;overflow:hidden">
  <tr><td style="background:#2a0d1c;padding:16px 20px;font-family:Georgia,serif;font-size:22px;color:#f3d27e">🪔 ${esc(brand)}</td></tr>
  <tr><td style="padding:20px 20px 0;font-family:Arial,sans-serif;color:#1a0b13">
    <p style="margin:0;font-size:16px">${esc(m.hello)},</p>
    <p style="margin:8px 0 0;font-size:15px;line-height:1.5">${esc(m.intro)}</p>
    ${m.offer ? `<p style="margin:12px 0 0;padding:10px 12px;background:#fff1e0;border:1px dashed #ea580c;border-radius:8px;font-size:14px">🎁 <b>${esc(m.offer)}</b> — applied automatically in your cart.</p>` : ''}
  </td></tr>
  ${sections}
  <tr><td align="center" style="padding:18px 16px 22px"><a href="${esc(L.all)}" style="display:inline-block;background:#3a0715;color:#fff;text-decoration:none;font-family:Arial,sans-serif;font-weight:bold;font-size:15px;padding:12px 26px;border-radius:24px">See all picks</a>
    <p style="margin:8px 0 0;font-family:Arial,sans-serif;font-size:12px;color:#666">Opens in the ${esc(brand)} app if you have it, otherwise on our website.</p></td></tr>
  <tr><td style="padding:14px 20px 20px;border-top:1px solid #eee3d6;font-family:Arial,sans-serif;font-size:12px;color:#777;line-height:1.5">
    You're getting this because you asked for offers from ${esc(brand)}.
    <a href="${esc(L.prefs(token))}" style="color:#9a3412">Change how often</a> · <a href="${esc(L.stop(token))}" style="color:#9a3412">Unsubscribe</a>${apps}
  </td></tr>
</table></td></tr></table></body></html>`;
  const text = [`${m.hello},`, '', m.intro, m.offer ? `\n🎁 ${m.offer}` : '', '',
    ...m.sections.flatMap((s) => [s.title, ...s.items.map((p) => `• ${p.name} — ${money(p.price)}${p.discount_pct ? ` (${p.discount_pct}% off)` : ''}\n  ${L.item(p)}`), '']),
    `See all: ${L.all}`, '', `Change how often: ${L.prefs(token)}`, `Unsubscribe: ${L.stop(token)}`].join('\n');
  return { subject: m.subject, html, text, headers: { 'List-Unsubscribe': `<${L.stop(token)}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } };
}

/**
 * WhatsApp: business-initiated messages must use a template approved by Meta.
 * Template body (register it once in WhatsApp Manager, category Marketing):
 *   "Namaste {{1}}! {{2}}\n\n{{3}}\n\nTap below to shop. Reply STOP to unsubscribe."
 *   Button: Visit website → https://www.utsavghar.in/go/{{1}}
 * Parameters cannot contain line breaks, so products are joined with " • ".
 */
export function renderWhatsApp(m, { baseUrl, code, token }) {
  const L = links({ baseUrl, code, channel: 'whatsapp', kind: m.kind });
  const items = m.sections.flatMap((s) => s.items).slice(0, 4);
  const line = items.map((p) => `${p.name} ${money(p.price)}${p.discount_pct ? ` (${p.discount_pct}% off)` : ''}`).join(' • ');
  const first = m.hello.replace(/^Namaste\s*/, '') || 'there';
  const intro = m.kind === 'festival' ? m.subject.replace(/^\S+\s/, '') : m.intro;
  const text = `Namaste ${first}! ${intro}\n\n${items.map((p) => `• ${p.name} — ${money(p.price)}${p.discount_pct ? ` (${p.discount_pct}% off)` : ''}`).join('\n')}${m.offer ? `\n\n🎁 ${m.offer}` : ''}\n\n👉 Shop now: ${L.all}\n\nReply STOP to unsubscribe · Preferences: ${L.prefs(token)}`;
  return {
    text,
    template: {
      params: [first, intro.slice(0, 300), line.slice(0, 700)],
      buttonSuffix: `${code}?utm_source=whatsapp&utm_medium=crm&utm_campaign=${m.kind}`,
    },
  };
}

/** Short random code for message links (not guessable, no personal data). */
export function newCode(rand = Math.random) {
  const a = 'abcdefghijkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < 10; i++) s += a[Math.floor(rand() * a.length)];
  return s;
}
