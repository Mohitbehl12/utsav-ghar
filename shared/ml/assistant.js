/**
 * The "brain" behind the chat assistant — free, built-in ML (no external AI):
 *  1. Intent classifier (Naive Bayes trained on example sentences) backs up the
 *     keyword rules, so messages phrased differently are still understood.
 *  2. Product Q&A: finds the product being asked about and answers from its
 *     specifications ("is the brass diya pure brass?", "dinner set size?").
 *  3. Gift finder: reads who it's for, the occasion and budget, then ranks products.
 *  4. Knowledge search (BM25) over policies & FAQs for everything else.
 */
import { NaiveBayes, BM25, features } from './text.js';
import { FAQ, SOLUTIONS } from '../support.js';
import { search, normalize } from '../ranking.js';

// ---------- 1. intent classifier ----------
const TRAIN = {
  track: ['where is my order', 'my parcel has not arrived', 'when will i get my order', 'order not delivered yet', 'status of my order', 'track my package', 'kab tak aayega mera saman', 'mera order abhi tak nahi aaya', 'has my order shipped', 'delivery kab hogi', 'still waiting for my order', 'is my order dispatched', 'has my stuff been shipped yet', 'where is my package'],
  payment: ['money deducted but order pending', 'i paid but it shows unpaid', 'payment done but not confirmed', 'amount debited twice', 'upi payment stuck', 'paisa kat gaya order nahi hua', 'transaction failed but money gone', 'payment verification pending for long'],
  damaged: ['item arrived broken', 'the product is damaged', 'received a cracked piece', 'diya came with a dent', 'glass was shattered in the box', 'saman toot kar aaya', 'packet was torn and item damaged', 'scratches on the product'],
  wrong_item: ['i got the wrong item', 'one item is missing from my order', 'received different colour', 'only part of the order came', 'galat product bheja', 'box was empty', 'quantity is less than ordered'],
  return: ['i want to return this', 'how do i exchange', 'can i send it back', 'return policy', 'replace my product', 'mujhe wapas karna hai', 'not happy want to return'],
  refund: ['where is my refund', 'refund not received', 'when will i get my money back', 'refund status', 'paise wapas kab aayenge', 'refund kitne din mein'],
  cancel: ['cancel my order', 'i dont want this order anymore', 'please stop my order', 'order cancel kar do', 'ordered by mistake', 'cancel before shipping'],
  address: ['change my delivery address', 'wrong address entered', 'update phone number on order', 'deliver to another address', 'pata badalna hai'],
  delivery: ['how many days for delivery', 'delivery charges', 'do you deliver to my pincode', 'free shipping above', 'shipping time to bangalore', 'kitne din mein delivery'],
  payment_methods: ['can i pay by card', 'do you accept credit card', 'emi available', 'pay with netbanking', 'paytm wallet accepted', 'which payment options', 'rupay card chalega'],
  cod: ['cash on delivery available', 'can i pay cash', 'cod option', 'pay when product arrives'],
  offers: ['any discount', 'coupon code', 'current offers', 'promo code for first order', 'sale kab hai', 'koi offer hai kya', 'buy more save more'],
  international: ['do you ship to usa', 'delivery to dubai', 'international shipping', 'can i order from canada', 'ship outside india'],
  human: ['talk to a person', 'connect me to customer care', 'i want to speak to someone', 'call me back', 'kisi insaan se baat karni hai', 'agent please'],
  gift: ['gift for my mother', 'what can i gift my sister', 'diwali gift ideas', 'present for boss under 2000', 'housewarming gift', 'rakhi gift for brother', 'gift for wife', 'corporate gifts for employees', 'kya gift du'],
  shop: ['show me diyas', 'i want to buy a pooja thali', 'do you have fairy lights', 'brass kalash price', 'dinner set chahiye', 'looking for rangoli colours', 'candles for diwali'],
  product_q: ['is this pure brass', 'what is the size of the thali', 'how heavy is the diya', 'what comes in the box', 'is it dishwasher safe', 'how to clean brass', 'is the kadhai induction friendly', 'material of the dinner set'],
};
let NB = null;
export function intentModel() {
  if (NB) return NB;
  NB = new NaiveBayes({ alpha: 0.5 });
  for (const [label, xs] of Object.entries(TRAIN)) for (const x of xs) NB.learn(x, label);
  return NB;
}
/** ML guess at the intent: { label, p } (only trust p ≥ ~0.5). */
export function classify(text) { return intentModel().predict(text); }

