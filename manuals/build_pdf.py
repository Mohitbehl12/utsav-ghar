"""Build the user manuals (EN + HI) as PDFs, plus web images for the in-app reader.

  node manuals/dump.mjs > /tmp/manuals.json
  python3 manuals/build_pdf.py            # all
  python3 manuals/build_pdf.py customer   # one manual

Output: manuals/out/*.pdf
        client/public/manuals/   customer + dealer web images and PDFs (public)
        manuals/web-admin/       admin web images and PDFs (served only to signed-in admins: /api/admin/manual/...)
"""
import asyncio, base64, html, json, os, re, subprocess, sys
from PIL import Image
from playwright.async_api import async_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = os.path.join(ROOT, 'manuals/shots')
BUILD = os.path.join(ROOT, 'manuals/build')
OUT = os.path.join(ROOT, 'manuals/out')
PUB = os.path.join(ROOT, 'client/public/manuals')
ADM = os.path.join(ROOT, 'manuals/web-admin')
FONTS = os.environ.get('UG_FONTS', '/tmp/fontdl/package/files')
DATA = json.load(open(os.environ.get('UG_MANUALS_JSON', '/tmp/manuals.json')))
C = DATA['common']
UI = C['UI']
for d in (BUILD, OUT, os.path.join(BUILD, 'img'), os.path.join(PUB, 'img'), os.path.join(ADM, 'img')): os.makedirs(d, exist_ok=True)

E = html.escape

def L(x, lang):
    if isinstance(x, dict) and 'en' in x: return x.get(lang) if x.get(lang) not in (None, '') else x['en']
    return x

def md(s):
    """Tiny inline formatting: **bold** and "quoted UI labels"."""
    s = E(str(s))
    s = re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', s)
    return s

# ---------- images ----------
PHONE = set()
def prep_images():
    for f in sorted(os.listdir(SHOTS)):
        if not f.endswith('.png'): continue
        k = f[:-4]; im = Image.open(os.path.join(SHOTS, f)).convert('RGB')
        if im.width < 1000: PHONE.add(k)
        jp = os.path.join(BUILD, 'img', k + '.jpg')
        w = im.width if im.width < 1000 else 1700
        im2 = im.resize((w, round(im.height * w / im.width)), Image.LANCZOS) if w != im.width else im
        im2.save(jp, 'JPEG', quality=82, optimize=True, progressive=True)
        wp = os.path.join(ADM if k.startswith('a_') else PUB, 'img', k + '.webp')
        ww = 390 * 2 if k in PHONE else 1400
        im3 = im.resize((ww, round(im.height * ww / im.width)), Image.LANCZOS) if ww < im.width else im
        im3.save(wp, 'WEBP', quality=72, method=6)

def font_face():
    out = []
    for w in (400, 600, 700, 800):
        p = os.path.join(FONTS, f'noto-sans-devanagari-devanagari-{w}-normal.woff2')
        if os.path.exists(p): out.append(f"@font-face{{font-family:'UGDeva';font-weight:{w};src:url('file://{p}') format('woff2');unicode-range:U+0900-097F,U+1CD0-1CF9,U+200C-200D,U+20A8,U+20B9,U+25CC,U+A830-A839,U+A8E0-A8FF;}}")
    for w in (400, 700):
        p = os.path.join(FONTS, f'noto-sans-devanagari-latin-{w}-normal.woff2')
        if os.path.exists(p): out.append(f"@font-face{{font-family:'UGLatin';font-weight:{w};src:url('file://{p}') format('woff2');}}")
    return '\n'.join(out)

