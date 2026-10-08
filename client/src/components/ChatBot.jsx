/**
 * "Utsav Sahayak" — the store's chat assistant. Answers common questions
 * instantly, tracks orders, finds products, explains payment / return / refund
 * steps, raises a support request in the chat, and hands over to a person on
 * WhatsApp. Rule-based (no data leaves the store), English / Hinglish / Hindi.
 */
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { detectIntent, SOLUTIONS, FAQ, topicOf } from '@shared/support.js';
import { parseVoice } from '@shared/voice.js';
import { api } from '../lib/api.js';
import { PAYMENT_LABEL, STATUS_LABEL, rupees } from '../lib/format.js';
import { normalizeIndianPhone } from '@shared/phone.js';
import { useAuth, useCart, useMoney, useStore } from '../state/store.jsx';
import { useAddToCart } from './ProductCard.jsx';
import { Media } from './ui.jsx';
import { CloseIcon } from './Icons.jsx';

export const openChat = (text) => window.dispatchEvent(new CustomEvent('ug:chat', { detail: { text } }));
const saveTicket = (n, t) => { try { localStorage.setItem('ug_tickets', JSON.stringify({ ...JSON.parse(localStorage.getItem('ug_tickets') || '{}'), [n]: t })); } catch { /* ignore */ } };

const MAIN = ['📦 Track my order', '💳 Payment problem', '💔 Damaged / wrong item', '↩️ Return or refund', '✖️ Cancel order', '🔎 Find a product', '🎁 Offers', '🙋 Talk to a person'];
const CHIP_TEXT = {
  '📦 Track my order': 'track my order', '💳 Payment problem': 'payment deducted but pending', '💔 Damaged / wrong item': 'item damaged',
  '↩️ Return or refund': 'return', '✖️ Cancel order': 'cancel order', '🔎 Find a product': '__find', '🎁 Offers': 'offers', '🙋 Talk to a person': 'talk to human',
  '💳 Card / EMI options': 'card payment options', '🚚 Delivery time': 'delivery days', '📝 Raise a request': '__raise', '🏠 Main menu': '__menu',
};
const SAMPLE = new Set(['9876543210', '919876543210']);
const RAISE_FOR = { payment: 'payment', damaged: 'damaged', wrong_item: 'wrong_item', return: 'return', refund: 'refund', cancel: 'cancel', address: 'address', account: 'account', bulk: 'bulk' };

