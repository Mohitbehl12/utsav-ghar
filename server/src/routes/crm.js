/**
 * Customer messages API.
 *  Public:  subscribe (explicit opt-in), sync browsing signals, preferences /
 *           unsubscribe by token, and message links (/go/:code).
 *  Admin:   subscriber list & export, message preview, test send, run now,
 *           settings and festival calendar, results (sent, clicks, orders).
 */
import { Router } from 'express';
import { z } from 'zod';
import { db, now, parseJSON } from '../db.js';
import { wrap, parse, HttpError } from '../lib/http.js';
import { requireAdmin } from '../lib/auth.js';
import { rejectBots } from '../lib/security.js';
import { audit } from '../lib/audit.js';
import { config } from '../config.js';
import { SEGMENTS } from '../../../shared/festivals.js';
import { loadOffers } from '../lib/catalog.js';
import { isOfferLive, offerLabel } from '../../../shared/pricing.js';
import { upcoming, festivalAlertDue } from '../../../shared/crm.js';
import {
  upsertSubscriber, updateSignals, publicPrefs, crmSettings, composeFor, renderFor, sendTo, runDaily, openLink, CONSENT_TEXT,
} from '../lib/crm.js';

export const publicCrm = Router();
export const adminCrm = Router();

const idList = z.array(z.coerce.number().int().positive()).max(60).optional();
const segEnum = z.enum(SEGMENTS.map((s) => s.slug));
const freq = z.enum(['daily', 'weekly', 'festivals']);

publicCrm.get('/subscribe/consent', (req, res) => res.json({ text: CONSENT_TEXT }));

publicCrm.post('/subscribe', wrap((req, res) => {
  rejectBots(req);
  const b = parse(z.object({
    name: z.string().trim().max(80).optional().or(z.literal('')),
    email: z.string().trim().email('Enter a valid email').max(200).optional().or(z.literal('')),
    phone: z.string().trim().max(24).optional().or(z.literal('')),
    country: z.string().regex(/^[A-Z]{2}$/).optional().default('IN'),
    email_opt_in: z.boolean().optional().default(false),
    whatsapp_opt_in: z.boolean().optional().default(false),
    frequency: freq.optional().default('weekly'),
    interests: z.array(segEnum).max(10).optional().default([]),
    consent: z.literal(true, { errorMap: () => ({ message: 'Please tick the box to agree' }) }),
    source: z.enum(['popup', 'footer', 'checkout', 'register', 'account', 'app']).optional().default('popup'),
    viewed: idList, cart: idList, wish: idList,
  }), req.body);
  const fields = {};
  if (b.email_opt_in && !b.email) fields.email = 'Enter your email';
  if (b.whatsapp_opt_in) {
    const digits = (b.phone || '').replace(/\D/g, '');
    if (b.country === 'IN' ? !/^(91|0)?[6-9]\d{9}$/.test(digits) : digits.length < 8) fields.phone = b.country === 'IN' ? 'Enter a valid 10-digit mobile number' : 'Enter your WhatsApp number with country code';
  }
  if (!b.email_opt_in && !b.whatsapp_opt_in) fields.channels = 'Choose WhatsApp, email or both';
  if (Object.keys(fields).length) throw new HttpError(400, 'Please check the highlighted fields.', { fields });
  const s = upsertSubscriber({
    name: b.name, email: b.email_opt_in ? b.email : b.email || null, phone: b.phone || null, country: b.country,
    emailOptIn: b.email_opt_in, whatsappOptIn: b.whatsapp_opt_in, frequency: b.frequency, frequencyExplicit: true, interests: b.interests, source: b.source,
    signals: { viewed: b.viewed, cart: b.cart, wish: b.wish }, userId: req.user?.id,
  });
  const welcome = loadOffers().find((o) => isOfferLive(o) && o.first_order_only && o.coupon_code);
  res.status(201).json({ token: s.token, prefs: publicPrefs(s), coupon: welcome ? { code: welcome.coupon_code, label: offerLabel(welcome), max_discount: welcome.max_discount } : null, message: b.frequency === 'festivals' ? "Done! We'll alert you before every festival." : `Done! Your ${b.frequency} picks start ${b.frequency === 'daily' ? 'tomorrow' : 'this week'}.` });
}));

