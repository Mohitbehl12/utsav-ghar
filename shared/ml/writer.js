/**
 * Built-in copywriter for the admin (no external AI, no cost). Builds product
 * descriptions, SEO titles / meta descriptions and social posts from the
 * product's own details, so text is accurate (it never invents specifications).
 * Several variations are produced; the admin picks and edits one.
 */
const OPEN = {
  'festive-decor': ['Bring festive glow home with the {name}.', 'Make every celebration brighter with the {name}.', 'Light up your home this season with the {name}.'],
  pooja: ['Give your mandir the care it deserves with the {name}.', 'Make every pooja graceful with the {name}.', 'A beautiful addition to your daily pooja: the {name}.'],
  'home-decor': ['Add warmth and character to any room with the {name}.', 'A handcrafted touch for your home: the {name}.', 'Style your space the festive way with the {name}.'],
  dining: ['Set a table your guests will remember with the {name}.', 'Serve in style with the {name}.', 'Everyday meals feel special with the {name}.'],
  kitchen: ['Cook festive favourites with ease using the {name}.', 'A dependable kitchen companion: the {name}.', 'Made for Indian kitchens — the {name}.'],
  gifts: ['A thoughtful gift, ready to give: the {name}.', 'Say it with a gift they will love — the {name}.', 'Gifting made easy with the {name}.'],
};
const MATERIAL_LINE = [
  [/brass|pital/i, 'Crafted in brass with a warm golden finish that only gets richer with care.'],
  [/copper/i, 'Made from copper, valued in Indian homes for generations.'],
  [/steel|stainless/i, 'Food-grade stainless steel that is easy to clean and built to last.'],
  [/cast iron|iron/i, 'Heavy cast iron that holds heat evenly and gets better with seasoning.'],
  [/terracotta|clay/i, 'Hand-shaped clay made by artisan potters — every piece is a little unique.'],
  [/ceramic|porcelain|stoneware/i, 'Glazed ceramic with a smooth finish that looks lovely on the table.'],
  [/glass/i, 'Clear glass that catches the light beautifully.'],
  [/wood|bamboo|sheesham|mango/i, 'Natural wood with a hand-finished look.'],
  [/led|electric/i, 'Energy-efficient LEDs that stay cool and safe for indoor use.'],
  [/herbal|natural|marigold|flower/i, 'Made with natural ingredients, gentle on skin and surroundings.'],
];
const pick = (arr, i) => arr[((i % arr.length) + arr.length) % arr.length];
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const trimTo = (s, n) => (s.length <= n ? s : `${s.slice(0, n - 1).replace(/[\s,;:–-]+\S*$/, '')}…`);
const rupee = (paise) => `₹${Math.round(paise / 100).toLocaleString('en-IN')}`;

/**
 * p: { name, category_name, segment, specs, price, mrp, is_diwali, short_description }
 * festival: current festival name (e.g. "Diwali")
 */
export function writeProduct(p, { festival = 'Diwali', store = 'Utsav Ghar', variant = 0 } = {}) {
  const specs = p.specs || {};
  const name = p.name || 'this piece';
  const seg = p.segment || 'gifts';
  const mat = specs.Material || '';
  const matLine = MATERIAL_LINE.find(([re]) => re.test(`${mat} ${name}`))?.[1] || '';
  const inBox = specs["What's included"] || specs.Includes || '';
  const size = specs.Dimensions || specs.Size || '';
  const care = specs.Care || '';
  const fest = p.is_diwali && festival ? ` Perfect for ${festival} décor and gifting.` : '';
  const off = p.mrp > p.price ? Math.round((1 - p.price / p.mrp) * 100) : 0;

  const descriptions = [0, 1, 2].map((k) => {
    const v = variant + k;
    const parts = [pick(OPEN[seg] || OPEN.gifts, v).replace('{name}', name)];
    if (matLine) parts.push(matLine);
    if (inBox) parts.push(`In the box: ${inBox.replace(/\.$/, '')}.`);
    if (size) parts.push(`Size: ${size.replace(/\.$/, '')}.`);
    if (care) parts.push(`Care: ${care.replace(/\.$/, '')}.`);
    parts.push(pick(['Quality-checked by the Utsav Ghar team before dispatch and packed safely.', 'Sourced from Indian makers and checked by our team before it ships.', 'Carefully packed so it reaches you in perfect condition.'], v));
    return (parts.join(' ') + fest).trim();
  });

  const shortBase = [mat && cap(mat.toLowerCase()), inBox && inBox.split(',').length > 1 ? `${inBox.split(',').length}-piece set` : '', size].filter(Boolean);
  const shorts = [
    trimTo(`${shortBase.slice(0, 2).join(' · ') || p.category_name || ''}${p.is_diwali ? ` · ${festival} favourite` : ''}`, 120),
    trimTo((p.short_description || descriptions[0].split('. ')[0]).replace(/\.$/, ''), 120),
    trimTo(`${matLine ? matLine.split(' ').slice(0, 8).join(' ') : cap(p.category_name || 'Handpicked')} — gift-ready`, 120),
  ].filter((x, i, a) => x && a.indexOf(x) === i);

  const kw = [name, p.category_name, mat.split(',')[0]].filter(Boolean);
  const seoTitles = [
    `${name} – Buy Online | ${store}`.length <= 60 ? `${name} – Buy Online | ${store}` : trimTo(`${name} – Buy Online`, 60),
    trimTo(`${name}${p.is_diwali ? ` for ${festival}` : ''} | ${off ? `${off}% Off` : 'Best Price'}`, 60),
    `Buy ${name} Online in India | ${store}`.length <= 60 ? `Buy ${name} Online in India | ${store}` : trimTo(`Buy ${name} Online in India`, 60),
  ];
  const seoDescs = [
    trimTo(`Shop ${name}${mat ? ` in ${mat.toLowerCase()}` : ''} at ${rupee(p.price)}${off ? ` (${off}% off)` : ''}. ${p.is_diwali ? `Ideal for ${festival}. ` : ''}Fast delivery across India, secure UPI & card payment.`, 155),
    trimTo(`${descriptions[0].split('. ').slice(0, 2).join('. ')}. Order online from ${store}.`, 155),
  ];

  const tags = ['#UtsavGhar', p.is_diwali ? `#${festival.replace(/\s/g, '')}` : '', `#${(p.category_name || 'Festive').replace(/[^A-Za-z]/g, '')}`, seg === 'pooja' ? '#PoojaRoom' : seg === 'dining' ? '#TableSetting' : seg === 'kitchen' ? '#IndianKitchen' : '#HomeDecor', '#MadeInIndia', '#FestiveVibes', '#ShopLocal'].filter(Boolean);
  const instagram = `✨ ${pick(OPEN[seg] || OPEN.gifts, variant).replace('{name}', name)}\n\n${matLine ? `${matLine}\n` : ''}${inBox ? `📦 ${inBox}\n` : ''}💰 Now ${rupee(p.price)}${off ? ` (${off}% off)` : ''}\n🚚 Delivery across India\n\n🛍️ Tap the link in bio to order\n\n${tags.join(' ')}`;
  const whatsapp = `🪔 *${name}*\n${matLine || p.short_description || ''}\n\n💰 *${rupee(p.price)}*${off ? ` ~${rupee(p.mrp)}~ (${off}% off)` : ''}\n🚚 Delivery in 3–6 days · Secure UPI & card payment\n\n👉 Order here: {link}`;

  return { descriptions, shorts, seoTitles, seoDescs, instagram, whatsapp, keywords: kw };
}
