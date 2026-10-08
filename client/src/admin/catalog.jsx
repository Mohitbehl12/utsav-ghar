import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { rupees, fmtDate, slugify } from '../lib/format.js';
import { Field, Pill, Spinner, Empty, Modal, Media } from '../components/ui.jsx';
import ProductArt, { ART_TYPES, TONES } from '../components/ProductArt.jsx';
import { useToast, useStore } from '../state/store.jsx';
import { offerLabel, offerHeadline, isProductEligible } from '@shared/pricing.js';
import { PriceLadder } from './profit.jsx';
import { prepareImage, freePhotoLinks } from '../lib/image.js';
import { PlusIcon, TrashIcon, UploadIcon } from '../components/Icons.jsx';
import { PageHead, useAdminData } from './pages.jsx';
import { WriterPanel } from './ai.jsx';
import { SEGMENTS } from '@shared/festivals.js';

const errOf = (e) => e?.fields || { _: e?.message };

// ---- Products -----------------------------------------------------------------------------
export function Products() {
  const [q, setQ] = useState('');
  const [rows] = useAdminData(`/admin/products?q=${encodeURIComponent(q)}`);
  return (
    <>
      <PageHead title="Products" sub="Prices, stock, photos and visibility.">
        <Link to="/admin/photos" className="btn btn--ghost btn--sm">📷 Bulk photos</Link>
        <Link to="/admin/profit" className="btn btn--ghost btn--sm">📈 Profit view</Link>
        <Link to="/admin/products/new" className="btn btn--primary btn--sm"><PlusIcon width={16} height={16} /> Add product</Link>
      </PageHead>
      <div className="adm-filters"><input type="search" placeholder="Search products" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search products" /></div>
      {!rows ? <Spinner /> : (
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Table">
          <table className="table">
            <thead><tr><th /><th>Product</th><th>Category</th><th className="num">MRP</th><th className="num">Selling</th><th className="num">Cost</th><th className="num">Profit / unit</th><th className="num">Stock</th><th>Flags</th><th>Status</th></tr></thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id}>
                  <td><span className="thumb"><Media product={p} /></span></td>
                  <td><Link className="link" to={`/admin/products/${p.id}`}>{p.name}</Link><br /><span className="muted small">/{p.slug}</span></td>
                  <td>{p.category_name}</td>
                  <td className="num muted">{rupees(p.mrp)}</td>
                  <td className="num">{rupees(p.price)}</td>
                  <td className="num">{p.cost_price ? rupees(p.cost_price) : <span className="muted">—</span>}</td>
                  <td className={`num ${p.price < p.cost_price ? 'bad-text' : ''}`}>{p.cost_price ? <>{rupees(p.price - p.cost_price)} <span className="muted small">{Math.round(((p.price - p.cost_price) / p.price) * 100)}%</span></> : <span className="muted">add cost</span>}</td>
                  <td className="num"><span className={p.stock <= p.low_stock_threshold ? 'bad-text' : ''}>{p.stock}</span></td>
                  <td className="flags">{p.is_featured && <span className="tag tag--plum">Featured</span>}{p.is_bestseller && <span className="tag tag--gold">Bestseller</span>}{p.is_new && <span className="tag tag--muted">New</span>}{p.offer_eligible && <span className="tag tag--offer">Offer</span>}</td>
                  <td><Pill tone={p.is_active ? 'ok' : 'muted'}>{p.is_active ? 'Live' : 'Hidden'}</Pill></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

const emptyProduct = {
  name: '', slug: '', category_id: '', short_description: '', description: '', specs: { Material: '', Dimensions: '', Weight: '', "What's included": '', Care: '' },
  price: '', mrp: '', cost_price: '', stock: 0, low_stock_threshold: 10, art: { type: 'diya', tone: 'gold' }, is_active: true, is_featured: false, is_bestseller: false,
  is_new: true, is_diwali: true, sort_order: 0, seo_title: '', seo_description: '',
  ships_international: true, is_bundle: false, bundle_items: [],
};

export function ProductForm() {
  const { id } = useParams();
  const isNew = !id;
  const nav = useNavigate();
  const toast = useToast();
  const [cats] = useAdminData('/admin/categories');
  const [allProducts] = useAdminData('/admin/products');
  const [f, setF] = useState(isNew ? emptyProduct : null);
  const [images, setImages] = useState([]);
  const [queued, setQueued] = useState([]); // photos picked before a new product is saved
  const { offer, settings } = useStore();
  const [fe, setFe] = useState({});
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [slugTouched, setSlugTouched] = useState(!isNew);

  useEffect(() => {
    if (isNew) return;
    api.get(`/admin/products/${id}`).then((p) => {
      setF({ ...emptyProduct, ...p, bundle_items: (p.bundle_items || []).map((b) => ({ product_id: b.product_id, qty: b.qty })), price: p.price / 100, mrp: p.mrp / 100, cost_price: (p.cost_price || 0) / 100, seo_title: p.seo_title || '', seo_description: p.seo_description || '' });
      setImages(p.images || []);
    });
  }, [id, isNew]);
  if (!f || !cats) return <Spinner />;

  const upd = (k) => (e) => {
    const v = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setF((cur) => ({ ...cur, [k]: v, ...(k === 'name' && !slugTouched ? { slug: slugify(v) } : {}) }));
  };
  const save = async (e) => {
    e.preventDefault();
    setBusy(true); setFe({});
    const body = { ...f, price: Number(f.price), mrp: Number(f.mrp), cost_price: Number(f.cost_price || 0), stock: Number(f.stock), category_id: Number(f.category_id), specs: Object.fromEntries(Object.entries(f.specs).filter(([k, v]) => k.trim() && String(v).trim())) };
    for (const k of ['id', 'images', 'category_slug', 'category_name', 'discount_pct', 'rating', 'rating_count', 'stock_status', 'stock_left', 'offer_eligible', 'url', 'created_at', 'bundle_worth', 'bundle_cost']) delete body[k];
    body.bundle_items = f.is_bundle ? f.bundle_items.filter((b) => b.product_id).map((b) => ({ product_id: Number(b.product_id), qty: Number(b.qty) || 1 })) : [];
    try {
      const r = isNew ? await api.post('/admin/products', body) : await api.put(`/admin/products/${id}`, body);
      if (isNew && queued.length) { await uploadTo(r.id, queued.map((q) => q.file)); setQueued([]); }
      toast(isNew ? 'Product created' : 'Product saved');
      if (isNew) nav(`/admin/products/${r.id}`, { replace: true });
    } catch (err) { setFe(errOf(err)); toast(err.message, 'warn'); } finally { setBusy(false); }
  };
  const uploadTo = async (pid, files) => {
    const fd = new FormData();
    [...files].slice(0, 6).forEach((file) => fd.append('images', file));
    try { setImages(await api.post(`/admin/products/${pid}/images`, fd)); toast('Photos uploaded'); } catch (err) { toast(err.message, 'warn'); }
  };
  const addPhotos = async (files) => {
    const picked = [...files].filter((x) => /^image\//.test(x.type));
    if (!picked.length) return toast('Choose JPG, PNG or WebP photos', 'warn');
    const ok = [];
    for (const x of picked) { try { ok.push(await prepareImage(x)); } catch { ok.push(x); } } // shrink phone photos first
    if (isNew) setQueued((q) => [...q, ...ok.map((file) => ({ file, url: URL.createObjectURL(file) }))].slice(0, 6));
    else uploadTo(id, ok);
  };
  const del = async () => {
    if (!confirmDel) { setConfirmDel(true); return; }
    const r = await api.del(`/admin/products/${id}`);
    toast(r.message || 'Product deleted');
    nav('/admin/products');
  };
  const specs = Object.entries(f.specs);
  const setSpec = (i, k, v) => setF((cur) => { const e = Object.entries(cur.specs); e[i] = [k, v]; return { ...cur, specs: Object.fromEntries(e) }; });

  return (
    <form onSubmit={save}>
      <PageHead title={isNew ? 'Add product' : f.name} sub={isNew ? null : <Link className="link" to={`/shop/${cats.find((c) => c.id === Number(f.category_id))?.slug}/${f.slug}`}>View on store ↗</Link>}>
        <Link to="/admin/products" className="btn btn--ghost btn--sm">Cancel</Link>
        <button className="btn btn--primary btn--sm" disabled={busy}>{isNew ? 'Create product' : 'Save changes'}</button>
      </PageHead>
      {fe._ && <p className="notice notice--warn">{fe._}</p>}
      <div className="pform">
        <div className="stack">
          <section className="card form">
            <h2>Details</h2>
            <Field label="Product name" id="p-name" error={fe.name}><input id="p-name" value={f.name} onChange={upd('name')} required /></Field>
            <Field label="URL slug" id="p-slug" error={fe.slug} hint={`/shop/…/${f.slug || 'your-product'}`}><input id="p-slug" value={f.slug} onChange={(e) => { setSlugTouched(true); upd('slug')(e); }} /></Field>
            <Field label="Category" id="p-cat" error={fe.category_id}>
              <select id="p-cat" value={f.category_id} onChange={upd('category_id')} required><option value="">Select category</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
            </Field>
            <Field label="Short description" id="p-short" hint="Shown on product cards (max 200 characters)"><input id="p-short" maxLength={200} value={f.short_description} onChange={upd('short_description')} /></Field>
            <Field label="Full description" id="p-desc"><textarea id="p-desc" rows={5} value={f.description} onChange={upd('description')} /></Field>
            <WriterPanel f={f} setF={setF} />
          </section>
          <section className="card form">
            <h2>Combo / bundle</h2>
            <label className="check"><input type="checkbox" checked={!!f.is_bundle} onChange={upd('is_bundle')} /><span>This product is a combo of other products (their stock goes down when it sells)</span></label>
            {f.is_bundle && (
              <>
                {f.bundle_items.map((b, i) => (
                  <div key={i} className="spec-row spec-row--combo">
                    <select aria-label="Product in combo" value={b.product_id} onChange={(e) => setF({ ...f, bundle_items: f.bundle_items.map((x, j) => (j === i ? { ...x, product_id: e.target.value } : x)) })}>
                      <option value="">Choose product…</option>
                      {(allProducts || []).filter((x) => !x.is_bundle && x.id !== Number(id)).map((x) => <option key={x.id} value={x.id}>{x.name} · {rupees(x.price)}</option>)}
                    </select>
                    <input type="number" min="1" max="20" aria-label="Quantity" value={b.qty} onChange={(e) => setF({ ...f, bundle_items: f.bundle_items.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)) })} />
                    <button type="button" className="icon-btn" aria-label="Remove from combo" onClick={() => setF({ ...f, bundle_items: f.bundle_items.filter((_, j) => j !== i) })}><TrashIcon width={16} height={16} /></button>
                  </div>
                ))}
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => setF({ ...f, bundle_items: [...f.bundle_items, { product_id: '', qty: 1 }] })}>+ Add product to combo</button>
                {(() => {
                  const parts = f.bundle_items.map((b) => ({ ...b, p: (allProducts || []).find((x) => x.id === Number(b.product_id)) })).filter((b) => b.p);
                  const worth = parts.reduce((t, b) => t + b.p.price * (Number(b.qty) || 1), 0);
                  const cost = parts.reduce((t, b) => t + (b.p.cost_price || 0) * (Number(b.qty) || 1), 0);
                  const intl = parts.every((b) => b.p.ships_international !== false);
                  if (!parts.length) return null;
                  return (
                    <div className="margin-card">
                      <p className="small">Bought separately: <b>{rupees(worth)}</b> · parts cost you <b>{rupees(cost)}</b>{!intl ? ' · contains a domestic-only item' : ''}</p>
                      <div className="row gap-s wrap">
                        <button type="button" className="btn btn--ghost btn--sm" onClick={() => setF({ ...f, mrp: worth / 100 })}>Set MRP to {rupees(worth)}</button>
                        <button type="button" className="btn btn--ghost btn--sm" onClick={() => setF({ ...f, cost_price: cost / 100 })}>Set cost to {rupees(cost)}</button>
                        {!intl && f.ships_international && <button type="button" className="btn btn--ghost btn--sm" onClick={() => setF({ ...f, ships_international: false })}>Mark India-only</button>}
                      </div>
                    </div>
                  );
                })()}
              </>
            )}
          </section>
          <section className="card form">
            <h2>Specifications</h2>
            {specs.map(([k, v], i) => (
              <div key={i} className="spec-row">
                <input aria-label="Label" value={k} onChange={(e) => setSpec(i, e.target.value, v)} placeholder="Label" />
                <input aria-label="Value" value={v} onChange={(e) => setSpec(i, k, e.target.value)} placeholder="Value" />
                <button type="button" className="icon-btn" aria-label="Remove row" onClick={() => setF({ ...f, specs: Object.fromEntries(specs.filter((_, j) => j !== i)) })}><TrashIcon width={16} height={16} /></button>
              </div>
            ))}
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setF({ ...f, specs: { ...f.specs, [`Label ${specs.length + 1}`]: '' } })}>+ Add row</button>
          </section>
          <section className="card form">
            <h2>Search engine listing</h2>
            <Field label="SEO title" id="p-seot" hint={`${(f.seo_title || '').length}/70 · leave empty to use the product name`}><input id="p-seot" maxLength={70} value={f.seo_title} onChange={upd('seo_title')} /></Field>
            <Field label="Meta description" id="p-seod" hint={`${(f.seo_description || '').length}/170`}><textarea id="p-seod" rows={2} maxLength={170} value={f.seo_description} onChange={upd('seo_description')} /></Field>
          </section>
        </div>
        <div className="stack">
          <section className="card form">
            <h2>Photos</h2>
            <PhotoDrop onFiles={addPhotos} />
            <p className="small muted">No photo yet? Find a free one: {freePhotoLinks({ name: f.name || 'diya', art: f.art }).map(([n, u], i) => <span key={n}>{i ? ' · ' : ''}<a className="link" href={u} target="_blank" rel="noreferrer">{n} ↗</a></span>)} (check the licence) · or add many at once in <Link className="link" to="/admin/photos">Product photos</Link></p>
            {(images.length > 0 || queued.length > 0) && (
              <div className="img-grid">
                {images.map((img, i) => (
                  <div key={img.id} className="img-grid__item">
                    <img src={img.url} alt={img.alt || ''} />
                    {i === 0 && <span className="img-grid__main">Main photo</span>}
                    <button type="button" className="icon-btn" aria-label="Delete photo" onClick={async () => { await api.del(`/admin/images/${img.id}`); setImages(images.filter((x) => x.id !== img.id)); }}><TrashIcon width={16} height={16} /></button>
                  </div>
                ))}
                {queued.map((q, i) => (
                  <div key={q.url} className="img-grid__item">
                    <img src={q.url} alt="" />
                    {i === 0 && <span className="img-grid__main">Main photo</span>}
                    <button type="button" className="icon-btn" aria-label="Remove photo" onClick={() => setQueued(queued.filter((x) => x !== q))}><TrashIcon width={16} height={16} /></button>
                  </div>
                ))}
              </div>
            )}
            {isNew && queued.length > 0 && <p className="small muted">Photos upload when you create the product.</p>}
          </section>
          <section className="card form">
            <h2>Price, cost &amp; profit</h2>
            <div className="form__grid form__grid--3">
              <Field label="Original price / MRP (₹)" id="p-mrp" error={fe.mrp}><input id="p-mrp" type="number" min="0" step="0.01" value={f.mrp} onChange={upd('mrp')} required /></Field>
              <Field label="Selling price (₹)" id="p-price" error={fe.price}><input id="p-price" type="number" min="0" step="0.01" value={f.price} onChange={upd('price')} required /></Field>
              <Field label="Your cost (₹)" id="p-cost" error={fe.cost_price} hint="Private, never shown to customers"><input id="p-cost" type="number" min="0" step="0.01" value={f.cost_price} onChange={upd('cost_price')} /></Field>
            </div>
            <MarginCard mrp={Number(f.mrp) * 100} price={Number(f.price) * 100} cost={Number(f.cost_price || 0) * 100}
              offer={offer && f.category_id && isProductEligible(offer, { id: Number(id), category_id: Number(f.category_id) }) ? offer : null} />
            <div className="form__grid">
              <Field label="Stock" id="p-stock" error={fe.stock}><input id="p-stock" type="number" min="0" value={f.stock} onChange={upd('stock')} /></Field>
              <Field label="Low-stock alert at" id="p-low"><input id="p-low" type="number" min="0" value={f.low_stock_threshold} onChange={upd('low_stock_threshold')} /></Field>
            </div>
          </section>
          <section className="card form">
            <h2>Visibility</h2>
            {[['is_active', 'Visible on store'], ['is_diwali', `In the ${settings?.festival_name || 'festival'} collection (shown on the home page)`], ['is_featured', 'Featured'], ['is_bestseller', 'Bestseller badge'], ['is_new', 'New arrival'], ['ships_international', 'Can be shipped abroad (untick for powders, liquids, batteries, fragile glass)']].map(([k, l]) => (
              <label key={k} className="check"><input type="checkbox" checked={!!f[k]} onChange={upd(k)} /><span>{l}</span></label>
            ))}
            <p className="small muted">Whether this product counts toward an offer is set in <Link className="link" to="/admin/offers">Offers</Link>.</p>
          </section>
          <section className="card form">
            <h2>Placeholder picture</h2>
            <details className="acc">
              <summary>Built-in illustration</summary>
              <p className="small muted">Shown only while the product has no photos.</p>
              <div className="art-pick">
                <div className="art-pick__preview"><ProductArt art={f.art} /></div>
                <div className="stack">
                  <select aria-label="Illustration" value={f.art?.type} onChange={(e) => setF({ ...f, art: { ...f.art, type: e.target.value } })}>{ART_TYPES.map((t) => <option key={t}>{t}</option>)}</select>
                  <div className="tones">{Object.keys(TONES).map((t) => <button type="button" key={t} aria-label={t} className={f.art?.tone === t ? 'is-on' : ''} style={{ background: TONES[t].b }} onClick={() => setF({ ...f, art: { ...f.art, tone: t } })} />)}</div>
                </div>
              </div>
            </details>
          </section>
          {!isNew && <button type="button" className="btn btn--danger btn--sm" onClick={del}>{confirmDel ? 'Tap again to delete this product' : 'Delete product'}</button>}
        </div>
      </div>
    </form>
  );
}

