/**
 * Voice shopping: turn what a shopper says into an action.
 * Works with English, Hinglish ("do brass diya cart mein daal do") and Hindi in
 * Devanagari ("मुझे दो दीये चाहिए"), as returned by the browser / phone speech engine.
 *
 *   parseVoice('add 2 brass diya')            → { intent: 'add', qty: 2, query: 'brass diya' }
 *   parseVoice('pooja thali 1000 se kam dikhao') → { intent: 'show', query: 'pooja thali', maxPrice: 1000 }
 *   parseVoice('cart dikhao')                  → { intent: 'cart' }
 */

// Devanagari → romanised words the store's search understands.
const HINDI = {
  'दिया': 'diya', 'दीया': 'diya', 'दिये': 'diya', 'दीये': 'diya', 'दीपक': 'diya', 'दिए': 'diya', 'दीए': 'diya',
  'थाली': 'thali', 'पूजा': 'pooja', 'रंगोली': 'rangoli', 'राखी': 'rakhi', 'लाइट': 'lights', 'लाइट्स': 'lights', 'झालर': 'lights',
  'कलश': 'kalash', 'कड़ाही': 'kadhai', 'कढ़ाई': 'kadhai', 'कड़ाई': 'kadhai', 'तवा': 'tawa', 'तोरण': 'toran', 'तोरन': 'toran', 'मोमबत्ती': 'candle', 'मोमबत्तियां': 'candle',
  'गिफ्ट': 'gift', 'उपहार': 'gift', 'हैम्पर': 'hamper', 'डिनर': 'dinner', 'सेट': 'set', 'प्लेट': 'plate', 'कटोरी': 'bowl', 'गिलास': 'glass', 'कप': 'cup',
  'पीतल': 'brass', 'तांबा': 'copper', 'तांबे': 'copper', 'मिट्टी': 'clay', 'स्टील': 'steel', 'लालटेन': 'lantern', 'कंदील': 'kandil', 'मूर्ति': 'idol',
  'अगरबत्ती': 'agarbatti', 'धूप': 'dhoop', 'घंटी': 'ghanti', 'गुलाल': 'gulal', 'रंग': 'colours', 'पिचकारी': 'pichkari', 'मसाला': 'masala', 'डिब्बा': 'dabba',
  'क्रिसमस': 'christmas', 'पेड़': 'tree', 'होली': 'holi', 'दिवाली': 'diwali', 'दीवाली': 'diwali',
  // numbers
  'एक': '1', 'दो': '2', 'तीन': '3', 'चार': '4', 'पांच': '5', 'पाँच': '5', 'छह': '6', 'छः': '6', 'सात': '7', 'आठ': '8', 'नौ': '9', 'दस': '10', 'बारह': '12', 'बीस': '20',
  'सौ': '100', 'हज़ार': '1000', 'हजार': '1000',
  // verbs & helpers
  'चाहिए': 'chahiye', 'चाहिये': 'chahiye', 'डाल': 'daal', 'डालो': 'daalo', 'जोड़ो': 'jodo', 'जोड़': 'jod', 'खरीदना': 'kharidna', 'खरीदो': 'kharido', 'खरीद': 'kharid',
  'दिखाओ': 'dikhao', 'दिखा': 'dikha', 'बताओ': 'batao', 'हटा': 'hata', 'हटाओ': 'hatao', 'निकालो': 'nikalo', 'कार्ट': 'cart', 'में': 'mein', 'से': 'se', 'कम': 'kam',
  'तक': 'tak', 'ज़्यादा': 'zyada', 'ज्यादा': 'zyada', 'रुपये': 'rupees', 'रुपए': 'rupees', 'का': 'ka', 'की': 'ki', 'के': 'ke', 'मुझे': 'mujhe', 'और': 'aur',
  'ऑर्डर': 'order', 'चेकआउट': 'checkout', 'पेमेंट': 'payment', 'वाला': 'wala', 'वाली': 'wali', 'करो': 'karo', 'कर': 'kar', 'दो।': '2',
};
const NUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12, dozen: 12, twenty: 20,
  ek: 1, teen: 3, char: 4, chaar: 4, paanch: 5, panch: 5, chhe: 6, che: 6, saat: 7, aath: 8, nau: 9, das: 10, barah: 12, bees: 20, a: 1, an: 1 };