CSS = r"""
@page { size: A4; margin: 16mm 15mm 18mm 15mm; }
@page cover { margin: 0; }
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; font-family: 'UGLatin', 'UGDeva', 'DejaVu Sans', Arial, sans-serif, 'Noto Color Emoji'; font-size: 10.4pt; line-height: 1.5; color: #22121A; }
:lang(hi) body, body:lang(hi) { font-size: 10.6pt; line-height: 1.62; }
h1, h2, h3 { font-family: 'Lora', 'UGDeva', Georgia, serif, 'Noto Color Emoji'; font-weight: 700; color: #2A0F1E; }
.mk { font-size: 1px; color: #fff; line-height: 1px; }
b { font-weight: 700; }

/* cover */
.cover { page: cover; height: 297mm; width: 210mm; position: relative; overflow: hidden; color: #FBEFE3;
  background: radial-gradient(120% 70% at 85% 0%, #7A2348 0%, transparent 60%), linear-gradient(160deg, #4B1430 0%, #2A0F1E 70%); }
.cover__pat { position: absolute; inset: 0; opacity: .08; background-image: radial-gradient(#E3B04B 1.2px, transparent 1.3px); background-size: 16px 16px; }
.cover__in { position: absolute; inset: 26mm 22mm; display: flex; flex-direction: column; }
.cover__brand { display: flex; align-items: center; gap: 12px; }
.cover__brand img { width: 26mm; height: 26mm; border-radius: 18px; box-shadow: 0 6px 24px rgba(0,0,0,.35); }
.cover__brand b { font: 700 24pt 'Lora', Georgia, serif; display: block; color: #FBEFE3; }
.cover__brand small { color: #E3B04B; font-size: 11pt; letter-spacing: .06em; }
.cover__kicker { margin-top: 48mm; color: #E3B04B; font-weight: 800; letter-spacing: .14em; text-transform: uppercase; font-size: 10.5pt; }
.cover h1 { color: #fff; font-size: 38pt; line-height: 1.12; margin: 4mm 0 4mm; }
.cover__sub { font-size: 15pt; color: #F3DCE6; max-width: 140mm; }
.cover__line { width: 40mm; height: 3px; background: linear-gradient(90deg, #E8501F, #E3B04B); border-radius: 3px; margin: 9mm 0; }
.cover__meta { margin-top: auto; display: grid; grid-template-columns: repeat(3, 1fr); gap: 6mm; border-top: 1px solid rgba(255,255,255,.18); padding-top: 7mm; }
.cover__meta span { display: block; color: #E3B04B; font-size: 8.5pt; text-transform: uppercase; letter-spacing: .1em; font-weight: 800; }
.cover__meta b { font-size: 12pt; color: #fff; }
.cover__note { margin-top: 7mm; font-size: 8.5pt; color: #D9C3CC; }

/* toc */
.toc { break-after: page; }
.toc h2, .sec h2 { font-size: 21pt; margin: 0 0 2mm; }
.toc__intro { color: #6E5A62; margin: 0 0 5mm; }
.toc ol { list-style: none; margin: 0; padding: 0; columns: 2; column-gap: 9mm; }
.toc li { display: flex; align-items: baseline; gap: 6px; padding: .75mm 0; font-size: 9.6pt; border-bottom: 1px dotted #E2D3C4; break-inside: avoid; }
.toc li .n { width: 9mm; color: #E8501F; font-weight: 800; }
.toc li .t { flex: 1; }
.toc li .p { font-weight: 700; color: #4B1430; min-width: 8mm; text-align: right; }
.toc li.extra .n { color: #9C8790; }
.docinfo { margin-top: 7mm; display: grid; grid-template-columns: repeat(4, 1fr); gap: 3mm; }
.docinfo div { background: #FBF6EF; border: 1px solid #EADFD2; border-radius: 8px; padding: 2.5mm 3mm; }
.docinfo span { display: block; font-size: 7.8pt; color: #6E5A62; text-transform: uppercase; letter-spacing: .06em; font-weight: 800; }
.docinfo b { font-size: 10pt; }

/* section */
.sec { break-before: page; }
.sec__head { display: flex; align-items: center; gap: 4mm; border-bottom: 2px solid #F0E3D4; padding-bottom: 3mm; margin-bottom: 4mm; }
.sec__num { flex: none; width: 12mm; height: 12mm; border-radius: 10px; display: grid; place-items: center; font-weight: 800; font-size: 13pt; color: #fff; background: linear-gradient(135deg, #E8501F, #C23A12); }
.sec__head h2 { margin: 0; }
.sec__head small { display: block; color: #9C8790; font-size: 8.5pt; text-transform: uppercase; letter-spacing: .1em; font-weight: 800; }
.lead { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm; margin-bottom: 4mm; }
.card { border: 1px solid #EADFD2; border-radius: 10px; padding: 3mm 4mm; background: #FFFDFA; break-inside: avoid; }
.card h3, .blk h3 { font-family: 'UGLatin', 'UGDeva', sans-serif, 'Noto Color Emoji'; font-size: 10.6pt; margin: 0 0 1.5mm; color: #4B1430; display: flex; gap: 6px; align-items: center; }
.card p { margin: 0; }
.blk { margin: 0 0 4mm; break-inside: avoid; }
.blk ul, .blk ol { margin: 0; padding-left: 5mm; }
.blk li { margin: .6mm 0; }
.ok li::marker { content: '✓  '; color: #1F7A4D; font-weight: 800; }
.bad li::marker { content: '✗  '; color: #B42335; font-weight: 800; }
ol.steps { list-style: none; padding: 0; counter-reset: s; }
ol.steps li { counter-increment: s; position: relative; padding: 1.4mm 0 1.4mm 10mm; border-left: 2px solid #F0E3D4; margin-left: 3.5mm; }
ol.steps li::before { content: counter(s); position: absolute; left: -3.6mm; top: 1.2mm; width: 6.4mm; height: 6.4mm; border-radius: 50%; background: #4B1430; color: #fff; font-weight: 800; font-size: 8.5pt; display: grid; place-items: center; }
.note { border-radius: 10px; padding: 3mm 4mm; margin: 0 0 4mm; break-inside: avoid; }
.note h3 { margin: 0 0 1mm; }
.note ul { margin: 0; padding-left: 5mm; }
.note--imp { background: #FFF6E3; border: 1px solid #F2D79A; border-left: 5px solid #E3A21B; }
.note--plan { background: repeating-linear-gradient(135deg, #F4F1FB, #F4F1FB 10px, #EEE9F8 10px, #EEE9F8 20px); border: 1.5px dashed #7C67B8; }
.note--plan h3 { color: #4E3A8E; }
.note--plan .tag { display: inline-block; background: #4E3A8E; color: #fff; border-radius: 99px; padding: 0 3mm; font-size: 8pt; font-weight: 800; letter-spacing: .05em; text-transform: uppercase; }
.note--after { background: #EEF7F1; border: 1px solid #BFE0CB; border-left: 5px solid #1F7A4D; }
.note--help { background: #F7EEF3; border: 1px solid #E4CBD7; border-left: 5px solid #7A2348; }

/* figure */
.fig { margin: 0 0 5mm; break-inside: avoid; }
.fig__img { border: 1px solid #DCCBBB; border-radius: 10px; overflow: hidden; background: #fff; box-shadow: 0 2px 10px rgba(42,15,30,.08); }
.fig__img img { display: block; width: 100%; }
.fig__cap { font-size: 8.3pt; color: #6E5A62; margin: 1.5mm 0 0; display: flex; gap: 6px; align-items: center; }
.fig__cap .ill { background: #FFF1D6; color: #8A5A07; border: 1px solid #F0D58A; border-radius: 99px; padding: 0 2.5mm; font-weight: 800; }
.fig__cap .real { background: #EEF7F1; color: #1F6A43; border: 1px solid #BFE0CB; border-radius: 99px; padding: 0 2.5mm; font-weight: 800; }
.fig--phone { display: grid; grid-template-columns: 64mm 1fr; gap: 6mm; align-items: start; }
.fig--phone .fig__img { border-radius: 16px; border: 4px solid #2A0F1E; }
.fig--phone img { max-height: 172mm; object-fit: contain; object-position: top; }
.fig--tall .fig__img { width: fit-content; max-width: 100%; margin: 0 auto; }
.fig--tall img { max-height: 150mm; width: auto; max-width: 100%; }
.legend { list-style: none; padding: 0; margin: 2.5mm 0 0; display: grid; grid-template-columns: 1fr 1fr; gap: 1.5mm 5mm; }
.fig--phone .legend { grid-template-columns: 1fr; margin: 0; }
.legend li { display: flex; gap: 2.5mm; align-items: flex-start; font-size: 9.4pt; break-inside: avoid; }
.legend li i { flex: none; font-style: normal; width: 5.6mm; height: 5.6mm; border-radius: 50%; background: #E8501F; color: #fff; font-weight: 800; font-size: 8pt; display: grid; place-items: center; margin-top: .4mm; box-shadow: 0 0 0 1.5px #fff, 0 0 0 2.5px #E8501F; }
.legend__h { font-size: 8.5pt; font-weight: 800; color: #9C8790; text-transform: uppercase; letter-spacing: .08em; margin: 0 0 1.5mm; }

/* tables */
table.t { width: 100%; border-collapse: separate; border-spacing: 0; border: 1px solid #EADFD2; border-radius: 10px; overflow: hidden; font-size: 9.3pt; break-inside: auto; }
table.t th { background: #4B1430; color: #FBEFE3; text-align: left; padding: 2mm 3mm; font-size: 8.6pt; letter-spacing: .03em; }
table.t td { padding: 1.8mm 3mm; border-top: 1px solid #F1E8DE; vertical-align: top; }
table.t tr:nth-child(even) td { background: #FBF6EF; }
table.t tr { break-inside: avoid; }
table.t td:first-child { font-weight: 700; width: 36%; }
table.m td, table.m th { text-align: center; }
table.m td:first-child, table.m th:first-child { text-align: left; width: 46%; font-weight: 600; }
.mnote { font-size: 8.5pt; color: #6E5A62; margin-top: 1.5mm; }
.pill { display: inline-block; border-radius: 99px; padding: 0 2.5mm; background: #F3E8EE; color: #4B1430; font-weight: 700; }

/* flow */
.flow { margin: 0 0 5mm; border: 1px solid #EADFD2; border-radius: 12px; padding: 4mm; background: linear-gradient(180deg, #FFFDFA, #FBF4EA); break-inside: avoid; }
.flow h3 { margin: 0 0 3mm; font-family: 'Lora', 'UGDeva', serif; font-size: 12pt; }
.flow__grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4mm 6mm; }
.flow__step { position: relative; background: #fff; border: 1.5px solid #E2CDBF; border-radius: 10px; padding: 2.5mm 3mm; min-height: 20mm; }
.flow__step b { display: block; color: #4B1430; font-size: 9.6pt; line-height: 1.3; }
.flow__step span { font-size: 8.4pt; color: #6E5A62; line-height: 1.35; display: block; margin-top: .8mm; }
.flow__step i { position: absolute; top: -2.6mm; left: -2.6mm; width: 6mm; height: 6mm; border-radius: 50%; background: #E8501F; color: #fff; font-style: normal; font-weight: 800; font-size: 8pt; display: grid; place-items: center; }
.flow__step:not(:last-child)::after { content: '➜'; position: absolute; right: -5.2mm; top: 50%; transform: translateY(-50%); color: #E8501F; font-size: 11pt; font-weight: 800; }
.flow__step:nth-child(4n)::after { content: '↓'; right: 45%; top: auto; bottom: -5mm; transform: none; }
.flow__step:last-child { background: #EEF7F1; border-color: #9FD0B2; }

.endpage { break-before: page; }
.support { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm; }
.legal-note { font-size: 8.4pt; color: #6E5A62; border-top: 1px solid #EADFD2; margin-top: 6mm; padding-top: 3mm; }
"""

