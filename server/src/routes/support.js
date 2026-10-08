/**
 * Customer support requests ("tickets").
 *  Public:  raise a request (optionally linked to an order, verified by phone),
 *           read / reply with the secret ticket token, rate the solution.
 *  Account: list your own requests.
 *  Admin:   list, read, reply (with quick replies), change status / priority,
 *           see the linked order. Customers are notified by email / WhatsApp.
 */
import { Router } from 'express';
import { z } from 'zod';
import path from 'node:path';
import fs from 'node:fs';
import { db, now } from '../db.js';
import { wrap, parse, HttpError } from '../lib/http.js';
import { requireAdmin, requireUser, newAccessToken, hashToken, tokenMatches } from '../lib/auth.js';
import { imageUpload, saveImage, PRIVATE_DIR } from '../lib/uploads.js';
import { rejectBots } from '../lib/security.js';
import { notifyContact } from '../lib/notify.js';
import { audit } from '../lib/audit.js';
import { config } from '../config.js';
import { normalizeIndianPhone } from '../../../shared/phone.js';
import { TOPICS, topicOf, SOLUTIONS, TICKET_STATUS } from '../../../shared/support.js';

export const publicSupport = Router();
export const adminSupport = Router();

const digits = (s) => String(s || '').replace(/\D/g, '').slice(-10);
const nextNumber = () => {
  const last = db.prepare('SELECT number FROM support_tickets ORDER BY id DESC LIMIT 1').get()?.number;
  return `HELP-${last ? Number(last.split('-')[1]) + 1 : 1001}`;
};

function ticketOut(t, { admin = false } = {}) {
  const order = t.order_id ? db.prepare('SELECT order_number, status, payment_status, total FROM orders WHERE id = ?').get(t.order_id) : null;
  const messages = db.prepare('SELECT id, author, body, image_path, created_at FROM ticket_messages WHERE ticket_id = ? ORDER BY id').all(t.id)
    .map((m) => ({ id: m.id, author: m.author, body: m.body, created_at: m.created_at, has_image: !!m.image_path }));
  return {
    number: t.number, topic: t.topic, topic_label: topicOf(t.topic).label, priority: t.priority, status: t.status, status_label: TICKET_STATUS[t.status],
    name: t.name, created_at: t.created_at, updated_at: t.updated_at, resolved_at: t.resolved_at, rating: t.rating, source: t.source,
    order, messages, solution: SOLUTIONS[t.topic] || null,
    ...(admin ? { id: t.id, phone: t.phone, email: t.email, user_id: t.user_id, assigned_to: t.assigned_to } : {}),
  };
}

function notifyCustomer(t, subject, text) {
  const link = `${config.publicUrl}/help/requests/${t.number}`;
  notifyContact({ email: t.email || null, phone: t.phone || null, template: 'support_update', subject, text: `${text}\n\nView or reply: ${link}\n\nTeam Utsav Ghar` }).catch(() => {});
}

// Guest access needs the token we gave when the request was created; signed-in owners don't.
function authorizedTicket(req) {
  const t = db.prepare('SELECT * FROM support_tickets WHERE number = ?').get(String(req.params.number).toUpperCase());
  const token = req.get('x-ticket-token') || req.query.token;
  if (!t || !((req.user && t.user_id === req.user.id) || tokenMatches(token, t.token_hash))) throw new HttpError(404, 'Request not found.');
  return t;
}

publicSupport.get('/support/topics', (req, res) => res.json({ topics: TOPICS, solutions: SOLUTIONS }));

