import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { prepareImage, matchProduct, freePhotoLinks } from '../lib/image.js';
import { copyText } from '../lib/format.js';
import { Media, Spinner, Pill } from '../components/ui.jsx';
import { UploadIcon, CopyIcon, TrashIcon } from '../components/Icons.jsx';
import { useToast } from '../state/store.jsx';
import { PageHead, useAdminData } from './pages.jsx';

export function Photos() {
  const [products, reload] = useAdminData('/admin/products');
  const [items, setItems] = useState([]); // { key, file, url, productId, confidence, status }
  const [prep, setPrep] = useState(null);
  const [replace, setReplace] = useState(false);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [onlyMissing, setOnlyMissing] = useState(true);
  const toast = useToast();

  const addFiles = async (files) => {
    const list = [...files].filter((f) => /^image\//.test(f.type));
    if (!list.length) return toast('Choose JPG, PNG, WebP or HEIC photos', 'warn');
    setPrep({ done: 0, total: list.length });
    const out = [];
    for (const f of list) {
      let file = f;
      try { file = await prepareImage(f); } catch { /* keep original */ }
      const m = matchProduct(f.name, products);
      out.push({ key: `${f.name}-${f.size}-${Math.random()}`, file, name: f.name, url: URL.createObjectURL(file), productId: m.product?.id || '', confidence: m.confidence, status: 'ready', kb: Math.round(file.size / 1024), origKb: Math.round(f.size / 1024) });
      setPrep((p) => ({ ...p, done: p.done + 1 }));
    }
    setItems((cur) => [...cur, ...out]);
    setPrep(null);
  };

  const upload = async () => {
    const ready = items.filter((i) => i.productId && i.status !== 'done');
    if (!ready.length) return;
    setBusy(true);
    const groups = new Map();
    for (const i of ready) groups.set(i.productId, [...(groups.get(i.productId) || []), i]);
    let ok = 0;
    for (const [pid, group] of groups) {
      const keys = new Set(group.map((g) => g.key));
      const mark = (status) => setItems((cur) => cur.map((x) => (keys.has(x.key) ? { ...x, status } : x)));
      mark('uploading');
      try {
        if (replace) {
          const p = products.find((x) => x.id === Number(pid));
          for (const img of p?.images || []) await api.del(`/admin/images/${img.id}`);
        }
        for (let k = 0; k < group.length; k += 6) {
          const fd = new FormData();
          group.slice(k, k + 6).forEach((g) => fd.append('images', g.file));
          await api.post(`/admin/products/${pid}/images`, fd);
        }
        mark('done');
        ok += group.length;
      } catch (e) {
        mark('error');
        toast(e.message, 'warn');
      }
    }
    setBusy(false);
    reload();
    toast(`${ok} photo${ok === 1 ? '' : 's'} added to the store ✓`);
  };

  const rows = useMemo(() => (products || []).filter((p) => !onlyMissing || !p.images.length), [products, onlyMissing]);
  if (!products) return <Spinner />;
  const missing = products.filter((p) => !p.images.length).length;
  const ready = items.filter((i) => i.productId && i.status !== 'done').length;
  const unmatched = items.filter((i) => !i.productId).length;

  return (
    <>
      <PageHead title="Product photos" sub={`${products.length - missing} of ${products.length} products have real photos. Photos replace the drawn illustrations everywhere on the store.`} />

      <section className="card form">
        <h2>Upload many photos at once</h2>
        <p className="small muted">Name each file after the product (for example <code>premium-brass-diya.jpg</code>, <code>premium-brass-diya-2.jpg</code>) and they match automatically. Anything that doesn't match, pick the product from the list. Big phone photos are shrunk to web size before upload.</p>
        <label className={`dropzone ${over ? 'is-over' : ''}`} htmlFor="bulk-upload"
          onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); addFiles(e.dataTransfer.files); }}>
          <UploadIcon width={28} height={28} />
          <b>Drop all your product photos here, or tap to choose</b>
          <span className="small muted">JPG, PNG, WebP · as many as you like</span>
          <input id="bulk-upload" type="file" multiple accept="image/*" onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
        </label>
        {prep && <p className="small"><Spinner /> Preparing photos {prep.done} / {prep.total}…</p>}

        {items.length > 0 && (
          <>
            <div className="bulk-list">
              {items.map((i) => (
                <div key={i.key} className={`bulk-item bulk-item--${i.status}`}>
                  <img src={i.url} alt="" />
                  <div className="bulk-item__info">
                    <span className="small" title={i.name}>{i.name}</span>
                    <span className="small muted">{i.origKb > i.kb ? `${i.origKb} KB → ${i.kb} KB` : `${i.kb} KB`}</span>
                    <select aria-label={`Product for ${i.name}`} value={i.productId} disabled={i.status === 'done' || i.status === 'uploading'}
                      onChange={(e) => setItems((cur) => cur.map((x) => (x === i ? { ...x, productId: Number(e.target.value) || '', confidence: 'manual' } : x)))}>
                      <option value="">Choose product…</option>
                      {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    <span className="small">
                      {i.status === 'done' ? <Pill tone="ok">Added</Pill> : i.status === 'uploading' ? <Pill tone="info">Uploading…</Pill> : i.status === 'error' ? <Pill tone="bad">Failed</Pill>
                        : i.confidence === 'exact' ? <Pill tone="ok">Matched by name</Pill> : i.confidence === 'likely' ? <Pill tone="warn">Best guess, please check</Pill> : i.productId ? <Pill tone="info">Chosen</Pill> : <Pill tone="muted">Not matched</Pill>}
                    </span>
                  </div>
                  {i.status !== 'done' && <button type="button" className="icon-btn" aria-label={`Remove ${i.name}`} onClick={() => setItems(items.filter((x) => x !== i))}><TrashIcon width={16} height={16} /></button>}
                </div>
              ))}
            </div>
            <label className="check"><input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} /><span>Replace the existing photos of these products (otherwise new photos are added after them)</span></label>
            <div className="row gap-s wrap">
              <button type="button" className="btn btn--primary" onClick={upload} disabled={busy || !ready}>{busy ? 'Uploading…' : `Upload ${ready} photo${ready === 1 ? '' : 's'}`}</button>
              <button type="button" className="btn btn--ghost" onClick={() => setItems(items.filter((i) => i.status !== 'done'))}>Clear finished</button>
              {unmatched > 0 && <span className="small warn-text">{unmatched} photo{unmatched > 1 ? 's need' : ' needs'} a product</span>}
            </div>
          </>
        )}
      </section>

      <section className="card">
        <div className="row between wrap">
          <h2>Photo checklist</h2>
          <label className="check"><input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} /><span>Only products without photos ({missing})</span></label>
        </div>
        <div className="notice notice--info small">
          <b>Where to get photos you're allowed to use.</b> Best: your own photos, or photos your supplier gives you permission to use. Customers trust real photos of the exact item.
          Free stock photos from Pexels, Unsplash and Pixabay may be used in shops without paying, but they show <i>similar</i> items, not yours. Use them for banners or until your own photos are ready, and check each photo's licence page before downloading.
          Don't copy photos from Amazon, Flipkart, Meesho or other sellers' pages or Instagram: those belong to them.
        </div>
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Table">
          <table className="table">
            <thead><tr><th /><th>Product</th><th>Photos</th><th>Name your file</th><th>Find a free photo</th><th /></tr></thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id}>
                  <td><span className="thumb"><Media product={p} /></span></td>
                  <td className="pt-name"><Link className="link" to={`/admin/products/${p.id}`}>{p.name}</Link><br /><span className="muted small">{p.category_name}</span></td>
                  <td>{p.images.length ? <Pill tone="ok">{p.images.length}</Pill> : <Pill tone="warn">None</Pill>}</td>
                  <td><button type="button" className="chip" onClick={async () => toast((await copyText(`${p.slug}.jpg`)) ? `Copied ${p.slug}.jpg` : `${p.slug}.jpg`)}><CopyIcon width={14} height={14} /> {p.slug}.jpg</button></td>
                  <td className="links-cell">{freePhotoLinks(p).map(([n, u]) => <a key={n} className="link small" href={u} target="_blank" rel="noreferrer">{n} ↗</a>)}</td>
                  <td><Link className="btn btn--ghost btn--sm" to={`/admin/products/${p.id}`}>Open</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && <p className="muted small">Every product has at least one photo. 🎉</p>}
      </section>
    </>
  );
}