ICON = {'what': '📄', 'why': '🎯', 'can': '✅', 'steps': '🪜', 'after': '📬', 'statuses': '🏷️', 'important': '⚠️', 'mistakes': '❌', 'help': '💬', 'planned': '🛠️', 'callouts': '🔢', 'flow': '🔀'}
TABLE_HEAD = {
    'problems': ('problem', 'solution'),
    'suspension': ('status', 'meaning'),
    'reports': ({'en': 'Where', 'hi': 'कहाँ'}, {'en': 'What you get', 'hi': 'क्या मिलता है'}),
}

def lst(items, lang, cls=''):
    items = L(items, lang)
    if isinstance(items, str): return f'<p>{md(items)}</p>'
    return f'<ul class="{cls}">' + ''.join(f'<li>{md(L(i, lang))}</li>' for i in items) + '</ul>'

def ui(k, lang): return E(L(UI[k], lang))

def figure(key, callouts, lang, mock, phone_manual):
    if not key or not os.path.exists(os.path.join(BUILD, 'img', key + '.jpg')): return ''
    phone = key in PHONE
    src = 'file://' + os.path.join(BUILD, 'img', key + '.jpg')
    with Image.open(os.path.join(SHOTS, key + '.png')) as im: ratio = im.height / im.width
    leg = ''
    if callouts:
        leg = f'<div class="legend__h">🔢 {ui("callouts", lang)}</div><ol class="legend">' + ''.join(f'<li><i>{n}</i><span>{md(L(c[1], lang))}</span></li>' for n, c in enumerate(callouts, 1)) + '</ol>'
    if mock: cap = f'<span class="ill">{ui("illustrative", lang)}</span>'
    else: cap = f'<span class="real">📷</span> {ui("realScreen", lang)}'
    if lang == 'hi' and L(UI['screenEnglish'], 'hi'): cap += f' {ui("screenEnglish", lang)}'
    if phone:
        return f'<div class="fig fig--phone"><div><div class="fig__img"><img src="{src}"></div><p class="fig__cap">{cap}</p></div><div>{leg}</div></div>'
    tall = ' fig--tall' if ratio > 0.9 else ''
    return f'<div class="fig{tall}"><div class="fig__img"><img src="{src}"></div><p class="fig__cap">{cap}</p>{leg}</div>'