publicCrm.post('/subscribe/signals', wrap((req, res) => {
  const b = parse(z.object({ token: z.string().min(10).max(64), viewed: idList, cart: idList, wish: idList }), req.body);
  updateSignals(b.token, b);
  res.status(204).end();
}));

const byToken = (t) => {
  const s = db.prepare('SELECT * FROM subscribers WHERE token = ?').get(String(t).slice(0, 64));
  if (!s) throw new HttpError(404, 'This link has expired. Please subscribe again from our website.');
  return s;
};
publicCrm.get('/preferences/:token', wrap((req, res) => res.json(publicPrefs(byToken(req.params.token)))));
publicCrm.put('/preferences/:token', wrap((req, res) => {
  const s = byToken(req.params.token);
  const b = parse(z.object({ email_opt_in: z.boolean(), whatsapp_opt_in: z.boolean(), frequency: freq, interests: z.array(segEnum).max(10) }), req.body);
  const off = !b.email_opt_in && !b.whatsapp_opt_in;
  db.prepare(`UPDATE subscribers SET email_opt_in = ?, whatsapp_opt_in = ?, frequency = ?, interests = ?, status = ?, unsubscribed_at = ?, updated_at = ? WHERE id = ?`)
    .run(b.email_opt_in && s.email ? 1 : 0, b.whatsapp_opt_in && s.phone ? 1 : 0, b.frequency, JSON.stringify(b.interests), off ? 'unsubscribed' : 'active', off ? now() : null, now(), s.id);
  res.json(publicPrefs(db.prepare('SELECT * FROM subscribers WHERE id = ?').get(s.id)));
}));
// One-tap unsubscribe (also used by email clients' "List-Unsubscribe=One-Click").
publicCrm.post('/preferences/:token/stop', wrap((req, res) => {
  const s = byToken(req.params.token);
  const ch = ['email', 'whatsapp'].includes(req.query.channel || req.body?.channel) ? (req.query.channel || req.body.channel) : 'all';
  const e = ch === 'whatsapp' ? s.email_opt_in : 0;
  const w = ch === 'email' ? s.whatsapp_opt_in : 0;
  const off = !e && !w;
  db.prepare('UPDATE subscribers SET email_opt_in = ?, whatsapp_opt_in = ?, status = ?, unsubscribed_at = ?, updated_at = ? WHERE id = ?')
    .run(e, w, off ? 'unsubscribed' : 'active', off ? now() : null, now(), s.id);
  res.json(publicPrefs(db.prepare('SELECT * FROM subscribers WHERE id = ?').get(s.id)));
}));

publicCrm.get('/go/:code', wrap((req, res) => {
  const r = openLink(String(req.params.code).slice(0, 20));
  if (!r) throw new HttpError(404, 'This offer link has expired.');
  res.json(r);
}));

// ---------------------------------------------------------------- admin
adminCrm.use(requireAdmin());
adminCrm.use((req, res, next) => (req.admin.must_change_password ? next(new HttpError(403, 'Please change the default password first.', { code: 'MUST_CHANGE_PASSWORD' })) : next()));

adminCrm.get('/crm/overview', wrap((req, res) => {
  const s = crmSettings();
  const since = new Date(Date.now() - 30 * 864e5).toISOString();
  const count = (w, ...a) => db.prepare(`SELECT COUNT(*) n FROM subscribers WHERE ${w}`).get(...a).n;
  const msg = db.prepare(`SELECT channel, COUNT(*) total, SUM(status='sent') sent, SUM(status='skipped') skipped, SUM(status='failed') failed,
      SUM(clicks > 0) clicked, SUM(order_id IS NOT NULL) orders FROM crm_messages WHERE created_at >= ? AND kind != 'test' GROUP BY channel`).all(since);
  const revenue = db.prepare(`SELECT COALESCE(SUM(o.total),0) v FROM orders o WHERE o.payment_status = 'confirmed' AND o.id IN (SELECT order_id FROM crm_messages WHERE order_id IS NOT NULL AND created_at >= ?)`).get(since).v;
  res.json({
    subscribers: {
      active: count("status = 'active'"), unsubscribed: count("status = 'unsubscribed'"),
      email: count("status = 'active' AND email_opt_in = 1"), whatsapp: count("status = 'active' AND whatsapp_opt_in = 1"),
      daily: count("status = 'active' AND frequency = 'daily'"), weekly: count("status = 'active' AND frequency = 'weekly'"), festivals: count("status = 'active' AND frequency = 'festivals'"),
      new7: count('created_at >= ?', new Date(Date.now() - 7 * 864e5).toISOString()),
    },
    last30: msg, revenue,
    settings: s, today: festivalAlertDue(s.calendar), upcoming: upcoming(s.calendar),
    lastRun: parseJSON(db.prepare("SELECT value FROM settings WHERE key = 'crm_last_run'").get()?.value, null),
    providers: { email: !!config.smtp.host, whatsapp: !!config.whatsapp.token, whatsappTemplate: config.whatsapp.marketingTemplate || '' },
  });
}));

