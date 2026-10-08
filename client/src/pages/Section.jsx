import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { SEGMENTS } from '@shared/festivals.js';
import { api } from '../lib/api.js';
import { useStore } from '../state/store.jsx';
import { BRAND } from '@shared/brand.js';
import { ProductGrid } from '../components/ProductCard.jsx';
import { Empty, Spinner, useSeo } from '../components/ui.jsx';
import ProductArt from '../components/ProductArt.jsx';
import { ThemedHero, segmentUrl } from '../components/Sections.jsx';
import { FestivalChip } from '../components/Festive.jsx';

const SORTS = [['popular', 'Most popular'], ['price_asc', 'Price: low to high'], ['price_desc', 'Price: high to low'], ['rating', 'Top rated'], ['newest', 'Newest']];

/** Product list with category chips + sort, used by festival and segment pages. */
function Catalogue({ base, cats, heading }) {
  const [sp, setSp] = useSearchParams();
  const cat = sp.get('category') || '';
  const sort = sp.get('sort') || 'popular';
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ items: [], total: 0, pages: 1, loading: true });
  const query = `${base}&limit=24&sort=${sort}${cat ? `&category=${cat}` : ''}`;
  useEffect(() => { setPage(1); }, [query]);
  useEffect(() => {
    let live = true;
    if (page === 1) setData((d) => ({ ...d, loading: true }));
    api.get(`/products?${query}&page=${page}`).then((r) => live && setData((d) => ({ ...r, items: page === 1 ? r.items : [...d.items, ...r.items], loading: false }))).catch(() => live && setData({ items: [], total: 0, pages: 1, loading: false }));
    return () => { live = false; };
  }, [query, page]);
  const set = (k, v) => { const n = new URLSearchParams(sp); v ? n.set(k, v) : n.delete(k); setSp(n, { replace: true }); };
  return (
    <section className="section container" id="products" aria-label={heading}>
      <div className="catbar">
        <h2>{heading} <small className="muted">{data.loading ? '' : `${data.total} product${data.total === 1 ? '' : 's'}`}</small></h2>
        <label className="sort"><span>Sort by</span>
          <select aria-label="Sort by" value={sort} onChange={(e) => set('sort', e.target.value === 'popular' ? '' : e.target.value)}>{SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        </label>
      </div>
      {cats.length > 1 && (
        <div className="catchips" role="group" aria-label="Filter by category">
          <button type="button" className={`chip ${!cat ? 'is-on' : ''}`} aria-pressed={!cat} onClick={() => set('category', '')}>All</button>
          {cats.map((c) => (
            <button type="button" key={c.slug} className={`chip ${cat === c.slug ? 'is-on' : ''}`} aria-pressed={cat === c.slug} onClick={() => set('category', cat === c.slug ? '' : c.slug)}>
              <span aria-hidden="true">{c.icon}</span> {c.name}{c.product_count ? <small> {c.product_count}</small> : null}
            </button>
          ))}
        </div>
      )}
      {!data.loading && data.items.length === 0 ? (
        <Empty icon="🪔" title="Products coming soon" action={<Link className="btn btn--primary" to="/shop">Browse all products</Link>}>We're adding products for this collection. Meanwhile, explore the rest of the store.</Empty>
      ) : <ProductGrid products={data.items} loading={data.loading} />}
      {!data.loading && page < data.pages && <div className="center"><button className="btn btn--ghost" onClick={() => setPage((p) => p + 1)}>Load more</button></div>}
    </section>
  );
}

export function SegmentPage() {
  const { segment } = useParams();
  const { categories, settings } = useStore();
  const s = SEGMENTS.find((x) => x.slug === segment);
  useSeo({ title: s ? `${s.name} – ${s.tagline} | ${BRAND.name}` : BRAND.name, description: s?.tagline });
  const cats = useMemo(() => categories.filter((c) => c.segment === segment), [categories, segment]);
  if (!s) return <div className="container"><Empty icon="🔍" title="Section not found" action={<Link to="/shop" className="btn btn--primary">Shop all</Link>}>Try one of the sections in the menu.</Empty></div>;
  return (
    <>
      <ThemedHero
        compact theme={s.theme} art={s.art}
        eyebrow={s.name_hi}
        title={s.name}
        subtitle={s.tagline}
        chip={settings?.festival_date ? <Link to="/shop?collection=festival" className="fest-chip-link"><FestivalChip name={settings.festival_name} date={settings.festival_date} emoji={settings.festival_emoji} /></Link> : null}
      />
      {cats.length > 1 && (
        <section className="container minicats" aria-label="Categories">
          {cats.map((c) => (
            <Link key={c.slug} to={`/shop/${c.slug}`} className="minicat">
              <span className="minicat__art">{c.image_url ? <img src={c.image_url} alt="" loading="lazy" /> : <ProductArt art={c.art} title={c.name} />}</span>
              <span><b>{c.name}</b><small>{c.description}</small></span>
            </Link>
          ))}
        </section>
      )}
      <Catalogue base={`segment=${s.slug}`} cats={cats} heading={`${s.icon} ${s.name}`} />
      <section className="container segnext" aria-label="Other sections">
        {SEGMENTS.filter((x) => x.slug !== s.slug).map((x) => <Link key={x.slug} to={segmentUrl(x)} className="chip">{x.icon} {x.name}</Link>)}
      </section>
    </>
  );
}