def flow(name, lang):
    f = C['FLOWS'][name]
    steps = ''.join(f'<div class="flow__step"><i>{n}</i><b>{E(L(a, lang))}</b><span>{E(L(b, lang))}</span></div>' for n, (a, b) in enumerate(f['steps'], 1))
    return f'<div class="flow"><h3>🔀 {E(L(f["title"], lang))}</h3><div class="flow__grid">{steps}</div></div>'

def status_table(rows, lang):
    return (f'<div class="blk"><h3>{ICON["statuses"]} {ui("statuses", lang)}</h3><table class="t"><tr><th>{ui("status", lang)}</th><th>{ui("meaning", lang)}</th></tr>'
            + ''.join(f'<tr><td><span class="pill">{E(L(a, lang))}</span></td><td>{md(L(b, lang))}</td></tr>' for a, b in rows) + '</table></div>')

def section(m, s, n, lang):
    h = [f'<section class="sec" id="{s["id"]}"><div class="sec__head"><div class="sec__num">{n}</div><div><small>{E(L(m["title"], lang))}</small><h2>{E(L(s["title"], lang))}<span class="mk">UGSEC{n:03d}</span></h2></div></div>']
    lead = []
    if s.get('what'): lead.append(f'<div class="card"><h3>{ICON["what"]} {ui("what", lang)}</h3><p>{md(L(s["what"], lang))}</p></div>')
    if s.get('why'): lead.append(f'<div class="card"><h3>{ICON["why"]} {ui("why", lang)}</h3><p>{md(L(s["why"], lang))}</p></div>')
    if lead: h.append('<div class="lead">' + ''.join(lead) + '</div>')
    h.append(figure(s.get('shot'), s.get('callouts'), lang, s.get('mock'), m.get('phone')))
    if s.get('can'): h.append(f'<div class="blk"><h3>{ICON["can"]} {ui("can", lang)}</h3>{lst(s["can"], lang, "ok")}</div>')
    if s.get('steps'):
        st = L(s['steps'], lang)
        h.append(f'<div class="blk"><h3>{ICON["steps"]} {ui("steps", lang)}</h3><ol class="steps">' + ''.join(f'<li>{md(x)}</li>' for x in st) + '</ol></div>')
    if s.get('shot2'): h.append(figure(s['shot2'], s.get('callouts2'), lang, False, m.get('phone')))
    if s.get('flow'): h.append(flow(s['flow'], lang))
    if s.get('after'): h.append(f'<div class="note note--after"><h3>{ICON["after"]} {ui("after", lang)}</h3>{lst(s["after"], lang)}</div>')
    if s.get('statuses'): h.append(status_table(s['statuses'], lang))
    if s.get('table'):
        hd = TABLE_HEAD.get(s['id'], ('problem', 'solution'))
        th = ''.join(f'<th>{E(L(UI[x], lang)) if isinstance(x, str) else E(L(x, lang))}</th>' for x in hd)
        h.append(f'<div class="blk"><table class="t"><tr>{th}</tr>' + ''.join(f'<tr><td>{md(L(a, lang))}</td><td>{md(L(b, lang))}</td></tr>' for a, b in s['table']) + '</table></div>')
    if s.get('matrix'):
        mx = s['matrix']
        th = ''.join(f'<th>{E(L(x, lang))}</th>' for x in mx['head'])
        rows = ''.join('<tr>' + ''.join(f'<td>{E(L(c, lang))}</td>' for c in r) + '</tr>' for r in mx['rows'])
        h.append(f'<div class="blk"><table class="t m"><tr>{th}</tr>{rows}</table><p class="mnote">{E(L(mx.get("note", ""), lang))}</p></div>')
    if s.get('faq'):
        h.append(f'<div class="blk"><table class="t"><tr><th>{ui("question", lang)}</th><th>{ui("answer", lang)}</th></tr>' + ''.join(f'<tr><td>{md(L(a, lang))}</td><td>{md(L(b, lang))}</td></tr>' for a, b in s['faq']) + '</table></div>')
    if s.get('important'): h.append(f'<div class="note note--imp"><h3>{ICON["important"]} {ui("important", lang)}</h3>{lst(s["important"], lang)}</div>')
    if s.get('planned'): h.append(f'<div class="note note--plan"><h3>{ICON["planned"]} <span class="tag">{ui("planned", lang)}</span></h3>{lst(s["planned"], lang)}<p class="mnote">{ui("plannedNote", lang)}</p></div>')
    if s.get('mistakes'): h.append(f'<div class="blk"><h3>{ICON["mistakes"]} {ui("mistakes", lang)}</h3>{lst(s["mistakes"], lang, "bad")}</div>')
    h.append(f'<div class="note note--help"><h3>{ICON["help"]} {ui("help", lang)}</h3><p>{md(L(C["HELP"][m["help"]], lang))}</p></div>')
    h.append('</section>')
    return '\n'.join(x for x in h if x)

