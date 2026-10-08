/**
 * "Bolkar kharidiye" — shop by voice. The shopper says (or types) what they want:
 *   "2 brass diya cart mein daal do"  → finds the product, adds 2, reads the details aloud
 *   "pooja thali 1000 se kam dikhao"  → shows matching products with price, rating, stock
 *   "मुझे दो दीये चाहिए", "cart dikhao", "checkout karo", "diya hata do"
 * Speech comes from the browser (Chrome, Edge, Safari) or the phone in the app;
 * typing the same sentence always works too.
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { parseVoice, describeForSpeech, VOICE_EXAMPLES } from '@shared/voice.js';
import { relevance, tokens } from '@shared/ranking.js';
import { api } from '../lib/api.js';
import { track } from '../lib/track.js';
import { haptic, isApp, plugin as nativePlugin } from '../lib/native.js';
import { useCart, useMoney } from '../state/store.jsx';
import { Media, Stars } from './ui.jsx';
import { CloseIcon } from './Icons.jsx';

/**
 * Why the microphone can't be used here (or null if it can).
 * Browsers only allow the mic on secure sites (https://… or localhost), never on a
 * file opened from the computer, and not inside preview windows that don't grant it.
 */
function micContext() {
  if (typeof window === 'undefined') return null;
  if (isApp()) return null;
  if (location.protocol === 'file:' || location.origin === 'null') return 'file';
  if (!window.isSecureContext) return 'insecure';
  try { if (window.top !== window.self) return 'frame'; } catch { return 'frame'; }
  return null;
}

export const openVoiceShop = () => window.dispatchEvent(new CustomEvent('ug:voice'));
let activeRec = null;
const stopListening = () => { try { activeRec?.abort(); } catch { /* ignore */ } activeRec = null; };
const WebSpeech = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
const pref = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } } };

function speak(text, lang) {
  try {
    if (!('speechSynthesis' in window) || !text) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang === 'hi-IN' ? 'hi-IN' : 'en-IN';
    const v = window.speechSynthesis.getVoices().find((x) => x.lang === u.lang) || window.speechSynthesis.getVoices().find((x) => /en-IN|hi-IN/.test(x.lang));
    if (v) u.voice = v;
    u.rate = 1;
    window.speechSynthesis.speak(u);
  } catch { /* ignore */ }
}

/** Listen once: browser speech first; in the app, the phone's speech plugin. */
async function listenOnce(lang, { onPartial } = {}) {
  const native = isApp() && nativePlugin?.('SpeechRecognition');
  if (native) {
    try { await native.requestPermissions?.(); } catch { /* ignore */ }
    const r = await native.start({ language: lang, maxResults: 1, partialResults: false, popup: false });
    return r?.matches?.[0] || '';
  }
  if (!WebSpeech) throw new Error('unsupported');
  return new Promise((resolve, reject) => {
    const r = new WebSpeech();
    activeRec = r;
    r.lang = lang; r.interimResults = true; r.maxAlternatives = 1; r.continuous = false;
    let final = '';
    r.onresult = (ev) => {
      const t = Array.from(ev.results).map((x) => x[0].transcript).join(' ');
      onPartial?.(t);
      if (ev.results[ev.results.length - 1].isFinal) final = t;
    };
    r.onerror = (e) => reject(new Error(e.error || 'error'));
    r.onend = () => resolve(final);
    try { r.start(); } catch (e) { reject(e); }
  });
}

