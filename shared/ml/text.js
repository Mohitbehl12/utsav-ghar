/**
 * Small, dependency-free text ML used across the store (runs on the server and
 * in the browser, no external AI service, no cost):
 *  - NaiveBayes  : multinomial Naive Bayes classifier (chat intents)
 *  - BM25        : Okapi BM25 retrieval (answering questions from the help knowledge base)
 *  - sentiment   : lexicon sentiment for English + Hinglish review text
 */
import { normalize, stem } from '../ranking.js';

const STOP = new Set(('a an the is are was were be to of in on at for and or but i me my we our you your it its this that these those with from by as ' +
  'do does did have has had can could will would should please kindly hai hain ka ki ke ko se me mein main mera meri mere tha thi kya ye yeh wo vo').split(' '));

/** Lowercase, keep Devanagari, drop stop-words, stem, and add word pairs (bigrams) for context. */
export function features(text, { bigrams = true } = {}) {
  const toks = normalize(text).split(' ').filter((t) => t && !STOP.has(t)).map(stem);
  if (!bigrams) return toks;
  const out = [...toks];
  for (let i = 0; i < toks.length - 1; i++) out.push(`${toks[i]}_${toks[i + 1]}`);
  return out;
}

export class NaiveBayes {
  constructor({ alpha = 1 } = {}) { this.alpha = alpha; this.docs = new Map(); this.words = new Map(); this.totals = new Map(); this.vocab = new Set(); this.n = 0; }
  learn(text, label) {
    this.n++;
    this.docs.set(label, (this.docs.get(label) || 0) + 1);
    if (!this.words.has(label)) this.words.set(label, new Map());
    const w = this.words.get(label);
    for (const f of features(text)) { w.set(f, (w.get(f) || 0) + 1); this.totals.set(label, (this.totals.get(label) || 0) + 1); this.vocab.add(f); }
    return this;
  }
  /** → [{label, p}] sorted, probabilities sum to 1 */
  scores(text) {
    const fs = features(text).filter((f) => this.vocab.has(f));
    const V = this.vocab.size || 1;
    const logs = [...this.docs.keys()].map((label) => {
      let lp = Math.log(this.docs.get(label) / this.n);
      const w = this.words.get(label); const tot = this.totals.get(label) || 0;
      for (const f of fs) lp += Math.log(((w.get(f) || 0) + this.alpha) / (tot + this.alpha * V));
      return { label, lp };
    });
    const m = Math.max(...logs.map((x) => x.lp));
    const z = logs.reduce((s, x) => s + Math.exp(x.lp - m), 0);
    return logs.map((x) => ({ label: x.label, p: Math.exp(x.lp - m) / z, known: fs.length })).sort((a, b) => b.p - a.p);
  }
  predict(text) { const s = this.scores(text); return { ...s[0], second: s[1] }; }
}

export class BM25 {
  constructor(docs, { k1 = 1.4, b = 0.75 } = {}) {
    this.k1 = k1; this.b = b;
    this.docs = docs.map((d) => ({ ...d, toks: features(`${d.title || ''} ${d.title || ''} ${d.text}`, { bigrams: false }) }));
    this.avg = this.docs.reduce((s, d) => s + d.toks.length, 0) / (this.docs.length || 1);
    this.df = new Map();
    for (const d of this.docs) for (const t of new Set(d.toks)) this.df.set(t, (this.df.get(t) || 0) + 1);
  }
  idf(t) { const n = this.df.get(t) || 0; return Math.log(1 + (this.docs.length - n + 0.5) / (n + 0.5)); }
  search(q, limit = 3) {
    const qt = [...new Set(features(q, { bigrams: false }))];
    return this.docs.map((d) => {
      const tf = new Map(); for (const t of d.toks) tf.set(t, (tf.get(t) || 0) + 1);
      let s = 0;
      for (const t of qt) { const f = tf.get(t) || 0; if (f) s += this.idf(t) * ((f * (this.k1 + 1)) / (f + this.k1 * (1 - this.b + (this.b * d.toks.length) / this.avg))); }
      return { doc: d, score: s, matched: qt.filter((t) => tf.has(t)).length / (qt.length || 1) };
    }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score).slice(0, limit);
  }
}

// ---------- sentiment ----------
const POS = ('good great excellent amazing awesome beautiful lovely nice superb perfect best love loved loving happy satisfied worth sturdy solid heavy shiny bright ' +
  'elegant pretty premium quality fast quick safe well recommend recommended value gorgeous stunning fantastic wonderful neat polished authentic genuine pure fresh ' +
  'accha achha acha badhiya badiya sundar mast zabardast shandar khoobsurat badhia').split(' ');
const NEG = ('bad poor worst broken broke damaged damage cracked crack dent dented small smaller tiny thin flimsy cheap fake late delay delayed slow missing wrong ' +
  'dull faded leak leaking rust rusted smell disappointed disappointing waste refund return returned expensive overpriced loose scratched scratch less ' +
  'kharab bekar bakwas toota tuta tuti chota chhota ganda mehenga').split(' ');
