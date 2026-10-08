"""QA · UI: every main page on desktop + phone sizes (Chromium): console/page errors, failed
requests, horizontal scrolling, broken images, accessibility (axe-core), headings; plus a full
customer journey through the real UI (register with code → cart → checkout → pay → cancel).

  python3 test/qa/qa_ui.py        (server on :4000 serving client/dist; AXE=/tmp/axe/node_modules/axe-core/axe.min.js)
"""
import asyncio, json, os, re, sys, time, random, string
from playwright.async_api import async_playwright

BASE = os.environ.get('QA_BASE', 'http://localhost:4000')
AXE = open(os.environ.get('AXE', '/tmp/axe/node_modules/axe-core/axe.min.js')).read()
OUT = os.path.join(os.path.dirname(__file__), 'results-ui.json')
SHOTS = os.path.join(os.path.dirname(__file__), 'ui-shots')
os.makedirs(SHOTS, exist_ok=True)
RESULTS = []
VIEWPORTS = {
    'desktop': dict(viewport={'width': 1366, 'height': 900}),
    'android': dict(viewport={'width': 412, 'height': 915}, device_scale_factor=2.6, is_mobile=True, has_touch=True,
                    user_agent='Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36'),
    'iphone': dict(viewport={'width': 390, 'height': 844}, device_scale_factor=3, is_mobile=True, has_touch=True,
                   user_agent='Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'),
}
IGNORE = re.compile(r'fonts\.(googleapis|gstatic)|ERR_TUNNEL|ERR_PROXY|net::ERR_FAILED.*fonts|favicon|googletagmanager|facebook')

def rid(): return ''.join(random.choice(string.ascii_lowercase) for _ in range(6))

def rec(id_, module, page, name, expected, ok, actual, severity='Medium'):
    RESULTS.append(dict(id=id_, module=module, page=page, name=name, expected=expected, actual=actual, status='PASS' if ok else 'FAIL', severity='-' if ok else severity))
    print(('✔ ' if ok else '✘ ') + id_ + ' ' + name + ('' if ok else f'\n    actual: {actual}'))

async def api(ctx, method, path, body=None, headers=None):
    """Call the API from the browser context (shares cookies) with the CSRF header."""
    cookies = {c['name']: c['value'] for c in await ctx.cookies()}
    h = {'X-CSRF-Token': cookies.get('sa_csrf', ''), **(headers or {})}
    r = await ctx.request.fetch(BASE + path, method=method, data=json.dumps(body) if body is not None else None, headers={**h, **({'Content-Type': 'application/json'} if body is not None else {})})
    try: data = await r.json()
    except Exception: data = await r.text()
    return r.status, data

