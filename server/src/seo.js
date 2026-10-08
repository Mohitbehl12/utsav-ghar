/**
 * Server-side SEO: sitemap.xml, robots.txt and per-URL <head> injection so that
 * crawlers and link previews (WhatsApp, Facebook) see real titles, descriptions,
 * Open Graph tags and Product JSON-LD without executing JavaScript.
 */
import fs from 'node:fs';
import path from 'node:path';
import { db } from './db.js';
import { config } from './config.js';
import { PRODUCT_SELECT, getSettings } from './lib/catalog.js';
import { BRAND } from '../../shared/brand.js';
import { SEGMENTS } from '../../shared/festivals.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const jsonLd = (o) => JSON.stringify(o).replace(/</g, '\\u003c');

export function sitemap(req, res) {
  const base = config.publicUrl;
  const urls = ['/', '/shop', '/offers', '/about', '/contact', '/faq', '/shipping', '/returns', ...SEGMENTS.map((x) => `/s/${x.slug}`)].map((u) => [u]);
  for (const c of db.prepare('SELECT slug FROM categories WHERE is_active = 1').all()) urls.push([`/shop/${c.slug}`]);
  for (const p of db.prepare(`${PRODUCT_SELECT} WHERE p.is_active = 1`).all()) urls.push([`/shop/${p.category_slug}/${p.slug}`, p.updated_at]);
  res.type('application/xml').send(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
      .map(([u, d]) => `  <url><loc>${esc(base + u)}</loc>${d ? `<lastmod>${esc(String(d).slice(0, 10))}</lastmod>` : ''}</url>`)
      .join('\n')}\n</urlset>`
  );
}

export function robots(req, res) {
  res.type('text/plain').send(`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /dealer\nDisallow: /account\nDisallow: /checkout\nDisallow: /api/\nSitemap: ${config.publicUrl}/sitemap.xml\n`);
}

function metaFor(urlPath) {
  const base = config.publicUrl;
  const m = urlPath.match(/^\/shop\/([a-z0-9-]+)\/([a-z0-9-]+)\/?$/);
  if (m) {
    const p = db.prepare(`${PRODUCT_SELECT} WHERE p.slug = ? AND p.is_active = 1`).get(m[2]);
    if (p) {
      const img = db.prepare('SELECT url FROM product_images WHERE product_id = ? ORDER BY sort_order LIMIT 1').get(p.id)?.url;
      const url = `${base}/shop/${p.category_slug}/${p.slug}`;
      const price = `₹${Math.round(p.price / 100).toLocaleString('en-IN')}`;
      return {
        body: `<nav class="ssr__crumbs"><a href="/">Home</a> › <a href="/shop/${esc(p.category_slug)}">${esc(p.category_name)}</a></nav>
          <h1>${esc(p.name)}</h1><p class="ssr__price"><b>${price}</b>${p.mrp > p.price ? ` <s>₹${Math.round(p.mrp / 100).toLocaleString('en-IN')}</s>` : ''}</p>
          <p>${esc(p.short_description)}</p><p>${esc(p.description || '')}</p><p><a href="/shop/${esc(p.category_slug)}">More in ${esc(p.category_name)}</a></p>`,
        breadcrumbs: [['Home', '/'], [p.category_name, `/shop/${p.category_slug}`], [p.name, `/shop/${p.category_slug}/${p.slug}`]],
        title: p.seo_title || `${p.name} – Buy Online | Utsav Ghar`,
        description: p.seo_description || p.short_description,
        url,
        image: img ? base + img : `${base}/og-default.png`,
        type: 'product',
        schema: {
          '@context': 'https://schema.org',
          '@type': 'Product',
          name: p.name,
          description: p.short_description,
          sku: `SA-${p.id}`,
          image: img ? [base + img] : undefined,
          brand: { '@type': 'Brand', name: 'Utsav Ghar' },
          category: p.category_name,
          aggregateRating: p.rating_count ? { '@type': 'AggregateRating', ratingValue: p.rating, reviewCount: p.rating_count } : undefined,
          offers: {
            '@type': 'Offer',
            url,
            priceCurrency: 'INR',
            price: (p.price / 100).toFixed(2),
            availability: p.stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
            itemCondition: 'https://schema.org/NewCondition',
            seller: { '@type': 'Organization', name: BRAND.name },
            hasMerchantReturnPolicy: { '@type': 'MerchantReturnPolicy', applicableCountry: 'IN', returnPolicyCategory: 'https://schema.org/MerchantReturnFiniteReturnWindow', merchantReturnDays: 7, returnMethod: 'https://schema.org/ReturnByMail' },
          },
        },
      };
    }
  }
  const c = urlPath.match(/^\/shop\/([a-z0-9-]+)\/?$/);
  if (c) {
    const cat = db.prepare('SELECT * FROM categories WHERE slug = ? AND is_active = 1').get(c[1]);
    if (cat) {
      const items = db.prepare(`${PRODUCT_SELECT} WHERE p.category_id = ? AND p.is_active = 1 ORDER BY p.sort_order LIMIT 60`).all(cat.id);
      return {
        title: cat.seo_title || `${cat.name} – Shop Online | Utsav Ghar`, description: cat.seo_description || cat.description, url: `${base}/shop/${cat.slug}`,
        breadcrumbs: [['Home', '/'], [cat.name, `/shop/${cat.slug}`]],
        body: `<nav class="ssr__crumbs"><a href="/">Home</a></nav><h1>${esc(cat.name)}</h1><p>${esc(cat.description || '')}</p><ul>${items.map((p) => `<li><a href="/shop/${esc(p.category_slug)}/${esc(p.slug)}">${esc(p.name)}</a> – ₹${Math.round(p.price / 100).toLocaleString('en-IN')}</li>`).join('')}</ul>`,
        schema: { '@context': 'https://schema.org', '@type': 'ItemList', itemListElement: items.map((p, i) => ({ '@type': 'ListItem', position: i + 1, url: `${base}/shop/${p.category_slug}/${p.slug}`, name: p.name })) },
      };
    }
    return { notFound: true, title: 'Page not found | Utsav Ghar', description: 'This page does not exist.', url: base + urlPath };
  }
  if (m) return { notFound: true, title: 'Product not found | Utsav Ghar', description: 'This product is no longer available.', url: base + urlPath };
  const sm = urlPath.match(/^\/s\/([a-z0-9-]+)\/?$/);
  const seg = sm && SEGMENTS.find((x) => x.slug === sm[1]);
  if (seg) return { title: `${seg.name} – Shop Online | Utsav Ghar`, description: seg.tagline, url: `${base}/s/${seg.slug}`, breadcrumbs: [['Home', '/'], [seg.name, `/s/${seg.slug}`]],
    body: `<h1>${esc(seg.name)}</h1><p>${esc(seg.tagline)}</p><ul>${db.prepare('SELECT slug, name FROM categories WHERE is_active = 1 AND segment = ?').all(seg.slug).map((c) => `<li><a href="/shop/${esc(c.slug)}">${esc(c.name)}</a></li>`).join('')}</ul>` };
  const st = getSettings();
  const home = urlPath === '/';
  return {
    title: home ? 'Utsav Ghar – Festival Décor, Pooja, Crockery & Kitchen Online' : 'Utsav Ghar',
    description: 'Diyas, pooja essentials, festive décor, crockery and kitchenware for Diwali and every Indian festival. Pay securely with UPI.',
    url: base + (home ? '/' : urlPath),
    body: home ? `<h1>${esc(BRAND.name)} – ${esc(BRAND.tagline)}</h1><ul>${SEGMENTS.map((x) => `<li><a href="/s/${x.slug}">${esc(x.name)}</a> – ${esc(x.tagline)}</li>`).join('')}</ul>` : '',
    schema: home ? { '@context': 'https://schema.org', '@graph': [
      { '@type': 'OnlineStore', '@id': `${base}/#store`, name: BRAND.name, alternateName: BRAND.name_hi, url: base, logo: `${base}/apple-touch-icon.png`, description: BRAND.tagline,
        contactPoint: st.support_phone || st.support_email ? [{ '@type': 'ContactPoint', contactType: 'customer service', telephone: st.support_phone || undefined, email: st.support_email || undefined, areaServed: 'IN', availableLanguage: ['en', 'hi'] }] : undefined },
      { '@type': 'WebSite', '@id': `${base}/#website`, url: base, name: BRAND.name, publisher: { '@id': `${base}/#store` },
        potentialAction: { '@type': 'SearchAction', target: { '@type': 'EntryPoint', urlTemplate: `${base}/shop?q={search_term_string}` }, 'query-input': 'required name=search_term_string' } },
    ] } : undefined,
  };
}

