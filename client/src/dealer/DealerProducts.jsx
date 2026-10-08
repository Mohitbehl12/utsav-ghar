/**
 * Dealer app → My products: add products with photos and the dealer's own price,
 * see review status and notes from the team, update availability.
 * The dealer never sees (and this code never asks for) the customer selling price.
 */
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useStore } from '../state/store.jsx';
import { Spinner } from '../components/ui.jsx';

const TONE = { pending: 'warn', changes_requested: 'bad', approved: 'ok', rejected: 'muted' };
const rs = (p) => `₹${(p / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const SPEC_FIELDS = [['Material', 'e.g. Solid brass'], ['Dimensions', 'e.g. 12 × 8 × 15 cm'], ['Weight', 'e.g. 450 g'], ["What's included", 'e.g. 1 diya, 10 cotton wicks'], ['Colour', 'e.g. Gold'], ['Care', 'e.g. Wipe with dry cloth'], ['Country of origin', 'e.g. India']];

function Status({ p }) {
  return <span className={`dl-pill dl-pill--${TONE[p.status]}`}>{p.status === 'approved' ? (p.live ? '✅ Live on store' : '✅ Approved') : p.status === 'pending' ? '⏳ Under review' : p.status === 'changes_requested' ? '✏️ Changes needed' : '✖️ Not accepted'}</span>;
}

function StockEditor({ p, onSaved }) {
  const [q, setQ] = useState(p.quantity);
  const [busy, setBusy] = useState(false);
  const save = async () => { setBusy(true); try { onSaved(await api.patch(`/dealer/products/${p.id}/stock`, { quantity: Number(q) })); } finally { setBusy(false); } };
  return (
    <div className="dl-stock">
      <label><span className="dl-small dl-muted">Available</span>
        <input type="number" min={0} inputMode="numeric" value={q} onChange={(e) => setQ(e.target.value)} aria-label={`Available quantity for ${p.name}`} />
      </label>
      <button className="dl-btn" disabled={busy || Number(q) === p.quantity || !(Number(q) >= 0) || !Number.isInteger(Number(q))} onClick={save}>Save</button>
      {p.live && <p className="dl-small dl-muted dl-stock__more">On the store now: <b>{p.store_stock ?? '—'}</b> · reserved in open orders: <b>{p.reserved_stock || 0}</b> · sold (delivered): <b>{p.sold_stock || 0}</b></p>}
    </div>
  );
}

export function ProductList() {
  const [d, setD] = useState(null);
  const load = () => api.get('/dealer/products').then(setD).catch(() => setD({ items: [] }));
  useEffect(() => { load(); }, []);
  if (!d) return <Spinner />;
  const replace = (x) => setD({ ...d, items: d.items.map((i) => (i.id === x.id ? x : i)) });
  return (
    <div className="dl-page">
      <div className="dl-row dl-between">
        <div><h1 className="dl-h1">My products</h1><p className="dl-muted dl-small">Add products you can supply. Our team reviews them before they go on the store.</p></div>
      </div>
      <Link to="/dealer/products/new" className="dl-btn dl-btn--primary dl-btn--big">＋ Add a product</Link>
      {d.items.length === 0 ? (
        <div className="dl-empty"><span aria-hidden="true">🛍️</span><p>No products yet. Add your first product with a few clear photos and your price.</p></div>
      ) : d.items.map((p) => (
        <article key={p.id} className="dl-card dl-prod">
          <Link to={`/dealer/products/${p.id}`} className="dl-prod__top">
            {p.images[0] ? <img src={p.images[0].url} alt="" className="dl-prod__img" loading="lazy" /> : <span className="dl-prod__img" aria-hidden="true">📦</span>}
            <div>
              <b>{p.name}</b>
              <p className="dl-small dl-muted">{p.category} · Your price {rs(p.dealer_price)}</p>
              <Status p={p} />
            </div>
          </Link>
          {p.note_from_team && p.status !== 'approved' && <p className="dl-note">💬 {p.note_from_team}</p>}
          <StockEditor p={p} onSaved={replace} />
        </article>
      ))}
    </div>
  );
}

const EMPTY = { name: '', category_id: '', short_description: '', description: '', dealer_price: '', quantity: '', dealer_sku: '', hsn: '', specs: {} };

export function ProductForm() {
  const { id } = useParams();
  const nav = useNavigate();
  const { categories } = useStore();
  const [f, setF] = useState(id ? null : EMPTY);
  const [orig, setOrig] = useState(null);
  const [keep, setKeep] = useState([]);
  const [files, setFiles] = useState([]);
  const [fe, setFe] = useState({});
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  useEffect(() => {
    if (!id) return;
    api.get(`/dealer/products/${id}`).then((p) => {
      setOrig(p); setKeep(p.images.map((i) => i.name));
      setF({ name: p.name, category_id: p.category_id, short_description: p.short_description, description: p.description, dealer_price: p.dealer_price / 100, quantity: p.quantity, dealer_sku: p.dealer_sku, hsn: p.hsn, specs: p.specs || {} });
    }).catch((x) => setErr(x.message));
  }, [id]);
  useEffect(() => () => files.forEach((x) => URL.revokeObjectURL(x.preview)), [files]);
  if (err && !f) return <div className="dl-page"><p className="dl-err">{err}</p><Link className="dl-btn" to="/dealer/products">← Back</Link></div>;
  if (!f) return <Spinner />;
  if (done) {
    return (
      <div className="dl-page dl-center">
        <div className="dl-box">
          <p style={{ fontSize: '2.4rem', margin: 0 }} aria-hidden="true">📨</p>
          <h1 className="dl-h1">Sent for review</h1>
          <p>Thank you! Our team will check <b>{done.name}</b> and let you know on WhatsApp / email. You can track it under My products.</p>
          <Link to="/dealer/products" className="dl-btn dl-btn--primary dl-btn--block">Back to My products</Link>
        </div>
      </div>
    );
  }
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const setSpec = (k) => (e) => setF({ ...f, specs: { ...f.specs, [k]: e.target.value } });
  const addFiles = (e) => {
    const picked = [...e.target.files].filter((x) => /^image\/(jpeg|png|webp|avif)$/.test(x.type)).slice(0, 6 - keep.length - files.length);
    setFiles([...files, ...picked.map((file) => ({ file, preview: URL.createObjectURL(file) }))]);
    e.target.value = '';
  };
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr(''); setFe({});
    const fd = new FormData();
    for (const k of ['name', 'category_id', 'short_description', 'description', 'dealer_price', 'quantity', 'dealer_sku', 'hsn']) fd.append(k, f[k] ?? '');
    fd.append('specs', JSON.stringify(f.specs));
    if (id) fd.append('keep_images', JSON.stringify(keep));
    files.forEach((x) => fd.append('images', x.file));
    fd.append('website', '');
    try {
      const r = id ? await api.put(`/dealer/products/${id}`, fd) : await api.post('/dealer/products', fd);
      setDone(r);
    } catch (x) { setErr(x.message); setFe(x.fields || {}); window.scrollTo({ top: 0, behavior: 'smooth' }); } finally { setBusy(false); }
  };
  const photos = keep.length + files.length;
  return (
    <form className="dl-page" onSubmit={submit} noValidate>
      <div className="dl-head">
        <Link to="/dealer/products" className="dl-back" aria-label="Back to my products">←</Link>
        <div><h1>{id ? 'Edit product' : 'Add a product'}</h1><p className="dl-muted dl-small">{id ? 'Changes are reviewed again before they show on the store. Availability updates at once.' : 'Fill in the details. Our team reviews it before it goes live.'}</p></div>
      </div>
      {orig?.note_from_team && orig.status === 'changes_requested' && <p className="dl-note">💬 Our team: {orig.note_from_team}</p>}
      {err && <p className="dl-alert" role="alert">{err}</p>}

      <section className="dl-box">
        <h2>📷 Photos <span className="dl-muted dl-small">({photos}/6)</span></h2>
        <div className="dl-photos">
          {orig?.images.filter((i) => keep.includes(i.name)).map((i) => (
            <figure key={i.name}><img src={i.url} alt="" /><button type="button" aria-label="Remove photo" onClick={() => setKeep(keep.filter((n) => n !== i.name))}>✕</button></figure>
          ))}
          {files.map((x, k) => (
            <figure key={x.preview}><img src={x.preview} alt="" /><button type="button" aria-label="Remove photo" onClick={() => setFiles(files.filter((_, j) => j !== k))}>✕</button></figure>
          ))}
          {photos < 6 && (
            <label className="dl-photos__add"><input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={addFiles} /><span aria-hidden="true">＋</span><small>Add photo</small></label>
          )}
        </div>
        <p className="dl-muted dl-small">Clear photos on a plain background, front + side + in use. JPG/PNG, up to 5 MB each.</p>
        {fe.images && <p className="dl-err">{fe.images}</p>}
      </section>

      <section className="dl-box">
        <h2>📝 Product details</h2>
        <label className="dl-field"><span>Product name *</span><input value={f.name} onChange={set('name')} maxLength={120} placeholder="e.g. Handmade Peacock Brass Diya" />{fe.name && <em className="dl-err">{fe.name}</em>}</label>
        <label className="dl-field"><span>Category *</span>
          <select value={f.category_id} onChange={set('category_id')}><option value="">Choose…</option>{(categories || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          {fe.category_id && <em className="dl-err">{fe.category_id}</em>}
        </label>
        <label className="dl-field"><span>One-line summary</span><input value={f.short_description} onChange={set('short_description')} maxLength={200} placeholder="e.g. Solid brass diya with peacock design" /></label>
        <label className="dl-field"><span>Full description *</span><textarea rows={5} value={f.description} onChange={set('description')} maxLength={5000} placeholder="What it is made of, how it is made, size, how to use it…" />{fe.description && <em className="dl-err">{fe.description}</em>}</label>
        <div className="dl-grid2">
          {SPEC_FIELDS.map(([k, ph]) => <label key={k} className="dl-field"><span>{k}</span><input value={f.specs[k] || ''} onChange={setSpec(k)} placeholder={ph} maxLength={300} /></label>)}
        </div>
      </section>

      <section className="dl-box">
        <h2>💰 Your price & stock</h2>
        <div className="dl-grid2">
          <label className="dl-field"><span>Your price per piece (₹) *</span><input type="number" min={1} step="0.01" inputMode="decimal" value={f.dealer_price} onChange={set('dealer_price')} placeholder="e.g. 400" />{fe.dealer_price && <em className="dl-err">{fe.dealer_price}</em>}</label>
          <label className="dl-field"><span>Quantity available *</span><input type="number" min={0} inputMode="numeric" value={f.quantity} onChange={set('quantity')} placeholder="e.g. 25" />{fe.quantity && <em className="dl-err">{fe.quantity}</em>}</label>
          <label className="dl-field"><span>Your item code (optional)</span><input value={f.dealer_sku} onChange={set('dealer_sku')} maxLength={40} /></label>
          <label className="dl-field"><span>HSN code (optional)</span><input inputMode="numeric" value={f.hsn} onChange={set('hsn')} maxLength={8} />{fe.hsn && <em className="dl-err">{fe.hsn}</em>}</label>
        </div>
        <p className="dl-muted dl-small">This is the price Utsav Ghar pays you for each piece. The store sets the price customers pay.</p>
      </section>
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="dl-hp" aria-hidden="true" />
      <button className="dl-btn dl-btn--primary dl-btn--big" disabled={busy}>{busy ? 'Sending…' : id ? 'Send changes for review' : 'Send for review'}</button>
    </form>
  );
}
