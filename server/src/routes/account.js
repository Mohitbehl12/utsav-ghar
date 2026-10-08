import { normalizeIndianPhone } from '../../../shared/phone.js';
import { upsertSubscriber } from '../lib/crm.js';
import { Router } from 'express';
import { z } from 'zod';
import { db, now } from '../db.js';
import { wrap, parse, HttpError } from '../lib/http.js';
import { hashPassword, checkPassword, setUserSession, clearUserSession, requireUser, DUMMY_HASH } from '../lib/auth.js';
import { PRODUCT_SELECT, serializeProduct, headlineOffer, loadOffers, publicOffer } from '../lib/catalog.js';
import { orderDetail } from '../lib/orders.js';
import { imageUpload, saveImage } from '../lib/uploads.js';
import { isOfferLive } from '../../../shared/pricing.js';
import { passwordProblem } from '../../../shared/security.js';
import { assertNotLocked, loginFailed, loginSucceeded, secEvent, rejectBots } from '../lib/security.js';
import { notifyContact } from '../lib/notify.js';
import { recordCustomerAcceptance, pendingFor, acceptanceView, acceptancePdf, publicDoc, currentDoc, companyVars, legalAudit, blankPdf, CUSTOMER_KINDS } from '../lib/legal.js';
import { CUSTOMER_CONSENTS } from '../../../shared/legal.js';
import crypto from 'node:crypto';
import { sendOtp, verifyOtp } from '../lib/otp.js';
import { config } from '../config.js';

const r = Router();

export const phoneSchema = z.string().trim().transform(normalizeIndianPhone).pipe(z.string().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit Indian mobile number'));
const password = z.string().min(8, 'Use at least 8 characters').max(128);

// ---- auth -------------------------------------------------------------------
const consentsSchema = z.object(Object.fromEntries(CUSTOMER_CONSENTS.map((c) => [c.key, z.literal(true, { errorMap: () => ({ message: 'Please tick this box to continue' }) })])));
const registerSchema = z.object({
  name: z.string().trim().min(2, 'Enter your full name').max(80),
  email: z.string().trim().email('Enter a valid email').max(200),
  phone: z.string().trim().max(20),
  password,
  confirm_password: z.string().max(128),
  address: z.string().trim().min(5, 'Enter house no., street and area').max(200),
  city: z.string().trim().min(2, 'Enter your city').max(60),
  state: z.string().trim().min(2, 'Choose your state').max(60),
  pincode: z.string().trim().max(12),
  country: z.string().trim().min(2).max(60).default('India'),
  dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the date picker').optional().or(z.literal('')),
  consents: consentsSchema,
  marketingOptIn: z.boolean().optional(),
  otp: z.string().trim().max(10).optional(),
}).superRefine((b, ctx) => {
  const add = (path, message) => ctx.addIssue({ code: 'custom', path: [path], message });
  if (b.password !== b.confirm_password) add('confirm_password', 'Passwords do not match');
  const india = /^india$/i.test(b.country);
  if (india) {
    const p = normalizeIndianPhone(b.phone);
    if (!/^[6-9]\d{9}$/.test(p)) add('phone', 'Enter a valid 10-digit Indian mobile number'); else b.phone = p;
    if (!/^[1-9]\d{5}$/.test(b.pincode)) add('pincode', 'Enter a valid 6-digit PIN code');
  } else {
    if (!/^\+?[1-9][\d\s-]{6,18}$/.test(b.phone)) add('phone', 'Enter your phone with country code');
    if (!/^[A-Za-z0-9][A-Za-z0-9 -]{1,11}$/.test(b.pincode)) add('pincode', 'Enter your postal / ZIP code');
  }
  if (b.dob) { const age = (Date.now() - Date.parse(b.dob)) / (365.25 * 864e5); if (!(age >= 13 && age < 120)) add('dob', 'Check the date of birth'); }
});

const signupOtpOn = () => config.signupOtp;
const phoneTaken = (phone, exceptId = 0) => !!phone && !!db.prepare("SELECT 1 FROM users WHERE is_active = 1 AND id != ? AND substr(replace(replace(replace(phone, ' ', ''), '-', ''), '+', ''), -10) = ?").get(exceptId, String(phone).replace(/\D/g, '').slice(-10));
const otpTarget = (phone) => String(phone).replace(/\D/g, '').slice(-12);

/** Step 1 of sign-up: send a 6-digit code to the mobile (WhatsApp/SMS) and email. */
r.post('/auth/register/otp', wrap(async (req, res) => {
  rejectBots(req);
  const b = parse(z.object({ email: z.string().trim().email('Enter a valid email').max(200), phone: z.string().trim().max(20), country: z.string().trim().max(60).default('India') }), req.body);
  const india = /^india$/i.test(b.country);
  const phone = india ? normalizeIndianPhone(b.phone) : b.phone;
  if (india ? !/^[6-9]\d{9}$/.test(phone) : !/^\+?[1-9][\d\s-]{6,18}$/.test(phone)) throw new HttpError(400, 'Please check the highlighted fields.', { fields: { phone: india ? 'Enter a valid 10-digit Indian mobile number' : 'Enter your phone with country code' } });
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(b.email)) throw new HttpError(409, 'An account with this email already exists.', { fields: { email: 'Already registered — sign in instead' } });
  if (phoneTaken(phone)) throw new HttpError(409, 'This mobile number is already registered.', { fields: { phone: 'Already registered — sign in instead' } });
  const out = await sendOtp({ purpose: 'signup', target: otpTarget(phone), email: b.email, phone, data: { email: b.email.toLowerCase() },
    subject: 'Your Utsav Ghar sign-up code', text: '{{code}} is your Utsav Ghar sign-up code. It is valid for 10 minutes. Do not share it with anyone.' });
  res.json({ ok: true, ...out });
}));