TXT = {
    'kicker': {'en': 'User Manual', 'hi': 'उपयोगकर्ता मैनुअल'},
    'audience': {'en': 'Audience', 'hi': 'किसके लिए'},
    'cover_note': {'en': 'Screens show demo data. Some features are marked “Planned Feature” — they are not available yet. Legal texts shown are drafts that must be reviewed by a qualified lawyer before production use.',
                   'hi': 'स्क्रीन पर डेमो डेटा है। कुछ सुविधाएँ “Planned Feature” लिखी हैं — वे अभी उपलब्ध नहीं हैं। दिखाए गए कानूनी टेक्स्ट ड्राफ़्ट हैं; प्रोडक्शन में उपयोग से पहले किसी योग्य वकील से जाँच ज़रूरी है।'},
    'toc_intro': {'en': 'Each chapter explains one page: what it is, why it is used, what you can do, step-by-step instructions, what happens next, status meanings, important points, common mistakes and where to get help.',
                  'hi': 'हर अध्याय एक पेज समझाता है: यह क्या है, क्यों है, आप क्या कर सकते हैं, चरण-दर-चरण तरीका, आगे क्या होता है, स्टेटस का मतलब, ज़रूरी बातें, आम गलतियाँ और मदद कहाँ मिलेगी।'},
    'support': {'en': 'Support & document information', 'hi': 'सहायता और दस्तावेज़ जानकारी'},
    'company': {'en': 'Company', 'hi': 'कंपनी'},
    'language': {'en': 'Language', 'hi': 'भाषा'},
    'pages': {'en': 'Chapters', 'hi': 'अध्याय'},
    'howto': {'en': 'How to read the screenshots', 'hi': 'स्क्रीनशॉट कैसे पढ़ें'},
    'howto_body': {'en': 'Orange numbered circles on a screen point to a button, field or area. The list next to or below the picture explains each number. A green “📷” label means the picture is a real screen from the app with demo data. A yellow “Illustrative Screen — Final UI may vary.” label means the screen is a mock-up of a Planned Feature.',
                   'hi': 'स्क्रीन पर नारंगी नंबर वाले गोले किसी बटन, फ़ील्ड या हिस्से की ओर इशारा करते हैं। तस्वीर के पास या नीचे की सूची हर नंबर का मतलब बताती है। हरा “📷” लेबल मतलब यह ऐप की असली स्क्रीन है (डेमो डेटा)। पीला “उदाहरण स्क्रीन — अंतिम डिज़ाइन अलग हो सकता है।” लेबल मतलब यह किसी Planned Feature का नमूना है।'},
    'changes': {'en': 'Version history', 'hi': 'संस्करण इतिहास'},
    'first': {'en': 'First edition', 'hi': 'पहला संस्करण'},
    'legal': {'en': 'This manual explains how to use the software. It does not replace or change any agreement or policy. If anything here differs from the published legal documents, the published legal documents apply.',
              'hi': 'यह मैनुअल सॉफ़्टवेयर का उपयोग समझाता है। यह किसी एग्रीमेंट या पॉलिसी को बदलता या उसकी जगह नहीं लेता। अगर यहाँ कुछ प्रकाशित कानूनी दस्तावेज़ों से अलग हो, तो प्रकाशित कानूनी दस्तावेज़ लागू होंगे।'},
}

