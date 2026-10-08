/**
 * Search ranking, item-to-item collaborative filtering, Best Sellers Rank and
 * the "Utsav's Choice" pick — pure functions shared by the server and the demo.
 *
 * These follow the methods Amazon has described publicly:
 *  - Item-to-item collaborative filtering (Linden, Smith & York, IEEE Internet
 *    Computing 2003) with the "observed vs expected" correction from
 *    "Two Decades of Recommender Systems at Amazon.com" (Smith & Linden, 2017):
 *    a pair only counts when more customers bought both than chance predicts,
 *    so heavy buyers and generally popular items don't swamp everything.
 *  - Search ranking in two stages, as described for Amazon's product search:
 *    (1) text relevance to the query, then (2) re-ranking by how shoppers
 *    behave — recent sales, conversion (views → purchases), ratings and stock.
 *  - Best Sellers Rank: recent sales per category, recent days weighted more.
 * Amazon's production models are private; this is the published recipe,
 * sized for a store with tens to thousands of products.
 */

// ---------- text ----------

// Hinglish / common-spelling synonyms (both directions).
const SYN = [
  ['diya', 'diyas', 'deepak', 'deep', 'diye', 'lamp', 'lamps', 'diyaa'],
  ['thali', 'thaali', 'plate', 'plates'],
  ['rakhi', 'rakhee', 'rakri', 'rakhis'],
  ['gulal', 'colour', 'colours', 'color', 'colors', 'rang', 'abir'],
  ['agarbatti', 'incense', 'dhoop', 'dhup', 'sticks'],
  ['torans', 'toran', 'bandhanwar', 'bandarwal', 'door hanging'],
  ['murti', 'idol', 'statue', 'moorti'],
  ['kalash', 'kalas', 'lota'],
  ['candle', 'candles', 'mombatti'],
  ['lights', 'light', 'lighting', 'jhalar', 'fairy', 'string'],
  ['glass', 'glasses', 'tumbler', 'tumblers'],
  ['bowl', 'bowls', 'katori', 'katoris'],
  ['kadai', 'kadhai', 'karahi', 'wok'],
  ['tawa', 'tava', 'griddle'],
  ['masala', 'spice', 'spices'],
  ['dabba', 'container', 'containers', 'jar', 'jars', 'box'],
  ['gift', 'gifts', 'hamper', 'hampers', 'present'],
  ['brass', 'pital', 'peetal'],
  ['copper', 'tamba', 'tamra'],
  ['xmas', 'christmas', 'christmas tree'],
  ['pooja', 'puja', 'pujan', 'poojan'],
  ['ganesh', 'ganesha', 'ganpati', 'vinayak'],
  ['laxmi', 'lakshmi', 'laxmiji'],
  ['rangoli', 'kolam', 'alpana'],
  ['crockery', 'crockari', 'crokery', 'dinnerware', 'dinner', 'tableware', 'dining'],
  ['kitchen', 'rasoi', 'kitchenware'],
  ['cookware', 'bartan', 'utensil', 'utensils', 'cooking'],
  ['decor', 'decoration', 'decorations', 'sajawat', 'decorative'],
  ['cup', 'cups', 'mug', 'mugs'],
];
const SYN_MAP = new Map();
for (const g of SYN) for (const w of g) SYN_MAP.set(w, g);

const STOP = new Set(['for', 'the', 'a', 'an', 'and', 'of', 'with', 'in', 'set', 'pack', 'to', 'buy', 'online', 'best']);

export const normalize = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9ऀ-ॿ]+/g, ' ').trim();

/** Light stemming: diyas → diya, boxes → box, lights → light. */
export function stem(w) {
  if (w.length > 4 && w.endsWith('ies')) return `${w.slice(0, -3)}y`;
  if (w.length > 4 && /(ss|x|ch|sh)es$/.test(w)) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
}

export const tokens = (s) => normalize(s).split(' ').filter((t) => t && !STOP.has(t));