// Account opens only with all mandatory consents; the acceptance record (version, time, IP, browser) is written in the same step.
r.post(
  '/auth/register',
  wrap(async (req, res) => {
    rejectBots(req);
    const b = parse(registerSchema, req.body);
    const weak = passwordProblem(b.password, { email: b.email, name: b.name });
    if (weak) throw new HttpError(400, 'Please check the highlighted fields.', { fields: { password: weak } });
    if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(b.email)) throw new HttpError(409, 'An account with this email already exists.', { fields: { email: 'Already registered — sign in instead' } });
    if (phoneTaken(b.phone)) throw new HttpError(409, 'This mobile number is already registered.', { fields: { phone: 'Already registered — sign in instead' } });
    let otpRef = null;
    if (signupOtpOn()) {
      const v = verifyOtp({ purpose: 'signup', target: otpTarget(b.phone), code: b.otp, check: (d) => (d?.email && d.email !== b.email.toLowerCase() ? 'The code was sent for a different email. Ask for a new code.' : null) });
      otpRef = v.ref;
    }
    const hash = await hashPassword(b.password);
    const user = db.transaction(() => {
      const id = db.prepare('INSERT INTO users(name, email, phone, password_hash, address, city, state, pincode, country, dob) VALUES(?,?,?,?,?,?,?,?,?,?)')
        .run(b.name, b.email, b.phone, hash, b.address, b.city, b.state, b.pincode, b.country, b.dob || null).lastInsertRowid;
      if (/^india$/i.test(b.country)) db.prepare('INSERT INTO addresses(user_id, name, phone, line1, city, state, pincode, is_default) VALUES(?,?,?,?,?,?,?,1)').run(id, b.name, b.phone, b.address, b.city, b.state, b.pincode);
      const u = { id, name: b.name, email: b.email, phone: b.phone };
      if (otpRef) db.prepare('UPDATE users SET phone_verified_at = ?, email_verified_at = ? WHERE id = ?').run(now(), now(), id);
      const refs = recordCustomerAcceptance(req, u, b.consents, CUSTOMER_KINDS, otpRef ? `Accepted at sign-up by ticking all required boxes; mobile and email verified with one-time code ${otpRef}` : 'Accepted at sign-up by ticking all required boxes (email and mobile on the account)');
      legalAudit(req, { actor_type: 'customer', actor_id: id, subject_type: 'customer', subject_id: id, action: 'customer_accepted', detail: { refs, consents: b.consents } });
      return u;
    })();
    if (b.marketingOptIn) upsertSubscriber({ name: b.name, email: b.email, phone: b.phone, emailOptIn: true, whatsappOptIn: true, frequency: 'weekly', source: 'register', userId: user.id });
    setUserSession(res, user);
    res.status(201).json({ user });
  })
);

