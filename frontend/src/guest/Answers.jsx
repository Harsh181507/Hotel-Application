import { useEffect, useMemo, useState } from 'react';
import { Search, ChevronDown, Copy, MessagesSquare } from 'lucide-react';
import { storage } from '../lib/session.js';
import { toast } from '../lib/toast.js';

// The "local answers" section. The list is fetched once (and cached on the
// phone), then all searching happens here without contacting the server.
export default function Answers({ call, room, active, onAskDesk }) {
  const cacheKey = `anemos.faqs.${room}`;
  const [faqs, setFaqs] = useState(() => storage.read(cacheKey) || []);
  const [loaded, setLoaded] = useState(faqs.length > 0);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [open, setOpen] = useState(null);

  // Refresh when the tab is opened and when the guest comes back to the app,
  // so answers edited by the front desk show up without reloading the page.
  useEffect(() => {
    if (!active) return undefined;
    const load = () => call('/api/guest/faqs')
      .then((rows) => {
        setFaqs(rows);
        storage.write(cacheKey, rows);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
    const onVisible = () => { if (!document.hidden) load(); };
    load();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [call, cacheKey, active]);

  const categories = useMemo(() => ['All', ...new Set(faqs.map((f) => f.category))], [faqs]);

  const visible = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return faqs.filter((f) => {
      if (category !== 'All' && f.category !== category) return false;
      const text = `${f.question} ${f.answer} ${f.category}`.toLowerCase();
      return words.every((w) => text.includes(w));
    });
  }, [faqs, query, category]);

  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      toast('Copied');
    } catch {
      toast('Could not copy');
    }
  };

  return (
    <div className="answers">
      <div className="answers-hero">
        <h1>How can we help?</h1>
        <div className="search">
          <Search size={18} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search Wi-Fi, breakfast, pharmacy…"
            type="search"
          />
        </div>
        <div className="chips">
          {categories.map((c) => (
            <button key={c} className={`chip ${c === category ? 'chip-active' : ''}`} onClick={() => setCategory(c)}>
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="faq-list">
        {!loaded && <div className="chat-empty"><span className="spinner" /></div>}
        {loaded && visible.length === 0 && (
          <p className="muted center">No answers found{query && ` for “${query}”`}.</p>
        )}
        {visible.map((f) => {
          const isOpen = open === f.id;
          return (
            <div key={f.id} className={`faq ${isOpen ? 'faq-open' : ''}`}>
              <button className="faq-q" onClick={() => setOpen(isOpen ? null : f.id)} aria-expanded={isOpen}>
                <span>
                  <small>{f.category}</small>
                  {f.question}
                </span>
                <ChevronDown size={18} className="faq-chevron" />
              </button>
              {isOpen && (
                <div className="faq-a">
                  <p>{f.answer}</p>
                  <button className="btn btn-ghost btn-sm" onClick={() => copy(f.answer)}>
                    <Copy size={14} /> Copy
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <button className="ask-desk" onClick={onAskDesk}>
        <MessagesSquare size={20} />
        <span><strong>Didn't find it?</strong> Message the front desk</span>
      </button>
    </div>
  );
}