let template = null;
let templateMtime = 0;
export function renderIndex(req, res, next) {
  const file = path.join(config.clientDist, 'index.html');
  if (!fs.existsSync(file)) return next();
  const mtime = fs.statSync(file).mtimeMs; // pick up a fresh build without restarting
  if (!template || mtime !== templateMtime) {
    template = fs.readFileSync(file, 'utf8');
    templateMtime = mtime;
  }
  const m = metaFor(req.path);
  const head = [
    `<title>${esc(m.title)}</title>`,
    `<meta name="description" content="${esc(m.description)}">`,
    `<link rel="canonical" href="${esc(m.url)}">`,
    `<meta property="og:site_name" content="Utsav Ghar">`,
    `<meta property="og:type" content="${m.type || 'website'}">`,
    `<meta property="og:title" content="${esc(m.title)}">`,
    `<meta property="og:description" content="${esc(m.description)}">`,
    `<meta property="og:url" content="${esc(m.url)}">`,
    m.image ? `<meta property="og:image" content="${esc(m.image)}">` : '',
    `<meta name="twitter:card" content="summary_large_image">`,
    m.schema ? `<script type="application/ld+json">${jsonLd(m.schema)}</script>` : '',
    m.breadcrumbs ? `<script type="application/ld+json">${jsonLd({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: m.breadcrumbs.map(([name, u], i) => ({ '@type': 'ListItem', position: i + 1, name, item: config.publicUrl + u })) })}</script>` : '',
    m.notFound ? '<meta name="robots" content="noindex">' : '',
  ].join('\n    ');
  // A light server-rendered version of the page: crawlers read it without JavaScript,
  // and shoppers see real content while the app starts (React replaces it).
  const body = m.body ? `<div id="root"><main class="ssr">${m.body}</main></div>` : '<div id="root"></div>';
  const html = template.replace(/<title>.*?<\/title>/s, '').replace('<!--ssr-head-->', head).replace('<div id="root"></div>', body);
  res.status(m.notFound ? 404 : 200).set('Cache-Control', 'no-cache').type('html').send(html);
}