def logo_uri():
    with open(os.path.join(ROOT, 'client/public/icon-512.png'), 'rb') as f: return 'data:image/png;base64,' + base64.b64encode(f.read()).decode()

def build_html(m, lang, pages=None):
    T = lambda k: E(L(TXT[k], lang))
    ver, date = C['MANUAL_VERSION'], L(C['MANUAL_DATE'], lang)
    secs = m['sections']
    cover = f"""<div class="cover"><div class="cover__pat"></div><div class="cover__in">
      <div class="cover__brand"><img src="{logo_uri()}"><div><b>{E(C['COMPANY'])}</b><small>उत्सव घर · Festival Marketplace</small></div></div>
      <div class="cover__kicker">{T('kicker')} · {E(L(m['audience'], lang))}</div>
      <h1>{E(L(m['title'], lang))}</h1><div class="cover__sub">{E(L(m['subtitle'], lang))}</div><div class="cover__line"></div>
      <div class="cover__meta"><div><span>{ui('version', lang)}</span><b>{ver}</b></div><div><span>{ui('date', lang)}</span><b>{E(date)}</b></div><div><span>{T('audience')}</span><b>{E(L(m['audience'], lang))}</b></div></div>
      <div class="cover__note">{T('cover_note')}</div>
      <div class="cover__note" style="margin-top:3mm">🔄 <b>{ui('updates_h', lang)}:</b> {ui('updates', lang)}</div></div></div>"""
    pg = lambda i: (str(pages.get(i, '')) if pages else '00')
    items = ''.join(f'<li><span class="n">{n}</span><span class="t">{E(L(s["title"], lang))}</span><span class="p">{pg(n)}</span></li>' for n, s in enumerate(secs, 1))
    items += f'<li class="extra"><span class="n">★</span><span class="t">{T("support")}</span><span class="p">{pg(len(secs) + 1)}</span></li>'
    lang_name = 'English' if lang == 'en' else 'हिंदी (Hindi)'
    toc = f"""<section class="toc"><h2>{ui('contents', lang)}</h2><p class="toc__intro">{T('toc_intro')}</p><ol>{items}</ol>
      <div class="docinfo"><div><span>{ui('version', lang)}</span><b>{ver}</b></div><div><span>{ui('date', lang)}</span><b>{E(date)}</b></div><div><span>{T('language')}</span><b>{lang_name}</b></div><div><span>{T('pages')}</span><b>{len(secs)}</b></div></div>
      <div class="note note--help" style="margin-top:5mm"><h3>🔢 {T('howto')}</h3><p>{T('howto_body')}</p></div></section>"""
    body = '\n'.join(section(m, s, n, lang) for n, s in enumerate(secs, 1))
    n_end = len(secs) + 1
    end = f"""<section class="endpage sec"><div class="sec__head"><div class="sec__num">★</div><div><small>{E(L(m['title'], lang))}</small><h2>{T('support')}<span class="mk">UGSEC{n_end:03d}</span></h2></div></div>
      <div class="note note--help"><h3>💬 {ui('help', lang)}</h3><p>{md(L(C['HELP'][m['help']], lang))}</p></div>
      <div class="blk"><h3>🗂️ {T('changes')}</h3><table class="t"><tr><th>{ui('version', lang)}</th><th>{ui('date', lang)}</th></tr><tr><td>{ver}</td><td>{E(date)} — {T('first')}</td></tr></table><p style="margin-top:3mm;font-size:9.5pt">🔄 <b>{ui('updates_h', lang)}:</b> {ui('updates', lang)}</p></div>
      <div class="docinfo"><div><span>{T('company')}</span><b>{E(C['COMPANY'])}</b></div><div><span>{ui('version', lang)}</span><b>{ver}</b></div><div><span>{ui('date', lang)}</span><b>{E(date)}</b></div><div><span>{T('language')}</span><b>{lang_name}</b></div></div>
      <p class="legal-note">{T('legal')}</p></section>"""
    return f"""<!doctype html><html lang="{lang}"><head><meta charset="utf-8"><title>{E(L(m['title'], lang))}</title>
<style>{font_face()}{CSS}</style></head><body>{cover}{toc}{body}{end}</body></html>"""

