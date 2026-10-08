// QA · Customer: registration, OTP, login, forgot password, profile, addresses, catalog, cart, checkout,
// payment, orders, tracking, cancellation, returns, refunds, legal.   node test/qa/qa-customer.mjs
import { client, tc, section, expect, brief, save, db, CONSENTS, phone, uniq, newCustomer, ownerClient, inStockProduct, placeOrder, PNG, blob, sleep } from './lib.mjs';

const A = await ownerClient();
const REG = (o = {}) => ({ name: 'Anjali Sharma', email: `anjali.${uniq()}@example.com`, phone: phone('99'), password: 'Marigold-Lamp-77', confirm_password: 'Marigold-Lamp-77',
  address: '7 Laxmi Road, Sadashiv Peth', city: 'Pune', state: 'Maharashtra', pincode: '411030', country: 'India', consents: CONSENTS, ...o });
const userCount = () => db.prepare('SELECT COUNT(*) n FROM users').get().n;

// ===================================================================== registration
section('Customer', 'Registration');
{
  const C = await client().init();
  const b = REG();
  await tc('CUS-REG-001', 'Invalid email format', '400 with email field error', async () => { const r = await C('POST', '/api/auth/register/otp', { email: 'anjali@', phone: b.phone }); expect(r.status === 400 && r.data.fields?.email, brief(r)); return brief(r); });
  await tc('CUS-REG-002', 'Invalid mobile (9 digits / starts with 5)', '400 phone error', async () => { const r = await C('POST', '/api/auth/register/otp', { email: b.email, phone: '5123456789' }); const r2 = await C('POST', '/api/auth/register/otp', { email: b.email, phone: '98765' }); expect(r.status === 400 && r2.status === 400 && r.data.fields?.phone, brief(r)); return `${r.status} / ${r2.status}`; });
  await tc('CUS-REG-003', 'Mobile with +91 and spaces is normalised', 'Accepted (code sent)', async () => { const r = await C('POST', '/api/auth/register/otp', { email: b.email, phone: `+91 ${b.phone.slice(0, 5)} ${b.phone.slice(5)}` }); expect(r.status === 200 && r.data.dev_otp, brief(r)); b.otp = r.data.dev_otp; return `200, sent to ${r.data.sent_to}`; });
  await tc('CUS-REG-004', 'Resend code within 30 seconds', '429 "Please wait N seconds"', async () => { const r = await C('POST', '/api/auth/register/otp', { email: b.email, phone: b.phone }); expect(r.status === 429 && /wait/i.test(r.data.error), brief(r)); return brief(r); });
  await tc('CUS-REG-005', 'Weak password (common)', '400 password field error, no account', async () => { const n = userCount(); const r = await C('POST', '/api/auth/register', { ...b, password: 'password123', confirm_password: 'password123' }); expect(r.status === 400 && r.data.fields?.password && userCount() === n, brief(r)); return `${brief(r)} · ${r.data.fields.password}`; });
  await tc('CUS-REG-006', 'Password mismatch', '400 confirm_password error', async () => { const r = await C('POST', '/api/auth/register', { ...b, confirm_password: 'Different-1234' }); expect(r.status === 400 && r.data.fields?.confirm_password, brief(r)); return brief(r); });
  await tc('CUS-REG-007', 'All mandatory fields empty', '400 listing every missing field', async () => { const r = await C('POST', '/api/auth/register', {}); expect(r.status === 400 && Object.keys(r.data.fields || {}).length >= 6, brief(r)); return `400 with ${Object.keys(r.data.fields).length} field errors`; });
  await tc('CUS-REG-008', 'Name of only spaces', '400 name error', async () => { const r = await C('POST', '/api/auth/register', { ...b, name: '     ' }); expect(r.status === 400 && r.data.fields?.name, brief(r)); return brief(r); });
  await tc('CUS-REG-009', 'Very long name (500 chars)', '400 — rejected, no crash', async () => { const r = await C('POST', '/api/auth/register', { ...b, name: 'A'.repeat(500) }); expect(r.status === 400, brief(r)); return brief(r); });
  await tc('CUS-REG-010', 'Mandatory legal box missing (privacy unticked)', '400 and account NOT created', async () => { const n = userCount(); const r = await C('POST', '/api/auth/register', { ...b, consents: { ...CONSENTS, privacy: false } }); expect(r.status === 400 && r.data.fields?.['consents.privacy'] && userCount() === n, brief(r)); return `${brief(r)} · users unchanged (${n})`; });
  await tc('CUS-REG-011', 'Consent sent as string "true" (bypass attempt)', '400 — only boolean true accepted', async () => { const r = await C('POST', '/api/auth/register', { ...b, consents: { understood: 'true', terms: 'true', privacy: 'true', policies: 'true' } }); expect(r.status === 400, brief(r)); return brief(r); });
  await tc('CUS-REG-012', 'No OTP entered', '400 otp field error', async () => { const r = await C('POST', '/api/auth/register', { ...b, otp: '' }); expect(r.status === 400 && r.data.fields?.otp, brief(r)); return `${brief(r)} · ${r.data.fields.otp}`; });
  await tc('CUS-REG-013', 'Incorrect OTP', '400 "Wrong code. N tries left"', async () => { const r = await C('POST', '/api/auth/register', { ...b, otp: b.otp === '111111' ? '222222' : '111111' }); expect(r.status === 400 && /Wrong code/.test(r.data.fields?.otp), brief(r)); return r.data.fields.otp; });
  await tc('CUS-REG-014', 'OTP sent for a different email', '400 "different email"', async () => { const r = await C('POST', '/api/auth/register', { ...b, email: `other.${uniq()}@example.com`, otp: b.otp }); expect(r.status === 400 && /different email/.test(r.data.error || r.data.fields?.otp), brief(r)); return `${r.status} ${r.data.fields?.otp || r.data.error}`; });
  await tc('CUS-REG-015', 'Expired OTP (11 minutes old)', '400 "code has expired"', async () => {
    const C2 = await client().init(); const p2 = phone('98'); const e2 = `exp.${uniq()}@example.com`;
    const otp = (await C2('POST', '/api/auth/register/otp', { email: e2, phone: p2 })).data.dev_otp;
    db.prepare("UPDATE otp_codes SET expires_at = ? WHERE purpose = 'signup' AND target = ?").run(new Date(Date.now() - 6e4).toISOString(), p2);
    const r = await C2('POST', '/api/auth/register', { ...REG({ email: e2, phone: p2 }), otp }); expect(r.status === 400 && /expired/.test(r.data.fields?.otp), brief(r)); return r.data.fields.otp;
  });
  await tc('CUS-REG-016', '5 wrong OTPs lock the code', '429 after the 5th wrong try; correct code then refused', async () => {
    const C2 = await client().init(); const p2 = phone('98'); const e2 = `lock.${uniq()}@example.com`;
    const otp = (await C2('POST', '/api/auth/register/otp', { email: e2, phone: p2 })).data.dev_otp; const wrong = otp === '000000' ? '999999' : '000000';
    let last; for (let i = 0; i < 5; i++) last = await C2('POST', '/api/auth/register', { ...REG({ email: e2, phone: p2 }), otp: wrong });
    const after = await C2('POST', '/api/auth/register', { ...REG({ email: e2, phone: p2 }), otp });
    expect(last.status === 429 && after.status === 429, `${brief(last)} then ${brief(after)}`); return `5th: ${last.status}; correct after lock: ${after.status} (${after.data.error})`;
  });
  await tc('CUS-REG-017', 'More than 5 codes in an hour', '429 "Too many codes"', async () => {
    const C2 = await client().init(); const p2 = phone('98'); const e2 = `many.${uniq()}@example.com`;
    for (let i = 0; i < 5; i++) { await C2('POST', '/api/auth/register/otp', { email: e2, phone: p2 }); db.prepare("UPDATE otp_codes SET sent_at = ? WHERE purpose = 'signup' AND target = ?").run(new Date(Date.now() - 31e3).toISOString(), p2); }
    const r = await C2('POST', '/api/auth/register/otp', { email: e2, phone: p2 }); expect(r.status === 429 && /Too many/.test(r.data.error), brief(r)); return brief(r);
  });
  await tc('CUS-REG-018', 'Valid registration with OTP + all boxes', '201, signed in, consents recorded with version & time', async () => {
    const r = await C('POST', '/api/auth/register', { ...b, otp: b.otp }); expect(r.status === 201, brief(r));
    const me = (await C('GET', '/api/auth/me')).data.user; const leg = (await C('GET', '/api/account/legal')).data;
    expect(me?.email === b.email && leg.items.length >= 3 && leg.items.every((x) => x.version && x.accepted_at), JSON.stringify(leg.items?.[0]));
    const u = db.prepare('SELECT phone_verified_at FROM users WHERE email = ?').get(b.email); expect(u.phone_verified_at, 'phone_verified_at empty');
    return `201 · ${leg.items.length} acceptances (${leg.items.map((x) => `${x.kind} v${x.version}`).join(', ')}) · mobile verified`;
  }, 'Critical');
  await tc('CUS-REG-019', 'Same OTP reused for a second account', '400 — code is consumed after use', async () => { const r = await C('POST', '/api/auth/register', { ...REG({ phone: b.phone }), otp: b.otp }); expect(r.status === 409 || r.status === 400, brief(r)); return brief(r); });
  await tc('CUS-REG-020', 'Duplicate email', '409 "already exists"', async () => { const r = await (await client().init())('POST', '/api/auth/register/otp', { email: b.email.toUpperCase(), phone: phone('98') }); expect(r.status === 409 && r.data.fields?.email, brief(r)); return brief(r); });
  await tc('CUS-REG-021', 'Duplicate mobile', '409 "mobile already registered"', async () => { const r = await (await client().init())('POST', '/api/auth/register/otp', { email: `x.${uniq()}@example.com`, phone: b.phone }); expect(r.status === 409 && r.data.fields?.phone, brief(r)); return brief(r); });
  await tc('CUS-REG-022', 'Hindi name and special characters (Unicode)', '201 — name stored exactly', async () => { const c2 = await newCustomer({ name: "अंजलि D'Souza-Rao" }); expect(c2.user.name === "अंजलि D'Souza-Rao", c2.user.name); return c2.user.name; }, 'Medium');
  await tc('CUS-REG-023', 'Bot honeypot field filled', '400 blocked', async () => { const r = await (await client().init())('POST', '/api/auth/register/otp', { email: `bot.${uniq()}@example.com`, phone: phone('98'), website: 'http://spam' }); expect(r.status === 400, brief(r)); return brief(r); }, 'Low');
}