export function ChatBot() {
  const { settings } = useStore();
  const { user } = useAuth();
  const cart = useCart();
  const add = useAddToCart();
  const { fmt } = useMoney();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState('');
  const [flow, setFlow] = useState(null);
  const [typing, setTyping] = useState(false);
  const [unread, setUnread] = useState(false);
  const end = useRef(null);
  const input = useRef(null);
  const wa = settings?.whatsapp_number || settings?.support_phone;
  const waOk = wa && !SAMPLE.has(String(wa).replace(/\D/g, ''));

  const bot = (m) => setMsgs((x) => [...x, { from: 'bot', ...m }]);
  const me = (t) => setMsgs((x) => [...x, { from: 'me', text: t }]);
  const greet = () => bot({ text: `Namaste${user ? ` ${user.name.split(' ')[0]}` : ''}! 🙏 I'm Utsav Sahayak. I can track your order, sort out payment or delivery problems, and help you find products. What do you need?`, chips: MAIN });

  useEffect(() => {
    const h = (e) => { setOpen(true); setUnread(false); if (e.detail?.text) setTimeout(() => handle(e.detail.text), 100); };
    window.addEventListener('ug:chat', h);
    return () => window.removeEventListener('ug:chat', h);
  });
  useEffect(() => { if (open && !msgs.length) greet(); if (open) setTimeout(() => input.current?.focus(), 100); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [msgs, typing]);
  // A gentle nudge after 40 s on checkout/cart if the chat hasn't been opened.
  useEffect(() => {
    if (open || msgs.length || !/^\/(checkout|cart)/.test(pathname)) return undefined;
    const t = setTimeout(() => setUnread(true), 40000);
    return () => clearTimeout(t);
  }, [pathname, open, msgs.length]);

  const think = async (fn) => { setTyping(true); await new Promise((r) => setTimeout(r, 350)); try { await fn(); } finally { setTyping(false); } };

  async function trackOrder(orderNumber, phone) {
    try {
      const o = await api.post('/orders/track', { orderNumber, phone });
      bot({ order: o, text: o.tracking ? `Shipped with ${o.tracking.carrier} — tracking no. ${o.tracking.number}.` : o.payment_status === 'verification_pending' ? "We're verifying your payment — usually within a few hours. Then we pack it straight away." : o.payment_status === 'awaiting_payment' ? 'This order is waiting for payment. You can pay from the order page.' : "Here's the latest on your order.", chips: ['💳 Payment problem', '✖️ Cancel order', '📝 Raise a request', '🏠 Main menu'] });
      setFlow({ kind: 'after_track', orderNumber, phone });
    } catch {
      bot({ text: "I couldn't find an order with that number and mobile. Please check both (order number looks like DIWALI10245) and try again.", chips: ['📦 Track my order', '🙋 Talk to a person'] });
      setFlow(null);
    }
  }

  async function findProducts(q) {
    const cmd = parseVoice(q);
    const query = cmd.query || q;
    const qs = new URLSearchParams({ q: query, limit: '3' });
    if (cmd.maxPrice) qs.set('max', String(cmd.maxPrice));
    const r = await api.get(`/products?${qs}`).catch(() => ({ items: [] }));
    return { items: r.items || [], query: r.corrected || query };
  }

  async function createTicket(f) {
    const fd = new FormData();
    fd.set('topic', f.topic); fd.set('name', f.name || user?.name || 'Customer'); fd.set('phone', f.phone || ''); fd.set('email', user?.email || '');
    fd.set('orderNumber', f.orderNumber || ''); fd.set('message', f.message); fd.set('source', 'chat');
    try {
      const r = await api.post('/support/tickets', fd);
      saveTicket(r.ticket.number, r.token);
      bot({ text: `✅ Done! Your request ${r.ticket.number} is with our team${topicOf(f.topic).priority === 'high' ? ' as priority' : ''}. We'll reply on WhatsApp / email within a few hours (10 am – 8 pm).${topicOf(f.topic).photo ? ' Please add a photo on the request page — it speeds things up.' : ''}`, link: [`/help/requests/${r.ticket.number}`, `Open request ${r.ticket.number}`], chips: ['🏠 Main menu'] });
      setFlow(null);
    } catch (x) {
      if (x.status === 409 && x.data?.number) { bot({ text: x.message, link: [`/help/requests/${x.data.number}`, `Open ${x.data.number}`], chips: ['🏠 Main menu'] }); setFlow(null); return; }
      const fe = x.fields || {};
      if (fe.orderNumber) { bot({ text: `${fe.orderNumber}. What's the order number?` }); setFlow({ ...f, kind: 'ticket', step: 'order' }); return; }
      if (fe.phone) { bot({ text: 'Which mobile number did you use for the order?' }); setFlow({ ...f, kind: 'ticket', step: 'phone' }); return; }
      bot({ text: x.message || 'Something went wrong. Please try again, or use the Help Center.', link: ['/help?raise=1', 'Open Help Center'] });
      setFlow(null);
    }
  }

  function startTicket(topic, known = {}) {
    const f = { kind: 'ticket', topic, phone: user?.phone || known.phone || '', orderNumber: known.orderNumber || '', name: user?.name || '' };
    if (topicOf(topic).needsOrder && !f.orderNumber) { bot({ text: "Sure, I'll raise it for you. What's your order number? (e.g. DIWALI10245)" }); setFlow({ ...f, step: 'order' }); return; }
    if (!f.phone) { bot({ text: 'Which mobile number should we contact you on?' }); setFlow({ ...f, step: 'phone' }); return; }
    bot({ text: 'Please describe the problem in a line or two.' }); setFlow({ ...f, step: 'message' });
  }

  async function handle(raw) {
    const t = String(raw || '').trim();
    if (!t) return;
    if (CHIP_TEXT[t] === '__menu') { me(t); setFlow(null); bot({ text: 'What else can I help with?', chips: MAIN }); return; }
    if (CHIP_TEXT[t] === '__find') { me(t); setFlow({ kind: 'find' }); bot({ text: 'What are you looking for? e.g. "brass diya", "pooja thali under 1000", "dinner set".' }); return; }
    if (CHIP_TEXT[t] === '__raise') {
      me(t);
      const topic = flow?.topic || (flow?.kind === 'after_track' ? 'order_status' : 'other');
      startTicket(topic, { orderNumber: flow?.orderNumber, phone: flow?.phone });
      return;
    }
    const said = CHIP_TEXT[t] || t;
    me(t);
    await think(async () => {
      // ----- multi-step flows -----
      if (flow?.kind === 'track_order') {
        const n = detectIntent(said).orderNumber || said.replace(/\s/g, '').toUpperCase();
        if (!/^[A-Z]*\d{4,8}$/.test(n)) { bot({ text: 'That doesn\'t look like an order number. It looks like DIWALI10245 — you\'ll find it in the confirmation SMS/email.' }); return; }
        if (user?.phone) return trackOrder(n, user.phone);
        bot({ text: 'And the mobile number used for the order?' }); setFlow({ kind: 'track_phone', orderNumber: n }); return;
      }
      if (flow?.kind === 'track_phone') {
        const p = normalizeIndianPhone(said);
        if (!/^[6-9]\d{9}$/.test(p) && !/^\+?\d{8,15}$/.test(said.replace(/[\s-]/g, ''))) { bot({ text: 'Please type the 10-digit mobile number, e.g. 98765 43210.' }); return; }
        return trackOrder(flow.orderNumber, p);
      }
      if (flow?.kind === 'ticket') {
        if (flow.step === 'order') {
          const n = detectIntent(said).orderNumber || said.replace(/\s/g, '').toUpperCase();
          if (!/^[A-Z]*\d{4,8}$/.test(n)) { bot({ text: 'Please type the order number, e.g. DIWALI10245.' }); return; }
          const f = { ...flow, orderNumber: n };
          if (!f.phone) { bot({ text: 'Which mobile number did you use for this order?' }); setFlow({ ...f, step: 'phone' }); return; }
          bot({ text: 'Please describe the problem in a line or two.' }); setFlow({ ...f, step: 'message' }); return;
        }
        if (flow.step === 'phone') {
          const p = normalizeIndianPhone(said);
          if (!/^[6-9]\d{9}$/.test(p)) { bot({ text: 'Please type a 10-digit mobile number.' }); return; }
          const f = { ...flow, phone: p };
          if (f.message) return createTicket(f);
          bot({ text: 'Please describe the problem in a line or two.' }); setFlow({ ...f, step: 'message' }); return;
        }
        if (flow.step === 'message') {
          if (said.length < 5) { bot({ text: 'Could you add a little more detail?' }); return; }
          const f = { ...flow, message: said };
          if (!f.name) { bot({ text: 'Last thing — your name?' }); setFlow({ ...f, step: 'name' }); return; }
          return createTicket(f);
        }
        if (flow.step === 'name') return createTicket({ ...flow, name: said.slice(0, 80) });
      }
      if (flow?.kind === 'find') {
        setFlow(null);
        const r = await findProducts(said);
        if (!r.items.length) { bot({ text: `I couldn't find "${said}". Try another word, or browse all products.`, link: ['/shop', 'Browse all products'] }); return; }
        bot({ text: `Here's what I found for "${r.query}":`, products: r.items, link: [`/shop?q=${encodeURIComponent(r.query)}`, 'See all results'] }); return;
      }

      // ----- fresh question -----
      const det = detectIntent(said);
      let { intent } = det; const { orderNumber } = det;
      // built-in AI (gift finder, product Q&A, intent model, help articles) for anything the rules didn't catch
      if (!orderNumber && (intent === 'shop' || intent === 'unknown')) {
        const ai = await api.post('/assistant', { q: said }).catch(() => null);
        if (ai?.type === 'gift') { bot({ text: ai.text, products: ai.items, chips: ['🔎 Find a product', '🏠 Main menu'] }); return; }
        if (ai?.type === 'product') { bot({ text: ai.text, products: [ai.product, ...(ai.others || [])].filter(Boolean).slice(0, 3), link: ai.product.url ? [ai.product.url, 'Open product page'] : null, chips: ['🙋 Talk to a person', '🏠 Main menu'] }); return; }
        if (ai?.type === 'kb') { bot({ text: ai.text, chips: ai.topic ? ['📝 Raise a request', '🏠 Main menu'] : ['🔎 Find a product', '🏠 Main menu'] }); if (ai.topic) setFlow({ kind: 'topic', topic: ai.topic }); return; }
        if (ai?.type === 'intent' && ai.intent !== 'shop' && ai.intent !== 'product_q' && ai.intent !== 'gift') intent = ai.intent;
      }
      if (intent === 'greet') { greet(); return; }
      if (intent === 'thanks') { bot({ text: "You're welcome! 🙏 Anything else?", chips: ['🏠 Main menu'] }); return; }
      if (intent === 'track') {
        if (orderNumber) { if (user?.phone) return trackOrder(orderNumber, user.phone); bot({ text: 'Got it. And the mobile number used for the order?' }); setFlow({ kind: 'track_phone', orderNumber }); return; }
        if (user) {
          const list = await api.get('/account/orders').catch(() => []);
          if (list.length) { bot({ text: 'Which order? Tap one or type the number:', chips: list.slice(0, 4).map((o) => o.order_number) }); setFlow({ kind: 'track_order' }); return; }
        }
        bot({ text: "Sure! What's your order number? (e.g. DIWALI10245 — it's in your confirmation SMS/email)" }); setFlow({ kind: 'track_order' }); return;
      }
      if (RAISE_FOR[intent]) {
        const s = SOLUTIONS[RAISE_FOR[intent]];
        bot({ text: `${s.title}\n${s.steps.map((x) => `• ${x}`).join('\n')}`, chips: ['📝 Raise a request', '🙋 Talk to a person', '🏠 Main menu'], link: (s.actions || [])[0] });
        setFlow({ kind: 'topic', topic: RAISE_FOR[intent], orderNumber }); return;
      }
      if (FAQ[intent]) {
        bot({ text: FAQ[intent], chips: intent === 'payment_methods' ? ['💳 Payment problem', '🏠 Main menu'] : ['🔎 Find a product', '🏠 Main menu'] }); return;
      }
      if (intent === 'human') {
        bot({
          text: waOk ? 'Our team is happy to help (10 am – 8 pm, Mon–Sat). Chat on WhatsApp, or raise a request and we\'ll reply there.' : 'Raise a request and our team will reply within a few hours (10 am – 8 pm, Mon–Sat).',
          wa: waOk ? `https://wa.me/${String(wa).replace(/\D/g, '').replace(/^(\d{10})$/, '91$1')}?text=${encodeURIComponent(`Namaste! I need help${flow?.orderNumber ? ` with order ${flow.orderNumber}` : ''}.`)}` : null,
          chips: ['📝 Raise a request', '🏠 Main menu'],
        });
        return;
      }
      // shopping or anything else: try a product search
      const r = await findProducts(said);
      if (r.items.length && (intent === 'shop' || r.items.length)) { bot({ text: intent === 'shop' ? `Here's what I found for "${r.query}":` : `Is this what you're looking for?`, products: r.items, link: [`/shop?q=${encodeURIComponent(r.query)}`, 'See all results'], chips: intent === 'shop' ? [] : ['🏠 Main menu'] }); return; }
      bot({ text: "Sorry, I didn't understand that. Pick one of these, or talk to our team:", chips: MAIN });
    });
  }

  const send = (e) => { e.preventDefault(); const t = text; setText(''); handle(t); };
  if (/^\/admin/.test(pathname)) return null;
  return (
    <>
      {!open && (
        <button className={`chatfab ${unread ? 'has-dot' : ''}`} onClick={() => { setOpen(true); setUnread(false); }} aria-label="Open help chat">
          <span aria-hidden="true">💬</span><span className="chatfab__txt">Help</span>
        </button>
      )}
      {open && (
        <div className="chat" role="dialog" aria-label="Utsav Sahayak chat">
          <header className="chat__head">
            <span className="chat__avatar" aria-hidden="true">🪔</span>
            <div><b>Utsav Sahayak</b><small>Usually replies instantly · team 10 am – 8 pm</small></div>
            <button className="icon-btn chat__x" onClick={() => setOpen(false)} aria-label="Close chat"><CloseIcon width={18} height={18} /></button>
          </header>
          <div className="chat__body" aria-live="polite">
            {msgs.map((m, i) => (
              <div key={i} className={`cm cm--${m.from}`}>
                {m.text && <p className="cm__bubble">{m.text}</p>}
                {m.order && (
                  <div className="cm__card">
                    <b>Order #{m.order.order_number}</b>
                    <span>{STATUS_LABEL[m.order.status]}{m.order.payment_status !== 'confirmed' && PAYMENT_LABEL[m.order.payment_status] !== STATUS_LABEL[m.order.status] ? ` · ${PAYMENT_LABEL[m.order.payment_status]}` : ''}</span>
                    <span className="small muted">{m.order.items?.length || 0} item(s) · {rupees(m.order.totals.total)}</span>
                    {m.order.estimated_delivery && <span className="small">Expected by {new Date(m.order.estimated_delivery).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>}
                    <Link to={`/track?order=${m.order.order_number}`} className="link small" onClick={() => setOpen(false)}>Full tracking →</Link>
                  </div>
                )}
                {m.products && (
                  <div className="cm__products">
                    {m.products.map((p) => (
                      <div key={p.id} className="cm__prod">
                        <Link to={p.url} className="cm__img" onClick={() => setOpen(false)}><Media product={p} /></Link>
                        <div><Link to={p.url} className="cm__pname" onClick={() => setOpen(false)}>{p.name}</Link><span className="cm__price">{fmt(p.price)}{p.discount_pct > 0 && <em> {p.discount_pct}% off</em>}</span>
                          <button className="btn btn--primary btn--sm" disabled={p.stock_status === 'out_of_stock'} onClick={() => { add(p); bot({ text: `Added ${p.name} to your cart 🛒`, chips: [`🛒 View cart (${cart.count + 1})`, '🏠 Main menu'] }); }}>{p.stock_status === 'out_of_stock' ? 'Sold out' : 'Add to cart'}</button></div>
                      </div>
                    ))}
                  </div>
                )}
                {m.wa && <a className="btn btn--wa btn--sm" href={m.wa} target="_blank" rel="noreferrer">💬 Chat on WhatsApp</a>}
                {m.link && <Link className="link small cm__link" to={m.link[0]} onClick={() => setOpen(false)}>{m.link[1] || 'Open'} →</Link>}
                {m.chips?.length > 0 && i === msgs.length - 1 && (
                  <div className="cm__chips">{m.chips.map((c) => (
                    c.startsWith('🛒 View cart')
                      ? <Link key={c} to="/cart" className="chip" onClick={() => setOpen(false)}>{c}</Link>
                      : <button key={c} type="button" className="chip" onClick={() => handle(c)}>{c}</button>
                  ))}</div>
                )}
              </div>
            ))}
            {typing && <div className="cm cm--bot"><p className="cm__bubble cm__typing"><span /><span /><span /></p></div>}
            <div ref={end} />
          </div>
          <form className="chat__in" onSubmit={send}>
            <input ref={input} value={text} onChange={(e) => setText(e.target.value)} placeholder="Type your question…" aria-label="Type your question" enterKeyHint="send" maxLength={500} />
            <button className="btn btn--primary btn--sm" disabled={!text.trim()}>Send</button>
          </form>
        </div>
      )}
    </>
  );
}
