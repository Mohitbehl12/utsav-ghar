"""
Capture the user-manual screenshots from the demo build (client/dist-demo/index.html),
with numbered callouts drawn on the elements listed in shared/manuals/*.js.
Run:  node manuals/dump.mjs > /tmp/manuals.json && python3 manuals/capture.py [only_prefix]
"""
import asyncio, json, os, sys, base64
from playwright.async_api import async_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEMO = 'file://' + os.path.join(ROOT, 'client/dist-demo/index.html')
OUT = os.path.join(ROOT, 'manuals/shots'); os.makedirs(OUT, exist_ok=True)
MARK = open(os.path.join(ROOT, 'manuals/mark.js')).read()
DATA = json.load(open('/tmp/manuals.json'))
ONLY = sys.argv[1] if len(sys.argv) > 1 else ''
CALL = {}
for m in DATA['manuals']:
    for s in m['sections']:
        if s.get('shot'): CALL[s['shot']] = [c[0] for c in s.get('callouts', [])]
        if s.get('shot2'): CALL[s['shot2']] = [c[0] for c in s.get('callouts2', [])]
REPORT = {}
INIT = "window.__UG_START__ = sessionStorage.getItem('__go') || undefined; window.__UG_NO_TOUR__ = true;"

DBKEY = 'ug_demo_db_v15'
async def mock_db(p, js):
    """Change the preview's in-browser data (screenshots only), then the next go() reloads it."""
    await p.evaluate("(js) => { const db = JSON.parse(localStorage.getItem('%s')); (new Function('db', js))(db); localStorage.setItem('%s', JSON.stringify(db)); }" % (DBKEY, DBKEY), js)

async def otp_code(p):
    await p.locator('button.otp__send').first.click(); await p.wait_for_timeout(900)
    return (await p.evaluate("document.querySelector('.otp__dev b')?.textContent || ''")).strip()

async def go(p, route, wait=1400):
    for attempt in range(3):
        await p.evaluate(f"sessionStorage.setItem('__go', {json.dumps(route)})")
        await p.goto(DEMO, wait_until='load'); await p.wait_for_timeout(wait)
        h = await p.evaluate("decodeURIComponent(location.hash || '')")
        if h.split('?')[0].rstrip('/') == ('#' + route).split('?')[0].rstrip('/') or route == '/': break
        print('  retry go', route, h)
    await p.add_style_tag(content='*{animation-duration:0s!important;transition-duration:0s!important;scroll-behavior:auto!important} .otp__dev{display:none!important} .welcome{display:none!important}')

async def shot(p, key, scroll=None, top=0, full=False, h=None):
    if ONLY and not key.startswith(ONLY): return
    if h:
        vs = p.viewport_size; await p.set_viewport_size({'width': vs['width'], 'height': h}); await p.wait_for_timeout(300)
    if scroll and scroll.startswith('text:'):
        await scroll_text(p, scroll[5:], top)
    elif scroll:
        try:
            await p.evaluate("""([sel, top]) => { const e = [...document.querySelectorAll(sel)].find(x => x.getBoundingClientRect().height > 0) || document.querySelector(sel); if (!e) return;
              e.scrollIntoView({ block: 'start' }); const r0 = e.getBoundingClientRect(); let a = e.parentElement; while (a && !(a.scrollTop > 0 || (a.scrollHeight > a.clientHeight + 5 && /(auto|scroll)/.test(getComputedStyle(a).overflowY)))) a = a.parentElement; const sc = a || document.scrollingElement; sc.scrollTop += (e.getBoundingClientRect().top - top); }""", [scroll, top])
        except Exception as ex: print('scroll fail', key, ex)
        await p.wait_for_timeout(350)
    elif scroll is None and key.startswith('d_'):
        pass
    await p.evaluate("(() => {" + MARK + "})()")
    res = await p.evaluate('(s) => window.__mark(s)', CALL.get(key, []))
    bad = [r for r in res if not r['ok']]
    REPORT[key] = bad
    await p.screenshot(path=os.path.join(OUT, f'{key}.png'), full_page=full)
    await p.evaluate("document.querySelectorAll('.__mk').forEach(n => n.remove())")
    if h: await p.set_viewport_size(vs)
    print(('✔ ' if not bad else '⚠ ') + key, '' if not bad else bad)