async def audit_page(ctx, vp, key, path, module, wait=1200, h1=True, setup=None):
    page = await ctx.new_page()
    errs, bad = [], []
    page.on('console', lambda m: errs.append(m.text) if m.type == 'error' and not IGNORE.search(m.text) else None)
    page.on('pageerror', lambda e: errs.append(f'pageerror: {e}'))
    page.on('response', lambda r: bad.append(f'{r.status} {r.url.replace(BASE, "")}') if r.url.startswith(BASE) and r.status >= 500 else None)
    t0 = time.time()
    await page.goto(BASE + path, wait_until='domcontentloaded')
    try: await page.wait_for_load_state('networkidle', timeout=8000)
    except Exception: pass
    await page.wait_for_timeout(wait)
    if setup: await setup(page); await page.wait_for_timeout(500)
    load_ms = int((time.time() - t0) * 1000)
    m = await page.evaluate("""() => {
      const se = document.scrollingElement; const over = se.scrollWidth - se.clientWidth;
      const wide = over > 2 ? [...document.querySelectorAll('body *')].filter(e => { const r = e.getBoundingClientRect(); return r.right > innerWidth + 2 && r.width > 0 && getComputedStyle(e).position !== 'fixed'; }).slice(0, 3).map(e => (e.className && typeof e.className === 'string' ? '.' + e.className.split(' ')[0] : e.tagName)) : [];
      const imgs = [...document.images].filter(i => i.complete && i.naturalWidth === 0 && i.src && !i.src.startsWith('data:') && i.getBoundingClientRect().width > 0).map(i => i.src.replace(location.origin, ''));
      return { over, wide, imgs, h1: !!document.querySelector('h1'), title: document.title };
    }""")
    await page.add_script_tag(content=AXE)
    ax = await page.evaluate("""async () => { const r = await axe.run(document, { resultTypes: ['violations'], runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } });
      return r.violations.filter(v => ['critical', 'serious'].includes(v.impact)).map(v => ({ id: v.id, impact: v.impact, n: v.nodes.length, sample: v.nodes[0]?.target?.join(' ') })); }""")
    if vp == 'desktop' or key in ('home', 'product', 'checkout', 'account', 'order', 'dealer_dash', 'admin_dash'):
        await page.screenshot(path=os.path.join(SHOTS, f'{vp}_{key}.png'))
    await page.close()
    pid = f'UI-{vp[:3].upper()}-{key}'
    rec(f'{pid}-ERR', module, path, f'{key} ({vp}): no JavaScript errors / server errors', 'No console or page errors, no 5xx', not errs and not bad, '; '.join((errs + bad)[:3]) or f'clean · loaded in {load_ms} ms', 'High')
    rec(f'{pid}-RWD', module, path, f'{key} ({vp}): no horizontal scrolling', 'Page width fits the screen', m['over'] <= 2, f'overflow {m["over"]}px {m["wide"]}' if m['over'] > 2 else 'fits', 'Medium')
    rec(f'{pid}-IMG', module, path, f'{key} ({vp}): no broken images', 'All images load', not m['imgs'], ', '.join(m['imgs'][:3]) or 'all loaded', 'Low')
    if vp == 'desktop':
        rec(f'{pid}-A11Y', module, path, f'{key}: accessibility (axe WCAG 2 A/AA, serious+critical)', '0 serious/critical issues', not ax, '; '.join(f"{v['id']}×{v['n']} ({v['impact']}) e.g. {v['sample']}" for v in ax[:4]) or '0 issues', 'Medium')
        if h1: rec(f'{pid}-H1', module, path, f'{key}: page has a main heading', 'An <h1> exists', m['h1'], 'missing h1', 'Low')
    return m, ax

