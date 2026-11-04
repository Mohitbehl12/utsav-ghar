/**
 * Filter facets for the shop page: material families (from the product's
 * Material spec and name), with counts for the current result set.
 */
export const MATERIALS = [
  ['brass', 'Brass', /\b(brass|pital|peetal)\b/i],
  ['copper', 'Copper', /\bcopper\b/i],
  ['steel', 'Stainless steel', /\b(steel|stainless)\b/i],
  ['iron', 'Iron & cast iron', /\b(cast iron|iron)\b/i],
  ['ceramic', 'Ceramic & porcelain', /\b(ceramic|porcelain|bone china|stoneware)\b/i],
  ['glass', 'Glass', /\bglass\b/i],
  ['clay', 'Clay & terracotta', /\b(clay|terracotta|mitti)\b/i],
  ['wood', 'Wood & bamboo', /\b(wood|wooden|bamboo|sheesham|mango wood|neem)\b/i],
  ['fabric', 'Fabric & thread', /\b(cotton|silk|fabric|thread|velvet|jute)\b/i],
  ['wax', 'Wax', /\bwax\b/i],
  ['metal', 'Other metal', /\b(metal|aluminium|aluminum|german silver|silver)\b/i],
  ['natural', 'Natural & herbal', /\b(herbal|natural|flower|marigold|areca|leaf|sandalwood)\b/i],
  ['led', 'LED & electric', /\b(led|electric|bulb|battery)\b/i],
  ['paper', 'Paper', /\b(paper|cardboard)\b/i],
  ['plastic', 'Plastic & acrylic', /\b(plastic|acrylic|latex|foil|mdf)\b/i],
];

export function materialsOf(p) {
  const text = `${p.specs?.Material || ''} ${p.name || ''}`;
  return MATERIALS.filter(([, , re]) => re.test(text)).map(([k]) => k);
}

/** Counts per material family and the price range, for the given products. */
export function facetsFor(products) {
  const counts = new Map();
  let min = Infinity; let max = 0;
  for (const p of products) {
    for (const m of materialsOf(p)) counts.set(m, (counts.get(m) || 0) + 1);
    min = Math.min(min, p.price); max = Math.max(max, p.price);
  }
  // Country of origin (Legal Metrology rule 6(10A): searchable, sortable filter). Products without a declared
  // country are grouped as "Not stated" so the filter never hides them silently.
  const origins = new Map();
  for (const p of products) { const o = originOf(p); origins.set(o, (origins.get(o) || 0) + 1); }
  return {
    origins: [...origins.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([value, count]) => ({ value, label: value === 'not-stated' ? 'Not stated' : value.replace(/\b\w/g, (c) => c.toUpperCase()), count })),
    materials: MATERIALS.filter(([k]) => counts.has(k)).map(([k, label]) => ({ value: k, label, count: counts.get(k) })),
    price: products.length ? { min: Math.floor(min / 100), max: Math.ceil(max / 100) } : null,
  };
}

/** Normalised country-of-origin key for filtering: "India" → "india"; missing → "not-stated". */
export function originOf(p) {
  const c = String(p.origin_country || '').trim().toLowerCase().replace(/[^a-z ]/g, '').replace(/\s+/g, ' ');
  return c || 'not-stated';
}