// ---- legal documents (customer) ------------------------------------------------
/** Current customer documents, filled with company details (sign-up page, footer pages). */
r.get('/legal/customer', (req, res) => {
  const v = companyVars();
  res.set('Cache-Control', 'no-store').json({ consents: CUSTOMER_CONSENTS, docs: CUSTOMER_KINDS.map((k) => publicDoc(currentDoc(k), v)).filter(Boolean) });
});
r.get('/legal/doc/:kind', wrap((req, res) => {
  if (!CUSTOMER_KINDS.includes(req.params.kind)) throw new HttpError(404, 'Not found');
  res.json(publicDoc(currentDoc(req.params.kind)));
}));
/** PDF copies of the current customer documents — readable before signing up (no personal data). */
const sendPdf = (res, buf, name, inline = false) => res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${name}"`, 'Cache-Control': 'no-store' }).send(buf);
r.get('/legal/customer/pdf', wrap(async (req, res) => {
  const docs = CUSTOMER_KINDS.map((k) => publicDoc(currentDoc(k))).filter(Boolean);
  sendPdf(res, await blankPdf(docs, { heading: 'CUSTOMER AGREEMENT', ref: `UGC-COPY-${docs.map((d) => d.version).join('-')}` }), 'utsav-ghar-customer-agreement.pdf');
}));
r.get('/legal/doc/:kind/pdf', wrap(async (req, res) => {
  if (!CUSTOMER_KINDS.includes(req.params.kind)) throw new HttpError(404, 'Not found');
  const d = publicDoc(currentDoc(req.params.kind));
  sendPdf(res, await blankPdf([d], { ref: `${req.params.kind.toUpperCase()}-v${d.version}` }), `utsav-ghar-${req.params.kind.replace(/_/g, '-')}-v${d.version}.pdf`);
}));
r.get('/account/legal', requireUser, (req, res) => {
  const rows = db.prepare("SELECT * FROM legal_acceptances WHERE subject_type = 'customer' AND subject_id = ? ORDER BY accepted_at DESC, id DESC").all(req.user.id);
  const v = companyVars();
  res.set('Cache-Control', 'no-store').json({ items: rows.map(acceptanceView), pending: pendingFor('customer', req.user.id, CUSTOMER_KINDS).map((d) => publicDoc(d, v)), consents: CUSTOMER_CONSENTS });
});
r.get('/account/legal/:id', requireUser, wrap((req, res) => {
  const a = db.prepare("SELECT * FROM legal_acceptances WHERE id = ? AND subject_type = 'customer' AND subject_id = ?").get(Number(req.params.id), req.user.id);
  if (!a) throw new HttpError(404, 'Not found');
  res.json({ ...acceptanceView(a), body: a.filled_body });
}));
r.get('/account/legal/:id/pdf', requireUser, wrap(async (req, res) => {
  const a = db.prepare("SELECT * FROM legal_acceptances WHERE id = ? AND subject_type = 'customer' AND subject_id = ?").get(Number(req.params.id), req.user.id);
  if (!a) throw new HttpError(404, 'Not found');
  res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${a.ref_no}.pdf"`, 'Cache-Control': 'private, no-store' }).send(await acceptancePdf(a));
}));
/** Accept new versions (existing customers, after the store publishes a material change). */
r.post('/account/legal/accept', requireUser, wrap((req, res) => {
  const pending = pendingFor('customer', req.user.id, CUSTOMER_KINDS);
  if (!pending.length) return res.json({ ok: true, accepted: [] });
  const need = CUSTOMER_CONSENTS.filter((c) => c.kinds.some((k) => pending.some((d) => d.kind === k)));
  const given = req.body?.consents || {};
  const missing = need.filter((c) => given[c.key] !== true);
  if (missing.length) throw new HttpError(400, 'Please tick every box to continue.', { fields: Object.fromEntries(missing.map((c) => [`consents.${c.key}`, 'Required'])) });
  const refs = recordCustomerAcceptance(req, req.user, Object.fromEntries(need.map((c) => [c.key, true])), pending.map((d) => d.kind));
  legalAudit(req, { actor_type: 'customer', actor_id: req.user.id, subject_type: 'customer', subject_id: req.user.id, action: 'customer_reaccepted', detail: { refs } });
  res.json({ ok: true, accepted: refs });
}));