adminCrm.get('/subscribers', wrap((req, res) => {
  const q = parse(z.object({ q: z.string().max(80).optional(), status: z.enum(['active', 'unsubscribed']).optional(), frequency: freq.optional(), channel: z.enum(['email', 'whatsapp']).optional(), page: z.coerce.number().int().min(1).default(1) }), req.query);
  const where = ['1=1']; const args = [];
  if (q.q) { where.push('(name LIKE ? OR email LIKE ? OR phone LIKE ?)'); const l = `%${q.q}%`; args.push(l, l, l); }
  if (q.status) { where.push('status = ?'); args.push(q.status); }
  if (q.frequency) { where.push('frequency = ?'); args.push(q.frequency); }
  if (q.channel) where.push(q.channel === 'email' ? 'email_opt_in = 1' : 'whatsapp_opt_in = 1');
  const total = db.prepare(`SELECT COUNT(*) n FROM subscribers WHERE ${where.join(' AND ')}`).get(...args).n;
  const rows = db.prepare(`SELECT s.*, (SELECT COUNT(*) FROM crm_messages m WHERE m.subscriber_id = s.id AND m.status = 'sent') sent,
      (SELECT COUNT(*) FROM crm_messages m WHERE m.subscriber_id = s.id AND m.clicks > 0) clicked,
      (SELECT COUNT(*) FROM crm_messages m WHERE m.subscriber_id = s.id AND m.order_id IS NOT NULL) orders
    FROM subscribers s WHERE ${where.join(' AND ')} ORDER BY s.created_at DESC LIMIT 50 OFFSET ?`).all(...args, (q.page - 1) * 50);
  res.json({ total, items: rows.map((r) => ({ ...r, token: undefined, interests: parseJSON(r.interests, []), signals: undefined })) });
}));

adminCrm.get('/subscribers/export.csv', requireAdmin('owner'), wrap((req, res) => {
  const rows = db.prepare('SELECT name, email, phone, country, email_opt_in, whatsapp_opt_in, frequency, interests, source, status, consent_at, created_at FROM subscribers ORDER BY created_at DESC').all();
  const cell = (v) => `"${String(v ?? '').replace(/"/g, '""').replace(/^[=+\-@]/, "'$&")}"`;
  const head = Object.keys(rows[0] || { name: '', email: '', phone: '' });
  audit(req, 'export', 'subscribers', null, { count: rows.length });
  res.type('text/csv').attachment('utsav-ghar-subscribers.csv').send([head.join(','), ...rows.map((r) => head.map((k) => cell(r[k])).join(','))].join('\n'));
}));

// Right to erasure: remove a person and their message history.
adminCrm.delete('/subscribers/:id', requireAdmin('owner'), wrap((req, res) => {
  const r = db.prepare('DELETE FROM subscribers WHERE id = ?').run(Number(req.params.id));
  if (!r.changes) throw new HttpError(404, 'Not found');
  audit(req, 'delete', 'subscriber', req.params.id);
  res.status(204).end();
}));

function sampleSubscriber(id) {
  if (id) {
    const s = db.prepare('SELECT * FROM subscribers WHERE id = ?').get(Number(id));
    if (!s) throw new HttpError(404, 'Subscriber not found');
    return s;
  }
  return { id: 0, token: 'preview', name: 'Priya', email: 'preview@example.com', phone: null, email_opt_in: 1, whatsapp_opt_in: 1, frequency: 'daily', interests: '[]', signals: '{}', status: 'active' };
}
function alertFor(kind, slug) {
  if (kind !== 'festival') return null;
  const cal = crmSettings().calendar;
  const f = cal.find((x) => x.slug === slug) || upcoming(cal)[0] || cal[0];
  const d = Math.max(0, Math.round((Date.parse(`${f.date}T00:00:00Z`) - Date.now()) / 864e5));
  const stage = [5, 7, 10, 21].find((x) => d <= x) || 21;
  return { festival: f, stage, daysLeft: d };
}

