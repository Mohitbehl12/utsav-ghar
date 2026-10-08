/**
 * Customer messages (server side): the subscriber database, the daily run that
 * sends personalised picks and festival alerts, and click / order tracking.
 * Message content comes from shared/crm.js so the demo shows exactly the same thing.
 */
import crypto from 'node:crypto';
import { db, now, parseJSON } from '../db.js';
import { config } from '../config.js';
import { recData, out } from './recommend.js';
import { headlineOffer, publicOffer } from './catalog.js';
import { dealOfTheDay } from '../../../shared/recommend.js';
import { DEFAULT_CALENDAR, festivalAlertDue, digestDue, buildMessage, renderEmail, renderWhatsApp, newCode, istDay } from '../../../shared/crm.js';
import { normalizeIndianPhone } from '../../../shared/phone.js';
import { deliverEmail, deliverWhatsAppTemplate } from './notify.js';

export const CONSENT_TEXT = 'I agree to receive offers, festival alerts and product picks from Utsav Ghar by the channels I chose. I can change how often or stop at any time.';

// ---------- settings ----------
const raw = (k) => db.prepare('SELECT value FROM settings WHERE key = ?').get(k)?.value;
export function crmSettings() {
  return {
    enabled: raw('crm_enabled') !== 'false',
    send_hour: Number(raw('crm_send_hour') ?? 10),
    wa_weekly_cap: Number(raw('crm_wa_weekly_cap') ?? 3),
    calendar: parseJSON(raw('festival_calendar'), null) || DEFAULT_CALENDAR,
    app_store_url: raw('app_store_url') || '',
    play_store_url: raw('play_store_url') || '',
  };
}

// ---------- subscribers ----------
const clean = (v, n) => (v == null ? null : String(v).trim().slice(0, n) || null);
const ids = (a) => (Array.isArray(a) ? [...new Set(a.map(Number).filter((x) => Number.isInteger(x) && x > 0))].slice(0, 40) : []);

export function normalizeContact({ email, phone, country = 'IN' }) {
  const e = clean(email, 200)?.toLowerCase() || null;
  let p = clean(phone, 24);
  if (p) p = country === 'IN' ? normalizeIndianPhone(p) : p.replace(/[^\d+]/g, '');
  return { email: e, phone: p };
}

/**
 * Create or update a subscriber from an explicit opt-in. Existing rows are found
 * by email or phone. Opting in on a channel turns that channel on; nothing here
 * ever turns a channel on without the person asking.
 */