publicSupport.post(
  '/support/tickets',
  imageUpload.single('photo'),
  wrap((req, res) => {
    rejectBots(req);
    const b = parse(z.object({
      topic: z.enum(TOPICS.map((t) => t.key)),
      name: z.string().trim().min(2, 'Enter your name').max(80),
      phone: z.string().trim().max(24).optional().or(z.literal('')),
      email: z.string().trim().email('Enter a valid email').max(200).optional().or(z.literal('')),
      orderNumber: z.string().trim().max(30).optional().or(z.literal('')),
      message: z.string().trim().min(5, 'Please tell us a little more (at least 5 characters)').max(3000),
      source: z.enum(['help', 'chat', 'account', 'order']).optional().default('help'),
    }), req.body);
    const fields = {};
    const phone = b.phone ? normalizeIndianPhone(b.phone) : '';
    if (!phone && !b.email && !req.user) fields.phone = 'Give us a mobile number or email so we can reply';
    let order = null;
    if (b.orderNumber) {
      order = db.prepare('SELECT * FROM orders WHERE order_number = ?').get(b.orderNumber.replace(/^#/, '').toUpperCase());
      // Only link an order the person can prove is theirs (same phone / email / account).
      const mine = order && ((req.user && order.user_id === req.user.id) || (phone && digits(order.customer_phone) === digits(phone))
        || (b.email && order.customer_email && order.customer_email.toLowerCase() === b.email.toLowerCase()));
      if (!mine) fields.orderNumber = 'We could not find this order with your mobile number / email';
    } else if (topicOf(b.topic).needsOrder) fields.orderNumber = 'Enter your order number (e.g. DIWALI10245)';
    if (Object.keys(fields).length) throw new HttpError(400, 'Please check the highlighted fields.', { fields });
    // Avoid duplicates: one open request per order + topic.
    if (order) {
      const dup = db.prepare("SELECT number FROM support_tickets WHERE order_id = ? AND topic = ? AND status NOT IN ('resolved','closed')").get(order.id, b.topic);
      if (dup) throw new HttpError(409, `You already have an open request (${dup.number}) for this order. We'll reply there.`, { number: dup.number });
    }
    const imagePath = req.file ? saveImage(req.file, { private: true }) : null;
    const token = newAccessToken();
    const number = nextNumber();
    const t = db.transaction(() => {
      const id = db.prepare(`INSERT INTO support_tickets(number, token_hash, user_id, order_id, topic, priority, name, phone, email, source)
        VALUES(?,?,?,?,?,?,?,?,?,?)`).run(number, hashToken(token), req.user?.id || null, order?.id || null, b.topic, topicOf(b.topic).priority,
        b.name, phone || req.user?.phone || null, b.email || req.user?.email || null, b.source).lastInsertRowid;
      db.prepare('INSERT INTO ticket_messages(ticket_id, author, body, image_path) VALUES(?,?,?,?)').run(id, 'customer', b.message, imagePath);
      db.prepare("INSERT INTO ticket_messages(ticket_id, author, body) VALUES(?, 'system', ?)").run(id,
        topicOf(b.topic).priority === 'high' ? "Thanks — we've marked this as priority. Our team replies within a few hours (10 am – 8 pm)." : "Thanks — we've got your request. Our team replies within one working day, usually much sooner.");
      return db.prepare('SELECT * FROM support_tickets WHERE id = ?').get(id);
    })();
    notifyCustomer(t, `We've received your request ${t.number}`, `Namaste ${t.name.split(' ')[0]},\n\nWe've received your request about "${topicOf(t.topic).label}". Reference: ${t.number}.`);
    res.status(201).json({ ticket: ticketOut(t), token });
  })
);

publicSupport.get('/support/tickets/:number', wrap((req, res) => res.json(ticketOut(authorizedTicket(req)))));

publicSupport.post(
  '/support/tickets/:number/messages',
  imageUpload.single('photo'),
  wrap((req, res) => {
    rejectBots(req);
    const t = authorizedTicket(req);
    if (t.status === 'closed') throw new HttpError(409, 'This request is closed. Please raise a new one.');
    const { message } = parse(z.object({ message: z.string().trim().min(1).max(3000) }), req.body);
    const imagePath = req.file ? saveImage(req.file, { private: true }) : null;
    db.prepare('INSERT INTO ticket_messages(ticket_id, author, body, image_path) VALUES(?,?,?,?)').run(t.id, 'customer', message, imagePath);
    db.prepare("UPDATE support_tickets SET status = CASE WHEN status IN ('waiting','resolved') THEN 'open' ELSE status END, updated_at = ? WHERE id = ?").run(now(), t.id);
    res.json(ticketOut(db.prepare('SELECT * FROM support_tickets WHERE id = ?').get(t.id)));
  })
);

publicSupport.post('/support/tickets/:number/rate', wrap((req, res) => {
  const t = authorizedTicket(req);
  const { rating } = parse(z.object({ rating: z.coerce.number().int().min(1).max(5) }), req.body);
  if (!['resolved', 'closed'].includes(t.status)) throw new HttpError(409, 'You can rate once the request is resolved.');
  db.prepare('UPDATE support_tickets SET rating = ?, status = ?, updated_at = ? WHERE id = ?').run(rating, 'closed', now(), t.id);
  res.json(ticketOut(db.prepare('SELECT * FROM support_tickets WHERE id = ?').get(t.id)));
}));

// Photos attached to a request: only the customer (token / account) or an admin.
function sendTicketImage(res, ticketId, msgId) {
  const m = db.prepare('SELECT image_path FROM ticket_messages WHERE id = ? AND ticket_id = ?').get(msgId, ticketId);
  if (!m?.image_path) throw new HttpError(404, 'Not found');
  const file = path.join(PRIVATE_DIR, path.basename(m.image_path));
  if (!fs.existsSync(file)) throw new HttpError(404, 'Not found');
  res.set('Cache-Control', 'private, no-store');
  res.sendFile(file);
}
publicSupport.get('/support/tickets/:number/messages/:id/image', wrap((req, res) => sendTicketImage(res, authorizedTicket(req).id, Number(req.params.id))));

publicSupport.get('/account/tickets', requireUser, (req, res) => {
  res.json(db.prepare('SELECT * FROM support_tickets WHERE user_id = ? ORDER BY updated_at DESC LIMIT 50').all(req.user.id).map((t) => {
    const o = ticketOut(t);
    return { number: o.number, topic_label: o.topic_label, status: o.status, status_label: o.status_label, updated_at: o.updated_at, order: o.order, last: o.messages.filter((m) => m.author !== 'system').at(-1)?.body.slice(0, 120) };
  }));
});

// ---------------------------------------------------------------- admin
adminSupport.use(requireAdmin());
adminSupport.use((req, res, next) => (req.admin.must_change_password ? next(new HttpError(403, 'Please change the default password first.', { code: 'MUST_CHANGE_PASSWORD' })) : next()));

adminSupport.get('/support/tickets', wrap((req, res) => {
  const q = parse(z.object({ status: z.enum(['open', 'in_progress', 'waiting', 'resolved', 'closed', 'active', 'all']).default('active'), q: z.string().max(80).optional() }), req.query);
  const where = []; const args = [];
  if (q.status === 'active') where.push("t.status IN ('open','in_progress','waiting')");
  else if (q.status !== 'all') { where.push('t.status = ?'); args.push(q.status); }
  if (q.q) { where.push('(t.number LIKE ? OR t.name LIKE ? OR t.phone LIKE ? OR t.email LIKE ? OR o.order_number LIKE ?)'); const l = `%${q.q}%`; args.push(l, l, l, l, l); }
  const rows = db.prepare(`SELECT t.*, o.order_number,
      (SELECT body FROM ticket_messages m WHERE m.ticket_id = t.id AND m.author != 'system' ORDER BY m.id DESC LIMIT 1) last_body,
      (SELECT author FROM ticket_messages m WHERE m.ticket_id = t.id AND m.author != 'system' ORDER BY m.id DESC LIMIT 1) last_author
    FROM support_tickets t LEFT JOIN orders o ON o.id = t.order_id ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 ELSE 2 END, t.updated_at DESC LIMIT 200`).all(...args);
  const counts = Object.fromEntries(db.prepare('SELECT status, COUNT(*) n FROM support_tickets GROUP BY status').all().map((r) => [r.status, r.n]));
  const rated = db.prepare('SELECT AVG(rating) a, COUNT(rating) n FROM support_tickets WHERE rating IS NOT NULL').get();
  res.json({
    counts, satisfaction: rated.n ? { avg: Math.round(rated.a * 10) / 10, n: rated.n } : null,
    items: rows.map((t) => ({ number: t.number, topic: t.topic, topic_label: topicOf(t.topic).label, priority: t.priority, status: t.status, name: t.name, phone: t.phone, order_number: t.order_number, updated_at: t.updated_at, created_at: t.created_at, last_body: (t.last_body || '').slice(0, 140), awaiting_us: t.last_author === 'customer' })),
  });
}));
adminSupport.get('/support/tickets/:number', wrap((req, res) => {
  const t = db.prepare('SELECT * FROM support_tickets WHERE number = ?').get(String(req.params.number).toUpperCase());
  if (!t) throw new HttpError(404, 'Not found');
  res.json(ticketOut(t, { admin: true }));
}));
adminSupport.get('/support/tickets/:number/messages/:id/image', wrap((req, res) => {
  const t = db.prepare('SELECT id FROM support_tickets WHERE number = ?').get(String(req.params.number).toUpperCase());
  if (!t) throw new HttpError(404, 'Not found');
  sendTicketImage(res, t.id, Number(req.params.id));
}));
adminSupport.post('/support/tickets/:number/reply', wrap((req, res) => {
  const t = db.prepare('SELECT * FROM support_tickets WHERE number = ?').get(String(req.params.number).toUpperCase());
  if (!t) throw new HttpError(404, 'Not found');
  const b = parse(z.object({ message: z.string().trim().min(1).max(3000), status: z.enum(['open', 'in_progress', 'waiting', 'resolved', 'closed']).optional() }), req.body);
  const status = b.status || 'waiting';
  db.prepare('INSERT INTO ticket_messages(ticket_id, author, admin_id, body) VALUES(?,?,?,?)').run(t.id, 'admin', req.admin.id, b.message);
  db.prepare('UPDATE support_tickets SET status = ?, assigned_to = COALESCE(assigned_to, ?), updated_at = ?, resolved_at = CASE WHEN ? IN (\'resolved\',\'closed\') THEN ? ELSE resolved_at END WHERE id = ?')
    .run(status, req.admin.id, now(), status, now(), t.id);
  audit(req, 'reply', 'ticket', t.number, { status });
  notifyCustomer(t, `Reply to your request ${t.number}`, `Namaste ${t.name.split(' ')[0]},\n\n${b.message}`);
  res.json(ticketOut(db.prepare('SELECT * FROM support_tickets WHERE id = ?').get(t.id), { admin: true }));
}));
adminSupport.patch('/support/tickets/:number', wrap((req, res) => {
  const t = db.prepare('SELECT * FROM support_tickets WHERE number = ?').get(String(req.params.number).toUpperCase());
  if (!t) throw new HttpError(404, 'Not found');
  const b = parse(z.object({ status: z.enum(['open', 'in_progress', 'waiting', 'resolved', 'closed']).optional(), priority: z.enum(['normal', 'high', 'urgent']).optional() }), req.body);
  db.prepare('UPDATE support_tickets SET status = COALESCE(?, status), priority = COALESCE(?, priority), updated_at = ?, resolved_at = CASE WHEN ? IN (\'resolved\',\'closed\') THEN ? ELSE resolved_at END WHERE id = ?')
    .run(b.status || null, b.priority || null, now(), b.status || '', now(), t.id);
  if (b.status === 'resolved') {
    db.prepare("INSERT INTO ticket_messages(ticket_id, author, body) VALUES(?, 'system', 'Marked as resolved. Not sorted? Just reply here and we will reopen it.')").run(t.id);
    notifyCustomer(t, `Your request ${t.number} is resolved`, `Namaste ${t.name.split(' ')[0]},\n\nWe've marked your request as resolved. If anything is still not right, reply on the link below.`);
  }
  audit(req, 'update', 'ticket', t.number, b);
  res.json(ticketOut(db.prepare('SELECT * FROM support_tickets WHERE id = ?').get(t.id), { admin: true }));
}));