function PhotoDrop({ onFiles }) {
  const [over, setOver] = useState(false);
  return (
    <label className={`dropzone ${over ? 'is-over' : ''}`} htmlFor="p-upload"
      onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); onFiles(e.dataTransfer.files); }}>
      <UploadIcon width={26} height={26} />
      <b>Drop product photos here or tap to choose</b>
      <span className="small muted">JPG, PNG, WebP · up to 6 photos · 5 MB each · square photos look best</span>
      <input id="p-upload" type="file" multiple accept="image/jpeg,image/png,image/webp,image/avif" onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }} />
    </label>
  );
}

/** Live profit calculator shown while editing prices. */
function MarginCard({ mrp, price, cost, offer }) {
  if (!price) return <p className="small muted">Enter the prices to see your profit.</p>;
  const unit = price - cost;
  const margin = Math.round((unit / price) * 1000) / 10;
  const offerPrice = offer?.discount_type === 'percent' ? Math.round(price * (1 - offer.discount_value / 100)) : null;
  const p = { name: 'This product', mrp: Math.max(mrp, price), price, cost, offer_price: offerPrice };
  return (
    <div className="margin-card">
      <PriceLadder p={p} max={Math.max(mrp, price, cost)} showOffer={offerPrice != null} compact />
      <dl className="margin-card__nums">
        <div><dt>Profit per unit</dt><dd className={unit < 0 ? 'bad-text' : 'good-text'}>{rupees(unit)}</dd></div>
        <div><dt>Margin</dt><dd className={unit < 0 ? 'bad-text' : ''}>{cost ? `${margin}%` : '—'}</dd></div>
        <div><dt>Customer saves</dt><dd>{mrp > price ? `${Math.round(((mrp - price) / mrp) * 100)}% off MRP` : '—'}</dd></div>
        {offerPrice != null && <div><dt>At {offer.discount_value}% offer</dt><dd className={offerPrice < cost ? 'bad-text' : ''}>{offerPrice < cost ? '⚠ loss ' : ''}{rupees(Math.abs(offerPrice - cost))}</dd></div>}
      </dl>
      {!cost && <p className="small muted">Add your cost to see real profit.</p>}
      {offerPrice != null && offerPrice < cost && <p className="small bad-text">At the Buy-{offer.min_qty} offer this product sells below cost.</p>}
    </div>
  );
}