FIELD_JS = """(t) => { const norm = s => String(s||'').replace(/\\s+/g,' ').trim().toLowerCase().replace(/^[^a-z0-9]+/,'');
  const want = norm(t);
  const labs = [...document.querySelectorAll('label, .field, .dl-field')].filter(l => { const sp = l.querySelector('span, .field__label'); return norm(sp ? sp.textContent : l.textContent).startsWith(want); })
    .filter(l => l.getBoundingClientRect().width > 0);
  for (const l of labs) { const i = l.querySelector('input:not([type=checkbox]):not([type=file]), select, textarea') || (l.htmlFor && document.getElementById(l.htmlFor)); if (i) return i; }
  return null; }"""

class Fld:
    def __init__(self, p, text): self.p, self.text = p, text
    async def _h(self):
        h = await self.p.evaluate_handle(FIELD_JS, self.text); e = h.as_element()
        if not e: raise Exception('field not found: ' + self.text)
        return e
    async def fill(self, v): await (await self._h()).fill(v)
    async def select_option(self, v): await (await self._h()).select_option(v)
    @property
    def first(self): return self

def lab_loc(p, text): return Fld(p, text)

async def scroll_text(p, text, top=60):
    await p.evaluate("""([t, top]) => { const e = [...document.querySelectorAll('h1,h2,h3,h4,legend,p,b,span,label')].find(x => x.innerText && x.innerText.replace(/^\\W+/, '').startsWith(t) && x.getBoundingClientRect().height > 0); if (!e) return;
      e.scrollIntoView({ block: 'start' }); const r0 = e.getBoundingClientRect(); let a = e.parentElement; while (a && !(a.scrollTop > 0 || (a.scrollHeight > a.clientHeight + 5 && /(auto|scroll)/.test(getComputedStyle(a).overflowY)))) a = a.parentElement; const sc = a || document.scrollingElement; sc.scrollTop += (e.getBoundingClientRect().top - top); }""", [text, top])
    await p.wait_for_timeout(300)

async def to_top(p):
    await p.evaluate("() => { window.scrollTo(0,0); document.querySelectorAll('*').forEach(a => { if (a.scrollTop > 0) a.scrollTop = 0; }); }"); await p.wait_for_timeout(250)

async def click(p, sel, wait=500, nth=0):
    loc = p.locator(sel)
    await loc.nth(nth).click(); await p.wait_for_timeout(wait)

async def fill(p, sel, val):
    await p.locator(sel).first.fill(val)


