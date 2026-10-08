/**
 * Seed the database with categories, starter products, offers, settings and the
 * first admin user. Safe to run repeatedly — existing rows are left alone.
 *
 *   npm run seed              # catalogue + admin + settings
 *   npm run seed -- --demo    # also create sample customers & orders for testing
 */
import { db } from './db.js';
import { config } from './config.js';
import { hashPassword } from './lib/auth.js';
import { categories, products, offers, settings, sampleReviews, bundles, shippingZones } from '../../shared/seedData.js';
import { createOrder, applyAdminAction } from './lib/orders.js';

const demo = process.argv.includes('--demo');
// older end-to-end tests place guest orders: `node src/seed.js --guest-checkout` turns guest checkout on
const guestCheckout = process.argv.includes('--guest-checkout');

async function main() {
  const catId = {};
  db.transaction(() => {
    const insCat = db.prepare('INSERT OR IGNORE INTO categories(slug, name, description, icon, art, sort_order, segment) VALUES(?,?,?,?,?,?,?)');
    categories.forEach((c, i) => insCat.run(c.slug, c.name, c.description, c.icon, JSON.stringify(c.art), i, c.segment));
    // Databases from earlier versions: place old categories in their segment and rename the Diwali-only ones.
    for (const c of categories) db.prepare("UPDATE categories SET segment = ? WHERE slug = ? AND segment = 'festive-decor'").run(c.segment, c.slug);
    db.prepare("UPDATE categories SET name = 'Festive Lights' WHERE slug = 'diwali-lights' AND name = 'Diwali Lights'").run();
    db.prepare("UPDATE categories SET name = 'Gifts & Hampers' WHERE slug = 'diwali-gifts' AND name = 'Diwali Gifts'").run();
    for (const c of db.prepare('SELECT id, slug FROM categories').all()) catId[c.slug] = c.id;

    const insP = db.prepare(`INSERT OR IGNORE INTO products(slug, name, category_id, short_description, description, specs, price, mrp, cost_price, rating, rating_count, art,
      is_featured, is_bestseller, is_new, is_diwali, sort_order, ships_international) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    const insInv = db.prepare('INSERT OR IGNORE INTO inventory(product_id, stock) VALUES(?, ?)');
    for (const p of products) {
      const r = insP.run(p.slug, p.name, catId[p.category_slug], p.short_description, p.description, JSON.stringify(p.specs), p.price * 100, p.mrp * 100, p.cost * 100,
        demo ? p.rating : 0, demo ? p.rating_count : 0, JSON.stringify(p.art), +p.is_featured, +p.is_bestseller, +p.is_new, +p.is_diwali, p.sort, p.ships_international === false ? 0 : 1);
      const id = r.changes ? r.lastInsertRowid : db.prepare('SELECT id FROM products WHERE slug = ?').get(p.slug).id;
      insInv.run(id, p.stock);
    }

    // Combos: price set by you, MRP = what the parts cost separately, cost = sum of parts' costs.
    const pidOf = (slug) => db.prepare('SELECT id, price, mrp, cost_price, ships_international FROM products WHERE slug = ?').get(slug);
    bundles.forEach((b, i) => {
      if (db.prepare('SELECT 1 FROM products WHERE slug = ?').get(b.slug)) return;
      const parts = b.items.map(([slug, qty]) => ({ ...pidOf(slug), qty }));
      const worth = parts.reduce((s, x) => s + x.price * x.qty, 0);
      const cost = parts.reduce((s, x) => s + x.cost_price * x.qty, 0);
      const intl = parts.every((x) => x.ships_international) ? 1 : 0;
      const specs = { "What's included": b.items.map(([slug, qty]) => `${qty} × ${products.find((x) => x.slug === slug)?.name}`).join(', '), Delivery: 'Dispatched within 24–48 hours. Delivered in 3–6 business days across India.' };
      const id = insP.run(b.slug, b.name, catId.combos, b.short, `${b.short}. Everything you need in one box, at a better price than buying each item separately.`, JSON.stringify(specs),
        b.price * 100, worth, cost, 4.8, 40 + i * 17, JSON.stringify(b.art), 1, i === 0 ? 1 : 0, 1, 1, 100 + i, intl).lastInsertRowid;
      db.prepare('UPDATE products SET is_bundle = 1 WHERE id = ?').run(id);
      insInv.run(id, b.stock);
      for (const x of parts) db.prepare('INSERT INTO bundle_items(bundle_id, product_id, qty) VALUES(?,?,?)').run(id, x.id, x.qty);
    });

    if (!db.prepare('SELECT 1 FROM shipping_zones LIMIT 1').get()) {
      shippingZones.forEach((z, i) => db.prepare('INSERT INTO shipping_zones(code, name, countries, fee, extra_item_fee, free_above, delivery_text, duties_note, sort_order) VALUES(?,?,?,?,?,?,?,?,?)')
        .run(z.code, z.name, JSON.stringify(z.countries), z.fee, z.extra_item_fee, z.free_above, z.delivery_text, z.duties_note, i));
    }

    if (!db.prepare('SELECT 1 FROM offers LIMIT 1').get()) {
      for (const o of offers) {
        const id = db.prepare('INSERT INTO offers(name, description, discount_type, discount_value, tiers, first_order_only, min_qty, max_discount, starts_at, ends_at, coupon_code, is_active) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')
          .run(o.name, o.description, o.discount_type, o.discount_value, o.tiers ? JSON.stringify(o.tiers) : null, o.first_order_only ? 1 : 0, o.min_qty, o.max_discount, o.starts_at && new Date(o.starts_at).toISOString(), o.ends_at && new Date(o.ends_at).toISOString(), o.coupon_code, +o.is_active).lastInsertRowid;
        for (const s of o.category_slugs) db.prepare('INSERT INTO offer_categories(offer_id, category_id) VALUES(?,?)').run(id, catId[s]);
      }
    }

    const insS = db.prepare('INSERT OR IGNORE INTO settings(key, value) VALUES(?, ?)');
    for (const [k, v] of Object.entries(settings)) insS.run(k, String(v));
    insS.run('guest_checkout', guestCheckout ? 'true' : 'false');

    // Sample reviews & ratings are for testing only (--demo). A real store starts at
    // zero and shows only reviews from real customers that you approve.
    if (demo && !db.prepare('SELECT 1 FROM reviews LIMIT 1').get()) {
      for (const r of sampleReviews) {
        const pid = db.prepare('SELECT id FROM products WHERE slug = ?').get(r.product)?.id;
        if (pid) db.prepare("INSERT INTO reviews(product_id, author, city, rating, body, status, is_verified_purchase) VALUES(?,?,?,?,?,'approved',1)").run(pid, r.name, r.city, r.rating, r.text);
      }
    }
  })();

  if (!db.prepare('SELECT 1 FROM admin_users LIMIT 1').get()) {
    // must_change_password: the first sign-in forces a new password before anything else works.
    db.prepare("INSERT INTO admin_users(name, email, password_hash, role, must_change_password) VALUES(?,?,?,'owner',1)").run('Store Owner', config.seedAdmin.email, await hashPassword(config.seedAdmin.password));
    console.log(`✔ Admin created: ${config.seedAdmin.email} (password from ADMIN_PASSWORD — you must change it at first sign-in)`);
  }

  if (demo && !db.prepare('SELECT 1 FROM orders LIMIT 1').get()) {
    const pid = (slug) => db.prepare('SELECT id FROM products WHERE slug = ?').get(slug).id;
    const addr = { line1: '12, Shanti Nagar, MG Road', city: 'Pune', state: 'Maharashtra', pincode: '411001' };
    const make = (name, phone, items, actions = []) => {
      const { order } = createOrder({ items: items.map(([s, q]) => ({ productId: pid(s), qty: q })), customer: { name, phone, email: '' }, address: addr });
      for (const a of actions) applyAdminAction(db.prepare('SELECT * FROM orders WHERE id = ?').get(order.id), a, { adminId: 1 });
      return order;
    };
    make('Rahul Mehta', '9876500001', [['premium-brass-diya', 1], ['copper-fairy-lights-10m', 1], ['marigold-toran', 1]], ['confirm_payment', 'process', 'ship', 'deliver']);
    make('Priya Rao', '9876500003', [['brass-pooja-thali-set', 1]], ['confirm_payment', 'process']);
    const n = make('Neha Kapoor', '9876500002', [['diwali-hamper-classic', 2], ['akash-kandil-lantern', 1]]);
    db.prepare("UPDATE payments SET status='verification_pending', customer_ref='412345678901' WHERE order_id = ?").run(n.id);
    db.prepare("UPDATE orders SET payment_status='verification_pending' WHERE id = ?").run(n.id);
    db.prepare("INSERT INTO order_events(order_id, status, note) VALUES(?, 'payment_submitted', 'Customer submitted UPI payment details')").run(n.id);
    console.log('✔ Demo orders created');
  }

  console.log(`✔ Seed complete: ${db.prepare('SELECT COUNT(*) n FROM products').get().n} products, ${db.prepare('SELECT COUNT(*) n FROM categories').get().n} categories`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