// ---- Categories -------------------------------------------------------------------------------
export function Categories() {
  const [rows, reload] = useAdminData('/admin/categories');
  const [edit, setEdit] = useState(null);
  const [fe, setFe] = useState({});
  const toast = useToast();
  const store = useStore();
  const save = async (e) => {
    e.preventDefault();
    const body = { name: edit.name, slug: edit.slug, description: edit.description || '', icon: edit.icon || '', sort_order: Number(edit.sort_order) || 0, is_active: !!edit.is_active, art: edit.art || undefined, segment: edit.segment || 'festive-decor' };
    try { edit.id ? await api.put(`/admin/categories/${edit.id}`, body) : await api.post('/admin/categories', body); setEdit(null); reload(); store.reload(); toast('Category saved'); }
    catch (err) { setFe(errOf(err)); }
  };
  const remove = async (c) => { try { await api.del(`/admin/categories/${c.id}`); reload(); store.reload(); toast('Category deleted'); } catch (err) { toast(err.message, 'warn'); } };
  return (
    <>
      <PageHead title="Categories"><button className="btn btn--primary btn--sm" onClick={() => { setFe({}); setEdit({ name: '', slug: '', description: '', icon: '🪔', sort_order: (rows?.length || 0), is_active: true, art: { type: 'diya', tone: 'gold' }, segment: 'festive-decor' }); }}><PlusIcon width={16} height={16} /> Add category</button></PageHead>
      {!rows ? <Spinner /> : (
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Table">
          <table className="table">
            <thead><tr><th>Order</th><th>Category</th><th>Section</th><th>Slug</th><th className="num">Products</th><th>Status</th><th /></tr></thead>
            <tbody>{rows.map((c) => (
              <tr key={c.id}><td className="num">{c.sort_order}</td><td>{c.icon} <b>{c.name}</b><br /><span className="muted small">{c.description}</span></td><td>{SEGMENTS.find((x) => x.slug === c.segment)?.name || '—'}</td><td>/{c.slug}</td><td className="num">{c.product_count}</td>
                <td><Pill tone={c.is_active ? 'ok' : 'muted'}>{c.is_active ? 'Live' : 'Hidden'}</Pill></td>
                <td><div className="row gap-s"><button className="btn btn--ghost btn--sm" onClick={() => { setFe({}); setEdit(c); }}>Edit</button><button className="btn btn--ghost btn--sm" onClick={() => remove(c)} disabled={c.product_count > 0} title={c.product_count ? 'Move its products first' : ''}>Delete</button></div></td></tr>
            ))}</tbody>
          </table>
        </div>
      )}
      <Modal open={!!edit} onClose={() => setEdit(null)} title="Category">
        {edit && (
          <form className="form" onSubmit={save}>
            <h2>{edit.id ? 'Edit category' : 'New category'}</h2>
            <Field label="Name" id="c-name" error={fe.name}><input id="c-name" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value, ...(edit.id ? {} : { slug: slugify(e.target.value) }) })} required /></Field>
            <Field label="Slug" id="c-slug" error={fe.slug}><input id="c-slug" value={edit.slug} onChange={(e) => setEdit({ ...edit, slug: e.target.value })} /></Field>
            <Field label="Short description" id="c-desc"><input id="c-desc" value={edit.description || ''} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field>
            <Field label="Store section" id="c-seg" hint="Which header menu this category sits under">
              <select id="c-seg" value={edit.segment || 'festive-decor'} onChange={(e) => setEdit({ ...edit, segment: e.target.value })}>{SEGMENTS.map((x) => <option key={x.slug} value={x.slug}>{x.icon} {x.name}</option>)}</select>
            </Field>
            <div className="form__grid">
              <Field label="Icon (emoji)" id="c-icon"><input id="c-icon" value={edit.icon || ''} onChange={(e) => setEdit({ ...edit, icon: e.target.value })} maxLength={8} /></Field>
              <Field label="Display order" id="c-sort"><input id="c-sort" type="number" value={edit.sort_order} onChange={(e) => setEdit({ ...edit, sort_order: e.target.value })} /></Field>
            </div>
            <label className="check"><input type="checkbox" checked={!!edit.is_active} onChange={(e) => setEdit({ ...edit, is_active: e.target.checked })} /><span>Visible on store</span></label>
            {fe._ && <p className="field__error">{fe._}</p>}
            <button className="btn btn--primary">Save category</button>
          </form>
        )}
      </Modal>
    </>
  );
}