async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch()
        # Testing a production build behind a local HTTPS proxy (QA_BASE=https://localhost:4443) uses a self-signed certificate.
        if BASE.startswith('https://localhost'):
            _nc = b.new_context
            async def new_context(**kw):
                return await _nc(**kw, ignore_https_errors=True)
            b.new_context = new_context
        # ---------- data setup through the API (same rules as a real user)
        setup = await b.new_context()
        await setup.request.get(BASE + '/api/health')
        cust = {}
        email = f'ui.{rid()}@example.com'; phone = '97' + str(int(time.time()))[-8:]
        st, d = await api(setup, 'POST', '/api/auth/register/otp', {'email': email, 'phone': phone})
        st, d = await api(setup, 'POST', '/api/auth/register', {'name': 'Priya Sharma', 'email': email, 'phone': phone, 'password': 'Saffron-Lamp-2026', 'confirm_password': 'Saffron-Lamp-2026', 'address': '14 Shanti Nagar, MG Road', 'city': 'Pune', 'state': 'Maharashtra', 'pincode': '411001', 'country': 'India', 'consents': {'understood': True, 'terms': True, 'privacy': True, 'policies': True}, 'otp': d.get('dev_otp')})
        assert st == 201, d
        st, prods = await api(setup, 'GET', '/api/products?inStock=1&limit=20')
        prod = [p for p in prods['items'] if not p.get('is_bundle')][0]
        st, q = await api(setup, 'POST', '/api/cart/quote', {'items': [{'productId': prod['id'], 'qty': 1}]})
        st, o = await api(setup, 'POST', '/api/orders', {'items': [{'productId': prod['id'], 'qty': 1}], 'customer': {'name': 'Priya Sharma', 'phone': phone, 'email': email}, 'address': {'line1': '14 Shanti Nagar, MG Road', 'city': 'Pune', 'state': 'Maharashtra', 'pincode': '411001'}, 'expectedTotal': q['total']})
        order_no = o['order']['order_number']
        cust_state = await setup.storage_state()
        # admin (owner) session
        adm = await b.new_context(); await adm.request.get(BASE + '/api/health')
        st, _ = await api(adm, 'POST', '/api/admin/login', {'email': 'admin@utsavghar.in', 'password': 'Toran&Kalash-2026'})
        if st != 200:
            await api(adm, 'POST', '/api/admin/login', {'email': 'admin@utsavghar.in', 'password': 'ChangeMe@2026'})
            await api(adm, 'PUT', '/api/admin/me/password', {'current': 'ChangeMe@2026', 'next': 'Toran&Kalash-2026'})
        adm_state = await adm.storage_state()
        # dealer (added by admin, sets own password)
        st, cats = await api(adm, 'GET', '/api/categories')
        dphone = '93' + str(int(time.time()))[-8:]
        st, dd = await api(adm, 'POST', '/api/admin/dealers', {'name': 'Mahesh Joshi', 'business_name': 'Shree Ganesh Traders', 'phone': dphone, 'pincodes': '4110', 'category_ids': [c['id'] for c in cats], 'pincode': '411002', 'city': 'Pune'})
        dl = await b.new_context(); await dl.request.get(BASE + '/api/health')
        await api(dl, 'POST', '/api/dealer/login', {'phone': dphone, 'password': dd['temp_password']})
        await api(dl, 'PUT', '/api/dealer/me/password', {'current': dd['temp_password'], 'next': 'Diya-Ghar#2026'})
        dl_state = await dl.storage_state()
        await setup.close(); await adm.close(); await dl.close()

        cat_slug = prod['category_slug']
        pages = {
            'Customer': [('home', '/'), ('shop', '/shop'), ('category', f'/shop/{cat_slug}'), ('product', prod['url']), ('search', '/shop?q=diya'), ('offers', '/offers'),
                         ('login', '/login'), ('register', '/register'), ('forgot', '/forgot-password'), ('track', '/track'), ('help', '/help'), ('manual', '/help/manual'),
                         ('policies', '/policies'), ('privacy', '/policies/privacy'), ('cart', '/cart')],
            'Customer (signed in)': [('account', '/account'), ('orders', '/account/orders'), ('addresses', '/account/addresses'), ('legal', '/account/legal'), ('security', '/account/security'),
                                     ('order', f'/order/{order_no}'), ('checkout', '/checkout')],
            'Dealer': [('dealer_login', '/dealer'), ('dealer_forgot', '/dealer/forgot'), ('dealer_register', '/dealer/register')],
            'Dealer (signed in)': [('dealer_dash', '/dealer'), ('dealer_orders', '/dealer/orders'), ('dealer_products', '/dealer/products'), ('dealer_payments', '/dealer/payments'), ('dealer_profile', '/dealer/profile'), ('dealer_legal', '/dealer/legal'), ('dealer_manual', '/dealer/manual')],
            'Admin (signed in)': [('admin_dash', '/admin'), ('admin_orders', '/admin/orders'), ('admin_payments', '/admin/payments'), ('admin_returns', '/admin/returns'), ('admin_settle', '/admin/settlements'),
                                  ('admin_dealers', '/admin/dealers'), ('admin_verify', '/admin/dealer-verification'), ('admin_products', '/admin/products'), ('admin_legal', '/admin/legal'),
                                  ('admin_admins', '/admin/admins'), ('admin_security', '/admin/security'), ('admin_settings', '/admin/settings'), ('admin_audit', '/admin/audit'), ('admin_manual', '/admin/manual')],
        }
        states = {'Customer (signed in)': cust_state, 'Dealer (signed in)': dl_state, 'Admin (signed in)': adm_state}
        for vp, opts in (VIEWPORTS.items() if not os.environ.get('JOURNEY_ONLY') else []):
            for module, lst in pages.items():
                if module.startswith('Admin') and vp == 'iphone': continue   # admin is a desktop/tablet tool; android width still checked
                ctx = await b.new_context(**opts, storage_state=states.get(module), bypass_csp=True)  # CSP blocks injected test scripts (good) — bypass only to run axe
                for key, path in lst:
                    try: await audit_page(ctx, vp, key, path, module.split(' (')[0])
                    except Exception as e: rec(f'UI-{vp[:3].upper()}-{key}-ERR', module, path, f'{key} ({vp}) opens', 'Page loads', False, str(e)[:200], 'High')
                await ctx.close()

        # ---------- keyboard: login form reachable and usable without a mouse
        ctx = await b.new_context(**VIEWPORTS['desktop'])
        page = await ctx.new_page(); await page.goto(BASE + '/login'); await page.wait_for_timeout(800)
        await page.focus('#au-email'); await page.keyboard.type(email); await page.keyboard.press('Tab'); await page.keyboard.type('Saffron-Lamp-2026'); await page.keyboard.press('Enter')
        await page.wait_for_timeout(1500)
        rec('UI-KBD-001', 'Accessibility', '/login', 'Sign in using only the keyboard (Tab / Enter)', 'Signed in and taken to the account', '/account' in page.url, page.url, 'Medium')
        focus = await page.evaluate("""() => { const a = document.querySelector('a, button'); a.focus(); const s = getComputedStyle(a); return s.outlineStyle !== 'none' || s.boxShadow !== 'none'; }""")
        rec('UI-KBD-002', 'Accessibility', '/account', 'Visible focus ring on links and buttons', 'Focused element shows an outline', focus, 'no focus style' if not focus else 'outline visible', 'Medium')
        await ctx.close()

        # ---------- full customer journey through the UI (phone size)
        ctx = await b.new_context(**VIEWPORTS['android'])
        page = await ctx.new_page(); errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        j_email = f'journey.{rid()}@example.com'; j_phone = '96' + str(int(time.time()))[-8:]
        step = 'open register'
        try:
            await page.goto(BASE + '/register'); await page.wait_for_timeout(1200)
            step = 'fill details'
            await page.fill('#au-name', 'Neha Gupta'); await page.fill('#au-phone', j_phone); await page.fill('#au-email', j_email)
            await page.fill('#au-pw', 'Rangoli#Diya-2026'); await page.fill('#au-pw2', 'Rangoli#Diya-2026')
            await page.fill('#au-addr', '22 Lake View, Koregaon Park'); await page.fill('#au-pin', '411001'); await page.fill('#au-city', 'Pune')
            await page.select_option('#au-state', 'Maharashtra')
            step = 'send code'
            await page.click('button.otp__send'); await page.wait_for_timeout(1200)
            code = await page.locator('.otp__dev b').inner_text()
            await page.fill('#au-otp', code)
            step = 'tick boxes'
            for cb in await page.locator('.lg-consents input[type=checkbox], .auth input[type=checkbox]').all():
                lbl = (await cb.evaluate("e => e.closest('label')?.innerText || ''"))
                if 'Optional' in lbl: continue
                if not await cb.is_checked(): await cb.check(force=True)
            step = 'create account'
            btn = page.locator('button:has-text("Accept & Create Account")')
            missing = await page.locator('.lg-missing').all_inner_texts()
            await btn.click(); await page.wait_for_url(re.compile(r'/account'), timeout=8000)
            rec('UI-JRN-001', 'Customer journey', '/register', 'Register in the browser with the mobile/email code', 'Account created, lands on My account', True, 'registered via UI with the test-mode code (not stored)', 'Critical')
            step = 'product → cart'
            await page.goto(BASE + prod['url']); await page.wait_for_timeout(1500)
            async def dismiss():
                for t in ('No thanks', 'Not now'):
                    loc = page.locator(f'button:has-text("{t}"):visible')
                    if await loc.count(): await loc.first.click(); await page.wait_for_timeout(300)
            async def tap(loc):
                # centre the button (the sticky header covers whatever sits at the very top) and close pop-ups first
                for _ in range(3):
                    await dismiss(); await loc.evaluate("e => e.scrollIntoView({ block: 'center' })"); await page.wait_for_timeout(300)
                    try: await loc.click(timeout=4000); return
                    except Exception: await page.wait_for_timeout(1500)
                await loc.click()
            await page.wait_for_timeout(6000)  # the deals pop-up opens after a few seconds
            # BUG-015 retest: nothing may cover the buy button on a phone product page
            atc = page.locator('button:has-text("Add to Cart"):visible').first
            await atc.evaluate("e => e.scrollIntoView({ block: 'center' })"); await page.wait_for_timeout(300)
            free = await atc.evaluate("e => { const r = e.getBoundingClientRect(); const t = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return !!t && (t === e || e.contains(t)); }")
            card = await page.locator('.welcome:visible').count()
            rec('UI-JRN-007', 'Customer journey', prod['url'], 'Phone product page: deals card never covers "Add to Cart" (BUG-015)', 'Button is uncovered, no deals card', free and card == 0, f'button uncovered={free}, deals cards visible={card}', 'Medium')
            await tap(page.locator('button:has-text("Add to Cart"):visible').first)
            await page.wait_for_timeout(800)
            await page.goto(BASE + '/cart'); await page.wait_for_timeout(1200); await dismiss()
            step = 'checkout'
            await tap(page.locator('a:has-text("Proceed to Checkout"), button:has-text("Proceed to Checkout")').first); await page.wait_for_timeout(1500)
            await tap(page.locator('button:has-text("Continue")').first); await page.wait_for_timeout(1500)
            step = 'place order'
            await tap(page.locator('button:has-text("Place"), button:has-text("Confirm"), button:has-text("Pay")').first); await page.wait_for_timeout(2500)
            body = await page.inner_text('body')
            num = (re.search(r'#?(DIWALI\d{4,})', body) or [None, None])[1]
            rec('UI-JRN-002', 'Customer journey', '/checkout', 'Checkout through the UI', 'Order number shown', bool(num), num or body[:200], 'Critical')
            step = 'pay with UTR'
            utr = '7' + str(int(time.time() * 1000))[-11:]
            inp = page.locator('input[placeholder*="UTR"], input[id*="utr"], input[name*="txn"], label:has-text("UTR") input').first
            await inp.fill(utr); await tap(page.locator('button:has-text("I HAVE PAID"), button:has-text("I have paid")').first); await page.wait_for_timeout(2000)
            body = await page.inner_text('body')
            rec('UI-JRN-003', 'Customer journey', '/order', 'Submit UPI payment reference', '"Payment Verification Pending" shown', 'Verification Pending' in body, '"Payment Verification Pending" shown' if 'Verification Pending' in body else body[:160], 'Critical')
            step = 'cancel'
            await page.goto(BASE + f'/order/{num}'); await page.wait_for_timeout(1500)
            await tap(page.locator('button:has-text("Cancel order")')); await page.select_option('#cx-reason', 'Ordered by mistake')
            await tap(page.locator('button:has-text("Yes, cancel order")')); await page.wait_for_timeout(1500)
            body = await page.inner_text('body')
            rec('UI-JRN-004', 'Customer journey', '/order', 'Cancel the order from the order page', 'Order shows Cancelled', 'Order cancelled' in body or 'Cancelled' in body, 'Order shows Cancelled' if 'Cancelled' in body else body[:160], 'High')
            step = 'logout'
            await page.goto(BASE + '/account'); await page.wait_for_timeout(1000)
            await tap(page.locator('button:has-text("Sign out"):visible, a:has-text("Sign out"):visible').first); await page.wait_for_timeout(1000)
            st, me = await api(ctx, 'GET', '/api/auth/me')
            rec('UI-JRN-005', 'Customer journey', '/account', 'Sign out', 'Session ended', me.get('user') is None, json.dumps(me)[:100], 'High')
        except Exception as e:
            await page.screenshot(path=os.path.join(SHOTS, 'journey_fail.png'))
            msg = str(e); msg = msg[:200] + ' … ' + msg[-500:] if len(msg) > 700 else msg
            rec(f'UI-JRN-ERR', 'Customer journey', step, f'Journey step "{step}"', 'Completes', False, msg + (f' · still needed: {missing}' if step == 'create account' else ''), 'Critical')
        rec('UI-JRN-006', 'Customer journey', '-', 'No JavaScript errors during the journey', 'None', not errs, '; '.join(errs[:2]) or 'none', 'High')
        await page.screenshot(path=os.path.join(SHOTS, 'journey_end.png'))
        await ctx.close()
        await b.close()
    json.dump(RESULTS, open(OUT, 'w'), indent=1, ensure_ascii=False)
    c = lambda s: sum(1 for r in RESULTS if r['status'] == s)
    print(f"\nui: {len(RESULTS)} cases · {c('PASS')} pass · {c('FAIL')} fail")

asyncio.run(main())