const HUNDREDS = { hundred: 100, sau: 100, thousand: 1000, hazar: 1000, hazaar: 1000, k: 1000 };

const VERB_AFTER_DO = new Set(['daal', 'dal', 'kar', 'de', 'dikha', 'bata', 'hata', 'jod', 'rakh', 'nikal', 'bhej', 'laga']);
const FILLER = new Set(['please', 'plz', 'pls', 'mujhe', 'muje', 'mere', 'liye', 'for', 'me', 'i', 'want', 'need', 'would', 'like', 'to', 'the', 'my', 'some', 'can', 'you', 'get',
  'chahiye', 'chaiye', 'chahie', 'cart', 'basket', 'mein', 'main', 'me', 'mai', 'ko', 'ka', 'ki', 'ke', 'wala', 'wali', 'wale', 'karo', 'kar', 'do', 'de', 'dena', 'dijiye', 'kijiye',
  'daal', 'dal', 'daalo', 'dalo', 'jodo', 'jod', 'add', 'put', 'into', 'in', 'and', 'aur', 'bhi', 'ek', 'show', 'dikhao', 'dikha', 'batao', 'bata', 'details', 'detail', 'about',
  'tell', 'find', 'search', 'look', 'for', 'dhundo', 'dhoondo', 'kya', 'hai', 'hain', 'price', 'kitne', 'ka', 'kitna', 'buy', 'kharidna', 'kharido', 'kharid', 'order', 'now', 'abhi',
  'piece', 'pieces', 'pcs', 'pc', 'nag', 'items', 'item', 'of', 'with', 'wala', 'please', 'remove', 'hata', 'hatao', 'nikalo', 'delete', 'from', 'se', 'rupees', 'rupaye', 'rs',
  'inr', 'ruppees', 'rupay', 'only', 'sirf', 'what', 'is', 'are', 'how', 'much', 'the', 'this', 'that', 'yeh', 'ye', 'woh', 'vo', 'show', 'me', 'all', 'sab', 'saare', 'products', 'product']);

function normaliseScript(text) {
  let t = ` ${String(text || '').toLowerCase().replace(/[₹]/g, ' ₹').replace(/[,.!?।]/g, ' ')} `;
  t = t.replace(/[ऀ-ॿ]+/g, (w) => HINDI[w] || w);
  return t.replace(/\s+/g, ' ').trim();
}

/** "do sau" → 200, "1.5k" → 1500, "five hundred" → 500 */
function wordsToNumbers(tokens) {
  const out = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const next = tokens[i + 1];
    let n = /^\d+(\.\d+)?k?$/.test(t) ? (t.endsWith('k') ? parseFloat(t) * 1000 : parseFloat(t)) : (t !== 'do' && t !== 'a' && t !== 'an' ? NUM[t] : null);
    if (t === 'do' && !VERB_AFTER_DO.has(tokens[i - 1]) && (i === 0 || /^(mujhe|muje|ek|aur|and|bas|sirf|please|i|need|want|add)$/.test(tokens[i - 1] || '') || (next && !FILLER.has(next)))) n = 2;
    if ((t === 'a' || t === 'an') && next && !FILLER.has(next)) n = 1;
    if (n != null && next && HUNDREDS[next]) { out.push(String(n * HUNDREDS[next])); i++; continue; }
    if (n != null && t !== 'a' && t !== 'an') out.push(String(n));
    else if ((t === 'a' || t === 'an') && n === 1) out.push('1');
    else out.push(t);
  }
  return out;
}