// ---- Offers ---------------------------------------------------------------------------------------
const toLocal = (iso) => (iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 16) : '');
const fromLocal = (v) => (v ? new Date(v).toISOString() : '');

export function Offers() {
  const [rows, reload] = useAdminData('/admin/offers');
  const [cats] = useAdminData('/admin/categories');
  const [allProducts] = useAdminData('/admin/products');
  const [prods] = useAdminData('/admin/products');
  const [edit, setEdit] = useState(null);
  const [fe, setFe] = useState({});
  const [armed, setArmed] = useState(null);
  const toast = useToast();
  const store = useStore();

  const open = (o) => {
    setFe({});
    setEdit(o ? {
      ...o, discount_value: o.discount_type === 'flat' ? o.discount_value / 100 : o.discount_value, max_discount: o.max_discount == null ? '' : o.max_discount / 100,
      starts_at: toLocal(o.starts_at), ends_at: toLocal(o.ends_at), coupon_code: o.coupon_code || '',
      tiers: o.tiers?.length ? o.tiers : [{ min_qty: 2, percent: 10 }, { min_qty: 3, percent: 20 }, { min_qty: 5, percent: 30 }], first_order_only: !!o.first_order_only,
    } : { name: '', description: '', discount_type: 'tiered', discount_value: 20, min_qty: 2, max_discount: '', starts_at: '', ends_at: '', coupon_code: '', is_active: true, product_ids: [], category_ids: [],
      tiers: [{ min_qty: 2, percent: 10 }, { min_qty: 3, percent: 20 }, { min_qty: 5, percent: 30 }], first_order_only: false });
  };
  const save = async (e) => {
    e.preventDefault();
    const body = {
      name: edit.name, description: edit.description || '', discount_type: edit.discount_type, discount_value: Number(edit.discount_value), min_qty: Number(edit.min_qty),
      max_discount: edit.max_discount === '' ? '' : Number(edit.max_discount), starts_at: fromLocal(edit.starts_at), ends_at: fromLocal(edit.ends_at),
      coupon_code: edit.coupon_code.trim(), is_active: !!edit.is_active, product_ids: edit.product_ids, category_ids: edit.category_ids,
      tiers: edit.discount_type === 'tiered' ? edit.tiers.map((t) => ({ min_qty: Number(t.min_qty), percent: Number(t.percent) })) : null,
      first_order_only: !!edit.first_order_only,
    };
    try { edit.id ? await api.put(`/admin/offers/${edit.id}`, body) : await api.post('/admin/offers', body); setEdit(null); reload(); store.reload(); toast('Offer saved — the store uses it immediately'); }
    catch (err) { setFe(errOf(err)); }
  };
  const del = async (o) => {
    if (armed !== o.id) { setArmed(o.id); return; }
    await api.del(`/admin/offers/${o.id}`); setArmed(null); reload(); store.reload();
  };
  const toggleIn = (k, v) => setEdit((cur) => ({ ...cur, [k]: cur[k].includes(v) ? cur[k].filter((x) => x !== v) : [...cur[k], v] }));
  const preview = edit && { ...edit, discount_value: edit.discount_type === 'flat' ? Number(edit.discount_value) * 100 : Number(edit.discount_value), tiers: (edit.tiers || []).map((t) => ({ min_qty: Number(t.min_qty), percent: Number(t.percent) })) };

  return (
    <>
      <PageHead title="Offers" sub="Promotions are calculated on the server from these rules. Changes apply to every cart immediately; no code changes needed.">
        <button className="btn btn--primary btn--sm" onClick={() => open(null)}><PlusIcon width={16} height={16} /> New offer</button>
      </PageHead>
      {!rows ? <Spinner /> : rows.length === 0 ? <Empty icon="🎁" title="No offers yet" /> : (
        <div className="offer-admin">
          {rows.map((o) => (
            <article key={o.id} className="card offer-admin__card">
              <div className="row between wrap">
                <p className="offer-card__label">{offerLabel(o)}</p>
                <Pill tone={o.live ? 'ok' : o.is_active ? 'warn' : 'muted'}>{o.live ? 'Live now' : o.is_active ? 'Scheduled / expired' : 'Off'}</Pill>
              </div>
              <h3>{o.name}</h3>
              <dl className="kv">
                <div><dt>Rule</dt><dd>{offerHeadline(o)}{o.max_discount ? ` (max ${rupees(o.max_discount)})` : ''}{o.first_order_only ? ' · first order only' : ''}</dd></div>
                <div><dt>Applies to</dt><dd>{!o.category_ids.length && !o.product_ids.length ? 'Whole store' : [o.category_ids.length && `${o.category_ids.length} categories`, o.product_ids.length && `${o.product_ids.length} products`].filter(Boolean).join(' + ')}</dd></div>
                <div><dt>Dates</dt><dd>{o.starts_at ? fmtDate(o.starts_at) : 'Now'} → {o.ends_at ? fmtDate(o.ends_at) : 'No end'}</dd></div>
                <div><dt>Coupon</dt><dd>{o.coupon_code ? <code className="coupon-code">{o.coupon_code}</code> : 'Automatic'}</dd></div>
              </dl>
              <div className="row gap-s">
                <button className="btn btn--ghost btn--sm" onClick={() => open(o)}>Edit</button>
                <button className="btn btn--ghost btn--sm" onClick={() => del(o)}>{armed === o.id ? 'Tap again to delete' : 'Delete'}</button>
              </div>
            </article>
          ))}
        </div>
      )}
      <Modal open={!!edit} onClose={() => setEdit(null)} title="Offer" wide>
        {edit && (
          <form className="form" onSubmit={save}>
            <h2>{edit.id ? 'Edit offer' : 'New offer'}</h2>
            <div className="form__grid">
              <Field label="Offer name" id="o-name" error={fe.name}><input id="o-name" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} required /></Field>
              <Field label="Short description (shown to customers)" id="o-desc"><input id="o-desc" value={edit.description || ''} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field>
              <Field label="Discount type" id="o-type">
                <select id="o-type" value={edit.discount_type} onChange={(e) => setEdit({ ...edit, discount_type: e.target.value })}>
                  <option value="tiered">Buy more, save more (tiers)</option>
                  <option value="cheapest">Cheapest item % off (per group)</option>
                  <option value="percent">Percentage off all eligible items</option>
                  <option value="flat">Flat ₹ off</option>
                </select>
              </Field>
              {edit.discount_type !== 'tiered' && <Field label={edit.discount_type === 'flat' ? 'Discount (₹)' : edit.discount_type === 'cheapest' ? 'Discount on the cheapest item (%)' : 'Discount percentage'} id="o-val" error={fe.discount_value}><input id="o-val" type="number" min="1" step="1" value={edit.discount_value} onChange={(e) => setEdit({ ...edit, discount_value: e.target.value })} /></Field>}
              {edit.discount_type !== 'tiered' && <Field label={edit.discount_type === 'cheapest' ? 'Group size (every N items, cheapest is discounted)' : 'Minimum quantity (eligible items)'} id="o-min" error={fe.min_qty}><input id="o-min" type="number" min="1" value={edit.min_qty} onChange={(e) => setEdit({ ...edit, min_qty: e.target.value })} /></Field>}
              <Field label="Maximum discount (₹, optional)" id="o-max" error={fe.max_discount}><input id="o-max" type="number" min="0" value={edit.max_discount} onChange={(e) => setEdit({ ...edit, max_discount: e.target.value })} placeholder="No cap" /></Field>
              <Field label="Start date" id="o-start" error={fe.starts_at}><input id="o-start" type="datetime-local" value={edit.starts_at} onChange={(e) => setEdit({ ...edit, starts_at: e.target.value })} /></Field>
              <Field label="End date" id="o-end" error={fe.ends_at}><input id="o-end" type="datetime-local" value={edit.ends_at} onChange={(e) => setEdit({ ...edit, ends_at: e.target.value })} /></Field>
              <Field label="Coupon code (optional)" id="o-code" error={fe.coupon_code} hint="Leave empty to apply automatically"><input id="o-code" value={edit.coupon_code} onChange={(e) => setEdit({ ...edit, coupon_code: e.target.value.toUpperCase() })} placeholder="e.g. DIWALI50" /></Field>
              <label className="check"><input type="checkbox" checked={edit.is_active} onChange={(e) => setEdit({ ...edit, is_active: e.target.checked })} /><span>Offer active</span></label>
              <label className="check"><input type="checkbox" checked={!!edit.first_order_only} onChange={(e) => setEdit({ ...edit, first_order_only: e.target.checked })} /><span>First order only (checked by phone and email)</span></label>
            </div>
            {edit.discount_type === 'tiered' && (
              <fieldset className="pickset">
                <legend>Tiers {fe.tiers && <span className="field__error">{fe.tiers}</span>}</legend>
                {edit.tiers.map((t, i) => (
                  <div key={i} className="tier-row">
                    <span>Buy</span>
                    <input type="number" min="1" aria-label={`Tier ${i + 1} quantity`} value={t.min_qty} onChange={(e) => setEdit({ ...edit, tiers: edit.tiers.map((x, j) => (j === i ? { ...x, min_qty: e.target.value } : x)) })} />
                    <span>or more → get</span>
                    <input type="number" min="1" max="90" aria-label={`Tier ${i + 1} percent`} value={t.percent} onChange={(e) => setEdit({ ...edit, tiers: edit.tiers.map((x, j) => (j === i ? { ...x, percent: e.target.value } : x)) })} />
                    <span>% off</span>
                    {edit.tiers.length > 1 && <button type="button" className="icon-btn" aria-label="Remove tier" onClick={() => setEdit({ ...edit, tiers: edit.tiers.filter((_, j) => j !== i) })}><TrashIcon width={16} height={16} /></button>}
                  </div>
                ))}
                {edit.tiers.length < 6 && <button type="button" className="btn btn--ghost btn--sm" onClick={() => setEdit({ ...edit, tiers: [...edit.tiers, { min_qty: Number(edit.tiers.at(-1)?.min_qty || 1) + 2, percent: Number(edit.tiers.at(-1)?.percent || 10) + 10 }] })}>+ Add tier</button>}
              </fieldset>
            )}
            <fieldset className="pickset">
              <legend>Eligible categories <span className="muted small">(none selected and no products = whole store)</span></legend>
              <div className="pickset__grid">{cats?.map((c) => <label key={c.id} className="check"><input type="checkbox" checked={edit.category_ids.includes(c.id)} onChange={() => toggleIn('category_ids', c.id)} /><span>{c.name}</span></label>)}</div>
            </fieldset>
            <details className="pickset">
              <summary>Eligible individual products ({edit.product_ids.length} selected)</summary>
              <div className="pickset__grid">{prods?.map((p) => <label key={p.id} className="check"><input type="checkbox" checked={edit.product_ids.includes(p.id)} onChange={() => toggleIn('product_ids', p.id)} /><span>{p.name}</span></label>)}</div>
            </details>
            <p className="notice notice--info small">Customers will see: <b>{offerHeadline(preview)}</b>{edit.max_discount ? ` (max ₹${edit.max_discount})` : ''}{edit.coupon_code ? `, with code ${edit.coupon_code}` : ', applied automatically'}{edit.first_order_only ? ', first order only' : ''}. Check Profit &amp; pricing for products that would sell below cost.</p>
            {fe._ && <p className="field__error">{fe._}</p>}
            <div className="row gap-s"><button className="btn btn--primary">Save offer</button><button type="button" className="btn btn--ghost" onClick={() => setEdit(null)}>Cancel</button></div>
          </form>
        )}
      </Modal>
    </>
  );
}