r.post(
  '/auth/login',
  wrap(async (req, res) => {
    const b = parse(z.object({ email: z.string().trim().email(), password: z.string().min(1).max(128) }), req.body);
    const key = `user:${b.email.toLowerCase()}`;
    assertNotLocked(key);
    const u = db.prepare('SELECT * FROM users WHERE email = ? AND is_active = 1').get(b.email);
    // Always run bcrypt to keep timing uniform whether or not the account exists.
    const ok = await checkPassword(b.password, u?.password_hash || DUMMY_HASH);
    if (!u || !ok) {
      const locked = loginFailed(key, req);
      throw new HttpError(locked ? 429 : 401, locked ? 'Too many wrong attempts. For your safety, sign-in is paused for 15 minutes.' : 'Incorrect email or password.');
    }
    loginSucceeded(key);
    secEvent('login_ok', `user:${u.id}`, req);
    setUserSession(res, u);
    res.json({ user: { id: u.id, name: u.name, email: u.email, phone: u.phone } });
  })
);

r.post('/auth/logout', (req, res) => {
  clearUserSession(res);
  res.json({ ok: true });
});

r.get('/auth/me', (req, res) => res.json({ user: req.user || null }));

// ---- forgot password: code to the email + mobile on the account ---------------------
// Same answer whether or not the email exists, so it cannot be used to find accounts.
r.post('/auth/password/forgot', wrap(async (req, res) => {
  rejectBots(req);
  const b = parse(z.object({ email: z.string().trim().email('Enter a valid email').max(200) }), req.body);
  const u = db.prepare('SELECT id, name, email, phone FROM users WHERE email = ? AND is_active = 1').get(b.email);
  let out = {};
  if (u) {
    out = await sendOtp({ purpose: 'reset_user', target: `user:${u.id}`, email: u.email, phone: u.phone,
      subject: 'Reset your Utsav Ghar password', text: `Namaste ${u.name.split(' ')[0]},\n\n{{code}} is your code to reset your Utsav Ghar password. It is valid for 10 minutes.\nIf you did not ask for this, ignore this message — your password stays the same.` });
    secEvent('password_reset_requested', `user:${u.id}`, req);
  }
  res.json({ ok: true, message: 'If an account exists for this email, we have sent a 6-digit code to its email and mobile.', resend_in: 30, ...(out.dev_otp ? { dev_otp: out.dev_otp } : {}) });
}));
r.post('/auth/password/reset', wrap(async (req, res) => {
  const b = parse(z.object({ email: z.string().trim().email().max(200), otp: z.string().trim().max(10), password: z.string().max(128), confirm_password: z.string().max(128) }), req.body);
  const u = db.prepare('SELECT * FROM users WHERE email = ? AND is_active = 1').get(b.email);
  if (!u) throw new HttpError(400, 'This code is not valid. Ask for a new one.', { fields: { otp: 'Ask for a new code' } });
  if (b.password !== b.confirm_password) throw new HttpError(400, 'Please check the highlighted fields.', { fields: { confirm_password: 'Passwords do not match' } });
  const weak = passwordProblem(b.password, { email: u.email, name: u.name });
  if (weak) throw new HttpError(400, 'Please check the highlighted fields.', { fields: { password: weak } });
  verifyOtp({ purpose: 'reset_user', target: `user:${u.id}`, code: b.otp });
  db.prepare('UPDATE users SET password_hash = ?, password_changed_at = ?, token_version = token_version + 1, updated_at = ? WHERE id = ?').run(await hashPassword(b.password), now(), now(), u.id);
  loginSucceeded(`user:${u.email.toLowerCase()}`); // clears a lock-out
  secEvent('password_reset', `user:${u.id}`, req);
  notifyContact({ email: u.email, template: 'password_changed', subject: 'Your Utsav Ghar password was reset',
    text: `Namaste ${u.name.split(' ')[0]},\n\nYour password was reset and you were signed out on every device. If this wasn't you, contact us immediately.\n\nTeam Utsav Ghar` }).catch(() => {});
  res.json({ ok: true });
}));