async def customer(b):
    ctx = b; p = await ctx.new_page(); await p.set_viewport_size({'width': 1280, 'height': 800}); await p.add_init_script(INIT)
    p.on('pageerror', lambda e: print('pageerror', e))
    await p.goto(DEMO); await p.wait_for_timeout(1500)
    await p.evaluate("localStorage.clear(); sessionStorage.clear()")
    await go(p, '/', 2000)
    await shot(p, 'c_home')
    # search with suggestions
    await p.locator('.zh__search input').first.click(); await p.locator('.zh__search input').first.type('diya', delay=60); await p.wait_for_timeout(900)
    await shot(p, 'c_search')
    await go(p, '/shop'); await shot(p, 'c_shop')
    # register
    await go(p, '/register', 1800)
    vals = {'Full name': 'Priya Sharma', 'Mobile number': '9876501234', 'Email': 'priya@example.com', 'Password': 'Rangoli#Diya2026', 'Confirm password': 'Rangoli#Diya2026', 'House no': '14 Shanti Nagar, MG Road', 'PIN code': '411001', 'City': 'Pune'}
    for k, v in vals.items():
        try: await lab_loc(p, (k)).first.fill(v)
        except Exception as ex: print('fill', k, ex)
    await p.wait_for_timeout(500)
    code = await otp_code(p)
    await p.locator('#au-otp').fill(code)
    await shot(p, 'c_register', scroll='form', top=10, h=1150)
    for cb in await p.locator('.lg-cust input[type=checkbox], fieldset input[type=checkbox]').all():
        try: await cb.check()
        except Exception: pass
    await shot(p, 'c_register_b', scroll='.lg-cust', top=20, h=1200)
    await p.get_by_role('button', name='Accept & Create Account').click(); await p.wait_for_timeout(1800)
    await shot(p, 'c_account'); await shot(p, 'c_profile'); await shot(p, 'c_logout')
    await go(p, '/account/addresses'); await click(p, 'text=Add address')
    await shot(p, 'c_addresses', h=1150)
    # product + cart
    await go(p, '/shop', 1600)
    await p.locator('.pcard a, .zrc a, a.pcard__name').first.click(); await p.wait_for_timeout(1600)
    await shot(p, 'c_product')
    await p.get_by_role('button', name='Add to Cart').first.click(); await p.wait_for_timeout(600)
    await go(p, '/shop', 1400)
    await p.locator('.pcard a, .zrc a').nth(4).click(); await p.wait_for_timeout(1200)
    await p.get_by_role('button', name='Add to Cart').first.click(); await p.wait_for_timeout(600)
    await go(p, '/cart', 1600); await shot(p, 'c_cart', h=1000)
    await go(p, '/checkout', 1800)
    await shot(p, 'c_checkout', h=1260)
    await click(p, 'text=Continue to Order Summary', 1200)
    for _ in range(4):
        if await p.locator('text=Choose how to pay').count(): break
        btn = p.locator('button:has-text("Place Order")')
        if await btn.count(): await btn.first.click(); await p.wait_for_timeout(1800)
        else:
            cont = p.locator('text=Continue to Order Summary')
            if await cont.count(): await cont.first.click(); await p.wait_for_timeout(1200)
    await shot(p, 'c_payment', scroll='.pay', top=10, h=1250)
    try:
        await lab_loc(p, ('UPI transaction')).first.fill('630918274561')
        await p.locator('button:has-text("I HAVE PAID")').first.click(); await p.wait_for_timeout(1800)
    except Exception as ex: print('paid', ex)
    order_no = await p.evaluate("(document.body.innerText.match(/#([A-Z]+\\d{4,})/)||[])[1] || ''")
    await go(p, '/order/' + order_no + '?placed=1', 1600)
    await shot(p, 'c_order', h=1000)
    print('order', order_no)
    await go(p, '/account/orders'); await shot(p, 'c_orders')
    await go(p, '/account/payments'); await shot(p, 'c_payhistory')
    await go(p, '/track', 1400)
    await lab_loc(p, ('Order ID')).first.fill(order_no); await lab_loc(p, ('Mobile')).first.fill('9876501234')
    await p.locator('.track__form button').first.click(); await p.wait_for_timeout(1600)
    await shot(p, 'c_track', h=1100)
    # help center + requests
    await go(p, '/help', 1600); await shot(p, 'c_help')
    # cancel (order page, before packing) — opened but not confirmed
    await go(p, '/order/' + order_no, 1600)
    await click(p, 'button:has-text("Cancel order")', 600)
    try: await p.locator('#cx-reason').select_option('Ordered by mistake')
    except Exception as ex: print('cancel', ex)
    await shot(p, 'c_cancel', scroll='.aftersales', top=20, h=1000)
    await click(p, 'button:has-text("Keep my order")', 400)
    # return: mark this preview order paid + delivered (screenshots only), then request a return
    await mock_db(p, """const o = db.orders.find((x) => x.order_number === '%s'); const t = new Date(Date.now() - 864e5).toISOString();
      o.payment_status = 'confirmed'; o.payment.status = 'confirmed'; o.status = 'delivered';
      o.events.push({ status: 'payment_confirmed', note: 'Payment verified', created_at: t }, { status: 'processing', note: null, created_at: t }, { status: 'shipped', note: null, created_at: t }, { status: 'out_for_delivery', note: null, created_at: t }, { status: 'delivered', note: null, created_at: t });""" % order_no)
    await go(p, '/order/' + order_no, 1600)
    await click(p, 'button:has-text("Request a return")', 600)
    try:
        await p.locator('.ret-pick select').first.select_option('1')
        await p.locator('#rt-reason').select_option('damaged')
        await p.locator('#rt-details').fill('One diya arrived cracked.')
        import base64
        png = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==')
        await p.locator('#rt-photo').set_input_files(files=[{'name': 'damage.png', 'mimeType': 'image/png', 'buffer': png}])
    except Exception as ex: print('return form', ex)
    await shot(p, 'c_return', scroll='.aftersales', top=20, h=1250)
    await click(p, 'button:has-text("Send return request")', 1500)
    # the store approves, receives and refunds it (preview data) → customer view
    await mock_db(p, """const o = db.orders.find((x) => x.order_number === '%s'); const r = db.returns[db.returns.length - 1]; const t = new Date().toISOString();
      Object.assign(r, { status: 'refunded', decided_at: t, received_at: t, refunded_at: t });
      db.refunds = db.refunds || []; db.refunds.push({ id: 900001, order_id: o.id, return_id: r.id, kind: 'return', amount: r.refund_amount, status: 'processed', reference: 'UPI630918274599', method: 'original', created_at: t, processed_at: t });""" % order_no)
    await go(p, '/order/' + order_no, 1600)
    await shot(p, 'c_refund', scroll='.aftersales__list', top=20, h=1000)
    # review
    await go(p, '/shop', 1400); await p.locator('.pcard a, .zrc a').first.click(); await p.wait_for_timeout(1500)
    await p.locator('.review-form').first.scroll_into_view_if_needed(); await p.evaluate('window.scrollBy(0, -60)')
    await shot(p, 'c_review', h=900)
    # alerts sheet
    await go(p, '/account', 1500); await click(p, 'text=Deals & festival alerts', 900)
    await shot(p, 'c_alerts', h=1050)
    await p.keyboard.press('Escape')
    await go(p, '/account/legal', 1500); await shot(p, 'c_legal')
    await go(p, '/privacy', 1500); await shot(p, 'c_privacy')
    await go(p, '/account/security', 1500); await shot(p, 'c_security', h=1550)
    await go(p, '/account', 1400); await click(p, 'button:has-text("Sign out")', 1200)
    await go(p, '/login', 1400); await shot(p, 'c_login')
    await go(p, '/forgot-password', 1400)
    await p.locator('#fp-email').fill('priya@example.com')
    code = await otp_code(p); await p.locator('#fp-otp').fill(code)
    await p.locator('#fp-pw').fill('New-Diya-Light-9'); await p.locator('#fp-pw2').fill('New-Diya-Light-9')
    await shot(p, 'c_forgot', h=1000)
    await p.close()
    return order_no