// ---- Settings (UPI, QR, gateway, delivery) -----------------------------------------------------------
export function Settings({ role }) {
  const [s, reload] = useAdminData('/admin/settings');
  const [f, setF] = useState(null);
  const [fe, setFe] = useState({});
  const toast = useToast();
  const store = useStore();
  useEffect(() => { if (s) setF({ ...s, delivery_fee: s.delivery_fee / 100, free_delivery_above: s.free_delivery_above / 100 }); }, [s]);
  if (!f) return <Spinner />;
  const owner = role === 'owner';
  const upd = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const save = async (e) => {
    e.preventDefault();
    const keys = ['international_enabled', 'fx_rates', 'fx_markup_pct', 'festival_name', 'festival_emoji', 'festival_headline', 'festival_subtitle', 'festival_date', 'store_name', 'support_phone', 'whatsapp_number', 'support_email', 'upi_id', 'upi_payee_name', 'payment_mode', 'gateway_provider', 'gateway_key_id', 'merchant_name', 'merchant_gstin', 'settlement_note', 'delivery_fee', 'free_delivery_above', 'require_txn_ref', 'allow_screenshot'];
    const body = Object.fromEntries(keys.map((k) => [k, f[k] ?? '']));
    body.delivery_fee = Number(body.delivery_fee); body.free_delivery_above = Number(body.free_delivery_above);
    body.international_enabled = !!f.international_enabled;
    body.fx_markup_pct = Number(f.fx_markup_pct) || 0;
    body.fx_rates = Object.fromEntries(Object.entries(f.fx_rates || {}).filter(([, v]) => Number(v) > 0).map(([k, v]) => [k, Number(v)]));
    try { await api.put('/admin/settings', body); setFe({}); reload(); store.reload(); toast('Settings saved'); }
    catch (err) { setFe(errOf(err)); toast(err.message, 'warn'); }
  };
  const uploadQr = async (file) => {
    if (!file) return;
    const fd = new FormData(); fd.set('qr', file);
    try { const r = await api.post('/admin/settings/qr', fd); setF({ ...f, upi_qr_url: r.upi_qr_url }); store.reload(); toast('QR code updated'); }
    catch (err) { toast(err.message, 'warn'); }
  };
  return (
    <form onSubmit={save}>
      <PageHead title="Payment & store settings" sub={owner ? null : 'Only the store owner can change these settings.'}>
        <button className="btn btn--primary btn--sm" disabled={!owner}>Save settings</button>
      </PageHead>
      <fieldset disabled={!owner} className="settings">
        <section className="card form">
          <h2>💳 UPI payment</h2>
          <div className="form__grid">
            <Field label="UPI ID" id="s-upi" error={fe.upi_id} hint="e.g. yourname@okhdfcbank"><input id="s-upi" value={f.upi_id} onChange={upd('upi_id')} /></Field>
            <Field label="Payee name (as registered with UPI)" id="s-payee" error={fe.upi_payee_name}><input id="s-payee" value={f.upi_payee_name} onChange={upd('upi_payee_name')} /></Field>
          </div>
          <div className="qr-set">
            <div className="qr-set__img">{f.upi_qr_url ? <img src={f.upi_qr_url} alt="Current UPI QR" /> : <span className="muted small">No QR uploaded. Checkout generates a QR for the exact order amount from your UPI ID.</span>}</div>
            <div className="stack">
              <label className="upload" htmlFor="s-qr"><UploadIcon width={18} height={18} /><span>Upload UPI QR code image</span><input id="s-qr" type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => uploadQr(e.target.files[0])} /></label>
              <p className="small muted">Tip: leaving this empty is often better — the auto-generated QR pre-fills the exact amount, so customers can't mistype it.</p>
            </div>
          </div>
          <label className="check"><input type="checkbox" checked={!!f.require_txn_ref} onChange={upd('require_txn_ref')} /><span>Require customers to enter the UPI reference (UTR)</span></label>
          <label className="check"><input type="checkbox" checked={!!f.allow_screenshot} onChange={upd('allow_screenshot')} /><span>Allow payment screenshot upload</span></label>
        </section>
        <section className="card form">
          <h2>🔐 Payment gateway</h2>
          <p className="small"><b>Turn on "Gateway" to accept credit &amp; debit cards (Visa, Mastercard, RuPay, Amex, Diners, Maestro), Net Banking, wallets, EMI and Pay Later.</b> Customers type card details only inside the gateway's secure window — your site never sees or stores card numbers, so you don't need PCI certification yourself.</p>
          <p className="small muted">For automatic, server-verified payments. Secret keys are never entered here: they go in the server's <code>.env</code> file (<code>RAZORPAY_KEY_SECRET</code>, <code>RAZORPAY_WEBHOOK_SECRET</code>).</p>
          <div className="form__grid">
            <Field label="Payment mode" id="s-mode">
              <select id="s-mode" value={f.payment_mode} onChange={upd('payment_mode')}><option value="manual_upi">Manual UPI (QR + admin verification)</option><option value="gateway">Gateway + UPI QR fallback</option></select>
            </Field>
            <Field label="Provider" id="s-prov"><select id="s-prov" value={f.gateway_provider} onChange={upd('gateway_provider')}><option value="razorpay">Razorpay</option><option value="cashfree">Cashfree</option><option value="phonepe">PhonePe PG</option><option value="payu">PayU</option></select></Field>
            <Field label="Publishable key ID" id="s-key" hint="e.g. rzp_live_xxxxx (safe to show in the browser)"><input id="s-key" value={f.gateway_key_id || ''} onChange={upd('gateway_key_id')} /></Field>
          </div>
        </section>
        <section className="card form">
          <h2>🏦 Merchant &amp; settlement</h2>
          <div className="form__grid">
            <Field label="Legal / merchant name" id="s-mname"><input id="s-mname" value={f.merchant_name || ''} onChange={upd('merchant_name')} /></Field>
            <Field label="GSTIN (optional)" id="s-gst"><input id="s-gst" value={f.merchant_gstin || ''} onChange={upd('merchant_gstin')} maxLength={15} /></Field>
          </div>
          <Field label="Settlement notes (internal)" id="s-settle" hint="Visible to admins only"><textarea id="s-settle" rows={2} value={f.settlement_note || ''} onChange={upd('settlement_note')} /></Field>
        </section>
        <section className="card form">
          <h2>🪔 Current festival</h2>
          <p className="small muted">When the next festival comes (Christmas, Holi, Rakhi…), change these and tick <b>In the festival collection</b> on its products in Products. The home page, menu and offer bar update straight away.</p>
          <div className="form__grid">
            <Field label="Festival name" id="s-fest"><input id="s-fest" value={f.festival_name || ''} onChange={upd('festival_name')} placeholder="Diwali" /></Field>
            <Field label="Emoji" id="s-femoji"><input id="s-femoji" value={f.festival_emoji || ''} maxLength={8} onChange={upd('festival_emoji')} placeholder="🪔" /></Field>
            <Field label="Festival date (for the countdown)" id="s-fdate" error={fe.festival_date}><input id="s-fdate" type="date" value={f.festival_date || ''} onChange={upd('festival_date')} /></Field>
            <Field label="Home page headline" id="s-fhead" error={fe.festival_headline}><input id="s-fhead" maxLength={80} value={f.festival_headline || ''} onChange={upd('festival_headline')} placeholder="Light Up Your Diwali" /></Field>
          </div>
          <Field label="Home page description" id="s-fsub" error={fe.festival_subtitle}><textarea id="s-fsub" rows={2} maxLength={240} value={f.festival_subtitle || ''} onChange={upd('festival_subtitle')} /></Field>
        </section>
        <section className="card form">
          <h2>🏪 Store &amp; delivery</h2>
          <div className="form__grid">
            <Field label="Store name" id="s-name"><input id="s-name" value={f.store_name} onChange={upd('store_name')} /></Field>
            <Field label="Support phone" id="s-phone"><input id="s-phone" value={f.support_phone} onChange={upd('support_phone')} /></Field>
            <Field label="WhatsApp number for customer help" id="s-wa" error={fe.whatsapp_number} hint="Shown as the green Help button on every page. Leave empty to use the support phone."><input id="s-wa" type="tel" value={f.whatsapp_number || ''} onChange={upd('whatsapp_number')} placeholder="+91 98xxx xxxxx" /></Field>
            <Field label="Support email" id="s-email" error={fe.support_email}><input id="s-email" value={f.support_email} onChange={upd('support_email')} /></Field>
            <Field label="Delivery fee (₹)" id="s-fee"><input id="s-fee" type="number" min="0" value={f.delivery_fee} onChange={upd('delivery_fee')} /></Field>
            <Field label="Free delivery above (₹)" id="s-free" hint="Order value after discounts"><input id="s-free" type="number" min="0" value={f.free_delivery_above} onChange={upd('free_delivery_above')} /></Field>
          </div>
        </section>
        <section className="card form">
          <h2>🌍 Selling abroad</h2>
          <label className="check"><input type="checkbox" checked={!!f.international_enabled} onChange={upd('international_enabled')} /><span>Ship internationally (shows a country picker, local-currency prices and zone shipping)</span></label>
          <p className="small muted">Customers always pay in rupees; other currencies are shown as estimates. Enter how many rupees one unit costs today, plus a small markup to cover card conversion fees.</p>
          <div className="fx-grid">
            {Object.entries(f.fx_rates || {}).map(([cur, v]) => (
              <Field key={cur} label={`₹ per 1 ${cur}`} id={`fx-${cur}`}><input id={`fx-${cur}`} type="number" min="0" step="0.01" value={v} onChange={(e) => setF({ ...f, fx_rates: { ...f.fx_rates, [cur]: e.target.value } })} /></Field>
            ))}
            <Field label="Markup %" id="fx-markup" hint="e.g. 3"><input id="fx-markup" type="number" min="0" max="20" step="0.5" value={f.fx_markup_pct ?? 0} onChange={upd('fx_markup_pct')} /></Field>
          </div>
        </section>
      </fieldset>
      <Zones owner={owner} />
      <PasswordCard />
    </form>
  );
}