// ---- profile ------------------------------------------------------------------
r.put(
  '/account/profile',
  requireUser,
  wrap((req, res) => {
    const b = parse(z.object({ name: z.string().trim().min(2).max(80), phone: phoneSchema }), req.body);
    if (phoneTaken(b.phone, req.user.id)) throw new HttpError(409, 'This mobile number is used by another account.', { fields: { phone: 'Used by another account' } });
    db.prepare('UPDATE users SET name = ?, phone = ?, updated_at = ? WHERE id = ?').run(b.name, b.phone, now(), req.user.id);
    res.json({ user: { ...req.user, ...b } });
  })
);

// Change email: password + a code sent to the NEW address.
r.post('/account/email/otp', requireUser, wrap(async (req, res) => {
  const b = parse(z.object({ email: z.string().trim().email('Enter a valid email').max(200), password: z.string().max(128) }), req.body);
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!(await checkPassword(b.password, u.password_hash))) throw new HttpError(400, 'Please check the highlighted fields.', { fields: { password: 'Password is incorrect' } });
  if (b.email.toLowerCase() === u.email.toLowerCase()) throw new HttpError(400, 'This is already your email.', { fields: { email: 'Same as now' } });
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(b.email)) throw new HttpError(409, 'This email is used by another account.', { fields: { email: 'Used by another account' } });
  const out = await sendOtp({ purpose: 'email_change', target: `user:${u.id}`, email: b.email, data: { email: b.email },
    subject: 'Confirm your new email — Utsav Ghar', text: '{{code}} is your code to confirm this email for your Utsav Ghar account. It is valid for 10 minutes.' });
  res.json({ ok: true, ...out });
}));
r.post('/account/email', requireUser, wrap((req, res) => {
  const b = parse(z.object({ otp: z.string().trim().max(10) }), req.body);
  const v = verifyOtp({ purpose: 'email_change', target: `user:${req.user.id}`, code: b.otp });
  const email = v.data?.email;
  if (!email || db.prepare('SELECT 1 FROM users WHERE email = ? AND id != ?').get(email, req.user.id)) throw new HttpError(409, 'This email is used by another account.');
  const old = req.user.email;
  db.prepare('UPDATE users SET email = ?, email_verified_at = ?, updated_at = ? WHERE id = ?').run(email, now(), now(), req.user.id);
  secEvent('email_changed', `user:${req.user.id}`, req, { from: old.replace(/^(.{2}).*(@.*)$/, '$1•••$2') });
  notifyContact({ email: old, template: 'email_changed', subject: 'Your Utsav Ghar email was changed', text: `The email on your Utsav Ghar account was changed to ${email}. If this wasn't you, contact us immediately.` }).catch(() => {});
  res.json({ user: { ...req.user, email } });
}));

// ---- security: password, sessions, your data -----------------------------------
r.put(
  '/account/password',
  requireUser,
  wrap(async (req, res) => {
    const b = parse(z.object({ current: z.string().max(128), next: z.string().max(128) }), req.body);
    const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (!(await checkPassword(b.current, u.password_hash))) throw new HttpError(400, 'Please check the highlighted fields.', { fields: { current: 'Current password is incorrect' } });
    const weak = passwordProblem(b.next, { email: u.email, name: u.name });
    if (weak) throw new HttpError(400, 'Please check the highlighted fields.', { fields: { next: weak } });
    db.prepare('UPDATE users SET password_hash = ?, password_changed_at = ?, token_version = token_version + 1, updated_at = ? WHERE id = ?').run(await hashPassword(b.next), now(), now(), u.id);
    setUserSession(res, u); // keep this device signed in; all others are signed out
    secEvent('password_changed', `user:${u.id}`, req);
    notifyContact({ email: u.email, template: 'password_changed', subject: 'Your Utsav Ghar password was changed',
      text: `Namaste ${u.name.split(' ')[0]},\n\nYour password was just changed. If this wasn't you, reset it immediately and contact us.\n\nTeam Utsav Ghar` }).catch(() => {});
    res.json({ ok: true });
  })
);

r.post('/account/logout-all', requireUser, (req, res) => {
  db.prepare('UPDATE users SET token_version = token_version + 1 WHERE id = ?').run(req.user.id);
  secEvent('logout_all', `user:${req.user.id}`, req);
  clearUserSession(res);
  res.json({ ok: true });
});

r.get('/account/activity', requireUser, (req, res) => {
  res.json(db.prepare("SELECT kind, ip, user_agent, created_at FROM security_events WHERE actor = ? ORDER BY id DESC LIMIT 15").all(`user:${req.user.id}`));
});