// ---------- 2. product questions ----------
const ATTR = [
  { key: 'material', words: ['material', 'made', 'pure', 'brass', 'copper', 'steel', 'metal', 'real', 'genuine', 'plastic', 'ceramic', 'clay', 'wood', 'kis cheez'], spec: ['Material'] },
  { key: 'size', words: ['size', 'big', 'small', 'dimension', 'length', 'height', 'width', 'inch', 'cm', 'kitna bada', 'diameter'], spec: ['Dimensions', 'Size'] },
  { key: 'weight', words: ['weight', 'heavy', 'light', 'gram', 'kg', 'wajan', 'vajan'], spec: ['Weight'] },
  { key: 'box', words: ['box', 'included', 'include', 'comes with', 'comes in', 'what comes', 'inside', 'contents', 'pieces', 'set of', 'kya kya milega'], spec: ["What's included", 'Includes'] },
  { key: 'care', words: ['clean', 'wash', 'dishwasher', 'care', 'polish', 'maintain', 'saaf', 'microwave', 'induction'], spec: ['Care'] },
  { key: 'price', words: ['price', 'cost', 'rate', 'kitne', 'kitna', 'kya daam', 'how much'], spec: [] },
  { key: 'stock', words: ['stock', 'available', 'in stock', 'milega', 'sold out'], spec: [] },
  { key: 'delivery', words: ['deliver', 'delivery', 'kab', 'when', 'ship'], spec: ['Delivery'] },
];
const rupee = (p) => `₹${Math.round(p / 100).toLocaleString('en-IN')}`;
export function answerProductQuestion(q, products) {
  const t = ` ${normalize(q)} `;
  const attrs = ATTR.filter((a) => a.words.some((w) => t.includes(` ${w}`)));
  if (!attrs.length) return null;
  // search with only the product words (drop question & attribute words)
  const drop = new Set(['is', 'it', 'the', 'this', 'what', 'whats', 'how', 'of', 'a', 'an', 'are', 'does', 'do', 'can', 'will', 'there', 'much', 'many', 'kya', 'hai', 'ka', 'ki', 'ke', 'mein', 'friendly', 'safe', 'pure', 'real', 'genuine', 'made', 'size', 'weight', 'price', 'cost', 'available', 'stock', 'material', 'heavy', 'big', 'small', 'box', 'included', 'clean', 'wash', 'dishwasher', 'microwave', 'induction', 'delivery', 'deliver', 'when', 'kitna', 'kitne', 'how much']);
  const words = normalize(q).split(' ').filter((w) => w && !drop.has(w));
  const pq = words.length ? words.join(' ') : q;
  let { items } = search({ products, q: pq });
  if (!items.length) items = search({ products, q: words.slice(-2).join(' ') }).items;
  const p = items[0];
  if (!p) return null;
  const specs = p.specs || {};
  const lines = [];
  for (const a of attrs.slice(0, 3)) {
    if (a.key === 'price') lines.push(`Price: ${rupee(p.price)}${p.mrp > p.price ? ` (MRP ${rupee(p.mrp)}, ${p.discount_pct || Math.round((1 - p.price / p.mrp) * 100)}% off)` : ''}.`);
    else if (a.key === 'stock') lines.push(p.stock_status === 'out_of_stock' ? 'It is out of stock right now.' : p.stock_left ? `In stock — only ${p.stock_left} left.` : 'In stock and ready to ship.');
    else {
      const k = a.spec.find((s) => specs[s]);
      if (k) lines.push(`${k}: ${specs[k]}.`);
      else if (a.key === 'material' && /brass|copper|steel|clay|wood|ceramic|glass/i.test(p.name)) lines.push(`It's ${p.name.match(/brass|copper|steel|clay|wood|ceramic|glass/i)[0].toLowerCase()} (see the product page for full details).`);
    }
  }
  const weak = !lines.length;
  if (weak) lines.push(`${p.short_description || ''} For anything not listed on the page, ask our team and we'll check.`);
  return { weak, product: p, text: `${p.name} — ${lines.join(' ')}`, others: items.slice(1, 3) };
}

