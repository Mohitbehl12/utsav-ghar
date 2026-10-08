/**
 * Shrink and re-encode a photo in the browser before upload. Phone photos are
 * often 4–12 MB; this turns them into sharp ~150–400 KB WebP (or JPEG) files,
 * fixes EXIF rotation (createImageBitmap honours it) and keeps uploads fast on
 * mobile data.
 */
export async function prepareImage(file, { maxSide = 1600, quality = 0.86 } = {}) {
  if (!/^image\//.test(file.type)) throw new Error(`${file.name} is not an image`);
  let bmp;
  try {
    bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return file; // unusual format — let the server validate it
  }
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale);
  const h = Math.round(bmp.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  const toBlob = (type) => new Promise((res) => canvas.toBlob(res, type, quality));
  let blob = await toBlob('image/webp');
  let ext = 'webp';
  if (!blob || blob.type !== 'image/webp') { blob = await toBlob('image/jpeg'); ext = 'jpg'; }
  if (!blob || (blob.size > file.size && scale === 1 && file.size < 5 * 1024 * 1024)) return file; // original was already small
  const base = file.name.replace(/\.[^.]+$/, '');
  return new File([blob], `${base}.${ext}`, { type: blob.type });
}

const norm = (s) => String(s).toLowerCase().replace(/\.[a-z0-9]+$/, '').replace(/[_\s]+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');

/**
 * Match a file name to a product: exact slug first ("premium-brass-diya-2.jpg"),
 * then best word overlap with the product name ("Brass Diya Premium.jpeg").
 */
export function matchProduct(fileName, products) {
  const n = norm(fileName).replace(/-(\d{1,2}|front|back|side|main|top)$/, '');
  const exact = products.find((p) => p.slug === n || norm(p.name) === n);
  if (exact) return { product: exact, confidence: 'exact' };
  const words = new Set(n.split('-').filter((w) => w.length > 2));
  if (!words.size) return { product: null, confidence: 'none' };
  let best = null;
  let bestScore = 0;
  for (const p of products) {
    const pw = new Set(`${p.slug}-${norm(p.name)}`.split('-').filter((w) => w.length > 2));
    let hit = 0;
    for (const w of words) if (pw.has(w)) hit++;
    const score = hit / Math.max(words.size, 1) + hit * 0.01;
    if (score > bestScore) { bestScore = score; best = p; }
  }
  return bestScore >= 0.5 ? { product: best, confidence: 'likely' } : { product: null, confidence: 'none' };
}

/** Search words that find good free photos for a product. */
const QUERIES = {
  'brass-diya': 'brass diya', diya: 'clay diya diwali', lotus: 'tealight holder', candle: 'jar candle', thali: 'pooja thali',
  kalash: 'copper kalash', bell: 'brass bell temple', incense: 'incense sticks', rangoli: 'rangoli', garland: 'marigold garland',
  lights: 'fairy lights', akash: 'diwali lantern', lantern: 'moroccan lantern', urli: 'urli flowers', cushion: 'embroidered cushion',
  runner: 'table runner', hamper: 'diwali gift hamper', giftbox: 'gift box', wallhang: 'wall hanging decor', om: 'om brass',
  nazar: 'evil eye', toran: 'toran door decoration',
};
export function photoQuery(p) {
  return QUERIES[p.art?.type] || p.name.replace(/\(.*?\)/g, '').trim();
}
export function freePhotoLinks(p) {
  const q = photoQuery(p);
  const e = encodeURIComponent(q);
  const d = q.trim().replace(/\s+/g, '-');
  return [
    ['Pexels', `https://www.pexels.com/search/${e}/`],
    ['Unsplash', `https://unsplash.com/s/photos/${d}`],
    ['Pixabay', `https://pixabay.com/images/search/${e}/`],
  ];
}
