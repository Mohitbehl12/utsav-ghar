// Injected into the page before a screenshot: draws numbered callouts on the elements listed.
// Usage: window.__mark([selector, ...]) → [{ i, ok, reason }]
window.__mark = (sels) => {
  document.querySelectorAll('.__mk').forEach((n) => n.remove());
  const vis = (e) => { if (!e) return false; const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 2 && r.height > 2 && s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.05; };
  const inView = (e) => { const r = e.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth; };
  const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const strip = (s) => norm(s).replace(/^[^a-z0-9₹]+/i, '');
  const pick = (list) => { const v = list.filter(vis); return v.find(inView) || v[0] || null; };
  const area = (e) => { const r = e.getBoundingClientRect(); return r.width * r.height; };
  function find(sel) {
    const [kind, ...rest] = sel.split(':'); const q = rest.join(':');
    if (kind === 'css') { for (const part of q.split(',')) { try { const e = pick([...document.querySelectorAll(part.trim())]); if (e) return e; } catch { /* bad selector */ } } return null; }
    if (kind === 'ph') { const want = norm(q); return pick([...document.querySelectorAll('input,textarea')].filter((e) => norm(e.placeholder).startsWith(want))); }
    if (kind === 'label') {
      const want = strip(q);
      const labels = [...document.querySelectorAll('label, .field, .dl-field')].filter((l) => { const sp = l.querySelector('span, .field__label'); return strip(sp ? sp.textContent : l.textContent).startsWith(want); });
      return pick(labels.sort((a, b) => area(a) - area(b)));
    }
    if (kind === 'has') {
      const want = norm(q);
      const cands = [...document.querySelectorAll('button, a, label, h1, h2, h3, h4, p, li, td, div, span')].filter((e) => norm(e.innerText).includes(want));
      return pick(cands.sort((a, b) => area(a) - area(b)));
    }
    if (kind === 'text') {
      const want = strip(q);
      const cands = [...document.querySelectorAll('button, a, label, h1, h2, h3, h4, summary, legend, th, [role=tab], dt, b, strong, span, p, div, li, td')]
        .filter((e) => { const tx = strip(e.innerText || ''); return tx.startsWith(want) && tx.length < want.length + 160; });
      // prefer interactive and smallest
      const score = (e) => (/^(BUTTON|A|SUMMARY|LABEL)$/.test(e.tagName) || e.getAttribute('role') === 'tab' ? 0 : 1) * 1e7 + area(e);
      return pick(cands.sort((a, b) => score(a) - score(b)));
    }
    return null;
  }
  const out = [];
  sels.forEach((sel, i) => {
    const e = find(sel);
    if (!e) { out.push({ i: i + 1, ok: false, reason: 'not found', sel }); return; }
    const r = e.getBoundingClientRect();
    if (!inView(e)) { out.push({ i: i + 1, ok: false, reason: 'off-screen', sel, top: r.top }); return; }
    const box = document.createElement('div'); box.className = '__mk';
    const pad = 3;
    Object.assign(box.style, { position: 'fixed', left: `${Math.max(1, r.left - pad)}px`, top: `${Math.max(1, r.top - pad)}px`, width: `${Math.min(innerWidth - 2, r.width + pad * 2)}px`, height: `${Math.min(innerHeight - 2, r.height + pad * 2)}px`,
      border: '3px solid #E8501F', borderRadius: '8px', boxShadow: '0 0 0 2px rgba(255,255,255,.85)', zIndex: 2147483646, pointerEvents: 'none' });
    const b = document.createElement('div'); b.className = '__mk'; b.textContent = String(i + 1);
    const size = 28; let x = r.left - size / 2 - 2; let y = r.top - size / 2 - 2;
    x = Math.min(Math.max(2, x), innerWidth - size - 2); y = Math.min(Math.max(2, y), innerHeight - size - 2);
    Object.assign(b.style, { position: 'fixed', left: `${x}px`, top: `${y}px`, width: `${size}px`, height: `${size}px`, borderRadius: '50%', background: '#E8501F', color: '#fff',
      font: '800 16px/28px Arial, sans-serif', textAlign: 'center', boxShadow: '0 0 0 3px #fff, 0 3px 8px rgba(0,0,0,.35)', zIndex: 2147483647, pointerEvents: 'none' });
    document.body.append(box, b);
    out.push({ i: i + 1, ok: true });
  });
  return out;
};
