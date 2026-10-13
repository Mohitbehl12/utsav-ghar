"""Mobile app-feel checks on the demo build (client/dist-demo, in-browser data only).
   python3 test/qa/qa_mobile.py      → test/qa/results-mobile.json
Covers: app shell on phones, header height, bottom tabs, tap-target sizes, sticky buy / checkout bars,
filter bottom sheet, account menu, admin card tables, no sideways scrolling at 320–430 px."""
import asyncio, json, os, time
from playwright.async_api import async_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../..'))
DEMO = 'file://' + os.path.join(ROOT, 'client/dist-demo/index.html')
OUT = os.path.join(os.path.dirname(__file__), 'results-mobile.json')
INIT = "window.__UG_START__ = sessionStorage.getItem('__go') || undefined; window.__UG_NO_TOUR__ = true;"
R = []

def rec(i, page, name, expected, ok, actual, sev='Medium'):
    R.append({'id': i, 'module': 'Mobile UI', 'page': page, 'name': name, 'expected': expected, 'actual': str(actual)[:300], 'status': 'PASS' if ok else 'FAIL', 'severity': sev})
    print(('✔' if ok else '✘'), i, name, '' if ok else f'→ {actual}')

async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch()

        async def phone(w=390, h=844):
            ctx = await b.new_context(viewport={'width': w, 'height': h}, is_mobile=True, has_touch=True)
            p = await ctx.new_page(); await p.add_init_script(INIT)
            await p.goto(DEMO); await p.wait_for_timeout(800)
            return ctx, p

        async def go(p, r, wait=1500):
            for _ in range(4):
                await p.evaluate(f"sessionStorage.setItem('__go', {json.dumps(r)})"); await p.goto(DEMO, wait_until='load'); await p.wait_for_timeout(wait)
                h = await p.evaluate("decodeURIComponent(location.hash || '')")
                if h.split('?')[0].rstrip('/') == ('#' + r).split('?')[0].rstrip('/') or r == '/': return

        ctx, p = await phone()
        await go(p, '/')
        shell = await p.evaluate("({ cls: document.documentElement.className, tabs: !!document.querySelector('.atabs'), hdr: Math.round(document.querySelector('.ahdr')?.getBoundingClientRect().height || 0) })")
        rec('MOB-001', '/', 'Phone browser gets the app layout (bottom tabs, compact header)', 'html.is-app + .atabs', 'is-app' in shell['cls'] and shell['tabs'], shell, 'High')
        rec('MOB-002', '/', 'Header uses under 15% of the screen height', '≤ 127 px on an 844 px screen', 0 < shell['hdr'] <= 127, f"{shell['hdr']} px")
        sizes = await p.evaluate("[...document.querySelectorAll('.atabs__tab')].map(e => { const r = e.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; })")
        rec('MOB-003', '/', 'Bottom tabs are at least 44×44 px each', '5 tabs ≥ 44 px', len(sizes) == 5 and all(w >= 44 and h >= 44 for w, h in sizes), sizes)
        fab = await p.evaluate("getComputedStyle(document.querySelector('.chatfab') || document.body).display")
        cards = await p.evaluate("document.querySelectorAll('.acircle').length")
        rec('MOB-004', '/', 'Home shows swipeable category cards', '≥ 6 category cards', cards >= 6, cards)

        await go(p, '/shop/diyas-candles')
        grid = await p.evaluate("(() => { const c = [...document.querySelectorAll('.pgrid .pcard')].slice(0, 2).map(e => Math.round(e.getBoundingClientRect().top)); const btn = document.querySelector('.pcard__add').getBoundingClientRect(); const img = document.querySelector('.pcard__media').getBoundingClientRect(); return { sameRow: c.length === 2 && c[0] === c[1], btnH: Math.round(btn.height), imgW: Math.round(img.width), lines: Math.round(document.querySelector('.pcard__add').scrollHeight / parseFloat(getComputedStyle(document.querySelector('.pcard__add')).lineHeight || 20)) }; })()")
        rec('MOB-005', '/shop', 'Product list is a 2-column grid with large images', '2 cards per row, image ≥ 150 px wide', grid['sameRow'] and grid['imgW'] >= 150, grid)
        rec('MOB-006', '/shop', '"Add to Cart" on cards fits one line and is ≥ 40 px tall', 'one line, ≥ 40 px', grid['btnH'] >= 40 and grid['btnH'] <= 48, grid)
        hidden = await p.evaluate("getComputedStyle(document.querySelector('.chatfab') || document.body).display")
        rec('MOB-007', '/shop', 'Help bubble does not cover product buttons on list pages', 'hidden on list pages', hidden == 'none', hidden, 'Low')
        await p.locator('button:has-text("Filters")').first.click(); await p.wait_for_timeout(600)
        sheet = await p.evaluate("(() => { const e = document.querySelector('.drawer__panel'); const r = e.getBoundingClientRect(); return { bottom: Math.round(r.bottom), left: Math.round(r.left), w: Math.round(r.width), vh: innerHeight, z: getComputedStyle(e.parentElement).zIndex }; })()")
        rec('MOB-008', '/shop', 'Filters open as a bottom sheet above the tab bar', 'full width, anchored to bottom, z above tabs', sheet['bottom'] == sheet['vh'] and sheet['left'] == 0 and sheet['w'] == 390 and int(sheet['z']) > 60, sheet, 'High')

        await go(p, '/shop/diyas-candles/premium-brass-diya', 2000)
        bar = await p.evaluate("(() => { const e = document.querySelector('.pdpbar--app'); if (!e) return null; const r = e.getBoundingClientRect(); const btns = [...e.querySelectorAll('button')].map(x => Math.round(x.getBoundingClientRect().height)); const g = document.querySelector('.gallery').getBoundingClientRect(), t = document.querySelector('.pdp__info h1').getBoundingClientRect(); return { bottom: Math.round(r.bottom), vh: innerHeight, btns, galleryFirst: g.top < t.top }; })()")
        rec('MOB-009', '/product', 'Product page: Add to Cart + Buy Now always in a bottom bar', 'bar at screen bottom, 3 controls ≥ 44 px', bool(bar) and bar['bottom'] == bar['vh'] and len(bar['btns']) == 3 and min(bar['btns']) >= 44, bar, 'High')
        rec('MOB-010', '/product', 'Product page shows the image gallery before the title', 'gallery above title', bool(bar) and bar['galleryFirst'], bar)
        await p.locator('.pdpbar__add').click(); await p.wait_for_timeout(800)
        badge = await p.evaluate("document.querySelector('.atabs .abadge')?.textContent || document.querySelector('.ahdr .abadge')?.textContent || ''")
        await go(p, '/cart')
        mc = await p.evaluate("(() => { const e = document.querySelector('.mcheckout'); if (!e) return null; const r = e.getBoundingClientRect(), t = document.querySelector('.atabs').getBoundingClientRect(); return { above: Math.round(r.bottom) === Math.round(t.top), total: e.querySelector('b')?.textContent, btn: Math.round(e.querySelector('button').getBoundingClientRect().height) }; })()")
        rec('MOB-011', '/cart', 'Cart: total + Checkout bar sits just above the tab bar', 'sticky bar with total and ≥ 44 px button', bool(mc) and mc['above'] and mc['btn'] >= 44 and '₹' in (mc['total'] or ''), mc, 'High')
        await ctx.close()

        # account menu (register in the demo build — in-browser mock, test code shown on screen)
        ctx, p = await phone()
        await go(p, '/register')
        stamp = str(int(time.time()))
        await p.fill('#au-name', 'Neha Gupta'); await p.fill('#au-phone', '96' + stamp[-8:]); await p.fill('#au-email', f'neha{stamp}@example.com')
        await p.fill('#au-pw', 'Rangoli#Diya-2026'); await p.fill('#au-pw2', 'Rangoli#Diya-2026')
        await p.fill('#au-addr', '22 Lake View, Koregaon Park'); await p.fill('#au-pin', '411001'); await p.fill('#au-city', 'Pune'); await p.select_option('#au-state', 'Maharashtra')
        fsize = await p.evaluate("Math.min(...[...document.querySelectorAll('.auth input:not([type=checkbox])')].map(e => parseFloat(getComputedStyle(e).fontSize)))")
        rec('MOB-012', '/register', 'Form fields use 16 px text (no zoom-in on iPhone)', '≥ 16 px', fsize >= 16, f'{fsize}px')
        await p.locator('button.otp__send').first.click(); await p.wait_for_timeout(900)
        await p.fill('#au-otp', (await p.evaluate("document.querySelector('.otp__dev b')?.textContent || ''")).strip())
        for cb in await p.locator('input[type=checkbox]').all():
            if 'Optional' in (await cb.evaluate("e => e.closest('label')?.innerText || ''")): continue
            try:
                if not await cb.is_checked(): await cb.check(force=True)
            except Exception: pass
        await p.get_by_role('button', name='Accept & Create Account').click(); await p.wait_for_timeout(2000)
        await go(p, '/account')
        rows = await p.evaluate("[...document.querySelectorAll('.mrows a, .mrows button')].map(e => Math.round(e.getBoundingClientRect().height))")
        rec('MOB-013', '/account', 'Account screen is a menu of icon rows ≥ 44 px', '≥ 10 rows, each ≥ 44 px', len(rows) >= 10 and min(rows) >= 44, rows, 'High')
        await go(p, '/account/orders')
        title = await p.evaluate("document.querySelector('.account__head h1')?.textContent")
        rec('MOB-014', '/account/orders', 'Account sub-screens are titled by section with a back link', 'h1 "My Orders" + back link', title == 'My Orders' and await p.locator('.account__back').count() == 1, title)
        await ctx.close()

        # admin tables as cards
        ctx, p = await phone()
        await go(p, '/admin', 1500)
        if await p.locator('button:has-text("Enter admin")').count(): await p.locator('button:has-text("Enter admin")').first.click(); await p.wait_for_timeout(1800)
        await go(p, '/admin/orders', 1800)
        adm = await p.evaluate("({ cards: document.querySelectorAll('table.is-cards').length, labelled: document.querySelectorAll('table.is-cards td[data-label]').length, iw: innerWidth })")
        rec('MOB-015', '/admin/orders', 'Admin tables read as labelled cards on a phone', 'is-cards tables with labelled cells, no zoom-out', adm['cards'] > 0 and adm['labelled'] > 5 and adm['iw'] == 390, adm)
        await ctx.close()

        # widths
        routes = ['/', '/shop/diyas-candles', '/shop/diyas-candles/premium-brass-diya', '/cart', '/categories', '/offers', '/login', '/register', '/help', '/track', '/s/dining', '/dealer', '/admin']
        for w in (320, 360, 375, 390, 393, 412, 430):
            ctx, p = await phone(w, 800); bad = []
            for r in routes:
                await go(p, r, 1200)
                iw = await p.evaluate('innerWidth')
                if iw != w: bad.append(f'{r}:{iw}')
            rec(f'MOB-W{w}', f'{len(routes)} screens', f'No sideways scrolling or zoom-out at {w} px', f'innerWidth = {w} on every screen', not bad, ', '.join(bad) or f'all {len(routes)} OK', 'High')
            await ctx.close()
        ctx = await b.new_context(viewport={'width': 844, 'height': 390}, is_mobile=True, has_touch=True)
        p = await ctx.new_page(); await p.add_init_script(INIT); await p.goto(DEMO); await p.wait_for_timeout(1200)
        land = await p.evaluate("({ app: document.documentElement.classList.contains('is-app'), iw: innerWidth })")
        rec('MOB-LAND', '/', 'Phone in landscape keeps the app layout', 'is-app at 844×390', land['app'] and land['iw'] == 844, land, 'Low')
        await ctx.close()
        await b.close()
    json.dump(R, open(OUT, 'w'), indent=1, ensure_ascii=False)
    print(f"mobile: {len(R)} cases · {sum(r['status'] == 'PASS' for r in R)} pass · {sum(r['status'] == 'FAIL' for r in R)} fail")

asyncio.run(main())