export function parseVoice(text) {
  const raw = String(text || '').trim();
  const t = normaliseScript(raw);
  let toks = wordsToNumbers(t.split(' ').filter(Boolean));
  const s = ` ${toks.join(' ')} `;
  const has = (re) => re.test(s);

  // Whole-sentence commands first
  if (has(/ (checkout|check out|payment|pay now|order place|place order|order kar|order karo|payment kar) /)) return { intent: 'checkout', raw };
  if (has(/ (cart|basket|bag) (dikhao|dikha|kholo|khol|open|show|dekho|dekhna)|(show|open|view|go to) (my )?(cart|basket|bag)|^ ?(cart|basket) ?$/)) return { intent: 'cart', raw };

  let intent = 'show';
  if (has(/ (remove|hata|hatao|nikalo|nikal|delete|kam karo) /)) intent = 'remove';
  else if (has(/ (buy now|abhi kharid|kharidna hai|order now|abhi order) /)) intent = 'buy';
  else if (has(/ (add|put|daal|dal|daalo|dalo|jodo|jod|chahiye|chaiye|chahie|need|want|kharid|buy|order|lena hai|le lo|dedo|de do) /)) intent = 'add';

  // Price limits
  let maxPrice = null; let minPrice = null;
  const num = '(\\d+(?:\\.\\d+)?)';
  const m1 = s.match(new RegExp(`(?:under|below|less than|within|upto|up to|max|maximum|andar|budget) ₹? ?${num}`)) || s.match(new RegExp(`₹? ?${num} (?:rupees |rupaye |rs |inr )?(?:se kam|ke andar|tak|or less|or below|max|ke neeche)`));
  if (m1) maxPrice = Math.round(+m1[1]);
  const m2 = s.match(new RegExp(`(?:above|over|more than|min|minimum) ₹? ?${num}`)) || s.match(new RegExp(`₹? ?${num} (?:rupees |rupaye |rs )?(?:se zyada|se upar|or more|plus)`));
  if (m2) minPrice = Math.round(+m2[1]);
  let rest = s;
  for (const m of [m1, m2]) if (m) rest = rest.replace(m[0], ' ');
  rest = rest.replace(/₹ ?\d+(\.\d+)?/g, ' ').replace(/\d+ (rupees|rupaye|rs|inr)/g, ' ');

  // Quantity: the first remaining number (1–99)
  let qty = 1;
  const q = rest.match(/ (\d{1,2}) /);
  if (q && +q[1] >= 1 && +q[1] <= 99) { qty = +q[1]; rest = rest.replace(q[0], ' '); }
  toks = rest.split(' ').filter(Boolean);
  const query = toks.filter((w) => !FILLER.has(w) && !/^\d+$/.test(w)).join(' ').trim();

  if (!query && intent === 'add') return { intent: 'help', raw };
  if (!query && !maxPrice && !minPrice) return { intent: 'help', raw };
  return { intent, qty, query, maxPrice, minPrice, raw };
}

/** A short spoken summary of a product (read aloud after a voice request). */
export function describeForSpeech(p, { added = 0 } = {}) {
  const rupees = Math.round(p.price / 100);
  const parts = [`${p.name}.`, `${rupees} rupees${p.discount_pct ? `, ${p.discount_pct} percent off` : ''}.`];
  if (p.rating_count) parts.push(`Rated ${Number(p.rating).toFixed(1)} by ${p.rating_count} customers.`);
  if (p.stock_status === 'out_of_stock') parts.push('Sorry, it is out of stock right now.');
  else if (p.stock_left) parts.push(`Only ${p.stock_left} left.`);
  if (added) parts.push(`Added ${added} to your cart.`);
  return parts.join(' ');
}

export const VOICE_EXAMPLES = [
  '2 brass diya cart mein daal do',
  'pooja thali 1000 se kam dikhao',
  'मुझे दो दीये चाहिए',
  'show fairy lights under 500',
  'add one gift hamper',
  'cart dikhao',
];
