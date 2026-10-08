/**
 * Admin roles & permissions — one map used by the server (enforcement), the admin
 * panel (menu, buttons) and the manuals. 'edit' = can view and change, 'view' = read
 * only, missing = no access. Money and legal actions have extra checks on the server.
 */
export const ADMIN_ROLES = {
  owner: { label: 'Owner (Super Admin)', short: 'Owner', desc: 'Everything, including money, legal publishing, settings, security and admin users.' },
  manager: { label: 'Manager', short: 'Manager', desc: 'Daily operations: orders, payments, dealers, verification, products. Views legal and settings.' },
  support: { label: 'Customer Support', short: 'Support', desc: 'Orders (delivery steps), customer support, returns intake. No payment or legal decisions.' },
  legal: { label: 'Legal Admin', short: 'Legal', desc: 'Legal & Compliance Center: policies, review, approval, publishing, violations, acceptance records.' },
  dealer_admin: { label: 'Dealer Admin', short: 'Dealer admin', desc: 'Dealers, KYC and document verification, dealer products and dealer orders.' },
  finance: { label: 'Finance Admin', short: 'Finance', desc: 'Payments, refunds, dealer settlements and financial reports.' },
  operations: { label: 'Operations Admin', short: 'Operations', desc: 'Orders, delivery tracking, products, stock and returns handling (no money decisions).' },
  readonly: { label: 'Read Only Admin', short: 'Read only', desc: 'Can open every page except admin users; cannot change anything.' },
};
export const ROLE_KEYS = Object.keys(ADMIN_ROLES);

/** Areas of the admin panel. `paths` are API path prefixes under /api/admin. */
export const AREAS = {
  dashboard: { label: 'Dashboard', paths: ['/stats', '/notifications'] },
  orders: { label: 'Orders & delivery', paths: ['/orders', '/tracking', '/dealer-orders', '/abandoned'] },
  payments: { label: 'Payments', paths: ['/payments'] },
  returns: { label: 'Returns & refunds', paths: ['/returns', '/refunds'] },
  settlements: { label: 'Dealer settlements', paths: ['/settlements'] },
  catalog: { label: 'Products, categories, offers, reviews, stock', paths: ['/products', '/categories', '/offers', '/reviews', '/images', '/zones', '/stock'] },
  pricing: { label: 'Profit & pricing', paths: ['/profit', '/pricing', '/dealer-products-calc', '/dealer-products-defaults'] },
  customers: { label: 'Customers', paths: ['/customers'] },
  marketing: { label: 'Marketing & customer messages', paths: ['/marketing', '/ad-spend', '/crm', '/subscribers'] },
  support: { label: 'Support requests', paths: ['/support'] },
  dealers: { label: 'Dealers & routing', paths: ['/dealers', '/dealers-settings'] },
  verification: { label: 'Dealer verification (KYC, documents)', paths: ['/dealer-verification'] },
  dealer_products: { label: 'Dealer products', paths: ['/dealer-products'] },
  legal: { label: 'Legal & Compliance', paths: ['/legal'] },
  ai: { label: 'AI insights', paths: ['/ai'] },
  audit: { label: 'Audit log', paths: ['/audit'] },
  settings: { label: 'Payment & store settings', paths: ['/settings'] },
  security: { label: 'Security overview', paths: ['/security'] },
  admins: { label: 'Admin users & roles', paths: ['/admins'] },
};

const ALL = Object.keys(AREAS);
const grant = (edit = [], view = []) => Object.fromEntries([...view.map((a) => [a, 'view']), ...edit.map((a) => [a, 'edit'])]);
export const PERMISSIONS = {
  owner: grant(ALL),
  manager: grant(['dashboard', 'orders', 'payments', 'returns', 'catalog', 'pricing', 'customers', 'support', 'dealers', 'verification', 'dealer_products', 'ai'],
    ['settlements', 'marketing', 'legal', 'audit', 'settings', 'security']),
  support: grant(['orders', 'support', 'returns', 'catalog', 'customers'], ['dashboard', 'dealers', 'dealer_products', 'marketing', 'settings', 'audit']),
  legal: grant(['legal'], ['dashboard', 'verification', 'dealers', 'customers', 'audit']),
  dealer_admin: grant(['dealers', 'verification', 'dealer_products'], ['dashboard', 'orders', 'settlements', 'catalog', 'legal', 'audit']),
  finance: grant(['payments', 'returns', 'settlements', 'pricing'], ['dashboard', 'orders', 'customers', 'dealers', 'audit', 'settings']),
  operations: grant(['orders', 'returns', 'catalog', 'support'], ['dashboard', 'dealers', 'dealer_products', 'customers', 'audit']),
  readonly: grant([], ALL.filter((a) => a !== 'admins' && a !== 'security')),
};

/** Fine-grained actions with their own rule (checked on top of the area permission). */
export const ACTIONS = {
  confirm_payment: ['owner', 'manager', 'finance'],
  reject_payment: ['owner', 'manager', 'finance'],
  cancel_order: ['owner', 'manager', 'finance', 'operations'],
  refund: ['owner', 'finance'],
  approve_return: ['owner', 'manager', 'finance', 'operations', 'support'],
  settle_pay: ['owner', 'finance'],
  legal_publish: ['owner', 'legal'],
  legal_edit: ['owner', 'legal'],
  bank_reveal: ['owner'],
  dealer_routing: ['owner', 'dealer_admin'],
  store_settings: ['owner'],
  unlock_accounts: ['owner'],
  marketing_send: ['owner'],
  manage_admins: ['owner'],
};
export const can = (role, action) => (ACTIONS[action] || []).includes(role);

export function areaFor(path) {
  const p = String(path || '').split('?')[0];
  if (/^\/(me|manual|logout)(\/|$)/.test(p) || p === '/') return 'self';
  for (const [k, a] of Object.entries(AREAS)) if (a.paths.some((x) => p === x || p.startsWith(`${x}/`) || p.startsWith(`${x}.`))) return k;
  return 'other';
}
/** 'edit' | 'view' | null */
export function permission(role, area) {
  if (area === 'self') return 'edit';
  if (role === 'owner') return 'edit';
  return PERMISSIONS[role]?.[area] || null;
}
/** Admin menu key (client route) → area, so the panel can hide what a role cannot open. */
export const NAV_AREA = {
  '': 'dashboard', orders: 'orders', dealers: 'dealers', 'dealer-verification': 'verification', tracking: 'orders', 'dealer-products': 'dealer_products',
  payments: 'payments', returns: 'returns', settlements: 'settlements', products: 'catalog', photos: 'catalog', profit: 'pricing', 'pricing-pin': 'pricing',
  marketing: 'marketing', messages: 'marketing', support: 'support', ai: 'ai', legal: 'legal', categories: 'catalog', offers: 'catalog', reviews: 'catalog',
  customers: 'customers', settings: 'settings', security: 'self', audit: 'audit', admins: 'admins', manual: 'self',
};