export function upsertSubscriber(b) {
  const { email, phone } = normalizeContact(b);
  if (!email && !phone) return null;
  const found = (email && db.prepare('SELECT * FROM subscribers WHERE email = ?').get(email))
    || (phone && db.prepare('SELECT * FROM subscribers WHERE phone = ?').get(phone));
  const emailOn = !!(b.emailOptIn && email);
  const waOn = !!(b.whatsappOptIn && phone);
  const signals = b.signals ? JSON.stringify({ viewed: ids(b.signals.viewed), cart: ids(b.signals.cart), wish: ids(b.signals.wish), at: now() }) : null;
  if (found) {
    const phoneFree = phone && !db.prepare('SELECT 1 FROM subscribers WHERE phone = ? AND id != ?').get(phone, found.id);
    const emailFree = email && !db.prepare('SELECT 1 FROM subscribers WHERE email = ? AND id != ?').get(email, found.id);
    db.prepare(`UPDATE subscribers SET name = COALESCE(?, name), email = COALESCE(?, email), phone = COALESCE(?, phone), country = ?,
      email_opt_in = MAX(email_opt_in, ?), whatsapp_opt_in = MAX(whatsapp_opt_in, ?), frequency = COALESCE(?, frequency),
      interests = COALESCE(?, interests), signals = COALESCE(?, signals), user_id = COALESCE(user_id, ?),
      status = 'active', unsubscribed_at = NULL, consent_text = ?, consent_at = ?, updated_at = ? WHERE id = ?`)
      .run(clean(b.name, 80), emailFree ? email : null, phoneFree ? phone : null, b.country || found.country, emailOn ? 1 : 0, waOn ? 1 : 0,
        b.frequencyExplicit ? b.frequency : null, b.interests?.length ? JSON.stringify(b.interests.slice(0, 10)) : null, signals, b.userId || null, CONSENT_TEXT, now(), now(), found.id);
    return db.prepare('SELECT * FROM subscribers WHERE id = ?').get(found.id);
  }
  const token = crypto.randomBytes(18).toString('base64url');
  const id = db.prepare(`INSERT INTO subscribers(token, name, email, phone, country, email_opt_in, whatsapp_opt_in, frequency, interests, signals, source, consent_text, consent_at, user_id)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(token, clean(b.name, 80), email, phone, b.country || 'IN', emailOn ? 1 : 0, waOn ? 1 : 0,
    b.frequency || 'weekly', JSON.stringify((b.interests || []).slice(0, 10)), signals || '{}', clean(b.source, 20) || 'popup', CONSENT_TEXT, now(), b.userId || null).lastInsertRowid;
  return db.prepare('SELECT * FROM subscribers WHERE id = ?').get(id);
}

export function updateSignals(token, s) {
  db.prepare('UPDATE subscribers SET signals = ?, updated_at = ? WHERE token = ?')
    .run(JSON.stringify({ viewed: ids(s.viewed), cart: ids(s.cart), wish: ids(s.wish), at: now() }), now(), token);
}

const mask = (v, keep = 3) => (v ? `${String(v).slice(0, keep)}${'•'.repeat(Math.max(2, String(v).length - keep - 2))}${String(v).slice(-2)}` : null);
export function publicPrefs(s) {
  return {
    name: s.name, email: s.email ? mask(s.email) : null, phone: s.phone ? mask(s.phone, 2) : null,
    email_opt_in: !!s.email_opt_in, whatsapp_opt_in: !!s.whatsapp_opt_in, frequency: s.frequency,
    interests: parseJSON(s.interests, []), status: s.status,
  };
}

// ---------- building a message ----------
function context() {
  const d = recData();
  const products = out(d.rows);
  const offer = headlineOffer();
  return { d, products, deal: dealOfTheDay({ products }), offer: offer ? publicOffer(offer).headline : null, settings: crmSettings() };
}

function boughtBy(s) {
  return db.prepare(`SELECT DISTINCT i.product_id FROM order_items i JOIN orders o ON o.id = i.order_id
    WHERE o.payment_status = 'confirmed' AND ((? IS NOT NULL AND lower(o.customer_email) = ?) OR (? IS NOT NULL AND o.customer_phone = ?) OR (? IS NOT NULL AND o.user_id = ?))`)
    .all(s.email, s.email, s.phone, s.phone, s.user_id, s.user_id).map((r) => r.product_id);
}
function recentSent(s) {
  const since = new Date(Date.now() - 7 * 864e5).toISOString();
  return db.prepare('SELECT product_ids FROM crm_messages WHERE subscriber_id = ? AND created_at >= ?').all(s.id, since).flatMap((r) => parseJSON(r.product_ids, []));
}

export function composeFor(s, { ctx = context(), alert } = {}) {
  const sub = { ...s, interests: parseJSON(s.interests, []) };
  return buildMessage({
    sub, products: ctx.products, signals: parseJSON(s.signals, {}), bought: boughtBy(s), sessions: ctx.d.sessions, i2i: ctx.d.i2i,
    recentSent: recentSent(s), alert, deal: ctx.deal, offer: ctx.offer,
  });
}

const imageFor = (p) => {
  const u = p.images?.[0]?.url;
  return u ? (u.startsWith('http') ? u : `${config.publicUrl}${u}`) : '';
};
export function renderFor(s, m, code, settings = crmSettings()) {
  return {
    email: renderEmail(m, { baseUrl: config.publicUrl, code, token: s.token, appStoreUrl: settings.app_store_url, playStoreUrl: settings.play_store_url, imageFor }),
    whatsapp: renderWhatsApp(m, { baseUrl: config.publicUrl, code, token: s.token }),
  };
}

function waSentThisWeek(s) {
  const since = new Date(Date.now() - 7 * 864e5).toISOString();
  return db.prepare("SELECT COUNT(*) n FROM crm_messages WHERE subscriber_id = ? AND channel = 'whatsapp' AND status = 'sent' AND created_at >= ?").get(s.id, since).n;
}

/** Send one message to one subscriber on each channel they opted into. */
export async function sendTo(s, m, { ctx, kind = m.kind } = {}) {
  const results = [];
  const productIds = m.sections.flatMap((x) => x.items.map((p) => p.id));
  const log = db.prepare('INSERT INTO crm_messages(code, subscriber_id, kind, festival, channel, subject, product_ids, status, error) VALUES(?,?,?,?,?,?,?,?,?)');
  if (s.email && s.email_opt_in) {
    const code = newCode(() => crypto.randomInt(1e9) / 1e9);
    const r = renderFor(s, m, code, ctx?.settings);
    const res = await deliverEmail({ to: s.email, ...r.email });
    log.run(code, s.id, kind, m.festival || null, 'email', m.subject, JSON.stringify(productIds), res.status, res.error || null);
    results.push({ channel: 'email', ...res });
  }
  if (s.phone && s.whatsapp_opt_in) {
    const cap = ctx?.settings?.wa_weekly_cap ?? 3;
    const code = newCode(() => crypto.randomInt(1e9) / 1e9);
    let res;
    if (kind !== 'test' && waSentThisWeek(s) >= cap) res = { status: 'skipped', error: `Weekly WhatsApp limit (${cap}) reached` };
    else res = await deliverWhatsAppTemplate({ to: s.phone, ...renderFor(s, m, code, ctx?.settings).whatsapp.template });
    log.run(code, s.id, kind, m.festival || null, 'whatsapp', m.subject, JSON.stringify(productIds), res.status, res.error || null);
    results.push({ channel: 'whatsapp', ...res });
  }
  return results;
}

/**
 * The daily run: festival alert if one is due today (to everyone opted in),
 * otherwise personalised picks for people whose daily / weekly turn it is.
 * At most one message per person per day.
 */
export async function runDaily({ nowTs = Date.now(), force = false, only } = {}) {
  const ctx = context();
  if (!ctx.settings.enabled && !force) return { skipped: 'disabled' };
  const alert = only === 'picks' ? null : festivalAlertDue(ctx.settings.calendar, nowTs);
  const subs = db.prepare("SELECT * FROM subscribers WHERE status = 'active' AND (email_opt_in = 1 OR whatsapp_opt_in = 1)").all();
  const today = istDay(nowTs);
  const summary = { festival: alert ? `${alert.festival.name} (${alert.daysLeft} days)` : null, people: 0, sent: 0, skipped: 0, failed: 0 };
  for (const s of subs) {
    const gotToday = istDay(Date.parse(s.last_digest_at || 0)) === today || istDay(Date.parse(s.last_festival_at || 0)) === today;
    if (gotToday && !force) continue;
    let m = null;
    if (alert && only !== 'picks') m = composeFor(s, { ctx, alert });
    else if (only !== 'festival' && digestDue(s, nowTs)) m = composeFor(s, { ctx });
    if (!m || !m.sections.some((x) => x.items.length)) continue;
    const res = await sendTo(s, m, { ctx });
    summary.people++;
    for (const r of res) summary[r.status === 'sent' ? 'sent' : r.status === 'failed' ? 'failed' : 'skipped']++;
    db.prepare(`UPDATE subscribers SET ${m.kind === 'festival' ? 'last_festival_at' : 'last_digest_at'} = ? WHERE id = ?`).run(new Date(nowTs).toISOString(), s.id);
  }
  db.prepare("INSERT INTO settings(key, value) VALUES('crm_last_run', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(JSON.stringify({ at: now(), day: today, ...summary }));
  return summary;
}

/** Runs once a day after the chosen hour (India time). */
export function startCrmJob() {
  const tick = () => {
    const s = crmSettings();
    if (!s.enabled) return;
    const ist = new Date(Date.now() + 5.5 * 36e5);
    const last = parseJSON(raw('crm_last_run'), {});
    if (ist.getUTCHours() >= s.send_hour && ist.getUTCHours() < 21 && last.day !== istDay()) runDaily().catch((e) => console.error('crm run failed', e));
  };
  const t = setInterval(tick, 10 * 6e4);
  t.unref?.();
}

// ---------- clicks & orders ----------
export function openLink(code) {
  const m = db.prepare('SELECT m.*, s.token FROM crm_messages m LEFT JOIN subscribers s ON s.id = m.subscriber_id WHERE m.code = ?').get(code);
  if (!m) return null;
  db.prepare('UPDATE crm_messages SET clicks = clicks + 1, first_click_at = COALESCE(first_click_at, ?) WHERE id = ?').run(now(), m.id);
  const d = recData();
  const products = out(parseJSON(m.product_ids, []).map((id) => d.byId.get(id)).filter(Boolean));
  return { kind: m.kind, festival: m.festival, subject: m.subject, products, token: m.token };
}

export function attributeOrder(code, orderId) {
  if (!code) return;
  db.prepare('UPDATE crm_messages SET order_id = ? WHERE code = ? AND order_id IS NULL').run(orderId, String(code).slice(0, 20));
}