// Your data (DPDP Act 2023): download everything we hold about you …
r.get('/account/export', requireUser, (req, res) => {
  const id = req.user.id;
  const u = db.prepare('SELECT id, name, email, phone, created_at FROM users WHERE id = ?').get(id);
  const orders = db.prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC').all(id).map((o) => ({
    order_number: o.order_number, status: o.status, payment_status: o.payment_status, total: o.total / 100, created_at: o.created_at,
    customer_name: o.customer_name, customer_phone: o.customer_phone, customer_email: o.customer_email,
    address: [o.ship_line1, o.ship_line2, o.ship_city, o.ship_state, o.ship_pincode, o.ship_country].filter(Boolean).join(', '),
    items: db.prepare('SELECT product_name AS name, qty, unit_price FROM order_items WHERE order_id = ?').all(o.id).map((i) => ({ ...i, unit_price: i.unit_price / 100 })),
  }));
  const data = {
    exported_at: now(), profile: u,
    addresses: db.prepare('SELECT label, name, phone, line1, line2, city, state, pincode FROM addresses WHERE user_id = ?').all(id),
    wishlist: db.prepare('SELECT p.name FROM wishlist w JOIN products p ON p.id = w.product_id WHERE w.user_id = ?').all(id).map((x) => x.name),
    orders,
    marketing: db.prepare('SELECT email, phone, email_opt_in, whatsapp_opt_in, frequency, interests, consent_text, consent_at, status FROM subscribers WHERE user_id = ? OR lower(email) = lower(?)').all(id, u.email),
    reviews: db.prepare('SELECT r.rating, r.body, r.created_at, p.name product FROM reviews r JOIN products p ON p.id = r.product_id WHERE r.user_id = ?').all(id),
  };
  secEvent('data_exported', `user:${id}`, req);
  res.set('Content-Disposition', 'attachment; filename="utsav-ghar-my-data.json"').json(data);
});

// … or delete your account. Orders stay (Indian GST law requires keeping invoices),
// but they are detached from you and your personal details are removed from your profile.
r.delete(
  '/account',
  requireUser,
  wrap(async (req, res) => {
    const b = parse(z.object({ password: z.string().max(128), confirm: z.literal('DELETE', { errorMap: () => ({ message: 'Type DELETE to confirm' }) }) }), req.body);
    const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (!(await checkPassword(b.password, u.password_hash))) throw new HttpError(400, 'Please check the highlighted fields.', { fields: { password: 'Password is incorrect' } });
    db.transaction(() => {
      db.prepare('DELETE FROM addresses WHERE user_id = ?').run(u.id);
      db.prepare('DELETE FROM wishlist WHERE user_id = ?').run(u.id);
      db.prepare('DELETE FROM cart_items WHERE cart_id IN (SELECT id FROM cart WHERE user_id = ?)').run(u.id);
      db.prepare('DELETE FROM cart WHERE user_id = ?').run(u.id);
      db.prepare('DELETE FROM subscribers WHERE user_id = ? OR lower(email) = lower(?)').run(u.id, u.email);
      db.prepare("UPDATE reviews SET user_id = NULL, author = 'Former customer' WHERE user_id = ?").run(u.id);
      db.prepare('UPDATE orders SET user_id = NULL WHERE user_id = ?').run(u.id);
      db.prepare(`UPDATE users SET name = 'Deleted user', email = ?, phone = NULL, password_hash = ?, is_active = 0, token_version = token_version + 1, updated_at = ? WHERE id = ?`)
        .run(`deleted-${u.id}-${crypto.randomBytes(4).toString('hex')}@deleted.invalid`, crypto.randomBytes(32).toString('hex'), now(), u.id);
    })();
    secEvent('account_deleted', `user:${u.id}`, req);
    clearUserSession(res);
    res.json({ ok: true });
  })
);

// ---- addresses ----------------------------------------------------------------
export const addressSchema = z.object({
  label: z.string().trim().max(20).optional().default('Home'),
  name: z.string().trim().min(2).max(80),
  phone: phoneSchema,
  line1: z.string().trim().min(5, 'Enter house no., street').max(200),
  line2: z.string().trim().max(200).optional().or(z.literal('')),
  city: z.string().trim().min(2).max(60),
  state: z.string().trim().min(2).max(60),
  pincode: z.string().trim().regex(/^[1-9]\d{5}$/, 'Enter a valid 6-digit PIN code'),
  is_default: z.boolean().optional(),
});