async def draw(p):
    c = p.locator('canvas').first
    box = await c.bounding_box()
    x, y, w, h = box['x'], box['y'], box['width'], box['height']
    await p.mouse.move(x + 20, y + h * .6); await p.mouse.down()
    for i in range(1, 40):
        await p.mouse.move(x + 20 + i * (w - 40) / 40, y + h * (.6 - .25 * ((i % 8) / 8)))
    await p.mouse.up()

async def dealer_onboarding(b):
    ctx = b; p = await ctx.new_page(); await p.set_viewport_size({'width': 390, 'height': 800}); await p.add_init_script(INIT)
    p.on('pageerror', lambda e: print('pageerror', e))
    await p.goto(DEMO); await p.wait_for_timeout(1200)
    await go(p, '/dealer', 1600); await shot(p, 'd_login', h=900)
    await go(p, '/dealer/forgot', 1400)
    await p.locator('.dl-field input').first.fill('9810022222')
    await click(p, 'button:has-text("Send code")', 900)
    code = (await p.evaluate("[...document.querySelectorAll('[role=status] b')].map(x => x.textContent)[0] || ''")).strip()
    await p.locator('input[autocomplete=one-time-code]').fill(code)
    pw = p.locator('input[type=password]'); await pw.nth(0).fill('New-Pital-Diya-26'); await pw.nth(1).fill('New-Pital-Diya-26')
    await p.add_style_tag(content='[role=status] b{filter:blur(4px)}')
    await shot(p, 'd_forgot', h=900)
    await go(p, '/dealer/register', 1500)
    for k, v in {'Business / shop name': 'Laxmi Brass House', 'Your name': 'Raj Mehta', 'Mobile number': '9822001122', 'Email': 'raj@laxmibrass.example', 'Password': 'Pital#Diya-2026', 'Confirm password': 'Pital#Diya-2026'}.items():
        try: await lab_loc(p, (k)).first.fill(v)
        except Exception as ex: print('dreg', k, ex)
    await shot(p, 'd_register', h=980)
    await p.locator('button:has-text("Create dealer account")').click(); await p.wait_for_timeout(1800)
    # step 1
    await p.screenshot(path='/tmp/dl_after_reg.png')
    if not await p.locator('button:has-text("Save & continue")').count():
        await p.locator('button:has-text("Open")').first.click(); await p.wait_for_timeout(700)
    for k, v in {'Legal entity name': 'Laxmi Brass House', 'Registered address': '21 Ravivar Peth, Pune', 'PIN code': '411002', 'City': 'Pune'}.items():
        try: await lab_loc(p, (k)).first.fill(v)
        except Exception as ex: print('biz', k, ex)
    try: await lab_loc(p, ('Business type')).first.select_option('proprietorship')
    except Exception as ex: print('btype', ex)
    try: await p.locator('text=Business / pickup address is the same').first.click()
    except Exception: pass
    await shot(p, 'd_business', scroll='form', top=60, h=1450)
    await p.locator('button:has-text("Save & continue")').first.click(); await p.wait_for_timeout(1300)
    if not await p.locator('text=Bank account for payments').count():
        await p.locator('button:has-text("Open")').first.click(); await p.wait_for_timeout(700)
    # step 2
    for k, v in {'PAN': 'ABCPM1234K', 'Bank name': 'State Bank of India', 'Account holder name': 'Raj Mehta', 'Account number': '30214567891234', 'Re-enter account number': '30214567891234', 'IFSC': 'SBIN0001234'}.items():
        try: await lab_loc(p, (k)).first.fill(v)
        except Exception as ex: print('kyc', k, ex)
    await p.set_viewport_size({'width': 390, 'height': 1200}); await scroll_text(p, '2. Tax', 70); await shot(p, 'd_kyc'); await p.set_viewport_size({'width': 390, 'height': 800})
    await p.locator('button:has-text("Save & continue")').first.click(); await p.wait_for_timeout(1300)
    if not await p.locator('.dl-doctable').count():
        await p.locator('button:has-text("Open")').first.click(); await p.wait_for_timeout(700)
    # step 3 documents
    await shot(p, 'd_docs', scroll='.dl-doctable', top=120)
    pdf = b'%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF'
    for i in range(6):
        btns = p.locator('button:has-text("Upload Document")')
        if await btns.count() == 0: break
        await btns.first.click(); await p.wait_for_timeout(400)
        try:
            await p.locator('input[type=file]').first.set_input_files(files=[{'name': 'doc.pdf', 'mimeType': 'application/pdf', 'buffer': pdf}])
            await p.wait_for_timeout(300)
            up = p.locator('button:has-text("Upload"):not(:has-text("Document"))')
            if await up.count(): await up.first.click()
            await p.wait_for_timeout(900)
        except Exception as ex: print('upload', ex); break
    await shot(p, 'd_docs2', scroll='.dl-doctable', top=120, h=2200)
    await click(p, 'button:has-text("Continue: read the Dealer Agreement")', 1200)
    await to_top(p); await shot(p, 'd_agreement', h=1350)
    await click(p, 'button:has-text("I have read it")', 1000)
    for cb in await p.locator('input[type=checkbox]').all():
        try: await cb.check()
        except Exception: pass
    try:
        await lab_loc(p, ('Type your full name')).first.fill('Raj Mehta')
        await lab_loc(p, ('Capacity')).first.fill('Proprietor')
    except Exception as ex: print('signname', ex)
    await p.locator('canvas').first.scroll_into_view_if_needed(); await draw(p)
    await click(p, 'button:has-text("Verify with mobile OTP")', 900)
    code = await p.evaluate("(document.body.innerText.match(/preview code: (\\d{6})/)||[])[1] || ''")
    try: await lab_loc(p, ('6-digit code')).first.fill(code)
    except Exception as ex: print('otp', ex)
    await shot(p, 'd_sign', scroll='.dl-signinfo', top=70, h=1650)
    await click(p, 'button:has-text("Sign & Submit Agreement")', 1800)
    await to_top(p)
    await shot(p, 'd_review', h=1000)
    await p.close()