/** Damerau–Levenshtein distance with an early exit above `max`. */
export function editDistance(a, b, max = 2) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    let best = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const c = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      best = Math.min(best, d[i][j]);
    }
    if (best > max) return max + 1;
  }
  return d[a.length][b.length];
}
const allowedTypos = (w) => (w.length >= 8 ? 2 : w.length >= 4 ? 1 : 0);

// Field weights: a match in the product name matters most (like a title match).
const FIELDS = [['name', 3], ['category', 2.2], ['specs', 1.3], ['short', 1.2], ['desc', 0.6]];

// Tokenised text per product object, computed once (catalogue snapshots are reused between requests).
const DOCS = new WeakMap();
function docOf(p) {
  let d = DOCS.get(p);
  if (!d) { d = buildDoc(p); DOCS.set(p, d); }
  return d;
}
function buildDoc(p) {
  const specs = p.specs && typeof p.specs === 'object' ? Object.values(p.specs).join(' ') : String(p.specs || '');
  const f = { name: p.name, category: `${p.category_name || ''} ${p.segment || ''}`, specs, short: p.short_description, desc: p.description };
  const out = {};
  for (const [k] of FIELDS) out[k] = new Set(tokens(f[k]).flatMap((t) => [t, stem(t)]));
  return out;
}

/** Every word the catalogue uses — the dictionary for "Did you mean". */
export function vocabulary(products) {
  const v = new Map();
  for (const p of products) for (const t of tokens(`${p.name} ${p.category_name || ''} ${p.short_description || ''}`)) if (t.length > 2) v.set(stem(t), (v.get(stem(t)) || 0) + 1);
  return v;
}

/** Correct each misspelt query word to the closest catalogue word (or return null if nothing changed). */
export function spellCorrect(q, vocab) {
  let changed = false;
  const cands = new Map(vocab);
  for (const w of SYN_MAP.keys()) if (!w.includes(' ') && !cands.has(w)) cands.set(w, 1);
  const words = tokens(q).map((w) => {
    const s = stem(w);
    if (vocab.has(s) || SYN_MAP.has(w) || SYN_MAP.has(s)) return w;
    let best = null; let bd = allowedTypos(w) + 1; let bf = 0;
    for (const [cand, freq] of cands) {
      const dd = Math.min(editDistance(s, cand, allowedTypos(w)), editDistance(w, cand, allowedTypos(w)));
      if (dd < bd || (dd === bd && freq > bf)) { best = cand; bd = dd; bf = freq; }
    }
    if (best && bd <= allowedTypos(w)) { changed = true; return best; }
    return w;
  });
  return changed ? words.join(' ') : null;
}

/**
 * Stage 1: text relevance of product `p` to query words (0 = no match).
 * Each query word may match exactly, via synonym, by prefix, or with a typo;
 * every query word must match somewhere (AND), like a marketplace search box.
 */
export function relevance(p, qWords, doc, { prefixLast = false } = {}) {
  if (!qWords.length) return 1;
  doc = doc || docOf(p);
  let total = 0;
  const name = normalize(p.name);
  for (const w of qWords) {
    const s = stem(w);
    const alts = new Set([s, ...(SYN_MAP.get(w) || SYN_MAP.get(s) || []).map(stem)]);
    let best = 0;
    for (const [field, weight] of FIELDS) {
      const typing = prefixLast && w === qWords[qWords.length - 1] && s.length < 3;
      if (typing && field !== 'name' && field !== 'category') continue; // 1–2 letters: match titles only
      for (const t of doc[field]) {
        let m = 0;
        if (alts.has(t)) m = t === s ? 1 : 0.85;
        else if ((s.length >= 3 || (prefixLast && w === qWords[qWords.length - 1])) && (t.startsWith(s) || t.startsWith(w))) m = 0.7;
        else if (allowedTypos(w) && (editDistance(w, t, allowedTypos(w)) <= allowedTypos(w) || editDistance(s, t, allowedTypos(w)) <= allowedTypos(w))) m = 0.55;
        if (m * weight > best) best = m * weight;
      }
    }
    if (!best) return 0;
    total += best;
  }
  const phrase = normalize(qWords.join(' '));
  if (phrase.length > 3 && name.includes(phrase)) total += 2;       // the whole query appears in the title
  if (name.startsWith(normalize(qWords[0]))) total += 0.5;
  return total / qWords.length;
}