r.get('/account/addresses', requireUser, (req, res) => {
  res.json(db.prepare('SELECT * FROM addresses WHERE user_id = ? ORDER BY is_default DESC, id DESC').all(req.user.id));
});
r.post(
  '/account/addresses',
  requireUser,
  wrap((req, res) => {
    const a = parse(addressSchema, req.body);
    const count = db.prepare('SELECT COUNT(*) n FROM addresses WHERE user_id = ?').get(req.user.id).n;
    if (count >= 10) throw new HttpError(400, 'You can save up to 10 addresses.');
    const isDefault = a.is_default || count === 0 ? 1 : 0;
    if (isDefault) db.prepare('UPDATE addresses SET is_default = 0 WHERE user_id = ?').run(req.user.id);
    const id = db
      .prepare('INSERT INTO addresses(user_id, label, name, phone, line1, line2, city, state, pincode, is_default) VALUES(?,?,?,?,?,?,?,?,?,?)')
      .run(req.user.id, a.label, a.name, a.phone, a.line1, a.line2 || null, a.city, a.state, a.pincode, isDefault).lastInsertRowid;
    res.status(201).json(db.prepare('SELECT * FROM addresses WHERE id = ?').get(id));
  })
);
const myAddress = (req) => {
  const a = db.prepare('SELECT * FROM addresses WHERE id = ? AND user_id = ?').get(Number(req.params.id), req.user.id);
  if (!a) throw new HttpError(404, 'Address not found.');
  return a;
};
r.put('/account/addresses/:id', requireUser, wrap((req, res) => {
  const cur = myAddress(req);
  const a = parse(addressSchema, req.body);
  db.transaction(() => {
    if (a.is_default) db.prepare('UPDATE addresses SET is_default = 0 WHERE user_id = ?').run(req.user.id);
    db.prepare('UPDATE addresses SET label = ?, name = ?, phone = ?, line1 = ?, line2 = ?, city = ?, state = ?, pincode = ?, is_default = ? WHERE id = ?')
      .run(a.label, a.name, a.phone, a.line1, a.line2 || null, a.city, a.state, a.pincode, a.is_default ? 1 : cur.is_default, cur.id);
  })();
  res.json(db.prepare('SELECT * FROM addresses WHERE id = ?').get(cur.id));
}));
r.post('/account/addresses/:id/default', requireUser, wrap((req, res) => {
  const cur = myAddress(req);
  db.transaction(() => {
    db.prepare('UPDATE addresses SET is_default = 0 WHERE user_id = ?').run(req.user.id);
    db.prepare('UPDATE addresses SET is_default = 1 WHERE id = ?').run(cur.id);
  })();
  res.json({ ok: true });
}));
r.delete('/account/addresses/:id', requireUser, wrap((req, res) => {
  const cur = myAddress(req);
  db.transaction(() => {
    db.prepare('DELETE FROM addresses WHERE id = ?').run(cur.id);
    // the default was removed → the newest remaining address becomes the default
    if (cur.is_default) db.prepare('UPDATE addresses SET is_default = 1 WHERE id = (SELECT id FROM addresses WHERE user_id = ? ORDER BY id DESC LIMIT 1)').run(req.user.id);
  })();
  res.json({ ok: true });
}));

// ---- wishlist -------------------------------------------------------------------
r.get('/account/wishlist', requireUser, (req, res) => {
  const offer = headlineOffer();
  const rows = db
    .prepare(`${PRODUCT_SELECT} JOIN wishlist w ON w.product_id = p.id WHERE w.user_id = ? AND p.is_active = 1 ORDER BY w.created_at DESC`)
    .all(req.user.id);
  res.json(rows.map((p) => serializeProduct(p, { offer })));
});
r.post(
  '/account/wishlist',
  requireUser,
  wrap((req, res) => {
    const { productId } = parse(z.object({ productId: z.coerce.number().int().positive() }), req.body);
    if (!db.prepare('SELECT 1 FROM products WHERE id = ?').get(productId)) throw new HttpError(404, 'Product not found');
    db.prepare('INSERT OR IGNORE INTO wishlist(user_id, product_id) VALUES(?,?)').run(req.user.id, productId);
    res.json({ ok: true });
  })
);
r.delete('/account/wishlist/:productId', requireUser, (req, res) => {
  db.prepare('DELETE FROM wishlist WHERE user_id = ? AND product_id = ?').run(req.user.id, Number(req.params.productId));
  res.json({ ok: true });
});