async def dealer_main(b, phase):
    ctx = b; p = await ctx.new_page(); await p.set_viewport_size({'width': 390, 'height': 800}); await p.add_init_script(INIT)
    p.on('pageerror', lambda e: print('pageerror', e))
    await p.goto(DEMO); await p.wait_for_timeout(1200)
    await go(p, '/dealer/profile', 1500)
    out = p.locator('button:has-text("Sign out")')
    if await out.count(): await out.first.click(); await p.wait_for_timeout(1000)
    await go(p, '/dealer', 1500)
    await click(p, 'button:has-text("Enter dealer app")', 1800)
    await shot(p, 'd_dashboard'); await to_top(p); await shot(p, 'd_dashboard2', h=1400)
    await shot(p, 'd_stockalerts', scroll='text:Stock in vs', top=125, h=1000)
    await go(p, '/dealer/payments', 1600); await click(p, '.dl-setl__row', 600); await shot(p, 'd_payments', h=1060)
    await go(p, '/dealer/orders', 1500); await shot(p, 'd_orders')
    await p.locator('.dl-ocard, a[href*="/dealer/orders/"]').first.click(); await p.wait_for_timeout(1300)
    await shot(p, 'd_order_new', h=1000)
    await click(p, 'button:has-text("Accept order")', 1300)
    await shot(p, 'd_customer', scroll='.dl-cust, .dl-box', top=120)
    boxes = p.locator('label.dl-check')
    n = await boxes.count()
    for i in range(max(0, n - 1)):
        try: await boxes.nth(i).click(); await p.wait_for_timeout(150)
        except Exception as ex: print('tick', ex)
    await shot(p, 'd_order_pack', scroll='label.dl-check', top=220, h=1000)
    if n: await boxes.nth(n - 1).click(); await p.wait_for_timeout(200)
    await click(p, 'button:has-text("Mark as packed")', 1200)
    await click(p, 'button:has-text("Ready for delivery")', 1200)
    try:
        await lab_loc(p, ("Delivery person")).first.fill('Sunil'); await lab_loc(p, ('Their mobile')).first.fill('9822334455')
    except Exception as ex: print('rider', ex)
    await shot(p, 'd_handover', scroll='.dl-handover, form', top=120, h=1050)
    await go(p, '/dealer/products', 1500); await shot(p, 'd_products'); await shot(p, 'd_stock', scroll='.dl-stock', top=260)
    await go(p, '/dealer/products/new', 1500)
    try:
        await lab_loc(p, ('Product name')).first.fill('Brass Akhand Diya (Medium)')
    except Exception as ex: print('pname', ex)
    await to_top(p); await shot(p, 'd_addproduct', h=2100)
    try:
        await lab_loc(p, ('Your price per piece')).first.fill('420'); await lab_loc(p, ('Quantity available')).first.fill('25')
    except Exception as ex: print('price', ex)
    await shot(p, 'd_pricing', scroll='text:Your price per piece', top=130, h=900)
    await go(p, '/dealer/alerts', 1500); await shot(p, 'd_alerts')
    await go(p, '/dealer/profile', 1500); await shot(p, 'd_profile', h=1750)
    await go(p, '/dealer/legal', 1800); await shot(p, 'd_health', scroll='.dl-hlist', top=200)
    await p.evaluate("(() => { const h=[...document.querySelectorAll('h2')].find(x=>/Signed agreement/.test(x.textContent)); if(h) window.scrollTo(0, window.scrollY + h.getBoundingClientRect().top - 100); })()"); await p.wait_for_timeout(300)
    await shot(p, 'd_legal')
    await p.locator('.dl-docitem:has-text("Commercial Terms") button:has-text("View")').first.click(); await p.wait_for_timeout(900)
    await shot(p, 'd_commercial')
    await p.close()