// ---------- behaviour ----------

const HALF_LIFE_DAYS = 7;
const decay = (iso, now) => Math.pow(0.5, Math.max(0, (now - new Date(iso).getTime()) / 864e5) / HALF_LIFE_DAYS);

/**
 * Per-product behaviour from the last 30 days.
 * sales: [{product_id, qty, at}], views: [{product_id, at}]
 * → Map(id → {units, velocity, views, conversion})
 */
export function behaviour({ sales = [], views = [], now = Date.now() }) {
  const m = new Map();
  const get = (id) => { if (!m.has(id)) m.set(id, { units: 0, velocity: 0, views: 0, buys: 0 }); return m.get(id); };
  const since = now - 30 * 864e5;
  for (const s of sales) {
    const t = new Date(s.at).getTime();
    if (t < since) continue;
    const x = get(Number(s.product_id));
    x.units += s.qty; x.buys += 1; x.velocity += s.qty * decay(s.at, now);
  }
  for (const v of views) if (new Date(v.at).getTime() >= since) get(Number(v.product_id)).views += 1;
  // Conversion with a prior (≈4% on 25 views) so a single lucky sale doesn't win.
  for (const x of m.values()) x.conversion = (x.buys + 1) / (x.views + 25);
  return m;
}

/** Bayesian average rating: pulls ratings with few reviews toward the store average. */
export function bayesRating(p, mean = 4.2, weight = 15) {
  const n = p.rating_count || 0;
  return ((p.rating || 0) * n + mean * weight) / (n + weight);
}

/** Stage 2: how well the product sells and satisfies (independent of the query). */
export function performance(p, b, stats) {
  const x = b?.get(p.id) || { velocity: 0, conversion: 1 / 25, views: 0 };
  const sales = Math.log1p(x.velocity) / Math.log1p(stats.maxVelocity || 1);           // 0..1
  const conv = Math.min(1, x.conversion / (stats.maxConversion || 1 / 25));             // 0..1
  const rating = Math.max(0, (bayesRating(p, stats.meanRating) - 3) / 2);               // 0..1
  const social = Math.log10((p.rating_count || 0) + 1) / 4;                             // reviews volume
  const avail = p.stock_status === 'out_of_stock' ? 0.25 : p.stock_status === 'low_stock' ? 0.9 : 1;
  const fresh = p.is_new ? 0.05 : 0;
  // A new store has no sales yet, so ratings carry more weight until sales exist.
  const w = stats.maxVelocity > 0 ? { s: 0.4, c: 0.2, r: 0.25, v: 0.15 } : { s: 0, c: 0, r: 0.6, v: 0.4 };
  return (w.s * sales + w.c * conv + w.r * rating + w.v * social + fresh) * avail;
}

export function statsFor(products, b) {
  let maxVelocity = 0; let maxConversion = 0; let sum = 0; let n = 0;
  for (const x of b?.values() || []) { maxVelocity = Math.max(maxVelocity, x.velocity); maxConversion = Math.max(maxConversion, x.conversion); }
  for (const p of products) if (p.rating_count) { sum += p.rating * p.rating_count; n += p.rating_count; }
  return { maxVelocity, maxConversion: maxConversion || 1 / 25, meanRating: n ? sum / n : 4.2 };
}

/**
 * Full search: returns {items (ranked), corrected (string|null)}.
 * With no query this is the "Featured" order for a category or the whole store.
 */