// ---- server-side cart (keeps cart across devices for signed-in users) --------
r.get('/account/cart', requireUser, (req, res) => {
  const cart = db.prepare('SELECT * FROM cart WHERE user_id = ?').get(req.user.id);
  const items = cart ? db.prepare('SELECT product_id AS productId, qty FROM cart_items WHERE cart_id = ?').all(cart.id) : [];
  res.json({ items, couponCode: cart?.coupon_code || '' });
});
r.put(
  '/account/cart',
  requireUser,
  wrap((req, res) => {
    const b = parse(
      z.object({
        items: z.array(z.object({ productId: z.coerce.number().int().positive(), qty: z.coerce.number().int().min(1).max(99) })).max(100),
        couponCode: z.string().trim().max(30).optional().default(''),
      }),
      req.body
    );
    db.transaction(() => {
      db.prepare('INSERT INTO cart(user_id, coupon_code) VALUES(?, ?) ON CONFLICT(user_id) DO UPDATE SET coupon_code = excluded.coupon_code, updated_at = ?').run(req.user.id, b.couponCode, now());
      const cart = db.prepare('SELECT id FROM cart WHERE user_id = ?').get(req.user.id);
      db.prepare('DELETE FROM cart_items WHERE cart_id = ?').run(cart.id);
      const ins = db.prepare('INSERT INTO cart_items(cart_id, product_id, qty) SELECT ?, id, ? FROM products WHERE id = ?');
      for (const i of b.items) ins.run(cart.id, i.qty, i.productId);
    })();
    res.json({ ok: true });
  })
);

// ---- orders & payments ------------------------------------------------------------
r.get('/account/orders', requireUser, (req, res) => {
  const rows = db.prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 100').all(req.user.id);
  res.json(rows.map((o) => orderDetail(o)));
});
r.get('/account/payments', requireUser, (req, res) => {
  res.json(
    db
      .prepare(
        `SELECT o.order_number, pm.method, pm.amount, pm.status, pm.customer_ref, pm.created_at, pm.verified_at
         FROM payments pm JOIN orders o ON o.id = pm.order_id WHERE o.user_id = ? ORDER BY pm.created_at DESC`
      )
      .all(req.user.id)
  );
});
r.get('/account/offers', (req, res) => {
  res.json(loadOffers().filter((o) => isOfferLive(o)).map(publicOffer));
});

// ---- reviews (verified purchase only) ---------------------------------------------
r.post(
  '/products/:id/reviews',
  requireUser,
  imageUpload.single('image'),
  wrap((req, res) => {
    const productId = Number(req.params.id);
    const b = parse(
      z.object({ rating: z.coerce.number().int().min(1).max(5), body: z.string().trim().min(10, 'Please write at least 10 characters').max(1500), city: z.string().trim().max(60).optional() }),
      req.body
    );
    const purchased = db
      .prepare(
        `SELECT 1 FROM orders o JOIN order_items i ON i.order_id = o.id
         WHERE o.user_id = ? AND i.product_id = ? AND o.payment_status = 'confirmed' AND o.status != 'cancelled' LIMIT 1`
      )
      .get(req.user.id, productId);
    if (!purchased) throw new HttpError(403, 'You can review products after your order is confirmed.');
    if (db.prepare('SELECT 1 FROM reviews WHERE user_id = ? AND product_id = ?').get(req.user.id, productId)) {
      throw new HttpError(409, 'You have already reviewed this product.');
    }
    const image = req.file ? saveImage(req.file) : null;
    db.prepare(
      'INSERT INTO reviews(product_id, user_id, author, city, rating, body, image_url, status, is_verified_purchase) VALUES(?,?,?,?,?,?,?,?,1)'
    ).run(productId, req.user.id, req.user.name, b.city || null, b.rating, b.body, image, 'pending');
    res.status(201).json({ ok: true, message: 'Thank you! Your review will appear after moderation.' });
  })
);

export default r;