async def admin(b, order_no):
    ctx = b; p = await ctx.new_page(); await p.set_viewport_size({'width': 1366, 'height': 860}); await p.add_init_script(INIT)
    p.on('pageerror', lambda e: print('pageerror', e))
    await p.goto(DEMO); await p.wait_for_timeout(1200)
    await go(p, '/admin', 1500)
    out = p.locator('button:has-text("Sign out")')
    if await out.count(): await out.first.click(); await p.wait_for_timeout(800); await go(p, '/admin', 1300)
    await shot(p, 'a_login')
    await click(p, 'button:has-text("Enter admin")', 1800)
    await shot(p, 'a_dashboard')
    await go(p, '/admin/customers'); await shot(p, 'a_customers')
    await go(p, '/admin/dealers'); await click(p, '.tabs button:has-text("Dealers")', 800); await shot(p, 'a_dealers')
    await go(p, '/admin/dealer-verification'); await click(p, '.tabs button:has-text("To verify")', 800); await shot(p, 'a_verify_list')
    await p.locator('a:has-text("Laxmi Brass House")').first.click(); await p.wait_for_timeout(1300)
    await shot(p, 'a_verify_detail')
    await p.evaluate("(() => { const h=[...document.querySelectorAll('h2')].find(x=>/^Documents/.test(x.textContent)); if(h) window.scrollTo(0, window.scrollY + h.getBoundingClientRect().top - 80); })()"); await p.wait_for_timeout(300)
    await shot(p, 'a_verify_docs')
    await p.evaluate("(() => { const h=[...document.querySelectorAll('h2')].find(x=>/Commercial terms/.test(x.textContent)); if(h) window.scrollTo(0, window.scrollY + h.getBoundingClientRect().top - 80); })()"); await p.wait_for_timeout(300)
    await shot(p, 'a_commercial')
    await go(p, '/admin/products'); await shot(p, 'a_products'); await shot(p, 'a_inventory')
    await go(p, '/admin/dealer-products'); await shot(p, 'a_dealer_products')
    await go(p, '/admin/orders'); await shot(p, 'a_orders')
    await p.locator('table tbody tr').first.click(); await p.wait_for_timeout(1000)
    await shot(p, 'a_order_detail', h=1330); await shot(p, 'a_order_detail2', scroll='.modal h3, .modal h2', top=0, h=1260)
    await p.keyboard.press('Escape')
    await go(p, '/admin/payments'); vs0 = p.viewport_size; await p.set_viewport_size({'width': 1640, 'height': vs0['height']}); await p.wait_for_timeout(400); await shot(p, 'a_payments'); await p.set_viewport_size(vs0)
    await go(p, '/admin/support'); await shot(p, 'a_support')
    await go(p, '/admin/tracking', 1800); await shot(p, 'a_tracking')
    await go(p, '/admin/security', 1600); await shot(p, 'a_security', h=1420)
    await go(p, '/admin/settings', 1600); await shot(p, 'a_settings', h=1980)
    await go(p, '/admin/legal', 2000); await shot(p, 'a_legal_overview', h=1100)
    await click(p, '.lc-tabs button:has-text("Policy library")', 900); await shot(p, 'a_legal_library', scroll='.lc-libbar', top=10, h=1100)
    await p.locator('.lc-pol:has-text("Payment & Settlement Policy") button:has-text("Edit")').first.click(); await p.wait_for_timeout(1500)
    await shot(p, 'a_legal_editor', scroll='.lc-ed__meta', top=10, h=1500)
    await click(p, 'button:has-text("← Library")', 1200)
    await click(p, '.lc-tabs button:has-text("Policy library")', 900)
    await p.locator('.lc-pol:has-text("Dealer Agreement") button:has-text("History")').first.click(); await p.wait_for_timeout(1200)
    await shot(p, 'a_legal_history')
    await p.keyboard.press('Escape'); await p.wait_for_timeout(400)
    await click(p, '.lc-tabs button:has-text("Acceptance")', 1000); await shot(p, 'a_legal_acceptance')
    await click(p, '.lc-tabs button:has-text("Dealer compliance")', 900)
    await click(p, '.lc-subtabs button:has-text("Policy violations")', 900); await shot(p, 'a_violations')
    await click(p, '.lc-subtabs button:has-text("Account health")', 900); await shot(p, 'a_health')
    await click(p, '.lc-tabs button:has-text("Notifications")', 900); await shot(p, 'a_notices')
    await click(p, '.lc-tabs button:has-text("Audit trail")', 900); await shot(p, 'a_audit')
    vs = p.viewport_size; await p.set_viewport_size({'width': 1720, 'height': vs['height']})
    await go(p, '/admin/returns', 1600); await shot(p, 'a_returns', h=760)
    await p.set_viewport_size(vs)
    # preview data only: one cancelled, paid order waiting for its refund, so the "To pay" list is not empty
    await mock_db(p, """const o = db.orders.find((x) => x.payment_status === 'confirmed' && x.status !== 'delivered' && x.status !== 'cancelled' && !(db.refunds || []).some((f) => f.order_id === x.id));
      if (o) { o.status = 'cancelled'; o.events.push({ status: 'cancelled', note: 'Customer: Ordered by mistake', created_at: new Date().toISOString() });
        (db.refunds ||= []).push({ id: ++db.seq.id, order_id: o.id, return_id: null, kind: 'cancellation', amount: o.totals.total, status: 'pending', reference: null, method: null, failure_reason: null, created_at: new Date().toISOString(), processed_at: null }); }""")
    await go(p, '/admin/returns?view=refunds', 1600); await shot(p, 'a_refunds', h=900)
    await go(p, '/admin/settlements', 1600); await shot(p, 'a_settlements', h=1000)
    await go(p, '/admin/admins', 1600); await shot(p, 'a_admins', h=1300)
    await p.close()

async def main():
    async with async_playwright() as pw:
        br = await pw.chromium.launch()
        b = await br.new_context(device_scale_factor=2)
        order_no = await customer(b) if not ONLY or ONLY.startswith('c') or ONLY.startswith('a') else ''
        if not ONLY or ONLY.startswith('d') or ONLY.startswith('a'): await dealer_onboarding(b)
        if not ONLY or ONLY.startswith('d'): await dealer_main(b, 1)
        if not ONLY or ONLY.startswith('a'): await admin(b, order_no)
        await br.close()
    json.dump(REPORT, open(os.path.join(OUT, 'report.json'), 'w'), indent=1)
    print('missing callouts:', sum(len(v) for v in REPORT.values()))

if __name__ == "__main__": asyncio.run(main())