// ---------- 3. gift finder ----------
const RECIPIENTS = {
  mother: { words: ['mother', 'mom', 'mummy', 'maa', 'mumma', 'mataji', 'माँ', 'मम्मी'], segs: { pooja: 3, 'home-decor': 2, dining: 2, gifts: 2 } },
  father: { words: ['father', 'dad', 'papa', 'pitaji', 'पापा'], segs: { pooja: 2, dining: 2, gifts: 2 } },
  wife: { words: ['wife', 'patni', 'biwi', 'girlfriend'], segs: { 'home-decor': 3, gifts: 3, 'festive-decor': 2 } },
  husband: { words: ['husband', 'pati', 'boyfriend'], segs: { gifts: 3, dining: 2 } },
  sister: { words: ['sister', 'sis', 'behen', 'didi', 'bahan', 'बहन'], segs: { gifts: 3, 'home-decor': 2, 'festive-decor': 2 } },
  brother: { words: ['brother', 'bhai', 'bhaiya', 'भाई'], segs: { gifts: 3, dining: 1 } },
  friend: { words: ['friend', 'dost', 'colleague'], segs: { gifts: 3, 'festive-decor': 2, 'home-decor': 2 } },
  boss: { words: ['boss', 'manager', 'client', 'corporate', 'employees', 'staff', 'office', 'team'], segs: { gifts: 4, pooja: 1 } },
  couple: { words: ['newly', 'wedding', 'married', 'couple', 'shaadi'], segs: { dining: 3, 'home-decor': 3, pooja: 2 } },
  teacher: { words: ['teacher', 'guru', 'sir', 'madam'], segs: { pooja: 2, gifts: 2, 'home-decor': 2 } },
  kids: { words: ['kid', 'kids', 'child', 'children', 'bachche', 'baccho'], segs: { 'festive-decor': 2, gifts: 2 } },
};
const OCCASIONS = {
  diwali: { words: ['diwali', 'deepavali', 'dhanteras', 'दिवाली'], prefer: (p) => p.is_diwali },
  rakhi: { words: ['rakhi', 'raksha', 'bandhan', 'bhai dooj'], prefer: (p) => /rakhi|gift/.test(p.category_slug || '') },
  housewarming: { words: ['housewarming', 'griha', 'pravesh', 'new home', 'new house'], prefer: (p) => ['pooja', 'home-decor', 'dining'].includes(p.segment) },
  wedding: { words: ['wedding', 'shaadi', 'marriage', 'anniversary'], prefer: (p) => ['dining', 'home-decor', 'pooja'].includes(p.segment) },
  christmas: { words: ['christmas', 'xmas', 'new year'], prefer: (p) => /christmas|party|lights/.test(p.category_slug || '') },
  holi: { words: ['holi'], prefer: (p) => /holi/.test(p.category_slug || '') },
  birthday: { words: ['birthday', 'bday', 'janamdin'], prefer: (p) => ['gifts', 'home-decor', 'dining'].includes(p.segment) },
};
const has = (t, ws) => ws.some((w) => t.includes(` ${normalize(w)} `) || t.includes(` ${normalize(w)}s `));
export function parseGift(q) {
  const t = ` ${normalize(q)} `;
  const recipient = Object.entries(RECIPIENTS).find(([, r]) => has(t, r.words))?.[0] || null;
  const occasion = Object.entries(OCCASIONS).find(([, o]) => has(t, o.words))?.[0] || null;
  const m = t.match(/(?:under|below|less than|upto|up to|within|budget|max|andar|tak|se kam)\s*(?:rs|inr|₹)?\s*(\d{2,6})|(\d{2,6})\s*(?:rs|rupees|rupaye)?\s*(?:se kam|tak|ke andar|or less|budget)/);
  const budget = m ? Number(m[1] || m[2]) : null;
  const isGift = (/\bgift|present|tohfa|upahar|उपहार|गिफ्ट/.test(t) && !/gift ?(wrap|card|message|packing)/.test(t)) || !!(recipient && (occasion || budget));
  return { isGift, recipient, occasion, budget };
}
export function recommendGifts({ q, products, limit = 4 }) {
  const g = parseGift(q);
  if (!g.isGift) return null;
  const segs = g.recipient ? RECIPIENTS[g.recipient].segs : { gifts: 3, 'home-decor': 2, pooja: 1 };
  const occ = g.occasion ? OCCASIONS[g.occasion] : null;
  const scored = products.filter((p) => p.stock_status !== 'out_of_stock' && (!g.budget || p.price <= g.budget * 100)).map((p) => {
    let s = (segs[p.segment] || 0) * 2;
    if (occ?.prefer(p)) s += 3;
    if (p.is_bundle || /hamper|gift|set/i.test(p.name)) s += 2; // gift-ready
    s += (p.rating || 4) + Math.log10((p.rating_count || 0) + 1) * 0.8;
    if (g.budget) s += 2 * (p.price / (g.budget * 100)); // use the budget well
    if (/holi|christmas|rakhi/.test(p.category_slug || '') && !occ?.prefer(p)) s -= 4; // wrong festival
    return { p, s };
  }).sort((a, b) => b.s - a.s);
  const out = []; const cats = new Map();
  for (const { p } of scored) { if (out.length >= limit) break; if ((cats.get(p.category_id) || 0) >= 2) continue; cats.set(p.category_id, (cats.get(p.category_id) || 0) + 1); out.push(p); }
  const who = { mother: 'your mother', father: 'your father', wife: 'your wife', husband: 'your husband', sister: 'your sister', brother: 'your brother', friend: 'a friend', boss: 'office & clients', couple: 'the couple', teacher: 'your teacher', kids: 'the kids' }[g.recipient];
  const text = `🎁 Gift ideas${who ? ` for ${who}` : ''}${g.occasion ? ` this ${g.occasion[0].toUpperCase()}${g.occasion.slice(1)}` : ''}${g.budget ? ` under ₹${g.budget.toLocaleString('en-IN')}` : ''} — well-rated and gift-ready:`;
  return { ...g, text, items: out, why: out.map((p) => [p.rating_count ? `${p.rating}★` : null, /hamper|gift|set|combo/i.test(p.name) || p.is_bundle ? 'gift-ready' : null, p.discount_pct ? `${p.discount_pct}% off` : null].filter(Boolean).join(' · ')) };
}