export function search({ products, q = '', b = new Map(), vocab, prefixLast = false }) {
  const stats = statsFor(products, b);
  const run = (query) => {
    const words = tokens(query);
    const out = [];
    for (const p of products) {
      const rel = relevance(p, words, undefined, { prefixLast });
      if (!rel) continue;
      // Relevance decides what is shown; performance mostly decides order among relevant items.
      // behaviour can lift a product by at most ~35%, so a better text match still wins.
      const score = words.length ? rel * (1 + 0.35 * performance(p, b, stats)) : performance(p, b, stats);
      out.push({ p, score });
    }
    return out.sort((x, y) => y.score - x.score || (y.p.rating_count || 0) - (x.p.rating_count || 0)).map((x) => x.p);
  };
  let items = run(q);
  let corrected = null;
  let relaxed = null;
  if (q && items.length === 0) {
    corrected = spellCorrect(q, vocab || vocabulary(products));
    if (corrected) items = run(corrected);
  }
  if (q && items.length === 0) {
    // Still nothing: drop the words no product matches and show results for the rest.
    const words = tokens(corrected || q);
    const keep = words.filter((w) => products.some((p) => relevance(p, [w]) > 0));
    if (keep.length && keep.length < words.length) { relaxed = keep.join(' '); items = run(relaxed); }
  }
  return { items, corrected, relaxed };
}

// ---------- Best Sellers Rank & Utsav's Choice ----------

/**
 * Best Sellers Rank within each category, from recent sales (recent days weigh more).
 * Before any sales exist it falls back to the admin's Bestseller flag and review count.
 * → Map(id → rank)
 */
export function bestSellerRanks(products, b) {
  const byCat = new Map();
  for (const p of products) {
    if (p.is_bundle) continue;
    if (!byCat.has(p.category_id)) byCat.set(p.category_id, []);
    byCat.get(p.category_id).push(p);
  }
  const ranks = new Map();
  for (const list of byCat.values()) {
    list.sort((x, y) => (b?.get(y.id)?.velocity || 0) - (b?.get(x.id)?.velocity || 0)
      || (y.is_bestseller ? 1 : 0) - (x.is_bestseller ? 1 : 0) || (y.rating_count || 0) - (x.rating_count || 0));
    list.forEach((p, i) => ranks.set(p.id, i + 1));
  }
  return ranks;
}

/**
 * "Utsav's Choice": one well-rated, well-priced, in-stock product per category
 * (the idea behind a marketplace's recommended pick). → Set of product ids.
 */
export function choicePicks(products, b) {
  const stats = statsFor(products, b);
  const byCat = new Map();
  for (const p of products) {
    if (p.is_bundle) continue;
    if (!byCat.has(p.category_id)) byCat.set(p.category_id, []);
    byCat.get(p.category_id).push(p);
  }
  const picks = new Set();
  for (const list of byCat.values()) {
    if (list.length < 2) continue;
    const prices = list.map((p) => p.price).sort((a, c) => a - c);
    const median = prices[Math.floor(prices.length / 2)];
    const ok = list.filter((p) => p.stock_status !== 'out_of_stock' && bayesRating(p, stats.meanRating) >= 4.2 && (p.rating_count || 0) >= 20 && p.price <= median * 1.25);
    ok.sort((x, y) => performance(y, b, stats) - performance(x, b, stats));
    if (ok[0]) picks.add(ok[0].id);
  }
  return picks;
}

/** "50+ bought in past month" — only from real orders, rounded down like marketplaces do. */
export function boughtLabel(units) {
  if (!units || units < 10) return null;
  const steps = [10000, 5000, 1000, 500, 400, 300, 200, 100, 50, 10];
  const s = steps.find((x) => units >= x);
  return `${s >= 1000 ? `${s / 1000}K` : s}+ bought in past month`;
}

// ---------- item-to-item collaborative filtering ----------

/**
 * customers: array of arrays — the distinct products each customer bought.
 * Returns Map(productId → [{id, score}]) of the items most "bought together by
 * the same customers", scored as (observed − expected) / √expected.
 */