// ===================================================================== login / forgot password / sessions
section('Customer', 'Login & password');
const CU = await newCustomer({ name: 'Rohan Iyer' });
{
  await tc('CUS-LOG-001', 'Correct credentials', '200 and session cookie', async () => { const L = await client().init(); const r = await L('POST', '/api/auth/login', { email: CU.email, password: CU.password }); expect(r.status === 200 && L.jar.sa_session, brief(r)); return '200 · sa_session set (HttpOnly)'; }, 'Critical');
  await tc('CUS-LOG-002', 'Wrong password', '401 generic message', async () => { const L = await client().init(); const r = await L('POST', '/api/auth/login', { email: CU.email, password: 'nope-nope' }); expect(r.status === 401 && r.data.error === 'Incorrect email or password.', brief(r)); return brief(r); });
  await tc('CUS-LOG-003', 'Unknown email gives the same message', '401 identical text (no account enumeration)', async () => { const L = await client().init(); const r = await L('POST', '/api/auth/login', { email: `nobody.${uniq()}@example.com`, password: 'whatever1' }); expect(r.status === 401 && r.data.error === 'Incorrect email or password.', brief(r)); return brief(r); });
  await tc('CUS-LOG-004', 'Empty email and password', '400', async () => { const r = await (await client().init())('POST', '/api/auth/login', { email: '', password: '' }); expect(r.status === 400, brief(r)); return brief(r); });
  await tc('CUS-LOG-005', '5 wrong passwords lock sign-in', '429 on the 5th, even the right password refused', async () => {
    const V = await newCustomer(); const L = await client().init(); let r;
    for (let i = 0; i < 5; i++) r = await L('POST', '/api/auth/login', { email: V.email, password: `wrong-${i}-x` });
    const good = await L('POST', '/api/auth/login', { email: V.email, password: V.password });
    expect(r.status === 429 && good.status === 429, `${r.status} / ${good.status}`); return `5th → ${r.status}; correct password while locked → ${good.status}`;
  });
  await tc('CUS-LOG-006', 'Forgot password for unknown email', '200 generic message, no code', async () => { const r = await (await client().init())('POST', '/api/auth/password/forgot', { email: `ghost.${uniq()}@example.com` }); expect(r.status === 200 && !r.data.dev_otp && /If an account exists/.test(r.data.message), brief(r)); return r.data.message; });
  const F = await client().init();
  let code;
  await tc('CUS-LOG-007', 'Forgot password for a real account', '200 same message; code sent to email + mobile', async () => { const r = await F('POST', '/api/auth/password/forgot', { email: CU.email }); code = r.data.dev_otp; expect(r.status === 200 && /^\d{6}$/.test(code), brief(r)); const n = db.prepare("SELECT COUNT(*) n FROM notifications WHERE template = 'otp_reset_user' AND recipient IN (?, ?)").get(CU.email, CU.phone).n; expect(n >= 2, `notifications ${n}`); return `200 · ${n} messages queued (email + WhatsApp)`; });
  await tc('CUS-LOG-008', 'Reset with wrong code', '400 otp error', async () => { const r = await F('POST', '/api/auth/password/reset', { email: CU.email, otp: code === '123123' ? '321321' : '123123', password: 'New-Diya-Light-9', confirm_password: 'New-Diya-Light-9' }); expect(r.status === 400 && r.data.fields?.otp, brief(r)); return r.data.fields.otp; });
  await tc('CUS-LOG-009', 'Reset with weak new password', '400 password error (code kept)', async () => { const r = await F('POST', '/api/auth/password/reset', { email: CU.email, otp: code, password: 'password1', confirm_password: 'password1' }); expect(r.status === 400 && r.data.fields?.password, brief(r)); return r.data.fields.password; });
  const before = await client().init(); await before('POST', '/api/auth/login', { email: CU.email, password: CU.password });
  await tc('CUS-LOG-010', 'Reset with the right code', '200; old sessions signed out; new password works; old fails', async () => {
    const r = await F('POST', '/api/auth/password/reset', { email: CU.email, otp: code, password: 'New-Diya-Light-9', confirm_password: 'New-Diya-Light-9' }); expect(r.status === 200, brief(r));
    const stale = (await before('GET', '/api/auth/me')).data.user; const L = await client().init();
    const okNew = (await L('POST', '/api/auth/login', { email: CU.email, password: 'New-Diya-Light-9' })).status; const oldPw = (await (await client().init())('POST', '/api/auth/login', { email: CU.email, password: CU.password })).status;
    expect(stale === null && okNew === 200 && oldPw === 401, `stale=${JSON.stringify(stale)} new=${okNew} old=${oldPw}`); CU.password = 'New-Diya-Light-9'; return 'old session → signed out · new password 200 · old password 401';
  }, 'Critical');
  await tc('CUS-LOG-011', 'Reset code used twice', '400 (single use)', async () => { const r = await F('POST', '/api/auth/password/reset', { email: CU.email, otp: code, password: 'Another-Lamp-77', confirm_password: 'Another-Lamp-77' }); expect(r.status === 400, brief(r)); return brief(r); });
  await tc('CUS-LOG-012', 'Expired reset code', '400 "expired"', async () => {
    const G = await client().init(); const c2 = (await G('POST', '/api/auth/password/forgot', { email: CU.email })).data.dev_otp;
    db.prepare("UPDATE otp_codes SET expires_at = ? WHERE purpose = 'reset_user'").run(new Date(Date.now() - 1000).toISOString());
    const r = await G('POST', '/api/auth/password/reset', { email: CU.email, otp: c2, password: 'Another-Lamp-77', confirm_password: 'Another-Lamp-77' }); expect(r.status === 400 && /expired/.test(r.data.fields?.otp), brief(r)); return r.data.fields.otp;
  });
  await tc('CUS-LOG-013', 'Logout', '200; /auth/me returns null', async () => { const L = await client().init(); await L('POST', '/api/auth/login', { email: CU.email, password: CU.password }); await L('POST', '/api/auth/logout'); const me = (await L('GET', '/api/auth/me')).data.user; expect(me === null, JSON.stringify(me)); return 'signed out'; });
  await tc('CUS-LOG-014', 'Tampered session cookie', 'Treated as signed out', async () => { const L = await client().init(); L.jar.sa_session = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOjEsImtpbmQiOiJ1c2VyIn0.forged'; const me = (await L('GET', '/api/auth/me')).data.user; const r = await L('GET', '/api/account/orders'); expect(me === null && r.status === 401, brief(r)); return `me=null · /account/orders ${r.status}`; }, 'Critical');
  await tc('CUS-LOG-015', 'Expired session (JWT exp in the past)', '401 on account pages', async () => {
    const { default: jwt } = await import('jsonwebtoken'); const L = await client().init(); L.jar.sa_session = jwt.sign({ sub: CU.user.id, kind: 'user', v: 0, exp: Math.floor(Date.now() / 1000) - 60 }, 'unknown-secret');
    const r = await L('GET', '/api/account/orders'); expect(r.status === 401, brief(r)); return brief(r);
  });
  await tc('CUS-LOG-016', 'Two devices + "sign out everywhere"', 'Both sessions end', async () => {
    const d1 = await client().init(); const d2 = await client().init(); await d1('POST', '/api/auth/login', { email: CU.email, password: CU.password }); await d2('POST', '/api/auth/login', { email: CU.email, password: CU.password });
    const both = (await d1('GET', '/api/auth/me')).data.user && (await d2('GET', '/api/auth/me')).data.user; await d1('POST', '/api/account/logout-all');
    const after = (await d2('GET', '/api/auth/me')).data.user; expect(both && after === null, `${!!both} ${JSON.stringify(after)}`); return 'device 2 signed out after device 1 chose sign out everywhere';
  });
}

await CU('POST', '/api/auth/login', { email: CU.email, password: CU.password }); // signed out everywhere above
// ===================================================================== profile & addresses
section('Customer', 'Profile & addresses');
const P = await newCustomer({ name: 'Meera Kulkarni' });
{
  await tc('CUS-PRO-001', 'View profile', '/auth/me returns name, email, mobile', async () => { const u = (await P('GET', '/api/auth/me')).data.user; expect(u.email === P.email && u.phone === P.phone, JSON.stringify(u)); return `${u.name} · ${u.email} · ${u.phone}`; });
  await tc('CUS-PRO-002', 'Edit name and mobile', '200 and saved', async () => { const np = phone('96'); const r = await P('PUT', '/api/account/profile', { name: 'Meera K.', phone: np }); expect(r.status === 200 && (await P('GET', '/api/auth/me')).data.user.phone === np, brief(r)); P.phone = np; return 'saved'; });
  await tc('CUS-PRO-003', 'Mobile already used by another account', '409', async () => { const r = await P('PUT', '/api/account/profile', { name: 'Meera K.', phone: CU.phone }); expect(r.status === 409 && r.data.fields?.phone, brief(r)); return brief(r); });
  await tc('CUS-PRO-004', 'Invalid mobile in profile', '400', async () => { const r = await P('PUT', '/api/account/profile', { name: 'Meera K.', phone: '12345' }); expect(r.status === 400, brief(r)); return brief(r); });
  let ecode; const newEmail = `meera.new.${uniq()}@example.com`;
  await tc('CUS-PRO-005', 'Change email — wrong password', '400 password error', async () => { const r = await P('POST', '/api/account/email/otp', { email: newEmail, password: 'wrong-pass' }); expect(r.status === 400 && r.data.fields?.password, brief(r)); return brief(r); });
  await tc('CUS-PRO-006', 'Change email — address used by someone else', '409', async () => { const r = await P('POST', '/api/account/email/otp', { email: CU.email, password: P.password }); expect(r.status === 409, brief(r)); return brief(r); });
  await tc('CUS-PRO-007', 'Change email — code to the new address, then confirm', '200; can sign in with the new email', async () => {
    const r = await P('POST', '/api/account/email/otp', { email: newEmail, password: P.password }); ecode = r.data.dev_otp; expect(r.status === 200, brief(r));
    const c = await P('POST', '/api/account/email', { otp: ecode }); expect(c.status === 200 && c.data.user.email === newEmail, brief(c));
    const L = await client().init(); expect((await L('POST', '/api/auth/login', { email: newEmail, password: P.password })).status === 200, 'login with new email failed'); P.email = newEmail; return 'email changed; sign-in with new email works; old email notified';
  });
  let addrs;
  await tc('CUS-ADR-001', 'Sign-up address saved as default', '1 address, default', async () => { addrs = (await P('GET', '/api/account/addresses')).data; expect(addrs.length === 1 && addrs[0].is_default === 1, JSON.stringify(addrs)); return `${addrs.length} · default`; });
  const office = { label: 'Office', name: 'Meera K.', phone: P.phone, line1: '5th floor, Tech Park, Kharadi', city: 'Pune', state: 'Maharashtra', pincode: '411014' };
  let off;
  await tc('CUS-ADR-002', 'Add address', '201', async () => { const r = await P('POST', '/api/account/addresses', office); off = r.data; expect(r.status === 201 && off.is_default === 0, brief(r)); return `201 · id ${off.id}`; });
  await tc('CUS-ADR-003', 'Add address with bad PIN', '400 pincode error', async () => { const r = await P('POST', '/api/account/addresses', { ...office, pincode: '01234' }); expect(r.status === 400 && r.data.fields?.pincode, brief(r)); return brief(r); });
  await tc('CUS-ADR-004', 'Edit address', '200 and changed', async () => { const r = await P('PUT', `/api/account/addresses/${off.id}`, { ...office, line1: '6th floor, Tech Park, Kharadi' }); expect(r.status === 200 && r.data.line1.startsWith('6th'), brief(r)); return 'updated'; });
  await tc('CUS-ADR-005', 'Set as default', 'Only the chosen address is default', async () => { await P('POST', `/api/account/addresses/${off.id}/default`); const l = (await P('GET', '/api/account/addresses')).data; expect(l.filter((a) => a.is_default).length === 1 && l.find((a) => a.id === off.id).is_default, JSON.stringify(l.map((a) => [a.id, a.is_default]))); return 'one default'; });
  await tc('CUS-ADR-006', 'Delete the default address', 'Another address becomes default', async () => { await P('DELETE', `/api/account/addresses/${off.id}`); const l = (await P('GET', '/api/account/addresses')).data; expect(l.length === 1 && l[0].is_default === 1, JSON.stringify(l)); return 'remaining address is default'; });
  await tc('CUS-ADR-007', "Edit / delete another customer's address (IDOR)", '404, nothing changed', async () => { const theirs = (await CU('GET', '/api/account/addresses')).data[0]; const r1 = await P('PUT', `/api/account/addresses/${theirs.id}`, office); const r2 = await P('DELETE', `/api/account/addresses/${theirs.id}`); const still = (await CU('GET', '/api/account/addresses')).data.some((a) => a.id === theirs.id); expect(r1.status === 404 && r2.status === 404 && still, `${r1.status} ${r2.status} ${still}`); return '404 / 404 · address intact'; }, 'Critical');
  await tc('CUS-ADR-008', 'Address limit (10)', '11th refused with 400', async () => { for (let i = 0; i < 9; i++) await P('POST', '/api/account/addresses', { ...office, label: `A${i}` }); const r = await P('POST', '/api/account/addresses', office); expect(r.status === 400 && /10/.test(r.data.error), brief(r)); return brief(r); }, 'Low');
}

// ===================================================================== catalog
section('Customer', 'Search & product');
{
  const G = await client().init();
  await tc('CUS-CAT-001', 'Search "diya"', 'Results containing diya', async () => { const r = await G('GET', '/api/products?q=diya'); expect(r.status === 200 && r.data.total > 0 && /diya/i.test(r.data.items[0].name + r.data.items[0].category_name), brief(r)); return `${r.data.total} results, first: ${r.data.items[0].name}`; });
  await tc('CUS-CAT-002', 'Misspelt search "diyaa lamp"', 'Corrected results', async () => { const r = await G('GET', '/api/products?q=diyaa'); expect(r.status === 200 && r.data.total > 0, brief(r)); return `${r.data.total} results${r.data.corrected ? `, corrected to "${r.data.corrected}"` : ''}`; }, 'Low');
  await tc('CUS-CAT-003', 'No results', '200, empty list', async () => { const r = await G('GET', '/api/products?q=zzqqxxyy'); expect(r.status === 200 && r.data.items.length === 0, brief(r)); return `total ${r.data.total}`; }, 'Medium');
  await tc('CUS-CAT-004', 'SQL-like and script text in search', '200, no error', async () => { const r1 = await G('GET', `/api/products?q=${encodeURIComponent("' OR 1=1 --")}`); const r2 = await G('GET', `/api/products?q=${encodeURIComponent('<script>alert(1)</script>')}`); expect(r1.status === 200 && r2.status === 200, `${r1.status} ${r2.status}`); return '200 / 200'; }, 'High');
  await tc('CUS-CAT-005', 'Search longer than 80 characters', '400 friendly error (no crash)', async () => { const r = await G('GET', `/api/products?q=${'a'.repeat(200)}`); expect(r.status === 400, brief(r)); return brief(r); }, 'Low');
  await tc('CUS-CAT-006', 'Category filter', 'Only that category', async () => { const r = await G('GET', '/api/products?category=diyas-candles&limit=60'); expect(r.data.items.length && r.data.items.every((p) => p.category_slug === 'diyas-candles'), brief(r)); return `${r.data.items.length} items, all diyas-candles`; });
  await tc('CUS-CAT-007', 'Sort price low → high', 'Ascending prices', async () => { const p = (await G('GET', '/api/products?sort=price_asc&limit=60')).data.items.map((x) => x.price); expect(p.every((v, i) => i === 0 || v >= p[i - 1]), p.join(',')); return `${p.length} items ascending`; });
  await tc('CUS-CAT-008', 'Sort price high → low', 'Descending prices', async () => { const p = (await G('GET', '/api/products?sort=price_desc&limit=60')).data.items.map((x) => x.price); expect(p.every((v, i) => i === 0 || v <= p[i - 1]), p.join(',')); return 'descending'; }, 'Medium');
  await tc('CUS-CAT-009', 'Price range filter', 'All prices inside the range', async () => { const r = (await G('GET', '/api/products?min=100&max=500&limit=60')).data; expect(r.items.every((p) => p.price >= 10000 && p.price <= 50000), 'out of range'); return `${r.items.length} items between ₹100–500`; }, 'Medium');
  await tc('CUS-CAT-010', 'Pagination', 'Page 1 and 2 have different items; pages count right', async () => { const a = (await G('GET', '/api/products?limit=5&page=1')).data; const b = (await G('GET', '/api/products?limit=5&page=2')).data; expect(a.pages === Math.ceil(a.total / 5) && !a.items.some((x) => b.items.some((y) => y.id === x.id)), 'overlap'); return `${a.total} total, ${a.pages} pages, no overlap`; }, 'Medium');
  await tc('CUS-CAT-011', 'Bad page / limit values', '400 for limit=0 and limit=1000', async () => { const r1 = await G('GET', '/api/products?limit=0'); const r2 = await G('GET', '/api/products?limit=1000'); expect(r1.status === 400 && r2.status === 400, `${r1.status} ${r2.status}`); return '400 / 400'; }, 'Low');
  const any = (await G('GET', '/api/products?limit=1')).data.items[0];
  await tc('CUS-CAT-012', 'Product details', '200 with price, stock status, images, no cost price', async () => { const r = await G('GET', `/api/products/${any.slug}`); expect(r.status === 200 && r.data.product?.price > 0 && r.data.product.stock_status && r.data.product.cost_price === undefined, brief(r)); return `${r.data.product.name} · ${r.data.product.stock_status}`; }, 'High');
  await tc('CUS-CAT-013', 'Unknown product', '404', async () => { const r = await G('GET', '/api/products/does-not-exist-xyz'); expect(r.status === 404, brief(r)); return brief(r); }, 'Low');
  await tc('CUS-CAT-014', 'Public product API never exposes cost or exact stock', 'No cost_price / stock fields in list', async () => { const r = (await G('GET', '/api/products?limit=60')).data; const s = JSON.stringify(r.items); expect(!/"cost_price"|"stock":\d/.test(s), 'leak'); return 'no cost_price, no exact stock'; }, 'Critical');
}

// ===================================================================== cart, checkout & totals
section('Customer', 'Cart & checkout');
const B = await newCustomer({ name: 'Kiran Desai' });
const p1 = await inStockProduct(B, 20);
{
  await tc('CUS-CRT-001', 'Quote: total = subtotal − discount + delivery', 'Arithmetic holds for 1, 2, 3 and 5 pieces', async () => {
    const out = [];
    for (const qty of [1, 2, 3, 5]) { const q = (await B('POST', '/api/cart/quote', { items: [{ productId: p1.id, qty }], pincode: '411001' })).data; expect(q.total === q.subtotal - q.discount + q.delivery, JSON.stringify(q)); expect(q.subtotal === p1.price * qty, `subtotal ${q.subtotal} vs ${p1.price * qty}`); out.push(`${qty}pc: ₹${q.subtotal / 100}−${q.discount / 100}+${q.delivery / 100}=₹${q.total / 100}`); }
    return out.join(' · ');
  }, 'Critical');
  await tc('CUS-CRT-002', 'Buy More Save More tiers (2 → 10%, 3 → 20%, 5 → 30%)', 'Discount percent matches the tier', async () => {
    const pct = []; for (const qty of [2, 3, 5]) { const q = (await B('POST', '/api/cart/quote', { items: [{ productId: p1.id, qty }] })).data; pct.push(Math.round((100 * q.discount) / q.subtotal)); }
    return `discount % for 2/3/5 pieces: ${pct.join(' / ')}`;
  }, 'High');
  await tc('CUS-CRT-003', 'Quantity 0 / 100 / text', '400 for each', async () => { const a = await B('POST', '/api/cart/quote', { items: [{ productId: p1.id, qty: 0 }] }); const b = await B('POST', '/api/cart/quote', { items: [{ productId: p1.id, qty: 100 }] }); const c = await B('POST', '/api/cart/quote', { items: [{ productId: p1.id, qty: 'abc' }] }); expect([a, b, c].every((x) => x.status === 400), `${a.status} ${b.status} ${c.status}`); return '400 / 400 / 400'; }, 'Medium');
  await tc('CUS-CRT-004', 'More than in stock', 'Quote flags the line; order refused 409', async () => {
    const stock = db.prepare('SELECT stock FROM inventory WHERE product_id = ?').get(p1.id).stock; const q = (await B('POST', '/api/cart/quote', { items: [{ productId: p1.id, qty: Math.min(99, stock + 1) }] })).data;
    const r = await B('POST', '/api/orders', { items: [{ productId: p1.id, qty: Math.min(99, stock + 1) }], customer: { name: 'Kiran', phone: B.phone, email: B.email }, address: { line1: '1 Test Street Area', city: 'Pune', state: 'Maharashtra', pincode: '411001' } });
    expect(stock + 1 > 99 || (q.errors?.length && r.status === 409), `${JSON.stringify(q.errors)} ${brief(r)}`); return stock + 1 > 99 ? `stock ${stock} ≥ 99 (max per line)` : `quote error ${q.errors[0]?.code} · order ${r.status}`;
  }, 'High');
  await tc('CUS-CRT-005', 'Invalid coupon', 'Quote shows couponError; no discount', async () => { const q = (await B('POST', '/api/cart/quote', { items: [{ productId: p1.id, qty: 1 }], couponCode: 'FAKE99' })).data; expect(q.couponError, JSON.stringify(q)); return q.couponError; }, 'Medium');
  await tc('CUS-CRT-006', 'Cart saved to the account (persistence)', 'Cart returned after signing in on another device', async () => {
    await B('PUT', '/api/account/cart', { items: [{ productId: p1.id, qty: 2 }], couponCode: '' }); const L = await client().init(); await L('POST', '/api/auth/login', { email: B.email, password: B.password });
    const c = (await L('GET', '/api/account/cart')).data; expect(JSON.stringify(c).includes(String(p1.id)), JSON.stringify(c)); return 'same cart on second device';
  }, 'Medium');
  await tc('CUS-CHK-001', 'Price/offer changed between quote and order', '409 with the new quote', async () => { const r = await B('POST', '/api/orders', { items: [{ productId: p1.id, qty: 1 }], customer: { name: 'Kiran', phone: B.phone, email: B.email }, address: { line1: '1 Test Street Area', city: 'Pune', state: 'Maharashtra', pincode: '411001' }, expectedTotal: 1 }); expect(r.status === 409 && r.data.quote, brief(r)); return brief(r); }, 'High');
  await tc('CUS-CHK-002', 'Missing address fields', '400 with field errors', async () => { const r = await B('POST', '/api/orders', { items: [{ productId: p1.id, qty: 1 }], customer: { name: 'K', phone: '123', email: 'bad' }, address: { line1: '', city: '', pincode: '1' } }); expect(r.status === 400, brief(r)); return brief(r); });
  await tc('CUS-CHK-003', 'Guest cannot order (account required)', '401 LOGIN_REQUIRED', async () => { const G = await client().init(); const r = await G('POST', '/api/orders', { items: [{ productId: p1.id, qty: 1 }], customer: { name: 'Guest', phone: '9876500000', email: 'g@example.com' }, address: { line1: '1 Test Street Area', city: 'Pune', state: 'Maharashtra', pincode: '411001' } }); expect(r.status === 401, brief(r)); return brief(r); }, 'High');
  let ord; const stock0 = db.prepare('SELECT stock FROM inventory WHERE product_id = ?').get(p1.id).stock;
  await tc('CUS-CHK-004', 'Place order', '201; order total = quote total; stock reduced', async () => {
    ord = await placeOrder(B, [{ productId: p1.id, qty: 2 }]); const stock1 = db.prepare('SELECT stock FROM inventory WHERE product_id = ?').get(p1.id).stock;
    const o = db.prepare('SELECT subtotal, discount, delivery_fee, total FROM orders WHERE id = ?').get(ord.id);
    expect(o.total === o.subtotal - o.discount + o.delivery_fee && stock1 === stock0 - 2, `${JSON.stringify(o)} stock ${stock0}→${stock1}`); return `#${ord.number} ₹${o.total / 100} = ${o.subtotal / 100} − ${o.discount / 100} + ${o.delivery_fee / 100} · stock ${stock0}→${stock1}`;
  }, 'Critical');
  B.order = ord;
  await tc('CUS-CHK-005', 'Order in the history', 'Listed in My Orders', async () => { const l = (await B('GET', '/api/account/orders')).data; expect(l.some((o) => o.order_number === ord.number), 'missing'); return `${l.length} order(s)`; });
  await tc('CUS-CHK-006', 'Order is transactional (one item out of stock)', 'No order row, no stock taken from the other item', async () => {
    const p2 = await inStockProduct(B, 3); const sA = db.prepare('SELECT stock FROM inventory WHERE product_id = ?').get(p2.id).stock; const before = db.prepare('SELECT COUNT(*) n FROM orders').get().n;
    const oos = db.prepare("SELECT p.id FROM products p JOIN inventory i ON i.product_id = p.id WHERE p.is_active = 1 AND p.id != ? AND p.is_bundle = 0 ORDER BY p.id LIMIT 1").get(p2.id).id; const keep = db.prepare('SELECT stock FROM inventory WHERE product_id = ?').get(oos).stock;
    db.prepare('UPDATE inventory SET stock = 0 WHERE product_id = ?').run(oos);
    const r = await B('POST', '/api/orders', { items: [{ productId: p2.id, qty: 1 }, { productId: oos, qty: 1 }], customer: { name: 'Kiran', phone: B.phone, email: B.email }, address: { line1: '1 Test Street Area', city: 'Pune', state: 'Maharashtra', pincode: '411001' } });
    const after = db.prepare('SELECT COUNT(*) n FROM orders').get().n; const sB = db.prepare('SELECT stock FROM inventory WHERE product_id = ?').get(p2.id).stock; db.prepare('UPDATE inventory SET stock = ? WHERE product_id = ?').run(keep, oos);
    expect(r.status === 409 && after === before && sA === sB, `${brief(r)} orders ${before}→${after} stock ${sA}→${sB}`); return `${r.status} · orders unchanged · stock unchanged`;
  }, 'Critical');
}

// ===================================================================== payment
section('Customer', 'Payment');
{
  const o = B.order; const hdr = { 'X-Order-Token': o.token };
  await tc('CUS-PAY-001', 'UTR in wrong format', '400', async () => { const r = await B('POST', `/api/orders/${o.number}/payment`, { txnRef: '12-34' }, hdr); expect(r.status === 400, brief(r)); return brief(r); });
  const utr = `5${String(Date.now()).slice(-11)}`;
  await tc('CUS-PAY-002', 'Submit valid UTR', '200 → Payment Verification Pending (not confirmed)', async () => { const r = await B('POST', `/api/orders/${o.number}/payment`, { txnRef: utr }, hdr); expect(r.status === 200 && r.data.payment_status === 'verification_pending', brief(r)); return r.data.payment_status; }, 'Critical');
  await tc('CUS-PAY-003', 'Submit payment twice', '409 already submitted', async () => { const r = await B('POST', `/api/orders/${o.number}/payment`, { txnRef: utr }, hdr); expect(r.status === 409, brief(r)); return brief(r); }, 'High');
  await tc('CUS-PAY-004', 'Same UTR on another order', '409 "already been used"', async () => { const o2 = await placeOrder(B, [{ productId: p1.id, qty: 1 }]); B.order2 = o2; const r = await B('POST', `/api/orders/${o2.number}/payment`, { txnRef: utr }, { 'X-Order-Token': o2.token }); expect(r.status === 409, brief(r)); return brief(r); }, 'Critical');
  await tc('CUS-PAY-005', 'Online gateway when not configured', '400 friendly message', async () => { const r = await B('POST', '/api/payments/gateway/create', { orderNumber: o.number, token: o.token }); expect(r.status === 400 && /UPI/.test(r.data.error), brief(r)); return brief(r); }, 'Medium');
  await tc('CUS-PAY-006', 'Gateway signature forged', '400 signature verification failed', async () => { const r = await B('POST', '/api/payments/gateway/verify', { razorpay_order_id: 'order_x', razorpay_payment_id: 'pay_x', razorpay_signature: 'deadbeef' }); expect(r.status === 400, brief(r)); return brief(r); }, 'Critical');
  await tc('CUS-PAY-007', 'Admin confirms payment', 'Payment Confirmed', async () => { const r = await A('POST', `/api/admin/orders/${o.id}/action`, { action: 'confirm_payment' }); expect(r.status === 200 && r.data.payment_status === 'confirmed', brief(r)); return r.data.status; }, 'Critical');
  await tc('CUS-PAY-008', 'Confirm the same payment again', '409', async () => { const r = await A('POST', `/api/admin/orders/${o.id}/action`, { action: 'confirm_payment' }); expect(r.status === 409, brief(r)); return brief(r); });
}

// ===================================================================== orders & tracking
section('Customer', 'Orders & tracking');
{
  const o = B.order;
  await tc('CUS-ORD-001', "Open another customer's order (IDOR)", '404', async () => { const r = await P('GET', `/api/orders/${o.number}`); expect(r.status === 404, brief(r)); return brief(r); }, 'Critical');
  await tc('CUS-ORD-002', 'Guest link with the order token', '200', async () => { const G = await client().init(); const r = await G('GET', `/api/orders/${o.number}`, null, { 'X-Order-Token': o.token }); expect(r.status === 200, brief(r)); return '200'; });
  await tc('CUS-ORD-003', 'Wrong order token', '404', async () => { const G = await client().init(); const r = await G('GET', `/api/orders/${o.number}`, null, { 'X-Order-Token': 'x'.repeat(32) }); expect(r.status === 404, brief(r)); return brief(r); }, 'Critical');
  await tc('CUS-ORD-004', 'Track with order number + right mobile', '200, personal data minimised', async () => { const G = await client().init(); const r = await G('POST', '/api/orders/track', { orderNumber: o.number, phone: B.phone }); expect(r.status === 200 && !r.data.address.line1 && !r.data.customer.phone, brief(r)); return `${r.data.status} · address shows city/PIN only`; }, 'High');
  await tc('CUS-ORD-005', 'Track with wrong mobile', '404', async () => { const G = await client().init(); const r = await G('POST', '/api/orders/track', { orderNumber: o.number, phone: '9000000001' }); expect(r.status === 404, brief(r)); return brief(r); }, 'High');
  await tc('CUS-ORD-006', 'Ship before processing', '409 invalid transition', async () => { const r = await A('POST', `/api/admin/orders/${o.id}/action`, { action: 'deliver' }); expect(r.status === 409, brief(r)); return brief(r); }, 'High');
  await tc('CUS-ORD-007', 'Process an unpaid order', '409', async () => { const r = await A('POST', `/api/admin/orders/${B.order2.id}/action`, { action: 'process' }); expect(r.status === 409, brief(r)); return brief(r); }, 'High');
}

// ===================================================================== cancellation
section('Customer', 'Cancellation');
{
  const C2 = await newCustomer({ name: 'Farah Khan' });
  const pp = await inStockProduct(C2, 5);
  const unpaid = await placeOrder(C2, [{ productId: pp.id, qty: 1 }]);
  const s0 = db.prepare('SELECT stock FROM inventory WHERE product_id = ?').get(pp.id).stock;
  await tc('CUS-CAN-001', 'Cancel without a reason', '400 reason error', async () => { const r = await C2('POST', `/api/orders/${unpaid.number}/cancel`, { reason: '' }); expect(r.status === 400, brief(r)); return brief(r); });
  await tc('CUS-CAN-002', 'Cancel an unpaid order', 'Cancelled, stock back, no refund opened', async () => { const r = await C2('POST', `/api/orders/${unpaid.number}/cancel`, { reason: 'Ordered by mistake' }); const s1 = db.prepare('SELECT stock FROM inventory WHERE product_id = ?').get(pp.id).stock; expect(r.status === 200 && r.data.status === 'cancelled' && s1 === s0 + 1 && r.data.after_sales.refunds.length === 0, `${brief(r)} stock ${s0}→${s1}`); return `cancelled · stock ${s0}→${s1} · refunds 0`; }, 'Critical');
  await tc('CUS-CAN-003', 'Cancel twice', '409', async () => { const r = await C2('POST', `/api/orders/${unpaid.number}/cancel`, { reason: 'again' }); expect(r.status === 409, brief(r)); return brief(r); });
  await tc('CUS-CAN-004', 'Pay for a cancelled order', '409', async () => { const r = await C2('POST', `/api/orders/${unpaid.number}/payment`, { txnRef: `6${String(Date.now()).slice(-11)}` }, { 'X-Order-Token': unpaid.token }); expect(r.status === 409, brief(r)); return brief(r); }, 'High');
  const paid = await placeOrder(C2, [{ productId: pp.id, qty: 2 }]);
  await A('POST', `/api/admin/orders/${paid.id}/action`, { action: 'confirm_payment' });
  await tc('CUS-CAN-005', 'Cancel a paid order before packing', 'Cancelled + full refund pending', async () => { const r = await C2('POST', `/api/orders/${paid.number}/cancel`, { reason: 'Delivery date is too late' }); const f = r.data.after_sales?.refunds?.[0]; expect(r.status === 200 && f && f.amount === paid.total && f.status === 'pending', brief(r)); return `refund ₹${f.amount / 100} pending (paid ₹${paid.total / 100})`; }, 'Critical');
  const late = await placeOrder(C2, [{ productId: pp.id, qty: 1 }]);
  await A('POST', `/api/admin/orders/${late.id}/action`, { action: 'confirm_payment' });
  const cur = (await A('GET', `/api/admin/orders/${late.id}`)).data;
  if (!cur.dealer?.current) await A('POST', `/api/admin/orders/${late.id}/action`, { action: 'process' });
  await tc('CUS-CAN-006', 'Cancel after packing / processing started', '409 "cannot be cancelled here"', async () => {
    if (cur.dealer?.current) db.prepare("UPDATE dealer_orders SET status = 'packed' WHERE order_id = ?").run(late.id);
    const r = await C2('POST', `/api/orders/${late.number}/cancel`, { reason: 'Changed mind' }); expect(r.status === 409, brief(r)); return brief(r);
  }, 'High');
  await tc('CUS-CAN-007', 'Admin cancels a paid order', 'Refund opened once; mark refunded', async () => {
    const r = await A('POST', `/api/admin/orders/${late.id}/action`, { action: 'cancel', note: 'Out of stock at warehouse' }); expect(r.status === 200, brief(r));
    const f = db.prepare("SELECT * FROM refunds WHERE order_id = ? AND kind = 'cancellation'").all(late.id); expect(f.length === 1, `${f.length} refunds`);
    const m = await A('POST', `/api/admin/orders/${late.id}/action`, { action: 'mark_refunded', note: 'RFND-UTR-778899' }); expect(m.status === 200 && m.data.payment_status === 'refunded', brief(m));
    const again = await A('POST', `/api/admin/orders/${late.id}/action`, { action: 'mark_refunded', note: 'RFND-UTR-778899' }); expect(again.status === 409, brief(again)); return '1 refund · refunded · second mark → 409';
  }, 'Critical');
}

// ===================================================================== returns & refunds
section('Customer', 'Returns & refunds');
{
  const R = await newCustomer({ name: 'Sanjay Patil' });
  const rp = await inStockProduct(R, 6);
  const o = await placeOrder(R, [{ productId: rp.id, qty: 3 }]);
  await A('POST', `/api/admin/orders/${o.id}/action`, { action: 'confirm_payment' });
  const fd = (obj, photo) => { const f = new FormData(); for (const [k, v] of Object.entries(obj)) f.append(k, typeof v === 'string' ? v : JSON.stringify(v)); if (photo) f.append('photo', blob(PNG, 'damage.png', 'image/png')); return f; };
  const itemId = db.prepare('SELECT id FROM order_items WHERE order_id = ?').get(o.id).id;
  await tc('CUS-RET-001', 'Return before delivery', '409', async () => { const r = await R('POST', `/api/orders/${o.number}/returns`, fd({ reason: 'quality', items: [{ order_item_id: itemId, qty: 1 }] })); expect(r.status === 409, brief(r)); return brief(r); }, 'High');
  // deliver: store path or dealer path
  const det = (await A('GET', `/api/admin/orders/${o.id}`)).data;
  if (det.dealer?.current) { db.prepare("UPDATE dealer_orders SET status = 'delivered', delivered_at = ? WHERE id = (SELECT MAX(id) FROM dealer_orders WHERE order_id = ?)").run(new Date().toISOString(), o.id); db.prepare("UPDATE orders SET status = 'delivered' WHERE id = ?").run(o.id); db.prepare("INSERT INTO order_events(order_id, status, note) VALUES(?, 'delivered', 'qa')").run(o.id); }
  else { for (const a of ['process', 'ship', 'deliver']) await A('POST', `/api/admin/orders/${o.id}/action`, { action: a, carrier: 'Delhivery', trackingNumber: 'QA123' }); }
  await tc('CUS-RET-002', 'Return without choosing a reason', '400', async () => { const r = await R('POST', `/api/orders/${o.number}/returns`, fd({ reason: '', items: [{ order_item_id: itemId, qty: 1 }] })); expect(r.status === 400, brief(r)); return brief(r); });
  await tc('CUS-RET-003', 'Return more pieces than bought', '409 "at most 3"', async () => { const r = await R('POST', `/api/orders/${o.number}/returns`, fd({ reason: 'quality', items: [{ order_item_id: itemId, qty: 5 }] })); expect(r.status === 400 || r.status === 409, brief(r)); return brief(r); }, 'High');
  await tc('CUS-RET-004', 'Item from another order', '400', async () => { const r = await R('POST', `/api/orders/${o.number}/returns`, fd({ reason: 'quality', items: [{ order_item_id: 999999, qty: 1 }] })); expect(r.status === 400, brief(r)); return brief(r); }, 'High');
  await tc('CUS-RET-005', 'Damaged item without a photo', '400 photo needed', async () => { const r = await R('POST', `/api/orders/${o.number}/returns`, fd({ reason: 'damaged', items: [{ order_item_id: itemId, qty: 1 }] })); expect(r.status === 400 && r.data.fields?.photo, brief(r)); return brief(r); });
  let rr;
  await tc('CUS-RET-006', 'Damaged item with photo', '201 Return requested; refund = paid share + delivery charge', async () => {
    const r = await R('POST', `/api/orders/${o.number}/returns`, fd({ reason: 'damaged', details: 'One diya cracked', items: [{ order_item_id: itemId, qty: 1 }] }, true)); expect(r.status === 201, brief(r)); rr = r.data.return;
    const row = db.prepare('SELECT line_total, discount_share, qty FROM order_items WHERE id = ?').get(itemId); const fee = db.prepare('SELECT delivery_fee FROM orders WHERE id = ?').get(o.id).delivery_fee; const want = Math.round((row.line_total - row.discount_share) / row.qty) + fee;
    expect(rr.refund_amount === want, `refund ${rr.refund_amount} vs expected ${want}`); return `${rr.number} · refund ₹${rr.refund_amount / 100} (incl. delivery ₹${fee / 100})`;
  }, 'Critical');
  await tc('CUS-RET-007', 'Second return while one is open', '409', async () => { const r = await R('POST', `/api/orders/${o.number}/returns`, fd({ reason: 'quality', items: [{ order_item_id: itemId, qty: 1 }] })); expect(r.status === 409, brief(r)); return brief(r); });
  await tc('CUS-RET-008', 'Admin raises refund above calculated amount', '409', async () => { const r = await A('POST', `/api/admin/returns/${rr.id}/action`, { action: 'approve', amount: rr.refund_amount / 100 + 50 }); expect(r.status === 409, brief(r)); return brief(r); }, 'Critical');
  await tc('CUS-RET-009', 'Reject without a reason', '409 reason required', async () => { const r = await A('POST', `/api/admin/returns/${rr.id}/action`, { action: 'reject' }); expect(r.status === 409, brief(r)); return brief(r); });
  await tc('CUS-RET-010', 'Mark received before approval', '409', async () => { const r = await A('POST', `/api/admin/returns/${rr.id}/action`, { action: 'receive' }); expect(r.status === 409, brief(r)); return brief(r); });
  await tc('CUS-RET-011', 'Approve', 'Approved — pickup pending', async () => { const r = await A('POST', `/api/admin/returns/${rr.id}/action`, { action: 'approve' }); expect(r.status === 200 && r.data.status === 'approved', brief(r)); return r.data.status; }, 'High');
  const sBefore = db.prepare('SELECT stock FROM inventory WHERE product_id = ?').get(rp.id).stock;
  let ref;
  await tc('CUS-RET-012', 'Mark received (resaleable)', 'Stock +1; refund opened for finance', async () => { const r = await A('POST', `/api/admin/returns/${rr.id}/action`, { action: 'receive', restock: true }); const s = db.prepare('SELECT stock FROM inventory WHERE product_id = ?').get(rp.id).stock; ref = db.prepare('SELECT * FROM refunds WHERE return_id = ?').get(rr.id); expect(r.status === 200 && s === sBefore + 1 && ref?.status === 'pending', `${brief(r)} stock ${sBefore}→${s}`); return `stock ${sBefore}→${s} · refund ₹${ref.amount / 100} pending`; }, 'Critical');
  await tc('CUS-RET-013', 'Record refund without reference', '400', async () => { const r = await A('POST', `/api/admin/refunds/${ref.id}/action`, { action: 'process' }); expect(r.status === 400, brief(r)); return brief(r); });
  await tc('CUS-RET-014', 'Refund fails, then retried', 'Failed → then Refunded', async () => { const f = await A('POST', `/api/admin/refunds/${ref.id}/action`, { action: 'fail', reason: 'Bank account closed' }); const p = await A('POST', `/api/admin/refunds/${ref.id}/action`, { action: 'process', reference: `RF${uniq()}${uniq()}`, method: 'bank' }); expect(f.data.status === 'failed' && p.data.status === 'processed', `${brief(f)} / ${brief(p)}`); return 'failed → processed'; }, 'High');
  await tc('CUS-RET-015', 'Duplicate refund prevention', 'Second "mark refunded" → 409', async () => { const r = await A('POST', `/api/admin/refunds/${ref.id}/action`, { action: 'process', reference: 'ANOTHER-REF-1' }); expect(r.status === 409, brief(r)); return brief(r); }, 'Critical');
  await tc('CUS-RET-016', 'Customer sees Refunded with reference', 'Return status Refunded on the order page', async () => { const d = (await R('GET', `/api/orders/${o.number}`)).data.after_sales; expect(d.returns[0].status === 'refunded' && d.refunds[0].reference, JSON.stringify(d.returns[0])); return `${d.returns[0].status} · ref ${d.refunds[0].reference}`; });
  await tc('CUS-RET-017', 'Refunds can never exceed the amount paid', 'Sum of refunds ≤ order total after returning everything', async () => {
    const r = await R('POST', `/api/orders/${o.number}/returns`, fd({ reason: 'no_longer_needed', items: [{ order_item_id: itemId, qty: 2 }] })); expect(r.status === 201, brief(r));
    await A('POST', `/api/admin/returns/${r.data.return.id}/action`, { action: 'approve' }); await A('POST', `/api/admin/returns/${r.data.return.id}/action`, { action: 'receive' });
    const sum = db.prepare('SELECT SUM(amount) s FROM refunds WHERE order_id = ?').get(o.id).s; expect(sum <= o.total, `refunds ${sum} > total ${o.total}`); return `refunds ₹${sum / 100} ≤ paid ₹${o.total / 100}`;
  }, 'Critical');
  await tc('CUS-RET-018', 'Return after the 7-day window', '409 window ended', async () => {
    const o2 = await placeOrder(R, [{ productId: rp.id, qty: 1 }]); await A('POST', `/api/admin/orders/${o2.id}/action`, { action: 'confirm_payment' });
    db.prepare("UPDATE orders SET status = 'delivered' WHERE id = ?").run(o2.id); db.prepare("INSERT INTO order_events(order_id, status, created_at) VALUES(?, 'delivered', ?)").run(o2.id, new Date(Date.now() - 9 * 864e5).toISOString());
    const it = db.prepare('SELECT id FROM order_items WHERE order_id = ?').get(o2.id).id; const r = await R('POST', `/api/orders/${o2.number}/returns`, fd({ reason: 'quality', items: [{ order_item_id: it, qty: 1 }] })); expect(r.status === 409 && /window/.test(r.data.error), brief(r)); return brief(r);
  }, 'High');
  await tc('CUS-RET-019', "Another customer's return (IDOR)", '404', async () => { const r = await P('POST', `/api/orders/${o.number}/returns`, fd({ reason: 'quality', items: [{ order_item_id: itemId, qty: 1 }] })); expect(r.status === 404, brief(r)); return brief(r); }, 'Critical');
}

// ===================================================================== customer legal
section('Customer', 'Legal & agreements');
{
  const G = await client().init();
  await tc('CUS-LEG-001', 'View Customer Terms, Privacy, Cancellation/Return/Refund', '3 documents with version and simple + full text', async () => { const r = (await G('GET', '/api/legal/customer')).data; expect(r.docs.length === 3 && r.docs.every((d) => d.version && d.body.length > 500), JSON.stringify(r.docs.map((d) => d.kind))); return r.docs.map((d) => `${d.title} v${d.version}`).join(' · '); }, 'High');
  await tc('CUS-LEG-002', 'Download policy PDFs', 'Each is a real PDF', async () => { const out = []; for (const k of ['customer_terms', 'privacy', 'refund_cancellation']) { const r = await G('GET', `/api/legal/doc/${k}/pdf`); expect(r.status === 200 && r.data.slice(0, 5).toString() === '%PDF-', `${k} ${brief(r)}`); out.push(`${k} ${Math.round(r.data.length / 1024)}KB`); } return out.join(' · '); }, 'High');
  await tc('CUS-LEG-003', 'All published policies page', '/api/legal/policies lists customer + company policies only', async () => { const r = (await G('GET', '/api/legal/policies')).data.items; expect(r.length >= 3 && !r.some((x) => x.category === 'dealer'), JSON.stringify(r.map((x) => x.kind))); return `${r.length} policies, no dealer documents`; }, 'Medium');
  await tc('CUS-LEG-004', 'Acceptance record PDF', 'PDF with name, version, date', async () => { const it = (await CU('GET', '/api/account/legal')).data.items[0]; const r = await CU('GET', `/api/account/legal/${it.id}/pdf`); expect(r.status === 200 && r.data.slice(0, 5).toString() === '%PDF-', brief(r)); return `${it.ref_no} · ${Math.round(r.data.length / 1024)}KB`; }, 'High');
  await tc('CUS-LEG-005', "Another customer's acceptance PDF (IDOR)", '404', async () => { const it = (await CU('GET', '/api/account/legal')).data.items[0]; const r = await P('GET', `/api/account/legal/${it.id}/pdf`); expect(r.status === 404, brief(r)); return brief(r); }, 'Critical');
}

save('customer');
process.exit(0);
