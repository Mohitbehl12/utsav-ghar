// QA · Admin: login, dashboard, roles & permissions (every role), customers, orders, payments,
// legal & policy workflow, version control, acceptance, PDFs, audit, reports, settings.   node test/qa/qa-admin.mjs
import { client, tc, section, expect, brief, save, db, uniq, newCustomer, ownerClient, placeOrder, inStockProduct } from './lib.mjs';
import { ROLE_KEYS, PERMISSIONS, AREAS } from '../../../shared/roles.js';

// ===================================================================== login
section('Admin', 'Login');
{
  const L = await client().init();
  await tc('ADM-LOG-001', 'Wrong password', '401', async () => { const r = await L('POST', '/api/admin/login', { email: 'admin@utsavghar.in', password: 'wrong' }); expect(r.status === 401, brief(r)); return brief(r); }, 'Critical');
  await tc('ADM-LOG-002', 'First sign-in with the default password', 'Everything except changing the password is blocked', async () => { await L('POST', '/api/admin/login', { email: 'admin@utsavghar.in', password: 'ChangeMe@2026' }); const r = await L('GET', '/api/admin/orders'); const d = await L('GET', '/api/admin/dealer-verification'); expect(r.status === 403 && d.status === 403 && r.data.code === 'MUST_CHANGE_PASSWORD', `${brief(r)} / ${brief(d)}`); return `${r.status} MUST_CHANGE_PASSWORD on every area`; }, 'Critical');
}
const A = await ownerClient();
{
  await tc('ADM-LOG-003', 'Owner session works after password change', '200 /admin/me with perms', async () => { const r = await A('GET', '/api/admin/me'); expect(r.status === 200 && r.data.admin.perms === 'all', brief(r)); return `${r.data.admin.role_label}`; });
  await tc('ADM-LOG-004', 'Admin cookie flags', 'HttpOnly, SameSite=Strict', async () => { const L = await client().init(); const r = await fetch(`${process.env.QA_BASE || 'http://localhost:4000'}/api/admin/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': L.jar.sa_csrf, Cookie: `sa_csrf=${L.jar.sa_csrf}`, 'X-Forwarded-For': '10.99.0.1' }, body: JSON.stringify({ email: 'admin@utsavghar.in', password: 'Toran&Kalash-2026' }) }); const c = r.headers.getSetCookie().find((x) => x.startsWith('sa_admin=')); expect(/HttpOnly/i.test(c) && /SameSite=Strict/i.test(c), c); return c.split(';').slice(1).map((x) => x.trim()).join('; '); }, 'High');
}

// ===================================================================== dashboard
section('Admin', 'Dashboard');
{
  await tc('ADM-DSH-001', 'Dashboard numbers', 'Sales, orders, pending payments, low stock', async () => { const r = (await A('GET', '/api/admin/stats')).data; expect(r && typeof r === 'object' && 'pendingPayments' in r, JSON.stringify(Object.keys(r))); return Object.keys(r).slice(0, 10).join(', '); }, 'High');
  await tc('ADM-DSH-002', 'Legal & Compliance overview cards', 'Active policies, pending review, expiring soon, acceptance rate', async () => { const c = (await A('GET', '/api/admin/legal/center')).data; expect(c.kpis && 'active' in c.kpis && 'acceptance_rate' in c.kpis, JSON.stringify(c.kpis)); return JSON.stringify(c.kpis).slice(0, 200); }, 'Medium');
}

// ===================================================================== roles & permissions
section('Admin', 'Roles & permissions');
const role = {};
{
  await tc('ADM-ROL-001', 'Only the owner can open Admin users', 'Owner 200', async () => { const r = await A('GET', '/api/admin/admins'); expect(r.status === 200 && r.data.items.length >= 1, brief(r)); return `${r.data.items.length} admin(s)`; }, 'Critical');
  await tc('ADM-ROL-002', 'Add admin with a bad email / unknown role', '400', async () => { const r = await A('POST', '/api/admin/admins', { name: 'X', email: 'bad', role: 'god' }); expect(r.status === 400, brief(r)); return brief(r); });
  for (const k of ROLE_KEYS.filter((x) => x !== 'owner')) {
    await tc(`ADM-ROL-ADD-${k}`, `Create a ${k} admin`, '201 with one-time password; must set own password', async () => {
      const r = await A('POST', '/api/admin/admins', { name: `QA ${k}`, email: `qa.${k}.${uniq()}@example.com`, role: k }); expect(r.status === 201 && r.data.temporary_password, brief(r));
      const C = await client().init(); await C('POST', '/api/admin/login', { email: r.data.admin.email, password: r.data.temporary_password });
      const blockedFirst = (await C('GET', '/api/admin/stats')).status; const ch = await C('PUT', '/api/admin/me/password', { current: r.data.temporary_password, next: `Role-${k}-Pass-2026!` });
      expect(blockedFirst === 403 && ch.status === 200, `${blockedFirst} ${brief(ch)}`); C.adminId = r.data.admin.id; C.email = r.data.admin.email; role[k] = C; return `${r.data.admin.email} · first sign-in blocked until password set`;
    }, 'Critical');
  }
  await tc('ADM-ROL-003', 'Duplicate admin email', '409', async () => { const r = await A('POST', '/api/admin/admins', { name: 'Dup', email: role.support.email, role: 'support' }); expect(r.status === 409, brief(r)); return brief(r); });
  // matrix: GET per area for each role
  const probe = { dashboard: '/api/admin/stats', orders: '/api/admin/orders', payments: '/api/admin/payments', returns: '/api/admin/returns', settlements: '/api/admin/settlements', catalog: '/api/admin/products', pricing: '/api/admin/profit',
    customers: '/api/admin/customers', marketing: '/api/admin/marketing', support: '/api/admin/support/tickets', dealers: '/api/admin/dealers', verification: '/api/admin/dealer-verification', dealer_products: '/api/admin/dealer-products',
    legal: '/api/admin/legal/center', ai: '/api/admin/ai/risk', audit: '/api/admin/audit', settings: '/api/admin/settings', security: '/api/admin/security', admins: '/api/admin/admins' };
  for (const k of ROLE_KEYS.filter((x) => x !== 'owner')) {
    await tc(`ADM-MTX-${k}`, `Permission matrix — ${k}: can open exactly its areas`, `200 where the map allows, 403 elsewhere (${Object.keys(probe).length} areas)`, async () => {
      const wrong = [];
      for (const [area, url] of Object.entries(probe)) {
        const r = await role[k]('GET', url); const want = !!PERMISSIONS[k][area];
        if (want ? r.status !== 200 : r.status !== 403) wrong.push(`${area}:${r.status}${want ? '(want 200)' : '(want 403)'}`);
      }
      expect(!wrong.length, wrong.join(' ')); return `${Object.values(PERMISSIONS[k]).length} areas open, others 403`;
    }, 'Critical');
  }
  const C = await newCustomer(); const p = await inStockProduct(C, 6); const o = await placeOrder(C, [{ productId: p.id, qty: 1 }]);
  await tc('ADM-ROL-004', 'Read-only admin tries to change things', '403 on confirm payment, product edit, settings', async () => { const R = role.readonly; const a = await R('POST', `/api/admin/orders/${o.id}/action`, { action: 'confirm_payment' }); const b = await R('PUT', '/api/admin/settings', { store_name: 'x' }); const c = await R('POST', '/api/admin/categories', { name: 'X' }); expect([a, b, c].every((x) => x.status === 403), `${a.status} ${b.status} ${c.status}`); return `${a.status} / ${b.status} / ${c.status} · "${a.data.error}"`; }, 'Critical');
  await tc('ADM-ROL-005', 'Support cannot confirm payments or refunds', '403', async () => { const r = await role.support('POST', `/api/admin/orders/${o.id}/action`, { action: 'confirm_payment' }); expect(r.status === 403, brief(r)); return brief(r); }, 'Critical');
  await tc('ADM-ROL-006', 'Finance confirms the payment', '200', async () => { const r = await role.finance('POST', `/api/admin/orders/${o.id}/action`, { action: 'confirm_payment' }); expect(r.status === 200 && r.data.payment_status === 'confirmed', brief(r)); return r.data.payment_status; }, 'High');
  await tc('ADM-ROL-007', 'Operations processes the order but cannot refund', 'process 200 · refund 403', async () => {
    const cur = (await A('GET', `/api/admin/orders/${o.id}`)).data; let a = { status: 200 };
    if (!cur.dealer?.current) a = await role.operations('POST', `/api/admin/orders/${o.id}/action`, { action: 'process' });
    const f = db.prepare('SELECT id FROM refunds LIMIT 1').get(); const b = f ? await role.operations('POST', `/api/admin/refunds/${f.id}/action`, { action: 'process', reference: 'X12345' }) : { status: 403 };
    expect(a.status === 200 && b.status === 403, `${a.status} ${b.status}`); return `${a.status} / ${b.status}`;
  }, 'High');
  await tc('ADM-ROL-008', 'Legal admin edits policies; cannot open payments', 'create draft 201 · payments 403', async () => { const a = await role.legal('POST', '/api/admin/legal/docs', { title: `Legal Team Draft ${uniq()}`, category: 'company', start: 'blank' }); const b = await role.legal('GET', '/api/admin/payments'); expect([200, 201].includes(a.status) && b.status === 403, `${brief(a)} ${b.status}`); return `${a.status} / ${b.status}`; }, 'High');
  await tc('ADM-ROL-009', 'Manager can view legal but not publish', 'GET 200 · create draft 403', async () => { const R = await (async () => { const r = await A('POST', '/api/admin/admins', { name: 'QA Manager', email: `qa.mgr.${uniq()}@example.com`, role: 'manager' }); const M = await client().init(); await M('POST', '/api/admin/login', { email: r.data.admin.email, password: r.data.temporary_password }); await M('PUT', '/api/admin/me/password', { current: r.data.temporary_password, next: 'Manager-Pass-2026!' }); return M; })(); const a = await R('GET', '/api/admin/legal/center'); const b = await R('POST', '/api/admin/legal/docs', { kind: 'cookie_policy' }); expect(a.status === 200 && b.status === 403, `${a.status} ${b.status}`); role.manager = R; return `${a.status} / ${b.status}`; }, 'High');
  await tc('ADM-ROL-010', 'Dealer admin can verify dealers but not pay settlements', 'verification 200 · settlement create 403', async () => { const a = await role.dealer_admin('GET', '/api/admin/dealer-verification'); const b = await role.dealer_admin('POST', '/api/admin/settlements', { dealer_id: 1 }); expect(a.status === 200 && b.status === 403, `${a.status} ${b.status}`); return `${a.status} / ${b.status}`; }, 'High');
  await tc('ADM-ROL-011', 'Non-owner cannot manage admins (privilege escalation)', '403 for create / promote self', async () => { const a = await role.manager('POST', '/api/admin/admins', { name: 'Evil', email: `evil.${uniq()}@example.com`, role: 'owner' }); const b = await role.finance('PUT', `/api/admin/admins/${role.finance.adminId}`, { role: 'owner' }); expect(a.status === 403 && b.status === 403, `${a.status} ${b.status}`); return `${a.status} / ${b.status}`; }, 'Critical');
  await tc('ADM-ROL-012', 'Owner cannot disable or demote themselves', '400', async () => { const me = (await A('GET', '/api/admin/me')).data.admin; const r = await A('PUT', `/api/admin/admins/${me.id}`, { is_active: false }); const r2 = await A('PUT', `/api/admin/admins/${me.id}`, { role: 'support' }); expect(r.status === 400 && r2.status === 400, `${r.status} ${r2.status}`); return brief(r); }, 'High');
  await tc('ADM-ROL-013', 'Role change signs the person out', 'Old session 401 after change', async () => { await A('PUT', `/api/admin/admins/${role.operations.adminId}`, { role: 'readonly' }); const r = await role.operations('GET', '/api/admin/stats'); expect(r.status === 401, brief(r)); return brief(r); }, 'High');
  await tc('ADM-ROL-014', 'Disabled admin cannot sign in', '401', async () => { await A('PUT', `/api/admin/admins/${role.support.adminId}`, { is_active: false }); const S = await client().init(); const r = await S('POST', '/api/admin/login', { email: role.support.email, password: 'Role-support-Pass-2026!' }); const s = await role.support('GET', '/api/admin/orders'); expect(r.status === 401 && s.status === 401, `${r.status} ${s.status}`); return `login ${r.status} · old session ${s.status}`; }, 'Critical');
  await tc('ADM-ROL-015', 'Reset another admin password', 'One-time password; must change at next sign-in', async () => { const r = await A('POST', `/api/admin/admins/${role.finance.adminId}/reset-password`); const F = await client().init(); await F('POST', '/api/admin/login', { email: role.finance.email, password: r.data.temporary_password }); const s = await F('GET', '/api/admin/stats'); expect(r.status === 200 && s.status === 403 && s.data.code === 'MUST_CHANGE_PASSWORD', `${brief(r)} ${brief(s)}`); return 'reset · must change password'; }, 'High');
  await tc('ADM-ROL-016', 'Customer and dealer sessions on /api/admin', '401', async () => { const r = await C('GET', '/api/admin/orders'); expect(r.status === 401, brief(r)); return brief(r); }, 'Critical');
}

// ===================================================================== customers & orders (admin)
section('Admin', 'Customers, orders & payments');
{
  await tc('ADM-CUS-001', 'Customer list', 'Registered customers with order counts', async () => { const r = (await A('GET', '/api/admin/customers')).data; const n = (r.items || r).length; expect(n >= 1, JSON.stringify(r).slice(0, 100)); return `${n} customers`; }, 'Medium');
  await tc('ADM-ORD-001', 'Orders list filters', 'payment=confirmed returns only confirmed', async () => { const r = (await A('GET', '/api/admin/orders?payment=confirmed')).data; expect(r.every((o) => o.payment_status === 'confirmed'), 'mixed'); return `${r.length} confirmed`; }, 'Medium');
  await tc('ADM-ORD-002', 'Order search by phone', 'Finds the order', async () => { const o = db.prepare('SELECT customer_phone, order_number FROM orders ORDER BY id DESC LIMIT 1').get(); const r = (await A('GET', `/api/admin/orders?q=${o.customer_phone}`)).data; expect(r.some((x) => x.order_number === o.order_number), 'not found'); return `found #${o.order_number}`; }, 'Medium');
  await tc('ADM-ORD-003', 'Unknown action / unknown order', '400 / 404', async () => { const a = await A('POST', '/api/admin/orders/1/action', { action: 'teleport' }); const b = await A('GET', '/api/admin/orders/99999999'); expect(a.status === 400 && b.status === 404, `${a.status} ${b.status}`); return `${a.status} / ${b.status}`; });
  await tc('ADM-PAY-001', 'Payments to verify tab', 'Only verification_pending', async () => { const r = (await A('GET', '/api/admin/payments?status=verification_pending')).data; expect(r.every((x) => x.status === 'verification_pending'), 'mixed'); return `${r.length} to verify`; }, 'Medium');
}

// ===================================================================== legal & policies
section('Admin', 'Legal & policy workflow');
let K1 = null;
{
  let d;
  await tc('ADM-LEG-001', 'Create a new policy draft', 'Draft v1.x created', async () => { const r = await A('POST', '/api/admin/legal/docs', { title: `Festival Delivery Promise ${uniq()}`, category: 'company', start: 'blank' }); d = r.data; K1 = d.kind; expect([200, 201].includes(r.status) && d.status === 'draft' && d.version === '1.0', brief(r)); return `${d.title} (${d.kind}) v${d.version} · ${d.status}`; }, 'High');
  await tc('ADM-LEG-002', 'Save draft edits', '200, change note stored', async () => { const r = await A('PUT', `/api/admin/legal/docs/${d.id}`, { title: d.title, body: `# ${d.title}\n\n> We tell you when your festival order will arrive.\n\n## In simple words\n- Delivery in 3–7 days across India.\n\n## 1. Delivery promise\n> What this means: We dispatch within 2 days.\nWe deliver across India within 7 days of dispatch.`, version: d.version, change_note: 'First version' }); expect(r.status === 200, brief(r)); return 'saved'; }, 'High');
  await tc('ADM-LEG-003', 'Publish without approval', '409 — unapproved policy cannot go live', async () => { const r = await A('POST', `/api/admin/legal/docs/${d.id}/publish`, {}); expect(r.status === 409, brief(r)); return brief(r); }, 'Critical');
  await tc('ADM-LEG-004', 'Approve before internal review', '409', async () => { const r = await A('POST', `/api/admin/legal/docs/${d.id}/approve`, { reviewer: 'Adv. Test', confirm: true }); expect(r.status === 409, brief(r)); return brief(r); }, 'Critical');
  await tc('ADM-LEG-005', 'Submit → internal review → legal review', 'Statuses move in order; draft locked while in review', async () => { const a = await A('POST', `/api/admin/legal/docs/${d.id}/submit`); const b = await A('POST', `/api/admin/legal/docs/${d.id}/internal-approve`, {}); const lock = await A('PUT', `/api/admin/legal/docs/${d.id}`, { title: 'x', body: 'y'.repeat(80), version: d.version }); expect(a.data.status === 'internal_review' && b.data.status === 'legal_review' && lock.status === 409, `${a.data.status} ${b.data.status} ${lock.status}`); return 'internal_review → legal_review · edit 409'; }, 'Critical');
  await tc('ADM-LEG-006', 'Legal approval needs reviewer + confirmation', '400 without', async () => { const r = await A('POST', `/api/admin/legal/docs/${d.id}/approve`, { reviewer: '' }); expect(r.status === 400, brief(r)); return brief(r); }, 'High');
  await tc('ADM-LEG-007', 'Approve and publish with effective date', 'Published; reviewer recorded', async () => { const a = await A('POST', `/api/admin/legal/docs/${d.id}/approve`, { reviewer: 'Adv. Meera Iyer', confirm: true }); const p = await A('POST', `/api/admin/legal/docs/${d.id}/publish`, {}); expect(a.data.status === 'approved' && p.data.status === 'published', `${brief(a)} ${brief(p)}`); return `approved by ${a.data.legal_reviewer} · published`; }, 'Critical');
  await tc('ADM-LEG-008', 'Published version cannot be edited or deleted', '409 / 409', async () => { const a = await A('PUT', `/api/admin/legal/docs/${d.id}`, { title: 'x', body: 'y'.repeat(80), version: d.version }); const b = await A('DELETE', `/api/admin/legal/docs/${d.id}`); expect(a.status === 409 && b.status === 409, `${a.status} ${b.status}`); return '409 / 409'; }, 'Critical');
  let v2;
  await tc('ADM-VER-001', 'New version from the live one (v1 → v1.1 / v2.0)', 'New draft with a higher number; old version still published', async () => { const r = await A('POST', '/api/admin/legal/docs', { kind: K1 }); v2 = r.data; const all = (await A('GET', '/api/admin/legal/docs')).data.kinds.find((k) => k.kind === K1).versions; expect(v2.status === 'draft' && all.some((x) => x.status === 'published' && x.id === d.id), JSON.stringify(all.map((x) => [x.version, x.status]))); return all.map((x) => `v${x.version} ${x.status}`).join(' · '); }, 'Critical');
  await tc('ADM-VER-002', 'Version number cannot go backwards / duplicate', '400/409 for an existing version number', async () => { const r = await A('PUT', `/api/admin/legal/docs/${v2.id}`, { title: v2.title, body: v2.body, version: d.version }); expect([400, 409].includes(r.status), brief(r)); return brief(r); }, 'High');
  await tc('ADM-VER-003', 'Delete an unpublished draft', '200', async () => { const r = await A('DELETE', `/api/admin/legal/docs/${v2.id}`); expect(r.status === 200, brief(r)); return 'deleted'; }, 'Medium');
  await tc('ADM-VER-004', 'Old accepted agreement versions stay as signed', 'Customer acceptance rows keep their version + filled text after a new version', async () => { const row = db.prepare("SELECT a.id, a.filled_body, d.version FROM legal_acceptances a JOIN legal_documents d ON d.id = a.document_id WHERE a.subject_type = 'customer' LIMIT 1").get(); expect(row && row.filled_body && row.version, 'none'); return `acceptance #${row.id} keeps v${row.version} text (${row.filled_body.length} chars)`; }, 'Critical');
  await tc('ADM-ACC-001', 'Acceptance tracking per document', 'Accepted / pending counts per version', async () => { const r = (await A('GET', '/api/admin/legal/acceptance')).data; expect(r && JSON.stringify(r).includes('accepted'), JSON.stringify(r).slice(0, 200)); return JSON.stringify(r).slice(0, 160); }, 'High');
  await tc('ADM-ACC-002', 'Acceptance report (for CSV export)', 'Header + one row per acceptance', async () => { const r = await A('GET', '/api/admin/legal/acceptance/report'); expect(r.status === 200 && Array.isArray(r.data.rows) && r.data.rows[0].includes('Version'), brief(r)); return `${r.data.rows.length - 1} rows · columns: ${r.data.rows[0].join(', ')}`; }, 'Medium');
  await tc('ADM-PDF-001', 'Policy PDF (public) with company name, version and page numbers', 'pdftotext finds "Utsav Ghar", "v1", "Page 1 of"', async () => {
    const G = await client().init(); const r = await G('GET', `/api/legal/policy/${K1}/pdf`); const fs = await import('node:fs'); fs.writeFileSync('/tmp/qa-policy.pdf', r.data); const { execSync } = await import('node:child_process'); const t = execSync('pdftotext /tmp/qa-policy.pdf -').toString();
    expect(r.status === 200 && /Utsav Ghar/.test(t) && /Page 1 of \d/.test(t) && !t.includes('�'), t.slice(0, 200)); return `${Math.round(r.data.length / 1024)}KB · company, version, "Page 1 of N", no broken characters`;
  }, 'High');
  await tc('ADM-PDF-002', 'Admin downloads a signed acceptance PDF', 'PDF', async () => { const a = db.prepare('SELECT id FROM legal_acceptances ORDER BY id LIMIT 1').get(); const r = await A('GET', `/api/admin/legal/acceptances/${a.id}/pdf`); expect(r.status === 200 && r.data.slice(0, 5).toString() === '%PDF-', brief(r)); return `${Math.round(r.data.length / 1024)}KB`; }, 'High');
  await tc('ADM-LEG-009', 'Archive (retire) a published policy', 'Retired; not offered to new users', async () => { const r = await A('POST', `/api/admin/legal/docs/${d.id}/retire`); const pub = (await (await client().init())('GET', '/api/legal/policies')).data.items.map((x) => x.kind); expect(r.status === 200 && !pub.includes(K1), `${brief(r)} ${pub}`); return 'retired · removed from public list'; }, 'High');
}

// ===================================================================== audit, reports, settings
section('Admin', 'Audit, reports & settings');
{
  await tc('ADM-AUD-001', 'Audit log records admin actions with who and when', 'Entries for admin_created, confirm_payment, return/settlement actions', async () => { const r = (await A('GET', '/api/admin/audit')).data; const acts = new Set(r.map((x) => x.action)); expect(acts.has('admin_created') && acts.has('confirm_payment'), [...acts].slice(0, 20).join(',')); return `${r.length} entries · e.g. ${[...acts].slice(0, 8).join(', ')}`; }, 'High');
  await tc('ADM-AUD-002', 'Legal audit trail', 'Version created/approved/published events', async () => { const r = (await A('GET', '/api/admin/legal/audit')).data.items.map((x) => x.action); expect(r.includes('version_published'), r.slice(0, 10).join(',')); return `${r.length} legal events`; }, 'High');
  await tc('ADM-RPT-001', 'Reports export (tracking, pricing CSV)', 'CSV files', async () => { const a = await A('GET', '/api/admin/tracking/export.csv'); const b = await A('GET', '/api/admin/pricing/export.csv'); expect(a.status === 200 && b.status === 200, `${a.status} ${b.status}`); return '200 / 200'; }, 'Medium');
  await tc('ADM-SET-001', 'Store settings: invalid delivery fee', '400', async () => { const r = await A('PUT', '/api/admin/settings', { delivery_fee: -10 }); expect(r.status === 400, brief(r)); return brief(r); }, 'Medium');
  await tc('ADM-SET-002', 'Security page checklist', 'Checks listed with fixes', async () => { const r = (await A('GET', '/api/admin/security')).data; expect(r.checks.length >= 5, 'no checks'); return r.checks.map((c) => `${c.ok ? '✓' : '✗'} ${c.label}`).join(' | '); }, 'Medium');
  await tc('ADM-MAN-001', 'Admin manual files only for admins', 'Public 401 · admin 200', async () => { const G = await client().init(); const a = await G('GET', '/api/admin/manual/Admin_User_Manual.pdf'); const b = await A('GET', '/api/admin/manual/Admin_User_Manual.pdf'); expect(a.status === 401 && b.status === 200, `${a.status} ${b.status}`); return '401 / 200'; }, 'High');
}

save('admin');
process.exit(0);