adminCrm.get('/crm/preview', wrap((req, res) => {
  const q = parse(z.object({ subscriber: z.coerce.number().int().optional(), kind: z.enum(['picks', 'festival']).default('picks'), festival: z.string().max(40).optional() }), req.query);
  const s = sampleSubscriber(q.subscriber);
  const m = composeFor(s, { alert: alertFor(q.kind, q.festival) });
  const r = renderFor(s, m, 'preview00');
  res.json({ subject: m.subject, html: r.email.html, whatsapp: r.whatsapp.text, items: m.sections.flatMap((x) => x.items.map((p) => p.name)) });
}));

adminCrm.post('/crm/test', wrap(async (req, res) => {
  const b = parse(z.object({ email: z.string().email().optional().or(z.literal('')), phone: z.string().max(24).optional().or(z.literal('')), kind: z.enum(['picks', 'festival']).default('picks'), festival: z.string().max(40).optional() }), req.body);
  if (!b.email && !b.phone) throw new HttpError(400, 'Enter your email or WhatsApp number');
  const s = { ...sampleSubscriber(), id: null, name: req.admin.name, email: b.email || null, phone: b.phone || null, email_opt_in: b.email ? 1 : 0, whatsapp_opt_in: b.phone ? 1 : 0 };
  const m = composeFor(s, { alert: alertFor(b.kind, b.festival) });
  const results = await sendTo(s, m, { kind: 'test' });
  res.json({ results });
}));

adminCrm.post('/crm/run', requireAdmin('owner'), wrap(async (req, res) => {
  const b = parse(z.object({ only: z.enum(['picks', 'festival']).optional() }), req.body || {});
  const summary = await runDaily({ force: true, only: b.only });
  audit(req, 'run', 'crm', null, summary);
  res.json(summary);
}));

const calItem = z.object({
  slug: z.string().regex(/^[a-z0-9-]{2,40}$/), name: z.string().trim().min(2).max(60), emoji: z.string().max(8).default('🎉'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), categories: z.array(z.string().max(60)).max(12).optional().default([]),
  collection: z.boolean().optional(), major: z.boolean().optional(), enabled: z.boolean().optional(), verify: z.boolean().optional(),
});
adminCrm.put('/crm/settings', requireAdmin('owner'), wrap((req, res) => {
  const b = parse(z.object({
    enabled: z.boolean(), send_hour: z.coerce.number().int().min(7).max(20), wa_weekly_cap: z.coerce.number().int().min(0).max(7),
    app_store_url: z.string().url().max(300).optional().or(z.literal('')), play_store_url: z.string().url().max(300).optional().or(z.literal('')),
    calendar: z.array(calItem).max(60).optional(),
  }), req.body);
  const put = db.prepare('INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  db.transaction(() => {
    put.run('crm_enabled', String(b.enabled)); put.run('crm_send_hour', String(b.send_hour)); put.run('crm_wa_weekly_cap', String(b.wa_weekly_cap));
    put.run('app_store_url', b.app_store_url || ''); put.run('play_store_url', b.play_store_url || '');
    if (b.calendar) put.run('festival_calendar', JSON.stringify([...b.calendar].sort((x, y) => x.date.localeCompare(y.date))));
  })();
  audit(req, 'update', 'crm_settings', null, { enabled: b.enabled, send_hour: b.send_hour, wa_weekly_cap: b.wa_weekly_cap, festivals: b.calendar?.length });
  res.json(crmSettings());
}));

adminCrm.get('/crm/messages', wrap((req, res) => {
  res.json(db.prepare(`SELECT m.id, m.code, m.kind, m.festival, m.channel, m.subject, m.status, m.error, m.clicks, m.order_id, m.created_at, s.name, s.email, s.phone
    FROM crm_messages m LEFT JOIN subscribers s ON s.id = m.subscriber_id ORDER BY m.id DESC LIMIT 100`).all());
}));
