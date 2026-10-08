"""Deployment checks for a production build (run from server/ after starting it like the host does).
   QA_BASE=https://localhost:4443 QA_HTTP=http://localhost:4000 QA_LOG=/tmp/prod.log python3 test/qa/qa_deploy.py
   Writes test/qa/results-deploy.json."""
import asyncio, json, os, re, subprocess, time, urllib.request, ssl
from playwright.async_api import async_playwright

BASE = os.environ.get('QA_BASE', 'https://localhost:4443')
HTTP = os.environ.get('QA_HTTP', 'http://localhost:4000')
LOG = os.environ.get('QA_LOG', '/tmp/prod.log')
SERVER = os.path.abspath(os.path.join(os.path.dirname(__file__), '../..'))
OUT = os.path.join(os.path.dirname(__file__), 'results-deploy.json')
CTX = ssl.create_default_context(); CTX.check_hostname = False; CTX.verify_mode = ssl.CERT_NONE
R = []

def rec(i, page, name, expected, ok, actual, sev):
    R.append({'id': i, 'module': 'Deployment', 'page': page, 'name': name, 'expected': expected, 'actual': actual, 'status': 'PASS' if ok else 'FAIL', 'severity': sev})
    print(('✔' if ok else '✘'), i, name)

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k): return None

def raw(url, method='GET', data=None, headers=None):
    op = urllib.request.build_opener(NoRedirect, urllib.request.HTTPSHandler(context=CTX))
    req = urllib.request.Request(url, method=method, data=data, headers=headers or {})
    try:
        r = op.open(req, timeout=10); return r.status, dict(r.headers), r.read()
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), e.read()

async def main():
    st, h, _ = raw(HTTP + '/shop')
    rec('DEP-001', 'Any page over http://', 'Plain HTTP is redirected to HTTPS', '301 to https://', st == 301 and h.get('Location', '').startswith('https://'), f'{st} → {h.get("Location")}', 'High')
    st, h, _ = raw(BASE + '/')
    hs = {k.lower(): v for k, v in h.items()}
    rec('DEP-002', '/', 'HTTPS response has HSTS, CSP and no X-Powered-By', 'Headers present', 'strict-transport-security' in hs and 'content-security-policy' in hs and 'x-powered-by' not in hs, ', '.join(k for k in ('strict-transport-security', 'content-security-policy', 'x-frame-options') if k in hs), 'High')
    st, _, body = raw(BASE + '/api/settings/public')
    s = json.loads(body)
    rec('DEP-003', '/api/settings/public', 'TEST MODE is reported to the website', 'test_mode = true', s.get('test_mode') is True, f'test_mode={s.get("test_mode")}', 'Medium')
    log = open(LOG).read()
    pw = os.environ.get('ADMIN_PASSWORD', 'ChangeMe@2026')
    leaks = [w for w in (pw, 'JWT_SECRET=', 'DATA_ENCRYPTION_KEY=') if w in log]
    rec('DEP-004', 'Server log', 'Start-up log contains no password or secret', 'None found', not leaks, 'none' if not leaks else 'found: ' + ', '.join('admin password' if w == pw else w for w in leaks), 'High')
    st, _, body = raw(BASE + '/api/nope-' + str(int(time.time())))
    rec('DEP-005', '/api/unknown', 'Unknown API path gives a short JSON error, no stack trace', '404 JSON, no "at " frames or paths', st == 404 and b' at ' not in body and b'/src/' not in body, f'{st} {body[:80]!r}', 'Medium')
    st, _, body = raw(BASE + '/api/auth/login', 'POST', b'{bad json', {'Content-Type': 'application/json'})
    rec('DEP-006', '/api/auth/login', 'Malformed request in production shows no internals', 'No parser text, no stack', b'Unexpected token' not in body and b'node_modules' not in body, f'{st} {body[:100]!r}', 'Medium')

    # Production without secrets must refuse to start; without TEST_MODE codes must stay hidden.
    env = {**os.environ, 'NODE_ENV': 'production', 'PORT': '4099', 'JWT_SECRET': '', 'ADMIN_JWT_SECRET': ''}
    p = subprocess.run(['node', 'src/index.js'], cwd=SERVER, env=env, capture_output=True, text=True, timeout=20)
    rec('DEP-007', 'Server start', 'Production refuses to start without strong secrets', 'Exits with a clear message', p.returncode != 0 and 'JWT_SECRET' in (p.stderr + p.stdout), (p.stderr + p.stdout).strip()[:120], 'Critical')
    env = {**os.environ, 'NODE_ENV': 'production', 'PORT': '4099', 'TEST_MODE': '', 'JWT_SECRET': 'x' * 40, 'ADMIN_JWT_SECRET': 'y' * 40}
    srv = subprocess.Popen(['node', 'src/index.js'], cwd=SERVER, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        for _ in range(40):
            try: raw('http://localhost:4099/api/health', headers={'X-Forwarded-Proto': 'https'}); break
            except Exception: time.sleep(0.25)
        hp = {'X-Forwarded-Proto': 'https', 'X-Forwarded-For': '10.55.0.9'}
        _, h1, b1 = raw('http://localhost:4099/api/settings/public', headers=hp)
        csrf = re.search(r'sa_csrf=([^;]+)', h1.get('Set-Cookie', '') or '')
        _, _, b2 = raw('http://localhost:4099/api/auth/password/forgot', 'POST', json.dumps({'email': 'nobody@example.com'}).encode(),
                       {**hp, 'Content-Type': 'application/json', 'X-CSRF-Token': csrf.group(1) if csrf else '', 'Cookie': f'sa_csrf={csrf.group(1)}' if csrf else ''})
        _, _, b3 = raw('http://localhost:4099/api/auth/register/otp', 'POST', json.dumps({'email': f'dep{int(time.time())}@example.com', 'phone': '9' + str(int(time.time()))[-9:]}).encode(),
                       {**hp, 'Content-Type': 'application/json', 'X-CSRF-Token': csrf.group(1) if csrf else '', 'Cookie': f'sa_csrf={csrf.group(1)}' if csrf else ''})
        ok = b'dev_otp' not in b2 and b'dev_otp' not in b3 and json.loads(b1).get('test_mode') is False
        rec('DEP-008', 'Sign-up / forgot password', 'With TEST_MODE off, codes are never sent to the browser', 'No dev_otp; test_mode false', ok, f'test_mode={json.loads(b1).get("test_mode")}, code in reply: {b"dev_otp" in b3}', 'Critical')
    finally:
        srv.terminate()

    async with async_playwright() as pw_:
        b = await pw_.chromium.launch()
        for name, path in (('Store', '/'), ('Dealer app', '/dealer'), ('Admin panel', '/admin'), ('Checkout', '/cart')):
            c = await b.new_context(ignore_https_errors=True, viewport={'width': 412, 'height': 900})
            pg = await c.new_page(); await pg.goto(BASE + path); await pg.wait_for_timeout(1500)
            vis = await pg.locator('.testmode').first.is_visible() if await pg.locator('.testmode').count() else False
            rec(f'DEP-0{10 + len([r for r in R if r["id"].startswith("DEP-01")])}', path, f'TEST MODE banner is visible on the {name}', 'Banner shown', vis, 'visible' if vis else 'missing', 'Medium')
            await c.close()
        await b.close()
    json.dump(R, open(OUT, 'w'), indent=1, ensure_ascii=False)
    print(f"deploy: {len(R)} cases · {sum(r['status'] == 'PASS' for r in R)} pass · {sum(r['status'] == 'FAIL' for r in R)} fail")

asyncio.run(main())
