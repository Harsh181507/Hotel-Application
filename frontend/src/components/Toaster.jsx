import { useEffect, useState } from 'react';

export default function Toaster() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    const onToast = (e) => {
      const id = Math.random();
      setItems((list) => [...list, { id, ...e.detail }]);
      setTimeout(() => setItems((list) => list.filter((t) => t.id !== id)), 3200);
    };
    window.addEventListener('app:toast', onToast);
    return () => window.removeEventListener('app:toast', onToast);
  }, []);

  return (
    <div className="toaster" role="status" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`toast toast-${t.tone}`}>{t.message}</div>
      ))}
    </div>
  );
}