export function itemToItem(customers, { minScore = 0.5, perItem = 20 } = {}) {
  const buyers = new Map(); // product → count of customers
  let totalPurchases = 0;
  const lists = customers.map((c) => [...new Set(c.map(Number))]).filter((c) => c.length);
  for (const c of lists) { for (const id of c) buyers.set(id, (buyers.get(id) || 0) + 1); totalPurchases += c.length; }
  const pair = new Map(); // "x|y" → observed
  const expected = new Map(); // x → Map(y → expected)
  const share = (y) => (buyers.get(y) || 0) / (totalPurchases || 1);
  for (const c of lists) {
    // Expected co-purchases: a customer with n purchases has n−1 other chances to buy Y.
    for (const x of c) {
      if (!expected.has(x)) expected.set(x, new Map());
      const e = expected.get(x);
      for (const y of buyers.keys()) if (y !== x) e.set(y, (e.get(y) || 0) + (1 - Math.pow(1 - share(y), c.length - 1)));
    }
    if (c.length > 60) continue; // resellers / bulk buyers add noise, not signal
    for (const x of c) for (const y of c) if (x !== y) pair.set(`${x}|${y}`, (pair.get(`${x}|${y}`) || 0) + 1);
  }
  const out = new Map();
  for (const [k, n] of pair) {
    const [x, y] = k.split('|').map(Number);
    const e = Math.max(expected.get(x)?.get(y) || 0, 0.05);
    const score = (n - e) / Math.sqrt(e);
    if (score < minScore) continue;
    if (!out.has(x)) out.set(x, []);
    out.get(x).push({ id: y, score, n });
  }
  for (const [x, list] of out) out.set(x, list.sort((a, b) => b.score - a.score).slice(0, perItem));
  return out;
}

/** Cosine similarity between two items' customer sets (the 2003 formulation) — used in tests/diagnostics. */
export function cosine(customers, x, y) {
  let a = 0; let b = 0; let both = 0;
  for (const c of customers) { const s = new Set(c); const hx = s.has(x); const hy = s.has(y); a += hx; b += hy; both += hx && hy; }
  return a && b ? both / Math.sqrt(a * b) : 0;
}

/**
 * Type-ahead word completions ("di" → diya, diyas set, dinner set, …) from the
 * catalogue's own words, Hinglish synonyms and category names, most popular first.
 */
export function completions(q, products, limit = 6) {
  const raw = normalize(q);
  if (!raw) return [];
  const words = raw.split(' ');
  const partial = words.pop();
  const before = words.join(' ');
  const UNITS = new Set(['pcs', 'pc', 'cm', 'mm', 'm', 'ml', 'ft', 'kg', 'g', 'l', 'ltr', 'inch', 'pack', 'x']);
  const need = words.map((w) => new Set([w, stem(w), ...(SYN_MAP.get(w) || [])]));
  const score = new Map();
  const add = (phrase, w) => { const k = phrase.trim(); if (k && k !== raw) score.set(k, (score.get(k) || 0) + w); };
  for (const p of products) {
    const pop = 1 + Math.log10((p.rating_count || 0) + 1) + (p.is_bestseller ? 1 : 0);
    const toks = normalize(p.name).split(' ').filter((t) => t && !STOP.has(t) && !UNITS.has(t) && !/^\d+$/.test(t));
    const all = new Set([...toks, ...toks.map(stem), ...normalize(p.category_name || '').split(' ')]);
    if (!need.every((alts) => [...alts].some((a) => all.has(a)))) continue; // earlier words must belong to this product
    toks.forEach((t, i) => {
      if (!t.startsWith(partial)) return;
      add(`${before} ${t}`, pop);
      if (toks[i + 1]) add(`${before} ${t} ${toks[i + 1]}`, pop * 0.8);
    });
    for (const t of normalize(p.category_name || '').split(' ')) if (t.length > 2 && t.startsWith(partial) && !STOP.has(t)) add(`${before} ${t}`, 1.5);
  }
  if (!before) for (const w of SYN_MAP.keys()) if (w.startsWith(partial) && w.length > partial.length && !w.includes(' ')) add(w, 0.6);
  // Prefer phrases whose earlier words actually appear in some product.
  return [...score.entries()].sort((a, b) => b[1] - a[1] || a[0].length - b[0].length).map(([k]) => k).slice(0, limit);
}

export const POPULAR_SEARCHES = ['diya', 'pooja thali', 'rangoli', 'fairy lights', 'toran', 'gift hamper', 'dinner set', 'kadhai', 'rakhi', 'christmas tree'];
