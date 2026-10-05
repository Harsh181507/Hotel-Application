import { useCallback, useEffect, useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { toast } from '../lib/toast.js';
import Modal from '../components/Modal.jsx';
import Field from '../components/Field.jsx';

// Edit the guest "Answers" section (Wi-Fi password, nearby places…).
export default function FaqEditor({ call }) {
  const [faqs, setFaqs] = useState(null);
  const [editing, setEditing] = useState(null); // {} for new, faq object for edit

  const load = useCallback(() => {
    call('/api/staff/faqs').then(setFaqs).catch(() => setFaqs([]));
  }, [call]);
  useEffect(() => { load(); }, [load]);

  const remove = async (faq) => {
    if (!window.confirm(`Delete “${faq.question}”?`)) return;
    try {
      await call(`/api/staff/faqs/${faq.id}`, { method: 'DELETE' });
      toast('Answer deleted');
      load();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const categories = [...new Set((faqs || []).map((f) => f.category))];

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Guest answers</h1>
          <p className="muted">What guests see in the Answers tab. Guests get changes the next time they open that tab.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setEditing({})}><Plus size={16} /> Add answer</button>
      </div>

      {faqs === null && <div className="chat-empty"><span className="spinner" /></div>}
      {faqs?.length === 0 && <p className="muted pad">No answers yet. Add the Wi-Fi password first — it's the most asked question.</p>}

      {categories.map((cat) => (
        <section key={cat} className="faq-group">
          <h2>{cat}</h2>
          {faqs.filter((f) => f.category === cat).map((f) => (
            <div key={f.id} className="faq-row">
              <div>
                <strong>{f.question}</strong>
                <p>{f.answer}</p>
              </div>
              <div className="faq-row-actions">
                <button className="icon-btn" onClick={() => setEditing(f)} aria-label="Edit"><Pencil size={16} /></button>
                <button className="icon-btn danger" onClick={() => remove(f)} aria-label="Delete"><Trash2 size={16} /></button>
              </div>
            </div>
          ))}
        </section>
      ))}

      {editing && (
        <FaqForm
          faq={editing}
          categories={categories}
          call={call}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </div>
  );
}

function FaqForm({ faq, categories, call, onClose, onSaved }) {
  const [form, setForm] = useState({
    category: faq.category || categories[0] || 'General',
    question: faq.question || '',
    answer: faq.answer || '',
    sortOrder: faq.sort_order ?? 0,
  });
  const [error, setError] = useState('');
  const set = (key) => (e) => setForm({ ...form, [key]: key === 'sortOrder' ? Number(e.target.value) : e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    try {
      await call(faq.id ? `/api/staff/faqs/${faq.id}` : '/api/staff/faqs', { method: faq.id ? 'PUT' : 'POST', body: form });
      toast('Saved', 'success');
      onSaved();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <Modal title={faq.id ? 'Edit answer' : 'New answer'} onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <Field label="Category" hint="e.g. Wi-Fi, Dining, Nearby, Stay">
          <input className="input" list="faq-categories" value={form.category} onChange={set('category')} required maxLength={50} />
          <datalist id="faq-categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
        </Field>
        <Field label="Question">
          <input className="input" value={form.question} onChange={set('question')} required maxLength={300} />
        </Field>
        <Field label="Answer">
          <textarea className="input" rows={5} value={form.answer} onChange={set('answer')} required maxLength={5000} />
        </Field>
        <Field label="Order" hint="Lower numbers appear first">
          <input className="input" type="number" value={form.sortOrder} onChange={set('sortOrder')} />
        </Field>
        {error && <p className="alert alert-error">{error}</p>}
        <button className="btn btn-primary btn-block btn-lg">Save</button>
      </form>
    </Modal>
  );
}
