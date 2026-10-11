import { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, Pencil, Trash2, ImagePlus, Flame, Sparkles } from 'lucide-react';
import { imageUrl } from '../lib/api.js';
import { rupees } from '../lib/money.js';
import { toast } from '../lib/toast.js';
import Modal from '../components/Modal.jsx';
import Field from '../components/Field.jsx';
import { VegMark } from '../guest/GuestMenu.jsx';

// Shrinks a photo in the browser to max 900 px JPEG (~50-150 KB) before upload.
function shrinkImage(file, maxSide = 900) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That file is not a picture')); };
    img.src = url;
  });
}

// Front desk edits the menu; the kitchen can only switch items on/off (sold out).
export default function MenuEditor({ call, role }) {
  const canEdit = role === 'admin' || role === 'reception';
  const [items, setItems] = useState(null);
  const [editing, setEditing] = useState(null);

  const load = useCallback(() => call('/api/staff/dining/items').then(setItems).catch(() => setItems([])), [call]);
  useEffect(() => { load(); }, [load]);

  const toggle = async (item) => {
    try {
      await call(`/api/staff/dining/items/${item.id}`, { method: 'PATCH', body: { available: !item.available } });
      toast(item.available ? `${item.name} marked sold out` : `${item.name} is back on the menu`);
      load();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const remove = async (item) => {
    if (!window.confirm(`Delete “${item.name}” from the menu?`)) return;
    await call(`/api/staff/dining/items/${item.id}`, { method: 'DELETE' }).catch((err) => toast(err.message, 'error'));
    load();
  };

  const loadSample = async () => {
    try {
      await call('/api/staff/dining/items/sample', { method: 'POST' });
      toast('Sample menu added. Edit prices and add photos.', 'success');
      load();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const categories = [...new Set((items || []).map((i) => i.category))];

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Menu</h1>
          <p className="muted">{canEdit ? 'What guests can order to their room.' : 'Switch items off when they run out.'}</p>
        </div>
        {canEdit && <button className="btn btn-primary" onClick={() => setEditing({})}><Plus size={16} /> Add item</button>}
      </div>

      {items === null && <div className="chat-empty"><span className="spinner" /></div>}
      {items?.length === 0 && (
        <div className="empty-card">
          <p>The menu is empty. Guests will see “In-room dining isn't available yet”.</p>
          {canEdit && <button className="btn btn-secondary" onClick={loadSample}><Sparkles size={16} /> Load a sample Indian menu to edit</button>}
        </div>
      )}

      {categories.map((cat) => (
        <section key={cat} className="faq-group">
          <h2>{cat}</h2>
          {items.filter((i) => i.category === cat).map((item) => (
            <div key={item.id} className={`menu-row ${item.available ? '' : 'off'}`}>
              {item.image_id ? <img src={imageUrl(item.image_id)} alt="" /> : <div className="menu-row-noimg"><ImagePlus size={18} /></div>}
              <div className="menu-row-info">
                <strong><VegMark veg={item.veg} /> {item.name} {item.popular && <Flame size={14} className="flame" />}</strong>
                <span className="muted small">{rupees(item.price_paise)}{item.description ? ` · ${item.description}` : ''}</span>
              </div>
              <label className="switch" title={item.available ? 'Available' : 'Sold out'}>
                <input type="checkbox" checked={item.available} onChange={() => toggle(item)} />
                <span />
                <em>{item.available ? 'On' : 'Sold out'}</em>
              </label>
              {canEdit && (
                <div className="faq-row-actions">
                  <button className="icon-btn" onClick={() => setEditing(item)} aria-label="Edit"><Pencil size={16} /></button>
                  <button className="icon-btn danger" onClick={() => remove(item)} aria-label="Delete"><Trash2 size={16} /></button>
                </div>
              )}
            </div>
          ))}
        </section>
      ))}

      {editing && (
        <ItemForm item={editing} categories={categories} call={call} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
      )}
    </div>
  );
}

function ItemForm({ item, categories, call, onClose, onSaved }) {
  const [form, setForm] = useState({
    category: item.category || categories[0] || 'Food',
    name: item.name || '',
    description: item.description || '',
    price: item.price_paise != null ? String(item.price_paise / 100) : '',
    image_id: item.image_id ?? null,
    veg: item.veg ?? true,
    popular: item.popular ?? false,
    available: item.available ?? true,
    sort_order: item.sort_order ?? 0,
  });
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef(null);
  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const upload = async (file) => {
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const dataUrl = await shrinkImage(file);
      const img = await call('/api/staff/dining/images', { method: 'POST', body: { dataUrl } });
      set('image_id', img.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    const price = Math.round(Number(form.price) * 100);
    if (!Number.isFinite(price) || price < 0) return setError('Enter a valid price');
    const body = { ...form, price_paise: price };
    delete body.price;
    try {
      await call(item.id ? `/api/staff/dining/items/${item.id}` : '/api/staff/dining/items', { method: item.id ? 'PUT' : 'POST', body });
      toast('Saved', 'success');
      onSaved();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <Modal title={item.id ? 'Edit item' : 'New menu item'} onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <div className="photo-picker">
          {form.image_id ? <img src={imageUrl(form.image_id)} alt="" /> : <div className="menu-row-noimg big"><ImagePlus size={26} /></div>}
          <div>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? <span className="spinner" /> : <><ImagePlus size={14} /> {form.image_id ? 'Change photo' : 'Add photo'}</>}
            </button>
            {form.image_id && <button type="button" className="link-btn" onClick={() => set('image_id', null)}>Remove</button>}
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => upload(e.target.files?.[0])} />
          </div>
        </div>
        <Field label="Name"><input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} required maxLength={100} /></Field>
        <div className="row-2">
          <Field label="Price (₹)">
            <input className="input" type="number" min="0" step="1" inputMode="decimal" value={form.price} onChange={(e) => set('price', e.target.value)} required />
          </Field>
          <Field label="Category">
            <input className="input" list="menu-categories" value={form.category} onChange={(e) => set('category', e.target.value)} required maxLength={50} />
            <datalist id="menu-categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
          </Field>
        </div>
        <Field label="Description (optional)">
          <input className="input" value={form.description} onChange={(e) => set('description', e.target.value)} maxLength={300} placeholder="e.g. With raita" />
        </Field>
        <div className="toggles">
          <label className="check"><input type="checkbox" checked={form.veg} onChange={(e) => set('veg', e.target.checked)} /> Vegetarian</label>
          <label className="check"><input type="checkbox" checked={form.popular} onChange={(e) => set('popular', e.target.checked)} /> Popular</label>
          <label className="check"><input type="checkbox" checked={form.available} onChange={(e) => set('available', e.target.checked)} /> Available</label>
        </div>
        {error && <p className="alert alert-error">{error}</p>}
        <button className="btn btn-primary btn-block btn-lg" disabled={uploading}>Save</button>
      </form>
    </Modal>
  );
}