export function VoiceShop() {
  const [open, setOpen] = useState(false);
  const [lang, setLang] = useState(() => pref.get('ug_voice_lang', 'en-IN'));
  const [talk, setTalk] = useState(() => pref.get('ug_voice_talk', true));
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState('');
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState(null); // { msg, items, added: {p, qty}, cmd }
  const cart = useCart();
  const { fmt } = useMoney();
  const nav = useNavigate();
  const ctx = micContext();
  const canListen = (!!WebSpeech && ctx !== 'file' && ctx !== 'insecure') || (isApp() && !!nativePlugin?.('SpeechRecognition'));
  const [blocked, setBlocked] = useState(false);
  const say = (t) => talk && speak(t, lang);
  const inputRef = useRef(null);

  useEffect(() => {
    const h = (e) => { setOpen(true); setOut(null); setHeard(''); if (e.detail?.listen && canListen) setTimeout(() => start(), 250); };
    window.addEventListener('ug:voice', h);
    return () => window.removeEventListener('ug:voice', h);
  }); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return undefined;
    const esc = (e) => e.key === 'Escape' && close();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  });
  const close = () => { stopListening(); setListening(false); setOpen(false); try { window.speechSynthesis?.cancel(); } catch { /* ignore */ } };

  async function start() {
    setBlocked(false);
    setOut(null); setHeard(''); setListening(true); haptic();
    try {
      const t = await listenOnce(lang, { onPartial: setHeard });
      setListening(false);
      if (t) { setHeard(t); run(t); } else setOut({ msg: "I didn't hear anything. Tap the mic and speak, or type below." });
    } catch (e) {
      setListening(false);
      const denied = /not-allowed|service-not-allowed|permission/i.test(e.message);
      if (denied) { setBlocked(true); setOut(null); }
      else setOut({ msg: e.message === 'unsupported' ? 'Voice is not available in this browser. Type what you want below — it works the same way.' : /no-speech/.test(e.message) ? "I didn't hear anything. Tap the mic and speak a little louder." : /network/.test(e.message) ? 'Voice needs an internet connection. Please check your connection or type below.' : "Couldn't hear clearly. Please try again or type below." });
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }

  async function find(cmd) {
    const qs = new URLSearchParams({ q: cmd.query, limit: '4' });
    if (cmd.maxPrice) qs.set('max', String(cmd.maxPrice));
    if (cmd.minPrice) qs.set('min', String(cmd.minPrice));
    const r = await api.get(`/products?${qs}`);
    return r;
  }

  async function run(text) {
    if (listening) { stopListening(); setListening(false); }
    const cmd = parseVoice(text);
    if (cmd.intent === 'cart') { say('Opening your cart.'); close(); nav('/cart'); return; }
    if (cmd.intent === 'checkout') {
      if (!cart.count) { setOut({ msg: 'Your cart is empty. Tell me what you want to buy first.', cmd }); say('Your cart is empty.'); return; }
      say('Going to checkout.'); close(); nav('/checkout'); return;
    }
    if (cmd.intent === 'help') { setOut({ msg: "Sorry, I didn't catch a product name. Try one of these:", cmd, help: true }); say("Sorry, I didn't catch the product."); return; }
    if (cmd.intent === 'remove') {
      const lines = cart.quote?.lines || [];
      const words = tokens(cmd.query);
      const hit = lines.map((l) => ({ l, s: relevance({ name: l.name }, words) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s)[0]?.l;
      if (!hit) { setOut({ msg: `I couldn't find “${cmd.query}” in your cart.`, cmd }); say("That item isn't in your cart."); return; }
      cart.remove(hit.productId); haptic('MEDIUM');
      setOut({ msg: `Removed ${hit.name} from your cart.`, cmd }); say(`Removed ${hit.name}.`); return;
    }
    setBusy(true);
    try {
      const r = await find(cmd);
      const items = r.items || [];
      if (!items.length) { setOut({ msg: `No product found for “${cmd.query}”${cmd.maxPrice ? ` under ₹${cmd.maxPrice}` : ''}. Try another word.`, cmd }); say('Sorry, I could not find that.'); return; }
      const top = items[0];
      const note = r.corrected ? `Showing results for “${r.corrected}”.` : '';
      if ((cmd.intent === 'add' || cmd.intent === 'buy') && top.stock_status !== 'out_of_stock') {
        const qty = Math.min(cmd.qty || 1, top.stock_left ?? 99);
        cart.add(top.id, qty); haptic('MEDIUM');
        track('add_to_cart', { productId: top.id, name: top.name, value: top.price * qty, items: [{ id: top.id, qty, price: top.price, name: top.name }] });
        setOut({ msg: `${note} Added ${qty} × ${top.name} to your cart.`, items, added: { p: top, qty }, cmd, buy: cmd.intent === 'buy' });
        say(describeForSpeech(top, { added: qty }) + (cmd.intent === 'buy' ? ' Tap checkout to pay.' : ''));
      } else {
        setOut({ msg: `${note} ${items.length === 1 ? 'Here it is' : `Here are ${items.length} matches`}${cmd.maxPrice ? ` under ₹${cmd.maxPrice}` : ''}.${(cmd.intent === 'add' || cmd.intent === 'buy') ? ' The best match is out of stock — pick another below.' : ''}`, items, cmd });
        say(describeForSpeech(top));
      }
    } catch {
      setOut({ msg: 'Something went wrong. Please try again.', cmd });
    } finally { setBusy(false); }
  }

  const undo = () => {
    const a = out?.added;
    if (!a) return;
    const line = cart.items.find((i) => i.productId === a.p.id);
    if (line && line.qty > a.qty) cart.setQty(a.p.id, line.qty - a.qty); else cart.remove(a.p.id);
    setOut({ ...out, added: null, msg: `Removed ${a.p.name} again.` });
  };
  const swap = (p) => { undo(); const qty = out.added?.qty || out.cmd?.qty || 1; cart.add(p.id, qty); setOut({ ...out, added: { p, qty }, msg: `Added ${qty} × ${p.name} to your cart instead.` }); say(describeForSpeech(p, { added: qty })); };

  if (!open) return null;
  const items = out?.items || [];
  const main = out?.added?.p || items[0];
  return (
    <div className="vshop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="vshop__panel" role="dialog" aria-modal="true" aria-label="Shop by voice">
        <button className="icon-btn vshop__x" onClick={close} aria-label="Close"><CloseIcon /></button>
        <p className="welcome__kicker">🎤 Bolkar kharidiye</p>
        <h2 className="vshop__title">Say what you want to buy</h2>
        <div className="vshop__opts">
          <div className="tabs" role="tablist" aria-label="Language">
            <button role="tab" aria-selected={lang === 'en-IN'} className={lang === 'en-IN' ? 'is-on' : ''} onClick={() => { setLang('en-IN'); pref.set('ug_voice_lang', 'en-IN'); }}>English / Hinglish</button>
            <button role="tab" aria-selected={lang === 'hi-IN'} className={lang === 'hi-IN' ? 'is-on' : ''} onClick={() => { setLang('hi-IN'); pref.set('ug_voice_lang', 'hi-IN'); }}>हिंदी</button>
          </div>
          <label className="vshop__talk"><input type="checkbox" checked={talk} onChange={(e) => { setTalk(e.target.checked); pref.set('ug_voice_talk', e.target.checked); }} /> 🔊 Read aloud</label>
        </div>

        <button className={`vshop__mic ${listening ? 'is-on' : ''}`} onClick={listening ? undefined : start} disabled={!canListen} aria-label={listening ? 'Listening' : 'Tap and speak'}>
          <span aria-hidden="true">🎤</span>
        </button>
        <p className="vshop__state" aria-live="polite">{listening ? 'Listening… speak now' : canListen ? 'Tap the mic and speak' : 'Type what you want below 👇'}</p>
        {heard && <p className="vshop__heard">“{heard}”</p>}
        {!canListen && ctx && (
          <div className="vshop__note">
            <b>🎤 Voice can't use the microphone in this preview.</b>
            <span>{ctx === 'file' ? 'Browsers only allow the microphone on a real website (https://), not on a file opened from your computer.' : 'This page is not on a secure (https://) address, so the browser blocks the microphone.'} It will work on your live website <b>utsavghar.in</b> and in the app. For now, type the same sentence below — it does exactly the same.</span>
          </div>
        )}
        {blocked && (
          <div className="vshop__note">
            <b>🎤 Microphone is blocked for this site</b>
            {ctx === 'frame' ? (
              <span>This preview window doesn't allow the microphone. On your live website it will ask for permission. Type the sentence below to try it now.</span>
            ) : (
              <ol>
                <li>Tap the <b>🔒 lock</b> (or ⓘ / settings icon) at the left of the address bar.</li>
                <li>Find <b>Microphone</b> and choose <b>Allow</b>.</li>
                <li>Reload the page and tap 🎤 again.</li>
                <li className="muted">On Android Chrome: ⋮ menu → Settings → Site settings → Microphone. On iPhone: Settings → Safari → Microphone → Allow.</li>
              </ol>
            )}
          </div>
        )}

        <form className="vshop__type" onSubmit={(e) => { e.preventDefault(); if (typed.trim()) { setHeard(typed.trim()); run(typed.trim()); setTyped(''); } }}>
          <input ref={inputRef} value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="…or type: 2 brass diya add karo" aria-label="Type your request" enterKeyHint="go" />
          <button className="btn btn--primary btn--sm" disabled={busy}>Go</button>
        </form>

        {busy && <p className="vshop__state">Finding it…</p>}
        {out && (
          <div className="vshop__out" aria-live="polite">
            <p className={`vshop__msg ${out.added ? 'is-ok' : ''}`}>{out.added ? "✓ " : ""}{out.msg.trim()}</p>
            {out.added && (
              <div className="row gap-s wrap">
                <button className="btn btn--gold btn--sm" onClick={() => { close(); nav(out.buy ? '/checkout' : '/cart'); }}>{out.buy ? 'Checkout now →' : `View cart (${cart.count})`}</button>
                <button className="btn btn--ghost btn--sm" onClick={undo}>Undo</button>
              </div>
            )}
            {main && (
              <article className="vshop__card">
                <button className="vshop__img" onClick={() => { close(); nav(main.url); }} aria-label={`Open ${main.name}`}><Media product={main} /></button>
                <div className="vshop__info">
                  <b className="vshop__name">{main.name}</b>
                  <span className="vshop__price">{fmt(main.price)} {main.mrp > main.price && <s>{fmt(main.mrp)}</s>} {main.discount_pct > 0 && <em>{main.discount_pct}% off</em>}</span>
                  {main.rating_count > 0 && <Stars value={main.rating} count={main.rating_count} size={12} />}
                  <span className={`small ${main.stock_status === 'out_of_stock' ? 'bad-text' : 'muted'}`}>{main.stock_status === 'out_of_stock' ? 'Out of stock' : main.stock_left ? `Only ${main.stock_left} left` : 'In stock · delivery in 3–6 days'}</span>
                  <span className="small">{main.short_description}</span>
                  {main.specs?.Material && <span className="small muted">Material: {main.specs.Material}{main.specs.Dimensions ? ` · Size: ${main.specs.Dimensions}` : ''}</span>}
                  <div className="row gap-s wrap">
                    {!out.added && main.stock_status !== 'out_of_stock' && <button className="btn btn--primary btn--sm" onClick={() => { const qty = out.cmd?.qty || 1; cart.add(main.id, qty); setOut({ ...out, added: { p: main, qty }, msg: `Added ${qty} × ${main.name} to your cart.` }); say(`Added ${qty} ${main.name}.`); }}>Add {out.cmd?.qty > 1 ? out.cmd.qty : ''} to cart</button>}
                    <button className="btn btn--ghost btn--sm" onClick={() => { close(); nav(main.url); }}>Full details</button>
                  </div>
                </div>
              </article>
            )}
            {items.filter((p) => p.id !== main?.id).length > 0 && (
              <>
                <p className="small muted">{out.added ? 'Not this one? Tap to switch:' : 'More matches:'}</p>
                <div className="vshop__alts">
                  {items.filter((p) => p.id !== main?.id).slice(0, 3).map((p) => (
                    <button key={p.id} className="vshop__alt" onClick={() => (out.added ? swap(p) : setOut({ ...out, items: [p, ...items.filter((x) => x.id !== p.id)] }))}>
                      <span className="vshop__altimg"><Media product={p} /></span><span>{p.name}</span><b>{fmt(p.price)}</b>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
        {(!out || out.help) && (
          <div className="vshop__ex">
            <p className="small muted">Try saying:</p>
            <div className="search__chips">{VOICE_EXAMPLES.map((x) => <button key={x} type="button" className="chip" onClick={() => { setHeard(x); run(x); }}>“{x}”</button>)}</div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Home-page banner inviting shoppers to try voice shopping. */
export function VoiceBanner() {
  return (
    <button type="button" className="vbanner" onClick={() => window.dispatchEvent(new CustomEvent('ug:voice', { detail: { listen: true } }))}>
      <span className="vbanner__mic" aria-hidden="true">🎤</span>
      <span className="vbanner__txt"><b>New: Bolkar kharidiye — shop by voice</b><small>Say “2 brass diya cart mein daal do” or “मुझे पूजा थाली दिखाओ”</small></span>
      <span className="vbanner__go" aria-hidden="true">Try it →</span>
    </button>
  );
}