FOOTER = """<div style="width:100%;font:7.5pt 'DejaVu Sans',sans-serif;color:#8A7780;padding:0 15mm;display:flex;justify-content:space-between">
<span>{left}</span><span>{right} <span class="pageNumber"></span> / <span class="totalPages"></span></span></div>"""

def find_pages(pdf, n):
    txt = subprocess.run(['pdftotext', '-layout', pdf, '-'], capture_output=True, text=True).stdout
    pages = {}
    for i, pt in enumerate(txt.split('\f'), 1):
        for mm in re.finditer(r'UGSEC(\d{3})', pt): pages.setdefault(int(mm.group(1)), i)
    return pages

async def render(browser, m, lang):
    name = m['file'] + ('' if lang == 'en' else '_Hindi')
    page = await browser.new_page()
    left = E(f"{C['COMPANY']} · {L(m['title'], lang)} · v{C['MANUAL_VERSION']}")
    right = 'Page' if lang == 'en' else 'पेज'
    foot = FOOTER.format(left=left, right=right)
    pdf = os.path.join(OUT, name + '.pdf')
    pages = None
    for _ in range(2):
        hp = os.path.join(BUILD, name + '.html')
        open(hp, 'w').write(build_html(m, lang, pages))
        await page.goto('file://' + hp, wait_until='load'); await page.evaluate('document.fonts.ready'); await page.wait_for_timeout(300)
        await page.pdf(path=pdf, format='A4', print_background=True, prefer_css_page_size=True, display_header_footer=True, header_template='<span></span>', footer_template=foot)
        pages = find_pages(pdf, len(m['sections']) + 1)
    await page.close()
    info = subprocess.run(['pdfinfo', pdf], capture_output=True, text=True).stdout
    np_ = re.search(r'Pages:\s+(\d+)', info).group(1)
    miss = [i for i in range(1, len(m['sections']) + 2) if i not in pages]
    print(f'{name}.pdf  pages={np_}  size={os.path.getsize(pdf)//1024}KB  missing-toc={miss}')

async def main():
    only = sys.argv[1] if len(sys.argv) > 1 else None
    prep_images()
    async with async_playwright() as pw:
        b = await pw.chromium.launch()
        for m in DATA['manuals']:
            if only and m['key'] != only: continue
            for lang in ('en', 'hi'): await render(b, m, lang)
        await b.close()
    for f in os.listdir(OUT):
        if f.endswith('.pdf'): subprocess.run(['cp', os.path.join(OUT, f), os.path.join(ADM if f.startswith('Admin') else PUB, f)])

if __name__ == '__main__': asyncio.run(main())