function Zones({ owner }) {
  const [rows, reload] = useAdminData('/admin/zones');
  const [edit, setEdit] = useState(null);
  const [fe, setFe] = useState({});
  const toast = useToast();
  const store = useStore();
  if (!rows) return null;
  const save = async () => {
    const body = { ...edit, countries: String(edit.countries).split(/[\s,]+/).filter(Boolean).map((c) => c.toUpperCase()), fee: Number(edit.fee), extra_item_fee: Number(edit.extra_item_fee), free_above: Number(edit.free_above) };
    try { edit.id ? await api.put(`/admin/zones/${edit.id}`, body) : await api.post('/admin/zones', body); setEdit(null); setFe({}); reload(); store.reload(); toast('Shipping zone saved'); }
    catch (x) { setFe(x.fields || { _: x.message }); }
  };
  const r = (p) => rupees(p);
  return (
    <section className="card form" style={{ marginTop: 16, boxShadow: 'none' }}>
      <div className="row between wrap"><h2>🚚 Shipping zones</h2>{owner && <button type="button" className="btn btn--ghost btn--sm" onClick={() => setEdit({ code: '', name: '', countries: '', fee: 0, extra_item_fee: 0, free_above: 0, delivery_text: '', duties_note: '', is_active: true, sort_order: rows.length })}>+ Add zone</button>}</div>
      <p className="small muted">Example rates — replace them with real courier quotes (for 1 kg and each extra item) before selling abroad. Countries use 2-letter codes; * means every other country.</p>
      <div className="table-wrap" tabIndex={0} role="region" aria-label="Table">
        <table className="table">
          <thead><tr><th>Zone</th><th>Countries</th><th className="num">First item</th><th className="num">Extra item</th><th className="num">Free above</th><th>Delivery time</th><th /></tr></thead>
          <tbody>{rows.map((z) => (
            <tr key={z.id}><td><b>{z.name}</b>{!z.is_active && <Pill tone="muted">Off</Pill>}</td><td className="wrap-cell">{z.countries.join(', ')}</td><td className="num">{r(z.fee)}</td><td className="num">{r(z.extra_item_fee)}</td><td className="num">{z.free_above ? r(z.free_above) : '—'}</td><td>{z.delivery_text}</td>
              <td>{owner && <button type="button" className="link-btn" onClick={() => setEdit({ ...z, countries: z.countries.join(', '), fee: z.fee / 100, extra_item_fee: z.extra_item_fee / 100, free_above: z.free_above / 100 })}>Edit</button>}</td></tr>
          ))}</tbody>
        </table>
      </div>
      {edit && (
        <div className="zone-edit">
          <div className="form__grid">
            <Field label="Code" id="z-code" error={fe.code}><input id="z-code" value={edit.code} onChange={(e) => setEdit({ ...edit, code: e.target.value })} /></Field>
            <Field label="Name" id="z-name" error={fe.name}><input id="z-name" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="Countries (codes)" id="z-c" error={fe.countries} hint="AE, SA, QA or *"><input id="z-c" value={edit.countries} onChange={(e) => setEdit({ ...edit, countries: e.target.value })} /></Field>
            <Field label="First item (₹)" id="z-fee"><input id="z-fee" type="number" min="0" value={edit.fee} onChange={(e) => setEdit({ ...edit, fee: e.target.value })} /></Field>
            <Field label="Each extra item (₹)" id="z-extra"><input id="z-extra" type="number" min="0" value={edit.extra_item_fee} onChange={(e) => setEdit({ ...edit, extra_item_fee: e.target.value })} /></Field>
            <Field label="Free above (₹, 0 = never)" id="z-free"><input id="z-free" type="number" min="0" value={edit.free_above} onChange={(e) => setEdit({ ...edit, free_above: e.target.value })} /></Field>
            <Field label="Delivery time" id="z-time"><input id="z-time" value={edit.delivery_text} onChange={(e) => setEdit({ ...edit, delivery_text: e.target.value })} placeholder="6–10 business days" /></Field>
            <Field label="Duties note" id="z-duty"><input id="z-duty" value={edit.duties_note} onChange={(e) => setEdit({ ...edit, duties_note: e.target.value })} /></Field>
          </div>
          <label className="check"><input type="checkbox" checked={!!edit.is_active} onChange={(e) => setEdit({ ...edit, is_active: e.target.checked })} /><span>Zone active</span></label>
          {fe._ && <p className="field__error">{fe._}</p>}
          <div className="row gap-s"><button type="button" className="btn btn--primary btn--sm" onClick={save}>Save zone</button><button type="button" className="btn btn--ghost btn--sm" onClick={() => setEdit(null)}>Cancel</button></div>
        </div>
      )}
    </section>
  );
}

function PasswordCard() {
  const [pw, setPw] = useState({ current: '', next: '' });
  const [msg, setMsg] = useState(null);
  const change = async () => {
    try { await api.put('/admin/me/password', pw); setPw({ current: '', next: '' }); setMsg({ ok: true, t: 'Password changed.' }); }
    catch (err) { setMsg({ ok: false, t: err.fields?.next || err.message }); }
  };
  return (
    <section className="card form" style={{ marginTop: 16, boxShadow: 'none' }}>
      <h2>🔑 Your admin password</h2>
      <div className="form__grid">
        <Field label="Current password" id="pw-cur"><input id="pw-cur" type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} /></Field>
        <Field label="New password" id="pw-new" hint="At least 10 characters"><input id="pw-new" type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} /></Field>
      </div>
      <div className="row gap-s"><button type="button" className="btn btn--ghost btn--sm" onClick={change} disabled={!pw.current || !pw.next}>Change password</button>{msg && <span className={msg.ok ? 'ok small' : 'field__error'}>{msg.t}</span>}</div>
    </section>
  );
}
