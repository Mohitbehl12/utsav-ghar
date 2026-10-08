import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });

export const db = new Database(config.dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

/*
 * Schema. Money columns are INTEGER paise. Timestamps are ISO-8601 UTC text.
 * Designed to port 1:1 to PostgreSQL (INTEGER PRIMARY KEY -> BIGSERIAL,
 * TEXT json -> JSONB, INTEGER booleans -> BOOLEAN).
 */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  phone         TEXT,
  password_hash TEXT NOT NULL,
  is_active     INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);

CREATE TABLE IF NOT EXISTS admin_users (
  id            INTEGER PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'manager' CHECK (role IN ('owner','manager','support')),
  is_active     INTEGER NOT NULL DEFAULT 1,
  last_login_at TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS categories (
  id          INTEGER PRIMARY KEY,
  slug        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  description TEXT,
  icon        TEXT,
  art         TEXT,                  -- JSON {type,tone} fallback illustration
  image_url   TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_active   INTEGER NOT NULL DEFAULT 1,
  seo_title   TEXT,
  seo_description TEXT
);

CREATE TABLE IF NOT EXISTS products (
  id                INTEGER PRIMARY KEY,
  slug              TEXT NOT NULL UNIQUE,
  name              TEXT NOT NULL,
  category_id       INTEGER NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  short_description TEXT,
  description       TEXT,
  specs             TEXT,            -- JSON object of label -> value
  price             INTEGER NOT NULL CHECK (price >= 0),   -- selling price (paise)
  mrp               INTEGER NOT NULL CHECK (mrp >= 0),     -- list price (paise)
  cost_price        INTEGER NOT NULL DEFAULT 0 CHECK (cost_price >= 0), -- what the product costs you (paise) — admin only
  is_bundle         INTEGER NOT NULL DEFAULT 0,
  ships_international INTEGER NOT NULL DEFAULT 1,
  rating            REAL NOT NULL DEFAULT 0,
  rating_count      INTEGER NOT NULL DEFAULT 0,
  art               TEXT,
  is_active         INTEGER NOT NULL DEFAULT 1,
  is_featured       INTEGER NOT NULL DEFAULT 0,
  is_bestseller     INTEGER NOT NULL DEFAULT 0,
  is_new            INTEGER NOT NULL DEFAULT 0,
  is_diwali         INTEGER NOT NULL DEFAULT 0,
  sort_order        INTEGER NOT NULL DEFAULT 0,
  seo_title         TEXT,
  seo_description   TEXT,
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id, is_active);
CREATE INDEX IF NOT EXISTS idx_products_flags ON products(is_active, is_bestseller, is_new, is_featured);
CREATE INDEX IF NOT EXISTS idx_products_price ON products(price);

CREATE TABLE IF NOT EXISTS product_images (
  id         INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  url        TEXT NOT NULL,
  alt        TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_product_images_product ON product_images(product_id, sort_order);

CREATE TABLE IF NOT EXISTS inventory (
  product_id          INTEGER PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  stock               INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  low_stock_threshold INTEGER NOT NULL DEFAULT 10,
  updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS bundle_items (
  bundle_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  qty        INTEGER NOT NULL DEFAULT 1 CHECK (qty BETWEEN 1 AND 20),
  PRIMARY KEY (bundle_id, product_id)
);

CREATE TABLE IF NOT EXISTS shipping_zones (
  id             INTEGER PRIMARY KEY,
  code           TEXT NOT NULL UNIQUE,          -- IN, GCC, EU_UK, NA, APAC, ROW
  name           TEXT NOT NULL,
  countries      TEXT NOT NULL,                 -- JSON ["AE","SA"] or ["*"] for the rest of the world
  fee            INTEGER NOT NULL DEFAULT 0,    -- paise, first item
  extra_item_fee INTEGER NOT NULL DEFAULT 0,    -- paise, each further item
  free_above     INTEGER NOT NULL DEFAULT 0,    -- paise, 0 = never free
  delivery_text  TEXT,
  duties_note    TEXT,
  is_active      INTEGER NOT NULL DEFAULT 1,
  sort_order     INTEGER NOT NULL DEFAULT 0
);

-- First-party analytics: one row per storefront event (no personal data).
CREATE TABLE IF NOT EXISTS events (
  id           INTEGER PRIMARY KEY,
  session_id   TEXT NOT NULL,
  type         TEXT NOT NULL,                 -- page_view | view_item | add_to_cart | begin_checkout | add_payment_info
  product_id   INTEGER,
  value        INTEGER,
  utm_source   TEXT,
  utm_medium   TEXT,
  utm_campaign TEXT,
  country      TEXT,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_events_type_time ON events(type, created_at);
CREATE INDEX IF NOT EXISTS idx_events_campaign ON events(utm_source, utm_campaign);

CREATE TABLE IF NOT EXISTS ad_spend (
  id        INTEGER PRIMARY KEY,
  month     TEXT NOT NULL,                    -- YYYY-MM
  source    TEXT NOT NULL,                    -- instagram, facebook, google, influencer…
  campaign  TEXT NOT NULL DEFAULT '',
  amount    INTEGER NOT NULL CHECK (amount >= 0), -- paise
  notes     TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_ad_spend_month ON ad_spend(month);

-- Checkout started but not finished (abandoned-cart reminders need consent).
CREATE TABLE IF NOT EXISTS checkout_sessions (
  id          INTEGER PRIMARY KEY,
  token       TEXT NOT NULL UNIQUE,
  name        TEXT,
  email       TEXT,
  phone       TEXT,
  country     TEXT,
  consent     INTEGER NOT NULL DEFAULT 0,
  items       TEXT NOT NULL,                  -- JSON [{productId, qty}]
  value       INTEGER NOT NULL DEFAULT 0,     -- paise, server quote
  utm_source  TEXT,
  utm_campaign TEXT,
  order_id    INTEGER REFERENCES orders(id) ON DELETE SET NULL,
  reminded_at TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_checkout_open ON checkout_sessions(order_id, updated_at);

CREATE TABLE IF NOT EXISTS cart (
  id         INTEGER PRIMARY KEY,
  user_id    INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  coupon_code TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS cart_items (
  cart_id    INTEGER NOT NULL REFERENCES cart(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  qty        INTEGER NOT NULL CHECK (qty BETWEEN 1 AND 99),
  PRIMARY KEY (cart_id, product_id)
);

CREATE TABLE IF NOT EXISTS addresses (
  id         INTEGER PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label      TEXT DEFAULT 'Home',
  name       TEXT NOT NULL,
  phone      TEXT NOT NULL,
  line1      TEXT NOT NULL,
  line2      TEXT,
  city       TEXT NOT NULL,
  state      TEXT NOT NULL,
  pincode    TEXT NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_addresses_user ON addresses(user_id);

CREATE TABLE IF NOT EXISTS offers (
  id             INTEGER PRIMARY KEY,
  name           TEXT NOT NULL,
  description    TEXT,
  discount_type  TEXT NOT NULL CHECK (discount_type IN ('percent','flat','tiered','cheapest')),
  discount_value INTEGER NOT NULL CHECK (discount_value >= 0), -- percent, or paise for flat
  tiers          TEXT,                                        -- JSON [{min_qty, percent}] for tiered
  first_order_only INTEGER NOT NULL DEFAULT 0,
  min_qty        INTEGER NOT NULL DEFAULT 1 CHECK (min_qty >= 1),
  max_discount   INTEGER,                                     -- paise cap
  starts_at      TEXT,
  ends_at        TEXT,
  coupon_code    TEXT UNIQUE COLLATE NOCASE,
  is_active      INTEGER NOT NULL DEFAULT 1,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS offer_products (
  offer_id   INTEGER NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  PRIMARY KEY (offer_id, product_id)
);
CREATE TABLE IF NOT EXISTS offer_categories (
  offer_id    INTEGER NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  PRIMARY KEY (offer_id, category_id)
);

CREATE TABLE IF NOT EXISTS orders (
  id               INTEGER PRIMARY KEY,
  order_number     TEXT NOT NULL UNIQUE,
  user_id          INTEGER REFERENCES users(id) ON DELETE SET NULL,
  access_token_hash TEXT NOT NULL,          -- lets guests view/pay their own order
  customer_name    TEXT NOT NULL,
  customer_phone   TEXT NOT NULL,
  customer_email   TEXT,
  ship_line1       TEXT NOT NULL,
  ship_line2       TEXT,
  ship_city        TEXT NOT NULL,
  ship_state       TEXT NOT NULL,
  ship_pincode     TEXT NOT NULL,
  ship_country     TEXT NOT NULL DEFAULT 'IN',
  currency         TEXT NOT NULL DEFAULT 'INR',    -- currency the customer browsed in (charged in INR)
  fx_rate          REAL,                           -- rupees per unit of that currency at order time
  utm_source       TEXT, utm_medium TEXT, utm_campaign TEXT, utm_content TEXT, utm_term TEXT,
  fbclid           TEXT, fbp TEXT, fbc TEXT, ga_client_id TEXT,
  landing_page     TEXT, referrer TEXT, client_ip TEXT, user_agent TEXT,
  conversion_sent  INTEGER NOT NULL DEFAULT 0,
  mrp_total        INTEGER NOT NULL,
  subtotal         INTEGER NOT NULL,
  discount         INTEGER NOT NULL DEFAULT 0,
  delivery_fee     INTEGER NOT NULL DEFAULT 0,
  total            INTEGER NOT NULL,
  offer_id         INTEGER REFERENCES offers(id) ON DELETE SET NULL,
  offer_name       TEXT,
  coupon_code      TEXT,
  payment_method   TEXT NOT NULL DEFAULT 'upi',
  payment_status   TEXT NOT NULL DEFAULT 'awaiting_payment'
                   CHECK (payment_status IN ('awaiting_payment','verification_pending','confirmed','rejected','refunded')),
  status           TEXT NOT NULL DEFAULT 'placed'
                   CHECK (status IN ('placed','payment_confirmed','processing','shipped','out_for_delivery','delivered','cancelled')),
  tracking_carrier TEXT,
  tracking_number  TEXT,
  estimated_delivery TEXT,
  admin_note       TEXT,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status, payment_status);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_orders_phone ON orders(customer_phone);

CREATE TABLE IF NOT EXISTS order_items (
  id           INTEGER PRIMARY KEY,
  order_id     INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id   INTEGER REFERENCES products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,             -- snapshot at purchase time
  product_slug TEXT,
  unit_price   INTEGER NOT NULL,
  mrp          INTEGER NOT NULL,
  qty          INTEGER NOT NULL CHECK (qty >= 1),
  line_total   INTEGER NOT NULL,
  unit_cost    INTEGER NOT NULL DEFAULT 0,    -- cost snapshot for profit reports
  discount_share INTEGER NOT NULL DEFAULT 0,  -- this line's share of the order discount
  offer_eligible INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product ON order_items(product_id);

CREATE TABLE IF NOT EXISTS order_events (
  id         INTEGER PRIMARY KEY,
  order_id   INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status     TEXT NOT NULL,
  note       TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_order_events_order ON order_events(order_id);

CREATE TABLE IF NOT EXISTS payments (
  id              INTEGER PRIMARY KEY,
  order_id        INTEGER NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  method          TEXT NOT NULL,                 -- upi_manual | razorpay | ...
  amount          INTEGER NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','verification_pending','confirmed','rejected','refunded')),
  customer_ref    TEXT,                          -- UTR entered by customer (unverified)
  screenshot_path TEXT,                          -- private upload, admin-only
  gateway_order_id   TEXT,
  gateway_payment_id TEXT,
  verified_by     INTEGER REFERENCES admin_users(id),
  verified_at     TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_customer_ref ON payments(customer_ref) WHERE customer_ref IS NOT NULL;

CREATE TABLE IF NOT EXISTS payment_transactions (
  id          INTEGER PRIMARY KEY,
  payment_id  INTEGER NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,        -- customer_submitted | admin_confirmed | admin_rejected | gateway_created | gateway_captured | webhook
  amount      INTEGER,
  reference   TEXT,
  raw         TEXT,                 -- JSON payload (gateway events)
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_payment_tx_payment ON payment_transactions(payment_id);

CREATE TABLE IF NOT EXISTS reviews (
  id         INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  author     TEXT NOT NULL,
  city       TEXT,
  rating     INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body       TEXT NOT NULL,
  image_url  TEXT,
  status     TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  is_verified_purchase INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_reviews_product ON reviews(product_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_reviews_user_product ON reviews(user_id, product_id) WHERE user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS wishlist (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (user_id, product_id)
);

CREATE TABLE IF NOT EXISTS notifications (
  id         INTEGER PRIMARY KEY,
  channel    TEXT NOT NULL CHECK (channel IN ('email','sms','whatsapp')),
  recipient  TEXT NOT NULL,
  template   TEXT NOT NULL,
  payload    TEXT,
  order_id   INTEGER REFERENCES orders(id) ON DELETE SET NULL,
  status     TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sent','failed','skipped')),
  error      TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  sent_at    TEXT
);
CREATE INDEX IF NOT EXISTS idx_notifications_status ON notifications(status);

CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  email      TEXT PRIMARY KEY COLLATE NOCASE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Customers who asked for offers / festival alerts (explicit opt-in only).
CREATE TABLE IF NOT EXISTS subscribers (
  id               INTEGER PRIMARY KEY,
  token            TEXT NOT NULL UNIQUE,              -- for the preferences / unsubscribe link
  name             TEXT,
  email            TEXT UNIQUE COLLATE NOCASE,
  phone            TEXT UNIQUE,                       -- 10-digit Indian mobile or +country number
  country          TEXT NOT NULL DEFAULT 'IN',
  email_opt_in     INTEGER NOT NULL DEFAULT 0,
  whatsapp_opt_in  INTEGER NOT NULL DEFAULT 0,
  frequency        TEXT NOT NULL DEFAULT 'weekly' CHECK (frequency IN ('daily','weekly','festivals')),
  interests        TEXT NOT NULL DEFAULT '[]',        -- store sections (segments) they care about
  signals          TEXT NOT NULL DEFAULT '{}',        -- recently viewed / cart / wishlist product ids from their browser
  source           TEXT,                              -- popup | checkout | register | footer | account
  consent_text     TEXT,                              -- exactly what they agreed to
  consent_at       TEXT,
  user_id          INTEGER REFERENCES users(id) ON DELETE SET NULL,
  status           TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','unsubscribed')),
  unsubscribed_at  TEXT,
  last_digest_at   TEXT,
  last_festival_at TEXT,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_subscribers_status ON subscribers(status, frequency);

-- Every marketing message sent (one row per channel), with clicks and resulting orders.
CREATE TABLE IF NOT EXISTS crm_messages (
  id            INTEGER PRIMARY KEY,
  code          TEXT NOT NULL UNIQUE,
  subscriber_id INTEGER REFERENCES subscribers(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL,                        -- picks | festival | test
  festival      TEXT,
  channel       TEXT NOT NULL,                        -- email | whatsapp
  subject       TEXT,
  product_ids   TEXT NOT NULL DEFAULT '[]',
  status        TEXT NOT NULL DEFAULT 'queued',       -- queued | sent | skipped | failed
  error         TEXT,
  clicks        INTEGER NOT NULL DEFAULT 0,
  first_click_at TEXT,
  order_id      INTEGER REFERENCES orders(id) ON DELETE SET NULL,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_crm_sub ON crm_messages(subscriber_id, created_at);
CREATE INDEX IF NOT EXISTS idx_crm_created ON crm_messages(created_at);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id          INTEGER PRIMARY KEY,
  admin_id    INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
  action      TEXT NOT NULL,
  entity      TEXT NOT NULL,
  entity_id   TEXT,
  details     TEXT,
  ip          TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
`;

db.exec(SCHEMA);

// ---- lightweight migrations for databases created by earlier versions ----
const columns = (t) => db.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name);
const addColumn = (t, c, def) => { if (!columns(t).includes(c)) db.exec(`ALTER TABLE ${t} ADD COLUMN ${c} ${def}`); };
addColumn('products', 'cost_price', 'INTEGER NOT NULL DEFAULT 0');
addColumn('order_items', 'unit_cost', 'INTEGER NOT NULL DEFAULT 0');
addColumn('order_items', 'discount_share', 'INTEGER NOT NULL DEFAULT 0');
addColumn('products', 'is_bundle', 'INTEGER NOT NULL DEFAULT 0');
addColumn('products', 'ships_international', 'INTEGER NOT NULL DEFAULT 1');
addColumn('categories', 'segment', "TEXT NOT NULL DEFAULT 'festive-decor'");
addColumn('checkout_sessions', 'reminded2_at', 'TEXT');
// security
addColumn('users', 'token_version', 'INTEGER NOT NULL DEFAULT 0');
addColumn('payments', 'instrument', 'TEXT'); // e.g. "Visa credit •••• 4242" (never full card numbers)
addColumn('users', 'password_changed_at', 'TEXT');
addColumn('users', 'phone_verified_at', 'TEXT');
addColumn('users', 'email_verified_at', 'TEXT');
for (const [c, d] of [['token_version', 'INTEGER NOT NULL DEFAULT 0'], ['totp_secret', 'TEXT'], ['totp_enabled', 'INTEGER NOT NULL DEFAULT 0'],
  ['totp_last_step', 'INTEGER NOT NULL DEFAULT -1'], ['backup_codes', "TEXT NOT NULL DEFAULT '[]'"], ['must_change_password', 'INTEGER NOT NULL DEFAULT 0'],
  ['password_changed_at', 'TEXT']]) addColumn('admin_users', c, d);
// admin roles: rebuild the table once when its CHECK predates the newer roles
if (!/dealer_admin/.test(db.prepare("SELECT sql FROM sqlite_master WHERE name = 'admin_users'").get()?.sql || '')) {
  const cols = columns('admin_users');
  db.pragma('foreign_keys = OFF');
  db.transaction(() => {
    db.exec(`CREATE TABLE admin_users_new (
      id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE COLLATE NOCASE, password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'manager' CHECK (role IN ('owner','manager','support','legal','dealer_admin','finance','operations','readonly')),
      is_active INTEGER NOT NULL DEFAULT 1, last_login_at TEXT, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      token_version INTEGER NOT NULL DEFAULT 0, totp_secret TEXT, totp_enabled INTEGER NOT NULL DEFAULT 0, totp_last_step INTEGER NOT NULL DEFAULT -1,
      backup_codes TEXT NOT NULL DEFAULT '[]', must_change_password INTEGER NOT NULL DEFAULT 0, password_changed_at TEXT,
      created_by INTEGER, disabled_at TEXT)`);
    const keep = cols.filter((c) => columns('admin_users_new').includes(c)).join(', ');
    db.exec(`INSERT INTO admin_users_new(${keep}) SELECT ${keep} FROM admin_users; DROP TABLE admin_users; ALTER TABLE admin_users_new RENAME TO admin_users;`);
  })();
  db.pragma('foreign_keys = ON');
}
db.exec(`CREATE TABLE IF NOT EXISTS login_attempts (
  key          TEXT PRIMARY KEY,              -- 'user:<email>' or 'admin:<email>'
  fails        INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  last_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS security_events (
  id         INTEGER PRIMARY KEY,
  kind       TEXT NOT NULL,                   -- login_ok | login_failed | locked | password_changed | logout_all | 2fa_enabled | ...
  actor      TEXT NOT NULL,                   -- 'user:12' / 'admin:1' / 'email:x@y'
  ip         TEXT,
  user_agent TEXT,
  detail     TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_secev_actor ON security_events(actor, created_at);
CREATE INDEX IF NOT EXISTS idx_secev_kind ON security_events(kind, created_at);`);
// customer support requests
db.exec(`CREATE TABLE IF NOT EXISTS support_tickets (
  id            INTEGER PRIMARY KEY,
  number        TEXT NOT NULL UNIQUE,            -- HELP-1001
  token_hash    TEXT NOT NULL,                   -- guest access (like orders)
  user_id       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  order_id      INTEGER REFERENCES orders(id) ON DELETE SET NULL,
  topic         TEXT NOT NULL,
  priority      TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal','high','urgent')),
  status        TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','waiting','resolved','closed')),
  name          TEXT NOT NULL,
  phone         TEXT,
  email         TEXT,
  source        TEXT NOT NULL DEFAULT 'help',    -- help | chat | account | order
  assigned_to   INTEGER REFERENCES admin_users(id),
  rating        INTEGER,                         -- 1–5 after resolution
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  resolved_at   TEXT
);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON support_tickets(status, updated_at);
CREATE INDEX IF NOT EXISTS idx_tickets_user ON support_tickets(user_id);
CREATE TABLE IF NOT EXISTS ticket_messages (
  id         INTEGER PRIMARY KEY,
  ticket_id  INTEGER NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  author     TEXT NOT NULL CHECK (author IN ('customer','admin','system')),
  admin_id   INTEGER REFERENCES admin_users(id),
  body       TEXT NOT NULL,
  image_path TEXT,                               -- private upload, shown only to the customer & admins
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_tmsg_ticket ON ticket_messages(ticket_id, id);`);
for (const [c, d] of [['ship_country', "TEXT NOT NULL DEFAULT 'IN'"], ['currency', "TEXT NOT NULL DEFAULT 'INR'"], ['fx_rate', 'REAL'],
  ['utm_source', 'TEXT'], ['utm_medium', 'TEXT'], ['utm_campaign', 'TEXT'], ['utm_content', 'TEXT'], ['utm_term', 'TEXT'],
  ['fbclid', 'TEXT'], ['fbp', 'TEXT'], ['fbc', 'TEXT'], ['ga_client_id', 'TEXT'], ['landing_page', 'TEXT'], ['referrer', 'TEXT'],
  ['client_ip', 'TEXT'], ['user_agent', 'TEXT'], ['conversion_sent', 'INTEGER NOT NULL DEFAULT 0']]) addColumn('orders', c, d);
db.exec('CREATE INDEX IF NOT EXISTS idx_orders_utm ON orders(utm_source, utm_campaign)');
// Older databases have a CHECK that only allows percent/flat offers: rebuild that table once.
const offersSql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='offers'").get()?.sql || '';
if (!offersSql.includes('tiered')) {
  db.pragma('foreign_keys = OFF');
  db.transaction(() => {
    db.exec(`CREATE TABLE offers_new (
      id INTEGER PRIMARY KEY, name TEXT NOT NULL, description TEXT,
      discount_type TEXT NOT NULL CHECK (discount_type IN ('percent','flat','tiered','cheapest')),
      discount_value INTEGER NOT NULL CHECK (discount_value >= 0), tiers TEXT, first_order_only INTEGER NOT NULL DEFAULT 0,
      min_qty INTEGER NOT NULL DEFAULT 1 CHECK (min_qty >= 1), max_discount INTEGER, starts_at TEXT, ends_at TEXT,
      coupon_code TEXT UNIQUE COLLATE NOCASE, is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')))`);
    db.exec(`INSERT INTO offers_new(id, name, description, discount_type, discount_value, min_qty, max_discount, starts_at, ends_at, coupon_code, is_active, created_at, updated_at)
      SELECT id, name, description, discount_type, discount_value, min_qty, max_discount, starts_at, ends_at, coupon_code, is_active, created_at, updated_at FROM offers`);
    db.exec('DROP TABLE offers; ALTER TABLE offers_new RENAME TO offers;');
  })();
  db.pragma('foreign_keys = ON');
}

// ---- dealers: partner shops that pack & deliver orders sent from the store ----
db.exec(`CREATE TABLE IF NOT EXISTS dealers (
  id            INTEGER PRIMARY KEY,
  name          TEXT NOT NULL,                  -- contact person
  business_name TEXT NOT NULL,
  phone         TEXT NOT NULL UNIQUE,           -- 10-digit, used to sign in
  email         TEXT,
  password_hash TEXT NOT NULL,
  address       TEXT, city TEXT, state TEXT, pincode TEXT, gstin TEXT,
  pincodes      TEXT NOT NULL DEFAULT '[]',     -- PIN patterns served: ["110001","1100","400001-400099"]
  all_india     INTEGER NOT NULL DEFAULT 0,
  category_ids  TEXT NOT NULL DEFAULT '[]',
  product_ids   TEXT NOT NULL DEFAULT '[]',
  priority      INTEGER NOT NULL DEFAULT 0,
  is_active     INTEGER NOT NULL DEFAULT 1,
  must_change_password INTEGER NOT NULL DEFAULT 1,
  token_version INTEGER NOT NULL DEFAULT 0,
  last_login_at TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS dealer_orders (
  id            INTEGER PRIMARY KEY,
  order_id      INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  dealer_id     INTEGER NOT NULL REFERENCES dealers(id),
  status        TEXT NOT NULL DEFAULT 'sent'
                CHECK (status IN ('sent','accepted','rejected','packed','ready','out_for_delivery','delivered','reassigned','cancelled')),
  assigned_by   TEXT NOT NULL DEFAULT 'auto',   -- auto | admin:<id>
  reject_reason TEXT,
  packed_items  TEXT NOT NULL DEFAULT '[]',     -- order_item ids ticked while packing
  delivery_mode TEXT CHECK (delivery_mode IN ('self','courier')),
  rider_name    TEXT, rider_phone TEXT,
  courier_name  TEXT, awb TEXT, tracking_url TEXT,
  otp           TEXT,                           -- 4-digit delivery code shown to the customer only
  otp_tries     INTEGER NOT NULL DEFAULT 0,
  dealer_note   TEXT,
  sent_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  accepted_at TEXT, packed_at TEXT, ready_at TEXT, out_at TEXT, delivered_at TEXT, closed_at TEXT, reminded_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_dorders_dealer ON dealer_orders(dealer_id, status);
CREATE INDEX IF NOT EXISTS idx_dorders_order ON dealer_orders(order_id);`);
addColumn('dealer_orders', 'tracking', "TEXT NOT NULL DEFAULT '[]'");   // courier checkpoints [{at,status,location,note,by}]
addColumn('dealer_orders', 'received_by', 'TEXT');
addColumn('dealer_orders', 'courier_out_at', 'TEXT');
db.exec('CREATE INDEX IF NOT EXISTS idx_dorders_awb ON dealer_orders(awb)');
// Products proposed by dealers. The dealer's price is their cost to us; the customer
// price lives only on products.price and the internal calculation only in 'pricing'.
db.exec(`CREATE TABLE IF NOT EXISTS dealer_products (
  id            INTEGER PRIMARY KEY,
  dealer_id     INTEGER NOT NULL REFERENCES dealers(id),
  product_id    INTEGER REFERENCES products(id) ON DELETE SET NULL,   -- set once published
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','changes_requested','approved','rejected')),
  name          TEXT NOT NULL,
  category_id   INTEGER REFERENCES categories(id),
  short_description TEXT, description TEXT,
  specs         TEXT NOT NULL DEFAULT '{}',
  dealer_price  INTEGER NOT NULL,              -- paise, per piece (dealer's cost to us)
  quantity      INTEGER NOT NULL DEFAULT 0,
  images        TEXT NOT NULL DEFAULT '[]',    -- private file names until published
  published_images TEXT NOT NULL DEFAULT '{}', -- private name → public url
  dealer_sku    TEXT, hsn TEXT,
  admin_note    TEXT,                          -- message the dealer can see
  internal_note TEXT,                          -- team only
  pricing       TEXT,                          -- team only: calculator inputs & result
  approved_dealer_price INTEGER,
  revision      INTEGER NOT NULL DEFAULT 1,
  submitted_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  reviewed_at TEXT, reviewed_by INTEGER, published_at TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_dprod_dealer ON dealer_products(dealer_id, status);
CREATE INDEX IF NOT EXISTS idx_dprod_status ON dealer_products(status, submitted_at);`);

export const now = () => new Date().toISOString();
export const tx = (fn) => db.transaction(fn);

export function parseJSON(v, fallback = null) {
  if (v == null || v === '') return fallback;
  try {
    return JSON.parse(v);
  } catch {
    return fallback;
  }
}
