/**
 * Abandoned-cart reminders. A checkout session is saved when the customer
 * finishes step 1 of checkout. If they ticked "remind me", haven't ordered
 * within an hour, and it's less than 2 days old, we send ONE reminder.
 */
import { db, now, parseJSON } from '../db.js';
import { config } from '../config.js';
import { formatRupees } from '../../../shared/pricing.js';
import { notifyContact } from './notify.js';

export async function sendCartReminder(c, { second = false } = {}) {
  const items = parseJSON(c.items, []);
  const n = items.reduce((s, i) => s + i.qty, 0);
  const link = `${config.publicUrl}/cart?restore=${c.token}`;
  const first = (c.name || '').split(' ')[0] || 'there';
  await notifyContact({
    email: c.email || null,
    phone: c.phone || null,
    template: 'cart_reminder',
    subject: second ? 'Last reminder: your Utsav Ghar cart is still saved 🪔' : 'You left something in your Utsav Ghar cart 🪔',
    text: second
      ? `Namaste ${first},\n\nJust a last reminder — your ${n} item${n === 1 ? '' : 's'} (${formatRupees(c.value)}) are still in your cart, and stock is moving fast before the festival. Finish in one tap:\n${link}\n\nWe won't remind you again about this cart.\nTeam Utsav Ghar`
      : `Namaste ${first},\n\nYour cart with ${n} item${n === 1 ? '' : 's'} (${formatRupees(c.value)}) is still saved. Complete your order here:\n${link}\n\nReply STOP if you don't want reminders.\nTeam Utsav Ghar`,
  });
  db.prepare(`UPDATE checkout_sessions SET ${second ? 'reminded2_at' : 'reminded_at'} = ? WHERE id = ?`).run(now(), c.id);
}

export function runReminderSweep() {
  const hourAgo = new Date(Date.now() - 60 * 6e4).toISOString();
  const twoDaysAgo = new Date(Date.now() - 48 * 36e5).toISOString();
  const due = db.prepare(
    'SELECT * FROM checkout_sessions WHERE consent = 1 AND order_id IS NULL AND reminded_at IS NULL AND updated_at < ? AND updated_at > ? LIMIT 50'
  ).all(hourAgo, twoDaysAgo);
  // Second and final reminder ~24 hours later (only if they consented and still haven't ordered).
  const dayAgo = new Date(Date.now() - 24 * 36e5).toISOString();
  const threeDaysAgo = new Date(Date.now() - 72 * 36e5).toISOString();
  const due2 = db.prepare(
    'SELECT * FROM checkout_sessions WHERE consent = 1 AND order_id IS NULL AND reminded_at IS NOT NULL AND reminded_at < ? AND reminded2_at IS NULL AND updated_at > ? LIMIT 50'
  ).all(dayAgo, threeDaysAgo);
  return Promise.allSettled([...due.map((c) => sendCartReminder(c)), ...due2.map((c) => sendCartReminder(c, { second: true }))]);
}

export function startReminderJob() {
  const t = setInterval(() => runReminderSweep().catch(() => {}), 10 * 6e4);
  t.unref?.();
}