const NEGATE = new Set(['not', 'no', 'never', 'nahi', 'nahin', 'na', 'didnt', 'dont', 'isnt', 'wasnt', 'hardly']);
const POSS = new Set(POS.map(stem)); const NEGS = new Set(NEG.map(stem));

/** −1 … +1 */
export function sentiment(text) {
  const toks = normalize(text).split(' ').filter(Boolean);
  let s = 0; let n = 0;
  toks.forEach((t, i) => {
    const w = stem(t);
    let v = POSS.has(w) ? 1 : NEGS.has(w) ? -1 : 0;
    if (!v) return;
    if (NEGATE.has(toks[i - 1]) || NEGATE.has(toks[i - 2])) v = -v;
    s += v; n++;
  });
  return n ? Math.max(-1, Math.min(1, s / Math.sqrt(n * 2))) : 0;
}

/** Product aspects shoppers talk about, and words that signal them. */
export const ASPECTS = {
  quality: ['quality', 'sturdy', 'solid', 'heavy', 'premium', 'flimsy', 'cheap', 'thin', 'durable', 'build', 'made', 'material', 'brass', 'metal'],
  look: ['beautiful', 'look', 'looks', 'design', 'shine', 'shiny', 'finish', 'polish', 'colour', 'color', 'pretty', 'elegant', 'stunning', 'dull', 'faded', 'sundar'],
  size: ['size', 'small', 'smaller', 'big', 'bigger', 'large', 'tiny', 'chota', 'chhota', 'compact', 'dimension'],
  delivery: ['delivery', 'delivered', 'arrived', 'shipping', 'late', 'fast', 'quick', 'time', 'courier', 'days', 'delay'],
  packaging: ['packaging', 'packed', 'box', 'packing', 'wrapped', 'gift', 'damaged', 'broken', 'cracked', 'dent'],
  value: ['price', 'value', 'worth', 'money', 'expensive', 'cheap', 'offer', 'discount', 'overpriced', 'paisa'],
};
const ASPECT_LABEL = { quality: 'quality', look: 'look & finish', size: 'size', delivery: 'delivery', packaging: 'packaging', value: 'value for money' };

/** Review highlights: overall mood + what people praise / complain about. */
export function summarizeReviews(reviews) {
  const rs = (reviews || []).filter((r) => r.body && r.body.length > 3);
  if (rs.length < 2) return null;
  const agg = Object.fromEntries(Object.keys(ASPECTS).map((k) => [k, { pos: 0, neg: 0 }]));
  let overall = 0;
  for (const r of rs) {
    // each sentence gets its own sentiment so "beautiful but small" counts both ways
    for (const sent of String(r.body).split(/[.!?;]|\bbut\b|\blekin\b|\bpar\b/i)) {
      const toks = new Set(normalize(sent).split(' ').map(stem));
      const sv = sentiment(sent) || ((r.rating || 3) - 3) / 2;
      for (const [k, words] of Object.entries(ASPECTS)) {
        if (words.some((w) => toks.has(stem(w)))) { if (sv > 0.05) agg[k].pos++; else if (sv < -0.05) agg[k].neg++; }
      }
    }
    overall += 0.6 * sentiment(r.body) + 0.4 * (((r.rating || 3) - 3) / 2);
  }
  overall /= rs.length;
  const pros = Object.entries(agg).filter(([, v]) => v.pos >= Math.max(1, v.neg * 2)).sort((a, b) => b[1].pos - a[1].pos).map(([k, v]) => ({ aspect: ASPECT_LABEL[k], n: v.pos }));
  const cons = Object.entries(agg).filter(([, v]) => v.neg >= 1 && v.neg >= v.pos / 2).sort((a, b) => b[1].neg - a[1].neg).map(([k, v]) => ({ aspect: ASPECT_LABEL[k], n: v.neg }));
  const mood = overall > 0.35 ? 'love' : overall > 0.1 ? 'like' : overall > -0.1 ? 'have mixed feelings about' : 'are unhappy with';
  const list = (a) => (a.length === 1 ? a[0] : `${a.slice(0, -1).join(', ')} and ${a.at(-1)}`);
  let text = `Customers ${mood} this product`;
  if (pros.length) text += `, especially the ${list(pros.slice(0, 3).map((p) => p.aspect))}`;
  text += '.';
  if (cons.length) text += ` ${cons[0].n === 1 ? 'One customer mentions' : 'Some mention'} ${list(cons.slice(0, 2).map((c) => c.aspect))}${cons[0].aspect === 'size' ? ' — check the dimensions before ordering' : ''}.`;
  return { text, score: Math.round(overall * 100) / 100, pros: pros.slice(0, 4), cons: cons.slice(0, 3), based_on: rs.length };
}
