import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useStore } from '../state/store.jsx';
import { ProductGrid } from '../components/ProductCard.jsx';
import { Empty, useSeo } from '../components/ui.jsx';
import { FilterIcon, CloseIcon } from '../components/Icons.jsx';

const PRICE_BANDS = [['', '500', 'Under ₹500'], ['500', '1000', '₹500 – ₹1,000'], ['1000', '2000', '₹1,000 – ₹2,000'], ['2000', '', 'Above ₹2,000']];

export default function Shop() {
  const { category } = useParams();
  const [sp, setSp] = useSearchParams();
  const { categories, offer, settings } = useStore();
  const [data, setData] = useState({ items: [], total: 0, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const cat = categories.find((c) => c.slug === category);
  const selectedCats = category ? [category] : (sp.get('category') || '').split(',').filter(Boolean);
  const collection = sp.get('collection');

  const query = useMemo(() => {
    const q = new URLSearchParams();
    const cats = category ? category : sp.get('category');
    if (cats) q.set('category', cats);
    for (const k of ['q', 'min', 'max', 'rating', 'discount', 'inStock', 'offer', 'sort', 'flag', 'material', 'intl']) if (sp.get(k)) q.set(k, sp.get(k));
    if (collection === 'diwali' || collection === 'festival') q.set('flag', 'diwali');
    q.set('limit', '24');
    return q.toString();
  }, [category, sp, collection]);

  useEffect(() => { setPage(1); }, [query]);
  useEffect(() => {
    let live = true;
    setLoading(page === 1);
    api.get(`/products?${query}&page=${page}`).then((r) => {
      if (!live) return;
      setData((d) => (page === 1 ? r : { ...r, items: [...d.items, ...r.items] }));
      setLoading(false);
    }).catch(() => live && setLoading(false));
    return () => { live = false; };
  }, [query, page]);

  const slugTitle = category ? category.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ') : '';
  const title = cat ? cat.name : category ? slugTitle : sp.get('q') ? `Results for “${sp.get('q')}”` : sp.get('offer') ? `${offer?.name || 'Offer'} · ${offer?.tag || 'Eligible products'}` : collection === 'diwali' || collection === 'festival' ? `${settings?.festival_name || 'Festive'} Collection` : 'Shop All';
  useSeo({
    title: `${cat?.seo_title || title} | Utsav Ghar`,
    description: cat?.seo_description || cat?.description || 'Shop diyas, pooja essentials, lights, lanterns, rangoli and festive décor online.',
  });

  const shownQ = data.corrected || data.relaxed || sp.get('q');
  const set = (k, v) => {
    const n = new URLSearchParams(sp);
    if (v === '' || v == null || v === false) n.delete(k); else n.set(k, v);
    setSp(n, { replace: true });
  };
  const toggleCat = (slug) => {
    const s = new Set(selectedCats);
    s.has(slug) ? s.delete(slug) : s.add(slug);
    set('category', [...s].join(','));
  };
  const activeCount = ['q', 'min', 'max', 'rating', 'discount', 'inStock', 'offer', 'category', 'material', 'intl'].filter((k) => sp.get(k)).length;
  const mats = (sp.get('material') || '').split(',').filter(Boolean);
  const toggleMat = (m) => set('material', (mats.includes(m) ? mats.filter((x) => x !== m) : [...mats, m]).join(','));
  const [range, setRange] = useState({ min: sp.get('min') || '', max: sp.get('max') || '' });
  useEffect(() => { setRange({ min: sp.get('min') || '', max: sp.get('max') || '' }); }, [sp]);
  const applyRange = (e) => { e.preventDefault(); const n = new URLSearchParams(sp); range.min ? n.set('min', range.min) : n.delete('min'); range.max ? n.set('max', range.max) : n.delete('max'); setSp(n, { replace: true }); };
  const drop = (k, v) => { const n = new URLSearchParams(sp); if (v && k === 'material') { const left = mats.filter((x) => x !== v); left.length ? n.set(k, left.join(',')) : n.delete(k); } else if (v && k === 'category') { const left = selectedCats.filter((x) => x !== v); left.length ? n.set(k, left.join(',')) : n.delete(k); } else if (k === 'price') { n.delete('min'); n.delete('max'); } else n.delete(k); setSp(n, { replace: true }); };
  const matLabel = (m) => data.facets?.materials?.find((x) => x.value === m)?.label || m;
  const chips = [
    ...(sp.get('q') ? [['q', null, `“${sp.get('q')}”`]] : []),
    ...(!category ? selectedCats.map((c) => ['category', c, categories.find((x) => x.slug === c)?.name || c]) : []),
    ...((sp.get('min') || sp.get('max')) ? [['price', null, `₹${sp.get('min') || 0} – ${sp.get('max') ? `₹${sp.get('max')}` : 'any'}`]] : []),
    ...mats.map((m) => ['material', m, matLabel(m)]),
    ...(sp.get('rating') ? [['rating', null, `${sp.get('rating')}★ & up`]] : []),
    ...(sp.get('discount') ? [['discount', null, `${sp.get('discount')}%+ off`]] : []),
    ...(sp.get('inStock') ? [['inStock', null, 'In stock']] : []),
    ...(sp.get('offer') ? [['offer', null, offer?.tag || 'Offer']] : []),
    ...(sp.get('intl') ? [['intl', null, 'Ships worldwide']] : []),
  ];

  const filters = (
    <div className="filters">
      {!category && (
        <fieldset>
          <legend>Category</legend>
          {categories.map((c) => (
            <label key={c.slug} className="check">
              <input type="checkbox" checked={selectedCats.includes(c.slug)} onChange={() => toggleCat(c.slug)} />
              <span>{c.name}</span><small>{c.product_count}</small>
            </label>
          ))}
        </fieldset>
      )}
      <fieldset>
        <legend>Price</legend>
        {PRICE_BANDS.map(([min, max, label]) => {
          const on = (sp.get('min') || '') === min && (sp.get('max') || '') === max;
          return (
            <label key={label} className="check">
              <input type="radio" name="price" checked={on} onChange={() => { const n = new URLSearchParams(sp); min ? n.set('min', min) : n.delete('min'); max ? n.set('max', max) : n.delete('max'); setSp(n, { replace: true }); }} />
              <span>{label}</span>
            </label>
          );
        })}
      </fieldset>
      <form className="filters__range" onSubmit={applyRange} aria-label="Custom price range">
        <input type="number" inputMode="numeric" min={0} placeholder={`₹${data.facets?.price?.min ?? 'Min'}`} aria-label="Minimum price" value={range.min} onChange={(e) => setRange({ ...range, min: e.target.value })} />
        <span>to</span>
        <input type="number" inputMode="numeric" min={0} placeholder={`₹${data.facets?.price?.max ?? 'Max'}`} aria-label="Maximum price" value={range.max} onChange={(e) => setRange({ ...range, max: e.target.value })} />
        <button className="btn btn--ghost btn--sm">Go</button>
      </form>
      {data.facets?.materials?.length > 0 && (
        <fieldset>
          <legend>Material</legend>
          {data.facets.materials.map((m) => (
            <label key={m.value} className="check">
              <input type="checkbox" checked={mats.includes(m.value)} onChange={() => toggleMat(m.value)} />
              <span>{m.label}</span><small>{m.count}</small>
            </label>
          ))}
        </fieldset>
      )}
      <fieldset>
        <legend>Customer rating</legend>
        {['4.5', '4', '3'].map((r) => (
          <label key={r} className="check"><input type="radio" name="rating" checked={sp.get('rating') === r} onChange={() => set('rating', r)} /><span>{r}★ &amp; above</span></label>
        ))}
      </fieldset>
      <fieldset>
        <legend>Discount</legend>
        {['20', '30', '40'].map((d) => (
          <label key={d} className="check"><input type="radio" name="discount" checked={sp.get('discount') === d} onChange={() => set('discount', d)} /><span>{d}% off or more</span></label>
        ))}
      </fieldset>
      <fieldset>
        <legend>Availability &amp; offers</legend>
        <label className="check"><input type="checkbox" checked={!!sp.get('inStock')} onChange={(e) => set('inStock', e.target.checked && '1')} /><span>In stock only</span></label>
        {offer && <label className="check"><input type="checkbox" checked={!!sp.get('offer')} onChange={(e) => set('offer', e.target.checked && '1')} /><span>{offer.tag} eligible</span></label>}
        {settings?.international_enabled && <label className="check"><input type="checkbox" checked={!!sp.get('intl')} onChange={(e) => set('intl', e.target.checked && '1')} /><span>Ships outside India</span></label>}
      </fieldset>
      {activeCount > 0 && <button className="btn btn--ghost btn--block" onClick={() => setSp(new URLSearchParams(sp.get('sort') ? { sort: sp.get('sort') } : {}), { replace: true })}>Clear all filters</button>}
    </div>
  );

  return (
    <div className="container shop">
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link to="/">Home</Link><span>/</span><Link to="/shop">Shop</Link>{cat && <><span>/</span><span aria-current="page">{cat.name}</span></>}
      </nav>
      <header className="shop__head">
        <div>
          <h1>{title}</h1>
          {(cat?.description || (category && !cat)) && <p className="muted shop__desc">{cat?.description || '\u00a0'}</p>}
          {sp.get('offer') && offer && <p className="offer-note">🎁 {offer.headline}. Applied automatically in your cart.</p>}
        </div>
      </header>
      <div className="shop__bar">
        <button className="btn btn--ghost shop__filter-btn" onClick={() => setFiltersOpen(true)}><FilterIcon width={18} height={18} /> Filters{activeCount ? ` (${activeCount})` : ''}</button>
        <p className="muted shop__count" aria-live="polite">
          {loading ? 'Loading…' : data.total === 0 ? '0 results' : <>{Math.min(data.total, 1)}–{Math.min(data.items.length, data.total)} of {data.total} result{data.total === 1 ? '' : 's'}{shownQ ? <> for <b className="shop__q">“{shownQ}”</b></> : null}</>}
        </p>
        <label className="sort">
          <span>Sort by:</span>
          <select id="sort" aria-label="Sort by" value={sp.get('sort') || 'featured'} onChange={(e) => set('sort', e.target.value === 'featured' ? '' : e.target.value)}>
            <option value="featured">Featured</option>
            <option value="price_asc">Price: Low to High</option>
            <option value="price_desc">Price: High to Low</option>
            <option value="rating">Avg. Customer Review</option>
            <option value="newest">Newest Arrivals</option>
            <option value="bestsellers">Best Sellers</option>
            <option value="discount">Biggest Discount</option>
          </select>
        </label>
      </div>
      {chips.length > 0 && (
        <div className="fchips" aria-label="Active filters">
          {chips.map(([k, v, label]) => <button key={`${k}${v || ''}`} className="fchip" onClick={() => drop(k, v)} aria-label={`Remove filter ${label}`}>{label} <span aria-hidden="true">✕</span></button>)}
          {chips.length > 1 && <button className="fchip fchip--clear" onClick={() => setSp(new URLSearchParams(sp.get('sort') ? { sort: sp.get('sort') } : {}), { replace: true })}>Clear all</button>}
        </div>
      )}
      {!loading && (data.corrected || data.relaxed) && (
        <p className="shop__dym">
          {data.corrected
            ? <>Showing results for <b><i>{data.corrected}</i></b>. <span className="muted">No results for “{sp.get('q')}”.</span></>
            : <>No results for “{sp.get('q')}”. Showing results for <b><i>{data.relaxed}</i></b>.</>}
        </p>
      )}
      <div className="shop__layout">
        <aside className="shop__side" aria-label="Filters">{filters}</aside>
        <section aria-labelledby="results-h">
          <h2 id="results-h" className="sr-only">Results</h2>
          {!loading && data.items.length === 0 ? (
            <Empty icon="🔍" title="No products match" action={<Link className="btn btn--primary" to="/shop">Browse all products</Link>}>
              Try removing a filter, or search for “diya”, “lights” or “gift”.
            </Empty>
          ) : (
            <ProductGrid products={data.items} loading={loading} />
          )}
          {!loading && page < data.pages && (
            <div className="center"><button className="btn btn--ghost" onClick={() => setPage((p) => p + 1)}>Load more</button></div>
          )}
        </section>
      </div>
      {filtersOpen && (
        <div className="drawer drawer--right" onMouseDown={(e) => e.target === e.currentTarget && setFiltersOpen(false)}>
          <div className="drawer__panel" role="dialog" aria-label="Filters">
            <div className="drawer__head"><b>Filters</b><button className="icon-btn" onClick={() => setFiltersOpen(false)} aria-label="Close filters"><CloseIcon /></button></div>
            {filters}
            <button className="btn btn--primary btn--block" onClick={() => setFiltersOpen(false)}>Show {data.total} products</button>
          </div>
        </div>
      )}
    </div>
  );
}