// ---------- 4. knowledge search ----------
let KB = null;
export function knowledge() {
  if (KB) return KB;
  const docs = [
    ...Object.entries(FAQ).map(([k, text]) => ({ id: `faq:${k}`, title: k.replace(/_/g, ' '), text })),
    ...Object.entries(SOLUTIONS).map(([k, s]) => ({ id: `sol:${k}`, title: s.title, text: s.steps.join(' '), topic: k })),
    { id: 'p:gst', title: 'GST invoice bill tax', text: 'Prices include GST. A GST invoice is emailed when your order ships.' },
    { id: 'p:packaging', title: 'Packaging gift wrap', text: 'Fragile items like glass, ceramic and diyas are bubble-wrapped and boxed. Gift hampers come ready to give; we can add a message card — mention it in the order note or chat.' },
    { id: 'p:quality', title: 'Quality handmade artisans', text: 'Products are sourced from Indian artisans and checked by our team before dispatch. Handmade items can vary slightly in colour and size.' },
    { id: 'p:brass-care', title: 'How to clean brass copper polish', text: 'Clean brass and copper with lemon and salt or tamarind paste, rinse, and wipe dry. Avoid harsh scrubbers and dishwashers.' },
    { id: 'p:account', title: 'Account login password', text: 'You can shop without an account. With an account you can save addresses, see orders and keep your wishlist. Change password under Account, Login and Security.' },
    { id: 'p:privacy', title: 'Privacy data safe', text: 'Your data is used only for your orders and, if you agree, offers. Card details are never stored by us. Download or delete your data from Account, Login and Security.' },
    { id: 'p:bulk', title: 'Bulk corporate order wholesale', text: 'For 20 or more gifts we offer special prices, custom message cards and branding. Raise a request with quantity, budget and date.' },
    { id: 'p:festival', title: 'Diwali festival dates order in time', text: 'Order at least 7 days before the festival for delivery in time. Big festivals see heavy courier load.' },
  ];
  KB = new BM25(docs);
  return KB;
}
export function searchKnowledge(q) {
  const r = knowledge().search(q, 1)[0];
  return r && r.doc.id !== 'sol:other' && r.score > 1.5 && r.matched >= 0.5 ? { text: r.doc.text, title: r.doc.title, topic: r.doc.topic || null, score: r.score } : null;
}

/**
 * One call for the chat: tries gift finder, product Q&A, intent model and the
 * knowledge base. Returns null when nothing is confident enough.
 */
export function assist(q, products) {
  const gift = recommendGifts({ q, products });
  if (gift?.items.length) return { type: 'gift', ...gift };
  const pq = answerProductQuestion(q, products);
  const intent = classify(q);
  if (pq?.weak) { const kb = searchKnowledge(q); if (kb) return { type: 'kb', ...kb }; }
  if (pq && (intent.label === 'product_q' || intent.label === 'shop' || intent.p < 0.6)) return { type: 'product', ...pq };
  if (intent.label === 'product_q' || intent.label === 'gift') { const kb = searchKnowledge(q); return kb ? { type: 'kb', ...kb } : null; }
  if (intent.p >= 0.5 && intent.known >= 1) return { type: 'intent', intent: intent.label, confidence: Math.round(intent.p * 100) / 100 };
  const kb = searchKnowledge(q);
  if (kb) return { type: 'kb', ...kb };
  return null;
}
export const _features = features;
